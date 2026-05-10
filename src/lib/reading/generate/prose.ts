// Stage 2 of the reading-passage generation pipeline: take a PassagePlan
// from Stage 1 and produce per-page prose. ONE Claude call writes all
// pages at once so tonal consistency holds across the story; per-page
// calls would lose that and cost more.
//
// Validation is intentionally NOT here — Stage 3 (validate.ts) runs
// deterministic checks (vocab compliance, sentence length, target
// coverage) on whatever the model returned. Keeping the two stages
// separate lets us inspect raw failure rates without coupling them.
//
// Caching layout matches Stage 1:
//   system        (cached) — role + level constraints + global rules
//   user block 1  (cached) — cumulative vocabulary
//   user block 2  (NOT cached) — the plan + per-call instruction

import Anthropic from '@anthropic-ai/sdk';
import { getReadingLevel, type ReadingLevel } from '@/lib/reading/levels';
import { logInfo } from '@/lib/logger';
import {
  PagesProseOutputSchema,
  type GeneratedPageProse,
  type GeneratePagesProseInput,
  type GeneratePagesProseResult,
  type GenerationCallMeta,
  type PassagePlan,
  type ProseFeedback,
} from './types';
import {
  fetchTargetVocab,
  resolveCumulativeVocab,
  type CumulativeRow,
  type TargetRow,
} from './vocab';

const MODEL = 'claude-sonnet-4-6';

/** Lower than the planner because prose benefits from less variance —
 *  we're filling in a fixed structure, not inventing one. Tunable. */
const TEMPERATURE = 0.5;

/** Generous ceiling for a 16-page level-5 story (each page ~45 words ×
 *  ~1.4 tokens/word + JSON overhead = ~1500 tokens; headroom prevents
 *  truncation when the model goes verbose). */
const MAX_TOKENS = 4000;

// ---------- Prompts ----------

const SYSTEM_PROMPT_PREFIX = `You are a curriculum-aligned ESL prose writer for Macmillan Language School in Kaohsiung, Taiwan, ages 6-10. You expand story PLANS into per-page PROSE that students will actually read.

YOU FOLLOW THE PLAN EXACTLY. The plan tells you the title, characters, setting, page-by-page beats, and which target words land on which pages. Your job is to write the actual sentences for each page.

VOCAB RULES
- You may use ONLY words from the CUMULATIVE VOCABULARY list provided. Function words (a, the, is, are, etc., listed in that block) are always allowed.
- Proper nouns from the plan's characters[].name are allowed (you'll see them in the plan).
- Each TARGET vocabulary word marked on a page MUST appear naturally in that page's prose, in a context where its meaning is recoverable from surrounding text (don't bury it in a list).
- NO words outside the cumulative list + targets + character names. If a planned beat needs a word you don't have, paraphrase using words you do have.

TONE
- Warm, age-appropriate, encouraging. The plan's tone applies — no scary or sad endings, no unresolved conflict.
- Sentences should sound natural to a child reader. Vary sentence shapes within the constraints (statements, questions, simple exclamations).

OUTPUT
- JSON only, matching the provided schema. One entry per page, in pageNumber order, matching the plan's page numbers.
- "text" is the full prose for that page — typically 2 to 5 short sentences. No markdown, no headers.

`;

