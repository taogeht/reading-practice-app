import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mobileAuthResponseSchema,
  mobileQrLoginRequestSchema,
  mobileVisualLoginRequestSchema,
} from './mobile-auth';

test('QR login contract accepts a native device and durable student token', () => {
  const result = mobileQrLoginRequestSchema.safeParse({
    loginToken: '1234567890abcdef1234567890abcdef',
    platform: 'ios',
    deviceName: 'Family iPad',
  });

  assert.equal(result.success, true);
});

test('visual login contract rejects non-UUID resource identifiers', () => {
  const result = mobileVisualLoginRequestSchema.safeParse({
    classId: 'class-one',
    studentId: 'student-one',
    visualPassword: 'tiger',
    platform: 'android',
  });

  assert.equal(result.success, false);
});

test('auth response never permits a teacher session', () => {
  const result = mobileAuthResponseSchema.safeParse({
    accessToken: '1234567890abcdef',
    refreshToken: '1234567890abcdef1234567890abcdef',
    accessTokenExpiresAt: new Date().toISOString(),
    user: {
      id: 'd9428888-122b-11e1-b85c-61cd3cbb3210',
      email: null,
      role: 'teacher',
      firstName: 'Taylor',
      lastName: 'Teacher',
    },
  });

  assert.equal(result.success, false);
});
