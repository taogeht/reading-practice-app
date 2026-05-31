// Minimal dependency-free in-memory rate limiter.
//
// ASSUMES a single long-running Node process (the deploy target per CLAUDE.md).
// Counters live in process memory: they reset on restart/deploy and are NOT
// shared across instances. If the app is ever horizontally scaled or moved to
// serverless, replace this with a DB/Redis-backed limiter.

export interface RateLimitPolicy {
  maxFailures: number; // failures within the window before locking
  windowMs: number; // sliding-ish window for counting failures
  lockMs: number; // how long the key stays locked once tripped
}

type Bucket = { count: number; windowStart: number; lockedUntil: number };

const buckets = new Map<string, Bucket>();
const PRUNE_AFTER_MS = 60 * 60 * 1000;

// Keep the map bounded on a long-running process.
function maybePrune(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, b] of buckets) {
    if (b.lockedUntil < now && now - b.windowStart > PRUNE_AFTER_MS) {
      buckets.delete(key);
    }
  }
}

// Read-only: is this key currently locked out? Does not mutate state.
export function checkRateLimit(
  key: string,
  _policy: RateLimitPolicy,
): { blocked: boolean; retryAfterSec: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (b && b.lockedUntil > now) {
    return { blocked: true, retryAfterSec: Math.ceil((b.lockedUntil - now) / 1000) };
  }
  return { blocked: false, retryAfterSec: 0 };
}

// Record one failed attempt; locks the key once it reaches maxFailures within
// the window. Call this only on genuine auth failures.
export function recordFailure(key: string, policy: RateLimitPolicy): void {
  const now = Date.now();
  maybePrune(now);
  let b = buckets.get(key);
  if (!b || now - b.windowStart > policy.windowMs) {
    b = { count: 0, windowStart: now, lockedUntil: 0 };
  }
  b.count += 1;
  if (b.count >= policy.maxFailures) {
    b.lockedUntil = now + policy.lockMs;
  }
  buckets.set(key, b);
}

// Clear a key's failure state (call on successful auth).
export function clearRateLimit(key: string): void {
  buckets.delete(key);
}
