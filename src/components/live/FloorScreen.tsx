"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, Headphones, Home } from "lucide-react";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { formatLiveStatusLine } from "@/lib/utils/gameConfig";
import { InvestigationReportsView } from "./InvestigationReportsView";
import { CountSummaryPanel } from "./CountSummaryPanel";
import { FloorPlayField } from "./FloorPlayField";
import { ActiveSeatHeader } from "./ActiveSeatHeader";
import { PlayerDetailBar } from "./PlayerDetailBar";
import { PlayerDetailSheet } from "./PlayerDetailSheet";
import { RoundControlsRow } from "./RoundControlsRow";
import { CardEntryPad } from "./CardEntryPad";
import { LiveMenu } from "./LiveMenu";
import { VoiceControl } from "./VoiceControl";
import { VoiceControlErrorBoundary } from "./VoiceControlErrorBoundary";

/**
 * Floor Mode — the second of EyeOnPit's two role-specific UI shells (see
 * docs/EYEONPIT_PRODUCT_SPEC.md, "Dual Operational Roles"). Same
 * InvestigationProvider, same CardEvent ledger, same count engine, same
 * card/round mutations as Surveillance's LiveScreen — this file introduces
 * zero new state, zero new mutation logic, and zero new counting math. It
 * is a smaller, voice-first arrangement of exactly the same building
 * blocks LiveScreen already uses (CountSummaryPanel, ActiveSeatHeader,
 * RoundControlsRow, CardEntryPad, VoiceControl), deliberately leaving out
 * the table graphic that LiveScreen shows — Floor Mode's whole premise is
 * that the phone stays in a pocket most of the time, driven by voice, with
 * the manual keypad only as the fallback when voice is unavailable,
 * inaccurate, too noisy, or inappropriate. This is intentionally the
 * minimum useful shell, not a feature-complete alternative to Surveillance;
 * notes remain Surveillance-only for now (reachable any time via the
 * Surveillance link below — nothing about the investigation is gated by
 * which shell most recently viewed it).
 *
 * FloorPlayField (below CountSummaryPanel) is the one addition beyond that
 * original set — a compact, low-attention dealer/seat summary (occupancy,
 * wager, cards) so the operator can confirm what a narration was just
 * heard as without leaving Floor Mode for Surveillance's full table. It is
 * deliberately NOT SeatTilesRow/TableMap; see that component's own doc
 * comment for the scope line between the two. Its own one-shot Edit Mode
 * (AGENTS.md 1.14b) reuses SeatOptionsSheet unchanged for Mark Empty/Link/
 * player-label — the same sheet Surveillance's TableMap opens.
 *
 * PlayerDetailBar/PlayerDetailSheet (AGENTS.md 1.14b §7-9) are the exact
 * same components LiveScreen mounts, wired with the identical
 * activeSeatEnabled gate — wager entry/change and Double/Split/Insurance/
 * Surrender are real Floor operations now, not Surveillance-only. No new
 * wager store, mutation path, or component was created for this.
 *
 * `<LiveMenu mode="floor" />` (operator-loop milestone) closes what was
 * previously a real gap: Pause/Resume, New Shoe, Misdeal, End Investigation
 * (End & Review), History, Reports, Export, Settings, and Help were only
 * ever reachable from Surveillance's header/menu — an operator running
 * Floor voice-first with the phone in a pocket had no discoverable way to
 * reach any of them without first switching shells. It's the exact same
 * component LiveHeader mounts, unconditionally identical behavior in both
 * shells (one investigation, one ledger — see that component's own doc
 * comment) — this file adds no menu logic of its own.
 *
 * A closed investigation replaces the Surveillance/menu controls with a
 * plain "+ New" affordance, mirroring LiveHeader's own isClosed branch —
 * the normal path off a closed investigation is the automatic navigation
 * to that investigation's own review screen (Surveillance, with Reports
 * opened) that follows a successful End Investigation (voice or menu)
 * either way. PRIORITY 1.9-6/8/9: this "+ New" bar is no longer the ONLY
 * protection for reaching a stale Floor view of an already-closed
 * investigation by some other route (e.g. closed from Surveillance in
 * another tab, a bookmark, or a reload) — the body below now swaps to
 * `<ReportScreen />` whenever `isClosed`, so a completed investigation
 * never presents as a live, hands-free-looking console (and VoiceControl
 * is never mounted for it) regardless of how the operator got here.
 *
 * `<RoundControlsRow floorMode />` / `<VoiceControl floorMode />`
 * (operator-loop correction): Floor's Done — tap or voice — completes AND
 * immediately starts the next round in one step, so a Floor operator never
 * needs a separate "Next" after an ordinary hand. Surveillance keeps the
 * deliberate two-step Done/Next it always had; see useRoundControls' and
 * RoundControlsRow's own doc comments for the full reasoning and for why
 * Next still exists in Floor (mid-hand target advance / manual recovery).
 */
