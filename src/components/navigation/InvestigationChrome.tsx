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

  return <div className="flex flex-1 flex-col overflow-y-auto">{children}</div>;
}
