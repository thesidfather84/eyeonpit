"use client";

import { RecoveryScreen } from "@/components/system/RecoveryScreen";

/** Catches render errors inside this investigation's page tree (Live screen, its menus/sheets) — an error thrown by layout.tsx itself (the providers wrapping this segment) bubbles up to app/error.tsx instead, since a segment's error boundary never wraps its own sibling layout. */
export default function InvestigationError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RecoveryScreen error={error} reset={reset} />;
}