function buildSystemPrompt(level: ReadingLevel): string {
  const grammar = level.grammarConstraints;
  const yn = (b: boolean) => (b ? 'YES' : 'NO');
  const grammarLines: string[] = [];
  grammarLines.push(`- Maximum sentence length: ${level.maxSentenceWords} words (HARD CAP — do not exceed)`);
  grammarLines.push(`- Average sentence length target: around ${level.avgSentenceWords} words`);
  grammarLines.push(`- Maximum clauses per sentence: ${grammar.maxClausesPerSentence}`);
  grammarLines.push(`- Words per page target: ${level.wordsPerPage.min}-${level.wordsPerPage.max}`);

  // Phrase each grammar permission as a positive or negative rule so the
  // model can't read "NO" as a soft suggestion.
  if (grammar.allowContractions) {
    grammarLines.push('- Contractions allowed (don\'t, it\'s, we\'re).');
  } else {
    grammarLines.push('- Contractions FORBIDDEN — write "do not" instead of "don\'t", "it is" instead of "it\'s", and so on.');
  }
  if (!grammar.allowPastTense) {
    grammarLines.push('- Use PRESENT TENSE only — no past tense, no "-ed" verbs.');
  } else {
    grammarLines.push('- Past tense allowed (ran, walked, said).');
  }
  if (!grammar.allowFutureTense) {
    grammarLines.push('- No future tense — no "will" or "going to" constructions.');
  } else {
    grammarLines.push('- Future tense allowed ("will go", "is going to").');
  }
  if (!grammar.allowConditionals) {
    grammarLines.push('- No conditional constructions ("if … then", "would").');
  } else {
    grammarLines.push('- Simple conditionals allowed.');
  }
  if (!grammar.allowPhrasalVerbs) {
    grammarLines.push('- No phrasal verbs (avoid "pick up", "look for", "run away" — say "lift", "search", "leave").');
  } else {
    grammarLines.push('- Phrasal verbs allowed.');
  }

  return [
    SYSTEM_PROMPT_PREFIX,
    `READING LEVEL: ${level.id} (${level.name}) — AF&F target ${level.targetAfFLevel}`,
    '',
    'CONSTRAINTS for this level:',
    ...grammarLines,
    `- CEFR ceiling for non-target vocab: ${level.vocabConstraints.cumulativeCefrCap}`,
    '',
    'When the plan asks for something that doesn\'t fit these constraints, REWRITE the beat in compliant prose rather than break the constraints.',
  ].join('\n');
}

function buildCumulativeBlock(cumulative: CumulativeRow[]): string {
  const byPos: Record<string, string[]> = {};
  const fn: string[] = [];
  for (const r of cumulative) {
    if (r.isFunctionWord) {
      fn.push(r.word);
    } else {
      (byPos[r.partOfSpeech] ??= []).push(r.word);
    }
  }
  const lines: string[] = [
    'CUMULATIVE VOCABULARY — these are the only words you may use, in addition to the plan\'s character names and any target words listed for a given page.',
    '',
  ];
  const order = [
    'noun', 'verb', 'adjective', 'adverb', 'pronoun',
    'preposition', 'conjunction', 'interjection', 'determiner', 'other',
  ];
  for (const pos of order) {
    const list = byPos[pos];
    if (!list?.length) continue;
    lines.push(`${pos.toUpperCase()}: ${list.sort().join(', ')}`);
  }
  if (fn.length) {
    lines.push('');
    lines.push(`FUNCTION WORDS (always available): ${fn.sort().join(', ')}`);
  }
  return lines.join('\n');
}

/** Format the plan in a model-friendly way. We could pass raw JSON but a
 *  formatted text block makes the per-page beats + target word annotations
 *  much easier for the model to follow. Target word UUIDs (which the plan
 *  carries) are translated back to the actual words via the targetRows
 *  lookup so the model sees something writable. */
