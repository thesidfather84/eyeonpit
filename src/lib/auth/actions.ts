"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME } from "./session";

/**
 * "Log Out / Lock EyeOnPit" — destroys the session cookie and returns to
 * /access. Lives here (not under src/app/access/) so it can be imported
 * directly from inside the operational app (NavigationDrawer) without
 * reaching into another route's page-scoped module.
 */
export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/access");
}
