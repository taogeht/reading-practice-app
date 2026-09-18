// Local regression checks: no database, network, or learner credentials.
// Run: node --import tsx --test scripts/regression/student-heartbeat.test.cjs
const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');
const React = require('react');
const { act, create } = require('react-test-renderer');
const params = new URLSearchParams();
const writes = [];
let identity = { sessionId: 'test-session', user: { id: 'test-student', role: 'student' } };
const chain = {
  set(value) { writes.push(value); return this; },
  where() { return this; },
  from() { return this; },
  orderBy() { return this; },
  limit() { return Promise.resolve([]); },
  values(value) { writes.push(value); return this; },
  onConflictDoUpdate() { return Promise.resolve(); },
};
const originalLoad = Module._load;
Module._load = function (id, ...args) {
  if (id === 'next/navigation') return {
    usePathname: () => '/student/dashboard-v2', useSearchParams: () => params,
  };
  if (id === '@/lib/auth') return { getCurrentSession: async () => identity };
  if (id === '@/lib/db') return { db: {
    update: () => chain, select: () => chain, insert: () => chain,
  } };
  if (id === '@/lib/activity/ensure-schema') return { ensureStudentDailyActivitySchema: async () => {} };
  return originalLoad.call(this, id, ...args);
};
const { StudentActivityProvider, useStudentActivity } = require('../../src/components/providers/student-activity-provider.tsx');
const { useHeartbeat } = require('../../src/hooks/use-heartbeat.ts');
const { POST } = require('../../src/app/api/student/heartbeat/route.ts');
Module._load = originalLoad;

test('authenticated heartbeat records a Taipei calendar date and succeeds', async () => {
  const response = await POST(new Request('http://localhost/api/student/heartbeat', {
    method: 'POST', body: JSON.stringify({ activityType: 'reading', contextLabel: 'Test story' }),
  }));
  assert.equal(response.status, 200);
  const activity = writes.find(value => value.date);
  assert.ok(activity, 'daily activity was recorded');
  assert.equal(activity.date, new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(activity.lastHeartbeatAt));
  assert.equal(activity.activityType, 'reading');
});

test('heartbeat rejects missing sessions and non-students', async () => {
  for (const denied of [null, { sessionId: 'teacher-session', user: { role: 'teacher' } }]) {
    identity = denied;
    const before = writes.length;
    const response = await POST(new Request('http://localhost/api/student/heartbeat', { method: 'POST' }));
    assert.equal(response.status, 401);
    assert.equal(writes.length, before);
  }
});

test('inline activity context settles, permits interaction, changes tabs, and clears on unmount', async () => {
  const previous = { window: global.window, document: global.document, fetch: global.fetch, act: global.IS_REACT_ACT_ENVIRONMENT };
  global.IS_REACT_ACT_ENVIRONMENT = true;
  global.window = { addEventListener() {}, removeEventListener() {} };
  global.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
  global.fetch = async () => ({ ok: false, status: 500 }); // A failed heartbeat must not freeze rendering.
  let renders = 0;
  let currentContext;
  function Observer() {
    currentContext = useStudentActivity().currentContext;
    return null;
  }
  function Learner({ activityType }) {
    if (++renders > 30) throw new Error('Student activity render loop exceeded 30 renders');
    const [clicks, setClicks] = React.useState(0);
    useHeartbeat({ activityType, contextLabel: 'Test activity' });
    return React.createElement('button', { onClick: () => setClicks(n => n + 1) }, String(clicks));
  }
  function Screen({ activityType = 'general', show = true }) {
    return React.createElement(StudentActivityProvider, null,
      React.createElement(Observer), show && React.createElement(Learner, { activityType }));
  }
  let root;
  try {
    await act(async () => { root = create(React.createElement(Screen)); });
    assert.ok(renders < 10, `mount should settle, saw ${renders} renders`);
    await act(async () => { root.root.findByType('button').props.onClick(); });
    assert.deepEqual(root.root.findByType('button').children, ['1']);
    await act(async () => { root.update(React.createElement(Screen, { activityType: 'spelling' })); });
    assert.equal(currentContext.activityType, 'spelling');
    await act(async () => { root.update(React.createElement(Screen, { show: false })); });
    assert.equal(currentContext, null);
  } finally {
    if (root) await act(async () => root.unmount());
    global.window = previous.window;
    global.document = previous.document;
    global.fetch = previous.fetch;
    global.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
});
