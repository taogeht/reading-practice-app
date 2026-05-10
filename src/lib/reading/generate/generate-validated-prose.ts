// Stages 2 + 3 with a regeneration loop on validation failures.
//
// The orchestrator: produce prose with generatePagesProse, run
// validatePagesProse, and on failure feed the issues back into a
// follow-up prose call (generatePagesProseWithFeedback). Up to
// maxAttempts iterations; if we still fail, return the best attempt
// (fewest issues, ties broken by latest attemptNumber so feedback-
// informed regens win the tie).
//
// Per-page regeneration was considered and rejected for v1 — whole-prose
// regen handles cross-page concerns (missing target word, repeated
// unknown words across pages) without orchestration overhead. Per-page
// is a future optimization if/when the cost difference matters.
//
// Auto-retry on transport errors (rate limits, timeouts) is OUT of scope
// here — those belong to a transport wrapper around the Anthropic client,
// not this validation-driven loop.

import { logInfo } from '@/lib/logger';
import {
  generatePagesProse,
  generatePagesProseWithFeedback,
} from './prose';
import { validatePagesProse } from './validate';
import {
  type AttemptRecord,
  type GenerateValidatedProseInput,
  type GenerateValidatedProseResult,
  type GeneratedPageProse,
  type PassagePlan,
  type ProseFeedback,
  type ValidationIssue,
  type ValidationResult,
} from './types';
import { fetchTargetVocab, resolveCumulativeVocab } from './vocab';
import { getReadingLevel, type ReadingLevel } from '@/lib/reading/levels';

const DEFAULT_MAX_ATTEMPTS = 3;

export async function generateValidatedProse(
  input: GenerateValidatedProseInput,
): Promise<GenerateValidatedProseResult> {
  const maxAttempts = Math.max(1, input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const level = getReadingLevel(input.readingLevelId);

  // Resolve target + cumulative vocab ONCE so every attempt validates
  // against the same allowlist; otherwise the validator could see
  // slightly different cumulative sets across attempts if the DB shifts.
  const targetIds = uniqueIdsFromPlan(input.plan);
  if (targetIds.length === 0) {
    throw new Error('PassagePlan has no target vocabulary across any page');
  }
  const targetRows = await fetchTargetVocab(targetIds);
  const cumulativeRows = await resolveCumulativeVocab(
    targetRows,
    input.cumulativeVocabIds,
  );
  const targetIdentities = targetRows.map((r) => ({ id: r.id, word: r.word }));
  const cumulativeIdentities = cumulativeRows.map((r) => ({
    id: r.id,
    word: r.word,
  }));

  const attempts: AttemptRecord[] = [];
  let lastFeedback: ProseFeedback | null = null;

  for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber++) {
    const proseResult = lastFeedback
      ? await generatePagesProseWithFeedback(
          {
            plan: input.plan,
            readingLevelId: input.readingLevelId,
            cumulativeVocabIds: input.cumulativeVocabIds,
          },
          lastFeedback,
        )
      : await generatePagesProse({
          plan: input.plan,
          readingLevelId: input.readingLevelId,
          cumulativeVocabIds: input.cumulativeVocabIds,
        });

    const validation = validatePagesProse(
      proseResult.pages,
      input.plan,
      input.readingLevelId,
      cumulativeIdentities,
      targetIdentities,
    );

    const record: AttemptRecord = {
      attemptNumber,
      pages: proseResult.pages,
      validation,
      durationMs: proseResult.meta.durationMs,
      inputTokens: proseResult.meta.inputTokens,
      outputTokens: proseResult.meta.outputTokens,
    };
    attempts.push(record);

    logInfo(
      `regen attempt ${attemptNumber} complete`,
      `lib/reading/generate/regen attempt=${attemptNumber} ` +
        `issues=${validation.issues.length} ` +
        `model=${proseResult.meta.model} ` +
        `input_tokens=${record.inputTokens} ` +
        `output_tokens=${record.outputTokens} ` +
        `duration_ms=${record.durationMs}`,
    );

    if (validation.valid) {
      return finalize(attempts, true);
    }
    if (attemptNumber === maxAttempts) {
      return finalize(attempts, false);
    }
    lastFeedback = buildFeedback(proseResult.pages, validation, level);
  }

  // Unreachable — the loop body always returns. Kept as a satisfy-the-
  // type-checker line and a safety net if maxAttempts ever ends up <= 0
  // (clamped above) or the loop body changes.
  return finalize(attempts, false);
}

// ---------- Helpers ----------

function finalize(
  attempts: AttemptRecord[],
  success: boolean,
): GenerateValidatedProseResult {
  const best = pickBestAttempt(attempts);
  const totalDurationMs = attempts.reduce((s, a) => s + a.durationMs, 0);
  const totalInputTokens = attempts.reduce((s, a) => s + a.inputTokens, 0);
  const totalOutputTokens = attempts.reduce((s, a) => s + a.outputTokens, 0);

  if (success) {
    logInfo(
      `regen final: success`,
      `lib/reading/generate/regen final attempts=${attempts.length} ` +
        `final_issues=${best.validation.issues.length} ` +
        `success=true ` +
        `total_input_tokens=${totalInputTokens} ` +
        `total_output_tokens=${totalOutputTokens} ` +
        `total_duration_ms=${totalDurationMs}`,
    );
  } else {
    logInfo(
      `regen final: giving up after maxAttempts`,
      `lib/reading/generate/regen final attempts=${attempts.length} ` +
        `final_issues=${best.validation.issues.length} ` +
        `success=false ` +
        `total_input_tokens=${totalInputTokens} ` +
        `total_output_tokens=${totalOutputTokens} ` +
        `total_duration_ms=${totalDurationMs}`,
    );
  }

  return {
    success,
    finalPages: best.pages,
    finalValidation: best.validation,
    attempts,
    totalDurationMs,
    totalInputTokens,
    totalOutputTokens,
  };
}

