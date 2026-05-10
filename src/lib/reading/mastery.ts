// Per-vocabulary mastery rollup, recomputed when a reading session
// completes. Drives the teacher's per-student reading-mastery view
// AND the vocab_word_mastered XP fire.
//
// Two parallel inputs feed each (student, vocab) row:
//
//   - Answer history: every studentReadingAnswers row this student
//     has on a question that tests this vocab id. vocab_matching
//     pairs attribute success/failure individually (parsed out of
//     answerGiven.pairings), MCQs use the question-level isCorrect
//     when readingQuestions.vocabWordId === this vocab id.
//
//   - Prose appearances: each completed session for this passage
//     adds +1 to exposures for every vocab word that appears in any
//     of the passage's prose pages. We bump the running counter
//     incrementally rather than re-tokenising every old session —
//     keeps the function O(words-in-this-passage) instead of
//     O(words-in-every-passage-this-kid-finished).
//
// Mastery score: decay-weighted, weighting recent answers more than
// older ones so a kid who once nailed a word but hasn't seen it in
// months drifts back below the mastery threshold over time. Stored
// as numeric(4,3); we round there.
//
// XP fire: when an updated row crosses 0.85 from below, fire
// vocab_word_mastered. The transition is point-in-time so we
// compare old → new on the same call.

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  readingQuestions,
  storyPages,
  studentReadingAnswers,
  studentReadingSessions,
  studentVocabularyMastery,
  vocabulary,
} from '@/lib/db/schema';
import { awardXp } from '@/lib/gamification/award';
import { tokenizeStoryText } from './generate/tokenize';

const MASTERY_THRESHOLD = 0.85;
/** Decay base — each month-old answer contributes (DECAY_PER_MONTH)^age
 *  as much weight as a fresh one. 0.9 → ~3 months ago weighs ~0.73,
 *  ~6 months ago weighs ~0.53. Tuned for a school-year cadence so a
 *  student who hasn't seen a word in a year still has it count, but
 *  recent performance dominates. */
const DECAY_PER_MONTH = 0.9;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

interface MasteryUpdate {
  vocabularyId: string;
  word: string;
  exposures: number;
  successes: number;
  failures: number;
  /** 0–1, three decimal places. */
  masteryScore: number;
  thresholdCrossed: boolean;
}

interface AttributedAnswer {
  vocabId: string;
  isCorrect: boolean;
  answeredAt: Date;
}

/**
 * Recompute mastery rows for every vocabulary word touched by this
 * passage (either tested in a question or appearing in the prose).
 * Called from the /complete endpoint after the session row is
 * marked completed.
 *
 * Returns the per-word updates for logging/inspection. The XP fires
 * happen inside this function so the caller doesn't have to know
 * about thresholds.
 */