export function FloorScreen() {
  const { investigation, activeTarget } = useInvestigationContext();
  const isOnline = useOnlineStatus();
  const isClosed = investigation.status === "closed";
  const activeSeat = typeof activeTarget === "number" ? activeTarget : null;
  // Same gate LiveScreen uses — wager/action controls need a real seat
  // record to act on. Split targets are negative seat numbers, always tied
  // to an already-occupied seat.
  const activeSeatEnabled =
    activeSeat != null && investigation.occupiedSeats.includes(Math.abs(activeSeat));
  const [playerDetailOpen, setPlayerDetailOpen] = useState(false);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="flex flex-none flex-wrap items-center justify-between gap-1.5 gap-y-1 border-b border-border bg-surface px-2 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <Headphones className="h-4 w-4 shrink-0 text-accent" aria-hidden />
          <span className="shrink-0 text-[11px] font-bold text-foreground">FLOOR</span>
          <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
            {investigation.displayId}
          </span>
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-muted-foreground">
            {formatLiveStatusLine(investigation)}
          </span>
          <span
            className={`inline-block h-2 w-2 shrink-0 rounded-full ${isOnline ? "bg-status-green" : "bg-muted-foreground"}`}
            aria-label={isOnline ? "Online" : "Offline — saved locally"}
            title={isOnline ? "Online" : "Offline — saved locally"}
          />
        </div>
        {isClosed ? (
          <button
            onClick={() => {
              window.location.href = "/app";
            }}
            className="tap-target shrink-0 rounded-md bg-accent px-2 text-[11px] font-medium text-accent-foreground"
          >
            + New
          </button>
        ) : (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            {/* Home (AGENTS.md 1.14b UX correction round §1) — same plain
                Link to /app as Surveillance's LiveHeader, same existing
                fresh/recoverable/none lifecycle decides what happens next. */}
            <Link
              href="/app"
              aria-label="Home"
              title="Home"
              className="tap-target flex items-center gap-1 rounded-md border border-border bg-surface-raised px-2 text-[11px] font-medium text-foreground"
            >
              <Home className="h-3.5 w-3.5" aria-hidden /> Home
            </Link>
            <Link
              href={`/investigations/${investigation.localId}/live`}
              className="tap-target flex items-center gap-1 rounded-md border border-border bg-surface-raised px-2 text-[11px] font-medium text-foreground"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden /> Surveillance
            </Link>
            <LiveMenu mode="floor" />
          </div>
        )}
      </div>

      {isClosed ? (
        // PRIORITY 1.9-6/8/9 — same rule as LiveScreen's own closed-state
        // branch (see that component's doc comment): a closed investigation
        // reached here shows its Report/Review content, never a live-
        // looking hands-free console — and VoiceControl is never mounted
        // for a historical record, so it never requests the microphone.
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
          <InvestigationReportsView />
        </div>
      ) : (
        <>
          <div className="flex-none border-b border-border bg-surface px-2 py-1">
            <CountSummaryPanel />
          </div>

          <FloorPlayField />

          <ActiveSeatHeader target={activeTarget} terminology="spot" />

          {/* BET, directly below the active-target statement and above the
              keypad (AGENTS.md 1.14b UX correction round §4) — real-device
              feedback found this control unreachable without scrolling past
              the card keypad first. It's the single most common Floor
              action after card entry itself, so it now gets flex-none,
              always-visible placement, never competing with the keypad for
              scroll space. */}
          {activeSeatEnabled && (
            <PlayerDetailBar target={activeSeat!} onOpen={() => setPlayerDetailOpen(true)} />
          )}

          {/* Card entry before round-control operations (Floor Mode operator
              usability cleanup, information-hierarchy pass): an operator's eye
              moves from "what's active"/"what's the bet" straight to "how do I
              enter a card," with Done/Next/Undo reachable right below once a
              card is in. */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <CardEntryPad terminology="spot" />
            <RoundControlsRow floorMode />
          </div>

          {activeSeatEnabled && (
            <PlayerDetailSheet
              open={playerDetailOpen}
              onClose={() => setPlayerDetailOpen(false)}
              target={activeSeat!}
            />
          )}

          <VoiceControlErrorBoundary>
            <VoiceControl floorMode />
          </VoiceControlErrorBoundary>
        </>
      )}
    </div>
  );
}
