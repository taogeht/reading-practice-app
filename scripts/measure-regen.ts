// One-off batch measurement: run the regen harness N times at a fixed
// reading level, capture full structured results, and report aggregate
// metrics + a residual-unknowns histogram. Same library calls as
// test-regen.ts; the only difference is this script keeps the full
// validation issues array across all N runs so we can build the
// residual-words histogram across failed runs.
//
// Usage:
//   npx tsx scripts/measure-regen.ts          # 10 runs at level 2 (default)
//   npx tsx scripts/measure-regen.ts 5 4      # 5 runs at level 4

import './_bootstrap-env';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { vocabulary } from '../src/lib/db/schema';
import {
  generatePassagePlan,
  generateValidatedProse,
  type AttemptRecord,
  type ValidationIssue,
} from '../src/lib/reading/generate';
import { getReadingLevel } from '../src/lib/reading/levels';

const TARGET_COUNT = 5;
const MAX_ATTEMPTS = 3;
const DEFAULT_RUNS = 10;
const DEFAULT_LEVEL = 2;
const PAUSE_BETWEEN_RUNS_MS = 500;

interface RunResult {
  runIdx: number;
  ok: true;
  targets: { id: string; word: string; afFUnit: number | null }[];
  planTitle: string;
  attempts: AttemptRecord[];
  success: boolean;
  successAttemptNumber: number | null;
  finalIssueCount: number;
  finalErrorCount: number;
  finalWarningCount: number;
  finalQualityScore: number;
  finalIssues: ValidationIssue[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalDurationMs: number;
}

interface RunError {
  runIdx: number;
  ok: false;
  error: string;
}

type Run = RunResult | RunError;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return n % 2 === 1
    ? sorted[(n - 1) / 2]!
    : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
}

async function pickRandomTargets(
  targetAfFLevel: 'starter' | 'grade1' | 'grade2' | 'grade3' | 'grade4',
): Promise<{ id: string; word: string; afFUnit: number | null }[]> {
  const candidates = await db
    .select({ id: vocabulary.id, word: vocabulary.word, afFUnit: vocabulary.afFUnit })
    .from(vocabulary)
    .where(
      and(
        eq(vocabulary.afFLevel, targetAfFLevel),
        eq(vocabulary.isFunctionWord, false),
        eq(vocabulary.isScaffold, false),
      ),
    );
  if (candidates.length < TARGET_COUNT) {
    throw new Error(
      `Only ${candidates.length} curriculum words at AF&F ${targetAfFLevel}.`,
    );
  }
  return candidates.sort(() => Math.random() - 0.5).slice(0, TARGET_COUNT);
}

async function runOnce(
  runIdx: number,
  levelId: number,
): Promise<RunResult> {
  const level = getReadingLevel(levelId);
  const targets = await pickRandomTargets(level.targetAfFLevel);

  const planResult = await generatePassagePlan({
    readingLevel: levelId,
    targetVocabIds: targets.map((t) => t.id),
  });
  const plan = planResult.plan;

  const result = await generateValidatedProse({
    plan,
    readingLevelId: levelId,
    maxAttempts: MAX_ATTEMPTS,
  });

  // Total tokens include the Stage 1 plan call too — the regen wrapper's
  // totals only cover the prose calls. Comparing apples to apples with
  // test:regen output requires summing both.
  const totalInputTokens = planResult.meta.inputTokens + result.totalInputTokens;
  const totalOutputTokens = planResult.meta.outputTokens + result.totalOutputTokens;
  const totalDurationMs = planResult.meta.durationMs + result.totalDurationMs;

  const successAttempt = result.attempts.find((a) => a.validation.valid);
  return {
    runIdx,
    ok: true,
    targets,
    planTitle: plan.title,
    attempts: result.attempts,
    success: result.success,
    successAttemptNumber: successAttempt?.attemptNumber ?? null,
    finalIssueCount: result.finalValidation.issues.length,
    finalErrorCount: result.finalValidation.errorCount,
    finalWarningCount: result.finalValidation.warningCount,
    finalQualityScore: result.finalValidation.qualityScore,
    finalIssues: result.finalValidation.issues,
    totalInputTokens,
    totalOutputTokens,
    totalDurationMs,
  };
}

