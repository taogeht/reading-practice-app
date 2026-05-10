// Manual test harness for Stages 2 + 3 of the reading-passage pipeline.
// Generates (or loads) a plan, expands it into prose, runs deterministic
// validation, and prints the prose + the validation result.
//
// Usage:
//   npm run test:prose -- 2
//   npm run test:prose -- 4 "lost toy"
//   npm run test:prose -- 2 --plan-file=./samples/plan-2-garden.json
//
// Re-run repeatedly per level + per fixed plan to see prose variance and
// raw validation failure rates BEFORE wiring a regeneration loop.

import './_bootstrap-env';
import { readFile } from 'node:fs/promises';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { vocabulary } from '../src/lib/db/schema';
import {
  generatePagesProse,
  generatePassagePlan,
  PassagePlanSchema,
  validatePagesProse,
  type PassagePlan,
  type ValidationIssue,
} from '../src/lib/reading/generate';
import {
  fetchTargetVocab,
  resolveCumulativeVocab,
} from '../src/lib/reading/generate/vocab';
import { getReadingLevel } from '../src/lib/reading/levels';

const TARGET_COUNT = 5;

interface ParsedArgs {
  levelId: number;
  seedTheme?: string;
  planFile?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  let levelArg: string | undefined;
  let seedTheme: string | undefined;
  let planFile: string | undefined;

  for (const a of args) {
    if (a.startsWith('--plan-file=')) {
      planFile = a.slice('--plan-file='.length);
    } else if (levelArg === undefined) {
      levelArg = a;
    } else if (seedTheme === undefined) {
      seedTheme = a;
    }
  }

  const levelId = parseInt(levelArg ?? '', 10);
  if (!Number.isInteger(levelId) || levelId < 1 || levelId > 5) {
    console.error(
      'Usage: npm run test:prose -- <readingLevel 1-5> [seedTheme] [--plan-file=path]',
    );
    process.exit(1);
  }
  return { levelId, seedTheme, planFile };
}

async function loadPlanFromFile(path: string): Promise<PassagePlan> {
  const raw = await readFile(path, 'utf8');
  const parsed = PassagePlanSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(
      `Plan file ${path} doesn't match PassagePlanSchema: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

async function pickRandomTargets(
  targetAfFLevel: 'starter' | 'grade1' | 'grade2' | 'grade3' | 'grade4',
): Promise<string[]> {
  const candidates = await db
    .select({ id: vocabulary.id, word: vocabulary.word })
    .from(vocabulary)
    .where(
      and(
        eq(vocabulary.afFLevel, targetAfFLevel),
        eq(vocabulary.isFunctionWord, false),
      ),
    );
  if (candidates.length < TARGET_COUNT) {
    throw new Error(
      `Only ${candidates.length} non-function words at AF&F ${targetAfFLevel}. ` +
        `Run \`npm run seed:vocab -- --write\` first.`,
    );
  }
  return candidates
    .sort(() => Math.random() - 0.5)
    .slice(0, TARGET_COUNT)
    .map((c) => c.id);
}

function formatIssue(issue: ValidationIssue): string {
  switch (issue.type) {
    case 'unknown_word':
      return `  [page ${issue.pageNumber}] unknown_word: "${issue.word}"\n    in: "${issue.sentence}"`;
    case 'sentence_too_long':
      return `  [page ${issue.pageNumber}] sentence_too_long: ${issue.wordCount} words (max ${issue.maxAllowed})\n    "${issue.sentence}"`;
    case 'target_word_missing':
      return `  [global] target_word_missing: "${issue.word}" (vocabId ${issue.vocabId})`;
    case 'page_too_short':
      return `  [page ${issue.pageNumber}] page_too_short: ${issue.wordCount} words (min ${issue.minRequired})`;
    case 'page_too_long':
      return `  [page ${issue.pageNumber}] page_too_long: ${issue.wordCount} words (max ${issue.maxAllowed})`;
    case 'forbidden_construction':
      return `  [page ${issue.pageNumber}] forbidden_construction: ${issue.reason}\n    in: "${issue.sentence}"`;
  }
}