export async function recomputeStudentVocabularyMastery(
  studentId: string,
  passageId: string,
): Promise<{ updates: MasteryUpdate[] }> {
  // 1. Identify the vocabulary set associated with this passage.
  //    Two contributors:
  //      a. vocab_matching pairs (each pair's vocabId)
  //      b. MCQ / sequence questions tagged with vocabWordId
  //      c. cumulative vocab tokens that appear in the prose
  const questions = await db
    .select({
      questionType: readingQuestions.questionType,
      vocabWordId: readingQuestions.vocabWordId,
      payload: readingQuestions.payload,
    })
    .from(readingQuestions)
    .where(eq(readingQuestions.passageId, passageId));

  const vocabIdsFromQuestions = new Set<string>();
  for (const q of questions) {
    if (q.vocabWordId) vocabIdsFromQuestions.add(q.vocabWordId);
    if (q.questionType === 'vocab_matching') {
      const payload = q.payload as
        | { pairs?: { vocabId?: string }[] }
        | null;
      for (const p of payload?.pairs ?? []) {
        if (p.vocabId) vocabIdsFromQuestions.add(p.vocabId);
      }
    }
  }

  // 2. Tokenise this passage's prose against the full vocabulary
  //    table and collect any matched vocabIds. The tokenizer's
  //    morphology layer normalises -s/-ed/-ing forms, so a story
  //    that uses "throws" still credits "throw".
  const pages = await db
    .select({
      pageNumber: storyPages.pageNumber,
      text: storyPages.text,
    })
    .from(storyPages)
    .where(eq(storyPages.passageId, passageId));

  const allVocab = await db
    .select({ id: vocabulary.id, word: vocabulary.word })
    .from(vocabulary);

  const vocabIdsFromProse = new Set<string>();
  for (const page of pages) {
    const result = tokenizeStoryText(page.text, allVocab);
    for (const m of result.matched) {
      if (m.vocabId) vocabIdsFromProse.add(m.vocabId);
    }
  }

  const allVocabIds = new Set([
    ...vocabIdsFromQuestions,
    ...vocabIdsFromProse,
  ]);
  if (allVocabIds.size === 0) return { updates: [] };

  // Resolve the words for nicer logging + the XP source label.
  const vocabRows = await db
    .select({ id: vocabulary.id, word: vocabulary.word })
    .from(vocabulary)
    .where(inArray(vocabulary.id, [...allVocabIds]));
  const wordById = new Map(vocabRows.map((r) => [r.id, r.word]));

  // 3. Pull this student's existing mastery rows so we can detect
  //    threshold-cross transitions and preserve cumulative
  //    exposures.
  const existingRows = await db
    .select()
    .from(studentVocabularyMastery)
    .where(
      and(
        eq(studentVocabularyMastery.studentId, studentId),
        inArray(studentVocabularyMastery.vocabularyId, [...allVocabIds]),
      ),
    );
  const existingByVocabId = new Map(
    existingRows.map((r) => [r.vocabularyId, r]),
  );

  // 4. Pull the full answer history (across ALL the student's
  //    reading sessions, not just this passage) for the relevant
  //    vocabularies. The vocab attribution is per-pair for
  //    vocab_matching and per-question for MCQ/sequence with a
  //    tagged vocabWordId.
  const history = await loadAnswerHistory(studentId, allVocabIds);

  // Group attributions by vocabId.
  const attributionsByVocabId = new Map<string, AttributedAnswer[]>();
  for (const a of history) {
    const list = attributionsByVocabId.get(a.vocabId) ?? [];
    list.push(a);
    attributionsByVocabId.set(a.vocabId, list);
  }

  // 5. Compute + UPSERT one row per vocabId.
  const updates: MasteryUpdate[] = [];
  const now = new Date();

  await db.transaction(async (tx) => {
    for (const vocabId of allVocabIds) {
      const word = wordById.get(vocabId) ?? '?';
      const attribs = attributionsByVocabId.get(vocabId) ?? [];
      const successes = attribs.filter((a) => a.isCorrect).length;
      const failures = attribs.length - successes;
      const masteryScore = computeDecayWeightedScore(attribs, now);
      const exposureBump = vocabIdsFromProse.has(vocabId) ? 1 : 0;

      const existing = existingByVocabId.get(vocabId);
      const oldScore = existing ? Number(existing.masteryScore) : 0;
      const newExposures = (existing?.exposures ?? 0) + exposureBump;
      const lastSeenAt = mostRecentAnswerAt(attribs) ?? now;

      // numeric(4,3) — round to 3 places at the boundary.
      const scoreString = masteryScore.toFixed(3);

      await tx
        .insert(studentVocabularyMastery)
        .values({
          studentId,
          vocabularyId: vocabId,
          exposures: newExposures,
          successes,
          failures,
          lastSeenAt,
          masteryScore: scoreString,
          masteryUpdatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            studentVocabularyMastery.studentId,
            studentVocabularyMastery.vocabularyId,
          ],
          set: {
            exposures: sql`${studentVocabularyMastery.exposures} + ${exposureBump}`,
            successes,
            failures,
            lastSeenAt,
            masteryScore: scoreString,
            masteryUpdatedAt: now,
          },
        });

      updates.push({
        vocabularyId: vocabId,
        word,
        exposures: newExposures,
        successes,
        failures,
        masteryScore,
        thresholdCrossed:
          oldScore < MASTERY_THRESHOLD && masteryScore >= MASTERY_THRESHOLD,
      });
    }
  });

  // 6. Outside the transaction: fire vocab_word_mastered for each
  //    crossing. Using the existing awardXp helper which already
  //    swallows errors so XP failures don't propagate.
  for (const u of updates) {
    if (!u.thresholdCrossed) continue;
    try {
      await awardXp(studentId, 'vocab_word_mastered', u.vocabularyId);
    } catch (err) {
      console.error(
        `[mastery] vocab_word_mastered XP failed for ${u.word} (${u.vocabularyId}): ${err}`,
      );
    }
  }

  return { updates };
}

