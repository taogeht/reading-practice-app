import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { recordings, assignments } from '@/lib/db/schema';
import { eq, and, count } from 'drizzle-orm';
import { uploadAudioToR2, generateRecordingKey } from '@/lib/r2';

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
    const assignment = await db.query.assignments.findFirst({
      where: eq(assignments.id, assignmentId),
      with: {
        class: {
          with: {
            enrollments: {
              where: eq(assignments.id, assignmentId)
            }
          }
        }
      }
    });

    if (!assignment) {
      return NextResponse.json(
        { error: 'Assignment not found' },
        { status: 404 }
      );
    }

    // Get current attempt number for this student and assignment
    const existingRecordings = await db
      .select({ count: count() })
      .from(recordings)
      .where(and(
        eq(recordings.studentId, user.id),
        eq(recordings.assignmentId, assignmentId)
      ));

    const attemptNumber = (existingRecordings[0]?.count || 0) + 1;

    // Check if student has exceeded max attempts
    if (assignment.maxAttempts && attemptNumber > assignment.maxAttempts) {
      return NextResponse.json(
        { error: 'Maximum attempts exceeded' },
        { status: 400 }
      );
    }

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
      audioSize: buffer.length,
      duration: null, // TODO: Calculate duration from audio file
      status: 'submitted',
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
    console.error('Recording upload error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}