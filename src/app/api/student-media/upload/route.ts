import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { studentMedia, students, classEnrollments, classes } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { r2Client } from '@/lib/storage/r2-client';
import { detectMediaType, validateMediaFile } from '@/lib/storage/media-validation';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const studentId = formData.get('studentId') as string;
    const title = formData.get('title') as string;
    const description = formData.get('description') as string | null;

    if (!file || !studentId || !title) {
      return NextResponse.json(
        { error: 'File, studentId, and title are required' },
        { status: 400 }
      );
    }

    // Validate file
    const validation = validateMediaFile(file);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const mediaType = validation.detectedType!;

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

    // Upload file to R2
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileKey = r2Client.generateMediaKey(studentId, mediaType, file.name);

    await r2Client.uploadFile(fileKey, buffer, file.type, {
      'artifact-type': 'student-media',
    });

    // For photos and audio, use proxy URL. For video, we'll use presigned URLs on demand.
    let fileUrl: string;
    if (mediaType === 'photo') {
      fileUrl = `/api/media/${fileKey}`;
    } else if (mediaType === 'audio') {
      fileUrl = `/api/media/${fileKey}`;
    } else {
      // Video: store fileKey, generate presigned URLs on demand
      fileUrl = fileKey;
    }

    // Insert into database
    const [newMedia] = await db.insert(studentMedia).values({
      studentId,
      uploadedById: user.id,
      mediaType,
      title: title.trim(),
      description: description?.trim() || null,
      fileKey,
      fileUrl,
      fileSizeBytes: buffer.length,
      mimeType: file.type,
    }).returning();

    return NextResponse.json({
      success: true,
      media: newMedia,
    });
  } catch (error) {
    logError(error, 'api/student-media/upload');
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
