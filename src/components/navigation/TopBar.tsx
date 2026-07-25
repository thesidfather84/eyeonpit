import { StatusIndicator } from "@/components/ui/StatusIndicator";
import { HelpIconButton } from "@/components/onboarding/HelpIconButton";

export function TopBar() {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-surface px-4 py-3">
      <span className="text-sm font-semibold tracking-wide text-foreground">
        EyeOnPit
      </span>
      <div className="flex items-center gap-3">
        <StatusIndicator />
        <HelpIconButton />
      </div>
    </header>
  );
}
