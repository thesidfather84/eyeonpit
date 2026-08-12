import { describe, expect, it } from "vitest";
import { isProtectedPath } from "./protectedRoutes";

describe("isProtectedPath — the operational application's routes", () => {
  it.each(["/app", "/investigations", "/settings", "/help"])("%s (bare prefix) is protected", (path) => {
    expect(isProtectedPath(path)).toBe(true);
  });

  it.each([
    "/app/",
    "/investigations/new",
    "/investigations/abc-123/live",
    "/investigations/abc-123/floor",
    "/settings/anything",
    "/help/anything",
  ])("%s (sub-path) is protected", (path) => {
    expect(isProtectedPath(path)).toBe(true);
  });
});

describe("isProtectedPath — public marketing/documentation routes stay unprotected", () => {
  it.each(["/", "/docs", "/docs/voice", "/docs/getting-started", "/access", "/robots.txt", "/sitemap.xml"])(
    "%s is NOT protected",
    (path) => {
      expect(isProtectedPath(path)).toBe(false);
    }
  );
});

describe("isProtectedPath — never a loose substring match", () => {
  it.each(["/investigations-export", "/app-store", "/settingsx", "/helpful"])(
    "%s is NOT protected (must not falsely match a protected prefix as a mere substring)",
    (path) => {
      expect(isProtectedPath(path)).toBe(false);
    }
  );
});
