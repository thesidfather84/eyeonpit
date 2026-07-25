import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  /** Set true once the first-use walkthrough has been seen or skipped. */
  hasCompletedOnboarding: boolean;
  /** Governs field hints/tooltips app-wide. Operators can turn this off from Help once they've learned the app — see plan.md §4. */
  showGuidedTips: boolean;
  /** Field-level hint ids the operator has individually dismissed with the hint's own "x". */
  dismissedHints: string[];
  completeOnboarding: () => void;
  setShowGuidedTips: (value: boolean) => void;
  dismissHint: (id: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      hasCompletedOnboarding: false,
      showGuidedTips: true,
      dismissedHints: [],
      completeOnboarding: () => set({ hasCompletedOnboarding: true }),
      setShowGuidedTips: (value) => set({ showGuidedTips: value }),
      dismissHint: (id) =>
        set((state) =>
          state.dismissedHints.includes(id)
            ? state
            : { dismissedHints: [...state.dismissedHints, id] }
        ),
    }),
    { name: "eyeonpit:settings" }
  )
);
