import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * PRIORITY B9 — the /lab (future paid-membership Simulation Lab) session.
 * A deliberately SEPARATE, independent mirror of lib/auth/session.ts's
 * proven pattern (own env var, own cookie, own HMAC signing namespace) —
 * NOT a reuse of the main app's session/cookie. This is intentional: /lab
 * is described as a distinct, future paid-membership area (Priority S5),
 * so someone could plausibly have access to one without the other once
 * real accounts/subscriptions exist. Building two independent gates now,
 * rather than one shared boolean, is what makes that separation possible
 * later without a breaking migration — see docs/EYEONPIT_1_6_ARCHITECTURE.md's
 * "/lab Authorization" section.
 *
 * Every security property of the original is preserved unchanged: the
 * passcode is read only server-side, never embedded in client code, never
 * committed, never logged; the cookie never contains the raw passcode; the
 * signing key is derived FROM the passcode via a separate HMAC, not the
 * passcode itself; comparisons are constant-time; and a single generic
 * failure message covers every failure mode. lib/auth/session.ts itself is
 * completely untouched by this file.
 */
export const LAB_SESSION_COOKIE_NAME = "eyeonpit_lab_session";
/** 12 hours — same duration as the main app session, for the same reasoning (a full working session without requiring mid-session re-entry). */
export const LAB_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const LAB_PASSCODE_ENV_VAR = "EYEONPIT_LAB_PASSCODE";

function getLabPasscode(): string {
  const value = process.env[LAB_PASSCODE_ENV_VAR];
  if (!value) {
    throw new Error(`${LAB_PASSCODE_ENV_VAR} is not configured — /lab access control cannot function without it.`);
  }
  return value;
}

function signingKey(): string {
  return createHmac("sha256", "eyeonpit-lab-session-v1").update(getLabPasscode()).digest("hex");
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("hex");
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/** Verifies a submitted passcode against `EYEONPIT_LAB_PASSCODE`. Never throws on a missing/misconfigured env var — fails closed. */
export function verifyLabPasscode(input: string): boolean {
  let configured: string;
  try {
    configured = getLabPasscode();
  } catch {
    return false;
  }
  return timingSafeStringEqual(input, configured);
}

export function createLabSessionToken(): string {
  const payload = String(Date.now() + LAB_SESSION_TTL_MS);
  return `${payload}.${sign(payload)}`;
}

export function isValidLabSessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const dotIndex = token.indexOf(".");
  if (dotIndex === -1) return false;
  const payload = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);
  if (!payload || !signature) return false;

  let expected: string;
  try {
    expected = sign(payload);
  } catch {
    return false;
  }
  if (!timingSafeStringEqual(signature, expected)) return false;

  const expires = Number(payload);
  if (!Number.isFinite(expires)) return false;
  return Date.now() < expires;
}
