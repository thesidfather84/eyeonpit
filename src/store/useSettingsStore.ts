import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  /** Set true once the first-use walkthrough has been seen or skipped. */
  hasCompletedOnboarding: boolean;
  /** Governs field hints/tooltips app-wide. Operators can turn this off from Help once they've learned the app — see plan.md §4. */
  showGuidedTips: boolean;
  completeOnboarding: () => void;
  setShowGuidedTips: (value: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      hasCompletedOnboarding: false,
      showGuidedTips: true,
      completeOnboarding: () => set({ hasCompletedOnboarding: true }),
      setShowGuidedTips: (value) => set({ showGuidedTips: value }),
    }),
    { name: "eyeonpit:settings" }
  )
);
