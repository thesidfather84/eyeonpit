import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE_NAME } from "./session";

class FakeCookieStore {
  private store = new Map<string, string>();
  set(name: string, value: string) {
    this.store.set(name, value);
  }
  get(name: string) {
    const value = this.store.get(name);
    return value != null ? { name, value } : undefined;
  }
  delete(name: string) {
    this.store.delete(name);
  }
  has(name: string) {
    return this.store.has(name);
  }
}

class RedirectSignal extends Error {
  constructor(public destination: string) {
    super(`NEXT_REDIRECT:${destination}`);
  }
}

let fakeCookies: FakeCookieStore;

vi.mock("next/headers", () => ({
  cookies: async () => fakeCookies,
}));

vi.mock("next/navigation", () => ({
  redirect: (destination: string) => {
    throw new RedirectSignal(destination);
  },
}));

beforeEach(() => {
  fakeCookies = new FakeCookieStore();
});

afterEach(() => {
  vi.resetModules();
});

describe("logoutAction — the real Server Action behind \"Lock EyeOnPit\"", () => {
  it("deletes the session cookie and redirects to /access", async () => {
    const { logoutAction } = await import("./actions");
    fakeCookies.set(SESSION_COOKIE_NAME, "some-real-looking-session-token");

    await expect(logoutAction()).rejects.toThrow(RedirectSignal);
    expect(fakeCookies.has(SESSION_COOKIE_NAME)).toBe(false);
  });

  it("redirects to /access specifically (never /app or anywhere else)", async () => {
    const { logoutAction } = await import("./actions");
    try {
      await logoutAction();
      expect.unreachable("logoutAction must always redirect");
    } catch (error) {
      expect(error).toBeInstanceOf(RedirectSignal);
      expect((error as RedirectSignal).destination).toBe("/access");
    }
  });

  it("is safe to call even with no session cookie present", async () => {
    const { logoutAction } = await import("./actions");
    await expect(logoutAction()).rejects.toThrow(RedirectSignal);
    expect(fakeCookies.has(SESSION_COOKIE_NAME)).toBe(false);
  });
});
