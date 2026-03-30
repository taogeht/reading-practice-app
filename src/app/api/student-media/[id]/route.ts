import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { studentMedia, classEnrollments, classes } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { r2Client } from '@/lib/storage/r2-client';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

// DELETE /api/student-media/[id] - Delete a media item
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }

    const { id } = await params;

    const media = await db.query.studentMedia.findFirst({
      where: eq(studentMedia.id, id),
    });

    if (!media) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 });
    }

    // Teachers can only delete media for students in their classes
    if (user.role === 'teacher') {
      const enrollment = await db
        .select({ id: classEnrollments.id })
        .from(classEnrollments)
        .innerJoin(classes, eq(classEnrollments.classId, classes.id))
        .where(and(
          eq(classEnrollments.studentId, media.studentId),
          eq(classes.teacherId, user.id)
        ))
        .limit(1);

      if (!enrollment.length) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
      }
    }

    // Delete files from R2
    const keysToDelete = [media.fileKey];
    if (media.thumbnailKey) {
      keysToDelete.push(media.thumbnailKey);
    }
    await r2Client.deleteFiles(keysToDelete);

    // Delete from database
    await db.delete(studentMedia).where(eq(studentMedia.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    logError(error, 'api/student-media/[id]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
