// Stage 3 of the reading-passage generation pipeline: deterministic
// validation of the prose Stage 2 produced.
//
// This file is pure — no API calls, no DB writes, no side effects.
// Caller passes everything in (the prose pages, the plan, the level id,
// the cumulative vocab rows the model was told it could use, and the
// target vocab rows). The function reports issues; it does NOT regenerate.
//
// Severity model:
//   - error:   gates publish; the regen loop continues on these.
//   - warning: nice-to-fix; doesn't gate. valid = errorCount === 0.
//
// Per-issue-type severity rules:
//   unknown_word        — 1-2 distinct unknowns story-wide → warning,
//                         3+ → error (two-pass: count first, then
//                         re-emit each issue with the correct severity).
//   sentence_too_long   — over by 1-2 words → warning, 3+ → error.
//   page_too_short/long — within 20% of the limit → warning, >20% → error.
//   target_word_missing — always error.
//   forbidden_construction — always error.

import { getReadingLevel } from '@/lib/reading/levels';
import { tokenizeStoryText } from './tokenize';
import type {
  GeneratedPageProse,
  IssueSeverity,
  PassagePlan,
  ValidationIssue,
  ValidationResult,
} from './types';

interface VocabIdentity {
  id: string;
  word: string;
}

const UNKNOWN_WORD_WARNING_TIER = 2; // 1-2 distinct unknowns = warning; 3+ = error
const SENTENCE_OVER_WARNING_TIER = 2; // 1-2 words over = warning; 3+ = error
const PAGE_RANGE_WARNING_PCT = 0.2;   // within 20% of the cap = warning

