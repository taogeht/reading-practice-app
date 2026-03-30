import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { studentMedia, users, classEnrollments, classes } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { r2Client } from '@/lib/storage/r2-client';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

// GET /api/student-media?studentId=xxx - List media for a student
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }

    const studentId = request.nextUrl.searchParams.get('studentId');
    if (!studentId) {
      return NextResponse.json({ error: 'studentId is required' }, { status: 400 });
    }

    // Students can only view their own media
    if (user.role === 'student' && user.id !== studentId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Teachers can only view media for students in their classes
    if (user.role === 'teacher') {
      const enrollment = await db
        .select({ id: classEnrollments.id })
        .from(classEnrollments)
        .innerJoin(classes, eq(classEnrollments.classId, classes.id))
        .where(and(
          eq(classEnrollments.studentId, studentId),
          eq(classes.teacherId, user.id)
        ))
        .limit(1);

      if (!enrollment.length) {
        return NextResponse.json({ error: 'Student is not in your classes' }, { status: 403 });
      }
    }

    const media = await db
      .select({
        id: studentMedia.id,
        studentId: studentMedia.studentId,
        mediaType: studentMedia.mediaType,
        title: studentMedia.title,
        description: studentMedia.description,
        fileKey: studentMedia.fileKey,
        fileUrl: studentMedia.fileUrl,
        fileSizeBytes: studentMedia.fileSizeBytes,
        mimeType: studentMedia.mimeType,
        thumbnailKey: studentMedia.thumbnailKey,
        durationSeconds: studentMedia.durationSeconds,
        createdAt: studentMedia.createdAt,
        uploadedByFirstName: users.firstName,
        uploadedByLastName: users.lastName,
      })
      .from(studentMedia)
      .innerJoin(users, eq(studentMedia.uploadedById, users.id))
      .where(eq(studentMedia.studentId, studentId))
      .orderBy(desc(studentMedia.createdAt));

    // For video items, generate presigned URLs for playback
    const mediaWithUrls = await Promise.all(
      media.map(async (item) => {
        if (item.mediaType === 'video') {
          const playbackUrl = await r2Client.generatePresignedDownloadUrl(item.fileKey, 3600);
          return { ...item, playbackUrl };
        }
        return { ...item, playbackUrl: null };
      })
    );

    return NextResponse.json({ media: mediaWithUrls });
  } catch (error) {
    logError(error, 'api/student-media');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
