"use client";

import { useSettingsStore } from "@/store/useSettingsStore";
import { TERMINOLOGY, type TerminologyDictionary } from "@/lib/terminology";

/** The active label set, driven by the operator's Language setting (Settings -> Language). */
export function useTerminology(): TerminologyDictionary {
  const level = useSettingsStore((s) => s.terminologyLevel);
  return TERMINOLOGY[level];
}
