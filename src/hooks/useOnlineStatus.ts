"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getSnapshot() {
  return navigator.onLine;
}

/** The server (and the client's very first hydration pass) has no `navigator` — assume online so there's nothing to mismatch. */
function getServerSnapshot() {
  return true;
}

/**
 * Tracks browser online/offline state for the status indicator in the top
 * bar. Built on useSyncExternalStore specifically so the server-rendered
 * snapshot and the client's first paint always agree — a plain
 * useState+useEffect version risks a hydration mismatch, since `navigator`
 * exists on the client's very first render but not on the server's. See
 * plan.md §13.3.
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
