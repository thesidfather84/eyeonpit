"use client";

import { useEffect, useState } from "react";

/**
 * Tracks browser online/offline state for the status indicator in the top
 * bar. EyeOnPit's core workflow never depends on this being true — see
 * plan.md §5 — it exists purely so the operator can see the device's
 * connectivity at a glance, not because the app needs it.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}
