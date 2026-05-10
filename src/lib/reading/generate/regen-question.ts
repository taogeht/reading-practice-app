// Single-question regeneration. Produces ONE new question of the same
// type as the one being replaced, given the rest of the questions as
// "do not duplicate" context.
//
// Uses the same Claude config + JSON-schema permissive shape as
// questions.ts, just with a singular output and a narrowing prompt.

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { getReadingLevel, type ReadingLevel } from '@/lib/reading/levels';
import { geminiImageClient } from '@/lib/image/gemini-client';
import { r2Client } from '@/lib/storage/r2-client';
import { logInfo } from '@/lib/logger';
import {
  McqGeneratedSchema,
  SequenceOrderGeneratedSchema,
  VocabMatchingGeneratedSchema,
  type GeneratedPageProse,
  type GeneratedQuestion,
  type GenerationCallMeta,
  type PassagePlan,
} from './types';

const MODEL = 'claude-sonnet-4-6';
const TEMPERATURE = 0.5;
const MAX_TOKENS = 1500;

export type SingleQuestionType = GeneratedQuestion['type'];

export interface GenerateSingleQuestionInput {
  plan: PassagePlan;
  pages: GeneratedPageProse[];
  /** Type of the question being replaced. */
  questionType: SingleQuestionType;
  /** OrderIndex to assign to the new question (preserves UI ordering). */
  orderIndex: number;
  /** All other questions in the passage — passed to the model as
   *  "do not produce something equivalent to any of these". */
  existingOtherQuestions: GeneratedQuestion[];
  targetVocabRows: {
    id: string;
    word: string;
    mandarinTranslation?: string | null;
    isPicturable: boolean;
  }[];
  cumulativeVocabRows: { id: string; word: string; isPicturable: boolean }[];
  readingLevelId: number;
  /** Owning passage. Required for vocab_matching regen because the
   *  V2 pair imageKey embeds the passageId. */
  passageId: string;
}

export interface GenerateSingleQuestionResult {
  question: GeneratedQuestion;
  meta: GenerationCallMeta;
}

// Per-type permissive JSON schemas. Each enumerates only the fields
// relevant to that type so Anthropic's strict additionalProperties:
// false constraint stays satisfied. Zod still parses the output for
// strict count + type checks.
function jsonSchemaFor(type: SingleQuestionType) {
  if (type === 'mcq_comprehension') {
    return {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['mcq_comprehension'] },
        questionText: { type: 'string' },
        payload: {
          type: 'object',
          properties: {
            options: { type: 'array', items: { type: 'string' } },
            correctIndex: { type: 'integer' },
          },
          required: ['options', 'correctIndex'],
          additionalProperties: false,
        },
        evidenceQuote: { type: 'string' },
        evidencePageNumber: { type: 'integer' },
      },
      required: ['type', 'questionText', 'payload', 'evidenceQuote', 'evidencePageNumber'],
      additionalProperties: false,
    } as const;
  }
  if (type === 'vocab_matching') {
    return {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['vocab_matching'] },
        questionText: { type: 'string' },
        payload: {
          type: 'object',
          properties: {
            // V2: model emits only `word` per pair. vocabId + imageKey are
            // attached post-parse (image generation + R2 upload).
            pairs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  word: { type: 'string' },
                },
                required: ['word'],
                additionalProperties: false,
              },
            },
          },
          required: ['pairs'],
          additionalProperties: false,
        },
      },
      required: ['type', 'questionText', 'payload'],
      additionalProperties: false,
    } as const;
  }
  return {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['sequence_order'] },
      questionText: { type: 'string' },
      payload: {
        type: 'object',
        properties: {
          events: { type: 'array', items: { type: 'string' } },
        },
        required: ['events'],
        additionalProperties: false,
      },
    },
    required: ['type', 'questionText', 'payload'],
    additionalProperties: false,
  } as const;
}

function zodSchemaFor(type: SingleQuestionType) {
  if (type === 'mcq_comprehension') return McqGeneratedSchema;
  if (type === 'vocab_matching') return VocabMatchingGeneratedSchema;
  return SequenceOrderGeneratedSchema;
}

