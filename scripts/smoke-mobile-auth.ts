// Exercises the deployed mobile authentication lifecycle with a dedicated test
// learner. This is deliberately opt-in because it writes short-lived refresh
// session rows to the target database. Tokens are never printed.
//
// Required in .env.local (or the process environment):
//   MOBILE_TEST_API_URL=https://your-deployed-app.example.com
//   MOBILE_TEST_LOGIN_TOKEN=<dedicated test learner login token>
//
// Usage:
//   npm run test:mobile-auth-live

import './_bootstrap-env';
import assert from 'node:assert/strict';
import {
  mobileAuthResponseSchema,
  mobileErrorResponseSchema,
  mobileMeResponseSchema,
  type MobileAuthResponse,
  type MobilePlatform,
} from '@starling-rise/contracts';

const configuredUrl = process.env.MOBILE_TEST_API_URL?.trim();
const loginToken = process.env.MOBILE_TEST_LOGIN_TOKEN?.trim();
const platform = (process.env.MOBILE_TEST_PLATFORM?.trim() ||
  'ios') as MobilePlatform;

if (!configuredUrl) {
  throw new Error('MOBILE_TEST_API_URL is required.');
}
if (!loginToken) {
  throw new Error('MOBILE_TEST_LOGIN_TOKEN is required.');
}
if (platform !== 'ios' && platform !== 'android') {
  throw new Error('MOBILE_TEST_PLATFORM must be ios or android.');
}

const apiOrigin = new URL(configuredUrl).origin;
let cleanupRefreshToken: string | null = null;

async function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('X-App-Version', 'live-smoke-test');
  const response = await fetch(`${apiOrigin}${path}`, {
    ...init,
    headers,
  });
  const body: unknown = await response.json().catch(() => null);
  return { response, body };
}

function bearer(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

function json(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

async function expectSessionExpired(refreshToken: string, label: string) {
  const result = await request(
    '/api/mobile/v1/auth/refresh',
    json({ refreshToken, platform }),
  );
  assert.equal(result.response.status, 401, `${label} should return 401`);
  const error = mobileErrorResponseSchema.parse(result.body);
  assert.equal(error.error.code, 'SESSION_EXPIRED');
  console.log(`  ✓ ${label}`);
}

async function logout(refreshToken: string) {
  const result = await request(
    '/api/mobile/v1/auth/logout',
    json({ refreshToken }),
  );
  assert.equal(result.response.status, 200, 'logout should return 200');
}

async function main() {
  console.log(`Mobile auth smoke test: ${apiOrigin}`);

  const anonymousMe = await request('/api/mobile/v1/auth/me');
  assert.equal(anonymousMe.response.status, 401);
  assert.equal(
    mobileErrorResponseSchema.parse(anonymousMe.body).error.code,
    'NOT_AUTHENTICATED',
  );
  console.log('  ✓ anonymous session rejected');

  const login = await request(
    '/api/mobile/v1/auth/qr',
    json({
      loginToken,
      platform,
      deviceName: 'Starling Rise live smoke test',
    }),
  );
  assert.equal(login.response.status, 200, 'QR login should return 200');
  const firstSession = mobileAuthResponseSchema.parse(
    login.body,
  ) as MobileAuthResponse;
  cleanupRefreshToken = firstSession.refreshToken;
  console.log('  ✓ QR login issued a student session');

  const authenticatedMe = await request('/api/mobile/v1/auth/me', {
    headers: bearer(firstSession.accessToken),
  });
  assert.equal(authenticatedMe.response.status, 200);
  const me = mobileMeResponseSchema.parse(authenticatedMe.body);
  assert.equal(me.user.id, firstSession.user.id);
  console.log('  ✓ bearer access token resolved the same learner');

  const refresh = await request(
    '/api/mobile/v1/auth/refresh',
    json({ refreshToken: firstSession.refreshToken, platform }),
  );
  assert.equal(refresh.response.status, 200, 'refresh should return 200');
  const secondSession = mobileAuthResponseSchema.parse(
    refresh.body,
  ) as MobileAuthResponse;
  cleanupRefreshToken = secondSession.refreshToken;
  assert.notEqual(secondSession.accessToken, firstSession.accessToken);
  assert.notEqual(secondSession.refreshToken, firstSession.refreshToken);
  console.log('  ✓ refresh rotated both credentials');

  await expectSessionExpired(
    firstSession.refreshToken,
    'rotated refresh-token replay rejected',
  );

  await logout(secondSession.refreshToken);
  cleanupRefreshToken = null;
  console.log('  ✓ logout revoked the active refresh session');

  await expectSessionExpired(
    secondSession.refreshToken,
    'logged-out refresh token rejected',
  );

  console.log('Mobile authentication smoke test passed.');
}

main()
  .catch(async (error) => {
    if (cleanupRefreshToken) {
      await logout(cleanupRefreshToken).catch(() => undefined);
    }
    console.error('Mobile authentication smoke test failed:', error);
    process.exitCode = 1;
  });
