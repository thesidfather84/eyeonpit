"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeftRight,
  Download,
  FileText,
  Headphones,
  HelpCircle,
  History as HistoryIcon,
  Layers,
  ListPlus,
  Menu as MenuIcon,
  Pause,
  Play,
  Settings,
  XOctagon,
} from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { WorkflowHelpContent } from "@/components/settings/WorkflowHelpContent";
import { AnalysisScreen } from "@/components/analysis/AnalysisScreen";
import { ReportScreen } from "@/components/report/ReportScreen";
import { EventLogPanel } from "./EventLogPanel";
import { BottomStatusBar } from "./BottomStatusBar";
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

type OverlayKey = "history" | "reports" | "export" | "settings" | "help";

function menuItems(t: TerminologyDictionary): { key: OverlayKey; label: string; icon: typeof HistoryIcon }[] {
  return [
    { key: "history", label: t.history, icon: HistoryIcon },
    { key: "reports", label: t.report, icon: FileText },
    { key: "export", label: t.export, icon: Download },
    { key: "settings", label: "Settings", icon: Settings },
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
 * Reads `?review=1` (set by the post-End-Investigation redirect — see
 * handleEndInvestigation below) and opens the Reports overlay automatically,
 * so the operator lands directly on the investigation they just finished
 * instead of on a bare, otherwise-empty Live screen. Isolated in its own
 * component since useSearchParams requires a Suspense boundary — mirrors
 * EmptyConsole's own AutoOpenFromQuery (`?open=new`) exactly.
 */
function AutoOpenReviewFromQuery({ onOpen }: { onOpen: () => void }) {
  // Optional chaining, not a bare call: outside of a real Next.js router
  // context (every test that mounts LiveMenu without mocking
  // next/navigation, e.g. via FloorScreen/LiveScreen), useSearchParams()
  // returns null rather than an empty ReadonlyURLSearchParams. The real
  // app always has a router context here, so this is purely defensive.
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams?.get("review") === "1") onOpen();
  }, [searchParams, onOpen]);
  return null;
}

/**
 * The sole way to reach History/Reports/Export/Settings/Help from the Live
 * screen — everything renders as an overlay on top of Live, which stays
 * mounted underneath. New Shoe / End Investigation live here too (moved out
 * of the fixed bottom bar to keep that bar to routine round actions only);
 * both still require confirmation.
 *
 * Also mounted from FloorScreen (see that component) — `mode` decides
 * whether the top switch-shell link reads "Floor Mode" (→ /floor, shown
 * in Surveillance) or "Surveillance" (→ /live, shown in Floor), and
 * Pause/Resume lives here specifically so Floor — which has no header of
 * its own the way Surveillance's LiveHeader does — still has a
 * discoverable, single place to reach it, identical to Surveillance's.
 * Everything else in this menu (New Shoe, Misdeal, End Investigation,
 * History, Reports, Export, Settings, Help) is unconditionally identical
 * in both shells: one investigation, one ledger, two views — the menu
 * itself is no exception to that rule.
 */
