"use client";

import { useEffect, useState } from "react";
import { installGlobalErrorCapture } from "@/lib/diagnostics/logger";
import { useServiceWorkerUpdate } from "@/hooks/useServiceWorkerUpdate";

/**
 * A small opt-in banner shown when a new version is confirmed available
 * (see useServiceWorkerUpdate) — never reloads on its own. An operator
 * mid-hand should never lose their place to a surprise reload; "Later"
 * just dismisses it for this session, and the next natural reload (or a
 * later "Update Now") picks up the new version. The same detection this
 * banner watches also powers the manual "Check for Update" button in
 * Settings.
 */
export function UpdateAvailableBanner() {
  const { updateAvailable, activateUpdate } = useServiceWorkerUpdate();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    installGlobalErrorCapture();
  }, []);

  if (!updateAvailable || dismissed) return null;

  return (
    <div className="flex flex-none items-center justify-between gap-2 border-b border-accent/40 bg-accent/10 px-3 py-2 text-xs text-foreground">
      <span>New EyeOnPit version available</span>
      <div className="flex flex-none gap-2">
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="tap-target rounded-md px-2 text-muted-foreground hover:text-foreground"
        >
          Later
        </button>
        <button
          type="button"
          onClick={activateUpdate}
          className="tap-target rounded-md bg-accent px-3 font-semibold text-accent-foreground"
        >
          Update Now
        </button>
      </div>
    </div>
  );
}