function buildPlanBlock(plan: PassagePlan, targetRows: TargetRow[]): string {
  const idToWord = new Map(targetRows.map((r) => [r.id, r.word]));

  const lines: string[] = [];
  lines.push(`TITLE: ${plan.title}`);
  lines.push(`SETTING: ${plan.setting}`);
  lines.push(`SUMMARY: ${plan.summary}`);
  lines.push('');
  lines.push('CHARACTERS:');
  for (const c of plan.characters) {
    lines.push(`- ${c.name}: ${c.description}`);
  }
  lines.push('');
  lines.push('STRUCTURAL ARC:');
  lines.push(`- Problem:    ${plan.structuralPlan.problem}`);
  lines.push(`- Attempt:    ${plan.structuralPlan.attempt}`);
  lines.push(`- Resolution: ${plan.structuralPlan.resolution}`);
  lines.push('');
  lines.push(`PAGES (${plan.pages.length}):`);
  for (const p of plan.pages) {
    const targetWords = p.targetVocabUsed
      .map((id) => idToWord.get(id))
      .filter((w): w is string => Boolean(w));
    lines.push('');
    lines.push(`Page ${p.pageNumber}:`);
    lines.push(`  Beat: ${p.beat}`);
    lines.push(`  Scene: ${p.sceneDescription}`);
    if (targetWords.length) {
      lines.push(`  Introduce on this page: ${targetWords.map((w) => `"${w}"`).join(', ')}`);
    }
  }
  lines.push('');
  lines.push(
    `Write the prose for ALL ${plan.pages.length} pages. Output JSON now: { "pages": [{ "pageNumber", "text" }, ...] }`,
  );
  return lines.join('\n');
}

// ---------- JSON Schema (kept minimal per the Anthropic output_config rules) ----------

const PAGES_PROSE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    pages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          pageNumber: { type: 'integer' },
          text: { type: 'string' },
        },
        required: ['pageNumber', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['pages'],
  additionalProperties: false,
} as const;

// ---------- Main entry point ----------

export async function generatePagesProse(
  input: GeneratePagesProseInput,
): Promise<GeneratePagesProseResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

  // 1. Reading level config (throws on bad id).
  const level = getReadingLevel(input.readingLevelId);

  // 2. Re-derive target rows from the plan's targetVocabUsed UUIDs so the
  //    model gets words rather than UUIDs in the per-page hints. Pulling
  //    from the union of all pages also lets us reject any plan that has
  //    leaked a function word (defensive — Stage 1 already guards).
  const targetIds = uniqueIdsFromPlan(input.plan);
  if (targetIds.length === 0) {
    throw new Error('PassagePlan has no target vocabulary across any page');
  }
  const targetRows = await fetchTargetVocab(targetIds);

  // 3. Cumulative vocab — same resolution rule as Stage 1.
  const cumulativeRows = await resolveCumulativeVocab(targetRows, input.cumulativeVocabIds);

  // 4. Build prompt.
  const systemPrompt = buildSystemPrompt(level);
  const cumulativeBlock = buildCumulativeBlock(cumulativeRows);
  const planBlock = buildPlanBlock(input.plan, targetRows);

  const userContent: Anthropic.ContentBlockParam[] = [
    { type: 'text', text: cumulativeBlock, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: planBlock },
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
      format: { type: 'json_schema', schema: PAGES_PROSE_JSON_SCHEMA },
    },
    system: [
      { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userContent }],
  });
  const durationMs = Date.now() - startedAt;

  // 5. Parse + validate shape.
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error('[generatePagesProse] non-JSON response (truncated):', text.slice(0, 2000));
    throw new Error('Model did not return valid JSON');
  }

  const result = PagesProseOutputSchema.safeParse(parsed);
  if (!result.success) {
    console.error(
      '[generatePagesProse] schema mismatch (truncated):',
      JSON.stringify(parsed).slice(0, 2000),
    );
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
    throw new Error(`PagesProse validation failed: ${issues}`);
  }

  // 6. Verify pageNumber alignment with the plan. If the model reordered
  //    or dropped a page, fail loudly — Stage 3 will catch most issues but
  //    misaligned page numbers would cascade silently.
  const expectedNumbers = input.plan.pages.map((p) => p.pageNumber).sort((a, b) => a - b);
  const actualNumbers = result.data.pages.map((p) => p.pageNumber).sort((a, b) => a - b);
  if (
    expectedNumbers.length !== actualNumbers.length ||
    expectedNumbers.some((n, i) => n !== actualNumbers[i])
  ) {
    throw new Error(
      `Prose pageNumbers do not match plan. Expected [${expectedNumbers.join(',')}], got [${actualNumbers.join(',')}].`,
    );
  }

  // Sort by pageNumber to give callers a stable order regardless of
  // model output ordering.
  const pages: GeneratedPageProse[] = [...result.data.pages].sort(
    (a, b) => a.pageNumber - b.pageNumber,
  );

  const meta: GenerationCallMeta = {
    model: MODEL,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    durationMs,
  };

  logInfo(
    `passage prose generated (${pages.length} pages, level ${level.id} ${level.name})`,
    `lib/reading/generate/prose model=${MODEL} input_tokens=${meta.inputTokens} output_tokens=${meta.outputTokens} duration_ms=${meta.durationMs}`,
  );

  return { pages, meta };
}

