import assert from 'node:assert/strict';
import test from 'node:test';
import { mobileDashboardResponseSchema } from './mobile-dashboard';

const dashboard = {
  student: { gradeLevel: 3, readingLevel: '2' },
  nextAssignments: [
    {
      id: 'd9428888-122b-11e1-b85c-61cd3cbb3210',
      title: 'Read The Red Kite',
      storyTitle: 'The Red Kite',
      className: 'Bluebirds',
      dueAt: '2026-08-18T08:00:00.000Z',
      status: 'pending',
      attempts: 0,
      maxAttempts: 3,
      hasTeacherFeedback: false,
    },
  ],
  summary: {
    pendingAssignments: 1,
    submittedAssignments: 0,
    completedAssignments: 2,
    activeSpellingLists: 1,
    activeSpellingWords: 10,
    totalXp: 120,
    currentLevel: 2,
    currentStreakDays: 3,
  },
};

test('mobile dashboard accepts the learner-safe projection', () => {
  assert.equal(mobileDashboardResponseSchema.safeParse(dashboard).success, true);
});

test('mobile dashboard rejects browser-only student credentials', () => {
  const result = mobileDashboardResponseSchema.safeParse({
    ...dashboard,
    student: {
      ...dashboard.student,
      oupEmail: 'learner@example.com',
      oupPassword: 'should-not-leave-the-server',
    },
  });

  assert.equal(result.success, false);
});
