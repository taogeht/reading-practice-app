import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  classEnrollments,
  classPracticeUnits,
  practiceAttempts,
  practiceQuestions,
} from '@/lib/db/schema';
import { isAvailablePracticeUnit } from '@/lib/practice/units';

export const runtime = 'nodejs';

const QUESTIONS_PER_SESSION = 5;
const TARGET_OVERDUE = 2;
const TARGET_UNSEEN = 2;
const TARGET_WILDCARD = 1;
const MAX_REVIEW_PER_SESSION = 3; // cap so a struggling kid never gets a punishment session

// 5-box Leitner intervals in days. Box = consecutive correct answers from
// the latest attempt backwards (capped at 4). A single wrong answer resets to 0.
// Question is "due" when (now - last_attempt_at) >= INTERVAL_DAYS[box].
const INTERVAL_DAYS = [0, 1, 3, 7, 16];
const DAY_MS = 24 * 60 * 60 * 1000;

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

type QuestionRow = {
  id: string;
  questionType: string;
  prompt: string;
  correctAnswer: string;
  distractors: string[];
  payload: unknown;
  imageUrl: string | null;
  timesServed: number;
};

type Categorized = {
  q: QuestionRow;
  hasHistory: boolean;
  box: number; // 0-4
  dueAt: Date | null;
  lastWrongAt: Date | null;
};

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'student') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const unit = Number(url.searchParams.get('unit'));
  if (!isAvailablePracticeUnit(unit)) {
    return NextResponse.json({ error: 'Invalid unit' }, { status: 400 });
  }

  // Enforce: student must be enrolled in a class that has this unit enabled
  const enabled = await db
    .select({ unit: classPracticeUnits.unit })
    .from(classPracticeUnits)
    .innerJoin(classEnrollments, eq(classEnrollments.classId, classPracticeUnits.classId))
    .where(and(eq(classEnrollments.studentId, user.id), eq(classPracticeUnits.unit, unit)))
    .limit(1);
  if (enabled.length === 0) {
    return NextResponse.json(
      { error: 'This unit is not enabled for your class.' },
      { status: 403 }
    );
  }

  // Pull the unit's active question pool. Bounded — units are sized in tens, not thousands.
  const allQuestions: QuestionRow[] = await db
    .select({
      id: practiceQuestions.id,
      questionType: practiceQuestions.questionType,
      prompt: practiceQuestions.prompt,
      correctAnswer: practiceQuestions.correctAnswer,
      distractors: practiceQuestions.distractors,
      payload: practiceQuestions.payload,
      imageUrl: practiceQuestions.imageUrl,
      timesServed: practiceQuestions.timesServed,
    })
    .from(practiceQuestions)
    .where(and(eq(practiceQuestions.unit, unit), eq(practiceQuestions.active, true)));

  if (allQuestions.length === 0) {
    return NextResponse.json(
      {
        unit,
        questions: [],
        message: 'No practice questions for this unit yet. Ask your teacher!',
      },
      { status: 200 }
    );
  }

  // Pull this student's attempt history for the unit's questions, newest first.
  // Bounded by (unit pool × times student has practiced), well under 1k rows.
  const questionIds = allQuestions.map((q) => q.id);
  const attempts = await db
    .select({
      questionId: practiceAttempts.questionId,
      isCorrect: practiceAttempts.isCorrect,
      answeredAt: practiceAttempts.answeredAt,
    })
    .from(practiceAttempts)
    .where(
      and(
        eq(practiceAttempts.studentId, user.id),
        inArray(practiceAttempts.questionId, questionIds)
      )
    )
    .orderBy(desc(practiceAttempts.answeredAt));

  // Group attempts by question id (preserves newest-first order from the query above).
  const attemptsByQ = new Map<string, typeof attempts>();
  for (const a of attempts) {
    let bucket = attemptsByQ.get(a.questionId);
    if (!bucket) {
      bucket = [];
      attemptsByQ.set(a.questionId, bucket);
    }
    bucket.push(a);
  }

  const now = new Date();

  const categorized: Categorized[] = allQuestions.map((q) => {
    const history = attemptsByQ.get(q.id) ?? [];
    if (history.length === 0) {
      return { q, hasHistory: false, box: 0, dueAt: null, lastWrongAt: null };
    }
    // Box = streak of consecutive correct answers from the latest attempt backwards, capped at 4.
    let box = 0;
    for (const att of history) {
      if (att.isCorrect && box < INTERVAL_DAYS.length - 1) {
        box += 1;
      } else {
        break;
      }
    }
    const lastWrong = history.find((a) => !a.isCorrect);
    const lastAttemptAt = history[0].answeredAt ? new Date(history[0].answeredAt) : now;
    const dueAt = new Date(lastAttemptAt.getTime() + INTERVAL_DAYS[box] * DAY_MS);
    return {
      q,
      hasHistory: true,
      box,
      dueAt,
      lastWrongAt: lastWrong?.answeredAt ? new Date(lastWrong.answeredAt) : null,
    };
  });

  // Pool 1: overdue review — most-broken first, then most-recent wrong, then earliest due.
  const overdue = categorized
    .filter((c) => c.hasHistory && c.dueAt && c.dueAt <= now)
    .sort((a, b) => {
      if (a.box !== b.box) return a.box - b.box;
      const aw = a.lastWrongAt?.getTime() ?? 0;
      const bw = b.lastWrongAt?.getTime() ?? 0;
      if (aw !== bw) return bw - aw;
      return a.dueAt!.getTime() - b.dueAt!.getTime();
    });

  // Pool 2: never attempted — least-served first (spreads coverage), random tiebreak.
  const unseen = shuffle(categorized.filter((c) => !c.hasHistory)).sort(
    (a, b) => (a.q.timesServed ?? 0) - (b.q.timesServed ?? 0)
  );

  // Pool 3: seen but not due — biased toward low box (least mastered) so reviews don't rot.
  const wildcardPool = shuffle(
    categorized.filter((c) => c.hasHistory && c.dueAt && c.dueAt > now)
  ).sort((a, b) => a.box - b.box);

  // Initial picks: 2 overdue, 2 unseen, 1 wildcard.
  const selected: Categorized[] = [];
  const usedIds = new Set<string>();

  const take = (pool: Categorized[], n: number) => {
    let taken = 0;
    for (const c of pool) {
      if (taken >= n) break;
      if (usedIds.has(c.q.id)) continue;
      selected.push(c);
      usedIds.add(c.q.id);
      taken += 1;
    }
  };

  take(overdue, TARGET_OVERDUE);
  take(unseen, TARGET_UNSEEN);
  take(wildcardPool, TARGET_WILDCARD);

  // Backfill cascade: prefer unseen → wildcard → more overdue → anything else.
  // Enforce MAX_REVIEW_PER_SESSION so a kid with a huge overdue queue still gets variety.
  const reviewCount = () =>
    selected.filter((s) => s.hasHistory && s.dueAt && s.dueAt <= now).length;

  const cascade = [unseen, wildcardPool, overdue, categorized];
  for (const pool of cascade) {
    if (selected.length >= QUESTIONS_PER_SESSION) break;
    for (const c of pool) {
      if (selected.length >= QUESTIONS_PER_SESSION) break;
      if (usedIds.has(c.q.id)) continue;
      const isReview = c.hasHistory && c.dueAt && c.dueAt <= now;
      if (isReview && reviewCount() >= MAX_REVIEW_PER_SESSION) continue;
      selected.push(c);
      usedIds.add(c.q.id);
    }
  }

  // Shuffle so the kid doesn't always see review-first.
  const finalOrder = shuffle(selected);
  const selectedIds = finalOrder.map((c) => c.q.id);

  // Bump times_served for everything we served (matches prior behavior).
  await db
    .update(practiceQuestions)
    .set({ timesServed: sql`${practiceQuestions.timesServed} + 1` })
    .where(inArray(practiceQuestions.id, selectedIds));

  // Do NOT return correctAnswer to the client — grading happens server-side.
  // For sentence_builder, prompt IS the answer, so omit it from the response and
  // return shuffled tokens instead of choices.
  const questions = finalOrder.map((c) => {
    if (c.q.questionType === 'sentence_builder') {
      const tokens = (c.q.payload as { tokens?: string[] } | null)?.tokens ?? [];
      return {
        id: c.q.id,
        questionType: c.q.questionType,
        imageUrl: c.q.imageUrl,
        tokens: shuffle(tokens),
      };
    }
    return {
      id: c.q.id,
      questionType: c.q.questionType,
      prompt: c.q.prompt,
      imageUrl: c.q.imageUrl,
      choices: shuffle([c.q.correctAnswer, ...c.q.distractors]),
    };
  });

  return NextResponse.json({ unit, questions });
}
