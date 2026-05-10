// Manual harness for the full passage orchestrator. Picks 5 random
// targets at the requested level, calls generatePassage, and verifies
// the DB row count + image-key prefixes + evidence quotes.
//
// Usage:
//   npm run test:passage -- 2
//   npm run test:passage -- 2 garden

import './_bootstrap-env';
import { and, count, eq } from 'drizzle-orm';
import { db } from '../src/lib/db';
import {
  readingPassages,
  readingQuestions,
  storyPages,
  vocabulary,
} from '../src/lib/db/schema';
import { generatePassage } from '../src/lib/reading/generate';
import { getQuestionTypeMix, getReadingLevel } from '../src/lib/reading/levels';

const TARGET_COUNT = 5;

async function main() {
  // Accept positional level + optional seedTheme + the --skip-images
  // flag in any order.
  const args = process.argv.slice(2);
  const skipImages = args.includes('--skip-images');
  const positional = args.filter((a) => !a.startsWith('--'));
  const levelArg = positional.find((a) => /^\d+$/.test(a));
  const seedTheme = positional.find((a) => a !== levelArg);
  const levelId = parseInt(levelArg ?? '', 10);
  if (!Number.isInteger(levelId) || levelId < 1 || levelId > 5) {
    console.error(
      'Usage: npm run test:passage -- <readingLevel 1-5> [seedTheme] [--skip-images]',
    );
    process.exit(1);
  }
  const level = getReadingLevel(levelId);
  console.log(`Reading level ${level.id} (${level.name}) → AF&F ${level.targetAfFLevel}`);
  if (skipImages) {
    console.log(`MODE: skip-images (no Gemini calls, status='draft')`);
  }
  console.log('');

  // Pick targets. When the level emits vocab_matching questions, the
  // pair illustrations require picture-able words — number / abstract /
  // discourse-marker rows produce confusing Gemini output. Filter them
  // out at selection time so the target set is safe to feed into the
  // pair generator. Levels with vocab_matching=0 in their mix (none
  // currently, but future levels could turn it off) skip the filter.
  const queryMix = getQuestionTypeMix(levelId);
  const needsPicturable = queryMix.vocab_matching > 0;

  const baseConditions = [
    eq(vocabulary.afFLevel, level.targetAfFLevel),
    eq(vocabulary.isFunctionWord, false),
    eq(vocabulary.isScaffold, false),
  ];
  if (needsPicturable) baseConditions.push(eq(vocabulary.isPicturable, true));

  const candidates = await db
    .select({
      id: vocabulary.id,
      word: vocabulary.word,
      afFUnit: vocabulary.afFUnit,
      isPicturable: vocabulary.isPicturable,
    })
    .from(vocabulary)
    .where(and(...baseConditions));
  if (candidates.length < TARGET_COUNT) {
    console.error(
      `Only ${candidates.length} ${needsPicturable ? 'picturable curriculum' : 'curriculum'} words at AF&F ${level.targetAfFLevel}.`,
    );
    process.exit(1);
  }
  const targets = candidates.sort(() => Math.random() - 0.5).slice(0, TARGET_COUNT);
  console.log(
    `Random targets${needsPicturable ? ' (filter: is_picturable=true)' : ''}:`,
  );
  for (const t of targets)
    console.log(`  ${t.word.padEnd(20)} (unit ${t.afFUnit ?? '?'})`);
  if (seedTheme) console.log(`Seed theme: ${seedTheme}`);
  console.log('');

  const result = await generatePassage({
    readingLevelId: levelId,
    targetVocabIds: targets.map((t) => t.id),
    seedTheme,
    skipImages,
  });

  // ---- Pretty-print ----
  console.log('═══ RESULT ═══════════════════════════════════════════════');
  console.log(`passageId:        ${result.passageId}`);
  console.log(`status:           ${result.status}`);
  console.log(
    `passageReady:     ${result.qualityReport.passageReady} ` +
      `(prose=${result.qualityReport.proseScore.toFixed(2)}, ` +
      `questions=${result.qualityReport.questionsScore.toFixed(2)}, ` +
      `images=${result.qualityReport.imagesValid ? 'valid' : 'invalid'})`,
  );
  console.log('');
  console.log('Timing (ms):');
  for (const [k, v] of Object.entries(result.timing)) {
    console.log(`  ${k.padEnd(12)} ${v.toString().padStart(7)}`);
  }
  console.log('');
  console.log('Cost:');
  console.log(`  total input tok:   ${result.cost.totalInputTokens}`);
  console.log(`  total output tok:  ${result.cost.totalOutputTokens}`);
  console.log(
    `  image calls:       ${skipImages ? '0 (skipped)' : result.cost.imageCallsCount}`,
  );
  console.log('');
  if (result.issues.length === 0) {
    console.log('issues: (none)');
  } else {
    console.log(`issues (${result.issues.length}):`);
    const errs = result.issues.filter((i) => i.severity === 'error');
    const warns = result.issues.filter((i) => i.severity === 'warning');
    console.log(`  ${errs.length} errors, ${warns.length} warnings`);
    if (errs.length) {
      console.log('  errors:');
      for (const e of errs.slice(0, 5)) {
        console.log(`    [${e.stage}] ${describeIssue(e)}`);
      }
      if (errs.length > 5) console.log(`    …and ${errs.length - 5} more`);
    }
  }
  console.log('');

  if (result.status === 'failed') {
    console.log('═══ FAILED — no DB row written. Exiting non-zero.');
    process.exit(1);
  }

  // ---- DB verification ----
  console.log('═══ DB VERIFICATION ══════════════════════════════════════');
  const [passageRow] = await db
    .select()
    .from(readingPassages)
    .where(eq(readingPassages.id, result.passageId));
  if (!passageRow) {
    console.error('  ✗ no readingPassages row found for the returned id');
    process.exit(1);
  }
  console.log(`  ✓ readingPassages row exists`);
  console.log(`    title:             "${passageRow.title}"`);
  console.log(`    status:            ${passageRow.status}`);
  console.log(`    pageCount:         ${passageRow.pageCount}`);
  console.log(`    coverImageKey:     ${passageRow.coverImageKey}`);
  console.log(`    isActive:          ${passageRow.isActive}`);
  console.log(`    targetVocabIds:    ${(passageRow.targetVocabIds as string[]).length} ids`);

  const [pageCount] = await db
    .select({ n: count() })
    .from(storyPages)
    .where(eq(storyPages.passageId, result.passageId));
  const [qCount] = await db
    .select({ n: count() })
    .from(readingQuestions)
    .where(eq(readingQuestions.passageId, result.passageId));
  console.log(`  ✓ storyPages rows:         ${pageCount?.n} (expected ${passageRow.pageCount})`);
  console.log(`  ✓ readingQuestions rows:   ${qCount?.n} (expected 5)`);

  // image_key prefix sanity check (or NULL check under --skip-images)
  const pageRows = await db
    .select({ pageNumber: storyPages.pageNumber, imageKey: storyPages.imageKey })
    .from(storyPages)
    .where(eq(storyPages.passageId, result.passageId));
  if (skipImages) {
    const allNull = pageRows.every((r) => r.imageKey === null);
    console.log(`  ${allNull ? '✓' : '✗'} every page image_key is NULL (skip-images)`);
  } else {
    const prefix = `story-images/${result.passageId}/`;
    const allPrefixed = pageRows.every((r) => r.imageKey?.startsWith(prefix));
    console.log(`  ${allPrefixed ? '✓' : '✗'} every page image_key starts with ${prefix}`);
  }

  // mcq evidence_quote presence + vocab_matching V2 payload introspection
  const qRows = await db
    .select({
      questionType: readingQuestions.questionType,
      questionText: readingQuestions.questionText,
      evidenceQuote: readingQuestions.evidenceQuote,
      payload: readingQuestions.payload,
    })
    .from(readingQuestions)
    .where(eq(readingQuestions.passageId, result.passageId));
  const mcq = qRows.filter((q) => q.questionType === 'mcq_comprehension');
  const mcqEvidenceOk = mcq.every((q) => q.evidenceQuote && q.evidenceQuote.length > 0);
  console.log(`  ${mcqEvidenceOk ? '✓' : '✗'} every MCQ has a non-empty evidence_quote`);

  // type distribution
  const typeCounts: Record<string, number> = {};
  for (const q of qRows) typeCounts[q.questionType] = (typeCounts[q.questionType] ?? 0) + 1;
  console.log(`    type distribution: ${JSON.stringify(typeCounts)}`);

  // Vocab-matching V2 inspection.
  const vocabRow = qRows.find((q) => q.questionType === 'vocab_matching');
  if (vocabRow) {
    const payload = vocabRow.payload as {
      version?: number;
      pairs?: { word: string; vocabId: string; imageKey: string }[];
    };
    console.log('');
    console.log('vocab_matching question:');
    console.log(`  text:   ${vocabRow.questionText}`);
    console.log(`  payload.version: ${payload.version}`);
    if (payload.pairs) {
      console.log(`  pairs (${payload.pairs.length}):`);
      const expectedPrefix = `story-images/${result.passageId}/vocab-`;
      const expectedSentinelPrefix = `skipped:vocab-`;
      for (const p of payload.pairs) {
        const ok =
          p.imageKey?.startsWith(expectedPrefix) ||
          p.imageKey?.startsWith(expectedSentinelPrefix)
            ? '✓'
            : '✗';
        console.log(`    ${ok} word="${p.word}" vocabId=${p.vocabId.slice(0, 8)}…`);
        console.log(`       imageKey=${p.imageKey}`);
      }
    } else {
      console.log('  ✗ payload.pairs missing');
    }
  } else {
    console.log('  ✗ no vocab_matching question found');
  }

  // generationMeta sanity
  const gm = passageRow.generationMeta as Record<string, unknown>;
  console.log(`  ✓ generationMeta keys: ${Object.keys(gm).sort().join(', ')}`);

  console.log('');
  console.log('Inspect SQL:');
  console.log(
    `  psql "$DATABASE_URL" -c "SELECT id, title, status, generation_meta FROM reading_passages WHERE id='${result.passageId}';"`,
  );
  console.log('');

  process.exit(0);
}

function describeIssue(i: Awaited<ReturnType<typeof generatePassage>>['issues'][number]): string {
  if (i.stage === 'pipeline') return `pipeline_error: ${i.message}`;
  return JSON.stringify(i);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
