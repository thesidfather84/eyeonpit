import Link from "next/link";
import { HelpCircle } from "lucide-react";

/**
 * Persistent "?" reachable from every screen — deliberately not a 5th bottom
 * nav tab, so Help never competes with the 4 core destinations. See
 * plan.md §4.
 */
export function HelpIconButton() {
  return (
    <Link
      href="/help"
      aria-label="Help and instructions"
      className="tap-target flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-surface-raised"
    >
      <HelpCircle className="h-5 w-5" aria-hidden />
    </Link>
  );
}
