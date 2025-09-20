import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { recordings, assignments, classes, classEnrollments } from '@/lib/db/schema';
import { eq, and, count, desc } from 'drizzle-orm';
import { uploadAudioToR2, generateRecordingKey } from '@/lib/r2';
import { logError, createRequestContext } from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== 'student') {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 401 }
      );
    }

    // Parse multipart form data
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    const assignmentId = formData.get('assignmentId') as string;

    if (!audioFile || !assignmentId) {
      return NextResponse.json(
        { error: 'Audio file and assignment ID are required' },
        { status: 400 }
      );
    }

    // Verify the assignment exists and the student has access
    const assignmentWithAccess = await db
      .select({
        id: assignments.id,
        status: assignments.status,
      })
      .from(assignments)
      .innerJoin(classes, eq(assignments.classId, classes.id))
      .innerJoin(classEnrollments, and(
        eq(classEnrollments.classId, classes.id),
        eq(classEnrollments.studentId, user.id)
      ))
      .where(and(
        eq(assignments.id, assignmentId),
        eq(assignments.status, 'published')
      ))
      .limit(1);

    if (!assignmentWithAccess.length) {
      return NextResponse.json(
        { error: 'Assignment not found or not accessible' },
        { status: 404 }
      );
    }

    const assignment = assignmentWithAccess[0];

    // Get current attempt number for this student and assignment
    const existingRecordings = await db
      .select({ attemptNumber: recordings.attemptNumber })
      .from(recordings)
      .where(and(
        eq(recordings.assignmentId, assignmentId),
        eq(recordings.studentId, user.id)
      ))
      .orderBy(desc(recordings.attemptNumber));

    const attemptNumber = existingRecordings.length > 0
      ? (existingRecordings[0].attemptNumber || 0) + 1
      : 1;


    // Convert file to buffer
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Generate unique key for R2 storage
    const recordingKey = generateRecordingKey(user.id, assignmentId, attemptNumber);

    // Upload to R2
    const audioUrl = await uploadAudioToR2(buffer, recordingKey, audioFile.type);

    // Create recording record in database
    const [newRecording] = await db.insert(recordings).values({
      studentId: user.id,
      assignmentId: assignmentId,
      attemptNumber: attemptNumber,
      audioUrl: audioUrl,
      fileSizeBytes: buffer.length,
      audioDurationSeconds: null, // TODO: Calculate duration from audio file
      status: 'pending',
      submittedAt: new Date(),
    }).returning();

    return NextResponse.json({
      success: true,
      recording: {
        id: newRecording.id,
        attemptNumber: newRecording.attemptNumber,
        audioUrl: newRecording.audioUrl,
        submittedAt: newRecording.submittedAt,
        status: newRecording.status,
      }
    });

  } catch (error) {
    logError(error, 'api/recordings/upload');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}