import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { authRateLimits } from '@/lib/db/schema';

export interface RateLimitPolicy {
  maxFailures: number;
  windowMs: number;
  lockMs: number;
}

export interface RateLimitStatus {
  blocked: boolean;
  retryAfterSec: number;
}

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** Read the shared authentication bucket without extending its lock. */
export async function checkRateLimit(
  key: string,
  _policy: RateLimitPolicy,
): Promise<RateLimitStatus> {
  const now = new Date();
  const [bucket] = await db
    .select({ lockedUntil: authRateLimits.lockedUntil })
    .from(authRateLimits)
    .where(eq(authRateLimits.keyHash, hashKey(key)))
    .limit(1);

  if (bucket?.lockedUntil && bucket.lockedUntil > now) {
    return {
      blocked: true,
      retryAfterSec: Math.max(
        1,
        Math.ceil((bucket.lockedUntil.getTime() - now.getTime()) / 1000),
      ),
    };
  }

  return { blocked: false, retryAfterSec: 0 };
}

/** Atomically record a genuine authentication failure in PostgreSQL. */
export async function recordFailure(
  key: string,
  policy: RateLimitPolicy,
): Promise<void> {
  const keyHash = hashKey(key);
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .insert(authRateLimits)
      .values({
        keyHash,
        failureCount: 0,
        windowStartedAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();

    const [bucket] = await tx
      .select()
      .from(authRateLimits)
      .where(eq(authRateLimits.keyHash, keyHash))
      .limit(1)
      .for('update');

    if (!bucket) return;

    const windowExpired =
      now.getTime() - bucket.windowStartedAt.getTime() > policy.windowMs;
    const failureCount = windowExpired ? 1 : bucket.failureCount + 1;
    const lockedUntil =
      failureCount >= policy.maxFailures
        ? new Date(now.getTime() + policy.lockMs)
        : null;

    await tx
      .update(authRateLimits)
      .set({
        failureCount,
        windowStartedAt: windowExpired ? now : bucket.windowStartedAt,
        lockedUntil,
        updatedAt: now,
      })
      .where(eq(authRateLimits.keyHash, keyHash));
  });
}

/** Clear a successful principal's failure history. */
export async function clearRateLimit(key: string): Promise<void> {
  await db
    .delete(authRateLimits)
    .where(eq(authRateLimits.keyHash, hashKey(key)));
}
