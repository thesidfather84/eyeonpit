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
 * actions, notes, and reporting remain Surveillance-only for now (reachable
 * any time via the link back below — nothing about the investigation is
 * gated by which shell most recently viewed it).
 *
 * FloorPlayField (below CountSummaryPanel) is the one addition beyond that
 * original set — a compact, low-attention dealer/seat summary so the
 * operator can confirm what a narration was just heard as without leaving
 * Floor Mode for Surveillance's full table. It is deliberately NOT
 * SeatTilesRow/TableMap; see that component's own doc comment for the
 * scope line between the two.
 */
export function FloorScreen() {
  const { investigation, activeTarget } = useInvestigationContext();
  const isOnline = useOnlineStatus();

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
        <Link
          href={`/investigations/${investigation.localId}/live`}
          className="tap-target flex shrink-0 items-center gap-1 rounded-md border border-border bg-surface-raised px-2 text-[11px] font-medium text-foreground"
        >
          <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden /> Surveillance
        </Link>
      </div>

      <div className="flex-none border-b border-border bg-surface px-2 py-1">
        <CountSummaryPanel />
      </div>

      <FloorPlayField />

      <ActiveSeatHeader target={activeTarget} />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <RoundControlsRow />
        <CardEntryPad />
      </div>

      <VoiceControlErrorBoundary>
        <VoiceControl />
      </VoiceControlErrorBoundary>
    </div>
  );
}
