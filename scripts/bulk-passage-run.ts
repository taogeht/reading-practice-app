// Bulk-runner for the reading-passage pipeline. Repeats generatePassage
// N times at a single level, picking fresh random picturable targets per
// run, and emits per-run pass/fail lines + a final summary.
//
// Usage:
//   npm run bulk:passage -- 2 15
//
// Output: per-run pass/fail line printed AS each run completes (so the
// background monitor can stream them). Final summary prints totals.

import './_bootstrap-env';
import { and, eq } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { vocabulary } from '../src/lib/db/schema';
import { generatePassage } from '../src/lib/reading/generate';
import { getQuestionTypeMix, getReadingLevel } from '../src/lib/reading/levels';

const TARGET_COUNT = 5;

interface RunRecord {
  index: number;
  passageId: string;
  status: 'review' | 'draft' | 'failed';
  passageReady: boolean;
  totalMs: number;
  errorCount: number;
  warningCount: number;
  imageCalls: number;
  firstErrorSummary?: string;
}

async function pickTargets(levelId: number) {
  const level = getReadingLevel(levelId);
  const mix = getQuestionTypeMix(levelId);
  const conditions = [
    eq(vocabulary.afFLevel, level.targetAfFLevel),
    eq(vocabulary.isFunctionWord, false),
    eq(vocabulary.isScaffold, false),
  ];
  if (mix.vocab_matching > 0) {
    conditions.push(eq(vocabulary.isPicturable, true));
  }
  const candidates = await db
    .select({ id: vocabulary.id, word: vocabulary.word })
    .from(vocabulary)
    .where(and(...conditions));
  if (candidates.length < TARGET_COUNT) {
    throw new Error(
      `Only ${candidates.length} candidate words at AF&F ${level.targetAfFLevel}.`,
    );
  }
  return candidates.sort(() => Math.random() - 0.5).slice(0, TARGET_COUNT);
}

async function main() {
  const args = process.argv.slice(2);
  const levelId = parseInt(args[0] ?? '', 10);
  const count = parseInt(args[1] ?? '', 10);
  if (!Number.isInteger(levelId) || levelId < 1 || levelId > 5) {
    console.error('Usage: npm run bulk:passage -- <levelId 1-5> <count>');
    process.exit(1);
  }
  if (!Number.isInteger(count) || count < 1) {
    console.error('Usage: npm run bulk:passage -- <levelId 1-5> <count>');
    process.exit(1);
  }
  console.log(`STARTING bulk run: ${count} passages at level ${levelId}`);

  const records: RunRecord[] = [];
  for (let i = 1; i <= count; i++) {
    const targets = await pickTargets(levelId);
    const targetWords = targets.map((t) => t.word);
    try {
      const result = await generatePassage({
        readingLevelId: levelId,
        targetVocabIds: targets.map((t) => t.id),
      });
      const errors = result.issues.filter((x) => x.severity === 'error');
      const warnings = result.issues.filter((x) => x.severity === 'warning');
      const firstErr = errors[0];
      const rec: RunRecord = {
        index: i,
        passageId: result.passageId,
        status: result.status,
        passageReady: result.qualityReport.passageReady,
        totalMs: result.timing.totalMs,
        errorCount: errors.length,
        warningCount: warnings.length,
        imageCalls: result.cost.imageCallsCount,
        firstErrorSummary: firstErr
          ? `[${firstErr.stage}] ${firstErr.type}${'message' in firstErr ? `: ${firstErr.message}` : ''}`
          : undefined,
      };
      records.push(rec);
      console.log(
        `RUN ${String(i).padStart(2)}/${count}  ${rec.status.padEnd(7)}  ready=${rec.passageReady}  errs=${rec.errorCount}  warns=${rec.warningCount}  ms=${rec.totalMs}  imgs=${rec.imageCalls}  targets=${targetWords.join(',')}  ${rec.firstErrorSummary ?? ''}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const rec: RunRecord = {
        index: i,
        passageId: '(thrown)',
        status: 'failed',
        passageReady: false,
        totalMs: 0,
        errorCount: 1,
        warningCount: 0,
        imageCalls: 0,
        firstErrorSummary: `THROWN: ${msg}`,
      };
      records.push(rec);
      console.log(
        `RUN ${String(i).padStart(2)}/${count}  THREW    targets=${targetWords.join(',')}  ${msg}`,
      );
    }
  }

  // ---- Summary ----
  const reviews = records.filter((r) => r.status === 'review');
  const ready = records.filter((r) => r.passageReady);
  const failed = records.filter((r) => r.status === 'failed');
  console.log('');
  console.log('═══ BULK SUMMARY ═════════════════════════════');
  console.log(`total runs:      ${records.length}`);
  console.log(`status=review:   ${reviews.length}  (DB row written, may have warnings)`);
  console.log(`passageReady:    ${ready.length}  (passes all gates)`);
  console.log(`status=failed:   ${failed.length}`);
  console.log(`pass rate (review/total):       ${((reviews.length / records.length) * 100).toFixed(1)}%`);
  console.log(`pass rate (passageReady/total): ${((ready.length / records.length) * 100).toFixed(1)}%`);
  if (failed.length > 0) {
    console.log('');
    console.log('Failure reasons:');
    const reasonCounts = new Map<string, number>();
    for (const r of failed) {
      const key = r.firstErrorSummary?.split(':')[0] ?? '(unknown)';
      reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1);
    }
    for (const [key, n] of [...reasonCounts.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n}× ${key}`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('BULK RUN FATAL:', err);
  process.exit(1);
});
