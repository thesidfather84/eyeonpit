"use client";

import { useRef, useState } from "react";
import { Lock, Unlock } from "lucide-react";
import { useEntryLock } from "@/contexts/EntryLockContext";

const HOLD_MS = 1200;

/** A simple tap enables Entry Lock. Disabling requires a deliberate press-and-hold — an accidental tap must not unlock it. */
export function EntryLockButton() {
  const { locked, enable, disable } = useEntryLock();
  const [holdProgress, setHoldProgress] = useState(0);
  const rafRef = useRef<number | null>(null);

  function cancelHold() {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setHoldProgress(0);
  }

  function startHold() {
    if (!locked) return;
    const start = performance.now();
    const tick = (now: number) => {
      const pct = Math.min(100, ((now - start) / HOLD_MS) * 100);
      setHoldProgress(pct);
      if (pct >= 100) {
        disable();
        cancelHold();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  if (!locked) {
    return (
      <button
        onClick={enable}
        aria-label="Enable Entry Lock"
        className="tap-target flex items-center gap-1 rounded-md border border-border bg-surface-raised px-2 text-[11px] font-medium text-foreground"
      >
        <Unlock className="h-3.5 w-3.5" aria-hidden />
        Lock
      </button>
    );
  }

  return (
    <button
      onPointerDown={startHold}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onContextMenu={(e) => e.preventDefault()}
      aria-label="Hold to disable Entry Lock"
      style={{ userSelect: "none" }}
      className="tap-target relative flex items-center gap-1 overflow-hidden rounded-md bg-accent px-2 text-[11px] font-bold text-accent-foreground"
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 bg-white/25"
        style={{ width: `${holdProgress}%` }}
      />
      <Lock className="relative h-3.5 w-3.5" aria-hidden />
      <span className="relative">LOCKED</span>
    </button>
  );
}
