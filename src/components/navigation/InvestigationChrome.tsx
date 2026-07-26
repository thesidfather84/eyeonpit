"use client";

import type { ReactNode } from "react";
import { useLockContext } from "@/contexts/LockContext";
import { LockOverlay } from "@/components/live/LockOverlay";

/**
 * One operational screen, no persistent tab bar — Live is the only real
 * destination inside an investigation. History/Reports/Export/Settings/Help
 * are overlays reached from LiveMenu, not routes.
 */
export function InvestigationChrome({ children }: { children: ReactNode }) {
  const { locked } = useLockContext();

  if (locked) {
    return <LockOverlay />;
  }

  // No outer scroll — the console itself (LiveScreen) manages a fixed
  // header/strip/bar shell with one internal scroll region, so the whole
  // page never scrolls as a normal document. See plan/console layout.
  return <div className="flex flex-1 flex-col overflow-hidden">{children}</div>;
}
