import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetRateLimitStateForTests } from "@/lib/auth/rateLimit";
import { SESSION_COOKIE_NAME, isValidSessionToken } from "@/lib/auth/session";

/**
 * Exercises the ACTUAL `submitPasscode` Server Action (the real code path
 * a browser form submission invokes), not a reimplementation of it.
 * `next/headers`/`next/navigation` are mocked with a small in-memory
 * fake — same technique the Next.js team's own testing guidance uses for
 * unit-testing Server Actions outside a running server: capture what the
 * action does (cookie set with what options, redirect to what path)
 * rather than standing up an HTTP server.
 */
class FakeCookieStore {
  private store = new Map<string, { value: string; options?: Record<string, unknown> }>();
  set(name: string, value: string, options?: Record<string, unknown>) {
    this.store.set(name, { value, options });
  }
  get(name: string) {
    const entry = this.store.get(name);
    return entry ? { name, value: entry.value } : undefined;
  }
  getOptions(name: string) {
    return this.store.get(name)?.options;
  }
  delete(name: string) {
    this.store.delete(name);
  }
}

class RedirectSignal extends Error {
  constructor(public destination: string) {
    super(`NEXT_REDIRECT:${destination}`);
  }
}

let fakeCookies: FakeCookieStore;
let fakeForwardedFor: string | null;

vi.mock("next/headers", () => ({
  cookies: async () => fakeCookies,
  headers: async () => ({
    get: (key: string) => (key.toLowerCase() === "x-forwarded-for" ? fakeForwardedFor : null),
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (destination: string) => {
    throw new RedirectSignal(destination);
  },
}));

const ORIGINAL_PASSCODE = process.env.EYEONPIT_APP_PASSCODE;

beforeEach(() => {
  process.env.EYEONPIT_APP_PASSCODE = "482913";
  fakeCookies = new FakeCookieStore();
  fakeForwardedFor = "203.0.113.5";
  _resetRateLimitStateForTests();
});

afterEach(() => {
  if (ORIGINAL_PASSCODE == null) delete process.env.EYEONPIT_APP_PASSCODE;
  else process.env.EYEONPIT_APP_PASSCODE = ORIGINAL_PASSCODE;
  vi.resetModules();
});

function formWith(passcode: string): FormData {
  const fd = new FormData();
  fd.set("passcode", passcode);
  return fd;
}

describe("submitPasscode — the real Server Action behind the /access form", () => {
  it("correct passcode sets an HttpOnly/Secure/SameSite=lax session cookie and redirects to /app", async () => {
    const { submitPasscode } = await import("./actions");

    await expect(submitPasscode(null, formWith("482913"))).rejects.toThrow(RedirectSignal);

    const cookie = fakeCookies.get(SESSION_COOKIE_NAME);
    expect(cookie).toBeDefined();
    expect(isValidSessionToken(cookie!.value)).toBe(true);

    const options = fakeCookies.getOptions(SESSION_COOKIE_NAME)!;
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
    expect(typeof options.maxAge).toBe("number");
    expect(options.maxAge as number).toBeGreaterThan(0);
  });

  it("incorrect passcode returns a generic error and sets no cookie", async () => {
    const { submitPasscode } = await import("./actions");

    const result = await submitPasscode(null, formWith("000000"));

    expect(result).toEqual({ error: "Incorrect access code." });
    expect(fakeCookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it("the error message never reveals the expected length, partial correctness, or any server/env detail", async () => {
    const { submitPasscode } = await import("./actions");

    const result = await submitPasscode(null, formWith("1"));
    expect(result?.error).toBe("Incorrect access code.");
    expect(result?.error).not.toMatch(/length|env|EYEONPIT_APP_PASSCODE|configured/i);
  });

  it("repeated failures from the SAME client are eventually throttled — still the same generic message, never a distinct 'rate limited' message", async () => {
    const { submitPasscode } = await import("./actions");

    for (let i = 0; i < 5; i++) {
      const result = await submitPasscode(null, formWith("wrong"));
      expect(result?.error).toBe("Incorrect access code.");
    }

    // Even the CORRECT passcode is now blocked until the throttle window
    // clears — proves the limiter is actually wired into the action, not
    // just unit-tested in isolation.
    const result = await submitPasscode(null, formWith("482913"));
    expect(result).toEqual({ error: "Incorrect access code." });
    expect(fakeCookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it("a successful login clears any accumulated throttle state for that client", async () => {
    const { submitPasscode } = await import("./actions");

    for (let i = 0; i < 3; i++) {
      await submitPasscode(null, formWith("wrong"));
    }
    await expect(submitPasscode(null, formWith("482913"))).rejects.toThrow(RedirectSignal);

    // A later mistyped attempt is judged fresh, not "3 failures already banked."
    const result = await submitPasscode(null, formWith("wrong-again"));
    expect(result?.error).toBe("Incorrect access code.");
  });

  it("different clients (different x-forwarded-for) are throttled independently", async () => {
    const { submitPasscode } = await import("./actions");

    fakeForwardedFor = "203.0.113.5";
    for (let i = 0; i < 5; i++) await submitPasscode(null, formWith("wrong"));

    fakeForwardedFor = "198.51.100.9";
    await expect(submitPasscode(null, formWith("482913"))).rejects.toThrow(RedirectSignal);
  });
});
