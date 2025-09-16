import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { assignments, recordings, stories, classes, users, students, classEnrollments } from '@/lib/db/schema';
import { eq, and, desc, count, sql } from 'drizzle-orm';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: { assignmentId: string } }
) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== 'student') {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 401 }
      );
    }

    // Get student details
    const studentDetails = await db
      .select({
        id: students.id,
        firstName: users.firstName,
        lastName: users.lastName,
        gradeLevel: students.gradeLevel,
        readingLevel: students.readingLevel,
      })
      .from(students)
      .innerJoin(users, eq(students.id, users.id))
      .where(eq(students.id, user.id))
      .limit(1);

    if (!studentDetails.length) {
      return NextResponse.json(
        { error: 'Student record not found' },
        { status: 404 }
      );
    }

    // Get assignment with story details - verify student is enrolled in the class
    const assignmentDetails = await db
      .select({
        id: assignments.id,
        title: assignments.title,
        description: assignments.description,
        storyId: assignments.storyId,
        status: assignments.status,
        assignedAt: assignments.assignedAt,
        dueAt: assignments.dueAt,
        maxAttempts: assignments.maxAttempts,
        instructions: assignments.instructions,
        className: classes.name,
        // Story details
        storyTitle: stories.title,
        storyContent: stories.content,
        storyReadingLevel: stories.readingLevel,
        storyGradeLevels: stories.gradeLevels,
        storyWordCount: stories.wordCount,
        storyEstimatedReadingTimeMinutes: stories.estimatedReadingTimeMinutes,
        storyAuthor: stories.author,
        storyGenre: stories.genre,
        storyTtsAudioUrl: stories.ttsAudioUrl,
        storyTtsAudioDurationSeconds: stories.ttsAudioDurationSeconds,
        storyCreatedAt: stories.createdAt,
      })
      .from(assignments)
      .innerJoin(stories, eq(assignments.storyId, stories.id))
      .innerJoin(classes, eq(assignments.classId, classes.id))
      .innerJoin(classEnrollments, and(
        eq(classEnrollments.classId, classes.id),
        eq(classEnrollments.studentId, user.id)
      ))
      .where(and(
        eq(assignments.id, params.assignmentId),
        eq(assignments.status, 'published')
      ))
      .limit(1);

    if (!assignmentDetails.length) {
      return NextResponse.json(
        { error: 'Assignment not found or not accessible' },
        { status: 404 }
      );
    }

    const assignment = assignmentDetails[0];

    // Get student's recording attempts for this assignment
    const studentRecordings = await db
      .select({
        id: recordings.id,
        attemptNumber: recordings.attemptNumber,
        status: recordings.status,
        accuracyScore: recordings.accuracyScore,
        submittedAt: recordings.submittedAt,
        teacherFeedback: recordings.teacherFeedback,
        reviewedAt: recordings.reviewedAt,
      })
      .from(recordings)
      .where(and(
        eq(recordings.assignmentId, params.assignmentId),
        eq(recordings.studentId, user.id)
      ))
      .orderBy(desc(recordings.submittedAt));

    // Determine assignment completion status
    const completedRecordings = studentRecordings.filter(r => r.status === 'reviewed');
    const bestScore = completedRecordings.length > 0
      ? Math.max(...completedRecordings.map(r => Number(r.accuracyScore) || 0))
      : null;

    // Get the most recent recording with feedback
    const latestRecordingWithFeedback = studentRecordings
      .filter(r => r.teacherFeedback)
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())[0];

    const assignmentData = {
      id: assignment.id,
      title: assignment.title,
      description: assignment.description,
      instructions: assignment.instructions,
      dueAt: assignment.dueAt?.toISOString() || null,
      maxAttempts: assignment.maxAttempts || 3,
      attempts: studentRecordings.length,
      status: completedRecordings.length > 0 ? 'completed' as const : 'pending' as const,
      bestScore: bestScore ? Math.round(bestScore) : null,
      teacherFeedback: latestRecordingWithFeedback?.teacherFeedback || null,
      reviewedAt: latestRecordingWithFeedback?.reviewedAt?.toISOString() || null,
      hasTeacherFeedback: !!latestRecordingWithFeedback?.teacherFeedback,
      story: {
        id: assignment.storyId,
        title: assignment.storyTitle,
        content: assignment.storyContent,
        readingLevel: assignment.storyReadingLevel,
        gradeLevels: assignment.storyGradeLevels || [],
        wordCount: assignment.storyWordCount,
        estimatedReadingTimeMinutes: assignment.storyEstimatedReadingTimeMinutes,
        author: assignment.storyAuthor,
        genre: assignment.storyGenre,
        ttsAudioUrl: assignment.storyTtsAudioUrl,
        ttsAudioDurationSeconds: assignment.storyTtsAudioDurationSeconds,
        createdAt: assignment.storyCreatedAt?.toISOString() || new Date().toISOString(),
      },
      recordings: studentRecordings.map(recording => ({
        id: recording.id,
        attemptNumber: recording.attemptNumber,
        status: recording.status,
        accuracyScore: recording.accuracyScore ? Math.round(Number(recording.accuracyScore)) : null,
        submittedAt: recording.submittedAt?.toISOString() || new Date().toISOString(),
        teacherFeedback: recording.teacherFeedback,
        reviewedAt: recording.reviewedAt?.toISOString() || null,
      })),
    };

    return NextResponse.json({
      success: true,
      assignment: assignmentData,
    });

  } catch (error) {
    console.error('Student assignment error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}