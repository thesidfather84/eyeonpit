"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { diagnostics } from "@/lib/diagnostics/logger";

export interface ServiceWorkerUpdateState {
  /** True once a new build is confirmed available — a waiting worker, or a build-id mismatch when the SW script itself didn't change. */
  updateAvailable: boolean;
  supported: boolean;
  activeScriptURL: string | null;
  cacheNames: string[];
  checking: boolean;
  /** Re-checks right now — shared by the passive banner's background poll and the Settings "Check for Update" button. */
  checkNow: () => Promise<void>;
  /** Activates the waiting worker and lets its controllerchange handler reload once; if there's no waiting worker (build changed but sw.js didn't), reloads directly — the new HTML/JS load fresh either way via the network-first fetch in sw.js. */
  activateUpdate: () => void;
}

const CHECK_INTERVAL_MS = 60_000;

/**
 * Registers the app-shell service worker once and exposes its update state
 * to any number of consumers (the always-mounted banner, plus the Settings
 * screen's manual check) via this single hook — register() itself is
 * idempotent per the spec, so multiple mounts never create duplicate
 * workers, just redundant polling, which is harmless at this interval.
 *
 * Two independent signals count as "an update is available":
 *  1. The classic SW path — a new /sw.js was fetched, byte-differs, and has
 *     finished installing (registration.waiting / the updatefound flow).
 *  2. A build-id mismatch against /api/build-info — covers the common case
 *     where a deploy changes the app's JS/HTML but not sw.js itself, which
 *     the browser's own SW update check has no way to detect on its own,
 *     since it only diffs the SW script.
 *
 * Neither path ever reloads without activateUpdate() being called
 * explicitly, and neither ever touches IndexedDB.
 */
const SW_SUPPORTED =
  typeof navigator !== "undefined" &&
  "serviceWorker" in navigator &&
  process.env.NODE_ENV === "production";

export function useServiceWorkerUpdate(): ServiceWorkerUpdateState {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [activeScriptURL, setActiveScriptURL] = useState<string | null>(null);
  const [cacheNames, setCacheNames] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);

  const refreshCacheNames = useCallback(async () => {
    if (!("caches" in window)) return;
    setCacheNames(await caches.keys());
  }, []);

  const checkBuildId = useCallback(async () => {
    try {
      const res = await fetch("/api/build-info", { cache: "no-store" });
      if (!res.ok) return;
      const data: { buildId?: string } = await res.json();
      const remote = data.buildId;
      const current = process.env.NEXT_PUBLIC_BUILD_ID ?? "local";
      if (remote && remote !== "local" && current !== "local" && remote !== current) {
        diagnostics.info("service-worker", "build id mismatch detected", { current, remote });
        setUpdateAvailable(true);
      }
    } catch {
      // Offline or the request failed — not evidence of an update, just no signal either way.
    }
  }, []);

  const checkNow = useCallback(async () => {
    setChecking(true);
    try {
      await registrationRef.current?.update().catch(() => {});
      await checkBuildId();
      await refreshCacheNames();
    } finally {
      setChecking(false);
    }
  }, [checkBuildId, refreshCacheNames]);

  useEffect(() => {
    if (!SW_SUPPORTED) return;

    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      diagnostics.info("service-worker", "controllerchange — new worker took over, reloading");
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        registrationRef.current = registration;
        setActiveScriptURL(registration.active?.scriptURL ?? null);
        refreshCacheNames();
        diagnostics.info("service-worker", "registered", {
          scriptURL: registration.active?.scriptURL,
          hasWaiting: !!registration.waiting,
        });
        if (registration.waiting && registration.active) {
          diagnostics.info("service-worker", "a waiting worker already exists on registration");
          waitingWorkerRef.current = registration.waiting;
          setUpdateAvailable(true);
        }
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          diagnostics.info("service-worker", "updatefound — new worker installing");
          installing.addEventListener("statechange", () => {
            diagnostics.info("service-worker", `installing worker state changed: ${installing.state}`);
            if (installing.state === "installed" && registration.active) {
              waitingWorkerRef.current = installing;
              setUpdateAvailable(true);
              refreshCacheNames();
            }
          });
        });
      })
      .catch((error: unknown) => {
        diagnostics.error("service-worker", "registration failed", { error: String(error) });
      });

    // checkBuildId is an async fetch — any setState it triggers only ever
    // runs later inside its own .then(), never synchronously during this
    // effect body, so this isn't the cascading-render pattern the rule
    // guards against; it's the same one-time fetch-on-mount shape as
    // useActiveInvestigation's listInvestigations().then(...) just above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkBuildId();

    // The browser only checks for a newer /sw.js on navigation (or its own
    // ~24h background timer), and never checks the build-id endpoint on its
    // own — a tab left open across a deploy would otherwise never learn a
    // new build exists. Re-checking every 60s while visible, plus
    // immediately on refocus, surfaces a real deployment in practical time.
    const periodicCheck = () => {
      if (document.visibilityState === "visible") {
        registrationRef.current?.update().catch(() => {});
        checkBuildId();
      }
    };
    const intervalId = window.setInterval(periodicCheck, CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", periodicCheck);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", periodicCheck);
    };
  }, [checkBuildId, refreshCacheNames]);

  const activateUpdate = useCallback(() => {
    if (waitingWorkerRef.current) {
      diagnostics.info("service-worker", "operator activated waiting worker");
      waitingWorkerRef.current.postMessage({ type: "SKIP_WAITING" });
      return;
    }
    // Build-id mismatch with no waiting SW — sw.js itself didn't change, so
    // there's nothing to activate; the new HTML/JS load fresh on reload via
    // the network-first fetch already in sw.js.
    diagnostics.info("service-worker", "no waiting worker — reloading directly for build update");
    window.location.reload();
  }, []);

  return {
    updateAvailable,
    supported: SW_SUPPORTED,
    activeScriptURL,
    cacheNames,
    checking,
    checkNow,
    activateUpdate,
  };
}
