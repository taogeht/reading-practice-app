// Single-page prose regeneration. Used by the teacher review-queue
// endpoint POST .../pages/[pageNumber]/regenerate.
//
// Smaller analogue of generatePagesProse: same level constraints, same
// vocabulary allowlist, same JSON-schema decode, same Zod validation —
// but produces ONE page's text instead of all N. The other pages'
// existing text is included in the prompt so the new page maintains
// narrative continuity.

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { getReadingLevel, type ReadingLevel } from '@/lib/reading/levels';
import { logInfo } from '@/lib/logger';
import type {
  GeneratedPageProse,
  GenerationCallMeta,
  PassagePagePlan,
  PassagePlan,
} from './types';
import {
  fetchTargetVocab,
  resolveCumulativeVocab,
  type CumulativeRow,
  type TargetRow,
} from './vocab';

const MODEL = 'claude-sonnet-4-6';
const TEMPERATURE = 0.5;
const MAX_TOKENS = 1500;

const SinglePageOutputSchema = z.object({
  pageNumber: z.number().int().positive(),
  text: z.string().min(1),
});

type SinglePageOutput = z.infer<typeof SinglePageOutputSchema>;

const SINGLE_PAGE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    pageNumber: { type: 'integer' },
    text: { type: 'string' },
  },
  required: ['pageNumber', 'text'],
  additionalProperties: false,
} as const;

export interface GenerateSinglePageInput {
  plan: PassagePlan;
  /** 1-indexed page number to regenerate. Must match an entry in plan.pages. */
  pageNumber: number;
  /** All other pages from the existing prose, used as continuity context. */
  otherPagesText: { pageNumber: number; text: string }[];
  readingLevelId: number;
  /** Same explicit-override semantics as the multi-page generator. */
  cumulativeVocabIds?: string[];
}

export interface GenerateSinglePageResult {
  page: GeneratedPageProse;
  meta: GenerationCallMeta;
}

