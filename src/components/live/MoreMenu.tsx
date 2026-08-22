"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Download,
  HelpCircle,
  History as HistoryIcon,
  Layers,
  ListPlus,
  XOctagon,
} from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { WorkflowHelpContent } from "@/components/settings/WorkflowHelpContent";
import { TableEventsSheet } from "./TableEventsSheet";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { completeInvestigation, listInvestigations } from "@/lib/db/repositories/investigations";
import type { RoundExceptionReason } from "@/lib/db/repositories/investigations";
import { diagnostics } from "@/lib/diagnostics/logger";
import { downloadInvestigationJson } from "@/lib/export/toJson";
import { newShoeOrDeckLabel } from "@/lib/utils/gameConfig";
import { canCompleteRound } from "@/lib/utils/roundValidation";
import { useTerminology } from "@/hooks/useTerminology";
import type { TerminologyDictionary } from "@/lib/terminology";
import type { Investigation } from "@/types/investigation";

type OverlayKey = "history" | "export" | "help";

function menuItems(t: TerminologyDictionary): { key: OverlayKey; label: string; icon: typeof HistoryIcon }[] {
  return [
    { key: "history", label: t.history, icon: HistoryIcon },
    { key: "export", label: t.export, icon: Download },
    { key: "help", label: "Help", icon: HelpCircle },
  ];
}

function HistoryOverlayContent() {
  const [investigations, setInvestigations] = useState<Investigation[] | null>(null);

  useEffect(() => {
    listInvestigations().then(setInvestigations);
  }, []);

  return (
    <div className="flex flex-col gap-2 pb-4">
      {investigations === null && <p className="text-sm text-muted-foreground">Loading…</p>}
      {investigations?.length === 0 && (
        <p className="text-sm text-muted-foreground">No investigations yet.</p>
      )}
      {investigations?.map((inv) => (
        <Link
          key={inv.localId}
          href={`/investigations/${inv.localId}/live`}
          className="tap-target flex flex-col justify-center rounded-lg border border-border bg-surface-raised px-3 hover:bg-surface"
        >
          <span className="text-sm font-medium text-foreground">{inv.displayId}</span>
          <span className="text-xs text-muted-foreground">
            {inv.casino} · Table {inv.tableNumber} · {inv.status}
          </span>
        </Link>
      ))}
    </div>
  );
}

function ExportOverlayContent() {
  const { investigation } = useInvestigationContext();
  return (
    <div className="flex flex-col gap-3 pb-4">
      <p className="text-xs text-muted-foreground">
        Exports every round, seat hand, and event log entry for this investigation as JSON.
      </p>
      <Button variant="secondary" onClick={() => void downloadInvestigationJson(investigation)}>
        Export {investigation.displayId} (JSON)
      </Button>
    </div>
  );
}

/**
 * The "More" sheet — everything operationally real but not frequent enough
 * to earn its own BottomNavigation icon (AGENTS.md operational UI rebuild
 * §13/§15): History, Export, Help, Pause/Resume, New Shoe/Deck, Log Table
 * Event, Misdeal, End & Review. Reports and Settings moved OUT to their own
 * dedicated BottomNavigation buttons — this menu never duplicates them.
 * Mode-switching (Floor ↔ Surveillance) also moved out, to
 * BottomNavigation's own dedicated toggle.
 *
 * Fully controlled (`open`/`onOpenChange`) rather than owning its own
 * trigger button — BottomNavigation's "More" icon is the one place this
 * opens from, in both Floor and Surveillance, so there is exactly one
 * "more actions" entry point instead of a per-shell hamburger.
 */
