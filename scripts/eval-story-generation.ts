// Live, cost-bearing regression harness for plan/prose/question generation.
// Uses deterministic curriculum targets so runs remain comparable over time.
// By default images are skipped; generated passages are persisted as drafts.
//
// Usage:
//   npm run eval:story-generation
//   npm run eval:story-generation -- --levels=1,2 --runs=2
//   npm run eval:story-generation -- --with-images --gate
//   npm run eval:story-generation -- --provider=hetzner-qwen
//
// --provider pins the text model for this run regardless of the
// text.generationModel admin setting, so two runs over the same deterministic
// targets are directly comparable.
//   npm run eval:story-generation -- --runs=10 --output-dir=.artifacts/story-generation-evals

import './_bootstrap-env';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format } from 'node:util';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { vocabulary } from '../src/lib/db/schema';
import { sanitizeError } from '../src/lib/logger';
import {
  evaluateStoryGeneration,
  type StoryGenerationEvaluation,
  type StoryGenerationSample,
} from '../src/lib/reading/evaluation';
import { generatePassage } from '../src/lib/reading/generate';
import { setTextProviderOverride, type TextProvider } from '../src/lib/llm';
import { getReadingLevel } from '../src/lib/reading/levels';

interface CliOptions {
  levels: number[];
  runsPerLevel: number;
  withImages: boolean;
  gate: boolean;
  outputDir: string;
  /** null = leave provider resolution to the setting/env as normal. */
  provider: TextProvider | null;
}

interface ArtifactPaths {
  log: string;
  events: string;
  report: string;
}

async function main(): Promise<number> {
  const options = parseOptions(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const artifacts = initializeArtifacts(options.outputDir, startedAt);
  installConsoleTee(artifacts.log);
  const samples: StoryGenerationSample[] = [];
  const targetsByLevel = new Map<number, string[]>();
  let fatalError: ReturnType<typeof sanitizeError> | null = null;

  setTextProviderOverride(options.provider);

  console.log(
    `Story evaluation: levels=${options.levels.join(',')} runs=${options.runsPerLevel}`
      + ` images=${options.withImages ? 'on' : 'skipped'}`
      + ` provider=${options.provider ?? 'configured default'}`,
  );
  console.log('This live harness calls AI providers and writes generated passage rows.');
  console.log(`Durable log: ${artifacts.log}`);
  console.log(`Structured events: ${artifacts.events}`);
  appendEvent(artifacts.events, {
    event: 'run_started',
    recordedAt: startedAt,
    options,
    artifacts,
  });

  try {
    // Resolve every requested level before the first provider call. A missing
    // curriculum level should fail cheaply instead of wasting a partial run.
    for (const levelId of options.levels) {
      const targetIds = await deterministicTargets(levelId);
      targetsByLevel.set(levelId, targetIds);
      appendEvent(artifacts.events, {
        event: 'level_preflight_completed',
        recordedAt: new Date().toISOString(),
        readingLevelId: levelId,
        targetIds,
      });
      console.log(`level-${levelId} preflight: ${targetIds.length} deterministic targets`);
    }

    for (const levelId of options.levels) {
      const targetIds = targetsByLevel.get(levelId)!;
      for (let run = 1; run <= options.runsPerLevel; run++) {
        const caseId = `level-${levelId}-run-${run}`;
        appendEvent(artifacts.events, {
          event: 'case_started',
          recordedAt: new Date().toISOString(),
          caseId,
          readingLevelId: levelId,
          run,
          targetIds,
        });

        const result = await generatePassage({
          readingLevelId: levelId,
          targetVocabIds: targetIds,
          skipImages: !options.withImages,
        });
        const sample = { caseId, readingLevelId: levelId, result };
        samples.push(sample);
        appendEvent(artifacts.events, {
          event: 'case_completed',
          recordedAt: new Date().toISOString(),
          run,
          targetIds,
          ...sample,
        });
        printCaseResult(sample);
      }
    }
  } catch (error) {
    fatalError = sanitizeError(error, 'story-generation-evaluation');
    appendEvent(artifacts.events, {
      event: 'run_error',
      recordedAt: new Date().toISOString(),
      error: fatalError,
      completedSamples: samples.length,
    });
    console.error('Story evaluation aborted:', fatalError.message);
  }

  const report = samples.length > 0 ? evaluateStoryGeneration(samples) : null;
  const reportsByLevel = Object.fromEntries(
    options.levels.flatMap((levelId) => {
      const levelSamples = samples.filter((sample) => sample.readingLevelId === levelId);
      return levelSamples.length > 0
        ? [[String(levelId), evaluateStoryGeneration(levelSamples)]]
        : [];
    }),
  ) as Record<string, StoryGenerationEvaluation>;
  const gatePassed =
    report !== null &&
    report.passed &&
    options.levels.every((levelId) => reportsByLevel[String(levelId)]?.passed === true);
  const completedAt = new Date().toISOString();
  const runRecord = {
    schemaVersion: 1,
    status: fatalError ? 'aborted' : 'completed',
    startedAt,
    completedAt,
    options,
    artifacts,
    fatalError,
    samples,
    report,
    reportsByLevel,
    gatePassed,
  };
  writeFileSync(artifacts.report, `${JSON.stringify(runRecord, null, 2)}\n`, 'utf8');
  appendEvent(artifacts.events, {
    event: 'run_finished',
    recordedAt: completedAt,
    status: runRecord.status,
    completedSamples: samples.length,
    fatalError,
    report,
    reportsByLevel,
    gatePassed,
  });

  if (report) {
    printReport(report);
    printReportsByLevel(reportsByLevel);
  }
  console.log(`Final JSON report: ${artifacts.report}`);
  console.log(`Full durable log: ${artifacts.log}`);

  if (fatalError) return 1;
  return options.gate && !gatePassed ? 1 : 0;
}

function printCaseResult(sample: StoryGenerationSample): void {
  const { caseId, result } = sample;
  const errors = result.issues.filter((issue) => issue.severity === 'error').length;
  const warnings = result.issues.length - errors;

  console.log(
    `${caseId}: status=${result.status} ready=${result.qualityReport.passageReady} ` +
      `prose=${result.qualityReport.proseScore.toFixed(2)} ` +
      `questions=${result.qualityReport.questionsScore.toFixed(2)} ` +
      `issues=${errors}e/${warnings}w ms=${result.timing.totalMs}`,
  );
  console.log(
    `  timing: plan=${result.timing.planMs} prose=${result.timing.proseMs} ` +
      `questions=${result.timing.questionsMs} images=${result.timing.imagesMs} ` +
      `uploads=${result.timing.uploadsMs} db=${result.timing.dbWriteMs}`,
  );
  console.log(
    `  usage: input_tokens=${result.cost.totalInputTokens} ` +
      `output_tokens=${result.cost.totalOutputTokens} image_calls=${result.cost.imageCallsCount}`,
  );
  for (const issue of result.issues) {
    const { stage, type, severity, ...details } = issue;
    console.log(
      `  ${severity.toUpperCase()} ${stage}.${type} ${JSON.stringify(details)}`,
    );
  }
}

function printReport(report: StoryGenerationEvaluation): void {
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
      console.log(
        `    ${issue.count}x ${issue.severity} ${issue.key}${words}`,
      );
    }
  }
}