function uniqueIdsFromPlan(plan: PassagePlan): string[] {
  const seen = new Set<string>();
  for (const p of plan.pages) {
    for (const id of p.targetVocabUsed) seen.add(id);
  }
  return Array.from(seen);
}

// ---------- Feedback-aware sibling (used by the regen loop) ----------

/** Sibling of generatePagesProse that takes the validation feedback from
 *  a previous attempt and asks the model to fix the listed issues. The
 *  setup (level lookup, vocab resolution, system prompt, cumulative +
 *  plan blocks) is intentionally identical so the cache layout is
 *  consistent between attempts; only the user message gets a tail
 *  feedback block describing the previous attempt and what to change.
 *
 *  Kept as a sibling (not an option on generatePagesProse) so the
 *  no-feedback first-attempt code path is untouched. */
export async function generatePagesProseWithFeedback(
  input: GeneratePagesProseInput,
  feedback: ProseFeedback,
): Promise<GeneratePagesProseResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

  const level = getReadingLevel(input.readingLevelId);

  const targetIds = uniqueIdsFromPlan(input.plan);
  if (targetIds.length === 0) {
    throw new Error('PassagePlan has no target vocabulary across any page');
  }
  const targetRows = await fetchTargetVocab(targetIds);
  const cumulativeRows = await resolveCumulativeVocab(targetRows, input.cumulativeVocabIds);

  const systemPrompt = buildSystemPrompt(level);
  const cumulativeBlock = buildCumulativeBlock(cumulativeRows);
  const planBlock = buildPlanBlock(input.plan, targetRows);
  const feedbackBlock = buildFeedbackBlock(feedback, level);

  // Same cache layout as the first-pass call, with the feedback block
  // appended uncached at the end. The cumulative + plan prefix matches
  // a prior attempt's prefix, so caching keeps cost flat across regens.
  const userContent: Anthropic.ContentBlockParam[] = [
    { type: 'text', text: cumulativeBlock, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: planBlock },
    { type: 'text', text: feedbackBlock },
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
      format: { type: 'json_schema', schema: PAGES_PROSE_JSON_SCHEMA },
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
    console.error('[generatePagesProseWithFeedback] non-JSON response (truncated):', text.slice(0, 2000));
    throw new Error('Model did not return valid JSON');
  }

  const result = PagesProseOutputSchema.safeParse(parsed);
  if (!result.success) {
    console.error(
      '[generatePagesProseWithFeedback] schema mismatch (truncated):',
      JSON.stringify(parsed).slice(0, 2000),
    );
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
    throw new Error(`PagesProse validation failed: ${issues}`);
  }

  const expectedNumbers = input.plan.pages.map((p) => p.pageNumber).sort((a, b) => a - b);
  const actualNumbers = result.data.pages.map((p) => p.pageNumber).sort((a, b) => a - b);
  if (
    expectedNumbers.length !== actualNumbers.length ||
    expectedNumbers.some((n, i) => n !== actualNumbers[i])
  ) {
    throw new Error(
      `Prose pageNumbers do not match plan. Expected [${expectedNumbers.join(',')}], got [${actualNumbers.join(',')}].`,
    );
  }

  const pages: GeneratedPageProse[] = [...result.data.pages].sort(
    (a, b) => a.pageNumber - b.pageNumber,
  );

  const meta: GenerationCallMeta = {
    model: MODEL,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    durationMs,
  };

  logInfo(
    `passage prose regenerated with feedback (${pages.length} pages, level ${level.id} ${level.name})`,
    `lib/reading/generate/prose model=${MODEL} kind=feedback input_tokens=${meta.inputTokens} output_tokens=${meta.outputTokens} duration_ms=${meta.durationMs}`,
  );

  return { pages, meta };
}

