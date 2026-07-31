"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import {
  createInvestigation,
  updateGameConfig,
  updateGameConfigAndRecalculate,
  updateGameConfigAndStartNewShoe,
  type GameConfigPatch,
} from "@/lib/db/repositories/investigations";
import { gameConfigFromInvestigation } from "@/lib/utils/gameConfig";
import { rememberLastGameConfig } from "@/lib/utils/lastGameConfig";
import {
  DEFAULT_DECK_COUNT_BY_FORMAT,
  DEFAULT_GAME_CONFIG,
  RULE_PROFILE_PRESETS,
  type BlackjackFormat,
  type EntryDirection,
  type GameConfig,
  type Investigation,
  type RuleProfileId,
} from "@/types/investigation";

interface QuickSetupSheetProps {
  onClose: () => void;
  /** Present = editing a live investigation's config. Absent = pre-creation ("Quick Setup" from the empty console). */
  investigation?: Investigation;
  onCreated?: (investigationLocalId: string) => void;
  onApplied?: () => void;
  initialConfig?: GameConfig;
  initialTableNumber?: string;
}

const FORMAT_OPTIONS: { value: BlackjackFormat; label: string }[] = [
  { value: "single-deck", label: "Single Deck" },
  { value: "double-deck", label: "Double Deck" },
  { value: "shoe", label: "Shoe Game" },
];

const DECK_PRESETS = [4, 6, 8];
const RULE_PROFILE_OPTIONS: RuleProfileId[] = ["standard", "3-2-h17", "3-2-s17", "6-5-h17", "custom"];

const optionButton = (active: boolean) =>
  `tap-target rounded-xl border text-xs font-semibold ${
    active ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface-raised text-foreground"
  }`;

const textInputClasses =
  "tap-target w-full rounded-xl border border-border bg-surface-raised px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none";

/**
 * Compact, in-console game configuration — replaces a long upfront wizard.
 * Same component both pre-creation (no `investigation`, "Apply and Start"
 * creates immediately) and mid-investigation (reopened from the live
 * header, "Apply" edits in place). Format/deck-count changes are the only
 * ones that affect the counting engine, so only those trigger the
 * Recalculate-or-New-Shoe confirmation — everything else applies at once.
 */
