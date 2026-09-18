// Local route regression: no database, network, or learner credentials.
// Run: node --import tsx --test scripts/regression/student-activity.test.cjs
const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');
let user = { id: 'teacher', role: 'teacher' };
let allowedClasses = ['class'];
let enrolled = true;
let dailyRows = [];
let queryCount = 0;
const originalLoad = Module._load;
Module._load = function (id, ...args) {
  if (id === '@/lib/auth') return { getCurrentUser: async () => user };
  if (id === '@/lib/auth/class-access') return { accessibleClassIds: async () => allowedClasses };
  if (id === '@/lib/activity/login-activity') return { ONLINE_THRESHOLD_MS: 120000 };
  if (id === '@/lib/activity/ensure-schema') return { ensureStudentDailyActivitySchema: async () => {} };
  if (id === '@/lib/db') return { db: { select(fields) {
    queryCount++;
    const rows = fields.date ? dailyRows : fields.id ? (enrolled ? [{ id: 'class' }] : []) : [];
    return {
      from() { return this; }, innerJoin() { return this; }, where() { return this; },
      orderBy() { return this; }, limit() { return this; },
      then(resolve, reject) { return Promise.resolve(rows).then(resolve, reject); },
    };
  } } };
  return originalLoad.call(this, id, ...args);
};
let GET;
try {
  ({ GET } = require('../../src/app/api/teacher/students/[studentId]/activity/route.ts'));
} finally {
  Module._load = originalLoad;
}
const request = () => GET(new Request('http://localhost/api/teacher/students/student/activity'), {
  params: Promise.resolve({ studentId: 'student' }),
});

test('activity report succeeds at Taipei midnight, week and year boundaries', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-18T20:53:47Z') });
  for (const [instant, today, earlier, weekMinutes, monthMinutes] of [
    ['2026-09-18T20:53:47Z', '2026-09-19', '2026-09-18', 3, 3],
    ['2026-09-20T16:00:00Z', '2026-09-21', '2026-09-20', 1, 3],
    ['2025-12-31T16:00:00Z', '2026-01-01', '2025-12-31', 3, 1],
  ]) {
    t.mock.timers.setTime(new Date(instant).getTime());
    dailyRows = [
      { date: today, activityType: 'assignment', secondsActive: 60 },
      { date: earlier, activityType: 'assignment', secondsActive: 120 },
    ];
    const response = await request();
    assert.equal(response.status, 200, instant);
    const body = await response.json();
    assert.equal(body.today.totalMinutes, 1);
    assert.equal(body.thisWeek.totalMinutes, weekMinutes);
    assert.equal(body.thisMonth.totalMinutes, monthMinutes);
    assert.equal(body.recentDailyHistory[0].date, today);
  }
});

test('activity report still rejects unauthorized access', async () => {
  for (const denied of [null, { id: 'student', role: 'student' }]) {
    user = denied;
    const before = queryCount;
    assert.equal((await request()).status, 401);
    assert.equal(queryCount, before);
  }
  user = { id: 'teacher', role: 'teacher' };
  allowedClasses = [];
  assert.equal((await request()).status, 404);
  allowedClasses = ['class'];
  enrolled = false;
  assert.equal((await request()).status, 404);
});
