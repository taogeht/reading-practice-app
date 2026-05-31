// Per-teacher feature capabilities. Admin-managed flags on the `teachers` row
// that gate cost-incurring / sensitive teacher features. Admins always pass; a
// teacher passes iff their `teachers` row has the flag true. Missing row
// (data corruption / role mismatch) fails closed.
//
// Middleware is pass-through (see CLAUDE.md), so every gated API route + server
// layout must call teacherCan() itself — this is the single source of truth.

import { db } from '@/lib/db';
import { teachers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export interface TeacherCapabilities {
  canManageSpellingLists: boolean;
  canManageAssignments: boolean;
  canGenerateReadingContent: boolean;
  canGeneratePracticeQuestions: boolean;
  canUseSunnyPreview: boolean;
}

export type TeacherCapability = keyof TeacherCapabilities;

// Restrictive baseline used when a teachers row is missing (fail closed).
const ALL_FALSE: TeacherCapabilities = {
  canManageSpellingLists: false,
  canManageAssignments: false,
  canGenerateReadingContent: false,
  canGeneratePracticeQuestions: false,
  canUseSunnyPreview: false,
};

// One query for all capabilities (avoids an N-lookup per predicate).
export async function getTeacherCapabilities(userId: string): Promise<TeacherCapabilities> {
  const rows = await db
    .select({
      canManageSpellingLists: teachers.canManageSpellingLists,
      canManageAssignments: teachers.canManageAssignments,
      canGenerateReadingContent: teachers.canGenerateReadingContent,
      canGeneratePracticeQuestions: teachers.canGeneratePracticeQuestions,
      canUseSunnyPreview: teachers.canUseSunnyPreview,
    })
    .from(teachers)
    .where(eq(teachers.id, userId))
    .limit(1);
  if (rows.length === 0) return { ...ALL_FALSE };
  return rows[0];
}

// Generic predicate. Admin always passes; non-teacher never; else read the row.
export async function teacherCan(
  user: { id: string; role: string },
  capability: TeacherCapability,
): Promise<boolean> {
  if (user.role === 'admin') return true;
  if (user.role !== 'teacher') return false;
  const caps = await getTeacherCapabilities(user.id);
  return caps[capability];
}

// Named convenience wrappers (call-site readability + back-compat).
export const canGenerateReadingContent = (user: { id: string; role: string }) =>
  teacherCan(user, 'canGenerateReadingContent');
export const canGeneratePracticeQuestions = (user: { id: string; role: string }) =>
  teacherCan(user, 'canGeneratePracticeQuestions');
export const canUseSunnyPreview = (user: { id: string; role: string }) =>
  teacherCan(user, 'canUseSunnyPreview');
export const canManageSpellingLists = (user: { id: string; role: string }) =>
  teacherCan(user, 'canManageSpellingLists');
export const canManageAssignments = (user: { id: string; role: string }) =>
  teacherCan(user, 'canManageAssignments');
