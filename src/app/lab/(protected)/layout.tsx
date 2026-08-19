import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { isValidLabSessionToken, LAB_SESSION_COOKIE_NAME } from "@/lib/labAuth/session";

/** No reason for the private Lab to appear in search results. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * PRIORITY B9 — everything under /lab except /lab/access itself (that page
 * is a SIBLING of this `(protected)` route group, not nested inside it, so
 * it renders without triggering this check — see this route group's own
 * placement). Defense-in-depth check, mirroring (app)/layout.tsx's own
 * doc comment: proxy.ts is the PRIMARY gate, this is the second,
 * independent check at render time, reading the exact same signed cookie
 * via the exact same `isValidLabSessionToken` used there.
 */
export default async function LabProtectedLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  if (!isValidLabSessionToken(cookieStore.get(LAB_SESSION_COOKIE_NAME)?.value)) {
    redirect("/lab/access");
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex flex-none items-center gap-2 border-b border-border bg-surface px-4 py-3">
        <Link href="/lab" className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-accent" aria-hidden />
          <span className="text-sm font-bold text-foreground">EyeOnPit Lab</span>
        </Link>
        <span className="rounded-full border border-pending/40 bg-pending/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-pending">
          Research / Preview
        </span>
      </header>
      <main className="flex-1 overflow-y-auto px-4 py-4">{children}</main>
    </div>
  );
}
