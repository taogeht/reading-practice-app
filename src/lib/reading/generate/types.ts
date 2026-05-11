// Shared types for the Raz-Kids-style story generation pipeline.
// Stage 1 (plan.ts) consumes GeneratePassagePlanInput and returns a
// PassagePlan. Later stages (prose, validation, questions, image prompts,
// TTS) will live alongside this file and import these types.

import { z } from 'zod';

/** A single named character. Description is image-direction-friendly so the
 *  per-page image generator can render the same character consistently. */
export const CharacterSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
});

/** One page in a planned passage. `beat` is a plain-English summary of what
 *  happens — NOT the prose itself; the prose stage will write that.
 *  `targetVocabUsed` holds vocabulary.id UUIDs of target words introduced on
 *  this page. The model fills it with words and plan.ts maps to UUIDs. */
export const PassagePagePlanSchema = z.object({
  pageNumber: z.number().int().positive(),
  beat: z.string().min(1),
  sceneDescription: z.string().min(1),
  targetVocabUsed: z.array(z.string()),
});

/** Three-act structural skeleton; the page beats should realise this arc. */
export const StructuralPlanSchema = z.object({
  problem: z.string().min(1),
  attempt: z.string().min(1),
  resolution: z.string().min(1),
});

export const PassagePlanSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  setting: z.string().min(1),
  characters: z.array(CharacterSchema).min(1).max(3),
  pages: z.array(PassagePagePlanSchema).min(1),
  structuralPlan: StructuralPlanSchema,
});

export type Character = z.infer<typeof CharacterSchema>;
export type PassagePagePlan = z.infer<typeof PassagePagePlanSchema>;
export type StructuralPlan = z.infer<typeof StructuralPlanSchema>;
export type PassagePlan = z.infer<typeof PassagePlanSchema>;

/** Per-call telemetry — written to logs and returned alongside the plan so
 *  the caller (and the test harness) can surface it. Stages 2+ will reuse
 *  this shape. */
export interface GenerationCallMeta {
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

/**
 * Teacher-controlled overrides for a generation. Each field is optional;
 * undefined means "use the level's default."
 *
 * The intent is to let teachers shape a passage for a specific lesson
 * plan WITHOUT giving them access to validator thresholds, vocabulary
 * CEFR caps, or other technical knobs that exist to protect pedagogical
 * coherence. What's overridable here is roughly "length, shape, what to
 * practice, what tense/voice"; what's NOT overridable is the cumulative
 * vocabulary cap (Grade-3 words don't sneak into Level-2 stories).
 */
export interface GenerateOverrides {
  // Length & shape
  pageCount?: number;
  maxSentenceWords?: number;
  wordsPerPageMin?: number;
  wordsPerPageMax?: number;

  // Target vocabulary
  targetVocabCount?: number;
  targetVocabSelectionMode?: 'random_level' | 'random_unit' | 'specific';
  targetVocabUnit?: number;
  targetVocabIds?: string[];

  // Grammar toggles (loosen the level's defaults; we don't tighten here)
  allowPastTense?: boolean;
  allowContractions?: boolean;
  allowPhrasalVerbs?: boolean;
  allowFutureTense?: boolean;

  // Setting & tone — both surface to plan.ts as soft hints.
  seedTheme?: string;
  setting?: string;

  /** strict (default): every word must be in cumulative vocab. permissive:
   *  the unknown-word warning tier bumps so 1-4 unknowns are warnings
   *  rather than errors — lets the model introduce stretch vocab in
   *  context without failing the run. */
  vocabStrictness?: 'strict' | 'permissive';

