import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mobileAssignmentDetailResponseSchema,
  mobileAssignmentListResponseSchema,
  mobileRecordingSubmissionResponseSchema,
} from './mobile-assignments';

const assignmentSummary = {
  id: 'd9428888-122b-11e1-b85c-61cd3cbb3210',
  title: 'Read The Red Kite',
  storyTitle: 'The Red Kite',
  className: 'Bluebirds',
  dueAt: null,
  status: 'pending',
  attempts: 0,
  maxAttempts: 3,
  hasTeacherFeedback: false,
};

const assignmentDetail = {
  assignment: {
    id: assignmentSummary.id,
    title: assignmentSummary.title,
    description: null,
    instructions: 'Listen, then read aloud.',
    className: assignmentSummary.className,
    dueAt: assignmentSummary.dueAt,
    status: assignmentSummary.status,
    attempts: assignmentSummary.attempts,
    maxAttempts: assignmentSummary.maxAttempts,
    maxRecordingSeconds: 60,
    hasTeacherFeedback: assignmentSummary.hasTeacherFeedback,
    story: {
      id: 'b3d8e7ba-8e79-4c47-9b2f-77ab0a97cc0a',
      title: 'The Red Kite',
      content: 'The kite rose above the trees.',
      readingLevel: '2',
      wordCount: 7,
      estimatedReadingTimeMinutes: 1,
      author: null,
      genre: 'Adventure',
      ttsAudio: [
        {
          id: 'voice-one',
          url: '/api/audio/audio/tts/red-kite.mp3',
          durationSeconds: 12,
          voiceId: 'en-US-Journey-F',
          label: 'Journey',
        },
      ],
    },
  },
};

test('mobile assignment list accepts learner-facing summaries', () => {
  assert.equal(
    mobileAssignmentListResponseSchema.safeParse({ assignments: [assignmentSummary] }).success,
    true,
  );
});

test('mobile assignment detail accepts narration through the authenticated proxy', () => {
  assert.equal(mobileAssignmentDetailResponseSchema.safeParse(assignmentDetail).success, true);
});

test('mobile assignment detail rejects storage implementation fields', () => {
  const result = mobileAssignmentDetailResponseSchema.safeParse({
    assignment: {
      ...assignmentDetail.assignment,
      story: {
        ...assignmentDetail.assignment.story,
        ttsAudio: [
          {
            ...assignmentDetail.assignment.story.ttsAudio[0],
            storageKey: 'audio/tts/red-kite.mp3',
          },
        ],
      },
    },
  });

  assert.equal(result.success, false);
});

test('mobile recording response acknowledges one submitted attempt without exposing storage', () => {
  const result = mobileRecordingSubmissionResponseSchema.safeParse({
    success: true,
    duplicate: false,
    recording: {
      id: '11967744-7157-4c48-944b-9d5f680d11b5',
      attemptNumber: 1,
      status: 'submitted',
      submittedAt: '2026-08-16T12:00:00.000Z',
    },
    award: {
      pointsAwarded: 20,
      newTotalXp: 120,
      leveledUp: false,
      newLevel: 2,
    },
  });

  assert.equal(result.success, true);
});
