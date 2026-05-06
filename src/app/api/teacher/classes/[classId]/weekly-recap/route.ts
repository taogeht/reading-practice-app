import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  classWeeklyRecaps,
  studentWeeklyRecapEntries,
  classes,
  classEnrollments,
  students,
  users,
} from '@/lib/db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { logError } from '@/lib/logger';
import {
  BEHAVIOR_FORMATS,
  type BehaviorFormat,
} from '@/lib/recap/behaviors';
import {
  findSyllabusWeek,
  gatherRecapPrefill,
  isoWeekNumber,
  isoWeekRange,
} from '@/lib/recap/prefill';
import { userCanManageClass } from '@/lib/auth/class-access';

export const runtime = 'nodejs';

// Auto-creates a student_weekly_recap_entries row for every currently-enrolled
// student in the class. Idempotent — uses ON CONFLICT DO NOTHING so it's safe
// to call repeatedly (e.g., after a new student is enrolled mid-week).
async function ensureRosterEntries(recapId: string, classId: string) {
  const roster = await db
    .select({ studentId: classEnrollments.studentId })
    .from(classEnrollments)
    .where(eq(classEnrollments.classId, classId));
  if (roster.length === 0) return;
  await db
    .insert(studentWeeklyRecapEntries)
    .values(roster.map((r) => ({ recapId, studentId: r.studentId })))
    .onConflictDoNothing();
}

// Resolves the (weekNumber, startDate, endDate) for a recap given an optional
// query param. Defaults to the current week. Prefers an existing
// class_syllabus_weeks row when one matches.
async function resolveWeek(
  classId: string,
  weekParam: string | null,
): Promise<{ weekNumber: number; startDate: Date; endDate: Date }> {
  if (weekParam) {
    const wn = parseInt(weekParam, 10);
    if (Number.isFinite(wn)) {
      // If the teacher is asking about a specific week and a syllabus row
      // exists for it, use that row's dates.
      const syllabusRows = await db
        .select({
          weekNumber: classWeeklyRecaps.weekNumber,
          startDate: classWeeklyRecaps.startDate,
          endDate: classWeeklyRecaps.endDate,
        })
        .from(classWeeklyRecaps)
        .where(and(eq(classWeeklyRecaps.classId, classId), eq(classWeeklyRecaps.weekNumber, wn)))
        .limit(1);
      if (syllabusRows.length) {
        return {
          weekNumber: syllabusRows[0].weekNumber,
          startDate: new Date(syllabusRows[0].startDate),
          endDate: new Date(syllabusRows[0].endDate),
        };
      }
      // No recap for that week yet — pick the syllabus week if defined,
      // otherwise just use the current ISO week's dates with that week number.
      const syllabus = await db
        .select({
          weekNumber: classWeeklyRecaps.weekNumber,
          startDate: classWeeklyRecaps.startDate,
          endDate: classWeeklyRecaps.endDate,
        })
        .from(classWeeklyRecaps)
        .where(eq(classWeeklyRecaps.classId, classId))
        .orderBy(desc(classWeeklyRecaps.weekNumber))
        .limit(1);
      if (syllabus.length && syllabus[0].weekNumber === wn) {
        return {
          weekNumber: wn,
          startDate: new Date(syllabus[0].startDate),
          endDate: new Date(syllabus[0].endDate),
        };
      }
      const range = isoWeekRange();
      return { weekNumber: wn, startDate: range.start, endDate: range.end };
    }
  }
  const syllabus = await findSyllabusWeek(classId);
  if (syllabus) {
    return {
      weekNumber: syllabus.weekNumber,
      startDate: syllabus.startDate,
      endDate: syllabus.endDate,
    };
  }
  const today = new Date();
  const range = isoWeekRange(today);
  return {
    weekNumber: isoWeekNumber(today),
    startDate: range.start,
    endDate: range.end,
  };
}

