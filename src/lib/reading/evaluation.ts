import type { GeneratePassageResult } from './generate/passage';

export interface StoryGenerationSample {
  caseId: string;
  readingLevelId: number;
  result: GeneratePassageResult;
}

export interface StoryEvaluationThresholds {
  minimumContentReadyRate: number;
  maximumFailureRate: number;
  minimumMeanProseScore: number;
  minimumMeanQuestionsScore: number;
}

export interface StoryEvaluationGate {
  metric: keyof StoryEvaluationThresholds;
  passed: boolean;
  actual: number;
  expected: number;
  comparison: 'at_least' | 'at_most';
}

export interface StoryGenerationEvaluation {
  passed: boolean;
  sampleCount: number;
  contentReadyCount: number;
  contentReadyRate: number;
  failureRate: number;
  meanProseScore: number;
  meanQuestionsScore: number;
  p50TotalMs: number;
  p95TotalMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalImageCalls: number;
  issueFrequency: Array<{
    key: string;
    severity: 'error' | 'warning';
    count: number;
    /** Distinct offending words behind this issue, capped at
     *  MAX_SAMPLE_WORDS. Without these an unknown_word count says a story
     *  broke the lexicon but not whether the lexicon or the model is at
     *  fault, which is the first thing you need to know. Empty for issue
     *  types that carry no word. */
    sampleWords: string[];
  }>;
  gates: StoryEvaluationGate[];
}

/** Cap on distinct offending words reported per issue type — enough to see
 *  the shape of a failure without turning the report into a word list. */
const MAX_SAMPLE_WORDS = 12;

export const DEFAULT_STORY_EVALUATION_THRESHOLDS: StoryEvaluationThresholds = {
  minimumContentReadyRate: 0.8,
  maximumFailureRate: 0.2,
  minimumMeanProseScore: 0.8,
  minimumMeanQuestionsScore: 0.7,
};

/**
 * Aggregate live generation outcomes behind one stable evaluation interface.
 * "Content ready" intentionally ignores image presence so the inexpensive
 * --skip-images harness can still gate plan/prose/question regressions.
 */
export function evaluateStoryGeneration(
  samples: StoryGenerationSample[],
  thresholds: StoryEvaluationThresholds = DEFAULT_STORY_EVALUATION_THRESHOLDS,
): StoryGenerationEvaluation {
  if (samples.length === 0) {
    throw new Error('Story generation evaluation requires at least one sample.');
  }

  validateThresholds(thresholds);

  let contentReadyCount = 0;
  let failures = 0;
  let proseTotal = 0;
  let questionsTotal = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalImageCalls = 0;
  const durations: number[] = [];
  const issueCounts = new Map<
    string,
    { severity: 'error' | 'warning'; count: number; words: Set<string> }
  >();

  for (const sample of samples) {
    const { result } = sample;
    const hasContentError = result.issues.some(
      (issue) => issue.severity === 'error' && issue.stage !== 'images',
    );
    const contentReady =
      result.status !== 'failed' &&
      !hasContentError &&
      result.qualityReport.proseScore >= 0.7 &&
      result.qualityReport.questionsScore >= 0.5;
    if (contentReady) contentReadyCount++;
    if (result.status === 'failed') failures++;

    proseTotal += result.qualityReport.proseScore;
    questionsTotal += result.qualityReport.questionsScore;
    totalInputTokens += result.cost.totalInputTokens;
    totalOutputTokens += result.cost.totalOutputTokens;
    totalImageCalls += result.cost.imageCallsCount;
    durations.push(result.timing.totalMs);

    for (const issue of result.issues) {
      const key = `${issue.stage}.${issue.type}`;
      const word =
        'word' in issue && typeof issue.word === 'string' ? issue.word : null;
      const existing = issueCounts.get(key);
      if (existing) {
        existing.count++;
        if (word) existing.words.add(word);
      } else {
        issueCounts.set(key, {
          severity: issue.severity,
          count: 1,
          words: new Set(word ? [word] : []),
        });
      }
    }
  }

  const sampleCount = samples.length;
  const contentReadyRate = contentReadyCount / sampleCount;
  const failureRate = failures / sampleCount;
  const meanProseScore = proseTotal / sampleCount;
  const meanQuestionsScore = questionsTotal / sampleCount;

  const gates: StoryEvaluationGate[] = [
    atLeast(
      'minimumContentReadyRate',
      contentReadyRate,
      thresholds.minimumContentReadyRate,
    ),
    atMost('maximumFailureRate', failureRate, thresholds.maximumFailureRate),
    atLeast(
      'minimumMeanProseScore',
      meanProseScore,
      thresholds.minimumMeanProseScore,
    ),
    atLeast(
      'minimumMeanQuestionsScore',
      meanQuestionsScore,
      thresholds.minimumMeanQuestionsScore,
    ),
  ];

  return {
    passed: gates.every((gate) => gate.passed),
    sampleCount,
    contentReadyCount,
    contentReadyRate,
    failureRate,
    meanProseScore,
    meanQuestionsScore,
    p50TotalMs: percentile(durations, 0.5),
    p95TotalMs: percentile(durations, 0.95),
    totalInputTokens,
    totalOutputTokens,
    totalImageCalls,
    issueFrequency: Array.from(issueCounts.entries())
      .map(([key, value]) => ({
        key,
        severity: value.severity,
        count: value.count,
        sampleWords: Array.from(value.words).sort().slice(0, MAX_SAMPLE_WORDS),
      }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)),
    gates,
  };
}

function atLeast(
  metric: keyof StoryEvaluationThresholds,
  actual: number,
  expected: number,
): StoryEvaluationGate {
  return { metric, actual, expected, comparison: 'at_least', passed: actual >= expected };
}

function atMost(
  metric: keyof StoryEvaluationThresholds,
  actual: number,
  expected: number,
): StoryEvaluationGate {
  return { metric, actual, expected, comparison: 'at_most', passed: actual <= expected };
}

function percentile(values: number[], quantile: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(sorted.length * quantile) - 1);
  return sorted[index] ?? 0;
}

function validateThresholds(thresholds: StoryEvaluationThresholds): void {
  for (const [key, value] of Object.entries(thresholds)) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`${key} must be between 0 and 1.`);
    }
  }
}
