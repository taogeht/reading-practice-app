// Single source of truth for "can this user act on this class?"
//
// Membership = primary teacher (classes.teacher_id) OR row in class_teachers.
// Admins always pass. Use these helpers in every API route that previously
// gated on `eq(classes.teacherId, user.id)` so co-teachers get the same access
// without each route having to reimplement the check.

import { db } from '@/lib/db';
import { classes, classTeachers, assignments } from '@/lib/db/schema';
import { and, eq, or, sql } from 'drizzle-orm';

// True iff the user is the primary teacher OR a co-teacher OR an admin.
// Admins are checked first to avoid a DB round-trip when not needed.
export async function userCanManageClass(
  userId: string,
  role: string,
  classId: string,
): Promise<boolean> {
  if (role === 'admin') return true;
  if (role !== 'teacher') return false;
  const rows = await db
    .select({ id: classes.id })
    .from(classes)
    .leftJoin(
      classTeachers,
      and(eq(classTeachers.classId, classes.id), eq(classTeachers.teacherId, userId)),
    )
    .where(
      and(
        eq(classes.id, classId),
        or(eq(classes.teacherId, userId), eq(classTeachers.teacherId, userId)),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// True iff the user is the primary teacher of the class. Used by actions only
// the primary should perform (delete class, manage co-teachers).
export async function userIsClassPrimary(
  userId: string,
  classId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: classes.id })
    .from(classes)
    .where(and(eq(classes.id, classId), eq(classes.teacherId, userId)))
    .limit(1);
  return rows.length > 0;
}

// Returns the set of class ids this user can manage. Admins → all classes.
// Teachers → classes they own or co-teach.
export async function accessibleClassIds(
  userId: string,
  role: string,
): Promise<string[]> {
  if (role === 'admin') {
    const all = await db.select({ id: classes.id }).from(classes);
    return all.map((c) => c.id);
  }
  if (role !== 'teacher') return [];
  // UNION over the two sources. Postgres dedupes via DISTINCT.
  const rows = await db.execute<{ id: string }>(sql`
    SELECT DISTINCT c.id
    FROM classes c
    LEFT JOIN class_teachers ct
      ON ct.class_id = c.id AND ct.teacher_id = ${userId}
    WHERE c.teacher_id = ${userId} OR ct.teacher_id = ${userId}
  `);
  // db.execute returns either { rows: [...] } or [...] depending on driver
  // version. Handle both.
  const list = (rows as unknown as { rows?: { id: string }[] }).rows ?? (rows as unknown as { id: string }[]);
  return list.map((r) => r.id);
}

// Convenience: given a recording id, can the user act on it? Looks up the
// owning class via assignments and runs the membership check.
export async function userCanManageRecording(
  userId: string,
  role: string,
  recordingId: string,
): Promise<boolean> {
  if (role === 'admin') return true;
  if (role !== 'teacher') return false;
  const rows = await db
    .select({ classId: assignments.classId })
    .from(assignments)
    .innerJoin(
      // join recordings via assignment_id; we already imported assignments,
      // and recordings is exported from schema if we need it.
      sql`recordings`,
      sql`recordings.assignment_id = ${assignments.id} AND recordings.id = ${recordingId}`,
    )
    .limit(1);
  if (!rows.length) return false;
  return userCanManageClass(userId, role, rows[0].classId);
}

// Convenience: given an assignment id, can the user act on it? Membership of
// the assignment's class.
export async function userCanManageAssignment(
  userId: string,
  role: string,
  assignmentId: string,
): Promise<boolean> {
  if (role === 'admin') return true;
  if (role !== 'teacher') return false;
  const rows = await db
    .select({ classId: assignments.classId })
    .from(assignments)
    .where(eq(assignments.id, assignmentId))
    .limit(1);
  if (!rows.length) return false;
  return userCanManageClass(userId, role, rows[0].classId);
}
