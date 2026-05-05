import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { assignments, recordings, stories, classes, users, students, classEnrollments } from '@/lib/db/schema';
import { eq, and, desc, count, sql, inArray } from 'drizzle-orm';
import { logError, createRequestContext } from '@/lib/logger';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
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
        avatarUrl: students.avatarUrl,
        oupEmail: students.oupEmail,
        oupPassword: students.oupPassword,
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

    const student = studentDetails[0];

    // Check if any of the student's classes have practice stories enabled
    const classWithPracticeStories = await db
      .select({
        showPracticeStories: classes.showPracticeStories,
      })
      .from(classes)
      .innerJoin(classEnrollments, eq(classEnrollments.classId, classes.id))
      .where(and(
        eq(classEnrollments.studentId, user.id),
        eq(classes.showPracticeStories, true)
      ))
      .limit(1);

    const showPracticeStories = classWithPracticeStories.length > 0;

    // Get student's assignments with story details
    const studentAssignments = await db
      .select({
        id: assignments.id,
        title: assignments.title,
        description: assignments.description,
        storyId: assignments.storyId,
        storyTitle: stories.title,
        status: assignments.status,
        assignedAt: assignments.assignedAt,
        dueAt: assignments.dueAt,
        maxAttempts: assignments.maxAttempts,
        instructions: assignments.instructions,
        recordingMode: assignments.recordingMode,
        className: classes.name,
      })
      .from(assignments)
      .innerJoin(stories, eq(assignments.storyId, stories.id))
      .innerJoin(classes, eq(assignments.classId, classes.id))
      .innerJoin(classEnrollments, eq(classEnrollments.classId, classes.id))
      .where(and(
        inArray(assignments.status, ['published', 'archived']),
        eq(classEnrollments.studentId, user.id)
      ))
      .orderBy(desc(assignments.assignedAt));

    // Get student's recordings/attempts for each assignment
    const studentRecordings = await db
      .select({
        assignmentId: recordings.assignmentId,
        attemptNumber: recordings.attemptNumber,
        status: recordings.status,
        accuracyScore: recordings.accuracyScore,
        letterGrade: recordings.letterGrade,
        submittedAt: recordings.submittedAt,
        teacherFeedback: recordings.teacherFeedback,
        teacherReplyAudioUrl: recordings.teacherReplyAudioUrl,
        teacherReplyDurationSeconds: recordings.teacherReplyDurationSeconds,
        reviewedAt: recordings.reviewedAt,
      })
      .from(recordings)
      .where(eq(recordings.studentId, user.id))
      .orderBy(desc(recordings.submittedAt));

    // Build assignment data with attempt information
    const assignmentsWithStatus = studentAssignments.map(assignment => {
      const assignmentRecordings = studentRecordings.filter(r => r.assignmentId === assignment.id);
      const completedRecordings = assignmentRecordings.filter(r => r.status === 'reviewed' || r.status === 'submitted');
      const bestRecording = completedRecordings.reduce<typeof completedRecordings[0] | null>((best, r) => {
        const score = Number(r.accuracyScore) || 0;
        const bestScore = best ? Number(best.accuracyScore) || 0 : -1;
        return score > bestScore ? r : best;
      }, null);
      const bestScore = bestRecording ? Number(bestRecording.accuracyScore) || 0 : null;
      const bestLetterGrade = bestRecording?.letterGrade || null;

      // Get the most recent recording with any teacher response — text feedback
      // OR an audio reply. A reply alone (no text) still surfaces in the
      // student's feedback callout.
      const latestRecordingWithFeedback = assignmentRecordings
        .filter((r) => (r.teacherFeedback || r.teacherReplyAudioUrl) && r.submittedAt)
        .sort((a, b) => new Date(b.submittedAt!).getTime() - new Date(a.submittedAt!).getTime())[0];

      // Determine assignment status based on recording states.
      // - For 'teacher_review' (default) assignments: a recording is "completed"
      //   only after the teacher reviews it. (Today's behavior.)
      // - For 'ai_graded' assignments: a recording with a letterGrade is the
      //   final score, so we treat it as completed without waiting for the teacher.
      const hasReviewedRecording = assignmentRecordings.some(r => r.status === 'reviewed');
      const hasSubmittedRecording = assignmentRecordings.some(r => r.status === 'submitted');
      const hasGradedRecording =
        assignment.recordingMode === 'ai_graded' &&
        assignmentRecordings.some(r => r.letterGrade);

      let status: 'pending' | 'submitted' | 'completed';
      if (hasReviewedRecording || hasGradedRecording) {
        status = 'completed';
      } else if (hasSubmittedRecording) {
        status = 'submitted';
      } else {
        status = 'pending';
      }

      return {
        id: assignment.id,
        title: assignment.title,
        description: assignment.description,
        storyId: assignment.storyId,
        storyTitle: assignment.storyTitle,
        dueAt: assignment.dueAt?.toISOString() || null,
        status,
        attempts: assignmentRecordings.length,
        maxAttempts: assignment.maxAttempts || 3,
        bestScore: bestScore !== null ? Math.round(bestScore) : null,
        letterGrade: bestLetterGrade,
        recordingMode: assignment.recordingMode,
        instructions: assignment.instructions,
        className: assignment.className,
        teacherFeedback: latestRecordingWithFeedback?.teacherFeedback || null,
        teacherReplyAudioUrl: latestRecordingWithFeedback?.teacherReplyAudioUrl || null,
        teacherReplyDurationSeconds: latestRecordingWithFeedback?.teacherReplyDurationSeconds ?? null,
        reviewedAt: latestRecordingWithFeedback?.reviewedAt?.toISOString() || null,
        hasTeacherFeedback:
          !!latestRecordingWithFeedback?.teacherFeedback ||
          !!latestRecordingWithFeedback?.teacherReplyAudioUrl,
      };
    });

    // Calculate statistics
    const pendingAssignments = assignmentsWithStatus.filter(a => a.status === 'pending');
    const submittedAssignments = assignmentsWithStatus.filter(a => a.status === 'submitted');
    const completedAssignments = assignmentsWithStatus.filter(a => a.status === 'completed');

    const dashboardData = {
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        gradeLevel: student.gradeLevel,
        readingLevel: student.readingLevel,
        avatarUrl: student.avatarUrl,
        oupEmail: student.oupEmail,
        oupPassword: student.oupPassword,
      },
      assignments: assignmentsWithStatus,
      stats: {
        totalAssignments: assignmentsWithStatus.length,
        pendingAssignments: pendingAssignments.length,
        submittedAssignments: submittedAssignments.length,
        completedAssignments: completedAssignments.length,
        averageScore: completedAssignments.length > 0
          ? Math.round(completedAssignments
            .filter(a => a.bestScore)
            .reduce((sum, a) => sum + (a.bestScore || 0), 0) /
            completedAssignments.filter(a => a.bestScore).length)
          : null,
      },
      showPracticeStories
    };

    return NextResponse.json(dashboardData, { status: 200 });

  } catch (error) {
    logError(error, 'api/student/dashboard');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
