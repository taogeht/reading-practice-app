// Manual harness for Stages 4 + 5 (questions). Picks 5 random target
// vocab words at level 2 (or whichever level passed), runs Stage 1
// (plan), Stages 2+3 (validated prose), Stage 4 (questions), Stage 5
// (validate questions), and pretty-prints everything.
//
// If prose validation fails after maxAttempts, the harness still runs
// Stage 4 against the best prose attempt — degraded prose is reported
// in the output so we know whether the question quality is being
// pulled down by upstream issues.
//
// Usage:
//   npm run test:questions -- 2
//   npm run test:questions -- 2 garden

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
} from '../src/lib/reading/generate';
import {
  fetchTargetVocab,
  resolveCumulativeVocab,
} from '../src/lib/reading/generate/vocab';
import { getReadingLevel } from '../src/lib/reading/levels';

const TARGET_COUNT = 5;
const MAX_PROSE_ATTEMPTS = 3;

function summariseQuestionIssue(issue: QuestionValidationIssue): string {
  const sev = issue.severity === 'error' ? 'E' : 'W';
  switch (issue.type) {
    case 'evidence_not_found':
      return `[${sev}] q${issue.questionIndex} evidence_not_found: "${truncate(issue.evidenceQuote, 60)}"`;
    case 'evidence_page_mismatch':
      return `[${sev}] q${issue.questionIndex} evidence_page_mismatch: stated p${issue.statedPage}, found on p${issue.foundOnPage}`;
    case 'vocab_id_invalid':
      return `[${sev}] q${issue.questionIndex} pair[${issue.pairIndex}] vocab_id_invalid: word="${issue.word}" id="${issue.vocabId || '<empty>'}"`;
    case 'vocab_word_not_in_targets':
      return `[${sev}] q${issue.questionIndex} pair[${issue.pairIndex}] vocab_word_not_in_targets: "${issue.word}"`;
    case 'unknown_word_in_question':
      return `[${sev}] q${issue.questionIndex} unknown_word_in_question: "${issue.word}"`;
    case 'unknown_word_in_options':
      return `[${sev}] q${issue.questionIndex} option[${issue.optionIndex}] unknown_word: "${issue.word}"`;
    case 'question_too_long':
      return `[${sev}] q${issue.questionIndex} question_too_long: ${issue.wordCount}/${issue.max}`;
    case 'sequence_event_not_in_story':
      return `[${sev}] q${issue.questionIndex} event[${issue.eventIndex}]_not_in_story: "${truncate(issue.event, 60)}"`;
    case 'wrong_question_count':
      return `[${sev}] wrong_question_count: expected ${issue.expected}, got ${issue.actual}`;
    case 'wrong_type_distribution':
      return `[${sev}] wrong_type_distribution: ${JSON.stringify(issue.got)}`;
    case 'legacy_vocab_matching_format':
      return `[${sev}] q${issue.questionIndex} legacy_vocab_matching_format (pre-V2 row, regenerate)`;
    case 'pair_image_key_invalid':
      return `[${sev}] q${issue.questionIndex} pair[${issue.pairIndex}] pair_image_key_invalid: "${issue.imageKey || '<empty>'}"`;
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + '…';
}

function printQuestion(q: GeneratedQuestion, index: number): void {
  console.log(`Q${index + 1}. [${q.type}] ${q.questionText}`);
  if (q.type === 'mcq_comprehension') {
    for (let i = 0; i < q.payload.options.length; i++) {
      const marker = i === q.payload.correctIndex ? '✓' : ' ';
      console.log(`     ${marker} ${String.fromCharCode(65 + i)}. ${q.payload.options[i]}`);
    }
    console.log(`     evidence (page ${q.evidencePageNumber}): "${q.evidenceQuote}"`);
  } else if (q.type === 'vocab_matching') {
    for (const p of q.payload.pairs) {
      const id = p.vocabId ? p.vocabId.slice(0, 8) + '…' : '<unmapped>';
      const keyTail = p.imageKey ? p.imageKey.split('/').slice(-1)[0] : '<no image>';
      console.log(`     • ${p.word.padEnd(14)} → ${keyTail}  [${id}]`);
    }
  } else {
    for (let i = 0; i < q.payload.events.length; i++) {
      console.log(`     ${i + 1}. ${q.payload.events[i]}`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const levelArg = args[0];
  const skipImages = args.includes('--skip-images');
  const positional = args.filter((a) => !a.startsWith('--'));
  const flagFreeLevelArg = positional.find((a) => /^\d+$/.test(a));
  const seedTheme = positional.find((a) => a !== flagFreeLevelArg);
  const levelId = parseInt(flagFreeLevelArg ?? levelArg ?? '', 10);
  if (!Number.isInteger(levelId) || levelId < 1 || levelId > 5) {
    console.error(
      'Usage: npm run test:questions -- <readingLevel 1-5> [seedTheme] [--skip-images]',
    );
    process.exit(1);
  }
  const level = getReadingLevel(levelId);
  console.log(`Reading level ${level.id} (${level.name}) → AF&F ${level.targetAfFLevel}`);
  if (skipImages) {
    console.log(`MODE: skip-images (no Gemini calls for vocab pair images)`);
  }
  console.log('');

  // ---- Pick targets ----
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
  for (const t of targets) {
    console.log(`  ${t.word.padEnd(20)} (unit ${t.afFUnit ?? '?'}) [${t.id.slice(0, 8)}…]`);
  }
  if (seedTheme) console.log(`Seed theme: ${seedTheme}`);
  console.log('');

  // ---- Stage 1 ----
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

  // ---- Stages 2+3 ----
  console.log(`Running Stages 2+3 (prose with regen, maxAttempts=${MAX_PROSE_ATTEMPTS})…`);
  const proseResult = await generateValidatedProse({
    plan,
    readingLevelId: levelId,
    maxAttempts: MAX_PROSE_ATTEMPTS,
  });
  const proseV = proseResult.finalValidation;
  console.log(
    `Prose: ${proseResult.attempts.length} attempt(s), ` +
      `errors=${proseV.errorCount}, warnings=${proseV.warningCount}, score=${proseV.qualityScore.toFixed(2)}, ` +
      `${proseResult.totalInputTokens}/${proseResult.totalOutputTokens} tok\n`,
  );
  if (proseV.errorCount > 0) {
    console.log(
      `⚠️  Prose validation failed (${proseV.errorCount} errors). Continuing with the best prose attempt.\n`,
    );
  }

  console.log('═══ FINAL PROSE ══════════════════════════════════════════');
  console.log(`Title: ${plan.title}\n`);
  for (const p of proseResult.finalPages) {
    console.log(`Page ${p.pageNumber}:`);
    console.log(`  ${p.text}`);
    console.log('');
  }

  // ---- Resolve target + cumulative for Stages 4-5 ----
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

  // ---- Stage 4 ----
  console.log('Running Stage 4 (questions)…');
  const harnessPassageId = randomUUID();
  const qResult = await generateQuestions({
    plan,
    pages: proseResult.finalPages,
    targetVocabRows,
    cumulativeVocabRows,
    readingLevelId: levelId,
    passageId: harnessPassageId,
    skipImages,
  });
  console.log(
    `Questions: ${qResult.questions.length} generated — ` +
      `${qResult.meta.inputTokens}/${qResult.meta.outputTokens} tok · ${qResult.meta.durationMs}ms · ` +
      `vocab images: ${skipImages ? '0 (skipped)' : qResult.vocabImageCallCount}\n`,
  );

  console.log('═══ QUESTIONS ════════════════════════════════════════════');
  for (let i = 0; i < qResult.questions.length; i++) {
    printQuestion(qResult.questions[i]!, i);
    console.log('');
  }

  // ---- Stage 5 ----
  console.log('Running Stage 5 (validate questions)…');
  const qVal = validateQuestions(
    qResult.questions,
    proseResult.finalPages,
    targetVocabRows.map((r) => ({ id: r.id, word: r.word })),
    cumulativeVocabRows,
    levelId,
    harnessPassageId,
  );

  console.log('');
  console.log('═══ QUESTION VALIDATION ══════════════════════════════════');
  console.log(`valid:          ${qVal.valid} (errorCount === 0)`);
  console.log(`errors:         ${qVal.errorCount}`);
  console.log(`warnings:       ${qVal.warningCount}`);
  console.log(`qualityScore:   ${qVal.qualityScore.toFixed(2)}`);
  console.log(`type counts:    ${qVal.stats.mcqCount} MCQ, ${qVal.stats.vocabMatchingCount} vocab_matching, ${qVal.stats.sequenceOrderCount} sequence_order`);
  if (qVal.issues.length === 0) {
    console.log('issues:         (none)');
  } else {
    console.log(`issues (${qVal.issues.length}):`);
    // Sort errors first.
    const sorted = [...qVal.issues].sort((a, b) =>
      a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1,
    );
    for (const issue of sorted) {
      console.log(`  ${summariseQuestionIssue(issue)}`);
    }
  }
  console.log('');

  console.log('═══ COMBINED SUMMARY ═════════════════════════════════════');
  console.log(`Prose qualityScore:     ${proseV.qualityScore.toFixed(2)} ${proseV.errorCount === 0 ? '✓' : '✗'}`);
  console.log(`Questions qualityScore: ${qVal.qualityScore.toFixed(2)} ${qVal.valid ? '✓' : '✗'}`);
  console.log('');

  process.exit(qVal.valid && proseV.errorCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
