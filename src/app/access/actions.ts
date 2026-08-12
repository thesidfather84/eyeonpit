"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_TTL_MS, verifyPasscode } from "@/lib/auth/session";
import { clearRateLimit, isRateLimited, recordFailedAttempt } from "@/lib/auth/rateLimit";

export type AccessFormState = { error: string } | null;

/** Best-effort client identifier for rate limiting — Vercel sets x-forwarded-for; falls back to a single shared bucket if neither header is present (still throttles, just coarser). */
async function clientKey(): Promise<string> {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();
  return requestHeaders.get("x-real-ip") ?? "unknown";
}

/**
 * The one Server Action behind the /access form. Deliberately returns the
 * SAME generic error for every failure mode (wrong passcode, rate
 * limited, misconfigured env var) — never distinguishes them in the
 * response, per the explicit "do not reveal ... server details" 1.4.1
 * requirement.
 */
export async function submitPasscode(_prevState: AccessFormState, formData: FormData): Promise<AccessFormState> {
  const key = await clientKey();

  if (isRateLimited(key)) {
    return { error: "Incorrect access code." };
  }

  const passcode = String(formData.get("passcode") ?? "");
  if (!verifyPasscode(passcode)) {
    recordFailedAttempt(key);
    return { error: "Incorrect access code." };
  }

  clearRateLimit(key);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });

  redirect("/app");
}
