// Stage 4 of the reading-passage generation pipeline: produce 5
// comprehension questions (3 MCQ + 1 vocab_matching + 1 sequence_order)
// for an already-validated prose passage. ONE Claude call generates
// all 5 questions so cross-question consistency holds (no two MCQs
// targeting the same evidence quote, etc.).
//
// Architecture mirrors prose.ts:
//   - Anthropic Sonnet 4.6 with output_config json_schema for shape
//     constraint at decode time (constraints kept minimal per the
//     Anthropic memory note; strictness comes from zod post-parse).
//   - cache_control on the system message + cumulative vocab block.
//   - Temperature 0.5 — same as prose; questions benefit from less
//     variance than planning.
//
// Validation is intentionally NOT here — Stage 5 (validate-questions)
// runs deterministic checks (evidence verbatim, vocab id existence,
// type distribution). Keeps the two stages independently inspectable.

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import {
  applyOverridesToLevel,
  getReadingLevel,
  type QuestionTypeMix,
  type EffectiveReadingLevel,
} from '@/lib/reading/levels';
import { geminiImageClient } from '@/lib/image/gemini-client';
import { r2Client } from '@/lib/storage/r2-client';
import { logInfo } from '@/lib/logger';
import {
  GeneratedQuestionRawSchema,
  type GeneratedPageProse,
  type GeneratedQuestion,
  type GenerateQuestionsInput,
  type GenerateQuestionsResult,
  type GenerationCallMeta,
  type PassagePlan,
} from './types';

const MODEL = 'claude-sonnet-4-6';
const TEMPERATURE = 0.5;
const MAX_TOKENS = 4000;

// ---------- Prompt builders ----------

const SYSTEM_PROMPT_PREFIX = `You generate comprehension questions for ESL stories at Macmillan Language School in Kaohsiung, Taiwan, ages 6-10.

For each story, produce EXACTLY 5 questions. The exact type mix per
reading level is given below; produce questions in that order
(MCQs first, then vocab_matching, then sequence_order).

QUESTION TYPE RULES

mcq_comprehension:
- Exactly 4 answer options. Exactly 1 correct, 3 plausible-but-wrong distractors.
- The correct answer must be supported by an EXACT verbatim quote from the prose. That quote goes in evidenceQuote — do not paraphrase, do not change punctuation, copy a substring of one page word-for-word. evidencePageNumber names which page.
- Distractors must be plausible — same category and similar grammatical shape as the correct answer. Not silly or obviously wrong.
- All four options must use only words from the cumulative vocabulary list, OR character names that appear in the story.

vocab_matching:
- 4-6 pairs. Each pair only has a "word" (a target vocabulary word) — the calling code generates a kid-friendly illustration for it and the student tap-matches words to pictures, so do NOT emit any kind of meaning, definition, sentence, or vocabId.
- Prefer concrete, picture-able words (objects, animals, foods, simple actions). If a target word is abstract or polysemous in unhelpful ways, drop it for this question and pad with another concrete word from the targets or from cumulative words that actually appear in the story.
- If fewer than 4 target vocab words are usable, pad with cumulative words that ACTUALLY APPEAR in the story prose.

sequence_order:
- 4-5 distinct narrative events from the story, each described in 5-12 words.
- Output the events in CORRECT chronological order (the UI shuffles for the student; we store the canonical order).
- Use only cumulative vocabulary in the event descriptions.

QUESTION TEXT RULES (apply to all types)
- Use only cumulative vocabulary.
- Stay within the maximum sentence length for this level (specified below).
- Questions must be answerable from the story text alone, not from outside knowledge.
- Tone: clear, plain, encouraging.

OUTPUT
- Strict JSON matching the provided schema. No markdown, explanation, or commentary outside the JSON.
- vocab_matching pairs only emit { "word": ... } — the calling code maps the word to its canonical vocabulary.id and generates the matching picture asset.

`;

