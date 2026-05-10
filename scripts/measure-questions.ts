// Batch measurement for the questions pipeline. Same library calls as
// test-questions.ts but loops N times with structured aggregation +
// separate residual-unknowns histograms for prose vs question stages.
//
// Usage:
//   npx tsx scripts/measure-questions.ts          # 5 runs, level 2
//   npx tsx scripts/measure-questions.ts 10 2

import './_bootstrap-env';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { vocabulary } from '../src/lib/db/schema';
import {
  generatePassagePlan,
  generateQuestions,
  generateValidatedProse,
  validateQuestions,
  type GeneratedQuestion,
  type QuestionValidationIssue,
  type QuestionValidationResult,
  type ValidationIssue,
  type ValidationResult,
} from '../src/lib/reading/generate';
import {
  fetchTargetVocab,
  resolveCumulativeVocab,
} from '../src/lib/reading/generate/vocab';
import { getReadingLevel } from '../src/lib/reading/levels';

const TARGET_COUNT = 5;
const MAX_PROSE_ATTEMPTS = 3;
const DEFAULT_RUNS = 5;
const DEFAULT_LEVEL = 2;
const PAUSE_BETWEEN_RUNS_MS = 500;

interface RunResult {
  ok: true;
  runIdx: number;
  planTitle: string;
  proseValidation: ValidationResult;
  questions: GeneratedQuestion[];
  questionValidation: QuestionValidationResult;
  proseTokens: { input: number; output: number };
  questionTokens: { input: number; output: number };
}

interface RunError {
  ok: false;
  runIdx: number;
  error: string;
}