export function LiveMenu({ mode = "surveillance" }: { mode?: "surveillance" | "floor" }) {
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [overlay, setOverlay] = useState<OverlayKey | null>(null);
  const [shoeConfirmOpen, setShoeConfirmOpen] = useState(false);
  const [incompletePromptOpen, setIncompletePromptOpen] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [misdealConfirmOpen, setMisdealConfirmOpen] = useState(false);
  const [tableEventsOpen, setTableEventsOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const completeCheck = canCompleteRound(investigation, currentRound);
  const t = useTerminology();

  function openOverlay(key: OverlayKey) {
    setMenuOpen(false);
    setOverlay(key);
  }

  function handleNewShoeSelected() {
    setMenuOpen(false);
    // A round that's open but genuinely empty (Floor's own Done-and-advance
    // — operator-loop correction — leaves exactly this behind after every
    // hand) has nothing to complete-first-or-void: `startNewShoe()` itself
    // is documented safe to call directly whenever the current round is
    // "already completed (or empty)" (see InvestigationContext.tsx's own
    // interface comment), so treat it the same as completed here rather
    // than showing the incomplete-round prompt for a round with nothing in it.
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
      // "End & Review" means review, not "return home" — the operator must
      // land on the investigation they just finished, not on the launch
      // screen with no path back to it short of History. Surveillance's own
      // Live screen already renders correctly for a closed investigation
      // (LiveHeader always mounts LiveMenu regardless of isClosed — only
      // the pause/"+ New" control on the right swaps), so it's the
      // "existing review/report experience" to route to rather than
      // building a new one — `?review=1` (read by AutoOpenReviewFromQuery
      // above) opens straight into Reports so the operator doesn't need an
      // extra tap to actually see what they just recorded.
      //
      // A full `window.location.assign` (not client-side router.push) is
      // required here for the same reason a full navigation to "/" was
      // required before: this same InvestigationContext/VoiceControl tree
      // must fully remount against the now-closed investigation rather
      // than trusting an in-place refresh() to have reached every
      // consumer. Always genuinely a different URL from wherever this was
      // called from (Floor's own route, or this exact route without the
      // query) — never the "identical URL is a no-op" case "/" used to be.
      diagnostics.info("investigation-lifecycle", "status written to closed, navigating to its review screen", {
        investigationId: investigation.localId,
      });
      window.location.assign(`/investigations/${investigation.localId}/live?review=1`);
    } finally {
      setEnding(false);
      setEndConfirmOpen(false);
      setMenuOpen(false);
    }
  }

  return (
    <>
      <Suspense fallback={null}>
        <AutoOpenReviewFromQuery onOpen={() => setOverlay("reports")} />
      </Suspense>

      <button
        onClick={() => setMenuOpen(true)}
        aria-label="Menu"
        className="tap-target flex items-center justify-center text-muted-foreground hover:text-foreground"
      >
        <MenuIcon className="h-5 w-5" aria-hidden />
      </button>

      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu">
        <div className="flex flex-col gap-2 pb-4">
          {mode === "floor" ? (
            <Link
              href={`/investigations/${investigation.localId}/live`}
              onClick={() => setMenuOpen(false)}
              className="tap-target flex items-center gap-3 rounded-xl border border-accent/50 bg-accent/10 px-3 text-sm font-medium text-accent hover:bg-accent/15"
            >
              <ArrowLeftRight className="h-5 w-5" aria-hidden /> Surveillance
            </Link>
          ) : (
            <Link
              href={`/investigations/${investigation.localId}/floor`}
              onClick={() => setMenuOpen(false)}
              className="tap-target flex items-center gap-3 rounded-xl border border-accent/50 bg-accent/10 px-3 text-sm font-medium text-accent hover:bg-accent/15"
            >
              <Headphones className="h-5 w-5" aria-hidden /> Floor Mode
            </Link>
          )}
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
              setMenuOpen(false);
              void (investigation.status === "paused" ? resume() : pause());
            }}
            disabled={busy || (investigation.status !== "active" && investigation.status !== "paused")}
            className="tap-target flex items-center gap-3 rounded-xl border border-border bg-surface-raised px-3 text-sm font-medium text-foreground hover:bg-surface disabled:opacity-40"
          >
            {investigation.status === "paused" ? (
              <>
                <Play className="h-5 w-5" aria-hidden /> Resume Investigation
              </>
            ) : (
              <>
                <Pause className="h-5 w-5" aria-hidden /> Pause Investigation
              </>
            )}
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
              setMenuOpen(false);
              setTableEventsOpen(true);
            }}
            disabled={busy || investigation.status !== "active"}
            className="tap-target flex items-center gap-3 rounded-xl border border-border bg-surface-raised px-3 text-sm font-medium text-foreground hover:bg-surface disabled:opacity-40"
          >
            <ListPlus className="h-5 w-5" aria-hidden /> Log Table Event
          </button>
          <button
            onClick={() => {
              setMenuOpen(false);
              setMisdealConfirmOpen(true);
            }}
            disabled={busy || investigation.status !== "active"}
            className="tap-target flex items-center gap-3 rounded-xl border border-pending/50 bg-pending/10 px-3 text-sm font-medium text-pending hover:bg-pending/15 disabled:opacity-40"
          >
            <AlertTriangle className="h-5 w-5" aria-hidden /> Misdeal
          </button>
          <button
            onClick={() => {
              setMenuOpen(false);
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

      <BottomSheet open={overlay === "reports"} onClose={() => setOverlay(null)} title={t.report}>
        <div className="flex flex-col gap-4 pb-4">
          <EventLogPanel />
          <div className="border-t border-border pt-4">
            <BottomStatusBar />
          </div>
          <div className="border-t border-border pt-4">
            <AnalysisScreen />
          </div>
          <div className="border-t border-border pt-4">
            <ReportScreen />
          </div>
        </div>
      </BottomSheet>

      <BottomSheet open={overlay === "export"} onClose={() => setOverlay(null)} title={t.export}>
        <ExportOverlayContent />
      </BottomSheet>

      <BottomSheet open={overlay === "settings"} onClose={() => setOverlay(null)} title="Settings">
        <SettingsScreen
          activeInvestigation={{
            localId: investigation.localId,
            displayId: investigation.displayId,
            isDemo: investigation.isDemo,
          }}
        />
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
        message={`${investigation.rounds.length} rounds recorded across ${investigation.occupiedSeats.length} occupied seat(s). Nothing is deleted — you'll land on the finished investigation's own review, and can still reopen it later from History.`}
        confirmLabel="End & Review"
        destructive
        busy={ending}
        onConfirm={handleEndInvestigation}
        onCancel={() => setEndConfirmOpen(false)}
      />
    </>
  );
}