/** Render the feedback block that appends to the prose user message on a
 *  regen attempt. Stays consistent in shape with the first-pass user
 *  message so the model knows to output the same JSON contract; only the
 *  preamble changes. Top 10 unknown words by occurrence are listed —
 *  beyond that the model has plenty of signal already and the prompt
 *  starts to bloat. */
function buildFeedbackBlock(feedback: ProseFeedback, level: ReadingLevel): string {
  // Pre-split each bucket by severity so we can render two top-level
  // sections: "YOU MUST FIX" (errors) and "Try to fix if possible"
  // (warnings). The unknown-word bucket has a single set-wide severity
  // (validate.ts assigns 1-2 distinct unknowns = warning, 3+ = error)
  // so we route the entire word list into one or the other.
  const errors = {
    unknownWords:
      feedback.issuesByType.unknownWords.length > 0 &&
      feedback.issuesByType.unknownWords[0]!.severity === 'error'
        ? feedback.issuesByType.unknownWords
        : [],
    sentencesTooLong: feedback.issuesByType.sentencesTooLong.filter(
      (s) => s.severity === 'error',
    ),
    pagesOutOfRange: feedback.issuesByType.pagesOutOfRange.filter(
      (p) => p.severity === 'error',
    ),
    missingTargetWords: feedback.issuesByType.missingTargetWords.filter(
      (m) => m.severity === 'error',
    ),
    forbiddenConstructions: feedback.issuesByType.forbiddenConstructions.filter(
      (f) => f.severity === 'error',
    ),
  };
  const warnings = {
    unknownWords:
      feedback.issuesByType.unknownWords.length > 0 &&
      feedback.issuesByType.unknownWords[0]!.severity === 'warning'
        ? feedback.issuesByType.unknownWords
        : [],
    sentencesTooLong: feedback.issuesByType.sentencesTooLong.filter(
      (s) => s.severity === 'warning',
    ),
    pagesOutOfRange: feedback.issuesByType.pagesOutOfRange.filter(
      (p) => p.severity === 'warning',
    ),
    // missingTargetWords and forbiddenConstructions are always errors,
    // so they don't appear here. Listed for shape parity.
    missingTargetWords: feedback.issuesByType.missingTargetWords.filter(
      (m) => m.severity === 'warning',
    ),
    forbiddenConstructions: feedback.issuesByType.forbiddenConstructions.filter(
      (f) => f.severity === 'warning',
    ),
  };

  const hasErrors =
    errors.unknownWords.length > 0 ||
    errors.sentencesTooLong.length > 0 ||
    errors.pagesOutOfRange.length > 0 ||
    errors.missingTargetWords.length > 0 ||
    errors.forbiddenConstructions.length > 0;
  const hasWarnings =
    warnings.unknownWords.length > 0 ||
    warnings.sentencesTooLong.length > 0 ||
    warnings.pagesOutOfRange.length > 0;

  const lines: string[] = [];
  lines.push(
    'You wrote the prose below. Validation found some issues — REWRITE the prose, ' +
      'keeping the same plan beats but addressing the errors. Do NOT introduce new ' +
      'issues while fixing these. Errors are required fixes; warnings are nice-to-fix ' +
      'and should not come at the cost of overall prose quality.',
  );
  lines.push('');
  lines.push('YOUR PREVIOUS ATTEMPT:');
  for (const p of feedback.previousAttemptPages) {
    lines.push(`Page ${p.pageNumber}: ${p.text}`);
  }
  lines.push('');

  if (hasErrors) {
    lines.push('YOU MUST FIX:');
    lines.push('');
    appendUnknownWords(lines, errors.unknownWords);
    appendSentencesTooLong(lines, errors.sentencesTooLong, level);
    appendPagesOutOfRange(lines, errors.pagesOutOfRange, level);
    appendMissingTargets(lines, errors.missingTargetWords);
    appendForbidden(lines, errors.forbiddenConstructions);
  }

  if (hasWarnings) {
    lines.push('Try to fix if possible (warnings — don\'t hurt the prose to chase these):');
    lines.push('');
    appendUnknownWords(lines, warnings.unknownWords);
    appendSentencesTooLong(lines, warnings.sentencesTooLong, level);
    appendPagesOutOfRange(lines, warnings.pagesOutOfRange, level);
  }

  lines.push(
    'Now produce the corrected prose. Output the same JSON format as before: ' +
      '{ "pages": [{ "pageNumber", "text" }, ...] }',
  );
  return lines.join('\n');
}

