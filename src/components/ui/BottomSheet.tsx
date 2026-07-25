"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * Minimal bottom-anchored overlay used for things that shouldn't cost a full
 * page navigation (e.g. EditSeatsSheet) — plan.md §12: routine adjustments
 * stay in place. Portaled to document.body so it stacks above the bottom
 * nav; the portal target is only touched after mount to stay SSR-safe.
 */
export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  // Lazy initializer, not an effect: document exists on the client's very
  // first render, so this needs no post-mount correction (and `open` is
  // always false on first render for every current call site anyway, so
  // there's nothing to mismatch against the server-rendered null output).
  const [mounted] = useState(() => typeof document !== "undefined");

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-30 flex flex-col justify-end">
      <button
        aria-label="Close"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div
        className="relative rounded-t-xl border-t border-border bg-surface p-4"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="tap-target flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