// GET /api/teacher/classes/[classId]/weekly-recap?week=12
// Returns the recap for a given week. If no row exists yet, returns one filled
// with prefill defaults so the teacher form has something to edit. Also auto-
// creates per-student rows once a real recap has been saved.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { classId } = await params;
    if (!(await userCanManageClass(user.id, user.role, classId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(request.url);
    const week = await resolveWeek(classId, url.searchParams.get('week'));

    const existing = await db
      .select()
      .from(classWeeklyRecaps)
      .where(
        and(
          eq(classWeeklyRecaps.classId, classId),
          eq(classWeeklyRecaps.weekNumber, week.weekNumber),
        ),
      )
      .limit(1);

    const prefill = await gatherRecapPrefill(classId, week.startDate, week.endDate);

    // Roster snapshot — names, ids — for the form.
    const roster = await db
      .select({
        studentId: students.id,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(classEnrollments)
      .innerJoin(students, eq(classEnrollments.studentId, students.id))
      .innerJoin(users, eq(students.id, users.id))
      .where(eq(classEnrollments.classId, classId))
      .orderBy(users.firstName, users.lastName);

    if (!existing.length) {
      // No recap yet for this week — return an unsaved skeleton with prefill.
      return NextResponse.json({
        recap: null,
        skeleton: {
          weekNumber: week.weekNumber,
          startDate: week.startDate,
          endDate: week.endDate,
          pagesCovered: prefill.pagesCovered,
          vocabulary: '',
          spellingTestInfo: prefill.spellingTestInfo,
          grammarTestInfo: '',
          homework: prefill.homework,
          behaviorFormat: 'checklist' as const,
          status: 'draft' as const,
        },
        entries: [],
        roster,
      });
    }

    const recapRow = existing[0];
    await ensureRosterEntries(recapRow.id, classId);

    const entries = await db
      .select()
      .from(studentWeeklyRecapEntries)
      .where(eq(studentWeeklyRecapEntries.recapId, recapRow.id));

    return NextResponse.json({ recap: recapRow, entries, roster, prefill });
  } catch (error) {
    logError(error, 'api/teacher/weekly-recap GET');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/teacher/classes/[classId]/weekly-recap
// Upserts the class-level recap row for the given weekNumber. Body is partial
// — anything omitted keeps its existing value (or becomes null on first save).
// Status is NOT changed by this endpoint; use POST ?action=publish for that.
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
    if (!(await userCanManageClass(user.id, user.role, classId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json()) as {
      weekNumber?: number;
      startDate?: string;
      endDate?: string;
      pagesCovered?: string | null;
      vocabulary?: string | null;
      spellingTestInfo?: string | null;
      grammarTestInfo?: string | null;
      homework?: string | null;
      behaviorFormat?: string;
    };

    if (typeof body.weekNumber !== 'number' || !Number.isFinite(body.weekNumber)) {
      return NextResponse.json({ error: 'weekNumber required' }, { status: 400 });
    }
    if (!body.startDate || !body.endDate) {
      return NextResponse.json({ error: 'startDate and endDate required' }, { status: 400 });
    }
    const behaviorFormat: BehaviorFormat = BEHAVIOR_FORMATS.includes(
      body.behaviorFormat as BehaviorFormat,
    )
      ? (body.behaviorFormat as BehaviorFormat)
      : 'checklist';

    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);

    const existing = await db
      .select({ id: classWeeklyRecaps.id })
      .from(classWeeklyRecaps)
      .where(
        and(
          eq(classWeeklyRecaps.classId, classId),
          eq(classWeeklyRecaps.weekNumber, body.weekNumber),
        ),
      )
      .limit(1);

    let recapId: string;
    if (existing.length) {
      recapId = existing[0].id;
      await db
        .update(classWeeklyRecaps)
        .set({
          startDate,
          endDate,
          pagesCovered: body.pagesCovered ?? null,
          vocabulary: body.vocabulary ?? null,
          spellingTestInfo: body.spellingTestInfo ?? null,
          grammarTestInfo: body.grammarTestInfo ?? null,
          homework: body.homework ?? null,
          behaviorFormat,
          updatedAt: new Date(),
        })
        .where(eq(classWeeklyRecaps.id, recapId));
    } else {
      const inserted = await db
        .insert(classWeeklyRecaps)
        .values({
          classId,
          weekNumber: body.weekNumber,
          startDate,
          endDate,
          pagesCovered: body.pagesCovered ?? null,
          vocabulary: body.vocabulary ?? null,
          spellingTestInfo: body.spellingTestInfo ?? null,
          grammarTestInfo: body.grammarTestInfo ?? null,
          homework: body.homework ?? null,
          behaviorFormat,
          status: 'draft',
          createdBy: user.id,
        })
        .returning({ id: classWeeklyRecaps.id });
      recapId = inserted[0].id;
    }

    await ensureRosterEntries(recapId, classId);

    return NextResponse.json({ id: recapId });
  } catch (error) {
    logError(error, 'api/teacher/weekly-recap PUT');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/teacher/classes/[classId]/weekly-recap?action=publish&week=12
// Flips status='published' and stamps submittedAt. Required action=publish so
// future actions (e.g. unpublish, archive) can share the same endpoint.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { classId } = await params;
    if (!(await userCanManageClass(user.id, user.role, classId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    const weekParam = url.searchParams.get('week');
    if (action !== 'publish' && action !== 'unpublish') {
      return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
    }
    const weekNumber = weekParam ? parseInt(weekParam, 10) : NaN;
    if (!Number.isFinite(weekNumber)) {
      return NextResponse.json({ error: 'week required' }, { status: 400 });
    }

    const existing = await db
      .select({ id: classWeeklyRecaps.id })
      .from(classWeeklyRecaps)
      .where(
        and(
          eq(classWeeklyRecaps.classId, classId),
          eq(classWeeklyRecaps.weekNumber, weekNumber),
        ),
      )
      .limit(1);
    if (!existing.length) {
      return NextResponse.json({ error: 'Recap not found' }, { status: 404 });
    }

    if (action === 'publish') {
      await db
        .update(classWeeklyRecaps)
        .set({ status: 'published', submittedAt: new Date(), updatedAt: new Date() })
        .where(eq(classWeeklyRecaps.id, existing[0].id));
      // Make sure the roster is hydrated at publish time too — students may
      // have been added since the draft was created.
      await ensureRosterEntries(existing[0].id, classId);
    } else {
      await db
        .update(classWeeklyRecaps)
        .set({ status: 'draft', updatedAt: new Date() })
        .where(eq(classWeeklyRecaps.id, existing[0].id));
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    logError(error, 'api/teacher/weekly-recap POST');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
