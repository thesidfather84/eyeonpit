"use client";

import { Eye } from "lucide-react";
import { useLockContext } from "@/contexts/LockContext";

/** Instant-hide: replaces the entire investigation view, including the bottom nav, until tapped again. */
export function LockOverlay() {
  const { unlock } = useLockContext();

  return (
    <button
      onClick={unlock}
      className="flex flex-1 flex-col items-center justify-center gap-3 bg-background"
    >
      <Eye className="h-8 w-8 text-accent" aria-hidden />
      <span className="text-sm font-semibold text-foreground">EyeOnPit</span>
      <span className="text-xs text-muted-foreground">Tap to unlock</span>
    </button>
  );
}