function outcomeLabel(r: RunResult): string {
  if (r.finalErrorCount === 0 && r.finalWarningCount === 0) {
    return `clean on attempt ${r.successAttemptNumber}`;
  }
  if (r.finalErrorCount === 0) {
    return `warnings-only (${r.finalWarningCount}W)`;
  }
  return `failed (${r.finalErrorCount}E, ${r.finalWarningCount}W after ${r.attempts.length})`;
}

function describeRun(run: Run): string {
  if (!run.ok) return `Run ${run.runIdx}: ERROR — ${run.error}`;
  const targets = run.targets.map((t) => t.word).join(', ');
  return (
    `Run ${run.runIdx.toString().padStart(2)}: ${outcomeLabel(run).padEnd(46)} · ` +
    `score=${run.finalQualityScore.toFixed(2)} · ` +
    `${run.totalInputTokens.toString().padStart(5)}/${run.totalOutputTokens.toString().padStart(4)} tok · ` +
    `${run.totalDurationMs.toString().padStart(6)}ms · ` +
    `targets=[${targets}]`
  );
}

async function main() {
  const args = process.argv.slice(2);
  const nRuns = args[0] ? parseInt(args[0], 10) : DEFAULT_RUNS;
  const levelId = args[1] ? parseInt(args[1], 10) : DEFAULT_LEVEL;

  if (!Number.isInteger(nRuns) || nRuns < 1) {
    console.error('Usage: npx tsx scripts/measure-regen.ts [N_RUNS] [LEVEL_ID]');
    process.exit(1);
  }

  const level = getReadingLevel(levelId);
  console.log(`Batch regen measurement — ${nRuns} runs at level ${levelId} (${level.name}, AF&F ${level.targetAfFLevel}), maxAttempts=${MAX_ATTEMPTS}.`);
  console.log('');

  const runs: Run[] = [];
  for (let i = 1; i <= nRuns; i++) {
    process.stdout.write(`▶ Run ${i}/${nRuns}… `);
    try {
      const r = await runOnce(i, levelId);
      runs.push(r);
      console.log(
        `done — ${outcomeLabel(r)} (score=${r.finalQualityScore.toFixed(2)}), ${r.totalDurationMs}ms`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      runs.push({ runIdx: i, ok: false, error: msg });
      console.log(`ERROR — ${msg}`);
    }
    if (i < nRuns) await new Promise((res) => setTimeout(res, PAUSE_BETWEEN_RUNS_MS));
  }

  // ---------- 1. Per-run summary ----------
  console.log('');
  console.log('═══ PER-RUN SUMMARY ═════════════════════════════════════════════════');
  for (const r of runs) console.log(describeRun(r));

  // ---------- 2. Aggregate metrics ----------
  const ok = runs.filter((r): r is RunResult => r.ok);
  // "valid" now means errorCount === 0 — includes warnings-only runs.
  const validRuns = ok.filter((r) => r.success);
  const cleanRuns = ok.filter(
    (r) => r.finalErrorCount === 0 && r.finalWarningCount === 0,
  );
  const warningsOnlyRuns = ok.filter(
    (r) => r.finalErrorCount === 0 && r.finalWarningCount > 0,
  );
  const finalIssueCounts = ok.map((r) => r.finalIssueCount);
  const finalErrorCounts = ok.map((r) => r.finalErrorCount);
  const finalWarningCounts = ok.map((r) => r.finalWarningCount);
  const finalScores = ok.map((r) => r.finalQualityScore);
  const totalInputs = ok.map((r) => r.totalInputTokens);
  const totalOutputs = ok.map((r) => r.totalOutputTokens);
  const totalDurations = ok.map((r) => r.totalDurationMs);
  const mean = (xs: number[]) =>
    xs.length === 0 ? 0 : xs.reduce((s, n) => s + n, 0) / xs.length;

  console.log('');
  console.log('═══ AGGREGATE METRICS ═══════════════════════════════════════════════');
  console.log(`Runs completed:                 ${ok.length}/${runs.length}`);
  console.log(`Valid (errorCount === 0):       ${validRuns.length}/${ok.length}`);
  console.log(`  ↳ clean (0 errors, 0 warnings): ${cleanRuns.length}/${ok.length}`);
  console.log(`  ↳ warnings-only:               ${warningsOnlyRuns.length}/${ok.length}`);
  console.log(`First-pass successes:           ${validRuns.filter((r) => r.successAttemptNumber === 1).length}/${ok.length}`);
  console.log(`Median final issue count:       ${median(finalIssueCounts)}`);
  console.log(`Mean final issue count:         ${mean(finalIssueCounts).toFixed(2)}`);
  console.log(`Median final errors:            ${median(finalErrorCounts)}`);
  console.log(`Mean final errors:              ${mean(finalErrorCounts).toFixed(2)}`);
  console.log(`Median final warnings:          ${median(finalWarningCounts)}`);
  console.log(`Mean final warnings:            ${mean(finalWarningCounts).toFixed(2)}`);
  console.log(`Median quality score:           ${median(finalScores).toFixed(2)}`);
  console.log(`Mean quality score:             ${mean(finalScores).toFixed(2)}`);
  console.log(`Quality score distribution:     [${finalScores.map((s) => s.toFixed(2)).sort().join(', ')}]`);
  console.log(`Median total input tokens:      ${median(totalInputs)}`);
  console.log(`Median total output tokens:     ${median(totalOutputs)}`);
  console.log(`Median total duration:          ${median(totalDurations)}ms`);

  // Issue-type breakdown across failures (helps interpret residuals)
  const failedRuns = ok.filter((r) => !r.success);
  const byIssueType: Record<string, number> = {};
  for (const r of failedRuns) {
    for (const issue of r.finalIssues) {
      byIssueType[issue.type] = (byIssueType[issue.type] ?? 0) + 1;
    }
  }
  if (failedRuns.length) {
    console.log('');
    console.log(`Failure issue-type breakdown (${failedRuns.length} failed runs):`);
    for (const [t, n] of Object.entries(byIssueType).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${t.padEnd(24)} ${n}`);
    }
  }

  // ---------- 3. Residual unknown words histogram ----------
  const unknownWordCounts = new Map<string, number>();
  for (const r of failedRuns) {
    for (const issue of r.finalIssues) {
      if (issue.type === 'unknown_word') {
        unknownWordCounts.set(
          issue.word,
          (unknownWordCounts.get(issue.word) ?? 0) + 1,
        );
      }
    }
  }
  const sortedUnknowns = Array.from(unknownWordCounts.entries()).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );

  console.log('');
  console.log('═══ RESIDUAL UNKNOWN WORDS (across failed runs) ═════════════════════');
  if (sortedUnknowns.length === 0) {
    console.log('(none — every failed run had zero unknown_word issues, or no failed runs.)');
  } else {
    const total = sortedUnknowns.reduce((s, [, n]) => s + n, 0);
    const distinct = sortedUnknowns.length;
    console.log(`${distinct} distinct words, ${total} total occurrences across ${failedRuns.length} failed runs:`);
    for (const [w, n] of sortedUnknowns) {
      console.log(`  ${w.padEnd(20)} ${n}`);
    }
  }

  // ---------- 4. Sample warnings-only run ----------
  const sampleWarningsOnly = warningsOnlyRuns[0];
  if (sampleWarningsOnly) {
    console.log('');
    console.log('═══ SAMPLE WARNINGS-ONLY RUN ════════════════════════════════════════');
    console.log(`Run ${sampleWarningsOnly.runIdx} ("${sampleWarningsOnly.planTitle}")`);
    console.log(`  errors: ${sampleWarningsOnly.finalErrorCount}, warnings: ${sampleWarningsOnly.finalWarningCount}, score: ${sampleWarningsOnly.finalQualityScore.toFixed(2)}`);
    console.log('  warnings:');
    for (const issue of sampleWarningsOnly.finalIssues) {
      switch (issue.type) {
        case 'unknown_word':
          console.log(`    [W] unknown_word "${issue.word}" (page ${issue.pageNumber})`);
          break;
        case 'sentence_too_long':
          console.log(`    [W] sentence_too_long page ${issue.pageNumber}: ${issue.wordCount}/${issue.maxAllowed}`);
          break;
        case 'page_too_short':
          console.log(`    [W] page_too_short page ${issue.pageNumber}: ${issue.wordCount} (min ${issue.minRequired})`);
          break;
        case 'page_too_long':
          console.log(`    [W] page_too_long page ${issue.pageNumber}: ${issue.wordCount} (max ${issue.maxAllowed})`);
          break;
        default:
          // Other types are always errors; shouldn't appear here.
          break;
      }
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