async function main() {
  const { levelId, seedTheme, planFile } = parseArgs(process.argv);
  const level = getReadingLevel(levelId);
  console.log(`Reading level ${level.id} (${level.name}) → AF&F ${level.targetAfFLevel}\n`);

  // ---- 1. Plan ----
  let plan: PassagePlan;
  if (planFile) {
    console.log(`Loading plan from ${planFile}…`);
    plan = await loadPlanFromFile(planFile);
    console.log(`Loaded plan "${plan.title}" with ${plan.pages.length} pages.\n`);
  } else {
    const targetIds = await pickRandomTargets(level.targetAfFLevel);
    console.log('Random target IDs picked:');
    const targetRows = await db
      .select({ id: vocabulary.id, word: vocabulary.word, afFUnit: vocabulary.afFUnit })
      .from(vocabulary)
      .where(inArray(vocabulary.id, targetIds));
    for (const r of targetRows) {
      console.log(`  ${r.word.padEnd(20)} (unit ${r.afFUnit ?? '?'}) [${r.id}]`);
    }
    if (seedTheme) console.log(`Seed theme: ${seedTheme}`);
    console.log('\nCalling generatePassagePlan…');
    const planResult = await generatePassagePlan({
      readingLevel: levelId,
      targetVocabIds: targetIds,
      seedTheme,
    });
    plan = planResult.plan;
    console.log(
      `Plan: "${plan.title}" — ${plan.pages.length} pages — ` +
        `model=${planResult.meta.model} tokens=${planResult.meta.inputTokens}/${planResult.meta.outputTokens} duration=${planResult.meta.durationMs}ms\n`,
    );
  }

  // ---- 2. Prose ----
  console.log('Calling generatePagesProse…');
  const prose = await generatePagesProse({
    plan,
    readingLevelId: levelId,
  });
  console.log(
    `Prose: ${prose.pages.length} pages — ` +
      `model=${prose.meta.model} tokens=${prose.meta.inputTokens}/${prose.meta.outputTokens} duration=${prose.meta.durationMs}ms\n`,
  );

  console.log('═══ PROSE ══════════════════════════════════════════════════');
  console.log(`Title: ${plan.title}\n`);
  for (const p of prose.pages) {
    console.log(`Page ${p.pageNumber}:`);
    console.log(`  ${p.text}`);
    console.log('');
  }

  // ---- 3. Validation ----
  // Re-fetch the same target + cumulative rows the prose stage saw, so
  // the validator's known-vocab is the model's allowlist plus targets.
  const targetIdsAcrossPlan = Array.from(
    new Set(plan.pages.flatMap((p) => p.targetVocabUsed)),
  );
  const targetRowsFull = await fetchTargetVocab(targetIdsAcrossPlan);
  const targetRowsForValidation = targetRowsFull.map((r) => ({
    id: r.id,
    word: r.word,
  }));
  const cumulativeRowsForValidation = (
    await resolveCumulativeVocab(targetRowsFull, undefined)
  ).map((r) => ({ id: r.id, word: r.word }));

  const result = validatePagesProse(
    prose.pages,
    plan,
    levelId,
    cumulativeRowsForValidation,
    targetRowsForValidation,
  );

  console.log('═══ VALIDATION ═════════════════════════════════════════════');
  console.log(`valid: ${result.valid}`);
  console.log('');
  console.log('stats:');
  console.log(`  totalWords:           ${result.stats.totalWords}`);
  console.log(`  uniqueWords:          ${result.stats.uniqueWords}`);
  console.log(`  longestSentenceWords: ${result.stats.longestSentenceWords}`);
  console.log(`  perPageWordCount:     [${result.stats.perPageWordCount.join(', ')}]`);
  console.log('  targetCoverage:');
  for (const tc of result.stats.targetCoverage) {
    console.log(`    ${tc.covered ? '✓' : '✗'} ${tc.word}`);
  }
  console.log('');
  if (result.issues.length === 0) {
    console.log('issues: (none)');
  } else {
    console.log(`issues (${result.issues.length}):`);
    for (const issue of result.issues) {
      console.log(formatIssue(issue));
    }
  }
  console.log('');

  process.exit(result.valid ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
