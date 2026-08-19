"use client";

import Link from "next/link";
import { ArrowLeftRight, Headphones } from "lucide-react";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { CountSummaryPanel } from "./CountSummaryPanel";
import { FloorPlayField } from "./FloorPlayField";
import { ActiveSeatHeader } from "./ActiveSeatHeader";
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
 * the table graphic, wager panel, and player-actions row that LiveScreen
 * shows — Floor Mode's whole premise is that the phone stays in a pocket
 * most of the time, driven by voice, with the manual keypad only as the
 * fallback when voice is unavailable, inaccurate, too noisy, or
 * inappropriate. This is intentionally the minimum useful shell, not a
 * feature-complete alternative to Surveillance; wager entry, player
 * actions, and notes remain Surveillance-only for now (reachable any time
 * via the Surveillance link below — nothing about the investigation is
 * gated by which shell most recently viewed it).
 *
 * FloorPlayField (below CountSummaryPanel) is the one addition beyond that
 * original set — a compact, low-attention dealer/seat summary so the
 * operator can confirm what a narration was just heard as without leaving
 * Floor Mode for Surveillance's full table. It is deliberately NOT
 * SeatTilesRow/TableMap; see that component's own doc comment for the
 * scope line between the two.
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
 * either way; this "+ New" is the safety net for reaching a stale Floor
 * view of an already-closed investigation by some other route (e.g.
 * closed from Surveillance in another tab).
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

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="flex flex-none items-center justify-between gap-1.5 border-b border-border bg-surface px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <Headphones className="h-4 w-4 shrink-0 text-accent" aria-hidden />
          <span className="shrink-0 text-[11px] font-bold text-foreground">FLOOR</span>
          <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
            {investigation.displayId}
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
          <div className="flex shrink-0 items-center gap-1.5">
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

      <div className="flex-none border-b border-border bg-surface px-2 py-1">
        <CountSummaryPanel />
      </div>

      <FloorPlayField />

      <ActiveSeatHeader target={activeTarget} terminology="spot" />

      {/* Card entry before operational actions (Floor Mode operator
          usability cleanup, information-hierarchy pass): an operator's eye
          moves from "what's active" straight to "how do I enter a card,"
          with Done/Next/Undo reachable right below once a card is in — not
          the reverse, which put round controls between the active-target
          banner and the keypad they don't act on. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardEntryPad terminology="spot" />
        <RoundControlsRow floorMode />
      </div>

      <VoiceControlErrorBoundary>
        <VoiceControl floorMode />
      </VoiceControlErrorBoundary>
    </div>
  );
}
