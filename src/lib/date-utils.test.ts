import assert from 'node:assert/strict';
import test from 'node:test';
import { getDateString, getTodayDateString } from './date-utils';

test('activity dates follow Taipei midnight, including historical report dates', () => {
  assert.equal(getDateString(new Date('2026-09-18T15:59:59Z')), '2026-09-18');
  assert.equal(getDateString(new Date('2026-09-18T16:00:00Z')), '2026-09-19');
  assert.equal(getDateString(new Date('2025-12-31T16:00:00Z')), '2026-01-01');
});

test('explicit timezone and existing today helper remain supported', () => {
  assert.equal(getDateString(new Date('2026-09-18T16:00:00Z'), 'UTC'), '2026-09-18');
  assert.match(getTodayDateString(), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(getTodayDateString('UTC'), /^\d{4}-\d{2}-\d{2}$/);
});
