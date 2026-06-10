import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { assignments, recordings, stories, classes, users, students, classEnrollments, gradebookTests, gradebookScores } from '@/lib/db/schema';
import { eq, and, desc, count, inArray, sql } from 'drizzle-orm';
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

    // Get student's assignments with story details.
    // The query pulls BOTH published and archived rows so we can split
    // them into two buckets on the response — "active" assignments
    // drive the kid's main Reading view, while archived ones go into
    // a separate "past stories" bucket the kid can open to revisit
    // old recordings + feedback. Without this split a teacher
    // archiving an assignment would also hide the kid's recorded
    // history of it, which surprised more than one student in field
    // testing.
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
        // Either active or archived — split downstream. Draft
        // assignments stay hidden since the teacher hasn't sent
        // them out yet.
        inArray(assignments.status, ['published', 'archived']),
        eq(classEnrollments.studentId, user.id)
      ))
      .orderBy(desc(assignments.assignedAt));

    // Get student's recordings/attempts for each assignment
    const studentRecordings = await db
      .select({
        id: recordings.id,
        assignmentId: recordings.assignmentId,
        attemptNumber: recordings.attemptNumber,
        status: recordings.status,
        accuracyScore: recordings.accuracyScore,
        wpmScore: recordings.wpmScore,
        letterGrade: recordings.letterGrade,
        submittedAt: recordings.submittedAt,
        teacherFeedback: recordings.teacherFeedback,
        teacherReplyAudioUrl: recordings.teacherReplyAudioUrl,
        teacherReplyDurationSeconds: recordings.teacherReplyDurationSeconds,
        reviewedAt: recordings.reviewedAt,
        transcript: recordings.transcript,
        analysisJson: recordings.analysisJson,
        // Fed to RecordingAudioPlayer's fallbackDurationSeconds so
        // the seek bar shows the right length before metadata loads.
        audioDurationSeconds: recordings.audioDurationSeconds,
        // Phase 7 fluency — student card only renders WCPM + ESL band.
        // Native band is intentionally omitted from this endpoint.
        wcpm: recordings.wcpm,
        fluencyScore: recordings.fluencyScore,
        eslWcpmBand: recordings.eslWcpmBand,
        phrasingScore: recordings.phrasingScore,
        smoothnessScore: recordings.smoothnessScore,
        paceScore: recordings.paceScore,
        teacherSummary: recordings.teacherSummary,
        teacherSummaryZh: recordings.teacherSummaryZh,
      })
      .from(recordings)
      .where(eq(recordings.studentId, user.id))
      .orderBy(desc(recordings.submittedAt));

    // Build assignment data with attempt information. The map runs
    // over BOTH active and archived rows; the response splits them
    // into two top-level fields so the dashboard's main flow
    // ignores archived (drives stats, headers, etc.) and the
    // "Past stories" section can pick them up separately.
    const assignmentsWithStatus = studentAssignments.map(assignment => {
      const assignmentRecordings = studentRecordings.filter(r => r.assignmentId === assignment.id);
      const attemptsList = [...assignmentRecordings]
        .sort((a, b) => (a.attemptNumber || 0) - (b.attemptNumber || 0))
        .map(r => ({
          id: r.id,
          attemptNumber: r.attemptNumber,
          status: r.status,
          accuracyScore: r.accuracyScore !== null && r.accuracyScore !== undefined
            ? Math.round(Number(r.accuracyScore))
            : null,
          wpmScore: r.wpmScore !== null && r.wpmScore !== undefined
            ? Math.round(Number(r.wpmScore))
            : null,
          letterGrade: r.letterGrade || null,
          submittedAt: r.submittedAt?.toISOString() || null,
          reviewedAt: r.reviewedAt?.toISOString() || null,
          teacherFeedback: r.teacherFeedback || null,
          teacherReplyAudioUrl: r.teacherReplyAudioUrl || null,
          teacherReplyDurationSeconds: r.teacherReplyDurationSeconds ?? null,
          audioDurationSeconds: r.audioDurationSeconds ?? null,
          transcript: r.transcript || null,
          analysisJson: r.analysisJson ?? null,
          // Pre-cast numerics so the client doesn't have to.
          wcpm: r.wcpm != null ? Math.round(Number(r.wcpm)) : null,
          fluencyScore: r.fluencyScore != null ? Math.round(Number(r.fluencyScore) * 10) / 10 : null,
          eslWcpmBand: (r.eslWcpmBand ?? null) as
            | 'concern'
            | 'developing'
            | 'on_target'
            | 'above_target'
            | null,
          phrasingScore: r.phrasingScore ?? null,
          smoothnessScore: r.smoothnessScore ?? null,
          paceScore: r.paceScore ?? null,
          teacherSummary: r.teacherSummary ?? null,
          teacherSummaryZh: r.teacherSummaryZh ?? null,
        }));
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
        // `status` (below) is the kid-facing rollup of THIS student's
        // recording state (pending/submitted/completed). Distinct from
        // the assignment-row status the teacher controls; we surface
        // the latter here so the response splitter downstream can
        // route archived rows into pastAssignments without mistaking
        // them for "completed by the kid".
        assignmentStatus: assignment.status,
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
        attemptsList,
      };
    });

    // Calculate statistics. Archived rows are excluded so "pending
    // assignments = 3" reflects what's actually on the kid's active
    // board, not lingering counts from teacher-archived work.
    const activeAssignments = assignmentsWithStatus.filter(
      (a) => a.assignmentStatus !== 'archived',
    );
    const pendingAssignments = activeAssignments.filter((a) => a.status === 'pending');
    const submittedAssignments = activeAssignments.filter((a) => a.status === 'submitted');
    const completedAssignments = activeAssignments.filter((a) => a.status === 'completed');

    // Recent gradebook scores (only entered ones) — shown on the kid's
    // dashboard. All entered scores are visible to the student.
    const testScoreRows = await db
      .select({
        testId: gradebookTests.id,
        testName: gradebookTests.name,
        testType: gradebookTests.testType,
        testDate: gradebookTests.testDate,
        score: gradebookScores.score,
      })
      .from(gradebookScores)
      .innerJoin(gradebookTests, eq(gradebookScores.testId, gradebookTests.id))
      .where(and(eq(gradebookScores.studentId, user.id), sql`${gradebookScores.score} IS NOT NULL`))
      .orderBy(desc(gradebookTests.testDate), desc(gradebookTests.createdAt))
      .limit(12);
    const recentTestScores = testScoreRows.map((r) => ({
      testId: r.testId,
      testName: r.testName,
      testType: r.testType,
      testDate: r.testDate,
      score: r.score != null ? Number(r.score) : null,
    }));

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
      // Top-level split: `assignments` is the kid's active list (used
      // by every existing UI block — pending/submitted/completed
      // counters, the Reading tab's Assignment History sub-tabs,
      // stats etc.), while `pastAssignments` is the bucket the new
      // "Past stories" section renders. Splitting on the assignment-
      // row status (not the recording status) preserves the
      // teacher's intent: archived = "off the active board, but the
      // kid's history of it is still revisitable."
      assignments: assignmentsWithStatus.filter(
        (a) => a.assignmentStatus !== 'archived',
      ),
      pastAssignments: assignmentsWithStatus.filter(
        (a) => a.assignmentStatus === 'archived',
      ),
      stats: {
        totalAssignments: activeAssignments.length,
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
      showPracticeStories,
      recentTestScores,
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
