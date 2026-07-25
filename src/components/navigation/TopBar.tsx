import Link from "next/link";
import { Settings } from "lucide-react";
import { StatusIndicator } from "@/components/ui/StatusIndicator";
import { HelpIconButton } from "@/components/onboarding/HelpIconButton";

export function TopBar() {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-surface px-4 py-3">
      <span className="text-sm font-semibold tracking-wide text-foreground">
        EyeOnPit
      </span>
      <div className="flex items-center gap-1">
        <StatusIndicator />
        <Link
          href="/settings"
          aria-label="Settings"
          className="tap-target flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-surface-raised"
        >
          <Settings className="h-5 w-5" aria-hidden />
        </Link>
        <HelpIconButton />
      </div>
    </header>
  );
}
