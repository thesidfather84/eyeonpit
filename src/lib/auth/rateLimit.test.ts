import { beforeEach, describe, expect, it } from "vitest";
import { _resetRateLimitStateForTests, clearRateLimit, isRateLimited, recordFailedAttempt } from "./rateLimit";

beforeEach(() => {
  _resetRateLimitStateForTests();
});

describe("rate limiting — basic throttle for passcode attempts", () => {
  it("a key with no recorded attempts is never rate limited", () => {
    expect(isRateLimited("1.2.3.4")).toBe(false);
  });

  it("stays unblocked for the first 4 failures, blocks on the 5th", () => {
    const key = "1.2.3.4";
    for (let i = 0; i < 4; i++) {
      recordFailedAttempt(key);
      expect(isRateLimited(key)).toBe(false);
    }
    recordFailedAttempt(key);
    expect(isRateLimited(key)).toBe(true);
  });

  it("different keys (different clients) are tracked independently", () => {
    for (let i = 0; i < 5; i++) recordFailedAttempt("1.2.3.4");
    expect(isRateLimited("1.2.3.4")).toBe(true);
    expect(isRateLimited("5.6.7.8")).toBe(false);
  });

  it("clearRateLimit resets a key back to unblocked (called after a successful passcode entry)", () => {
    const key = "1.2.3.4";
    for (let i = 0; i < 5; i++) recordFailedAttempt(key);
    expect(isRateLimited(key)).toBe(true);

    clearRateLimit(key);
    expect(isRateLimited(key)).toBe(false);
  });

  it("the window expires: failures older than the throttle window no longer count", () => {
    const key = "1.2.3.4";
    const start = 1_000_000;
    for (let i = 0; i < 5; i++) recordFailedAttempt(key, start);
    expect(isRateLimited(key, start)).toBe(true);

    const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
    expect(isRateLimited(key, start + FIFTEEN_MINUTES_MS + 1)).toBe(false);
  });

  it("a fresh failure after the window expired starts a brand-new window, not a continuation of the old one", () => {
    const key = "1.2.3.4";
    const start = 1_000_000;
    for (let i = 0; i < 5; i++) recordFailedAttempt(key, start);

    const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
    const later = start + FIFTEEN_MINUTES_MS + 1;
    recordFailedAttempt(key, later); // 1 failure in the new window
    expect(isRateLimited(key, later)).toBe(false);
  });
});
