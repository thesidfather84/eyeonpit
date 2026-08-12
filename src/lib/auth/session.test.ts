import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionToken, isValidSessionToken, SESSION_TTL_MS, verifyPasscode } from "./session";

const ORIGINAL_PASSCODE = process.env.EYEONPIT_APP_PASSCODE;

beforeEach(() => {
  process.env.EYEONPIT_APP_PASSCODE = "482913"; // an arbitrary test fixture value — never the real deployed passcode
});

afterEach(() => {
  if (ORIGINAL_PASSCODE == null) delete process.env.EYEONPIT_APP_PASSCODE;
  else process.env.EYEONPIT_APP_PASSCODE = ORIGINAL_PASSCODE;
});

describe("verifyPasscode", () => {
  it("accepts the exact configured passcode", () => {
    expect(verifyPasscode("482913")).toBe(true);
  });

  it.each(["", "482912", "4829130", "48291", "wrong", "482913 ", " 482913"])(
    '"%s" is rejected',
    (attempt) => {
      expect(verifyPasscode(attempt)).toBe(false);
    }
  );

  it("fails closed when the env var is not configured, rather than throwing", () => {
    delete process.env.EYEONPIT_APP_PASSCODE;
    expect(verifyPasscode("482913")).toBe(false);
    expect(verifyPasscode("")).toBe(false);
  });

  it("never treats the raw passcode string as literally present anywhere client-observable — this test documents the property, not a runtime check: verifyPasscode returns a plain boolean, never the configured value", () => {
    expect(typeof verifyPasscode("482913")).toBe("boolean");
  });
});

describe("createSessionToken / isValidSessionToken — round trip", () => {
  it("a freshly created token is valid", () => {
    const token = createSessionToken();
    expect(isValidSessionToken(token)).toBe(true);
  });

  it("the token never contains the raw passcode as a substring", () => {
    const token = createSessionToken();
    expect(token).not.toContain("482913");
  });

  it("a token signed under a DIFFERENT passcode is rejected — proves the signature is actually checked, not just the expiry", () => {
    const token = createSessionToken();
    process.env.EYEONPIT_APP_PASSCODE = "999999";
    expect(isValidSessionToken(token)).toBe(false);
  });

  it.each([undefined, null, "", "garbage", "12345", "no-dot-here", ".", "123.", ".abc"])(
    "malformed/empty token %s is rejected",
    (bad) => {
      expect(isValidSessionToken(bad)).toBe(false);
    }
  );

  it("a tampered signature is rejected even when the payload (expiry) is untouched", () => {
    const token = createSessionToken();
    const [payload] = token.split(".");
    expect(isValidSessionToken(`${payload}.0000000000000000000000000000000000000000000000000000000000000000`)).toBe(
      false
    );
  });

  it("a genuinely expired token (correctly signed, TTL elapsed) is rejected", () => {
    vi.useFakeTimers();
    try {
      const token = createSessionToken();
      expect(isValidSessionToken(token)).toBe(true); // valid the instant it's created

      vi.advanceTimersByTime(SESSION_TTL_MS + 1);
      expect(isValidSessionToken(token)).toBe(false); // invalid once its own TTL has elapsed
    } finally {
      vi.useRealTimers();
    }
  });

  it("a token stays valid right up until (but not including) its own expiry", () => {
    vi.useFakeTimers();
    try {
      const token = createSessionToken();
      vi.advanceTimersByTime(SESSION_TTL_MS - 1);
      expect(isValidSessionToken(token)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
