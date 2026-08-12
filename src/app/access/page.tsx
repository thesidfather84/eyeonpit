import type { Metadata } from "next";
import { Eye } from "lucide-react";
import { AccessForm } from "./AccessForm";

/**
 * EyeOnPit 1.4.1 access-control patch — the gate between the public
 * marketing site and the operational application. Deliberately its own
 * top-level route (not nested under (site) or (app)): it needs neither
 * the marketing header/footer nor the app's fixed-height mobile console
 * frame, just the bare root layout and its own focused, centered card.
 *
 * "Try Practice Mode" is deliberately NOT offered here. Practice Mode
 * currently runs through the exact same ConsoleShell/EmptyConsole/
 * NavigationDrawer as every other investigation — the same live console,
 * the same links to /investigations, /settings, and /help — so there is
 * no routing- or data-level isolation to safely expose without also
 * exposing the rest of the operational app. Per the 1.4.1 patch's own
 * instruction ("do not fake isolation with UI-only hiding" / "if Practice
 * cannot currently be safely separated ... do NOT expose it publicly
 * yet"), Practice stays behind this same passcode gate like everything
 * else — see the 1.4.1 release notes for the deferred future-patch note.
 */
export const metadata: Metadata = {
  title: "Authorized Access",
  robots: { index: false, follow: false },
};

export default function AccessPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background px-6 py-16 text-center">
      <div className="flex flex-col items-center gap-3">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10">
          <Eye className="h-7 w-7 text-accent" aria-hidden />
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">EyeOnPit Authorized Access</h1>
        <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
          The operational application requires an access code. Enter it below to continue.
        </p>
      </div>

      <AccessForm />
    </div>
  );
}