  // Questions
  questionCount?: number;
  questionTypeMix?: {
    mcq_comprehension: number;
    vocab_matching: number;
    sequence_order: number;
  };
}

export interface GeneratePassagePlanInput {
  /** 1..5 — the id from src/lib/reading/levels.ts. */
  readingLevel: number;
  /** 4-6 vocabulary.id UUIDs. Function words rejected. */
  targetVocabIds: string[];
  /** Optional override for the cumulative vocabulary the model can use
   *  freely. If omitted, plan.ts derives it from the targets' (afFLevel,
   *  afFUnit) caps. */
  cumulativeVocabIds?: string[];
  /** Optional creative nudge ("garden", "lost toy"). Model picks if omitted. */
  seedTheme?: string;
  /** Teacher overrides — see GenerateOverrides. Threaded from the
   *  orchestrator. Stage 1 (plan.ts) consumes the length/grammar/
   *  setting fields; cumulative-vocab fields are still untouched. */
  overrides?: GenerateOverrides;
}

export interface GeneratePassagePlanResult {
  plan: PassagePlan;
  meta: GenerationCallMeta;
}

// ---------- Stage 2: prose ----------

/** A single page's prose. `text` is the actual student-facing copy that
 *  Stage 3 (validate) checks against the level constraints. */
export const GeneratedPageProseSchema = z.object({
  pageNumber: z.number().int().positive(),
  text: z.string().min(1),
});

/** The wrapper Anthropic returns: { pages: [...] }. Used to parse the raw
 *  model response before we hand the array to the validator. */
export const PagesProseOutputSchema = z.object({
  pages: z.array(GeneratedPageProseSchema).min(1),
});

export type GeneratedPageProse = z.infer<typeof GeneratedPageProseSchema>;
export type PagesProseOutput = z.infer<typeof PagesProseOutputSchema>;

export interface GeneratePagesProseInput {
  /** From Stage 1 — the structural plan to expand into prose. */
  plan: PassagePlan;
  /** 1..5 — same value passed to Stage 1; drives sentence/word/grammar caps. */
  readingLevelId: number;
  /** Optional override; if omitted, prose.ts derives the same cumulative
   *  set Stage 1 would have. Keep explicit if you want both stages to see
   *  exactly the same allowlist. */
  cumulativeVocabIds?: string[];
  /** Same teacher overrides surface used in Stage 1. Stage 2 honors
   *  pageCount / maxSentenceWords / wordsPerPage / grammar toggles. */
  overrides?: GenerateOverrides;
}

export interface GeneratePagesProseResult {
  pages: GeneratedPageProse[];
  meta: GenerationCallMeta;
}

// ---------- Stage 3: validation ----------

/** Severity tier for a validation issue.
 *  - 'error':   the prose ships only after this is fixed. Affects
 *               regen-loop continuation and the redefined valid flag.
 *  - 'warning': nice-to-fix; doesn't gate publish. The qualityScore
 *               still drops a little for each, so they aggregate. */
export type IssueSeverity = 'error' | 'warning';

/** Issues the deterministic validator can detect. `forbidden_construction`
 *  is intentionally narrow in v1 — only emitted by checks we trust (e.g.
 *  contractions when the level disallows them). Past-tense / phrasal-verb
 *  detection would need a parser we don't ship cheap, so leave those to
 *  the prompt's instructions for now. */
export type ValidationIssue =
  | { type: 'unknown_word'; severity: IssueSeverity; pageNumber: number; word: string; sentence: string }
  | { type: 'sentence_too_long'; severity: IssueSeverity; pageNumber: number; sentence: string; wordCount: number; maxAllowed: number }
  | { type: 'target_word_missing'; severity: IssueSeverity; word: string; vocabId: string }
  | { type: 'page_too_short'; severity: IssueSeverity; pageNumber: number; wordCount: number; minRequired: number }
  | { type: 'page_too_long'; severity: IssueSeverity; pageNumber: number; wordCount: number; maxAllowed: number }
  | { type: 'forbidden_construction'; severity: IssueSeverity; pageNumber: number; sentence: string; reason: string };

export interface ValidationStats {
  totalWords: number;
  uniqueWords: number;
  targetCoverage: { vocabId: string; word: string; covered: boolean }[];
  perPageWordCount: number[];
  longestSentenceWords: number;
}

export interface ValidationResult {
  /** True iff errorCount === 0. With the severity model, a story
   *  containing only warnings still validates — warnings are nice-to-
   *  fix nuance, not gating defects. The regen loop exits on
   *  valid=true, so warnings-only attempts short-circuit. */
  valid: boolean;
  issues: ValidationIssue[];
  /** Issues with severity='error'. */
  errorCount: number;
  /** Issues with severity='warning'. */
  warningCount: number;
  /** 0–1 aggregate quality. Formula:
   *    max(0, 1.0 - errorCount * 0.2 - warningCount * 0.05)
   *  Errors are 4× more punitive than warnings. Auto-publish gating
   *  can use a soft threshold (e.g. ≥0.85) instead of strict valid=true. */
  qualityScore: number;
  stats: ValidationStats;
}

// ---------- Regen wrapper (Stage 2 + 3 with retry) ----------

/** Aggregated feedback shipped from the regen orchestrator into the next
 *  prose-generation call. Issues are flattened into per-type buckets so
 *  the prompt builder can list them under appropriately framed headers
 *  (model has been observed to react better to "Unknown words: X, Y, Z"
 *  than to a heterogenous JSON dump). */
export interface ProseFeedback {
  /** The exact pages the previous attempt produced — the model needs
   *  the prior text in front of it to revise. */
  previousAttemptPages: GeneratedPageProse[];
  /** Each per-issue-type bucket carries severity per item so the
   *  prompt builder can split them into "YOU MUST FIX" (errors) vs.
   *  "Try to fix if possible" (warnings) sections. The unknown-word
   *  bucket has a single severity for the whole bucket because the
   *  validator's tier rule (1-2 distinct = warning, 3+ = error) is
   *  set-wide rather than per-item. */
  issuesByType: {
    /** Each unique unknown word + every page it appeared on. */
    unknownWords: {
      word: string;
      pageNumbers: number[];
      severity: IssueSeverity;
    }[];
    sentencesTooLong: {
      pageNumber: number;
      sentence: string;
      wordCount: number;
      max: number;
      severity: IssueSeverity;
    }[];
    /** Unified bucket for page_too_short and page_too_long. The level's
     *  full min/max range is what the prompt should surface anyway. */
    pagesOutOfRange: {
      pageNumber: number;
      wordCount: number;
      min: number;
      max: number;
      severity: IssueSeverity;
    }[];
    missingTargetWords: {
      word: string;
      severity: IssueSeverity;
    }[];
    forbiddenConstructions: {
      pageNumber: number;
      sentence: string;
      reason: string;
      severity: IssueSeverity;
    }[];
  };
}

export interface GenerateValidatedProseInput {
  plan: PassagePlan;
  readingLevelId: number;
  cumulativeVocabIds?: string[];
  /** Maximum number of generation attempts (1 = no regen, 3 = up to two
   *  retries after the first attempt). Default 3. */
  maxAttempts?: number;
  /** Threaded into every prose call + the validator so the regen
   *  loop honors the teacher's overrides on retries too. */
  overrides?: GenerateOverrides;
}

export interface AttemptRecord {
  attemptNumber: number;
  pages: GeneratedPageProse[];
  validation: ValidationResult;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
}

export interface GenerateValidatedProseResult {
  /** True iff the FINAL attempt validated clean. */
  success: boolean;
  /** Pages from the BEST attempt — fewest issues, ties broken by latest
   *  attemptNumber so we prefer feedback-informed regens on ties. */
  finalPages: GeneratedPageProse[];
  finalValidation: ValidationResult;
  /** Full ordered history of attempts (1, 2, …). Use to inspect what
   *  changed between regens. */
  attempts: AttemptRecord[];
  totalDurationMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

// ---------- Stage 4: question generation ----------

/** The three question types mirror the readingQuestions DB enum. The
 *  payload shapes mirror the DB JSON shapes (defined alongside the
 *  table in src/lib/db/schema.ts) but with vocabId in the vocab pair
 *  added by post-parse mapping rather than emitted by the model. */

export const McqGeneratedSchema = z.object({
  type: z.literal('mcq_comprehension'),
  questionText: z.string().min(1),
  payload: z.object({
    options: z.array(z.string().min(1)).length(4),
    correctIndex: z.number().int().min(0).max(3),
  }),
  evidenceQuote: z.string().min(1),
  evidencePageNumber: z.number().int().positive(),
});

export const VocabMatchingGeneratedSchema = z.object({
  type: z.literal('vocab_matching'),
  questionText: z.string().min(1),
  payload: z.object({
    /** Model only emits {word}. questions.ts post-maps `word` to the
     *  canonical vocabulary.id, generates a kid-friendly illustration
     *  per pair via Gemini, uploads to R2, and fills in `imageKey` on
     *  the V2 payload. The model does NOT emit a meaning, vocabId, or
     *  imageKey — those are all post-parse responsibilities. */
    pairs: z.array(z.object({
      word: z.string().min(1),
    })).min(4).max(6),
  }),
});

export const SequenceOrderGeneratedSchema = z.object({
  type: z.literal('sequence_order'),
  questionText: z.string().min(1),
  payload: z.object({
    events: z.array(z.string().min(1)).min(4).max(5),
  }),
});

/** What the model emits (vocab pairs without vocabId). */
export const GeneratedQuestionRawSchema = z.discriminatedUnion('type', [
  McqGeneratedSchema,
  VocabMatchingGeneratedSchema,
  SequenceOrderGeneratedSchema,
]);

export const QuestionsOutputSchema = z.object({
  questions: z.array(GeneratedQuestionRawSchema).length(5),
});

export type GeneratedQuestionRaw = z.infer<typeof GeneratedQuestionRawSchema>;
export type QuestionsOutput = z.infer<typeof QuestionsOutputSchema>;

/** What questions.ts returns: same shape as the DB-mirrored payload —
 *  vocab pairs now carry vocabId, and every question gets a stable
 *  orderIndex assigned post-parse. */
export type GeneratedQuestion =
  | {
      type: 'mcq_comprehension';
      questionText: string;
      orderIndex: number;
      payload: { options: string[]; correctIndex: number };
      evidenceQuote: string;
      evidencePageNumber: number;
    }
  | {
      type: 'vocab_matching';
      questionText: string;
      orderIndex: number;
      /** V2 word→picture payload. `version: 2` is the explicit discriminator
       *  the validator uses to reject pre-V2 rows; `imageKey` is filled in by
       *  questions.ts after Gemini generates + R2 upload completes. */
      payload: {
        version: 2;
        pairs: { word: string; vocabId: string; imageKey: string }[];
      };
    }
  | {
      type: 'sequence_order';
      questionText: string;
      orderIndex: number;
      payload: { events: string[] };
    };

export interface GenerateQuestionsInput {
  plan: PassagePlan;
  pages: GeneratedPageProse[];
  /** Target vocab rows. Mandarin translation hint helps the model pick
   *  a kid-friendly meaning; optional because curriculum rows often
   *  don't have it. `isPicturable` is consulted by the vocab_matching
   *  pair safeguard — a non-picturable target reaching this stage is a
   *  bug in the upstream selection filter. */
  targetVocabRows: {
    id: string;
    word: string;
    mandarinTranslation?: string | null;
    isPicturable: boolean;
  }[];
  /** Same cumulative set the prose validator used. `isPicturable`
   *  surfaced here so the vocab_matching pair safeguard can validate
   *  pairs the model picked from the cumulative bucket (function /
   *  scaffold / sibling-curriculum) — those default to picturable but
   *  the curated false set still applies. */
  cumulativeVocabRows: { id: string; word: string; isPicturable: boolean }[];
  readingLevelId: number;
  /** Reserved passage UUID (generated by the orchestrator before this
   *  stage runs). Required because vocab_matching pairs now ship with
   *  R2 image keys keyed by passageId. */
  passageId: string;
  /** Test-pipeline shortcut: skip vocab-pair image generation (Gemini
   *  calls) entirely. Pairs still produce {word, vocabId} but the
   *  imageKey is filled with a sentinel "skipped:vocab-{vocabId}" so
   *  the V2 payload shape stays valid and the validator can recognise
   *  the deliberate skip. Production paths leave this undefined. */
  skipImages?: boolean;
  /** Teacher overrides — Stage 4 honors questionTypeMix overrides so
   *  the per-call output schema enforces the right counts. */
  overrides?: GenerateOverrides;
}

export interface GenerateQuestionsResult {
  questions: GeneratedQuestion[];
  meta: GenerationCallMeta;
  /** vocab_matching pair illustrations. The orchestrator uploads these
   *  to R2 alongside the page-image batch — placing the upload at the
   *  orchestrator level keeps every passage-level upload in a single
   *  parallelised step. Each entry's `key` already matches the
   *  imageKey referenced by the corresponding pair in the V2 payload,
   *  so the orchestrator does not need to patch payloads after upload. */
  vocabImages: {
    /** R2 key — already matches the imageKey on the corresponding pair. */
    key: string;
    buffer: Buffer;
    mimeType: string;
    /** Cross-references for logging — not load-bearing. */
    questionIndex: number;
    pairIndex: number;
    word: string;
    vocabId: string;
  }[];
  /** Number of Gemini calls made for vocab pair images. Surfaced so the
   *  orchestrator can roll it into cost.imageCallsCount. */
  vocabImageCallCount: number;
}

// ---------- Stage 5: question validation ----------

/** All severities are inline per the validator's rules — most are
 *  warnings (post-publish nice-to-fix), errors are reserved for things
 *  that fundamentally break the question (missing evidence, invalid
 *  vocab id, wrong question count, wrong type distribution). */
export type QuestionValidationIssue =
  | { type: 'evidence_not_found'; severity: 'error'; questionIndex: number; evidenceQuote: string }
  | { type: 'evidence_page_mismatch'; severity: 'warning'; questionIndex: number; statedPage: number; foundOnPage: number }
  | { type: 'vocab_id_invalid'; severity: 'error'; questionIndex: number; pairIndex: number; word: string; vocabId: string }
  | { type: 'vocab_word_not_in_targets'; severity: 'warning'; questionIndex: number; pairIndex: number; word: string }
  | { type: 'unknown_word_in_question'; severity: 'warning'; questionIndex: number; word: string }
  | { type: 'unknown_word_in_options'; severity: 'warning'; questionIndex: number; optionIndex: number; word: string }
  | { type: 'question_too_long'; severity: 'warning'; questionIndex: number; wordCount: number; max: number }
  | { type: 'sequence_event_not_in_story'; severity: 'warning'; questionIndex: number; eventIndex: number; event: string }
  | { type: 'wrong_question_count'; severity: 'error'; expected: number; actual: number }
  | { type: 'wrong_type_distribution'; severity: 'error'; got: Record<string, number> }
  /** Pre-V2 vocab_matching payload (word→meaning text). Surfaced as an
   *  error so the review queue flags the passage for regeneration. */
  | { type: 'legacy_vocab_matching_format'; severity: 'error'; questionIndex: number }
  /** V2 pair has a missing or misshapen imageKey — typically a sign
   *  questions.ts skipped the upload step. */
  | { type: 'pair_image_key_invalid'; severity: 'error'; questionIndex: number; pairIndex: number; imageKey: string };

export interface QuestionValidationStats {
  mcqCount: number;
  vocabMatchingCount: number;
  sequenceOrderCount: number;
}

export interface QuestionValidationResult {
  /** True iff errorCount === 0. Same semantic as prose validator. */
  valid: boolean;
  errorCount: number;
  warningCount: number;
  /** Same formula as prose: max(0, 1 - 0.2·err - 0.05·warn). */
  qualityScore: number;
  issues: QuestionValidationIssue[];
  stats: QuestionValidationStats;
}

// ---------- Stage 5: page image generation ----------

/** Visual style applied to every page's image prompt. The `promptSuffix`
 *  is appended verbatim — house-style instructions, illustration medium,
 *  and the all-important "no text/words/letters" repetition that keeps
 *  Gemini from generating garbled English in panels. */
export interface ImageStyle {
  promptSuffix: string;
  /** For future flexibility — not all aspect ratios may be supported by
   *  the underlying model in v1. */
  aspectRatio?: '1:1' | '16:9' | '4:3';
}

export interface GeneratedPageImage {
  pageNumber: number;
  buffer: Buffer;
  mimeType: string;
  /** The full text prompt the model received. Persisted for debugging
   *  and for one-page regeneration without re-running the orchestrator. */
  promptUsed: string;
  /** false for page 1 (cold generation); true for pages 2..N which were
   *  generated with page 1's buffer as a reference image input for
   *  character consistency. */
  referenceImageUsed: boolean;
}

export interface GeneratePassageImagesInput {
  plan: PassagePlan;
  pages: GeneratedPageProse[];
  /** If omitted, DEFAULT_IMAGE_STYLE in images.ts applies. */
  style?: ImageStyle;
}

export interface GeneratePassageImagesResult {
  pages: GeneratedPageImage[];
  /** v1 reuses page 1 as the cover; this field is reserved for a
   *  future pass that generates a dedicated thumbnail. */
  coverImage?: GeneratedPageImage;
  meta: {
    model: string;
    totalDurationMs: number;
    perPageDurationMs: number[];
  };
}

/** Image-validation issues. Synchronous, no API calls — only checks
 *  that buffers exist and look plausible (size + mime). We don't
 *  validate that the image *depicts the scene correctly*; that needs
 *  a vision model and is handled by the human review queue. */
export type ImageValidationIssue =
  | { type: 'image_buffer_empty'; severity: 'error'; pageNumber: number }
  | { type: 'image_too_small'; severity: 'warning'; pageNumber: number; sizeBytes: number }
  | { type: 'image_too_large'; severity: 'warning'; pageNumber: number; sizeBytes: number }
  | { type: 'image_count_mismatch'; severity: 'error'; expected: number; actual: number }
  | { type: 'mime_type_unexpected'; severity: 'warning'; pageNumber: number; mimeType: string };

export interface ImageValidationResult {
  valid: boolean;
  errorCount: number;
  warningCount: number;
  qualityScore: number;
  issues: ImageValidationIssue[];
}