function buildSystemPrompt(level: EffectiveReadingLevel): string {
  const mix = level.questionTypeMix;
  // Build a human-readable breakdown listing only the non-zero counts
  // so the model isn't confused by "0 sequence_order" being a thing.
  const lines: string[] = [];
  if (mix.mcq_comprehension > 0)
    lines.push(`  ${mix.mcq_comprehension} mcq_comprehension`);
  if (mix.vocab_matching > 0)
    lines.push(`  ${mix.vocab_matching} vocab_matching`);
  if (mix.sequence_order > 0)
    lines.push(`  ${mix.sequence_order} sequence_order`);
  if (mix.sequence_order === 0)
    lines.push(
      '  (sequence_order is NOT used at this level — do not produce any sequence_order questions)',
    );

  return [
    SYSTEM_PROMPT_PREFIX,
    `READING LEVEL: ${level.id} (${level.name})`,
    `Maximum question / sentence length: ${level.maxSentenceWords} words.`,
    '',
    'EXACT QUESTION MIX FOR THIS LEVEL:',
    ...lines,
  ].join('\n');
}

/** Build the call-specific output schema. The shared
 *  GeneratedQuestionRawSchema (a discriminated union) doesn't enforce
 *  per-type counts because the mix varies by level. We add a refine()
 *  here that throws on count mismatch — a hard fail at parse time so
 *  generateQuestions never returns a bad-shape result. The Stage 5
 *  validator re-checks for defense-in-depth. */
function buildOutputSchema(mix: QuestionTypeMix) {
  return z.object({
    questions: z.array(GeneratedQuestionRawSchema).length(5).refine(
      (qs) => {
        const counts = {
          mcq_comprehension: 0,
          vocab_matching: 0,
          sequence_order: 0,
        } as Record<string, number>;
        for (const q of qs) counts[q.type]++;
        return (
          counts.mcq_comprehension === mix.mcq_comprehension &&
          counts.vocab_matching === mix.vocab_matching &&
          counts.sequence_order === mix.sequence_order
        );
      },
      {
        message: `question type distribution must match the level's mix exactly: ${mix.mcq_comprehension} mcq_comprehension + ${mix.vocab_matching} vocab_matching + ${mix.sequence_order} sequence_order`,
      },
    ),
  });
}

function buildCumulativeBlock(
  cumulative: { id: string; word: string }[],
): string {
  // The validator's cumulative list is already filtered by level + scaffolds;
  // we just dump the words alphabetically. POS grouping isn't necessary for
  // questions because the model isn't building grammar patterns.
  const words = Array.from(new Set(cumulative.map((r) => r.word.toLowerCase().trim())))
    .filter(Boolean)
    .sort();
  return [
    'CUMULATIVE VOCABULARY (the only words you may use, in addition to character names from the story):',
    '',
    words.join(', '),
  ].join('\n');
}

function buildContextBlock(
  plan: PassagePlan,
  pages: GeneratedPageProse[],
  targets: GenerateQuestionsInput['targetVocabRows'],
): string {
  const lines: string[] = [];
  lines.push(`STORY: "${plan.title}"`);
  lines.push(`Setting: ${plan.setting}`);
  lines.push(`Summary: ${plan.summary}`);
  lines.push('');
  lines.push('Characters (their names are usable in question/option text):');
  for (const c of plan.characters) {
    lines.push(`  - ${c.name}: ${c.description}`);
  }
  lines.push('');
  lines.push(`PROSE (${pages.length} pages):`);
  for (const p of pages) {
    lines.push(`Page ${p.pageNumber}: ${p.text}`);
  }
  lines.push('');
  lines.push('TARGET VOCABULARY (prefer these words for vocab_matching pairs):');
  for (const t of targets) {
    const hint = t.mandarinTranslation ? ` (Mandarin: ${t.mandarinTranslation})` : '';
    lines.push(`  - "${t.word}"${hint}`);
  }
  lines.push('');
  lines.push(
    'Now produce the 5 questions. Output JSON only: ' +
      '{ "questions": [{ "type", "questionText", "payload", ...mcq-only fields }, ...] }',
  );
  return lines.join('\n');
}

