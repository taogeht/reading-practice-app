// Local component checks with a controllable microphone permission request.
// Run: node --import tsx --test scripts/regression/audio-recorder.test.cjs
const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { act, create } = require('react-test-renderer');
const { AudioRecorder } = require('../../src/components/audio/audio-recorder.tsx');

async function setup(t) {
  const previousNavigator = Object.getOwnPropertyDescriptor(global, 'navigator');
  const previousRecorder = global.MediaRecorder;
  const previousAct = global.IS_REACT_ACT_ENVIRONMENT;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const requests = [];
  const recorders = [];
  Object.defineProperty(global, 'navigator', { configurable: true, value: {
    mediaDevices: { getUserMedia() {
      return new Promise((resolve, reject) => requests.push({ resolve, reject }));
    } },
  } });
  global.MediaRecorder = class {
    static isTypeSupported() { return true; }
    constructor(stream) { this.stream = stream; this.state = 'inactive'; recorders.push(this); }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; }
  };
  let root;
  await act(async () => { root = create(React.createElement(AudioRecorder)); });
  t.after(async () => {
    await act(async () => root.unmount());
    if (previousNavigator) Object.defineProperty(global, 'navigator', previousNavigator);
    else delete global.navigator;
    global.MediaRecorder = previousRecorder;
    global.IS_REACT_ACT_ENVIRONMENT = previousAct;
  });
  return { root, requests, recorders };
}

const button = (root, label) => root.root.findAllByType('button').find(
  node => JSON.stringify(node.children.filter(child => typeof child === 'string')).includes(label)
);
const stream = () => {
  let stops = 0;
  return { getTracks: () => [{ stop() { stops++; } }], get stops() { return stops; } };
};

test('first press requests the microphone immediately and shows permission feedback', async (t) => {
  const { root, requests, recorders } = await setup(t);
  const start = button(root, 'Start Recording').props.onClick;
  let pending;
  await act(async () => {
    pending = start();
    assert.equal(requests.length, 1, 'permission request starts directly in the click handler');
    void start();
    assert.equal(requests.length, 1, 'also guard repeat clicks before React renders');
  });
  assert.ok(button(root, 'Waiting for mic'), 'first press must visibly respond while permission is pending');
  assert.equal(button(root, 'Waiting for mic').props.disabled, true);
  await act(async () => { void start(); });
  assert.equal(requests.length, 1, 'repeat taps must not open duplicate microphone requests');
  await act(async () => { requests[0].resolve(stream()); await pending; });
  assert.equal(recorders.length, 1);
  assert.ok(button(root, 'Stop Recording'), 'granting permission starts recording without a second press');
});

test('denied permission explains recovery and allows a retry', async (t) => {
  const { root, requests } = await setup(t);
  let pending;
  await act(async () => { pending = button(root, 'Start Recording').props.onClick(); });
  await act(async () => {
    requests[0].reject(new DOMException('Denied', 'NotAllowedError'));
    await pending;
  });
  assert.match(JSON.stringify(root.toJSON()), /browser settings/i);
  assert.equal(button(root, 'Start Recording').props.disabled, false);
  await act(async () => { void button(root, 'Start Recording').props.onClick(); });
  assert.equal(requests.length, 2);
});

test('leaving while permission is pending releases a late microphone stream', async (t) => {
  const { root, requests, recorders } = await setup(t);
  let pending;
  await act(async () => { pending = button(root, 'Start Recording').props.onClick(); });
  await act(async () => root.unmount());
  const lateStream = stream();
  await act(async () => { requests[0].resolve(lateStream); await pending; });
  assert.equal(lateStream.stops, 1);
  assert.equal(recorders.length, 0);
});

test('cancelling a pending request allows retry and ignores the old result', async (t) => {
  const { root, requests, recorders } = await setup(t);
  let pending;
  await act(async () => { pending = button(root, 'Start Recording').props.onClick(); });
  await act(async () => button(root, 'Cancel').props.onClick());
  let retry;
  await act(async () => { retry = button(root, 'Start Recording').props.onClick(); });
  const oldStream = stream();
  await act(async () => { requests[0].resolve(oldStream); await pending; });
  assert.equal(oldStream.stops, 1);
  assert.equal(recorders.length, 0);
  assert.ok(button(root, 'Waiting for mic'));
  await act(async () => { requests[1].resolve(stream()); await retry; });
  assert.ok(button(root, 'Stop Recording'));
});

test('unsupported recording explains how to recover without requesting microphone access', async (t) => {
  const { root, requests } = await setup(t);
  global.MediaRecorder = undefined;
  await act(async () => { await button(root, 'Start Recording').props.onClick(); });
  assert.equal(requests.length, 0);
  assert.match(JSON.stringify(root.toJSON()), /Safari or Chrome/);
  assert.equal(button(root, 'Start Recording').props.disabled, false);
});

test('recorder setup failure releases the microphone and permits retry', async (t) => {
  const { root, requests } = await setup(t);
  global.MediaRecorder = class {
    static isTypeSupported() { return true; }
    constructor() { throw new DOMException('Unsupported format', 'NotSupportedError'); }
  };
  let pending;
  await act(async () => { pending = button(root, 'Start Recording').props.onClick(); });
  const acquired = stream();
  await act(async () => { requests[0].resolve(acquired); await pending; });
  assert.equal(acquired.stops, 1);
  assert.equal(button(root, 'Start Recording').props.disabled, false);
  assert.match(JSON.stringify(root.toJSON()), /Could not start recording/);
});
