import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { studentMedia, classEnrollments, classes } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { r2Client } from '@/lib/storage/r2-client';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }

    const { id } = await params;

    const media = await db.query.studentMedia.findFirst({
      where: eq(studentMedia.id, id),
    });

    if (!media) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 });
    }

    // Students can only download their own media
    if (user.role === 'student' && user.id !== media.studentId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Teachers can only download media for students in their classes
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

    // Generate presigned download URL with content-disposition for download
    const url = await r2Client.generatePresignedDownloadUrl(media.fileKey, 300);

    return NextResponse.json({ url });
  } catch (error) {
    logError(error, 'api/student-media/download/[id]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
