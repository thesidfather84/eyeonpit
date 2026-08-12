/**
 * The operational application's routes — everything behind the passcode
 * gate. Deliberately a plain list of path PREFIXES, not tied to Next.js in
 * any way, so it's usable identically from proxy.ts (the edge/server gate,
 * matched against every request) and from (app)/layout.tsx (the
 * defense-in-depth check at render time) without either drifting from the
 * other. Every route currently under the src/app/(app) route group must be
 * represented here — see EyeOnPit 1.4's routing migration for the full
 * list this mirrors: /app, /investigations (+ /investigations/[id]/live
 * and /investigations/[id]/floor, both covered by the /investigations
 * prefix), /settings, and the operational /help page (distinct from the
 * public /docs section, which stays unprotected).
 */
export const PROTECTED_PATH_PREFIXES = ["/app", "/investigations", "/settings", "/help"] as const;

/** True when `pathname` is the protected prefix itself or a sub-path of it — never a loose substring match ("/investigations" must not match "/investigations-export" or similar). */
export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
