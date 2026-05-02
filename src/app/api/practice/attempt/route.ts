import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
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

  const [attempt] = await db
    .insert(practiceAttempts)
    .values({
      studentId: user.id,
      questionId,
      selectedAnswer,
      isCorrect,
    })
    .returning({ id: practiceAttempts.id });

  // XP for correct answers only. First-correct-today gets a bonus.
  let award = null;
  if (isCorrect) {
    const isFirstToday = await isFirstPracticeCorrectToday(user.id);
    award = await awardXp(user.id, 'practice_correct', attempt.id);
    if (isFirstToday) {
      await awardXp(user.id, 'practice_first_try_bonus', attempt.id);
    }
  }

  return NextResponse.json({
    isCorrect,
    correctAnswer: question.correctAnswer,
    award,
  });
}