export function QuickSetupSheet({
  onClose,
  investigation,
  onCreated,
  onApplied,
  initialConfig,
  initialTableNumber,
}: QuickSetupSheetProps) {
  const isEdit = Boolean(investigation);
  const [config, setConfig] = useState<GameConfig>(() => {
    const base = investigation
      ? gameConfigFromInvestigation(investigation)
      : (initialConfig ?? DEFAULT_GAME_CONFIG);
    // New/edited table configs are limited to the fixed 6+1 arch — legacy
    // investigations with more positions keep their recorded seat data
    // (TableMap still renders it, clearly labeled), but applying a config
    // change here always normalizes going forward to 6 or 7.
    return { ...base, playerSpotCount: base.playerSpotCount >= 7 ? 7 : 6 };
  });
  const [tableNumber, setTableNumber] = useState(
    investigation?.tableNumber ?? initialTableNumber ?? ""
  );
  const [customDeckInput, setCustomDeckInput] = useState(String(config.deckCount));
  const [submitting, setSubmitting] = useState(false);
  const [riskyPatch, setRiskyPatch] = useState<GameConfigPatch | null>(null);

  function update(patch: Partial<GameConfig>) {
    setConfig((c) => ({ ...c, ...patch }));
  }

  function handleFormatChange(format: BlackjackFormat) {
    const deckCount = DEFAULT_DECK_COUNT_BY_FORMAT[format];
    update({ format, deckCount });
    setCustomDeckInput(String(deckCount));
  }

  function handleRuleProfileChange(id: RuleProfileId) {
    if (id === "custom") {
      update({ ruleProfile: { ...config.ruleProfile, id: "custom", label: "Custom Rules" } });
    } else {
      update({ ruleProfile: RULE_PROFILE_PRESETS[id] });
    }
  }

  function buildPatch(): GameConfigPatch {
    return {
      tableNumber: tableNumber.trim(),
      blackjackFormat: config.format,
      shoeTotalDecks: config.deckCount,
      ruleProfile: config.ruleProfile,
      entryDirection: config.entryDirection,
      entryMode: config.entryMode,
      playerSpotCount: config.playerSpotCount,
      practiceMode: config.practiceMode,
      pitArea: config.pitArea.trim(),
      investigationLabel: config.investigationLabel.trim(),
    };
  }

  function isRiskyChange(): boolean {
    if (!investigation) return false;
    return (
      config.format !== investigation.blackjackFormat ||
      config.deckCount !== investigation.shoeTotalDecks
    );
  }

  async function handleApply() {
    if (isEdit && investigation) {
      const patch = buildPatch();
      if (isRiskyChange()) {
        setRiskyPatch(patch);
        return;
      }
      setSubmitting(true);
      try {
        await updateGameConfig(investigation.localId, patch);
        rememberLastGameConfig(config, tableNumber);
        onApplied?.();
        onClose();
      } finally {
        setSubmitting(false);
      }
      return;
    }

    setSubmitting(true);
    try {
      const created = await createInvestigation({
        casino: "",
        tableNumber: tableNumber.trim(),
        dealerName: "",
        investigationDate: new Date().toISOString().slice(0, 10),
        operatorName: "",
        countingSystem: "Hi-Lo",
        shoeTotalDecks: config.deckCount,
        blackjackFormat: config.format,
        ruleProfile: config.ruleProfile,
        entryDirection: config.entryDirection,
        entryMode: config.entryMode,
        playerSpotCount: config.playerSpotCount,
        practiceMode: config.practiceMode,
        pitArea: config.pitArea,
        investigationLabel: config.investigationLabel,
        status: "active",
      });
      rememberLastGameConfig(config, tableNumber);
      onCreated?.(created.localId);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRiskyResolve(mode: "recalculate" | "new-shoe") {
    if (!investigation || !riskyPatch) return;
    setSubmitting(true);
    try {
      if (mode === "recalculate") {
        await updateGameConfigAndRecalculate(investigation.localId, riskyPatch);
      } else {
        await updateGameConfigAndStartNewShoe(investigation.localId, riskyPatch);
      }
      rememberLastGameConfig(config, tableNumber);
      setRiskyPatch(null);
      onApplied?.();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <BottomSheet open onClose={onClose} title={isEdit ? "Game Setup" : "Quick Setup"}>
        <div className="flex flex-col gap-5 pb-4">
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Game</p>
            <span className="inline-block rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 text-sm font-semibold text-accent">
              Blackjack
            </span>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Blackjack Format</p>
            <div className="grid grid-cols-3 gap-2">
              {FORMAT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleFormatChange(opt.value)}
                  className={optionButton(config.format === opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Deck Count</p>
            {config.format === "shoe" ? (
              <div className="flex flex-wrap gap-2">
                {DECK_PRESETS.map((n) => (
                  <button
                    key={n}
                    onClick={() => {
                      update({ deckCount: n });
                      setCustomDeckInput(String(n));
                    }}
                    className={`${optionButton(config.deckCount === n)} px-4`}
                  >
                    {n}
                  </button>
                ))}
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={customDeckInput}
                  onChange={(e) => {
                    setCustomDeckInput(e.target.value);
                    update({ deckCount: Math.max(1, Number(e.target.value) || 1) });
                  }}
                  placeholder="Custom"
                  className="tap-target w-20 rounded-lg border border-border bg-surface px-2 text-center text-sm text-foreground"
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {config.deckCount} deck{config.deckCount === 1 ? "" : "s"} — fixed by format
              </p>
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Rule Profile</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {RULE_PROFILE_OPTIONS.map((id) => (
                <button
                  key={id}
                  onClick={() => handleRuleProfileChange(id)}
                  className={optionButton(config.ruleProfile.id === id)}
                >
                  {id === "custom" ? "Custom Rules" : RULE_PROFILE_PRESETS[id].label}
                </button>
              ))}
            </div>
            {config.ruleProfile.id === "custom" && (
              <div className="mt-2 flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  {(["3:2", "6:5", "custom"] as const).map((payout) => (
                    <button
                      key={payout}
                      onClick={() => update({ ruleProfile: { ...config.ruleProfile, blackjackPayout: payout } })}
                      className={`${optionButton(config.ruleProfile.blackjackPayout === payout)} px-3`}
                    >
                      {payout.toUpperCase()}
                    </button>
                  ))}
                  <button
                    onClick={() =>
                      update({
                        ruleProfile: { ...config.ruleProfile, dealerHitsSoft17: !config.ruleProfile.dealerHitsSoft17 },
                      })
                    }
                    className="tap-target rounded-md border border-border bg-surface px-3 text-xs font-semibold text-foreground"
                  >
                    Dealer: {config.ruleProfile.dealerHitsSoft17 ? "Hits Soft 17" : "Stands Soft 17"}
                  </button>
                </div>
                <textarea
                  value={config.ruleProfile.customNotes}
                  onChange={(e) => update({ ruleProfile: { ...config.ruleProfile, customNotes: e.target.value } })}
                  rows={2}
                  placeholder="Custom rule notes (optional)"
                  className="w-full rounded-lg border border-border bg-surface p-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
                />
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Table</p>
            <div className="flex flex-col gap-2">
              <input
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                placeholder="Table ID"
                className={textInputClasses}
              />
              <input
                value={config.pitArea}
                onChange={(e) => update({ pitArea: e.target.value })}
                placeholder="Pit / area (optional)"
                className={textInputClasses}
              />
              <button onClick={() => update({ practiceMode: !config.practiceMode })} className={optionButton(config.practiceMode)}>
                Practice mode {config.practiceMode ? "ON" : "OFF"}
              </button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Entry Mode</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => update({ entryMode: "guided" })}
                className={optionButton(config.entryMode === "guided")}
              >
                Guided (face-up)
              </button>
              <button
                onClick={() => update({ entryMode: "free" })}
                className={optionButton(config.entryMode === "free")}
              >
                Free Entry (pitch)
              </button>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {config.entryMode === "guided"
                ? "Automatically advances to the next seat after each card or result. Tap any seat to override instantly."
                : "No forced order — select each seat manually as it becomes observable."}
            </p>
          </div>

          {config.entryMode === "guided" && (
            <div>
              <p className="mb-2 text-sm font-medium text-foreground">Entry Direction</p>
              <div className="grid grid-cols-2 gap-2">
                {(["ltr", "rtl"] as EntryDirection[]).map((dir) => (
                  <button key={dir} onClick={() => update({ entryDirection: dir })} className={optionButton(config.entryDirection === dir)}>
                    {dir === "ltr" ? "Left to Right" : "Right to Left"}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Position 7</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => update({ playerSpotCount: 6 })} className={optionButton(config.playerSpotCount === 6)}>
                Off (6 Positions)
              </button>
              <button onClick={() => update({ playerSpotCount: 7 })} className={optionButton(config.playerSpotCount === 7)}>
                On (7 Positions)
              </button>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Positions 1-6 are always shown in the arch. Position 7 adds one optional spot centered above the
              dealer.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-foreground" htmlFor="investigation-label">
              Investigation Label (optional)
            </label>
            <input
              id="investigation-label"
              value={config.investigationLabel}
              onChange={(e) => update({ investigationLabel: e.target.value })}
              placeholder="e.g. Night shift, Pit 2"
              className={textInputClasses}
            />
          </div>

          <Button variant="primary" fullWidth disabled={submitting} onClick={handleApply}>
            {submitting ? "Working…" : isEdit ? "Apply" : "Apply and Start"}
          </Button>
        </div>
      </BottomSheet>

      {riskyPatch && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <button aria-label="Cancel" className="absolute inset-0 bg-black/60" onClick={() => setRiskyPatch(null)} />
          <div className="relative w-full max-w-sm rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-3 text-base font-semibold text-foreground">
              Changing the deck configuration affects count calculations. Recalculate the current shoe
              using recorded cards or start a new shoe?
            </h2>
            <div className="flex flex-col gap-2">
              <Button variant="secondary" fullWidth onClick={() => setRiskyPatch(null)}>
                Cancel
              </Button>
              <Button variant="primary" fullWidth disabled={submitting} onClick={() => handleRiskyResolve("recalculate")}>
                Recalculate
              </Button>
              <Button variant="destructive" fullWidth disabled={submitting} onClick={() => handleRiskyResolve("new-shoe")}>
                Start New Shoe
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
