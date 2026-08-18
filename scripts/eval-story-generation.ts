// Live, cost-bearing regression harness for plan/prose/question generation.
// Uses deterministic curriculum targets so runs remain comparable over time.
// By default images are skipped; generated passages are persisted as drafts.
//
// Usage:
//   npm run eval:story-generation
//   npm run eval:story-generation -- --levels=1,2 --runs=2
//   npm run eval:story-generation -- --with-images --gate

import './_bootstrap-env';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { vocabulary } from '../src/lib/db/schema';
import { evaluateStoryGeneration, type StoryGenerationSample } from '../src/lib/reading/evaluation';
import { generatePassage } from '../src/lib/reading/generate';
import { getReadingLevel } from '../src/lib/reading/levels';

interface CliOptions {
  levels: number[];
  runsPerLevel: number;
  withImages: boolean;
  gate: boolean;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const samples: StoryGenerationSample[] = [];

  console.log(
    `Story evaluation: levels=${options.levels.join(',')} runs=${options.runsPerLevel} images=${options.withImages ? 'on' : 'skipped'}`,
  );
  console.log('This live harness calls AI providers and writes generated passage rows.');

  for (const levelId of options.levels) {
    const targetIds = await deterministicTargets(levelId);
    for (let run = 1; run <= options.runsPerLevel; run++) {
      const caseId = `level-${levelId}-run-${run}`;
      const result = await generatePassage({
        readingLevelId: levelId,
        targetVocabIds: targetIds,
        skipImages: !options.withImages,
      });
      samples.push({ caseId, readingLevelId: levelId, result });
      console.log(
        `${caseId}: status=${result.status} prose=${result.qualityReport.proseScore.toFixed(2)} questions=${result.qualityReport.questionsScore.toFixed(2)} ms=${result.timing.totalMs}`,
      );
    }
  }

  const report = evaluateStoryGeneration(samples);
  console.log('');
  console.log('Story generation evaluation');
  console.log(`  samples:             ${report.sampleCount}`);
  console.log(
    `  content-ready rate:  ${(report.contentReadyRate * 100).toFixed(1)}%`,
  );
  console.log(`  failure rate:        ${(report.failureRate * 100).toFixed(1)}%`);
  console.log(`  mean prose score:    ${report.meanProseScore.toFixed(3)}`);
  console.log(`  mean question score: ${report.meanQuestionsScore.toFixed(3)}`);
  console.log(`  p50 / p95 duration:  ${report.p50TotalMs} / ${report.p95TotalMs} ms`);
  console.log(
    `  tokens in / out:     ${report.totalInputTokens} / ${report.totalOutputTokens}`,
  );
  console.log(`  image calls:         ${report.totalImageCalls}`);
  for (const gate of report.gates) {
    const operator = gate.comparison === 'at_least' ? '>=' : '<=';
    console.log(
      `  ${gate.passed ? 'PASS' : 'FAIL'} ${gate.metric}: ${gate.actual.toFixed(3)} ${operator} ${gate.expected.toFixed(3)}`,
    );
  }
  if (report.issueFrequency.length > 0) {
    console.log('  issue frequency:');
    for (const issue of report.issueFrequency.slice(0, 10)) {
      const words =
        issue.sampleWords.length > 0 ? `  [${issue.sampleWords.join(', ')}]` : '';
      console.log(`    ${issue.count}x ${issue.severity} ${issue.key}${words}`);
    }
  }

  // The pg pool keeps the event loop alive, so exit explicitly (as the other
  // scripts/ entry points do) and carry the gate result in the exit code.
  process.exit(options.gate && !report.passed ? 1 : 0);
}

async function deterministicTargets(levelId: number): Promise<string[]> {
  const level = getReadingLevel(levelId);
  const candidates = await db
    .select({
      id: vocabulary.id,
      word: vocabulary.word,
      unit: vocabulary.afFUnit,
    })
    .from(vocabulary)
    .where(
      and(
        eq(vocabulary.afFLevel, level.targetAfFLevel),
        eq(vocabulary.isFunctionWord, false),
        eq(vocabulary.isScaffold, false),
        eq(vocabulary.isPicturable, true),
      ),
    )
    .orderBy(asc(vocabulary.afFUnit), asc(vocabulary.word));

  const byUnit = new Map<number, typeof candidates>();
  for (const candidate of candidates) {
    if (candidate.unit === null) continue;
    const rows = byUnit.get(candidate.unit) ?? [];
    rows.push(candidate);
    byUnit.set(candidate.unit, rows);
  }
  const targetCount = level.targetVocabPerStory;
  const coherentUnit = Array.from(byUnit.entries())
    .sort(([a], [b]) => a - b)
    .find(([, rows]) => rows.length >= targetCount)?.[1];
  const selected = (coherentUnit ?? candidates).slice(0, targetCount);
  if (selected.length < targetCount) {
    throw new Error(
      `Level ${levelId} has only ${selected.length} deterministic target candidates; ${targetCount} required.`,
    );
  }
  return selected.map((row) => row.id);
}

function parseOptions(args: string[]): CliOptions {
  const levelsArg = args.find((arg) => arg.startsWith('--levels='));
  const runsArg = args.find((arg) => arg.startsWith('--runs='));
  const levels = (levelsArg?.slice('--levels='.length) ?? '1,2,3,4,5')
    .split(',')
    .map(Number);
  const runsPerLevel = Number(runsArg?.slice('--runs='.length) ?? '1');
  if (
    levels.length === 0 ||
    levels.some((level) => !Number.isInteger(level) || level < 1 || level > 5)
  ) {
    throw new Error('--levels must be a comma-separated list containing 1-5.');
  }
  if (!Number.isInteger(runsPerLevel) || runsPerLevel < 1 || runsPerLevel > 10) {
    throw new Error('--runs must be an integer between 1 and 10.');
  }
  return {
    levels: Array.from(new Set(levels)),
    runsPerLevel,
    withImages: args.includes('--with-images'),
    gate: args.includes('--gate'),
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
