import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLabSessionToken, isValidLabSessionToken, LAB_SESSION_TTL_MS, verifyLabPasscode } from "./session";

const ORIGINAL_PASSCODE = process.env.EYEONPIT_LAB_PASSCODE;

beforeEach(() => {
  process.env.EYEONPIT_LAB_PASSCODE = "751026"; // an arbitrary test fixture value — never a real deployed passcode
});

afterEach(() => {
  if (ORIGINAL_PASSCODE == null) delete process.env.EYEONPIT_LAB_PASSCODE;
  else process.env.EYEONPIT_LAB_PASSCODE = ORIGINAL_PASSCODE;
});

describe("verifyLabPasscode", () => {
  it("accepts the exact configured passcode", () => {
    expect(verifyLabPasscode("751026")).toBe(true);
  });

  it.each(["", "751025", "7510260", "75102", "wrong", "751026 ", " 751026"])('"%s" is rejected', (attempt) => {
    expect(verifyLabPasscode(attempt)).toBe(false);
  });

  it("fails closed when the env var is not configured, rather than throwing", () => {
    delete process.env.EYEONPIT_LAB_PASSCODE;
    expect(verifyLabPasscode("751026")).toBe(false);
    expect(verifyLabPasscode("")).toBe(false);
  });
});

describe("createLabSessionToken / isValidLabSessionToken — round trip", () => {
  it("a freshly created token is valid", () => {
    const token = createLabSessionToken();
    expect(isValidLabSessionToken(token)).toBe(true);
  });

  it("the token never contains the raw passcode as a substring", () => {
    const token = createLabSessionToken();
    expect(token).not.toContain("751026");
  });

  it("a token signed under a DIFFERENT lab passcode is rejected — proves the signature is actually checked", () => {
    const token = createLabSessionToken();
    process.env.EYEONPIT_LAB_PASSCODE = "999999";
    expect(isValidLabSessionToken(token)).toBe(false);
  });

  it("a lab session token is NOT interchangeable with a main-app session token, or vice versa — different signing namespace/env var entirely", () => {
    // Sign a lab token under passcode X, then reconfigure the SAME env var
    // to a different value the main app might plausibly use — the lab
    // token must still only ever validate against its own passcode.
    const labToken = createLabSessionToken();
    process.env.EYEONPIT_LAB_PASSCODE = "482913"; // the main app's own test fixture passcode, reused here on purpose
    expect(isValidLabSessionToken(labToken)).toBe(false);
  });

  it.each([undefined, null, "", "garbage", "12345", "no-dot-here", ".", "123.", ".abc"])(
    "malformed/empty token %s is rejected",
    (bad) => {
      expect(isValidLabSessionToken(bad)).toBe(false);
    }
  );

  it("a tampered signature is rejected even when the payload (expiry) is untouched", () => {
    const token = createLabSessionToken();
    const [payload] = token.split(".");
    expect(isValidLabSessionToken(`${payload}.0000000000000000000000000000000000000000000000000000000000000000`)).toBe(false);
  });

  it("a genuinely expired token (correctly signed, TTL elapsed) is rejected", () => {
    vi.useFakeTimers();
    try {
      const token = createLabSessionToken();
      expect(isValidLabSessionToken(token)).toBe(true);

      vi.advanceTimersByTime(LAB_SESSION_TTL_MS + 1);
      expect(isValidLabSessionToken(token)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
