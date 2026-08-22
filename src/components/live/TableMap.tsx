"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { SeatTilesRow } from "./SeatTilesRow";
import { DealerTile } from "./DealerTile";

/**
 * The table map — the arch (up to six positions, trimmed by the table's
 * configured spot count, plus optional Position 7) above the dealer, all
 * fixed positions in one view, always visible together,
 * laid out as the dealer sees it while standing at the table. The dealer
 * is just another table position (styled red to stand out instantly), not
 * a separate control box — its actions live in the shared control dock
 * below, exactly like a seat's. Selecting any position highlights it in
 * place; nothing here is ever replaced by a separate screen.
 *
 * Edit Mode (owned here, passed down to both children) is the one
 * deliberate way to reach a seat's or the dealer's options sheet — the old
 * per-tile "⋮"/"⋯" icon buttons were too easy to catch by accident during
 * fast, repeated entry taps around a tile's edge, so they're gone entirely.
 * Toggling Edit Mode on visibly outlines every seat and the dealer, and
 * highlights this button; the *next* tap on any one of them opens its
 * options sheet and immediately exits Edit Mode again — a deliberate
 * one-shot design (not a sticky/latched toggle) so a forgotten "still in
 * Edit Mode" state can never linger and turn a later, ordinary selection
 * tap into an unexpected sheet.
 */
export function TableMap() {
  const [editMode, setEditMode] = useState(false);
  const exitEditMode = () => setEditMode(false);

  return (
    <div className="mx-1.5 flex-none overflow-hidden rounded-2xl border border-border/80 bg-surface-raised/30 short:mx-0 short:flex short:h-full short:min-h-0 short:flex-row short:border-0">
      <SeatTilesRow editMode={editMode} onSeatOptionsOpened={exitEditMode} />
      <div className="flex items-center justify-center gap-1.5 border-t border-border/60 bg-surface px-1 py-1 short:w-[68px] short:flex-none short:flex-col short:justify-center short:border-l short:border-t-0 short:px-1 short:py-0.5">
        <button
          type="button"
          onClick={() => setEditMode((v) => !v)}
          aria-label={editMode ? "Exit Edit Mode" : "Edit Seats & Dealer"}
          aria-pressed={editMode}
          title={editMode ? "Exit Edit Mode" : "Edit Seats & Dealer"}
          className={`tap-target flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-full border px-1.5 short:h-9 short:w-9 short:rounded-full short:px-0 ${
            editMode
              ? "border-accent bg-accent text-accent-foreground"
              : "border-border bg-surface-raised text-muted-foreground"
          }`}
        >
          <Pencil className="h-3.5 w-3.5 short:h-3 short:w-3" aria-hidden />
          <span className="text-[9px] font-semibold leading-none short:hidden">Edit</span>
        </button>
        <div className="w-1/3 min-w-[92px] short:w-full short:min-w-0">
          <DealerTile editMode={editMode} onOptionsOpened={exitEditMode} />
        </div>
      </div>
    </div>
  );
}
