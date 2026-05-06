import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { classes } from '@/lib/db/schema';
import { userCanManageClass } from '@/lib/auth/class-access';

export const runtime = 'nodejs';

type UnitRow = {
  unit: number;
  attempts: number;
  correct: number;
  active_students: number;
  last_attempt_at: string | null;
};

type StudentRow = {
  student_id: string;
  first_name: string;
  last_name: string;
  attempts: number;
  correct: number;
  last_attempt_at: string | null;
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ classId: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'teacher') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { classId } = await params;
  if (!(await userCanManageClass(user.id, user.role, classId))) {
    return NextResponse.json({ error: 'Class not found' }, { status: 404 });
  }

  const unitResult = await db.execute(sql`
    SELECT
      pq.unit AS unit,
      COUNT(*)::int AS attempts,
      COUNT(*) FILTER (WHERE pa.is_correct)::int AS correct,
      COUNT(DISTINCT pa.student_id)::int AS active_students,
      MAX(pa.answered_at) AS last_attempt_at
    FROM practice_attempts pa
    JOIN practice_questions pq ON pq.id = pa.question_id
    JOIN class_enrollments ce ON ce.student_id = pa.student_id
    WHERE ce.class_id = ${classId}
    GROUP BY pq.unit
    ORDER BY pq.unit
  `);

  const unitStats = (unitResult.rows as unknown as UnitRow[]).map((r) => ({
    unit: r.unit,
    attempts: r.attempts,
    correct: r.correct,
    activeStudents: r.active_students,
    accuracy: r.attempts > 0 ? Math.round((r.correct / r.attempts) * 100) : 0,
    lastAttemptAt: r.last_attempt_at,
  }));

  const studentResult = await db.execute(sql`
    SELECT
      u.id AS student_id,
      u.first_name AS first_name,
      u.last_name AS last_name,
      COALESCE(stat.attempts, 0)::int AS attempts,
      COALESCE(stat.correct, 0)::int AS correct,
      stat.last_attempt_at AS last_attempt_at
    FROM class_enrollments ce
    JOIN users u ON u.id = ce.student_id
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS attempts,
        COUNT(*) FILTER (WHERE pa.is_correct)::int AS correct,
        MAX(pa.answered_at) AS last_attempt_at
      FROM practice_attempts pa
      WHERE pa.student_id = ce.student_id
    ) stat ON TRUE
    WHERE ce.class_id = ${classId}
    ORDER BY attempts DESC, u.last_name ASC, u.first_name ASC
  `);

  const studentStats = (studentResult.rows as unknown as StudentRow[]).map((r) => ({
    studentId: r.student_id,
    firstName: r.first_name,
    lastName: r.last_name,
    attempts: r.attempts,
    correct: r.correct,
    accuracy: r.attempts > 0 ? Math.round((r.correct / r.attempts) * 100) : 0,
    lastAttemptAt: r.last_attempt_at,
  }));

  return NextResponse.json({ unitStats, studentStats });
}
