import {
  type MobileAssignmentDetail,
  type MobileDashboardAssignment,
  type MobileDashboardAssignmentStatus,
} from '@starling-rise/contracts';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  assignments,
  classes,
  classEnrollments,
  recordings,
  stories,
} from '@/lib/db/schema';
import { r2Client } from '@/lib/storage/r2-client';
import { normalizeTtsAudio } from '@/types/story';

type AssignmentRecording = {
  status: (typeof recordings.$inferSelect)['status'];
  letterGrade: string | null;
  teacherFeedback: string | null;
  teacherReplyAudioUrl: string | null;
};

function assignmentStatus(
  recordingMode: string,
  assignmentRecordings: AssignmentRecording[],
): MobileDashboardAssignmentStatus {
  const completed = assignmentRecordings.some(
    (recording) =>
      recording.status === 'reviewed' ||
      (recordingMode === 'ai_graded' && Boolean(recording.letterGrade)),
  );
  if (completed) return 'completed';
  return assignmentRecordings.some((recording) => recording.status === 'submitted')
    ? 'submitted'
    : 'pending';
}

function hasTeacherFeedback(assignmentRecordings: AssignmentRecording[]): boolean {
  return assignmentRecordings.some(
    (recording) =>
      Boolean(recording.teacherFeedback) || Boolean(recording.teacherReplyAudioUrl),
  );
}

const statusOrder: Record<MobileDashboardAssignmentStatus, number> = {
  pending: 0,
  submitted: 1,
  completed: 2,
};

export async function listActiveMobileAssignments(
  studentId: string,
): Promise<MobileDashboardAssignment[]> {
  const assignmentRows = await db
    .select({
      id: assignments.id,
      title: assignments.title,
      storyTitle: stories.title,
      className: classes.name,
      dueAt: assignments.dueAt,
      assignedAt: assignments.assignedAt,
      maxAttempts: assignments.maxAttempts,
      recordingMode: assignments.recordingMode,
    })
    .from(assignments)
    .innerJoin(stories, eq(assignments.storyId, stories.id))
    .innerJoin(classes, eq(assignments.classId, classes.id))
    .innerJoin(
      classEnrollments,
      and(
        eq(classEnrollments.classId, classes.id),
        eq(classEnrollments.studentId, studentId),
      ),
    )
    .where(and(eq(assignments.status, 'published'), eq(classes.active, true)));

  const assignmentIds = assignmentRows.map((assignment) => assignment.id);
  const recordingRows = assignmentIds.length
    ? await db
        .select({
          assignmentId: recordings.assignmentId,
          status: recordings.status,
          letterGrade: recordings.letterGrade,
          teacherFeedback: recordings.teacherFeedback,
          teacherReplyAudioUrl: recordings.teacherReplyAudioUrl,
        })
        .from(recordings)
        .where(
          and(
            eq(recordings.studentId, studentId),
            inArray(recordings.assignmentId, assignmentIds),
          ),
        )
    : [];

  const recordingsByAssignment = new Map<string, AssignmentRecording[]>();
  for (const recording of recordingRows) {
    const assignmentRecordings = recordingsByAssignment.get(recording.assignmentId) ?? [];
    assignmentRecordings.push(recording);
    recordingsByAssignment.set(recording.assignmentId, assignmentRecordings);
  }

  const projection = assignmentRows.map((assignment) => {
    const assignmentRecordings = recordingsByAssignment.get(assignment.id) ?? [];
    return {
      assignedAt: assignment.assignedAt,
      assignment: {
        id: assignment.id,
        title: assignment.title,
        storyTitle: assignment.storyTitle,
        className: assignment.className,
        dueAt: assignment.dueAt?.toISOString() ?? null,
        status: assignmentStatus(assignment.recordingMode, assignmentRecordings),
        attempts: assignmentRecordings.length,
        maxAttempts: Math.max(1, assignment.maxAttempts ?? 3),
        hasTeacherFeedback: hasTeacherFeedback(assignmentRecordings),
      } satisfies MobileDashboardAssignment,
    };
  });

  projection.sort((left, right) => {
    const statusDifference =
      statusOrder[left.assignment.status] - statusOrder[right.assignment.status];
    if (statusDifference !== 0) return statusDifference;

    const leftDueAt = left.assignment.dueAt
      ? new Date(left.assignment.dueAt).getTime()
      : Number.POSITIVE_INFINITY;
    const rightDueAt = right.assignment.dueAt
      ? new Date(right.assignment.dueAt).getTime()
      : Number.POSITIVE_INFINITY;
    if (leftDueAt !== rightDueAt) return leftDueAt - rightDueAt;

    return (right.assignedAt?.getTime() ?? 0) - (left.assignedAt?.getTime() ?? 0);
  });

  return projection.map(({ assignment }) => assignment);
}

