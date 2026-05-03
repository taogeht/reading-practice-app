import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { practiceAttempts, practiceQuestions } from '@/lib/db/schema';
import { awardXp, isFirstPracticeCorrectToday } from '@/lib/gamification/award';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'student') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { questionId?: unknown; selectedAnswer?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const questionId = typeof body.questionId === 'string' ? body.questionId : '';
  const selectedAnswer = typeof body.selectedAnswer === 'string' ? body.selectedAnswer : '';
  if (!questionId || !selectedAnswer) {
    return NextResponse.json(
      { error: 'questionId and selectedAnswer are required' },
      { status: 400 }
    );
  }

  const [question] = await db
    .select({
      correctAnswer: practiceQuestions.correctAnswer,
      questionType: practiceQuestions.questionType,
    })
    .from(practiceQuestions)
    .where(eq(practiceQuestions.id, questionId))
    .limit(1);

  if (!question) {
    return NextResponse.json({ error: 'Question not found' }, { status: 404 });
  }

  const normalize = (s: string) =>
    question.questionType === 'sentence_builder'
      ? s.toLowerCase().replace(/[.,!?;:"]+/g, '').replace(/\s+/g, ' ').trim()
      : s.trim().toLowerCase();

  const isCorrect = normalize(selectedAnswer) === normalize(question.correctAnswer);

  // Check BEFORE insert: has this student attempted this question before?
  // Used below to gate the wrong-answer effort credit so it can only fire on
  // the very first attempt — students can't farm XP by re-failing the same
  // question.
  const [priorAttempt] = await db
    .select({ id: practiceAttempts.id })
    .from(practiceAttempts)
    .where(
      and(eq(practiceAttempts.studentId, user.id), eq(practiceAttempts.questionId, questionId))
    )
    .limit(1);
  const isFirstAttemptOnQuestion = !priorAttempt;

  const [attempt] = await db
    .insert(practiceAttempts)
    .values({
      studentId: user.id,
      questionId,
      selectedAnswer,
      isCorrect,
    })
    .returning({ id: practiceAttempts.id });

  // XP awards:
  //   - Correct → practice_correct (3 XP), plus practice_first_try_bonus (+2)
  //     once per day for the first correct answer of the day.
  //   - Wrong → practice_wrong_first_attempt (1 XP) ONLY if this was the
  //     student's first ever attempt at this question. Subsequent wrong
  //     attempts pay nothing, so re-failing on purpose can't farm XP.
  // awardXp itself can layer on auto-bonuses (daily_login, streak milestones),
  // which are already included in its returned `pointsAwarded`.
  let xpEarned = 0;
  let firstTryBonus = 0;
  let award = null;
  if (isCorrect) {
    const isFirstToday = await isFirstPracticeCorrectToday(user.id);
    award = await awardXp(user.id, 'practice_correct', attempt.id);
    xpEarned += award.pointsAwarded;
    if (isFirstToday) {
      const bonus = await awardXp(user.id, 'practice_first_try_bonus', attempt.id);
      xpEarned += bonus.pointsAwarded;
      firstTryBonus = bonus.pointsAwarded;
    }
  } else if (isFirstAttemptOnQuestion) {
    award = await awardXp(user.id, 'practice_wrong_first_attempt', attempt.id);
    xpEarned += award.pointsAwarded;
  }

  return NextResponse.json({
    isCorrect,
    correctAnswer: question.correctAnswer,
    award,
    xpEarned,
    firstTryBonus,
  });
}
