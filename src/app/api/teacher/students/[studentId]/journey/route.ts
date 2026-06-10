import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { accessibleClassIds } from '@/lib/auth/class-access';
import { db } from '@/lib/db';
import { students, classEnrollments, classes } from '@/lib/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

// GET /api/teacher/students/[studentId]/journey
// Longitudinal view for the teacher student page: reading-level progression,
// a monthly fluency trend (WCPM/fluency/accuracy across BOTH the assignment and
// passage recording tables), monthly XP/activity, and enrollment history grouped
// by academic term. Enrollment-scoped to classes the teacher manages.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }

    const { studentId } = await params;

    const allowedClassIds = await accessibleClassIds(user.id, user.role);
    if (allowedClassIds.length === 0) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }
    const scoped = await db
      .select({ id: students.id })
      .from(classEnrollments)
      .innerJoin(students, eq(classEnrollments.studentId, students.id))
      .innerJoin(classes, eq(classEnrollments.classId, classes.id))
      .where(and(eq(classEnrollments.studentId, studentId), inArray(classes.id, allowedClassIds)))
      .limit(1);
    if (!scoped.length) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    const [levelRows, fluencyRows, xpRows, enrollmentRows] = await Promise.all([
      // Reading-level history (oldest first), with who changed it.
      db.execute(sql`
        SELECT h.level, h.created_at, h.note, u.first_name, u.last_name
        FROM student_reading_level_history h
        LEFT JOIN users u ON u.id = h.changed_by_user_id
        WHERE h.student_id = ${studentId}
        ORDER BY h.created_at ASC
      `),
      // Monthly fluency trend across BOTH recording tables. AVG ignores NULLs.
      db.execute(sql`
        SELECT to_char(date_trunc('month', submitted_at), 'YYYY-MM') AS month,
               AVG(wcpm)::float          AS avg_wcpm,
               AVG(fluency_score)::float AS avg_fluency,
               AVG(accuracy_score)::float AS avg_accuracy,
               COUNT(*)::int             AS n
        FROM (
          SELECT submitted_at, wcpm, fluency_score, accuracy_score
          FROM recordings WHERE student_id = ${studentId} AND submitted_at IS NOT NULL
          UNION ALL
          SELECT submitted_at, wcpm, fluency_score, accuracy_score
          FROM passage_page_recordings WHERE student_id = ${studentId} AND submitted_at IS NOT NULL
        ) t
        GROUP BY 1
        ORDER BY 1 ASC
      `),
      // Monthly XP / activity.
      db.execute(sql`
        SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
               COALESCE(SUM(points), 0)::int AS xp,
               COUNT(*)::int                 AS events
        FROM student_xp_events
        WHERE student_id = ${studentId}
        GROUP BY 1
        ORDER BY 1 ASC
      `),
      // Enrollment history with term info; newest term first.
      db.execute(sql`
        SELECT ce.enrolled_at, c.id AS class_id, c.name AS class_name, c.active,
               c.term_id, t.name AS term_name, t.is_current, t.start_date
        FROM class_enrollments ce
        JOIN classes c ON c.id = ce.class_id
        LEFT JOIN academic_terms t ON t.id = c.term_id
        WHERE ce.student_id = ${studentId}
        ORDER BY t.start_date DESC NULLS LAST, ce.enrolled_at DESC
      `),
    ]);

    const readingLevelHistory = levelRows.rows.map((r: Record<string, unknown>) => ({
      level: r.level as string,
      changedAt: r.created_at as string,
      note: (r.note as string) || null,
      changedBy:
        r.first_name || r.last_name
          ? `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim()
          : null,
    }));

    const fluencyTrend = fluencyRows.rows.map((r: Record<string, unknown>) => ({
      month: r.month as string,
      avgWcpm: r.avg_wcpm != null ? Number(r.avg_wcpm) : null,
      avgFluency: r.avg_fluency != null ? Number(r.avg_fluency) : null,
      avgAccuracy: r.avg_accuracy != null ? Number(r.avg_accuracy) : null,
      count: Number(r.n),
    }));

    const monthlyXp = xpRows.rows.map((r: Record<string, unknown>) => ({
      month: r.month as string,
      xp: Number(r.xp),
      events: Number(r.events),
    }));

    // Group enrollments by term (null term → "Ungrouped"), preserving order.
    const termOrder: string[] = [];
    const termMap = new Map<string, {
      termId: string | null;
      termName: string;
      isCurrent: boolean;
      classes: { id: string; name: string; active: boolean; enrolledAt: string }[];
    }>();
    for (const r of enrollmentRows.rows as Record<string, unknown>[]) {
      const key = (r.term_id as string) || '__ungrouped__';
      if (!termMap.has(key)) {
        termOrder.push(key);
        termMap.set(key, {
          termId: (r.term_id as string) || null,
          termName: (r.term_name as string) || 'Ungrouped',
          isCurrent: Boolean(r.is_current),
          classes: [],
        });
      }
      termMap.get(key)!.classes.push({
        id: r.class_id as string,
        name: r.class_name as string,
        active: Boolean(r.active),
        enrolledAt: r.enrolled_at as string,
      });
    }
    const enrollmentsByTerm = termOrder.map((k) => termMap.get(k)!);

    return NextResponse.json({
      readingLevelHistory,
      fluencyTrend,
      monthlyXp,
      enrollmentsByTerm,
    });
  } catch (error) {
    logError(error, 'api/teacher/students/[studentId]/journey');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
