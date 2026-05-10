// Manual harness for Stage 5 (page images). Runs the full pipeline:
// Stage 1 (plan) → 2+3 (validated prose) → 4 (questions, validated)
// → 5 (page images), saves the buffers under ~/Desktop/test-images/<uuid>/
// so we can open them locally and visually check character consistency.
//
// On per-page image failures the harness reports + skips, mirroring
// the spec ("if an image fails, the test script reports it and moves
// on"). If page 1 fails the lib throws and we exit 1.
//
// Usage:
//   npm run test:images -- 2
//   npm run test:images -- 2 garden

import './_bootstrap-env';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { vocabulary } from '../src/lib/db/schema';
import {
  generatePassageImages,
  generatePassagePlan,
  generateQuestions,
  generateValidatedProse,
  validatePassageImages,
  validateQuestions,
  type GeneratedPageImage,
  type ImageValidationIssue,
} from '../src/lib/reading/generate';
import {
  fetchTargetVocab,
  resolveCumulativeVocab,
} from '../src/lib/reading/generate/vocab';
import { getReadingLevel } from '../src/lib/reading/levels';

const TARGET_COUNT = 5;
const MAX_PROSE_ATTEMPTS = 3;

function summariseIssue(issue: ImageValidationIssue): string {
  const sev = issue.severity === 'error' ? 'E' : 'W';
  switch (issue.type) {
    case 'image_buffer_empty':
      return `[${sev}] page ${issue.pageNumber}: image_buffer_empty`;
    case 'image_too_small':
      return `[${sev}] page ${issue.pageNumber}: image_too_small (${issue.sizeBytes}B)`;
    case 'image_too_large':
      return `[${sev}] page ${issue.pageNumber}: image_too_large (${issue.sizeBytes}B)`;
    case 'image_count_mismatch':
      return `[${sev}] image_count_mismatch: expected ${issue.expected}, actual ${issue.actual}`;
    case 'mime_type_unexpected':
      return `[${sev}] page ${issue.pageNumber}: mime_type_unexpected (${issue.mimeType})`;
  }
}

function fileSafe(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 60);
}

function ext(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  return 'png';
}

