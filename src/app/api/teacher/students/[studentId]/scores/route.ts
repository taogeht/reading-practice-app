import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { accessibleClassIds } from '@/lib/auth/class-access';
import { db } from '@/lib/db';
import { gradebookTests, gradebookScores, classes } from '@/lib/db/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

// A student's gradebook scores across the classes the teacher can see. Powers
// the scores card on the teacher's per-student page. Enrollment-scoped.
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
      return NextResponse.json({ scores: [] });
    }

    const rows = await db
      .select({
        testId: gradebookTests.id,
        testName: gradebookTests.name,
        testType: gradebookTests.testType,
        testDate: gradebookTests.testDate,
        className: classes.name,
        score: gradebookScores.score,
      })
      .from(gradebookScores)
      .innerJoin(gradebookTests, eq(gradebookScores.testId, gradebookTests.id))
      .innerJoin(classes, eq(gradebookTests.classId, classes.id))
      .where(
        and(
          eq(gradebookScores.studentId, studentId),
          inArray(gradebookTests.classId, allowedClassIds),
        ),
      )
      .orderBy(desc(gradebookTests.testDate), desc(gradebookTests.createdAt));

    return NextResponse.json({
      scores: rows.map((r) => ({
        testId: r.testId,
        testName: r.testName,
        testType: r.testType,
        testDate: r.testDate,
        className: r.className,
        score: r.score != null ? Number(r.score) : null,
      })),
    });
  } catch (error) {
    logError(error, 'api/teacher/students/[studentId]/scores');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
