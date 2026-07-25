"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface LockContextValue {
  locked: boolean;
  lock: () => void;
  unlock: () => void;
}

const LockContext = createContext<LockContextValue | null>(null);

export function useLockContext(): LockContextValue {
  const ctx = useContext(LockContext);
  if (!ctx) throw new Error("useLockContext must be used within LockProvider");
  return ctx;
}

/** Instant-hide "quick lock" — covers the whole investigation view, including the bottom nav, until tapped again. */
export function LockProvider({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(false);
  return (
    <LockContext.Provider value={{ locked, lock: () => setLocked(true), unlock: () => setLocked(false) }}>
      {children}
    </LockContext.Provider>
  );
}
