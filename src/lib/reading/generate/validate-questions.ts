// Stage 5 of the reading-passage generation pipeline: deterministic
// validation of the questions Stage 4 produced.
//
// Pure function — no API calls, no DB writes. Caller passes the
// questions, the prose pages they reference, the target vocab, the
// cumulative vocab the prose stage was given, the reading level, and
// the passageId (needed to validate vocab_matching V2 imageKey shape).
// Returns a per-issue list with severities + an aggregate qualityScore
// using the same formula as the prose validator (1 - 0.2·err - 0.05·warn).
//
// Issue routing:
//   - evidence_not_found / vocab_id_invalid / wrong_question_count /
//     wrong_type_distribution / legacy_vocab_matching_format /
//     pair_image_key_invalid → error (gate publish)
//   - everything else (page mismatch, vocab not in targets, unknown
//     words in question/option, oversized question, sequence event
//     drift) → warning (nice-to-fix)
//
// Vocab-matching's "pair must be a target OR a cumulative word in the
// story" rule depends on knowing which words actually appear in the
// prose. We collect that set by lowercasing every prose token; that
// also gives us character names "for free" so question-vocab checks
// don't flag "Sally" as unknown.

import {
  getReadingLevel,
  type EffectiveReadingLevel,
} from '@/lib/reading/levels';
import { tokenizeStoryText } from './tokenize';
import type {
  GeneratedPageProse,
  GeneratedQuestion,
  QuestionValidationIssue,
  QuestionValidationResult,
} from './types';

interface VocabIdentity {
  id: string;
  word: string;
}

// Question quotas are now per-level — sourced from getQuestionTypeMix
// at validation time instead of hardcoded. Total stays at 5 across
// every level, so the count check itself is level-agnostic.
const TOTAL_QUESTIONS = 5;
const SEQUENCE_EVENT_MATCH_THRESHOLD = 0.6;

// Compact closed-class set used to filter content words for the
// sequence-event story-coverage heuristic. Not the full function-word
// list (we don't have DB access here); just enough to strip the most
// common no-information tokens. Anything else falls through and
// contributes to the content-word ratio.
const SEQUENCE_HEURISTIC_FUNCTION_WORDS = new Set([
  'a','an','the',
  'is','are','was','were','be','been','being','am',
  'do','does','did','have','has','had',
  'i','you','he','she','it','we','they','me','him','her','us','them',
  'my','your','his','its','our','their',
  'this','that','these','those',
  'and','or','but','so','if',
  'of','to','in','on','at','for','with','by','from','as','into','onto',
  'up','down','over','under','through',
  'will','would','can','could',
  'no','not',
]);

