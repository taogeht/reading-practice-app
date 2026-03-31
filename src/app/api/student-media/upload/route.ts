import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { studentMedia, students, classEnrollments, classes } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { r2Client } from '@/lib/storage/r2-client';
import { detectMediaType, MEDIA_LIMITS } from '@/lib/storage/media-validation';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Step 1: Validate and return a presigned upload URL
// Client then uploads directly to R2, bypassing Next.js body size limits
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }

    const body = await request.json();
    const { studentId, title, description, fileName, fileSize, mimeType } = body;

    if (!studentId || !title || !fileName || !fileSize || !mimeType) {
      return NextResponse.json(
        { error: 'studentId, title, fileName, fileSize, and mimeType are required' },
        { status: 400 }
      );
    }

    // Validate media type
    const mediaType = detectMediaType(mimeType);
    if (!mediaType) {
      return NextResponse.json(
        { error: `File type "${mimeType}" is not supported.` },
        { status: 400 }
      );
    }

    // Validate file size
    const limits = MEDIA_LIMITS[mediaType];
    if (fileSize > limits.maxSize) {
      const maxMB = limits.maxSize / (1024 * 1024);
      return NextResponse.json(
        { error: `File is too large. Maximum size for ${mediaType} is ${maxMB}MB.` },
        { status: 400 }
      );
    }

    // Verify student exists
    const student = await db.query.students.findFirst({
      where: eq(students.id, studentId),
    });
    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    // Teachers must have the student in one of their classes
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

    // Generate R2 key and presigned upload URL
    const fileKey = r2Client.generateMediaKey(studentId, mediaType, fileName);
    const presignedUrl = await r2Client.generatePresignedUploadUrl(fileKey, mimeType, 600);

    // Determine the file URL for serving
    let fileUrl: string;
    if (mediaType === 'video') {
      fileUrl = fileKey; // Videos use presigned download URLs on demand
    } else {
      fileUrl = `/api/media/${fileKey}`;
    }

    // Create DB record now (upload happens client-side next)
    const [newMedia] = await db.insert(studentMedia).values({
      studentId,
      uploadedById: user.id,
      mediaType,
      title: title.trim(),
      description: description?.trim() || null,
      fileKey,
      fileUrl,
      fileSizeBytes: fileSize,
      mimeType,
    }).returning();

    return NextResponse.json({
      success: true,
      media: newMedia,
      presignedUrl,
    });
  } catch (error) {
    logError(error, 'api/student-media/upload');
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