// ---------- Output schema for Anthropic's output_config ----------
//
// Kept minimal per the memory note: no minItems/maxItems/minimum/
// maximum constraints. Strict shape (counts, ranges, per-type payload
// presence) is enforced by zod post-parse via QuestionsOutputSchema.
//
// Anthropic's output_config requires additionalProperties: false on
// EVERY object schema. The payload object is enumerated permissively —
// every field that could legally appear across the three question
// types — and zod's discriminated union enforces the per-type subset
// after parse.

const QUESTIONS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['mcq_comprehension', 'vocab_matching', 'sequence_order'],
          },
          questionText: { type: 'string' },
          payload: {
            type: 'object',
            properties: {
              // mcq_comprehension fields
              options: { type: 'array', items: { type: 'string' } },
              correctIndex: { type: 'integer' },
              // vocab_matching fields — only `word` is emitted by the
              // model. vocabId + imageKey are filled in post-parse.
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
              // sequence_order fields
              events: { type: 'array', items: { type: 'string' } },
            },
            additionalProperties: false,
          },
          // mcq_comprehension only — optional in this permissive shape;
          // zod requires them per-type post-parse.
          evidenceQuote: { type: 'string' },
          evidencePageNumber: { type: 'integer' },
        },
        required: ['type', 'questionText', 'payload'],
        additionalProperties: false,
      },
    },
  },
  required: ['questions'],
  additionalProperties: false,
} as const;

// ---------- Main entry point ----------