export function validatePagesProse(
  pages: GeneratedPageProse[],
  plan: PassagePlan,
  readingLevelId: number,
  cumulativeVocabRows: VocabIdentity[],
  targetVocabRows: VocabIdentity[],
): ValidationResult {
  const level = getReadingLevel(readingLevelId);

  // Augment the known-vocab set with character names (proper nouns the
  // model is allowed to use). They have no DB id, but the tokenizer
  // accepts entries without one.
  const characterNameRows = plan.characters.map((c) => ({
    word: c.name.trim(),
  }));
  const knownVocab = [
    ...cumulativeVocabRows,
    ...targetVocabRows,
    ...characterNameRows,
  ];

  const targetIdsSeen = new Set<string>();
  const targetIdToWord = new Map(targetVocabRows.map((r) => [r.id, r.word]));

  let totalWords = 0;
  const uniqueWords = new Set<string>();
  const perPageWordCount: number[] = [];
  let longestSentenceWords = 0;

  // ---- Pass 1: tokenize all pages, collect raw findings ----
  // We can't decide unknown_word severity until we know the distinct-
  // unknown count across the whole story (the tier rule is global, not
  // per-page). So we collect everything first, then apply severities.

  interface RawUnknownFinding {
    pageNumber: number;
    word: string;
    sentence: string;
  }
  interface RawSentenceFinding {
    pageNumber: number;
    sentence: string;
    wordCount: number;
  }
  interface RawPageRangeFinding {
    pageNumber: number;
    wordCount: number;
    direction: 'too_short' | 'too_long';
  }
  interface RawForbiddenFinding {
    pageNumber: number;
    sentence: string;
    reason: string;
  }

  const rawUnknownFindings: RawUnknownFinding[] = [];
  const rawSentenceFindings: RawSentenceFinding[] = [];
  const rawPageRangeFindings: RawPageRangeFinding[] = [];
  const rawForbiddenFindings: RawForbiddenFinding[] = [];

  for (const page of pages) {
    const tokens = tokenizeStoryText(page.text, knownVocab);
    perPageWordCount.push(tokens.totalTokens);
    totalWords += tokens.totalTokens;

    for (const m of tokens.matched) {
      uniqueWords.add(m.word);
      if (m.vocabId && targetIdToWord.has(m.vocabId)) {
        targetIdsSeen.add(m.vocabId);
      }
    }
    for (const u of tokens.unmatched) {
      uniqueWords.add(u);
    }

    const sentences = splitSentences(page.text);
    const unmatchedSeenOnPage = new Set<string>();
    for (const u of tokens.unmatched) {
      if (unmatchedSeenOnPage.has(u)) continue;
      unmatchedSeenOnPage.add(u);
      const containing = findSentenceContaining(sentences, u) ?? page.text.trim();
      rawUnknownFindings.push({
        pageNumber: page.pageNumber,
        word: u,
        sentence: trimForReport(containing),
      });
    }

    for (const s of sentences) {
      const wc = countSentenceWords(s);
      if (wc > longestSentenceWords) longestSentenceWords = wc;
      if (wc > level.maxSentenceWords) {
        rawSentenceFindings.push({
          pageNumber: page.pageNumber,
          sentence: trimForReport(s),
          wordCount: wc,
        });
      }
    }

    if (tokens.totalTokens < level.wordsPerPage.min) {
      rawPageRangeFindings.push({
        pageNumber: page.pageNumber,
        wordCount: tokens.totalTokens,
        direction: 'too_short',
      });
    } else if (tokens.totalTokens > level.wordsPerPage.max) {
      rawPageRangeFindings.push({
        pageNumber: page.pageNumber,
        wordCount: tokens.totalTokens,
        direction: 'too_long',
      });
    }

    if (!level.grammarConstraints.allowContractions) {
      const contractionRe = /\b\w+'\w+\b/g;
      const seenContractions = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = contractionRe.exec(page.text)) !== null) {
        const found = m[0];
        if (seenContractions.has(found.toLowerCase())) continue;
        seenContractions.add(found.toLowerCase());
        const containing = findSentenceContaining(sentences, found) ?? page.text;
        rawForbiddenFindings.push({
          pageNumber: page.pageNumber,
          sentence: trimForReport(containing),
          reason: `Contractions not allowed at level ${level.id} (found "${found}")`,
        });
      }
    }
  }

  // ---- Pass 2: assign severity using global thresholds and emit ----

  const issues: ValidationIssue[] = [];

  // unknown_word: severity is set-wide based on distinct unknowns.
  const distinctUnknowns = new Set(rawUnknownFindings.map((f) => f.word)).size;
  const unknownSeverity: IssueSeverity =
    distinctUnknowns <= UNKNOWN_WORD_WARNING_TIER ? 'warning' : 'error';
  for (const f of rawUnknownFindings) {
    issues.push({
      type: 'unknown_word',
      severity: unknownSeverity,
      pageNumber: f.pageNumber,
      word: f.word,
      sentence: f.sentence,
    });
  }

  // sentence_too_long: severity per sentence based on overshoot.
  for (const f of rawSentenceFindings) {
    const overBy = f.wordCount - level.maxSentenceWords;
    issues.push({
      type: 'sentence_too_long',
      severity: overBy <= SENTENCE_OVER_WARNING_TIER ? 'warning' : 'error',
      pageNumber: f.pageNumber,
      sentence: f.sentence,
      wordCount: f.wordCount,
      maxAllowed: level.maxSentenceWords,
    });
  }

  // page_too_short / page_too_long: severity by deviation %.
  for (const f of rawPageRangeFindings) {
    if (f.direction === 'too_short') {
      const min = level.wordsPerPage.min;
      const deviation = (min - f.wordCount) / min;
      issues.push({
        type: 'page_too_short',
        severity: deviation <= PAGE_RANGE_WARNING_PCT ? 'warning' : 'error',
        pageNumber: f.pageNumber,
        wordCount: f.wordCount,
        minRequired: min,
      });
    } else {
      const max = level.wordsPerPage.max;
      const deviation = (f.wordCount - max) / max;
      issues.push({
        type: 'page_too_long',
        severity: deviation <= PAGE_RANGE_WARNING_PCT ? 'warning' : 'error',
        pageNumber: f.pageNumber,
        wordCount: f.wordCount,
        maxAllowed: max,
      });
    }
  }

  // forbidden_construction: always error.
  for (const f of rawForbiddenFindings) {
    issues.push({
      type: 'forbidden_construction',
      severity: 'error',
      pageNumber: f.pageNumber,
      sentence: f.sentence,
      reason: f.reason,
    });
  }

  // Target word coverage — always error (the plan committed to using
  // each target word; missing one is a real defect, not a stylistic nit).
  const targetCoverage = targetVocabRows.map((t) => ({
    vocabId: t.id,
    word: t.word,
    covered: targetIdsSeen.has(t.id),
  }));
  for (const tc of targetCoverage) {
    if (!tc.covered) {
      issues.push({
        type: 'target_word_missing',
        severity: 'error',
        word: tc.word,
        vocabId: tc.vocabId,
      });
    }
  }

  // Aggregate counts + qualityScore. Errors are 4× more punitive than
  // warnings so a story with 5 warnings (qualityScore 0.75) still beats
  // one with 2 errors (0.60) — matches intuition.
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const qualityScore = Math.max(
    0,
    1.0 - errorCount * 0.2 - warningCount * 0.05,
  );

  return {
    valid: errorCount === 0,
    issues,
    errorCount,
    warningCount,
    qualityScore,
    stats: {
      totalWords,
      uniqueWords: uniqueWords.size,
      targetCoverage,
      perPageWordCount,
      longestSentenceWords,
    },
  };
}

// ---------- Sentence helpers ----------

/** Split text into sentences on .!? followed by whitespace (or end of
 *  string). Handles the common case; intentionally not perfect — abbrevs
 *  like "Mr." or "U.S." don't appear in the level-1..5 vocab so we don't
 *  need to handle them yet. */
function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Word count for a single sentence. A "word" is a whitespace token that
 *  contains at least one alphanumeric character (so trailing "." or
 *  standalone punctuation doesn't inflate the count). */
function countSentenceWords(sentence: string): number {
  return sentence
    .split(/\s+/)
    .filter((t) => /[A-Za-z0-9]/.test(t))
    .length;
}

function findSentenceContaining(sentences: string[], needle: string): string | undefined {
  const lower = needle.toLowerCase();
  return sentences.find((s) => s.toLowerCase().includes(lower));
}

/** Cap report sentence length so a malformed paragraph doesn't blow up
 *  the issue payload. */
function trimForReport(s: string, max = 200): string {
  const trimmed = s.trim();
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max) + '…';
}
