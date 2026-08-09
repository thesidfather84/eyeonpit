import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import type { TerminologyLevel } from "@/lib/terminology";
import { diagnostics } from "@/lib/diagnostics/logger";

export type WorkflowAssistanceLevel = "off" | "basic" | "guided";

/** On-disk envelope version — mostly documentation today, since `merge` below already unconditionally normalizes every field on every load regardless of what (if any) version is stored. */
const SETTINGS_VERSION = 1;

const TERMINOLOGY_LEVELS: TerminologyLevel[] = ["standard", "casino", "casinoProfessional"];
const WORKFLOW_LEVELS: WorkflowAssistanceLevel[] = ["off", "basic", "guided"];

/** localStorage can throw (quota, private browsing, disabled storage) — every call here is best-effort, same policy as lib/utils/lastGameConfig.ts. Losing a setting is never worth crashing the app over. */
function safeLocalStorage(): StateStorage {
  return {
    getItem: (name) => {
      try {
        return localStorage.getItem(name);
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      try {
        localStorage.setItem(name, value);
      } catch {
        // Ignored — see above.
      }
    },
    removeItem: (name) => {
      try {
        localStorage.removeItem(name);
      } catch {
        // Ignored — see above.
      }
    },
  };
}

/** Rebuilds a safe settings slice from whatever was persisted — a differently-shaped or corrupted record (an old build, hand-edited devtools value, partial write) falls back field-by-field to the same defaults the store starts with, rather than trusting the stored type. */
function normalizePersistedSettings(raw: unknown): Partial<SettingsState> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const result = {
    hasCompletedOnboarding:
      typeof r.hasCompletedOnboarding === "boolean" ? r.hasCompletedOnboarding : false,
    showGuidedTips: typeof r.showGuidedTips === "boolean" ? r.showGuidedTips : true,
    dismissedHints: Array.isArray(r.dismissedHints)
      ? r.dismissedHints.filter((h): h is string => typeof h === "string")
      : [],
    terminologyLevel: TERMINOLOGY_LEVELS.includes(r.terminologyLevel as TerminologyLevel)
      ? (r.terminologyLevel as TerminologyLevel)
      : "casinoProfessional",
    workflowAssistance: WORKFLOW_LEVELS.includes(r.workflowAssistance as WorkflowAssistanceLevel)
      ? (r.workflowAssistance as WorkflowAssistanceLevel)
      : "basic",
    showGroupLabels: typeof r.showGroupLabels === "boolean" ? r.showGroupLabels : false,
    voiceAudioFeedback: typeof r.voiceAudioFeedback === "boolean" ? r.voiceAudioFeedback : true,
  };

  const looksMalformed =
    raw != null &&
    (typeof raw !== "object" ||
      typeof r.terminologyLevel !== typeof result.terminologyLevel ||
      !TERMINOLOGY_LEVELS.includes(r.terminologyLevel as TerminologyLevel) ||
      !WORKFLOW_LEVELS.includes(r.workflowAssistance as WorkflowAssistanceLevel));
  if (looksMalformed) {
    diagnostics.warn("localstorage-corruption", "eyeonpit:settings had an invalid shape — fell back to defaults field-by-field", {
      rawSample: JSON.stringify(raw).slice(0, 300),
    });
  }

  return result;
}

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
  /** Accessibility: shows a small A/B/C letter badge on linked seats, so grouping isn't communicated by ring color alone. Off by default — the color ring is the primary signal, this is an opt-in reinforcement. */
  showGroupLabels: boolean;
  /** Governs whether voice commands that produce a spoken response ("Count", "Status" — see lib/voice/speechOutput.ts) actually speak, versus only showing the same text visually. On by default: a headset-oriented, hands-free command is of little use silenced. Never affects recognition/listening itself, only this one class of read-only spoken output. */
  voiceAudioFeedback: boolean;
  completeOnboarding: () => void;
  setShowGuidedTips: (value: boolean) => void;
  dismissHint: (id: string) => void;
  setTerminologyLevel: (level: TerminologyLevel) => void;
  setWorkflowAssistance: (level: WorkflowAssistanceLevel) => void;
  setShowGroupLabels: (value: boolean) => void;
  setVoiceAudioFeedback: (value: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      hasCompletedOnboarding: false,
      showGuidedTips: true,
      dismissedHints: [],
      terminologyLevel: "casinoProfessional",
      workflowAssistance: "basic",
      showGroupLabels: false,
      voiceAudioFeedback: true,
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
      setShowGroupLabels: (value) => set({ showGroupLabels: value }),
      setVoiceAudioFeedback: (value) => set({ voiceAudioFeedback: value }),
    }),
    {
      name: "eyeonpit:settings",
      version: SETTINGS_VERSION,
      storage: createJSONStorage(safeLocalStorage),
      // `merge` — not `migrate` — is the one hook zustand's persist middleware
      // always runs on every rehydration, version match or not: `migrate` is
      // only invoked when the stored envelope carries a numeric `version`
      // that differs from `options.version` (see zustand/middleware.js), so a
      // version-less legacy record (the realistic case — every write before
      // this field existed) skips `migrate` entirely and would otherwise
      // merge raw, untyped fields straight into the live store. Normalizing
      // here instead of in `migrate` closes that gap unconditionally.
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...normalizePersistedSettings(persistedState),
      }),
    }
  )
);