export async function generateQuestions(
  input: GenerateQuestionsInput,
): Promise<GenerateQuestionsResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

  // Effective level honors overrides (especially questionTypeMix) so
  // the per-call output schema enforces the teacher's chosen mix.
  const level = applyOverridesToLevel(
    getReadingLevel(input.readingLevelId),
    input.overrides,
  );

  if (input.pages.length === 0) {
    throw new Error('generateQuestions: pages[] is empty');
  }
  if (input.targetVocabRows.length === 0) {
    throw new Error('generateQuestions: targetVocabRows is empty');
  }

  const systemPrompt = buildSystemPrompt(level);
  const cumulativeBlock = buildCumulativeBlock(input.cumulativeVocabRows);
  const contextBlock = buildContextBlock(input.plan, input.pages, input.targetVocabRows);

  const userContent: Anthropic.ContentBlockParam[] = [
    { type: 'text', text: cumulativeBlock, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: contextBlock },
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
      format: { type: 'json_schema', schema: QUESTIONS_JSON_SCHEMA },
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
    console.error('[generateQuestions] non-JSON response (truncated):', text.slice(0, 2000));
    throw new Error('Model did not return valid JSON');
  }

  const result = buildOutputSchema(level.questionTypeMix).safeParse(parsed);
  if (!result.success) {
    console.error(
      '[generateQuestions] schema mismatch (truncated):',
      JSON.stringify(parsed).slice(0, 2000),
    );
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
    throw new Error(`QuestionsOutput validation failed: ${issues}`);
  }

  // Map vocab_matching pair words → canonical vocabulary.id values.
  // The model emits {word}; we look up each word in the union of target +
  // cumulative rows. A miss leaves vocabId='' so the validator's
  // vocab_id_invalid check fires.
  const wordToId = new Map<string, string>();
  // Set of vocabulary.id values flagged is_picturable=true. The vocab_matching
  // pair safeguard below uses this to refuse pairs whose underlying word can't
  // produce a usable picture card. Targets are filtered to picturable=true
  // upstream (test-passage selection / future orchestrator), but the model
  // can also pad pairs with cumulative words — so the cumulative side is
  // surfaced here too.
  const picturableIds = new Set<string>();
  for (const r of input.cumulativeVocabRows) {
    wordToId.set(r.word.toLowerCase().trim(), r.id);
    if (r.isPicturable) picturableIds.add(r.id);
  }
  for (const r of input.targetVocabRows) {
    // Targets win on collision — they're the curated set we want pairs to prefer.
    wordToId.set(r.word.toLowerCase().trim(), r.id);
    if (r.isPicturable) picturableIds.add(r.id);
  }

  // Two-pass build:
  //   1. Map raw model output → V1-shaped intermediate (word + vocabId).
  //   2. For vocab_matching questions, generate one Gemini illustration
  //      per pair (cold; no character reference image — these are
  //      single-object pictures), then attach R2 keys to produce the
  //      final V2 payload. Image *bytes* are surfaced in vocabImages so
  //      the orchestrator can upload them in the same parallel batch as
  //      page images.
  const vocabImages: GenerateQuestionsResult['vocabImages'] = [];
  let vocabImageCallCount = 0;

  const intermediate = result.data.questions.map((q, i) => {
    const orderIndex = i;
    if (q.type === 'mcq_comprehension') {
      return {
        type: 'mcq_comprehension' as const,
        questionText: q.questionText,
        orderIndex,
        payload: {
          options: q.payload.options,
          correctIndex: q.payload.correctIndex,
        },
        evidenceQuote: q.evidenceQuote,
        evidencePageNumber: q.evidencePageNumber,
      };
    }
    if (q.type === 'vocab_matching') {
      return {
        type: 'vocab_matching' as const,
        questionText: q.questionText,
        orderIndex,
        pairs: q.payload.pairs.map((p) => ({
          word: p.word,
          vocabId: wordToId.get(p.word.toLowerCase().trim()) ?? '',
        })),
      };
    }
    return {
      type: 'sequence_order' as const,
      questionText: q.questionText,
      orderIndex,
      payload: { events: q.payload.events },
    };
  });

  const questions: GeneratedQuestion[] = [];
  for (const q of intermediate) {
    if (q.type === 'mcq_comprehension') {
      const shuffled = shuffleMcqOptions(q.payload.options, q.payload.correctIndex);
      questions.push({
        type: 'mcq_comprehension',
        questionText: q.questionText,
        orderIndex: q.orderIndex,
        payload: shuffled,
        evidenceQuote: q.evidenceQuote,
        evidencePageNumber: q.evidencePageNumber,
      });
      continue;
    }
    if (q.type === 'sequence_order') {
      questions.push({
        type: 'sequence_order',
        questionText: q.questionText,
        orderIndex: q.orderIndex,
        payload: q.payload,
      });
      continue;
    }

    // Defense-in-depth: refuse pairs whose underlying vocabulary row is
    // flagged is_picturable=false. Numbers / abstract evaluatives /
    // discourse markers all reach here only if the upstream target-
    // selection filter slipped — that's a bug we want to surface loudly
    // rather than swallowing with a confusing image. (Empty-vocabId pairs
    // bypass this — they're handled below as their own error path.)
    for (const p of q.pairs) {
      if (!p.vocabId) continue;
      if (!picturableIds.has(p.vocabId)) {
        throw new Error(
          `Unpicturable word ${p.word} reached vocab_matching pair generation. Check target selection filter.`,
        );
      }
    }

    // Skip-images shortcut: bypass Gemini entirely. Each pair gets a
    // sentinel imageKey so the V2 payload shape stays valid; the
    // validator's pair_image_key_invalid check has a matching exemption.
    if (input.skipImages) {
      const v2Pairs = q.pairs.map((p) => ({
        word: p.word,
        vocabId: p.vocabId,
        imageKey: p.vocabId ? `skipped:vocab-${p.vocabId}` : '',
      }));
      questions.push({
        type: 'vocab_matching',
        questionText: q.questionText,
        orderIndex: q.orderIndex,
        payload: { version: 2, pairs: v2Pairs },
      });
      continue;
    }

    // vocab_matching — generate a picture per pair in parallel.
    const v2Pairs = await Promise.all(
      q.pairs.map(async (p, pIdx) => {
        // Pairs whose word didn't map to a vocab id are surfaced as an
        // error by the validator; we still attempt the image so the V2
        // payload shape stays consistent. The key uses an empty-id-safe
        // path-segment guard from r2Client; an empty vocabId throws,
        // which we catch and emit a placeholder. The placeholder
        // imageKey will fail the validator's prefix check.
        if (!p.vocabId) {
          return { word: p.word, vocabId: '', imageKey: '' };
        }
        const key = r2Client.generateStoryVocabImageKey(input.passageId, p.vocabId);
        const prompt = buildVocabImagePrompt(p.word);
        const result = await geminiImageClient.generateImagePanel({
          prompt,
          // Cold generation per the v2 design — we want a single object on
          // a clean white background, NOT the page-1 character reference
          // (that would re-introduce the protagonist into every word card).
          referenceImage: undefined,
          label: `vocab pair "${p.word}"`,
        });
        vocabImageCallCount++;
        if (!result.success || !result.imageBuffer) {
          // Leave imageKey empty so the validator emits
          // pair_image_key_invalid; failure is surfaced through the
          // existing structural-error path rather than crashing the
          // whole questions stage.
          console.error(
            `[generateQuestions] vocab image gen failed for word "${p.word}" (vocab=${p.vocabId}): ${result.error ?? 'unknown'}`,
          );
          return { word: p.word, vocabId: p.vocabId, imageKey: '' };
        }
        vocabImages.push({
          key,
          buffer: result.imageBuffer,
          mimeType: result.contentType ?? 'image/png',
          questionIndex: q.orderIndex,
          pairIndex: pIdx,
          word: p.word,
          vocabId: p.vocabId,
        });
        return { word: p.word, vocabId: p.vocabId, imageKey: key };
      }),
    );

    questions.push({
      type: 'vocab_matching',
      questionText: q.questionText,
      orderIndex: q.orderIndex,
      payload: { version: 2, pairs: v2Pairs },
    });
  }

  const meta: GenerationCallMeta = {
    model: MODEL,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    durationMs,
  };

  logInfo(
    `passage questions generated (${questions.length} questions, level ${level.id} ${level.name}, vocab images=${vocabImageCallCount})`,
    `lib/reading/generate/questions model=${MODEL} input_tokens=${meta.inputTokens} output_tokens=${meta.outputTokens} duration_ms=${meta.durationMs} vocab_image_calls=${vocabImageCallCount}`,
  );

  return { questions, meta, vocabImages, vocabImageCallCount };
}