export async function generateSingleQuestion(
  input: GenerateSingleQuestionInput,
): Promise<GenerateSingleQuestionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

  const level = getReadingLevel(input.readingLevelId);

  const systemPrompt = buildSystemPrompt(level, input.questionType);
  const cumulativeBlock = buildCumulativeBlock(input.cumulativeVocabRows);
  const taskBlock = buildTaskBlock(
    input.plan,
    input.pages,
    input.questionType,
    input.existingOtherQuestions,
    input.targetVocabRows,
  );

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
      format: { type: 'json_schema', schema: jsonSchemaFor(input.questionType) },
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
    console.error('[generateSingleQuestion] non-JSON response:', text.slice(0, 1000));
    throw new Error('Model did not return valid JSON');
  }

  const result = zodSchemaFor(input.questionType).safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `generateSingleQuestion: schema mismatch — ${result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }

  // Map vocab_matching pair words → canonical vocabulary.id values
  // (same logic as questions.ts's main path).
  const wordToId = new Map<string, string>();
  for (const r of input.cumulativeVocabRows) {
    wordToId.set(r.word.toLowerCase().trim(), r.id);
  }
  for (const r of input.targetVocabRows) {
    wordToId.set(r.word.toLowerCase().trim(), r.id);
  }

  let question: GeneratedQuestion;
  if (result.data.type === 'mcq_comprehension') {
    question = {
      type: 'mcq_comprehension',
      questionText: result.data.questionText,
      orderIndex: input.orderIndex,
      payload: {
        options: result.data.payload.options,
        correctIndex: result.data.payload.correctIndex,
      },
      evidenceQuote: result.data.evidenceQuote,
      evidencePageNumber: result.data.evidencePageNumber,
    };
  } else if (result.data.type === 'vocab_matching') {
    // V2 pipeline: per-pair Gemini illustration + R2 upload (cold —
    // no character reference image, single-object white background).
    // Single-question scope, so we both generate AND upload here; no
    // orchestrator batching needed for one question's worth of pairs.

    // Defense-in-depth (mirror of questions.ts): refuse pairs whose
    // underlying vocabulary row is is_picturable=false. The orchestrator's
    // target-selection filter should have prevented this; if we land here,
    // shout rather than ship a confusing card.
    const picturableIds = new Set<string>();
    for (const r of input.cumulativeVocabRows) if (r.isPicturable) picturableIds.add(r.id);
    for (const r of input.targetVocabRows) if (r.isPicturable) picturableIds.add(r.id);
    for (const p of result.data.payload.pairs) {
      const vid = wordToId.get(p.word.toLowerCase().trim());
      if (vid && !picturableIds.has(vid)) {
        throw new Error(
          `Unpicturable word ${p.word} reached vocab_matching pair generation. Check target selection filter.`,
        );
      }
    }

    const v2Pairs = await Promise.all(
      result.data.payload.pairs.map(async (p) => {
        const vocabId = wordToId.get(p.word.toLowerCase().trim()) ?? '';
        if (!vocabId) {
          // Empty vocabId is a hard validation error downstream; emit
          // the placeholder shape so the validator can surface it.
          return { word: p.word, vocabId: '', imageKey: '' };
        }
        const key = r2Client.generateStoryVocabImageKey(input.passageId, vocabId);
        const imgResult = await geminiImageClient.generateImagePanel({
          prompt: buildVocabImagePromptForRegen(p.word),
          referenceImage: undefined,
          label: `vocab pair "${p.word}"`,
        });
        if (!imgResult.success || !imgResult.imageBuffer) {
          console.error(
            `[generateSingleQuestion] vocab image gen failed for word "${p.word}" (vocab=${vocabId}): ${imgResult.error ?? 'unknown'}`,
          );
          return { word: p.word, vocabId, imageKey: '' };
        }
        await r2Client.uploadFile(
          key,
          imgResult.imageBuffer,
          imgResult.contentType ?? 'image/png',
          {
            'passage-id': input.passageId,
            'vocab-id': vocabId,
            'vocab-word': p.word,
          },
        );
        return { word: p.word, vocabId, imageKey: key };
      }),
    );
    question = {
      type: 'vocab_matching',
      questionText: result.data.questionText,
      orderIndex: input.orderIndex,
      payload: { version: 2, pairs: v2Pairs },
    };
  } else {
    question = {
      type: 'sequence_order',
      questionText: result.data.questionText,
      orderIndex: input.orderIndex,
      payload: { events: result.data.payload.events },
    };
  }

  const meta: GenerationCallMeta = {
    model: MODEL,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    durationMs,
  };

  logInfo(
    `single question regenerated (${input.questionType}, level ${level.id})`,
    `lib/reading/generate/regen-question model=${MODEL} type=${input.questionType} input_tokens=${meta.inputTokens} output_tokens=${meta.outputTokens} duration_ms=${durationMs}`,
  );

  return { question, meta };
}

// ---------- Prompt builders ----------

function buildSystemPrompt(level: ReadingLevel, type: SingleQuestionType): string {
  const lines: string[] = [];
  lines.push(
    `You are regenerating ONE comprehension question for an ESL reading passage at Macmillan Language School in Kaohsiung, ages 6-10.`,
  );
  lines.push('');
  lines.push(`Question type to produce: ${type}.`);
  lines.push('');
  if (type === 'mcq_comprehension') {
    lines.push('mcq_comprehension rules:');
    lines.push('  - Exactly 4 options. Exactly 1 correct, 3 plausible-but-wrong distractors.');
    lines.push(
      '  - The correct answer must be supported by an EXACT verbatim quote from one page (the evidenceQuote field). evidencePageNumber names the page.',
    );
    lines.push('  - Distractors and the correct answer use only cumulative vocabulary or character names.');
  } else if (type === 'vocab_matching') {
    lines.push('vocab_matching rules:');
    lines.push('  - 4-6 pairs. Each pair only has a "word" (a target vocabulary word) — the calling code generates a kid-friendly illustration the student tap-matches to the word. Do NOT emit a meaning, definition, sentence, or vocabId.');
    lines.push('  - Prefer concrete, picture-able words (objects, animals, foods, simple actions). Drop abstract or polysemous words and pad with concrete cumulative words that actually appear in the story.');
  } else {
    lines.push('sequence_order rules:');
    lines.push('  - 4-5 events from the story, each described in 5-12 words.');
    lines.push('  - Output the events in CORRECT chronological order (the UI shuffles for the student).');
  }
  lines.push('');
  lines.push('Question text rules (apply to all types):');
  lines.push('  - Use only cumulative vocabulary.');
  lines.push(`  - Maximum question / sentence length: ${level.maxSentenceWords} words.`);
  lines.push('  - Answerable from the story alone.');
  lines.push('');
  lines.push(
    'CRITICAL: do not produce a question that is essentially equivalent to any of the existing OTHER questions listed below. Pick a different angle / different evidence / different word.',
  );
  lines.push('');
  lines.push('Output: strict JSON matching the provided schema. No markdown, no commentary.');
  return lines.join('\n');
}

function buildCumulativeBlock(cumulative: { word: string }[]): string {
  const words = Array.from(new Set(cumulative.map((r) => r.word.toLowerCase().trim())))
    .filter(Boolean)
    .sort();
  return [
    'CUMULATIVE VOCABULARY (the only words allowed in question/option/meaning text):',
    '',
    words.join(', '),
  ].join('\n');
}

function buildTaskBlock(
  plan: PassagePlan,
  pages: GeneratedPageProse[],
  type: SingleQuestionType,
  existing: GeneratedQuestion[],
  targets: { id: string; word: string; mandarinTranslation?: string | null }[],
): string {
  const lines: string[] = [];
  lines.push(`STORY: "${plan.title}"`);
  lines.push(`Setting: ${plan.setting}`);
  lines.push('Characters:');
  for (const c of plan.characters) lines.push(`  - ${c.name}: ${c.description}`);
  lines.push('');
  lines.push(`PROSE (${pages.length} pages):`);
  for (const p of pages.sort((a, b) => a.pageNumber - b.pageNumber)) {
    lines.push(`Page ${p.pageNumber}: ${p.text}`);
  }
  lines.push('');
  lines.push('TARGET VOCABULARY:');
  for (const t of targets) {
    const hint = t.mandarinTranslation ? ` (Mandarin: ${t.mandarinTranslation})` : '';
    lines.push(`  - "${t.word}"${hint}`);
  }
  lines.push('');
  lines.push(`EXISTING OTHER QUESTIONS (do not duplicate the angle of any of these):`);
  for (let i = 0; i < existing.length; i++) {
    const q = existing[i]!;
    lines.push(`  ${i + 1}. [${q.type}] ${q.questionText}`);
    if (q.type === 'mcq_comprehension') {
      lines.push(`     Correct option: "${q.payload.options[q.payload.correctIndex]}"`);
      lines.push(`     Evidence (page ${q.evidencePageNumber}): "${q.evidenceQuote}"`);
    } else if (q.type === 'vocab_matching') {
      // V2 pairs only carry word+vocabId+imageKey; surface words for
      // dedup hint to the model.
      const pairs = q.payload.pairs as { word: string }[];
      lines.push(`     Pairs: ${pairs.map((p) => `"${p.word}"`).join(', ')}`);
    } else {
      lines.push(`     Events: ${q.payload.events.length} narrative beats`);
    }
  }
  lines.push('');
  lines.push(`Produce ONE new ${type} question. Output JSON only.`);
  return lines.join('\n');
}

/** Mirror of the questions.ts vocab image prompt; kept here as a sibling
 *  copy because regen-question doesn't import the main generator (the
 *  prompt template is small and stable). */
function buildVocabImagePromptForRegen(word: string): string {
  return [
    `${word}`,
    'simple kid-friendly illustration',
    'watercolor style',
    'soft pastel colors',
    'single object centered',
    'white background',
    'no text, no letters, no numbers',
    'age 6-10',
  ].join(', ');
}