function printReportsByLevel(
  reportsByLevel: Record<string, StoryGenerationEvaluation>,
): void {
  console.log('');
  console.log('Per-level evaluation');
  for (const [levelId, report] of Object.entries(reportsByLevel)) {
    const failedGates = report.gates
      .filter((gate) => !gate.passed)
      .map((gate) => gate.metric);
    console.log(
      `  level ${levelId}: ${report.passed ? 'PASS' : 'FAIL'} ` +
        `samples=${report.sampleCount} ready=${(report.contentReadyRate * 100).toFixed(1)}% ` +
        `prose=${report.meanProseScore.toFixed(3)} ` +
        `questions=${report.meanQuestionsScore.toFixed(3)} ` +
        `p50/p95=${report.p50TotalMs}/${report.p95TotalMs}ms` +
        (failedGates.length > 0 ? ` failed_gates=${failedGates.join(',')}` : ''),
    );
  }
}

function initializeArtifacts(outputDir: string, startedAt: string): ArtifactPaths {
  const absoluteOutputDir = resolve(process.cwd(), outputDir);
  const runId = startedAt.replace(/[:.]/g, '-');
  const prefix = resolve(absoluteOutputDir, `story-generation-${runId}`);
  const artifacts = {
    log: `${prefix}.log`,
    events: `${prefix}.jsonl`,
    report: `${prefix}.json`,
  };

  mkdirSync(absoluteOutputDir, { recursive: true });
  writeFileSync(artifacts.log, '', 'utf8');
  writeFileSync(artifacts.events, '', 'utf8');
  return artifacts;
}

function installConsoleTee(logPath: string): void {
  const originalLog = console.log.bind(console);
  const originalInfo = console.info.bind(console);
  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);

  const write = (args: unknown[]) => {
    appendFileSync(logPath, `${format(...args)}\n`, 'utf8');
  };

  console.log = (...args: unknown[]) => {
    write(args);
    originalLog(...args);
  };
  console.info = (...args: unknown[]) => {
    write(args);
    originalInfo(...args);
  };
  console.warn = (...args: unknown[]) => {
    write(args);
    originalWarn(...args);
  };
  console.error = (...args: unknown[]) => {
    write(args);
    originalError(...args);
  };
}

function appendEvent(path: string, event: Record<string, unknown>): void {
  appendFileSync(path, `${JSON.stringify(event)}\n`, 'utf8');
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
  const outputDirArg = args.find((arg) => arg.startsWith('--output-dir='));
  const levels = (levelsArg?.slice('--levels='.length) ?? '1,2')
    .split(',')
    .map(Number);
  const runsPerLevel = Number(runsArg?.slice('--runs='.length) ?? '1');
  const outputDir =
    outputDirArg?.slice('--output-dir='.length) ?? '.artifacts/story-generation-evals';
  if (
    levels.length === 0 ||
    levels.some((level) => !Number.isInteger(level) || level < 1 || level > 5)
  ) {
    throw new Error('--levels must be a comma-separated list containing 1-5.');
  }
  if (!Number.isInteger(runsPerLevel) || runsPerLevel < 1 || runsPerLevel > 10) {
    throw new Error('--runs must be an integer between 1 and 10.');
  }
  if (outputDir.trim().length === 0) {
    throw new Error('--output-dir must not be empty.');
  }
  const providerArg = args.find((arg) => arg.startsWith('--provider='));
  const provider = providerArg?.slice('--provider='.length);
  if (provider !== undefined && provider !== 'claude' && provider !== 'hetzner-qwen') {
    throw new Error("--provider must be 'claude' or 'hetzner-qwen'.");
  }
  return {
    levels: Array.from(new Set(levels)),
    runsPerLevel,
    withImages: args.includes('--with-images'),
    gate: args.includes('--gate'),
    outputDir,
    provider: provider ?? null,
  };
}

main()
  .then((exitCode) => {
    // The pg pool keeps the event loop alive, so exit explicitly (as the other
    // scripts/ entry points do) and carry the gate result in the exit code.
    process.exit(exitCode);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