/** Fisher–Yates shuffle for MCQ options. The model has a strong bias
 *  toward putting the correct answer in position 0 — without this, every
 *  story's first MCQ has answer "A", which lets students game the quiz.
 *  Reshuffles until the new correctIndex !== the input correctIndex so
 *  we never accidentally land back on the model's choice. (Exported so
 *  regen-question.ts can call the same routine on single-question
 *  regeneration paths.) */
export function shuffleMcqOptions(
  options: string[],
  correctIndex: number,
): { options: string[]; correctIndex: number } {
  if (options.length <= 1) return { options: [...options], correctIndex };
  const correctOption = options[correctIndex]!;
  // Run Fisher–Yates; loop if the correct answer landed in the same slot.
  // Bounded retries so a degenerate options set (duplicates) can't spin
  // forever — 8 attempts is comfortably above any practical bad luck.
  for (let attempt = 0; attempt < 8; attempt++) {
    const shuffled = [...options];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    const newIdx = shuffled.indexOf(correctOption);
    if (newIdx !== correctIndex) {
      return { options: shuffled, correctIndex: newIdx };
    }
  }
  // Fallback: deterministic rotation so we never return the model's order.
  const rotated = [...options.slice(1), options[0]!];
  const rotatedIdx = rotated.indexOf(correctOption);
  return { options: rotated, correctIndex: rotatedIdx };
}

/** Vocab image prompt — single object, white background, no character.
 *  Distinct from page-image prompts (which describe a scene with the
 *  story's cast); these stand alone as picture-card art.
 *
 *  Leads with a declarative sentence so Gemini commits instead of
 *  asking "what would you like illustrated" — fragment-style prompts
 *  caused conversational replies for abstract nouns like "rectangle". */
function buildVocabImagePrompt(word: string): string {
  return [
    `An illustration of a ${word}.`,
    `The ${word} is the only subject, centered on a clean white background.`,
    'Simple kid-friendly art, watercolor style, soft pastel colors.',
    'No text, no letters, no numbers in the image.',
    'Style: picture book for ages 6–10.',
  ].join(' ');
}