const PUNCTUATION_TRIM = /^[.,?!"'`;:—–\-(){}\[\]…]+|[.,?!"'`;:—–\-(){}\[\]…]+$/g;

export function validateQuestions(
  questions: GeneratedQuestion[],
  pages: GeneratedPageProse[],
  targetVocabRows: VocabIdentity[],
  cumulativeVocabRows: VocabIdentity[],
  readingLevelId: number,
  passageId: string,
  /** Effective level with overrides applied — when present, drives the
   *  type-mix and sentence-length checks. Without this, the validator
   *  uses the base level and disagrees with Stage 4's schema whenever a
   *  teacher overrode questionTypeMix or maxSentenceWords. */
  effectiveLevel?: EffectiveReadingLevel,
): QuestionValidationResult {
  const level = effectiveLevel ?? getReadingLevel(readingLevelId);
  const issues: QuestionValidationIssue[] = [];

  // ---- Type distribution checks (run first; nothing else makes sense
  // when these fail, but we still finish the per-question loop so the
  // model sees all the issues if used in a future regen) ----
  const typeCounts: Record<string, number> = {
    mcq_comprehension: 0,
    vocab_matching: 0,
    sequence_order: 0,
  };
  for (const q of questions) typeCounts[q.type] = (typeCounts[q.type] ?? 0) + 1;

  if (questions.length !== TOTAL_QUESTIONS) {
    issues.push({
      type: 'wrong_question_count',
      severity: 'error',
      expected: TOTAL_QUESTIONS,
      actual: questions.length,
    });
  }

  // Per-level expected mix. Reads from the effective level so teacher
  // overrides to questionTypeMix flow through; falls back to the base
  // level via getReadingLevel above when no effective level is passed.
  const expectedMix = level.questionTypeMix;
  if (
    typeCounts.mcq_comprehension !== expectedMix.mcq_comprehension ||
    typeCounts.vocab_matching !== expectedMix.vocab_matching ||
    typeCounts.sequence_order !== expectedMix.sequence_order
  ) {
    issues.push({
      type: 'wrong_type_distribution',
      severity: 'error',
      got: { ...typeCounts },
    });
  }

  // ---- Build the "story tokens" set: every distinct lowercase token
  // appearing in the prose, edge punctuation stripped. Auto-includes
  // character names + any vocab that leaked through the prose validator. ----
  const storyTokens = new Set<string>();
  for (const page of pages) {
    for (const raw of page.text.split(/\s+/)) {
      const tok = raw.replace(PUNCTUATION_TRIM, '').toLowerCase();
      if (tok) storyTokens.add(tok);
    }
  }

  // Known-vocab set for the tokenizer's morphology lookups: the standard
  // cumulative + target rows, plus every story token as an ID-less entry
  // (handles character names + any prose-introduced lemmas).
  const knownVocab = [
    ...cumulativeVocabRows,
    ...targetVocabRows,
    ...Array.from(storyTokens).map((w) => ({ word: w })),
  ];

  // Lookup tables for vocab_matching validation.
  const vocabIdToWord = new Map<string, string>();
  const targetIdSet = new Set<string>();
  for (const r of cumulativeVocabRows) {
    vocabIdToWord.set(r.id, r.word);
  }
  for (const r of targetVocabRows) {
    vocabIdToWord.set(r.id, r.word);
    targetIdSet.add(r.id);
  }

  // ---- Per-question checks ----
  for (let qIdx = 0; qIdx < questions.length; qIdx++) {
    const q = questions[qIdx]!;

    // Question-text vocab.
    const qTokens = tokenizeStoryText(q.questionText, knownVocab);
    const qUnseen = new Set<string>();
    for (const u of qTokens.unmatched) {
      if (qUnseen.has(u)) continue;
      qUnseen.add(u);
      issues.push({
        type: 'unknown_word_in_question',
        severity: 'warning',
        questionIndex: qIdx,
        word: u,
      });
    }

    // Question-text length cap.
    const qWordCount = countWords(q.questionText);
    if (qWordCount > level.maxSentenceWords) {
      issues.push({
        type: 'question_too_long',
        severity: 'warning',
        questionIndex: qIdx,
        wordCount: qWordCount,
        max: level.maxSentenceWords,
      });
    }

    // Type-specific checks.
    if (q.type === 'mcq_comprehension') {
      validateMcq(q, qIdx, pages, knownVocab, issues);
    } else if (q.type === 'vocab_matching') {
      validateVocabMatching(
        q,
        qIdx,
        passageId,
        targetIdSet,
        vocabIdToWord,
        storyTokens,
        issues,
      );
    } else {
      validateSequenceOrder(q, qIdx, storyTokens, issues);
    }
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const qualityScore = Math.max(0, 1.0 - errorCount * 0.2 - warningCount * 0.05);

  return {
    valid: errorCount === 0,
    errorCount,
    warningCount,
    qualityScore,
    issues,
    stats: {
      mcqCount: typeCounts.mcq_comprehension ?? 0,
      vocabMatchingCount: typeCounts.vocab_matching ?? 0,
      sequenceOrderCount: typeCounts.sequence_order ?? 0,
    },
  };
}

// ---------- Per-type validators ----------

function validateMcq(
  q: Extract<GeneratedQuestion, { type: 'mcq_comprehension' }>,
  qIdx: number,
  pages: GeneratedPageProse[],
  knownVocab: { id?: string; word: string }[],
  issues: QuestionValidationIssue[],
): void {
  // Evidence quote — exact verbatim substring of some page.
  const found = pages.find((p) => p.text.includes(q.evidenceQuote));
  if (!found) {
    issues.push({
      type: 'evidence_not_found',
      severity: 'error',
      questionIndex: qIdx,
      evidenceQuote: q.evidenceQuote,
    });
  } else if (found.pageNumber !== q.evidencePageNumber) {
    issues.push({
      type: 'evidence_page_mismatch',
      severity: 'warning',
      questionIndex: qIdx,
      statedPage: q.evidencePageNumber,
      foundOnPage: found.pageNumber,
    });
  }

  // Option vocab — same morphology-aware check as question text, dedup
  // unknowns per option so a repeated unmatched word doesn't double-fire.
  for (let oIdx = 0; oIdx < q.payload.options.length; oIdx++) {
    const tokens = tokenizeStoryText(q.payload.options[oIdx]!, knownVocab);
    const seen = new Set<string>();
    for (const u of tokens.unmatched) {
      if (seen.has(u)) continue;
      seen.add(u);
      issues.push({
        type: 'unknown_word_in_options',
        severity: 'warning',
        questionIndex: qIdx,
        optionIndex: oIdx,
        word: u,
      });
    }
  }
}

function validateVocabMatching(
  q: Extract<GeneratedQuestion, { type: 'vocab_matching' }>,
  qIdx: number,
  passageId: string,
  targetIdSet: Set<string>,
  vocabIdToWord: Map<string, string>,
  storyTokens: Set<string>,
  issues: QuestionValidationIssue[],
): void {
  // Legacy detection — V2 payloads carry version === 2; pre-V2 rows
  // either lack the field or have a value other than 2. The TS type
  // narrowing above already restricts q.payload to the V2 shape, but
  // the actual jsonb on disk for an old row may not match — so we
  // probe at runtime via an unknown cast and bail before further
  // checks since a V1 row's `pairs` shape is incompatible.
  const rawPayload = q.payload as unknown as {
    version?: unknown;
    pairs?: unknown;
  };
  if (rawPayload.version !== 2) {
    issues.push({
      type: 'legacy_vocab_matching_format',
      severity: 'error',
      questionIndex: qIdx,
    });
    return;
  }

  for (let pIdx = 0; pIdx < q.payload.pairs.length; pIdx++) {
    const pair = q.payload.pairs[pIdx]!;

    // vocabId existence + word match. An empty vocabId means
    // questions.ts couldn't map the model's word to a known row;
    // either way the pair fails the existence check.
    const canonicalWord = pair.vocabId ? vocabIdToWord.get(pair.vocabId) : undefined;
    const idValid = canonicalWord !== undefined;
    const wordMatches =
      idValid && canonicalWord!.toLowerCase().trim() === pair.word.toLowerCase().trim();

    if (!idValid || !wordMatches) {
      issues.push({
        type: 'vocab_id_invalid',
        severity: 'error',
        questionIndex: qIdx,
        pairIndex: pIdx,
        word: pair.word,
        vocabId: pair.vocabId,
      });
      // Skip the rest of this pair's checks — the data we'd test against
      // isn't trustworthy.
      continue;
    }

    // imageKey shape — must match the canonical
    // story-images/{passageId}/vocab-{vocabId}.png path. A missing or
    // wrong key signals questions.ts skipped the upload step, so the
    // student would see a broken image; we surface as an error.
    //
    // Exception: under --skip-images the orchestrator deliberately
    // writes a "skipped:vocab-{vocabId}" sentinel. Those rows are test
    // artifacts (status='draft') and the V2 shape is otherwise valid;
    // we accept the sentinel so the validator doesn't false-flag.
    const expectedKey = `story-images/${passageId}/vocab-${pair.vocabId}.png`;
    const expectedSentinel = `skipped:vocab-${pair.vocabId}`;
    const keyOk =
      typeof pair.imageKey === 'string' &&
      pair.imageKey.length > 0 &&
      (pair.imageKey === expectedKey || pair.imageKey === expectedSentinel);
    if (!keyOk) {
      issues.push({
        type: 'pair_image_key_invalid',
        severity: 'error',
        questionIndex: qIdx,
        pairIndex: pIdx,
        imageKey: pair.imageKey ?? '',
      });
    }

    // Target preference: ideal pair is a target word; cumulative is OK
    // if the word actually appears in the story. Otherwise warn.
    const isTarget = targetIdSet.has(pair.vocabId);
    if (!isTarget) {
      const wordInStory = storyTokens.has(pair.word.toLowerCase().trim());
      if (!wordInStory) {
        issues.push({
          type: 'vocab_word_not_in_targets',
          severity: 'warning',
          questionIndex: qIdx,
          pairIndex: pIdx,
          word: pair.word,
        });
      }
    }

    // Meaning vocab check is gone — V2 pairs have no meaning text, so
    // there is nothing to tokenize. Picture quality is verified by the
    // teacher in the review queue.
  }
}

function validateSequenceOrder(
  q: Extract<GeneratedQuestion, { type: 'sequence_order' }>,
  qIdx: number,
  storyTokens: Set<string>,
  issues: QuestionValidationIssue[],
): void {
  // For each event: split into content-word tokens (filter out the small
  // function-word set), check what fraction appear in storyTokens. Below
  // 60% → the event probably doesn't describe something in the story.
  for (let eIdx = 0; eIdx < q.payload.events.length; eIdx++) {
    const event = q.payload.events[eIdx]!;
    const eventTokens = event
      .split(/\s+/)
      .map((t) => t.replace(PUNCTUATION_TRIM, '').toLowerCase())
      .filter((t) => t.length > 0)
      .filter((t) => !SEQUENCE_HEURISTIC_FUNCTION_WORDS.has(t));
    if (eventTokens.length === 0) continue;

    let matched = 0;
    for (const t of eventTokens) {
      if (storyTokens.has(t)) matched++;
    }
    const ratio = matched / eventTokens.length;
    if (ratio < SEQUENCE_EVENT_MATCH_THRESHOLD) {
      issues.push({
        type: 'sequence_event_not_in_story',
        severity: 'warning',
        questionIndex: qIdx,
        eventIndex: eIdx,
        event,
      });
    }
  }
}

// ---------- Helpers ----------

function countWords(s: string): number {
  return s
    .split(/\s+/)
    .filter((t) => /[A-Za-z0-9]/.test(t))
    .length;
}
