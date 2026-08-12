import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isProtectedPath } from "@/lib/auth/protectedRoutes";
import { isValidSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";

/**
 * EyeOnPit 1.4.1 access-control patch. This is the primary gate: it runs
 * before any protected page renders, so directly typing a protected URL
 * (not just clicking "Launch EyeOnPit") is caught here — see the
 * getting-started/authentication guide's "optimistic checks with Proxy"
 * pattern, which this follows: only the signed session cookie is
 * inspected (cheap, no I/O), never a database round-trip.
 *
 * A second, independent check lives in (app)/layout.tsx as defense in
 * depth — per Next.js's own guidance, Proxy alone should never be the
 * only line of defense.
 *
 * Public routes (the marketing site, /docs, /access itself, and static
 * assets) are completely unaffected — isProtectedPath returns false for
 * all of them, so this proxy is a no-op there.
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

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
