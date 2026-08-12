import { ConsoleShell } from "@/components/live/ConsoleShell";

/**
 * The app's one operational entry point, at /app (EyeOnPit 1.4 moved this
 * off the true site root — see (app)/layout.tsx and the public marketing
 * pages under src/app/(site)). Deliberately outside the `(main)` route
 * group — it needs its own header/menu (via ConsoleShell), not the
 * dashboard TopBar, since the live console and the empty-console state
 * both provide that themselves.
 */
export default function AppEntryPage() {
  return <ConsoleShell />;
}
