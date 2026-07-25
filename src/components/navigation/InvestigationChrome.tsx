"use client";

import type { ReactNode } from "react";
import { useLockContext } from "@/contexts/LockContext";
import { LockOverlay } from "@/components/live/LockOverlay";
import { InvestigationBottomNav } from "./InvestigationBottomNav";

export function InvestigationChrome({
  investigationId,
  children,
}: {
  investigationId: string;
  children: ReactNode;
}) {
  const { locked } = useLockContext();

  if (locked) {
    return <LockOverlay />;
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">{children}</div>
      <InvestigationBottomNav investigationId={investigationId} />
    </div>
  );
}
