// Manual harness for the validation-driven regen wrapper. Picks 5 random
// non-function vocab rows at the requested level, runs Stage 1 to get a
// plan, then runs generateValidatedProse with maxAttempts=3 and
// pretty-prints each attempt + the final outcome.
//
// What we use it for: measuring how often the regen loop actually
// produces clean output, what kinds of issues survive multiple attempts,
// and the typical token / latency cost of a regen vs a clean first pass.
//
// Usage:
//   npm run test:regen -- 2
//   npm run test:regen -- 4 "lost toy"

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

function summariseIssue(issue: ValidationIssue): string {
  const sev = issue.severity === 'error' ? 'E' : 'W';
  switch (issue.type) {
    case 'unknown_word':
      return `[${sev}] unknown_word "${issue.word}" (page ${issue.pageNumber})`;
    case 'sentence_too_long':
      return `[${sev}] sentence_too_long page ${issue.pageNumber}: ${issue.wordCount}/${issue.maxAllowed}`;
    case 'target_word_missing':
      return `[${sev}] target_word_missing "${issue.word}"`;
    case 'page_too_short':
      return `[${sev}] page_too_short page ${issue.pageNumber}: ${issue.wordCount} (min ${issue.minRequired})`;
    case 'page_too_long':
      return `[${sev}] page_too_long page ${issue.pageNumber}: ${issue.wordCount} (max ${issue.maxAllowed})`;
    case 'forbidden_construction':
      return `[${sev}] forbidden_construction page ${issue.pageNumber}: ${issue.reason}`;
  }
}

function printAttempt(record: AttemptRecord): void {
  const v = record.validation;
  const score = v.qualityScore.toFixed(2);
  const outcome =
    v.errorCount === 0 && v.warningCount === 0
      ? 'clean'
      : v.errorCount === 0
        ? 'warnings-only'
        : `${v.errorCount}E / ${v.warningCount}W`;
  console.log(
    `── Attempt ${record.attemptNumber}: ${outcome} · qualityScore=${score} ` +
      `(${v.errorCount} errors, ${v.warningCount} warnings) · ` +
      `${record.inputTokens}/${record.outputTokens} tok · ${record.durationMs}ms ──`,
  );
  if (v.issues.length === 0) {
    console.log('  (no issues)');
    return;
  }
  // Sort errors first so the most important issues are shown when truncated.
  const sorted = [...v.issues].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1,
  );
  for (const issue of sorted.slice(0, 5)) {
    console.log(`  · ${summariseIssue(issue)}`);
  }
  if (sorted.length > 5) {
    console.log(`  · …and ${sorted.length - 5} more`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const levelArg = args[0];
  const seedTheme = args[1];
  const levelId = parseInt(levelArg ?? '', 10);
  if (!Number.isInteger(levelId) || levelId < 1 || levelId > 5) {
    console.error('Usage: npm run test:regen -- <readingLevel 1-5> [seedTheme]');
    process.exit(1);
  }
  const level = getReadingLevel(levelId);
  console.log(`Reading level ${level.id} (${level.name}) → AF&F ${level.targetAfFLevel}\n`);

  const candidates = await db
    .select({ id: vocabulary.id, word: vocabulary.word, afFUnit: vocabulary.afFUnit })
    .from(vocabulary)
    .where(
      and(
        eq(vocabulary.afFLevel, level.targetAfFLevel),
        eq(vocabulary.isFunctionWord, false),
      ),
    );
  if (candidates.length < TARGET_COUNT) {
    console.error(
      `Only ${candidates.length} non-function words at AF&F ${level.targetAfFLevel}. ` +
        `Run \`npm run seed:vocab -- --write\` first.`,
    );
    process.exit(1);
  }
  const targets = candidates
    .sort(() => Math.random() - 0.5)
    .slice(0, TARGET_COUNT);

  console.log('Random targets:');
  for (const t of targets) {
    console.log(`  ${t.word.padEnd(20)} (unit ${t.afFUnit ?? '?'}) [${t.id}]`);
  }
  if (seedTheme) console.log(`Seed theme: ${seedTheme}`);
  console.log('');

  console.log('Running Stage 1 (plan)…');
  const planResult = await generatePassagePlan({
    readingLevel: levelId,
    targetVocabIds: targets.map((t) => t.id),
    seedTheme,
  });
  const plan = planResult.plan;
  console.log(
    `Plan "${plan.title}" — ${plan.pages.length} pages — ` +
      `${planResult.meta.inputTokens}/${planResult.meta.outputTokens} tok · ${planResult.meta.durationMs}ms\n`,
  );

  console.log(`Running Stage 2+3 with regen (maxAttempts=${MAX_ATTEMPTS})…`);
  const result = await generateValidatedProse({
    plan,
    readingLevelId: levelId,
    maxAttempts: MAX_ATTEMPTS,
  });

  console.log('');
  for (const record of result.attempts) printAttempt(record);
  console.log('');

  const fv = result.finalValidation;
  const finalOutcome =
    fv.errorCount === 0 && fv.warningCount === 0
      ? 'clean'
      : fv.errorCount === 0
        ? 'warnings-only (valid=true)'
        : 'has errors (valid=false)';
  console.log('═══ FINAL ════════════════════════════════════════════════');
  console.log(`outcome:           ${finalOutcome}`);
  console.log(`valid:             ${result.success} (errorCount === 0)`);
  console.log(`attempts:          ${result.attempts.length} of ${MAX_ATTEMPTS}`);
  console.log(`final errors:      ${fv.errorCount}`);
  console.log(`final warnings:    ${fv.warningCount}`);
  console.log(`qualityScore:      ${fv.qualityScore.toFixed(2)}`);
  console.log(`total input tok:   ${result.totalInputTokens}`);
  console.log(`total output tok:  ${result.totalOutputTokens}`);
  console.log(`total duration:    ${result.totalDurationMs}ms`);
  console.log('');
  console.log('═══ FINAL PROSE ══════════════════════════════════════════');
  console.log(`Title: ${plan.title}\n`);
  for (const p of result.finalPages) {
    console.log(`Page ${p.pageNumber}:`);
    console.log(`  ${p.text}`);
    console.log('');
  }

  process.exit(result.success ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