function appendUnknownWords(
  lines: string[],
  items: ProseFeedback['issuesByType']['unknownWords'],
): void {
  if (items.length === 0) return;
  lines.push(
    'Unknown words (these are NOT in the cumulative vocabulary list — replace each with a word that IS in the list, or paraphrase using words you have):',
  );
  for (const item of items.slice(0, 10)) {
    lines.push(`  - "${item.word}" (used on page ${item.pageNumbers.join(', ')})`);
  }
  if (items.length > 10) {
    lines.push(
      `  …and ${items.length - 10} more — also fix any other words you used that aren't in the cumulative list.`,
    );
  }
  lines.push('');
}

function appendSentencesTooLong(
  lines: string[],
  items: ProseFeedback['issuesByType']['sentencesTooLong'],
  level: ReadingLevel,
): void {
  if (items.length === 0) return;
  lines.push(`Sentences too long (max ${level.maxSentenceWords} words per sentence):`);
  for (const s of items) {
    lines.push(
      `  - Page ${s.pageNumber}: "${s.sentence}" (${s.wordCount} words, max ${s.max}). Split it into two short sentences or shorten.`,
    );
  }
  lines.push('');
}

function appendPagesOutOfRange(
  lines: string[],
  items: ProseFeedback['issuesByType']['pagesOutOfRange'],
  level: ReadingLevel,
): void {
  if (items.length === 0) return;
  lines.push(
    `Pages out of word-count range (target ${level.wordsPerPage.min}–${level.wordsPerPage.max} words per page):`,
  );
  for (const p of items) {
    const direction =
      p.wordCount < level.wordsPerPage.min
        ? 'add a sentence or two'
        : 'cut one or two sentences';
    lines.push(`  - Page ${p.pageNumber}: ${p.wordCount} words. ${direction}.`);
  }
  lines.push('');
}

function appendMissingTargets(
  lines: string[],
  items: ProseFeedback['issuesByType']['missingTargetWords'],
): void {
  if (items.length === 0) return;
  lines.push(
    'Missing target words (the plan requires each of these to appear at least once in the story; weave them into the relevant pages):',
  );
  for (const m of items) {
    lines.push(`  - "${m.word}"`);
  }
  lines.push('');
}

function appendForbidden(
  lines: string[],
  items: ProseFeedback['issuesByType']['forbiddenConstructions'],
): void {
  if (items.length === 0) return;
  lines.push('Forbidden constructions for this level:');
  for (const f of items) {
    lines.push(`  - Page ${f.pageNumber}: "${f.sentence}" — ${f.reason}`);
  }
  lines.push('');
}
