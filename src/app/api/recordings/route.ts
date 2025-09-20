import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { recordings, assignments, students, classes, classEnrollments, users } from '@/lib/db/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { logError, createRequestContext } from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'student') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      assignmentId,
      storyId,
      audioUrl,
      audioDurationSeconds,
      fileSizeBytes,
    } = body;

    // Validate required fields
    if (!assignmentId || !audioUrl) {
      return NextResponse.json(
        { error: 'Assignment ID and audio URL are required' },
        { status: 400 }
      );
    }

    // Verify student exists
    const student = await db.query.students.findFirst({
      where: eq(students.id, user.id),
    });

    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    // Verify assignment exists and student is enrolled in the class
    const assignment = await db
      .select({
        id: assignments.id,
        classId: assignments.classId,
        maxAttempts: assignments.maxAttempts,
        status: assignments.status,
      })
      .from(assignments)
      .innerJoin(classes, eq(assignments.classId, classes.id))
      .innerJoin(classEnrollments, and(
        eq(classEnrollments.classId, classes.id),
        eq(classEnrollments.studentId, user.id)
      ))
      .where(eq(assignments.id, assignmentId))
      .limit(1);

    if (!assignment.length) {
      return NextResponse.json({
        error: 'Assignment not found or you are not enrolled in this class'
      }, { status: 404 });
    }

    // Check if assignment is published
    if (assignment[0].status !== 'published') {
      return NextResponse.json({
        error: 'Assignment is not available for submission'
      }, { status: 400 });
    }

    // Get current attempt number
    const existingRecordings = await db
      .select({ attemptNumber: recordings.attemptNumber })
      .from(recordings)
      .where(and(
        eq(recordings.assignmentId, assignmentId),
        eq(recordings.studentId, user.id)
      ))
      .orderBy(desc(recordings.attemptNumber));

    const nextAttemptNumber = existingRecordings.length > 0
      ? (existingRecordings[0].attemptNumber || 0) + 1
      : 1;

    // Check if student has exceeded max attempts
    if (nextAttemptNumber > assignment[0].maxAttempts) {
      return NextResponse.json({
        error: `Maximum attempts (${assignment[0].maxAttempts}) exceeded for this assignment`
      }, { status: 400 });
    }

    // Create recording submission
    const [newRecording] = await db
      .insert(recordings)
      .values({
        assignmentId,
        studentId: user.id,
        audioUrl,
        audioDurationSeconds: audioDurationSeconds || null,
        fileSizeBytes: fileSizeBytes || null,
        attemptNumber: nextAttemptNumber,
        status: 'pending', // Will be reviewed by teacher
        submittedAt: new Date(),
      })
      .returning();

    return NextResponse.json({
      success: true,
      recording: {
        id: newRecording.id,
        attemptNumber: newRecording.attemptNumber,
        status: newRecording.status,
        submittedAt: newRecording.submittedAt,
      },
      message: 'Recording submitted successfully',
    });

  } catch (error) {
    logError(error, 'api/recordings');
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !['teacher', 'admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // For teachers, get recordings from their assignments with class information
    const teacherRecordings = await db
      .select({
        id: recordings.id,
        assignmentId: recordings.assignmentId,
        assignmentTitle: assignments.title,
        studentId: recordings.studentId,
        studentFirstName: users.firstName,
        studentLastName: users.lastName,
        classId: assignments.classId,
        className: classes.name,
        audioUrl: recordings.audioUrl,
        audioDurationSeconds: recordings.audioDurationSeconds,
        attemptNumber: recordings.attemptNumber,
        status: recordings.status,
        submittedAt: recordings.submittedAt,
        reviewedAt: recordings.reviewedAt,
        teacherFeedback: recordings.teacherFeedback,
        accuracyScore: recordings.accuracyScore,
      })
      .from(recordings)
      .innerJoin(assignments, eq(recordings.assignmentId, assignments.id))
      .innerJoin(students, eq(recordings.studentId, students.id))
      .innerJoin(users, eq(students.id, users.id))
      .innerJoin(classes, eq(assignments.classId, classes.id))
      .where(eq(assignments.teacherId, user.id))
      .orderBy(desc(recordings.submittedAt));

    console.log(`Found ${teacherRecordings.length} recordings for teacher ${user.id}`);

    return NextResponse.json({
      success: true,
      recordings: teacherRecordings,
    });

  } catch (error) {
    logError(error, 'api/recordings');
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !['teacher', 'admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const classId = url.searchParams.get('classId');

    if (classId) {
      // Delete all recordings from a specific class
      // First verify the teacher owns the class
      const teacherClass = await db.query.classes.findFirst({
        where: and(eq(classes.id, classId), eq(classes.teacherId, user.id)),
      });

      if (!teacherClass) {
        return NextResponse.json(
          { error: 'Class not found or unauthorized' },
          { status: 404 }
        );
      }

      // First get all assignment IDs for this class
      const classAssignments = await db
        .select({ id: assignments.id })
        .from(assignments)
        .where(and(
          eq(assignments.classId, classId),
          eq(assignments.teacherId, user.id)
        ));

      const assignmentIds = classAssignments.map(a => a.id);

      if (assignmentIds.length > 0) {
        // Delete all recordings from assignments in this class
        await db
          .delete(recordings)
          .where(inArray(recordings.assignmentId, assignmentIds));
      }

      return NextResponse.json({
        success: true,
        message: `Deleted all recordings from class ${teacherClass.name}`,
      });
    } else {
      return NextResponse.json(
        { error: 'Class ID is required' },
        { status: 400 }
      );
    }

  } catch (error) {
    logError(error, 'api/recordings');
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}