import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isProtectedPath } from "@/lib/auth/protectedRoutes";
import { isValidSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { isValidLabSessionToken, LAB_SESSION_COOKIE_NAME } from "@/lib/labAuth/session";

/**
 * EyeOnPit 1.4.1 access-control patch, extended for Priority B9's /lab
 * gate. This is the primary gate: it runs before any protected page
 * renders, so directly typing a protected URL (not just clicking "Launch
 * EyeOnPit"/"Enter the Lab") is caught here — see the
 * getting-started/authentication guide's "optimistic checks with Proxy"
 * pattern, which this follows: only the signed session cookie is
 * inspected (cheap, no I/O), never a database round-trip.
 *
 * A second, independent check lives in (app)/layout.tsx (main app) and
 * lab/(protected)/layout.tsx (/lab) as defense in depth — per Next.js's
 * own guidance, Proxy alone should never be the only line of defense.
 *
 * /lab uses its OWN independent session (lib/labAuth/session.ts) — a
 * DELIBERATELY separate check from the main app's, never the same cookie
 * — see labAuth/session.ts's own doc comment on why. `/lab/access` itself
 * is intentionally excluded so the passcode form is always reachable.
 *
 * Public routes (the marketing site, /docs, /access, /lab/access, and
 * static assets) are completely unaffected — this proxy is a no-op there.
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (pathname === "/lab/access" || pathname.startsWith("/lab/access/")) {
    return NextResponse.next();
  }

  if (pathname === "/lab" || pathname.startsWith("/lab/")) {
    const labToken = request.cookies.get(LAB_SESSION_COOKIE_NAME)?.value;
    if (isValidLabSessionToken(labToken)) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/lab/access", request.url));
  }

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (isValidSessionToken(token)) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/access", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon-192.png|icon-512.png|sw.js).*)"],
};
