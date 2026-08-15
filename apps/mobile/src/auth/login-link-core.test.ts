import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLoginDestination } from './login-link-core';

const origins = { appHost: 'learn.starlingrise.app', apiHost: 'api.starlingrise.app' };

test('accepts a permanent student link from the configured app host', () => {
  assert.deepEqual(
    parseLoginDestination(
      'https://learn.starlingrise.app/s/1234567890abcdef1234567890abcdef',
      origins,
    ),
    { kind: 'student', token: '1234567890abcdef1234567890abcdef' },
  );
});

test('accepts an old class link for promotion-aware resolution', () => {
  assert.deepEqual(
    parseLoginDestination('https://learn.starlingrise.app/c/grade-2-spring', origins),
    { kind: 'class', code: 'grade-2-spring' },
  );
});

test('accepts the Starling Rise custom scheme', () => {
  assert.deepEqual(
    parseLoginDestination('starlingrise://c/grade-2-spring', origins),
    { kind: 'class', code: 'grade-2-spring' },
  );
});

test('rejects a lookalike host even when its path is valid', () => {
  assert.equal(
    parseLoginDestination(
      'https://starlingrise.example/s/1234567890abcdef1234567890abcdef',
      origins,
    ),
    null,
  );
});
