import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { classEnrollments, classes } from '@/lib/db/schema';

export const runtime = 'nodejs';

const FLAGGED_LIMIT = 25;

type UnitRow = {
  unit: number;
  attempts: number;
  correct: number;
  last_attempt_at: string | null;
};

type FlaggedRow = {
  question_id: string;
  unit: number;
  prompt: string;
  correct_answer: string;
  image_url: string | null;
  total_attempts: number;
  wrong_attempts: number;
  last_wrong_at: string | null;
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'teacher') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { studentId } = await params;

  // Confirm this teacher has the student in one of their classes.
  const enrollment = await db
    .select({ id: classes.id })
    .from(classEnrollments)
    .innerJoin(classes, eq(classes.id, classEnrollments.classId))
    .where(
      and(eq(classEnrollments.studentId, studentId), eq(classes.teacherId, user.id))
    )
    .limit(1);

  if (enrollment.length === 0) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }

  const unitResult = await db.execute(sql`
    SELECT
      pq.unit AS unit,
      COUNT(*)::int AS attempts,
      COUNT(*) FILTER (WHERE pa.is_correct)::int AS correct,
      MAX(pa.answered_at) AS last_attempt_at
    FROM practice_attempts pa
    JOIN practice_questions pq ON pq.id = pa.question_id
    WHERE pa.student_id = ${studentId}
    GROUP BY pq.unit
    ORDER BY pq.unit
  `);

  const unitStats = (unitResult.rows as unknown as UnitRow[]).map((r) => ({
    unit: r.unit,
    attempts: r.attempts,
    correct: r.correct,
    accuracy: r.attempts > 0 ? Math.round((r.correct / r.attempts) * 100) : 0,
    lastAttemptAt: r.last_attempt_at,
  }));

  const flaggedResult = await db.execute(sql`
    SELECT
      pq.id AS question_id,
      pq.unit AS unit,
      pq.prompt AS prompt,
      pq.correct_answer AS correct_answer,
      pq.image_url AS image_url,
      COUNT(*)::int AS total_attempts,
      COUNT(*) FILTER (WHERE NOT pa.is_correct)::int AS wrong_attempts,
      MAX(pa.answered_at) FILTER (WHERE NOT pa.is_correct) AS last_wrong_at
    FROM practice_attempts pa
    JOIN practice_questions pq ON pq.id = pa.question_id
    WHERE pa.student_id = ${studentId}
    GROUP BY pq.id, pq.unit, pq.prompt, pq.correct_answer, pq.image_url
    HAVING COUNT(*) FILTER (WHERE NOT pa.is_correct) > 0
    ORDER BY wrong_attempts DESC, last_wrong_at DESC
    LIMIT ${FLAGGED_LIMIT}
  `);

  const flaggedQuestions = (flaggedResult.rows as unknown as FlaggedRow[]).map((r) => ({
    questionId: r.question_id,
    unit: r.unit,
    prompt: r.prompt,
    correctAnswer: r.correct_answer,
    imageUrl: r.image_url,
    totalAttempts: r.total_attempts,
    wrongAttempts: r.wrong_attempts,
    lastWrongAt: r.last_wrong_at,
  }));

  return NextResponse.json({ unitStats, flaggedQuestions });
}
