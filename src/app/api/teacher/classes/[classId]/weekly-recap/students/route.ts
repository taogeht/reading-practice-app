import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  classWeeklyRecaps,
  studentWeeklyRecapEntries,
  classes,
  classEnrollments,
} from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { logError } from '@/lib/logger';
import { validateBehaviorRatings } from '@/lib/recap/behaviors';

export const runtime = 'nodejs';

interface BatchEntry {
  studentId?: string;
  behaviorRatings?: unknown;
  teacherComment?: string | null;
}

// PUT /api/teacher/classes/[classId]/weekly-recap/students?week=12
// Body: { entries: [{ studentId, behaviorRatings?, teacherComment? }, ...] }
// Persists per-student behavior data for the recap. Both shapes are accepted
// regardless of the recap's behaviorFormat — the parent-facing view only
// renders whichever field matches the format, but storing both lets a teacher
// flip back without losing work.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { classId } = await params;

    // Teacher owns the class (admins bypass).
    if (user.role !== 'admin') {
      const owns = await db
        .select({ id: classes.id })
        .from(classes)
        .where(and(eq(classes.id, classId), eq(classes.teacherId, user.id)))
        .limit(1);
      if (!owns.length) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(request.url);
    const weekParam = url.searchParams.get('week');
    const weekNumber = weekParam ? parseInt(weekParam, 10) : NaN;
    if (!Number.isFinite(weekNumber)) {
      return NextResponse.json({ error: 'week required' }, { status: 400 });
    }

    const body = (await request.json()) as { entries?: BatchEntry[] };
    if (!Array.isArray(body.entries)) {
      return NextResponse.json({ error: 'entries[] required' }, { status: 400 });
    }

    const recap = await db
      .select({ id: classWeeklyRecaps.id })
      .from(classWeeklyRecaps)
      .where(and(eq(classWeeklyRecaps.classId, classId), eq(classWeeklyRecaps.weekNumber, weekNumber)))
      .limit(1);
    if (!recap.length) {
      return NextResponse.json({ error: 'Recap not found — save the recap first' }, { status: 404 });
    }
    const recapId = recap[0].id;

    // Check each entry's studentId actually belongs to this class. Cheap to
    // do client-side too, but the server is the source of truth.
    const enrolledIds = new Set(
      (
        await db
          .select({ studentId: classEnrollments.studentId })
          .from(classEnrollments)
          .where(eq(classEnrollments.classId, classId))
      ).map((r) => r.studentId),
    );

    let touched = 0;
    for (const e of body.entries) {
      if (!e.studentId || !enrolledIds.has(e.studentId)) continue;
      const ratings = validateBehaviorRatings(e.behaviorRatings);
      if (ratings === null) {
        return NextResponse.json(
          { error: `Invalid behaviorRatings for student ${e.studentId}` },
          { status: 400 },
        );
      }
      const comment =
        typeof e.teacherComment === 'string' ? e.teacherComment.trim() || null : null;

      // Upsert the per-student entry row. studentId+recapId is unique.
      await db
        .insert(studentWeeklyRecapEntries)
        .values({
          recapId,
          studentId: e.studentId,
          behaviorRatings: ratings,
          teacherComment: comment,
        })
        .onConflictDoUpdate({
          target: [studentWeeklyRecapEntries.recapId, studentWeeklyRecapEntries.studentId],
          set: {
            behaviorRatings: ratings,
            teacherComment: comment,
            updatedAt: new Date(),
          },
        });
      touched += 1;
    }

    return NextResponse.json({ ok: true, touched });
  } catch (error) {
    logError(error, 'api/teacher/weekly-recap/students PUT');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