export async function getMobileAssignmentDetail(
  studentId: string,
  assignmentId: string,
): Promise<MobileAssignmentDetail | null> {
  const [assignment] = await db
    .select({
      id: assignments.id,
      title: assignments.title,
      description: assignments.description,
      instructions: assignments.instructions,
      className: classes.name,
      dueAt: assignments.dueAt,
      maxAttempts: assignments.maxAttempts,
      maxRecordingSeconds: assignments.maxRecordingSeconds,
      recordingMode: assignments.recordingMode,
      storyId: stories.id,
      storyTitle: stories.title,
      storyContent: stories.content,
      storyReadingLevel: stories.readingLevel,
      storyWordCount: stories.wordCount,
      storyEstimatedReadingTimeMinutes: stories.estimatedReadingTimeMinutes,
      storyAuthor: stories.author,
      storyGenre: stories.genre,
      storyTtsAudio: stories.ttsAudio,
    })
    .from(assignments)
    .innerJoin(stories, eq(assignments.storyId, stories.id))
    .innerJoin(classes, eq(assignments.classId, classes.id))
    .innerJoin(
      classEnrollments,
      and(
        eq(classEnrollments.classId, classes.id),
        eq(classEnrollments.studentId, studentId),
      ),
    )
    .where(
      and(
        eq(assignments.id, assignmentId),
        eq(assignments.status, 'published'),
        eq(classes.active, true),
      ),
    )
    .limit(1);

  if (!assignment) return null;

  const assignmentRecordings = await db
    .select({
      status: recordings.status,
      letterGrade: recordings.letterGrade,
      teacherFeedback: recordings.teacherFeedback,
      teacherReplyAudioUrl: recordings.teacherReplyAudioUrl,
    })
    .from(recordings)
    .where(
      and(
        eq(recordings.studentId, studentId),
        eq(recordings.assignmentId, assignmentId),
      ),
    );

  return {
    id: assignment.id,
    title: assignment.title,
    description: assignment.description,
    instructions: assignment.instructions,
    className: assignment.className,
    dueAt: assignment.dueAt?.toISOString() ?? null,
    status: assignmentStatus(assignment.recordingMode, assignmentRecordings),
    attempts: assignmentRecordings.length,
    maxAttempts: Math.max(1, assignment.maxAttempts ?? 3),
    maxRecordingSeconds: Math.max(1, assignment.maxRecordingSeconds),
    hasTeacherFeedback: hasTeacherFeedback(assignmentRecordings),
    story: {
      id: assignment.storyId,
      title: assignment.storyTitle,
      content: assignment.storyContent,
      readingLevel: assignment.storyReadingLevel,
      wordCount: assignment.storyWordCount,
      estimatedReadingTimeMinutes: assignment.storyEstimatedReadingTimeMinutes,
      author: assignment.storyAuthor,
      genre: assignment.storyGenre,
      ttsAudio: normalizeTtsAudio(assignment.storyTtsAudio).map((audio) => ({
        id: audio.id,
        url: audio.storageKey ? r2Client.getProxyUrl(audio.storageKey) : audio.url,
        durationSeconds: audio.durationSeconds ?? null,
        voiceId: audio.voiceId ?? null,
        label: audio.label ?? null,
      })),
    },
  };
}
