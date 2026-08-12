import { ConsoleShell } from "@/components/live/ConsoleShell";

/**
 * The app's one operational screen. Deliberately outside the `(main)`
 * route group — it needs its own header/menu (via ConsoleShell), not the
 * dashboard TopBar, since the live console and the empty-console state
 * both provide that themselves.
 */
export default function RootPage() {
  return <ConsoleShell />;
}
