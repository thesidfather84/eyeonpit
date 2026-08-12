import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * EyeOnPit 1.4.1 access-control patch — a deliberately small, dependency-
 * free stateless session, appropriate for a single shared temporary
 * passcode (not a per-user account system). No database, no session
 * store: the cookie IS the session, verified by recomputing its signature
 * server-side on every request.
 *
 * SECURITY NOTE: the cookie never contains the raw passcode, and the
 * passcode is never used directly as an HMAC key — `signingKey()` derives
 * a distinct key from it first, so a leaked/forged token can never be
 * used to recover or brute-force the passcode itself via a signing
 * oracle, and the passcode itself is never round-tripped through a cookie
 * a browser (or browser extension, or proxy log) could observe.
 */
export const SESSION_COOKIE_NAME = "eyeonpit_session";
/** 12 hours — long enough for a full shift, short enough that "temporary access" stays temporary without requiring the operator to re-enter it mid-shift. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const PASSCODE_ENV_VAR = "EYEONPIT_APP_PASSCODE";

function getPasscode(): string {
  const value = process.env[PASSCODE_ENV_VAR];
  if (!value) {
    throw new Error(`${PASSCODE_ENV_VAR} is not configured — access control cannot function without it.`);
  }
  return value;
}

function signingKey(): string {
  return createHmac("sha256", "eyeonpit-session-v1").update(getPasscode()).digest("hex");
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("hex");
}

/** Constant-time string comparison — never a plain `===`, which short-circuits on the first differing byte and can leak how much of a guess was correct via response timing. */
function timingSafeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * Verifies a submitted passcode against `EYEONPIT_APP_PASSCODE`. Never
 * throws on a missing/misconfigured env var — treated as "nobody can get
 * in" (fail closed) rather than an unhandled crash.
 */
export function verifyPasscode(input: string): boolean {
  let configured: string;
  try {
    configured = getPasscode();
  } catch {
    return false;
  }
  return timingSafeStringEqual(input, configured);
}

/** `<expiryTimestamp>.<hmacSignature>` — the entire "session" is this one signed, self-verifying string; nothing is stored server-side. */
export function createSessionToken(): string {
  const payload = String(Date.now() + SESSION_TTL_MS);
  return `${payload}.${sign(payload)}`;
}

/** True only for a token whose signature verifies AND whose embedded expiry hasn't passed. A missing/malformed/expired/forged token is never distinguished in the response — all of them are simply "not authorized." */
export function isValidSessionToken(token: string | undefined | null): boolean {
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
