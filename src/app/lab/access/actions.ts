"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createLabSessionToken, LAB_SESSION_COOKIE_NAME, LAB_SESSION_TTL_MS, verifyLabPasscode } from "@/lib/labAuth/session";
import { clearRateLimit, isRateLimited, recordFailedAttempt } from "@/lib/auth/rateLimit";

/**
 * PRIORITY B9 — the /lab passcode gate's one Server Action. Mirrors
 * src/app/access/actions.ts exactly (see that file's own doc comments for
 * the full security rationale — constant-time comparison, generic error
 * message, httpOnly signed cookie) with lab-specific session/passcode
 * primitives (lib/labAuth/session.ts) — src/app/access/actions.ts itself is
 * untouched. Rate limiting REUSES the existing generic, key-based throttle
 * (lib/auth/rateLimit.ts) rather than a second copy, with a `lab:` key
 * prefix so a lab-passcode brute-force attempt and a main-app one never
 * share (or exhaust) the same attempt counter.
 */
export type LabAccessFormState = { error: string } | null;

async function clientKey(): Promise<string> {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0]!.trim() : (requestHeaders.get("x-real-ip") ?? "unknown");
  return `lab:${ip}`;
}

export async function submitLabPasscode(_prevState: LabAccessFormState, formData: FormData): Promise<LabAccessFormState> {
  const key = await clientKey();

  if (isRateLimited(key)) {
    return { error: "Incorrect access code." };
  }

  const passcode = String(formData.get("passcode") ?? "");
  if (!verifyLabPasscode(passcode)) {
    recordFailedAttempt(key);
    return { error: "Incorrect access code." };
  }

  clearRateLimit(key);

  const cookieStore = await cookies();
  cookieStore.set(LAB_SESSION_COOKIE_NAME, createLabSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(LAB_SESSION_TTL_MS / 1000),
  });

  redirect("/lab");
}