/** Best = highest qualityScore (errors weighted 4× warnings). Ties broken
 *  by latest attemptNumber so a regen that tied with attempt 1 still
 *  wins — the regen had explicit feedback and is more likely to have
 *  fixed *some* issues even if the score tied, and it's the one we want
 *  to publish. Score-based selection naturally handles the case where
 *  a regen swapped 2 errors for 5 warnings (0.60 → 0.75). */
function pickBestAttempt(attempts: AttemptRecord[]): AttemptRecord {
  let best = attempts[0]!;
  for (const a of attempts) {
    const aScore = a.validation.qualityScore;
    const bScore = best.validation.qualityScore;
    if (aScore > bScore) {
      best = a;
    } else if (aScore === bScore && a.attemptNumber > best.attemptNumber) {
      best = a;
    }
  }
  return best;
}

/** Convert a ValidationResult into the structured ProseFeedback that
 *  generatePagesProseWithFeedback consumes. Issues are bucketed by type
 *  so the prompt builder can render them under appropriately framed
 *  headers; the wordcount window for pages is widened to the level's
 *  full min/max range so the prompt can be specific about the target. */
function buildFeedback(
  previousAttemptPages: GeneratedPageProse[],
  validation: ValidationResult,
  level: ReadingLevel,
): ProseFeedback {
  // unknown_word severity is set-wide (validate.ts assigns the same
  // severity to every unknown_word issue based on the distinct count);
  // we collect per-word page lists and read severity from any one
  // matching issue at the end.
  const unknownWordsMap = new Map<string, Set<number>>();
  let unknownSeverity: 'error' | 'warning' = 'warning';
  const sentencesTooLong: ProseFeedback['issuesByType']['sentencesTooLong'] = [];
  const pagesOutOfRange: ProseFeedback['issuesByType']['pagesOutOfRange'] = [];
  const missingTargetWords: ProseFeedback['issuesByType']['missingTargetWords'] = [];
  const forbiddenConstructions: ProseFeedback['issuesByType']['forbiddenConstructions'] =
    [];

  for (const issue of validation.issues) {
    if (issue.type === 'unknown_word') {
      // Capture the set-wide severity once.
      unknownSeverity = issue.severity;
    }
    routeIssue(issue, {
      unknownWordsMap,
      sentencesTooLong,
      pagesOutOfRange,
      missingTargetWords,
      forbiddenConstructions,
      level,
    });
  }

  return {
    previousAttemptPages,
    issuesByType: {
      unknownWords: Array.from(unknownWordsMap.entries()).map(([word, pages]) => ({
        word,
        pageNumbers: Array.from(pages).sort((a, b) => a - b),
        severity: unknownSeverity,
      })),
      sentencesTooLong,
      pagesOutOfRange,
      missingTargetWords,
      forbiddenConstructions,
    },
  };
}

interface IssueBuckets {
  unknownWordsMap: Map<string, Set<number>>;
  sentencesTooLong: ProseFeedback['issuesByType']['sentencesTooLong'];
  pagesOutOfRange: ProseFeedback['issuesByType']['pagesOutOfRange'];
  missingTargetWords: ProseFeedback['issuesByType']['missingTargetWords'];
  forbiddenConstructions: ProseFeedback['issuesByType']['forbiddenConstructions'];
  level: ReadingLevel;
}

function routeIssue(issue: ValidationIssue, b: IssueBuckets): void {
  switch (issue.type) {
    case 'unknown_word': {
      let pages = b.unknownWordsMap.get(issue.word);
      if (!pages) {
        pages = new Set<number>();
        b.unknownWordsMap.set(issue.word, pages);
      }
      pages.add(issue.pageNumber);
      return;
    }
    case 'sentence_too_long':
      b.sentencesTooLong.push({
        pageNumber: issue.pageNumber,
        sentence: issue.sentence,
        wordCount: issue.wordCount,
        max: issue.maxAllowed,
        severity: issue.severity,
      });
      return;
    case 'page_too_short':
      b.pagesOutOfRange.push({
        pageNumber: issue.pageNumber,
        wordCount: issue.wordCount,
        min: issue.minRequired,
        max: b.level.wordsPerPage.max,
        severity: issue.severity,
      });
      return;
    case 'page_too_long':
      b.pagesOutOfRange.push({
        pageNumber: issue.pageNumber,
        wordCount: issue.wordCount,
        min: b.level.wordsPerPage.min,
        max: issue.maxAllowed,
        severity: issue.severity,
      });
      return;
    case 'target_word_missing':
      b.missingTargetWords.push({ word: issue.word, severity: issue.severity });
      return;
    case 'forbidden_construction':
      b.forbiddenConstructions.push({
        pageNumber: issue.pageNumber,
        sentence: issue.sentence,
        reason: issue.reason,
        severity: issue.severity,
      });
      return;
  }
}

function uniqueIdsFromPlan(plan: PassagePlan): string[] {
  const seen = new Set<string>();
  for (const p of plan.pages) {
    for (const id of p.targetVocabUsed) seen.add(id);
  }
  return Array.from(seen);
}
