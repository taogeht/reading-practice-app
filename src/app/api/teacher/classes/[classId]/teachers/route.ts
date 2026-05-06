import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { classes, classTeachers, users, teachers } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { logError } from '@/lib/logger';
import {
  userCanManageClass,
  userIsClassPrimary,
} from '@/lib/auth/class-access';

export const runtime = 'nodejs';

interface TeacherRow {
  teacherId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: 'primary' | 'co';
  addedAt: string | null;
}

// GET /api/teacher/classes/[classId]/teachers
// Returns the primary teacher + every co-teacher. Any class member can read.
export async function GET(
  _request: NextRequest,
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

    const primaryRow = await db
      .select({
        teacherId: classes.teacherId,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(classes)
      .innerJoin(users, eq(users.id, classes.teacherId))
      .where(eq(classes.id, classId))
      .limit(1);

    const coRows = await db
      .select({
        teacherId: classTeachers.teacherId,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        addedAt: classTeachers.addedAt,
      })
      .from(classTeachers)
      .innerJoin(users, eq(users.id, classTeachers.teacherId))
      .where(eq(classTeachers.classId, classId));

    const list: TeacherRow[] = [];
    if (primaryRow.length) {
      list.push({
        teacherId: primaryRow[0].teacherId,
        firstName: primaryRow[0].firstName,
        lastName: primaryRow[0].lastName,
        email: primaryRow[0].email,
        role: 'primary',
        addedAt: null,
      });
    }
    for (const r of coRows) {
      list.push({
        teacherId: r.teacherId,
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        role: 'co',
        addedAt: r.addedAt?.toISOString() ?? null,
      });
    }

    return NextResponse.json({
      teachers: list,
      // The caller's relationship to the class — drives "can I add/remove?" in the UI.
      viewerIsPrimary: await userIsClassPrimary(user.id, classId),
    });
  } catch (error) {
    logError(error, 'api/teacher/classes/teachers GET');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/teacher/classes/[classId]/teachers
// Body: { email: string }
// Adds a co-teacher by email. Only the primary (or admin) may call this. The
// target user must already exist with role='teacher'.
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

    // Only primary can manage co-teachers (admins always allowed).
    if (
      user.role !== 'admin' &&
      !(await userIsClassPrimary(user.id, classId))
    ) {
      return NextResponse.json(
        { error: 'Only the primary teacher can add co-teachers' },
        { status: 403 },
      );
    }

    const body = (await request.json()) as { email?: string };
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email) {
      return NextResponse.json({ error: 'email required' }, { status: 400 });
    }

    const targetRows = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        role: users.role,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (!targetRows.length) {
      return NextResponse.json(
        { error: 'No teacher found with that email' },
        { status: 404 },
      );
    }
    const target = targetRows[0];
    if (target.role !== 'teacher') {
      return NextResponse.json(
        { error: 'That account is not a teacher' },
        { status: 400 },
      );
    }

    // Reject if target is already the primary.
    const cls = await db
      .select({ teacherId: classes.teacherId })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);
    if (cls.length && cls[0].teacherId === target.id) {
      return NextResponse.json(
        { error: 'That teacher is already the primary teacher of this class' },
        { status: 400 },
      );
    }

    // Ensure a teachers row exists for the target (the schema requires it for
    // the FK). For invited teachers who may have signed up but never had a
    // teacher row materialized, create one.
    const teacherRow = await db
      .select({ id: teachers.id })
      .from(teachers)
      .where(eq(teachers.id, target.id))
      .limit(1);
    if (!teacherRow.length) {
      await db.insert(teachers).values({ id: target.id }).onConflictDoNothing();
    }

    // Idempotent on the unique (classId, teacherId) index.
    const inserted = await db
      .insert(classTeachers)
      .values({ classId, teacherId: target.id, addedBy: user.id })
      .onConflictDoNothing()
      .returning({ id: classTeachers.id });

    return NextResponse.json({
      ok: true,
      added: inserted.length > 0,
      teacher: {
        teacherId: target.id,
        firstName: target.firstName,
        lastName: target.lastName,
        email: target.email,
        role: 'co' as const,
      },
    });
  } catch (error) {
    logError(error, 'api/teacher/classes/teachers POST');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
