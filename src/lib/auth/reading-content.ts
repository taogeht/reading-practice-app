// Per-teacher capability check for reading-content generation. Gates the
// `/teacher/reading/**` API + UI surfaces so only admin-approved teachers
// can incur LLM / Gemini / TTS cost from the passage pipeline.
//
// Admins always pass. A teacher passes iff their `teachers` row has
// `can_generate_reading_content = true`. If the teachers row is missing
// (data corruption / mismatched users.role) we fail closed.

import { db } from '@/lib/db';
import { teachers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export interface TeacherCapabilities {
  canGenerateReadingContent: boolean;
}

export async function getTeacherCapabilities(
  userId: string,
): Promise<TeacherCapabilities> {
  const rows = await db
    .select({ canGenerateReadingContent: teachers.canGenerateReadingContent })
    .from(teachers)
    .where(eq(teachers.id, userId))
    .limit(1);
  if (rows.length === 0) {
    return { canGenerateReadingContent: false };
  }
  return { canGenerateReadingContent: rows[0].canGenerateReadingContent };
}

export async function canGenerateReadingContent(
  user: { id: string; role: string },
): Promise<boolean> {
  if (user.role === 'admin') return true;
  if (user.role !== 'teacher') return false;
  const caps = await getTeacherCapabilities(user.id);
  return caps.canGenerateReadingContent;
}
