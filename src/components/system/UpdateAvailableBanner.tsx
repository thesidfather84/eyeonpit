"use client";

import { useEffect, useState } from "react";
import { diagnostics, installGlobalErrorCapture } from "@/lib/diagnostics/logger";

/**
 * Registers the app-shell service worker and surfaces a small opt-in banner
 * when a new version has installed and is waiting to take over — never
 * reloads on its own. An operator mid-hand should never lose their place
 * to a surprise reload; "Later" just dismisses it for this session, and the
 * next natural reload (or a later "Update Now") picks up the new version.
 *
 * Also proactively re-checks for a new build periodically and on tab
 * refocus (see the interval/visibilitychange handling below) — without
 * this, a tab left open across a deploy would sit on the old build
 * indefinitely, since the browser otherwise only checks for a newer
 * /sw.js on navigation.
 */
export function UpdateAvailableBanner() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    installGlobalErrorCapture();

    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;

    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      diagnostics.info("service-worker", "controllerchange — new worker took over, reloading");
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });

    let registrationRef: ServiceWorkerRegistration | null = null;

    navigator.serviceWorker.register("/sw.js").then((registration) => {
      registrationRef = registration;
      diagnostics.info("service-worker", "registered", {
        scriptURL: registration.active?.scriptURL,
        hasWaiting: !!registration.waiting,
      });
      if (registration.waiting && registration.active) {
        diagnostics.info("service-worker", "a waiting worker already exists on registration");
        setWaitingWorker(registration.waiting);
      }
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;
        diagnostics.info("service-worker", "updatefound — new worker installing");
        installing.addEventListener("statechange", () => {
          diagnostics.info("service-worker", `installing worker state changed: ${installing.state}`);
          if (installing.state === "installed" && registration.active) {
            setWaitingWorker(installing);
          }
        });
      });
    }).catch((error: unknown) => {
      diagnostics.error("service-worker", "registration failed", { error: String(error) });
    });

    // The browser only checks for a newer /sw.js on navigation (or its own
    // ~24h background timer) — a tab left open across a deploy would
    // otherwise never learn a new build exists, since register() above only
    // ever runs once per page load. Proactively re-checking catches a real
    // deployment in practical time without spamming the network: every 60s
    // while the tab is visible, plus immediately whenever it regains focus.
    const checkForUpdate = () => {
      if (document.visibilityState === "visible") {
        registrationRef?.update().catch(() => {});
      }
    };
    const intervalId = window.setInterval(checkForUpdate, 60_000);
    document.addEventListener("visibilitychange", checkForUpdate);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", checkForUpdate);
    };
  }, []);

  if (!waitingWorker || dismissed) return null;

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
          onClick={() => {
            diagnostics.info("service-worker", "operator clicked Update Now");
            waitingWorker.postMessage({ type: "SKIP_WAITING" });
          }}
          className="tap-target rounded-md bg-accent px-3 font-semibold text-accent-foreground"
        >
          Update Now
        </button>
      </div>
    </div>
  );
}
