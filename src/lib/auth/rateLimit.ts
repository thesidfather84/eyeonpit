/**
 * A basic, deliberately simple in-memory throttle for passcode attempts —
 * "practical within the existing architecture" per the 1.4.1 patch scope,
 * not a distributed rate limiter. Module-scoped state is per server
 * instance (a serverless platform may run several), so this is a
 * best-effort deterrent against casual brute-forcing, not a hard
 * guarantee — appropriate for a single shared temporary passcode, not a
 * reason to build out Redis/a database for this patch.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

interface Entry {
  failures: number;
  windowStart: number;
}

const attempts = new Map<string, Entry>();

function currentEntry(key: string, now: number): Entry | null {
  const entry = attempts.get(key);
  if (!entry) return null;
  if (now - entry.windowStart > WINDOW_MS) {
    attempts.delete(key);
    return null;
  }
  return entry;
}

/** True once `key` (typically the client IP) has reached MAX_ATTEMPTS failures within the current window. */
export function isRateLimited(key: string, now: number = Date.now()): boolean {
  const entry = currentEntry(key, now);
  return entry != null && entry.failures >= MAX_ATTEMPTS;
}

/** Call after a failed passcode attempt — starts a fresh window if none is active or the previous one expired. */
export function recordFailedAttempt(key: string, now: number = Date.now()): void {
  const entry = currentEntry(key, now);
  if (!entry) {
    attempts.set(key, { failures: 1, windowStart: now });
    return;
  }
  entry.failures += 1;
}

/** Call after a successful passcode attempt so a later mistyped entry doesn't inherit an already-building lockout. */
export function clearRateLimit(key: string): void {
  attempts.delete(key);
}

/** Test-only: resets all throttle state between test cases. */
export function _resetRateLimitStateForTests(): void {
  attempts.clear();
}