export async function generateSinglePage(
  input: GenerateSinglePageInput,
): Promise<GenerateSinglePageResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

  const level = getReadingLevel(input.readingLevelId);
  const planPage = input.plan.pages.find((p) => p.pageNumber === input.pageNumber);
  if (!planPage) {
    throw new Error(
      `generateSinglePage: page ${input.pageNumber} not in plan (plan has pages ${input.plan.pages.map((p) => p.pageNumber).join(', ')})`,
    );
  }

  // Re-derive target rows from the plan's targetVocabUsed UUIDs (union
  // across all pages). Same convention as the multi-page generator.
  const targetIds = uniqueIdsFromPlan(input.plan);
  if (targetIds.length === 0) {
    throw new Error('generateSinglePage: plan has no target vocabulary');
  }
  const targetRows = await fetchTargetVocab(targetIds);
  const cumulativeRows = await resolveCumulativeVocab(targetRows, input.cumulativeVocabIds);

  const systemPrompt = buildSystemPrompt(level);
  const cumulativeBlock = buildCumulativeBlock(cumulativeRows);
  const taskBlock = buildTaskBlock(planPage, input.plan, input.otherPagesText, targetRows);

  const userContent: Anthropic.ContentBlockParam[] = [
    { type: 'text', text: cumulativeBlock, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: taskBlock },
  ];

  const startedAt = Date.now();
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    thinking: { type: 'disabled' },
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: SINGLE_PAGE_JSON_SCHEMA },
    },
    system: [
      { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userContent }],
  });
  const durationMs = Date.now() - startedAt;

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error('[generateSinglePage] non-JSON response:', text.slice(0, 1000));
    throw new Error('Model did not return valid JSON');
  }
  const result = SinglePageOutputSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `generateSinglePage: schema mismatch — ${result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }

  // Force pageNumber to match the caller's request — the model
  // sometimes echoes a different number when given a context-rich
  // prompt; we trust the caller's intent.
  const page: GeneratedPageProse = {
    pageNumber: input.pageNumber,
    text: result.data.text,
  };

  const meta: GenerationCallMeta = {
    model: MODEL,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    durationMs,
  };

  logInfo(
    `single page regenerated (page ${input.pageNumber}, level ${level.id})`,
    `lib/reading/generate/regen-page model=${MODEL} input_tokens=${meta.inputTokens} output_tokens=${meta.outputTokens} duration_ms=${durationMs}`,
  );

  return { page, meta };
}

// ---------- Prompt builders ----------

function buildSystemPrompt(level: ReadingLevel): string {
  const grammar = level.grammarConstraints;
  const grammarLines: string[] = [
    `- Maximum sentence length: ${level.maxSentenceWords} words (HARD CAP).`,
    `- Words on this page: ${level.wordsPerPage.min}-${level.wordsPerPage.max}.`,
    `- Maximum clauses per sentence: ${grammar.maxClausesPerSentence}.`,
    grammar.allowContractions
      ? '- Contractions allowed.'
      : "- Contractions FORBIDDEN — write \"do not\" instead of \"don't\", \"it is\" instead of \"it's\".",
    grammar.allowPastTense ? '- Past tense allowed.' : '- Use present tense only.',
    grammar.allowFutureTense ? '- Future tense allowed.' : '- No future tense.',
    grammar.allowConditionals ? '- Simple conditionals allowed.' : '- No conditionals.',
    grammar.allowPhrasalVerbs ? '- Phrasal verbs allowed.' : '- No phrasal verbs.',
  ];

  return [
    `You are rewriting ONE PAGE of an ESL reading passage for ages 6-10 at Macmillan Language School in Kaohsiung. The other pages of the story stay as they are; you produce only the page asked for.`,
    '',
    'Constraints:',
    ...grammarLines,
    '- Use ONLY words from the cumulative vocabulary list (provided below).',
    '- Character names from the plan are allowed.',
    '- Match the existing tone and narrative voice of the other pages.',
    '- Do not contradict events on neighbouring pages — it must read as a natural part of the same story.',
    '',
    'Output: strict JSON matching the provided schema. No markdown, no commentary outside the JSON.',
  ].join('\n');
}

function buildCumulativeBlock(cumulative: CumulativeRow[]): string {
  const words = Array.from(
    new Set(cumulative.map((r) => r.word.toLowerCase().trim())),
  )
    .filter(Boolean)
    .sort();
  return [
    'CUMULATIVE VOCABULARY (the only words you may use, in addition to character names):',
    '',
    words.join(', '),
  ].join('\n');
}

function buildTaskBlock(
  planPage: PassagePagePlan,
  plan: PassagePlan,
  otherPages: { pageNumber: number; text: string }[],
  targetRows: TargetRow[],
): string {
  const idToWord = new Map(targetRows.map((r) => [r.id, r.word]));
  const pageTargetWords = planPage.targetVocabUsed
    .map((id) => idToWord.get(id))
    .filter((w): w is string => Boolean(w));

  const lines: string[] = [];
  lines.push(`STORY: "${plan.title}"`);
  lines.push(`Setting: ${plan.setting}`);
  lines.push('Characters:');
  for (const c of plan.characters) {
    lines.push(`  - ${c.name}: ${c.description}`);
  }
  lines.push('');
  lines.push('OTHER PAGES (for continuity — do not repeat or contradict):');
  for (const p of otherPages.sort((a, b) => a.pageNumber - b.pageNumber)) {
    lines.push(`Page ${p.pageNumber}: ${p.text}`);
  }
  lines.push('');
  lines.push(`PAGE ${planPage.pageNumber} TO REWRITE:`);
  lines.push(`  Beat: ${planPage.beat}`);
  lines.push(`  Scene: ${planPage.sceneDescription}`);
  if (pageTargetWords.length) {
    lines.push(`  Introduce on this page: ${pageTargetWords.map((w) => `"${w}"`).join(', ')}`);
  }
  lines.push('');
  lines.push(
    `Output JSON: { "pageNumber": ${planPage.pageNumber}, "text": "<the new prose for this page>" }`,
  );
  return lines.join('\n');
}

function uniqueIdsFromPlan(plan: PassagePlan): string[] {
  const seen = new Set<string>();
  for (const p of plan.pages) {
    for (const id of p.targetVocabUsed) seen.add(id);
  }
  return Array.from(seen);
}
