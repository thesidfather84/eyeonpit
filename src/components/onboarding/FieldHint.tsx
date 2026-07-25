"use client";

import type { ReactNode } from "react";
import { useSettingsStore } from "@/store/useSettingsStore";

interface FieldHintProps {
  id: string;
  children: ReactNode;
}

/**
 * Brief helper text under an unfamiliar field. Skippable two ways: the
 * per-field "×" dismisses just this hint, and the global "Show guided tips"
 * toggle (Help screen, Phase 5) suppresses every hint at once once an
 * operator has learned the app — plan.md §4/§0.4.
 */
export function FieldHint({ id, children }: FieldHintProps) {
  const showGuidedTips = useSettingsStore((state) => state.showGuidedTips);
  const dismissedHints = useSettingsStore((state) => state.dismissedHints);
  const dismissHint = useSettingsStore((state) => state.dismissHint);

  if (!showGuidedTips || dismissedHints.includes(id)) return null;

  return (
    <p className="mt-1 flex items-start justify-between gap-2 text-xs text-muted-foreground">
      <span>{children}</span>
      <button
        type="button"
        onClick={() => dismissHint(id)}
        aria-label="Dismiss hint"
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        ✕
      </button>
    </p>
  );
}