export function MoreMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const {
    investigation,
    currentRound,
    startNewShoe,
    completeRoundAndStartNewShoe,
    voidRoundAndStartNewShoe,
    misdealAndAdvance,
    pause,
    resume,
    busy,
  } = useInvestigationContext();
  const [overlay, setOverlay] = useState<OverlayKey | null>(null);
  const [shoeConfirmOpen, setShoeConfirmOpen] = useState(false);
  const [incompletePromptOpen, setIncompletePromptOpen] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [misdealConfirmOpen, setMisdealConfirmOpen] = useState(false);
  const [tableEventsOpen, setTableEventsOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const completeCheck = canCompleteRound(investigation, currentRound);
  const t = useTerminology();

  function close() {
    onOpenChange(false);
  }

  function openOverlay(key: OverlayKey) {
    close();
    setOverlay(key);
  }

  function handleNewShoeSelected() {
    close();
    const roundHasCards =
      currentRound.dealerHand.cards.length > 0 ||
      Object.values(currentRound.seats).some((seat) => seat && seat.playerCards.length > 0);
    if (currentRound.completed || !roundHasCards) {
      setShoeConfirmOpen(true);
    } else {
      setIncompletePromptOpen(true);
    }
  }

  async function handleConfirmShoe() {
    await startNewShoe();
    setShoeConfirmOpen(false);
  }

  async function handleCompleteRoundFirst() {
    await completeRoundAndStartNewShoe();
    setIncompletePromptOpen(false);
  }

  async function handleVoidAndStartNewShoe() {
    await voidRoundAndStartNewShoe();
    setIncompletePromptOpen(false);
  }

  async function handleMisdeal(reason: RoundExceptionReason) {
    await misdealAndAdvance(reason);
    setMisdealConfirmOpen(false);
  }

  async function handleEndInvestigation() {
    setEnding(true);
    try {
      diagnostics.info("investigation-lifecycle", "End Investigation pressed", {
        investigationId: investigation.localId,
        statusBefore: investigation.status,
      });
      await completeInvestigation(investigation.localId);
      diagnostics.info("investigation-lifecycle", "status written to closed, navigating to its review screen", {
        investigationId: investigation.localId,
      });
      window.location.assign(`/investigations/${investigation.localId}/live`);
    } finally {
      setEnding(false);
      setEndConfirmOpen(false);
      close();
    }
  }

  return (
    <>
      <BottomSheet open={open} onClose={close} title="More">
        <div className="flex flex-col gap-2 pb-4">
          {menuItems(t).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => openOverlay(key)}
              className="tap-target flex items-center gap-3 rounded-xl border border-border bg-surface-raised px-3 text-sm font-medium text-foreground hover:bg-surface"
            >
              <Icon className="h-5 w-5" aria-hidden /> {label}
            </button>
          ))}
          <button
            onClick={() => {
              close();
              void (investigation.status === "paused" ? resume() : pause());
            }}
            disabled={busy || (investigation.status !== "active" && investigation.status !== "paused")}
            className="tap-target flex items-center gap-3 rounded-xl border border-border bg-surface-raised px-3 text-sm font-medium text-foreground hover:bg-surface disabled:opacity-40"
          >
            {investigation.status === "paused" ? "Resume Investigation" : "Pause Investigation"}
          </button>
          <button
            onClick={handleNewShoeSelected}
            disabled={busy || investigation.status !== "active"}
            className="tap-target flex items-center gap-3 rounded-xl border border-border bg-surface-raised px-3 text-sm font-medium text-foreground hover:bg-surface disabled:opacity-40"
          >
            <Layers className="h-5 w-5" aria-hidden /> {newShoeOrDeckLabel(investigation, t)}
          </button>
          <button
            onClick={() => {
              close();
              setTableEventsOpen(true);
            }}
            disabled={busy || investigation.status !== "active"}
            className="tap-target flex items-center gap-3 rounded-xl border border-border bg-surface-raised px-3 text-sm font-medium text-foreground hover:bg-surface disabled:opacity-40"
          >
            <ListPlus className="h-5 w-5" aria-hidden /> Log Table Event
          </button>
          <button
            onClick={() => {
              close();
              setMisdealConfirmOpen(true);
            }}
            disabled={busy || investigation.status !== "active"}
            className="tap-target flex items-center gap-3 rounded-xl border border-pending/50 bg-pending/10 px-3 text-sm font-medium text-pending hover:bg-pending/15 disabled:opacity-40"
          >
            <AlertTriangle className="h-5 w-5" aria-hidden /> Misdeal
          </button>
          <button
            onClick={() => {
              close();
              setEndConfirmOpen(true);
            }}
            disabled={busy || investigation.status === "closed"}
            className="tap-target flex items-center gap-3 rounded-xl border border-destructive/50 bg-destructive/10 px-3 text-sm font-medium text-destructive hover:bg-destructive/15 disabled:opacity-40"
          >
            <XOctagon className="h-5 w-5" aria-hidden /> End & Review
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={overlay === "history"} onClose={() => setOverlay(null)} title={t.history}>
        <HistoryOverlayContent />
      </BottomSheet>

      <BottomSheet open={overlay === "export"} onClose={() => setOverlay(null)} title={t.export}>
        <ExportOverlayContent />
      </BottomSheet>

      <BottomSheet open={overlay === "help"} onClose={() => setOverlay(null)} title="Help">
        <WorkflowHelpContent />
      </BottomSheet>

      <ConfirmDialog
        open={shoeConfirmOpen}
        title={`Start a new ${investigation.blackjackFormat === "shoe" ? "shoe" : "deck"}?`}
        message="Start a new shoe? This will reset the running count and shoe card history. Completed rounds will remain saved."
        confirmLabel={newShoeOrDeckLabel(investigation, t)}
        busy={busy}
        onConfirm={handleConfirmShoe}
        onCancel={() => setShoeConfirmOpen(false)}
      />

      {incompletePromptOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <button
            aria-label="Cancel"
            className="absolute inset-0 bg-black/60"
            onClick={() => setIncompletePromptOpen(false)}
          />
          <div className="relative w-full max-w-sm rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-2 text-base font-semibold text-foreground">
              The current round is not complete.
            </h2>
            <div className="flex flex-col gap-2">
              <Button variant="secondary" fullWidth onClick={() => setIncompletePromptOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                fullWidth
                disabled={busy || !completeCheck.canComplete}
                onClick={handleCompleteRoundFirst}
              >
                {t.completeRound} First
              </Button>
              {!completeCheck.canComplete && (
                <p className="text-center text-[10px] text-muted-foreground">
                  {completeCheck.reasons[0]} — void the round instead, or cancel and finish entry.
                </p>
              )}
              <Button
                variant="destructive"
                fullWidth
                disabled={busy}
                onClick={handleVoidAndStartNewShoe}
              >
                Void Current Round and Start New Shoe
              </Button>
            </div>
          </div>
        </div>
      )}

      {misdealConfirmOpen && (
        <BottomSheet
          open
          onClose={() => setMisdealConfirmOpen(false)}
          title="Declare a round exception"
        >
          <div className="flex flex-col gap-2 pb-4">
            <p className="text-xs text-muted-foreground">
              Voids this hand&apos;s outcomes and moves on to the next hand in the same shoe. Cards
              already exposed stay recorded — the running count and shoe history are unaffected.
            </p>
            <button
              disabled={busy}
              onClick={() => handleMisdeal("misdeal")}
              className="tap-target rounded-xl border border-pending/60 bg-pending/10 px-3 text-left text-sm font-medium text-pending hover:bg-pending/15 disabled:opacity-40"
            >
              Misdeal
            </button>
            <button
              disabled={busy}
              onClick={() => handleMisdeal("incomplete-observation")}
              className="tap-target rounded-xl border border-pending/60 bg-pending/10 px-3 text-left text-sm font-medium text-pending hover:bg-pending/15 disabled:opacity-40"
            >
              Incomplete Observation
            </button>
            <button
              disabled={busy}
              onClick={() => handleMisdeal("dealer-error")}
              className="tap-target rounded-xl border border-pending/60 bg-pending/10 px-3 text-left text-sm font-medium text-pending hover:bg-pending/15 disabled:opacity-40"
            >
              Dealer Error
            </button>
          </div>
        </BottomSheet>
      )}

      {tableEventsOpen && <TableEventsSheet onClose={() => setTableEventsOpen(false)} />}

      <ConfirmDialog
        open={endConfirmOpen}
        title="End & Review this investigation?"
        message={`${investigation.rounds.length} rounds recorded across ${investigation.occupiedSeats.length} occupied spot(s). Nothing is deleted — you'll land on the finished investigation's own review, and can still review it later from History.`}
        confirmLabel="End & Review"
        destructive
        busy={ending}
        onConfirm={handleEndInvestigation}
        onCancel={() => setEndConfirmOpen(false)}
      />
    </>
  );
}
