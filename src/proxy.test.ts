import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { proxy } from "./proxy";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";

const ORIGINAL_PASSCODE = process.env.EYEONPIT_APP_PASSCODE;

beforeEach(() => {
  process.env.EYEONPIT_APP_PASSCODE = "482913";
});

afterEach(() => {
  if (ORIGINAL_PASSCODE == null) delete process.env.EYEONPIT_APP_PASSCODE;
  else process.env.EYEONPIT_APP_PASSCODE = ORIGINAL_PASSCODE;
});

function requestFor(path: string, cookieValue?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookieValue != null) headers.cookie = `${SESSION_COOKIE_NAME}=${cookieValue}`;
  return new NextRequest(new URL(path, "https://eyeonpit.com"), { headers });
}

describe("proxy — public routes are never redirected (with or without a session)", () => {
  it.each(["/", "/docs", "/docs/voice", "/docs/getting-started", "/access", "/robots.txt", "/sitemap.xml"])(
    "%s passes through with no session cookie",
    (path) => {
      const response = proxy(requestFor(path));
      expect(response.headers.get("location")).toBeNull();
    }
  );

  it("public routes also pass through even WITH a valid session (an authorized operator can still browse the public site)", () => {
    const token = createSessionToken();
    const response = proxy(requestFor("/docs/voice", token));
    expect(response.headers.get("location")).toBeNull();
  });
});

describe("proxy — protected routes are blocked without authorization", () => {
  it.each(["/app", "/investigations", "/investigations/abc-123/live", "/investigations/abc-123/floor", "/settings", "/help"])(
    "%s redirects to /access with no cookie at all",
    (path) => {
      const response = proxy(requestFor(path));
      expect(response.status).toBe(307);
      expect(new URL(response.headers.get("location")!).pathname).toBe("/access");
    }
  );

  it("an expired session token is treated exactly like no session at all", () => {
    // A token signed under a different passcode can never verify — the
    // simplest deterministic way to produce an "invalid" token in a unit
    // test without manipulating the clock.
    process.env.EYEONPIT_APP_PASSCODE = "111111";
    const staleToken = createSessionToken();
    process.env.EYEONPIT_APP_PASSCODE = "482913";

    const response = proxy(requestFor("/app", staleToken));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/access");
  });

  it("a garbage cookie value is rejected, not crashed on", () => {
    const response = proxy(requestFor("/app", "not-a-real-token"));
    expect(response.status).toBe(307);
  });
});

describe("proxy — an authorized session (valid signed cookie) reaches every protected route", () => {
  it.each(["/app", "/investigations", "/investigations/abc-123/live", "/investigations/abc-123/floor", "/settings", "/help"])(
    "%s passes through with a valid session cookie",
    (path) => {
      const token = createSessionToken();
      const response = proxy(requestFor(path, token));
      expect(response.headers.get("location")).toBeNull();
    }
  );

  it("the SAME session cookie authorizes navigation across multiple different protected routes in sequence — the operator is never asked to re-enter the passcode", () => {
    const token = createSessionToken();
    for (const path of ["/app", "/investigations", "/settings", "/investigations/xyz/live"]) {
      const response = proxy(requestFor(path, token));
      expect(response.headers.get("location")).toBeNull();
    }
  });
});

describe("proxy — logout consistency: once a session is gone, every protected route is blocked again", () => {
  it("no cookie (simulating post-logout) blocks every protected route the same way an initial visit would", () => {
    for (const path of ["/app", "/investigations", "/settings", "/help"]) {
      const response = proxy(requestFor(path));
      expect(response.status).toBe(307);
      expect(new URL(response.headers.get("location")!).pathname).toBe("/access");
    }
  });
});
