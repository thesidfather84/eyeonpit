"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, Settings } from "lucide-react";
import { StatusIndicator } from "@/components/ui/StatusIndicator";
import { HelpIconButton } from "@/components/onboarding/HelpIconButton";
import { NavigationDrawer } from "./NavigationDrawer";

export function TopBar() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-surface px-4 py-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Menu"
          className="tap-target flex items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <span className="text-sm font-semibold tracking-wide text-foreground">EyeOnPit</span>
      </div>
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

      <NavigationDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </header>
  );
}
