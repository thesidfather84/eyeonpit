import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TerminologyLevel } from "@/lib/terminology";

export type WorkflowAssistanceLevel = "off" | "basic" | "guided";

interface SettingsState {
  /** Set true once the first-use walkthrough has been seen or skipped. */
  hasCompletedOnboarding: boolean;
  /** Governs field hints/tooltips app-wide. Operators can turn this off from Help once they've learned the app — see plan.md §4. */
  showGuidedTips: boolean;
  /** Field-level hint ids the operator has individually dismissed with the hint's own "x". */
  dismissedHints: string[];
  /** Which label set the UI uses app-wide. Defaults to full surveillance/regulatory vocabulary — this is professional surveillance software first. */
  terminologyLevel: TerminologyLevel;
  /** Governs the Operator Assistant bar. Off = no bar at all; Basic = next-step message only; Guided = message plus a fuller explanation for new operators. */
  workflowAssistance: WorkflowAssistanceLevel;
  completeOnboarding: () => void;
  setShowGuidedTips: (value: boolean) => void;
  dismissHint: (id: string) => void;
  setTerminologyLevel: (level: TerminologyLevel) => void;
  setWorkflowAssistance: (level: WorkflowAssistanceLevel) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      hasCompletedOnboarding: false,
      showGuidedTips: true,
      dismissedHints: [],
      terminologyLevel: "casinoProfessional",
      workflowAssistance: "basic",
      completeOnboarding: () => set({ hasCompletedOnboarding: true }),
      setShowGuidedTips: (value) => set({ showGuidedTips: value }),
      dismissHint: (id) =>
        set((state) =>
          state.dismissedHints.includes(id)
            ? state
            : { dismissedHints: [...state.dismissedHints, id] }
        ),
      setTerminologyLevel: (level) => set({ terminologyLevel: level }),
      setWorkflowAssistance: (level) => set({ workflowAssistance: level }),
    }),
    { name: "eyeonpit:settings" }
  )
);