async function main() {
  const args = process.argv.slice(2);
  const levelArg = args[0];
  const seedTheme = args[1];
  const levelId = parseInt(levelArg ?? '', 10);
  if (!Number.isInteger(levelId) || levelId < 1 || levelId > 5) {
    console.error('Usage: npm run test:images -- <readingLevel 1-5> [seedTheme]');
    process.exit(1);
  }
  const level = getReadingLevel(levelId);
  console.log(`Reading level ${level.id} (${level.name}) → AF&F ${level.targetAfFLevel}\n`);

  // ---- Targets ----
  const candidates = await db
    .select({ id: vocabulary.id, word: vocabulary.word, afFUnit: vocabulary.afFUnit })
    .from(vocabulary)
    .where(
      and(
        eq(vocabulary.afFLevel, level.targetAfFLevel),
        eq(vocabulary.isFunctionWord, false),
        eq(vocabulary.isScaffold, false),
      ),
    );
  if (candidates.length < TARGET_COUNT) {
    console.error(`Only ${candidates.length} curriculum words at AF&F ${level.targetAfFLevel}.`);
    process.exit(1);
  }
  const targets = candidates.sort(() => Math.random() - 0.5).slice(0, TARGET_COUNT);
  console.log('Random targets:');
  for (const t of targets) console.log(`  ${t.word.padEnd(20)} (unit ${t.afFUnit ?? '?'})`);
  if (seedTheme) console.log(`Seed theme: ${seedTheme}`);
  console.log('');

  // ---- Stage 1 ----
  console.log('Stage 1 (plan)…');
  const planResult = await generatePassagePlan({
    readingLevel: levelId,
    targetVocabIds: targets.map((t) => t.id),
    seedTheme,
  });
  const plan = planResult.plan;
  console.log(`  "${plan.title}" — ${plan.pages.length} pages — ${planResult.meta.durationMs}ms`);
  console.log(`  characters: ${plan.characters.map((c) => c.name).join(', ')}`);
  console.log('');

  // ---- Stages 2+3 ----
  console.log(`Stages 2+3 (prose with regen)…`);
  const proseResult = await generateValidatedProse({
    plan,
    readingLevelId: levelId,
    maxAttempts: MAX_PROSE_ATTEMPTS,
  });
  const pv = proseResult.finalValidation;
  console.log(
    `  errors=${pv.errorCount}, warnings=${pv.warningCount}, score=${pv.qualityScore.toFixed(2)}`,
  );
  console.log('');

  // ---- Stage 4 ----
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

  console.log('Stage 4 (questions)…');
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
  console.log(
    `  ${qResult.questions.length} questions, errors=${qVal.errorCount}, warnings=${qVal.warningCount}, score=${qVal.qualityScore.toFixed(2)}`,
  );
  console.log('');

  // ---- Stage 5 ----
  console.log('Stage 5 (page images)…');
  const imgResult = await generatePassageImages({
    plan,
    pages: proseResult.finalPages,
  });
  console.log(
    `  ${imgResult.pages.length} images generated in ${imgResult.meta.totalDurationMs}ms ` +
      `(per-page: [${imgResult.meta.perPageDurationMs.map((d) => `${d}ms`).join(', ')}])`,
  );
  console.log('');

  // ---- Stage 5 validation ----
  const imgVal = validatePassageImages(imgResult.pages, proseResult.finalPages);
  console.log('═══ IMAGE VALIDATION ═════════════════════════════════════');
  console.log(`valid:        ${imgVal.valid}`);
  console.log(`errors:       ${imgVal.errorCount}`);
  console.log(`warnings:     ${imgVal.warningCount}`);
  console.log(`qualityScore: ${imgVal.qualityScore.toFixed(2)}`);
  if (imgVal.issues.length === 0) {
    console.log('issues:       (none)');
  } else {
    console.log(`issues (${imgVal.issues.length}):`);
    for (const issue of imgVal.issues) console.log(`  ${summariseIssue(issue)}`);
  }
  console.log('');

  // ---- Save buffers locally ----
  const passageId = randomUUID();
  // mkdir with recursive:true creates ~/Desktop/test-images/ itself if
  // missing, plus the per-run subdirectory in one call.
  const outDir = path.join(
    homedir(),
    'Desktop',
    'test-images',
    `${fileSafe(plan.title)}__${passageId.slice(0, 8)}`,
  );
  await mkdir(outDir, { recursive: true });
  const filePaths: string[] = [];
  for (const img of imgResult.pages) {
    const filename = `page-${img.pageNumber.toString().padStart(2, '0')}.${ext(img.mimeType)}`;
    const filepath = path.join(outDir, filename);
    await writeFile(filepath, img.buffer);
    filePaths.push(filepath);
  }

  // ---- Per-page summary ----
  console.log('═══ PER-PAGE IMAGE DETAILS ═══════════════════════════════');
  const sizeKB = (bytes: number) => (bytes / 1024).toFixed(1);
  for (const img of imgResult.pages) {
    const ref = img.referenceImageUsed ? '+ref' : '    ';
    const filename = path.join(
      outDir,
      `page-${img.pageNumber.toString().padStart(2, '0')}.${ext(img.mimeType)}`,
    );
    console.log(
      `  page ${img.pageNumber.toString().padStart(2)} ${ref} · ` +
        `${sizeKB(img.buffer.length).padStart(7)}KB · ` +
        `${img.mimeType.padEnd(10)} · ` +
        `${filename}`,
    );
  }
  console.log('');
  console.log(`Output dir: ${outDir}`);
  console.log(`(open with: open "${outDir}")`);
  console.log('');

  // ---- Combined summary ----
  console.log('═══ PIPELINE SUMMARY ═════════════════════════════════════');
  console.log(`Plan:             "${plan.title}" (${plan.pages.length} pages)`);
  console.log(`Prose score:      ${pv.qualityScore.toFixed(2)}`);
  console.log(`Questions score:  ${qVal.qualityScore.toFixed(2)}`);
  console.log(`Images score:     ${imgVal.qualityScore.toFixed(2)}`);
  console.log('');

  process.exit(imgVal.valid ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