type Run = RunResult | RunError;

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};
const mean = (xs: number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((s, n) => s + n, 0) / xs.length;

async function runOnce(runIdx: number, levelId: number): Promise<RunResult> {
  const level = getReadingLevel(levelId);
  const candidates = await db
    .select({ id: vocabulary.id, word: vocabulary.word })
    .from(vocabulary)
    .where(
      and(
        eq(vocabulary.afFLevel, level.targetAfFLevel),
        eq(vocabulary.isFunctionWord, false),
        eq(vocabulary.isScaffold, false),
      ),
    );
  if (candidates.length < TARGET_COUNT) {
    throw new Error(`Only ${candidates.length} curriculum words at AF&F ${level.targetAfFLevel}`);
  }
  const targets = candidates.sort(() => Math.random() - 0.5).slice(0, TARGET_COUNT);

  const planResult = await generatePassagePlan({
    readingLevel: levelId,
    targetVocabIds: targets.map((t) => t.id),
  });
  const plan = planResult.plan;

  const proseResult = await generateValidatedProse({
    plan,
    readingLevelId: levelId,
    maxAttempts: MAX_PROSE_ATTEMPTS,
  });

  const targetIds = targets.map((t) => t.id);
  const targetRowsFull = await fetchTargetVocab(targetIds);
  const cumulativeFull = await resolveCumulativeVocab(targetRowsFull, undefined);
  const targetVocabRows = targetRowsFull.map((r) => ({
    id: r.id,
    word: r.word,
    mandarinTranslation: r.mandarinTranslation,
    isPicturable: r.isPicturable,
  }));
  const cumulativeVocabRows = cumulativeFull.map((r) => ({
    id: r.id,
    word: r.word,
    isPicturable: r.isPicturable,
  }));

  const harnessPassageId = randomUUID();
  const qResult = await generateQuestions({
    plan,
    pages: proseResult.finalPages,
    targetVocabRows,
    cumulativeVocabRows,
    readingLevelId: levelId,
    passageId: harnessPassageId,
  });
  const qVal = validateQuestions(
    qResult.questions,
    proseResult.finalPages,
    targetVocabRows.map((r) => ({ id: r.id, word: r.word })),
    cumulativeVocabRows,
    levelId,
    harnessPassageId,
  );

  return {
    ok: true,
    runIdx,
    planTitle: plan.title,
    proseValidation: proseResult.finalValidation,
    questions: qResult.questions,
    questionValidation: qVal,
    proseTokens: {
      input: proseResult.totalInputTokens + planResult.meta.inputTokens,
      output: proseResult.totalOutputTokens + planResult.meta.outputTokens,
    },
    questionTokens: { input: qResult.meta.inputTokens, output: qResult.meta.outputTokens },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const nRuns = args[0] ? parseInt(args[0], 10) : DEFAULT_RUNS;
  const levelId = args[1] ? parseInt(args[1], 10) : DEFAULT_LEVEL;
  if (!Number.isInteger(nRuns) || nRuns < 1) {
    console.error('Usage: npx tsx scripts/measure-questions.ts [N_RUNS] [LEVEL_ID]');
    process.exit(1);
  }

  const level = getReadingLevel(levelId);
  console.log(`Batch question measurement — ${nRuns} runs at level ${levelId} (${level.name}).\n`);

  const runs: Run[] = [];
  for (let i = 1; i <= nRuns; i++) {
    process.stdout.write(`▶ Run ${i}/${nRuns}… `);
    try {
      const r = await runOnce(i, levelId);
      runs.push(r);
      console.log(
        `prose=${r.proseValidation.qualityScore.toFixed(2)}, ` +
          `questions=${r.questionValidation.qualityScore.toFixed(2)} ` +
          `(${r.questionValidation.errorCount}E/${r.questionValidation.warningCount}W)`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      runs.push({ ok: false, runIdx: i, error: msg });
      console.log(`ERROR — ${msg}`);
    }
    if (i < nRuns) await new Promise((res) => setTimeout(res, PAUSE_BETWEEN_RUNS_MS));
  }

  const ok = runs.filter((r): r is RunResult => r.ok);

  // ---------- Per-run table ----------
  console.log('');
  console.log('═══ PER-RUN ════════════════════════════════════════════════════════');
  for (const r of runs) {
    if (!r.ok) {
      console.log(`Run ${r.runIdx}: ERROR — ${r.error}`);
      continue;
    }
    const pv = r.proseValidation;
    const qv = r.questionValidation;
    console.log(
      `Run ${r.runIdx}: "${r.planTitle.padEnd(36).slice(0, 36)}" · ` +
        `prose ${pv.qualityScore.toFixed(2)} (${pv.errorCount}E/${pv.warningCount}W) · ` +
        `questions ${qv.qualityScore.toFixed(2)} (${qv.errorCount}E/${qv.warningCount}W)`,
    );
  }

  // ---------- Aggregate ----------
  const proseScores = ok.map((r) => r.proseValidation.qualityScore);
  const qScores = ok.map((r) => r.questionValidation.qualityScore);
  const qErrors = ok.map((r) => r.questionValidation.errorCount);
  const qWarnings = ok.map((r) => r.questionValidation.warningCount);
  const qInputs = ok.map((r) => r.questionTokens.input);
  const qOutputs = ok.map((r) => r.questionTokens.output);

  console.log('');
  console.log('═══ AGGREGATE ══════════════════════════════════════════════════════');
  console.log(`Runs completed:           ${ok.length}/${runs.length}`);
  console.log(`Mean prose qualityScore:  ${mean(proseScores).toFixed(2)}`);
  console.log(`Mean q     qualityScore:  ${mean(qScores).toFixed(2)}`);
  console.log(`Median q   qualityScore:  ${median(qScores).toFixed(2)}`);
  console.log(`Mean q errors:            ${mean(qErrors).toFixed(2)}`);
  console.log(`Mean q warnings:          ${mean(qWarnings).toFixed(2)}`);
  console.log(`Q score distribution:     [${qScores.map((s) => s.toFixed(2)).sort().join(', ')}]`);
  console.log(`Median q tokens:          ${median(qInputs)} / ${median(qOutputs)}`);
  const qValid = ok.filter((r) => r.questionValidation.valid).length;
  console.log(`Q valid (errorCount=0):   ${qValid}/${ok.length}`);

  // ---------- Question-validation residual unknowns ----------
  const qUnknownCounts = new Map<string, number>();
  for (const r of ok) {
    for (const issue of r.questionValidation.issues) {
      if (issue.type === 'unknown_word_in_question' || issue.type === 'unknown_word_in_options') {
        qUnknownCounts.set(issue.word, (qUnknownCounts.get(issue.word) ?? 0) + 1);
      }
    }
  }
  const sortedQ = Array.from(qUnknownCounts.entries()).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  console.log('');
  console.log('═══ QUESTION-VALIDATION RESIDUAL UNKNOWNS ══════════════════════════');
  if (sortedQ.length === 0) {
    console.log('(none)');
  } else {
    const total = sortedQ.reduce((s, [, n]) => s + n, 0);
    console.log(`${sortedQ.length} distinct words, ${total} total occurrences across ${ok.length} runs:`);
    for (const [w, n] of sortedQ) console.log(`  ${w.padEnd(18)} ${n}`);
  }

  // ---------- Prose residual unknowns (for completeness; separate from Q) ----------
  const proseUnknownCounts = new Map<string, number>();
  for (const r of ok) {
    for (const issue of r.proseValidation.issues) {
      if (issue.type === 'unknown_word') {
        proseUnknownCounts.set(issue.word, (proseUnknownCounts.get(issue.word) ?? 0) + 1);
      }
    }
  }
  const sortedP = Array.from(proseUnknownCounts.entries()).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  console.log('');
  console.log('═══ PROSE-VALIDATION RESIDUAL UNKNOWNS (for context) ═══════════════');
  if (sortedP.length === 0) {
    console.log('(none)');
  } else {
    const total = sortedP.reduce((s, [, n]) => s + n, 0);
    console.log(`${sortedP.length} distinct, ${total} total:`);
    for (const [w, n] of sortedP) console.log(`  ${w.padEnd(18)} ${n}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
