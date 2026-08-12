"use client";

import { RecoveryScreen } from "@/components/system/RecoveryScreen";

/** Catches render errors anywhere under the (app) route group (the /app console, its providers, and everything Live renders) that a deeper boundary didn't already handle. */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RecoveryScreen error={error} reset={reset} />;
}
