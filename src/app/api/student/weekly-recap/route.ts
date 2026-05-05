import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  classWeeklyRecaps,
  studentWeeklyRecapEntries,
  classEnrollments,
  classes,
} from '@/lib/db/schema';
import { and, eq, desc, inArray } from 'drizzle-orm';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

// GET /api/student/weekly-recap?week=12
// Returns the latest published recap for any class the student is enrolled in,
// plus this student's per-student entry. With ?week=N, returns that specific
// week. ?history=true returns the list of past published recaps for the
// student's classes (newest first), ids + week metadata only — used to drive
// the "Previous weeks" picker on the dashboard.
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'student') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find the student's class memberships.
    const enrollments = await db
      .select({ classId: classEnrollments.classId, className: classes.name })
      .from(classEnrollments)
      .innerJoin(classes, eq(classEnrollments.classId, classes.id))
      .where(eq(classEnrollments.studentId, user.id));
    if (enrollments.length === 0) {
      return NextResponse.json({ recap: null, entry: null, history: [] });
    }
    const classIds = enrollments.map((e) => e.classId);
    const classNameById = new Map(enrollments.map((e) => [e.classId, e.className]));

    const url = new URL(request.url);
    const wantsHistory = url.searchParams.get('history') === 'true';
    const weekParam = url.searchParams.get('week');

    if (wantsHistory) {
      const past = await db
        .select({
          id: classWeeklyRecaps.id,
          classId: classWeeklyRecaps.classId,
          weekNumber: classWeeklyRecaps.weekNumber,
          startDate: classWeeklyRecaps.startDate,
          endDate: classWeeklyRecaps.endDate,
          submittedAt: classWeeklyRecaps.submittedAt,
        })
        .from(classWeeklyRecaps)
        .where(
          and(
            inArray(classWeeklyRecaps.classId, classIds),
            eq(classWeeklyRecaps.status, 'published'),
          ),
        )
        .orderBy(desc(classWeeklyRecaps.submittedAt));
      return NextResponse.json({
        history: past.map((r) => ({
          ...r,
          className: classNameById.get(r.classId) ?? '',
        })),
      });
    }

    // Build the WHERE for the single-recap query: published, in the student's
    // classes, optionally for a specific week.
    const conditions = [
      inArray(classWeeklyRecaps.classId, classIds),
      eq(classWeeklyRecaps.status, 'published'),
    ];
    if (weekParam) {
      const wn = parseInt(weekParam, 10);
      if (Number.isFinite(wn)) {
        conditions.push(eq(classWeeklyRecaps.weekNumber, wn));
      }
    }

    const recapRows = await db
      .select()
      .from(classWeeklyRecaps)
      .where(and(...conditions))
      .orderBy(desc(classWeeklyRecaps.submittedAt))
      .limit(1);

    if (!recapRows.length) {
      return NextResponse.json({ recap: null, entry: null });
    }
    const recap = recapRows[0];

    const entryRows = await db
      .select()
      .from(studentWeeklyRecapEntries)
      .where(
        and(
          eq(studentWeeklyRecapEntries.recapId, recap.id),
          eq(studentWeeklyRecapEntries.studentId, user.id),
        ),
      )
      .limit(1);

    return NextResponse.json({
      recap: { ...recap, className: classNameById.get(recap.classId) ?? '' },
      entry: entryRows[0] ?? null,
    });
  } catch (error) {
    logError(error, 'api/student/weekly-recap GET');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/student/weekly-recap?action=confirm
// Body: { recapId: string }
// Stamps parentConfirmedAt on the student's entry for the given recap. The
// student must be enrolled in the recap's class — we verify by checking the
// entry exists and belongs to them.
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'student') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const url = new URL(request.url);
    if (url.searchParams.get('action') !== 'confirm') {
      return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
    }
    const body = (await request.json()) as { recapId?: string };
    if (!body.recapId) {
      return NextResponse.json({ error: 'recapId required' }, { status: 400 });
    }

    // Verify the recap is actually published — we don't let parents confirm
    // drafts (which they shouldn't be able to see anyway, but defense in depth).
    const recap = await db
      .select({ status: classWeeklyRecaps.status })
      .from(classWeeklyRecaps)
      .where(eq(classWeeklyRecaps.id, body.recapId))
      .limit(1);
    if (!recap.length || recap[0].status !== 'published') {
      return NextResponse.json({ error: 'Recap not available' }, { status: 404 });
    }

    const updated = await db
      .update(studentWeeklyRecapEntries)
      .set({ parentConfirmedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(studentWeeklyRecapEntries.recapId, body.recapId),
          eq(studentWeeklyRecapEntries.studentId, user.id),
        ),
      )
      .returning({ id: studentWeeklyRecapEntries.id, parentConfirmedAt: studentWeeklyRecapEntries.parentConfirmedAt });

    if (!updated.length) {
      return NextResponse.json({ error: 'No entry for this student' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, parentConfirmedAt: updated[0].parentConfirmedAt });
  } catch (error) {
    logError(error, 'api/student/weekly-recap POST');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
