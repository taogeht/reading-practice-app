import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  assignments,
  stories,
  classes,
  teachers,
  recordings,
  classEnrollments,
  students,
  users,
} from '@/lib/db/schema';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { logError } from '@/lib/logger';
import { normalizeTtsAudio, StoryTtsAudio } from '@/types/story';
import { r2Client } from '@/lib/storage/r2-client';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: assignmentId } = await params;

    console.log('Assignment API - User:', user.id, user.role);
    console.log('Assignment API - Assignment ID:', assignmentId);

    // Get assignment with story details
    const assignment = await db
      .select({
        id: assignments.id,
        title: assignments.title,
        description: assignments.description,
        status: assignments.status,
        assignedAt: assignments.assignedAt,
        dueAt: assignments.dueAt,
        maxAttempts: assignments.maxAttempts,
        instructions: assignments.instructions,
        createdAt: assignments.createdAt,
        storyId: assignments.storyId,
        classId: assignments.classId,
        teacherId: assignments.teacherId,
        storyTitle: stories.title,
        storyContent: stories.content,
        storyReadingLevel: stories.readingLevel,
        storyWordCount: stories.wordCount,
        storyTtsAudio: stories.ttsAudio,
        storyAuthor: stories.author,
        storyGenre: stories.genre,
        className: classes.name,
      })
      .from(assignments)
      .innerJoin(stories, eq(assignments.storyId, stories.id))
      .leftJoin(classes, eq(assignments.classId, classes.id))
      .where(eq(assignments.id, assignmentId))
      .limit(1);

    console.log('Assignment query result:', assignment);

    if (assignment.length === 0) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    const assignmentData = assignment[0];
    console.log('Assignment data:', assignmentData);
    const storyTtsAudioNormalized = normalizeTtsAudio(assignmentData.storyTtsAudio);

    // Helper function to refresh presigned URLs for TTS audio
    const refreshTtsAudioUrls = async (audioEntries: StoryTtsAudio[]): Promise<StoryTtsAudio[]> => {
      return Promise.all(
        audioEntries.map(async (audio) => {
          if (audio.storageKey) {
            try {
              const freshUrl = await r2Client.generatePresignedDownloadUrl(audio.storageKey, 3600); // 1 hour
              return { ...audio, url: freshUrl };
            } catch (error) {
              console.error('Error generating presigned URL for TTS audio:', error);
              return audio;
            }
          }
          return audio;
        })
      );
    };

    // Handle student access
    if (user.role === 'student') {
      // Verify student has access to this assignment through their class enrollment
      const studentAccess = await db
        .select({ id: classEnrollments.id })
        .from(classEnrollments)
        .where(
          and(
            eq(classEnrollments.studentId, user.id),
            eq(classEnrollments.classId, assignmentData.classId)
          )
        )
        .limit(1);

      if (studentAccess.length === 0) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      // Get student's recording attempts for this assignment
      const studentRecordings = await db
        .select({
          id: recordings.id,
          attemptNumber: recordings.attemptNumber,
          audioUrl: recordings.audioUrl,
          wpmScore: recordings.wpmScore,
          accuracyScore: recordings.accuracyScore,
          teacherFeedback: recordings.teacherFeedback,
          createdAt: recordings.createdAt,
          status: recordings.status,
        })
        .from(recordings)
        .where(
          and(
            eq(recordings.assignmentId, assignmentId),
            eq(recordings.studentId, user.id)
          )
        )
        .orderBy(desc(recordings.attemptNumber));

      // Calculate student's status and progress
      const completedAttempts = studentRecordings.length;
      const bestScore = studentRecordings.length > 0
        ? Math.max(...studentRecordings.map(r => Number(r.wpmScore) || Number(r.accuracyScore) || 0))
        : null;

      const hasCompletedRecording = studentRecordings.some(r => r.status === 'reviewed');
      const canAttempt = completedAttempts < (assignmentData.maxAttempts || 3);

      // Refresh TTS audio URLs for student
      const storyTtsAudio = await refreshTtsAudioUrls(storyTtsAudioNormalized);

      return NextResponse.json({
        success: true,
        assignment: {
          id: assignmentData.id,
          title: assignmentData.title,
          description: assignmentData.description,
          dueAt: assignmentData.dueAt,
          maxAttempts: assignmentData.maxAttempts,
          instructions: assignmentData.instructions,
          story: {
            id: assignmentData.storyId,
            title: assignmentData.storyTitle,
            content: assignmentData.storyContent,
            readingLevel: assignmentData.storyReadingLevel,
            wordCount: assignmentData.storyWordCount,
            ttsAudio: storyTtsAudio,
            author: assignmentData.storyAuthor,
            genre: assignmentData.storyGenre,
          },
        },
        studentProgress: {
          completedAttempts,
          maxAttempts: assignmentData.maxAttempts,
          bestScore,
          hasCompletedRecording,
          canAttempt,
          recordings: studentRecordings,
        },
      });
    }

    // Handle teacher/admin access
    if (['teacher', 'admin'].includes(user.role)) {
      // For teachers, verify they own this assignment
      if (user.role === 'teacher') {
        const teacher = await db.query.teachers.findFirst({
          where: eq(teachers.id, user.id),
        });

        if (!teacher || assignmentData.teacherId !== teacher.id) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }
      }

      const progressRows = await db
        .select({
          studentId: classEnrollments.studentId,
          firstName: users.firstName,
          lastName: users.lastName,
          gradeLevel: students.gradeLevel,
          readingLevel: students.readingLevel,
          active: users.active,
          hasCompleted: sql<number>`CASE WHEN count(${recordings.id}) > 0 THEN 1 ELSE 0 END`,
        })
        .from(classEnrollments)
        .innerJoin(students, eq(classEnrollments.studentId, students.id))
        .innerJoin(users, eq(students.id, users.id))
        .leftJoin(
          recordings,
          and(
            eq(recordings.assignmentId, assignmentId),
            eq(recordings.studentId, classEnrollments.studentId),
            inArray(recordings.status, ['submitted', 'reviewed'])
          )
        )
        .where(eq(classEnrollments.classId, assignmentData.classId))
        .groupBy(
          classEnrollments.studentId,
          users.firstName,
          users.lastName,
          users.active,
          students.gradeLevel,
          students.readingLevel
        );

      const studentSummaries = progressRows.map((row) => ({
        id: row.studentId,
        firstName: row.firstName ?? 'Unknown',
        lastName: row.lastName ?? '',
        gradeLevel: row.gradeLevel ?? null,
        readingLevel: row.readingLevel ?? null,
        active: Boolean(row.active),
        completed: row.hasCompleted > 0,
      }));

      const completedStudents = studentSummaries.filter((student) => student.completed);
      const pendingStudents = studentSummaries.filter((student) => !student.completed);

      // Refresh TTS audio URLs for teacher/admin
      const storyTtsAudio = await refreshTtsAudioUrls(storyTtsAudioNormalized);

      // Return full assignment data for teachers/admins
      return NextResponse.json({
        success: true,
        assignment: {
          id: assignmentData.id,
          title: assignmentData.title,
          description: assignmentData.description,
          status: assignmentData.status,
          assignedAt: assignmentData.assignedAt,
          createdAt: assignmentData.createdAt,
          dueAt: assignmentData.dueAt,
          maxAttempts: assignmentData.maxAttempts,
          instructions: assignmentData.instructions,
          storyId: assignmentData.storyId,
          storyTitle: assignmentData.storyTitle,
          classId: assignmentData.classId,
          className: assignmentData.className,
          story: {
            id: assignmentData.storyId,
            title: assignmentData.storyTitle,
            content: assignmentData.storyContent,
            readingLevel: assignmentData.storyReadingLevel,
            wordCount: assignmentData.storyWordCount,
            ttsAudio: storyTtsAudio,
            author: assignmentData.storyAuthor,
            genre: assignmentData.storyGenre,
          },
        },
        studentProgress: {
          totalStudents: studentSummaries.length,
          completedCount: completedStudents.length,
          completedStudents,
          pendingStudents,
        },
      });
    }

    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  } catch (error) {
    logError(error, 'api/assignments/[id]');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !['teacher', 'admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: assignmentId } = await params;

    // Get teacher ID
    const teacher = await db.query.teachers.findFirst({
      where: eq(teachers.id, user.id),
    });

    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 404 });
    }

    const body = await request.json();
    const {
      title,
      description,
      storyId,
      classId,
      dueAt,
      maxAttempts,
      instructions,
      status,
    } = body;

    // Validate required fields
    if (!title || !storyId || !classId) {
      return NextResponse.json(
        { error: 'Title, story, and class are required' },
        { status: 400 }
      );
    }

    // Verify assignment exists and belongs to teacher
    const existingAssignment = await db
      .select({ id: assignments.id })
      .from(assignments)
      .where(and(
        eq(assignments.id, assignmentId),
        eq(assignments.teacherId, teacher.id)
      ))
      .limit(1);

    if (!existingAssignment.length) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    // Update the assignment
    const [updatedAssignment] = await db
      .update(assignments)
      .set({
        title,
        description,
        storyId,
        classId,
        dueAt: dueAt ? new Date(dueAt) : null,
        maxAttempts: maxAttempts || 3,
        instructions,
        status: status || 'published',
      })
      .where(eq(assignments.id, assignmentId))
      .returning();

    return NextResponse.json({
      success: true,
      assignment: updatedAssignment,
      message: 'Assignment updated successfully',
    });
  } catch (error) {
    logError(error, 'api/assignments/[id]');
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !['teacher', 'admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: assignmentId } = await params;

    // Get teacher ID
    const teacher = await db.query.teachers.findFirst({
      where: eq(teachers.id, user.id),
    });

    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 404 });
    }

    // Verify assignment exists and belongs to teacher
    const existingAssignment = await db
      .select({ id: assignments.id })
      .from(assignments)
      .where(and(
        eq(assignments.id, assignmentId),
        eq(assignments.teacherId, teacher.id)
      ))
      .limit(1);

    if (!existingAssignment.length) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    // Delete the assignment
    await db
      .delete(assignments)
      .where(eq(assignments.id, assignmentId));

    return NextResponse.json({
      success: true,
      message: 'Assignment deleted successfully',
    });
  } catch (error) {
    logError(error, 'api/assignments/[id]');
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
