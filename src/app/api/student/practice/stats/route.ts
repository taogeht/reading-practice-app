import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

type UnitRow = {
  unit: number;
  attempts: number;
  correct: number;
  last_attempt_at: string | null;
};

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'student') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await db.execute(sql`
    SELECT
      pq.unit AS unit,
      COUNT(*)::int AS attempts,
      COUNT(*) FILTER (WHERE pa.is_correct)::int AS correct,
      MAX(pa.answered_at) AS last_attempt_at
    FROM practice_attempts pa
    JOIN practice_questions pq ON pq.id = pa.question_id
    WHERE pa.student_id = ${user.id}
    GROUP BY pq.unit
    ORDER BY pq.unit
  `);

  const rows = result.rows as unknown as UnitRow[];

  const unitStats = rows.map((r) => ({
    unit: r.unit,
    attempts: r.attempts,
    correct: r.correct,
    accuracy: r.attempts > 0 ? Math.round((r.correct / r.attempts) * 100) : 0,
    lastAttemptAt: r.last_attempt_at,
  }));

  const totals = unitStats.reduce(
    (acc, u) => {
      acc.attempts += u.attempts;
      acc.correct += u.correct;
      return acc;
    },
    { attempts: 0, correct: 0 }
  );

  return NextResponse.json({
    unitStats,
    totalAttempts: totals.attempts,
    totalCorrect: totals.correct,
    overallAccuracy:
      totals.attempts > 0 ? Math.round((totals.correct / totals.attempts) * 100) : 0,
  });
}
