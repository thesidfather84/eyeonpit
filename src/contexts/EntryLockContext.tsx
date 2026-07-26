"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface EntryLockContextValue {
  locked: boolean;
  enable: () => void;
  disable: () => void;
}

const EntryLockContext = createContext<EntryLockContextValue | null>(null);

export function useEntryLock(): EntryLockContextValue {
  const ctx = useContext(EntryLockContext);
  if (!ctx) throw new Error("useEntryLock must be used within EntryLockProvider");
  return ctx;
}

/**
 * Entry Lock — distinct from the quick-hide privacy lock (LockContext).
 * This one keeps the live console itself stable: no page scroll,
 * overscroll/pull-to-refresh, pinch-zoom, text selection, or accidental
 * back-navigation while the operator is entering data. It never blocks the
 * app's own controls — only browser/page-level gestures.
 */
export function EntryLockProvider({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (!locked) return;

    const html = document.documentElement;
    const body = document.body;
    const previousOverscroll = html.style.overscrollBehavior;
    const previousTouchAction = body.style.touchAction;
    const previousUserSelect = body.style.userSelect;

    html.style.overscrollBehavior = "none";
    body.style.touchAction = "manipulation";
    body.style.userSelect = "none";

    // Neutralize the back gesture/button: re-push the current entry every
    // time the operator tries to navigate back, so Entry Lock can't be
    // bypassed by accident. Explicit unlock (press-and-hold) is the only
    // sanctioned way out.
    history.pushState(null, "", window.location.href);
    const handlePopState = () => {
      history.pushState(null, "", window.location.href);
    };
    window.addEventListener("popstate", handlePopState);

    // Best-effort orientation lock — silently no-ops where unsupported
    // (most regular browser tabs outside a fullscreen/installed context).
    const orientation = screen.orientation as
      | (ScreenOrientation & { lock?: (o: string) => Promise<void> })
      | undefined;
    orientation?.lock?.("portrait").catch(() => {});

    return () => {
      html.style.overscrollBehavior = previousOverscroll;
      body.style.touchAction = previousTouchAction;
      body.style.userSelect = previousUserSelect;
      window.removeEventListener("popstate", handlePopState);
      const unlockOrientation = screen.orientation as
        | (ScreenOrientation & { unlock?: () => void })
        | undefined;
      unlockOrientation?.unlock?.();
    };
  }, [locked]);

  return (
    <EntryLockContext.Provider
      value={{ locked, enable: () => setLocked(true), disable: () => setLocked(false) }}
    >
      {children}
    </EntryLockContext.Provider>
  );
}