// ---------- Helpers ----------

/** For each (sessionId, questionId) in this student's history that
 *  tests one of the relevant vocab ids, expand into per-vocab
 *  attributions. Vocab_matching pairs decompose into N attributions
 *  (one per pair) so a partially-right answer credits the words
 *  the kid did pair correctly. */
async function loadAnswerHistory(
  studentId: string,
  vocabIds: Set<string>,
): Promise<AttributedAnswer[]> {
  const rows = await db
    .select({
      questionType: readingQuestions.questionType,
      vocabWordId: readingQuestions.vocabWordId,
      questionPayload: readingQuestions.payload,
      answerGiven: studentReadingAnswers.answerGiven,
      isCorrect: studentReadingAnswers.isCorrect,
      answeredAt: studentReadingAnswers.answeredAt,
    })
    .from(studentReadingAnswers)
    .innerJoin(
      studentReadingSessions,
      eq(studentReadingAnswers.sessionId, studentReadingSessions.id),
    )
    .innerJoin(
      readingQuestions,
      eq(studentReadingAnswers.questionId, readingQuestions.id),
    )
    .where(eq(studentReadingSessions.studentId, studentId));

  const out: AttributedAnswer[] = [];
  for (const r of rows) {
    if (r.questionType === 'vocab_matching') {
      // Re-derive per-pair correctness from the stored answer.
      // Schema: answerGiven = { pairings: [{wordVocabId, pictureVocabId}] }
      // and questionPayload.pairs is the canonical word list.
      const ans = r.answerGiven as
        | { pairings?: { wordVocabId?: string; pictureVocabId?: string }[] }
        | null;
      const payload = r.questionPayload as
        | { pairs?: { vocabId?: string }[] }
        | null;
      const canonical = new Set(
        (payload?.pairs ?? [])
          .map((p) => p.vocabId)
          .filter((v): v is string => !!v),
      );
      // Index pairings by wordVocabId for O(1) lookup.
      const pairingByWord = new Map<string, string>();
      for (const p of ans?.pairings ?? []) {
        if (p.wordVocabId && p.pictureVocabId) {
          pairingByWord.set(p.wordVocabId, p.pictureVocabId);
        }
      }
      for (const wordId of canonical) {
        if (!vocabIds.has(wordId)) continue;
        const picked = pairingByWord.get(wordId);
        // Correct iff the kid paired this word with its own picture.
        // Missing pairing = failure (the kid couldn't / didn't match it).
        const isCorrect = picked !== undefined && picked === wordId;
        out.push({ vocabId: wordId, isCorrect, answeredAt: r.answeredAt });
      }
      continue;
    }
    // MCQ / sequence: only attribute when the question is tagged
    // with a single vocabWordId. The orchestrator currently leaves
    // this NULL for MCQ + sequence_order — kept here for future
    // tagging without code changes.
    if (r.vocabWordId && vocabIds.has(r.vocabWordId)) {
      out.push({
        vocabId: r.vocabWordId,
        isCorrect: r.isCorrect,
        answeredAt: r.answeredAt,
      });
    }
  }
  return out;
}

/** Decay-weighted ratio of correct attributions to total. Each
 *  attribution's weight is DECAY_PER_MONTH^age_in_months. Returns 0
 *  when there are no attributions (so an "exposure-only" word with no
 *  test history sits at 0 mastery — the kid has SEEN it but not
 *  demonstrated it). Floored at 0, ceiled at 1. */
function computeDecayWeightedScore(
  attribs: AttributedAnswer[],
  now: Date,
): number {
  if (attribs.length === 0) return 0;
  let weightedCorrect = 0;
  let totalWeight = 0;
  for (const a of attribs) {
    const ageMs = Math.max(0, now.getTime() - a.answeredAt.getTime());
    const ageMonths = ageMs / MONTH_MS;
    const w = Math.pow(DECAY_PER_MONTH, ageMonths);
    totalWeight += w;
    if (a.isCorrect) weightedCorrect += w;
  }
  if (totalWeight === 0) return 0;
  const score = weightedCorrect / totalWeight;
  return Math.max(0, Math.min(1, score));
}

function mostRecentAnswerAt(attribs: AttributedAnswer[]): Date | null {
  if (attribs.length === 0) return null;
  let max = attribs[0]!.answeredAt;
  for (const a of attribs) {
    if (a.answeredAt > max) max = a.answeredAt;
  }
  return max;
}
