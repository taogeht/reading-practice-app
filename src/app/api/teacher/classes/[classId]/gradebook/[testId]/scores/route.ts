import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { gradebookTests, gradebookScores, classEnrollments } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { logError } from '@/lib/logger';
import { userCanManageClass } from '@/lib/auth/class-access';

export const runtime = 'nodejs';

// Bulk-upsert percentage scores for a test's roster. Body: { scores: [{ studentId,
// score }] } where score is 0–100 or null (clears it / marks absent). Only
// students enrolled in the class are accepted.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string; testId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }
    const { classId, testId } = await params;
    if (!(await userCanManageClass(user.id, user.role, classId))) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }
    const test = await db
      .select({ id: gradebookTests.id })
      .from(gradebookTests)
      .where(and(eq(gradebookTests.id, testId), eq(gradebookTests.classId, classId)))
      .limit(1);
    if (!test.length) return NextResponse.json({ error: 'Test not found' }, { status: 404 });

    const body = await request.json();
    const incoming = Array.isArray(body?.scores) ? body.scores : null;
    if (!incoming) {
      return NextResponse.json({ error: 'scores array is required' }, { status: 400 });
    }

    const enrolled = new Set(
      (
        await db
          .select({ studentId: classEnrollments.studentId })
          .from(classEnrollments)
          .where(eq(classEnrollments.classId, classId))
      ).map((r) => r.studentId),
    );

    // Validate + normalize before writing anything.
    const rows: { studentId: string; score: string | null }[] = [];
    for (const item of incoming) {
      const studentId = item?.studentId;
      if (typeof studentId !== 'string' || !enrolled.has(studentId)) {
        return NextResponse.json(
          { error: 'A score references a student not in this class.' },
          { status: 400 },
        );
      }
      const raw = item.score;
      if (raw === null || raw === undefined || raw === '') {
        rows.push({ studentId, score: null });
        continue;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return NextResponse.json(
          { error: 'Scores must be a percentage between 0 and 100.' },
          { status: 400 },
        );
      }
      rows.push({ studentId, score: n.toFixed(2) });
    }

    await db.transaction(async (tx) => {
      for (const r of rows) {
        await tx
          .insert(gradebookScores)
          .values({ testId, studentId: r.studentId, score: r.score })
          .onConflictDoUpdate({
            target: [gradebookScores.testId, gradebookScores.studentId],
            set: { score: r.score, updatedAt: new Date() },
          });
      }
    });

    return NextResponse.json({ success: true, updated: rows.length });
  } catch (error) {
    logError(error, 'api/teacher/classes/[classId]/gradebook/[testId]/scores');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
