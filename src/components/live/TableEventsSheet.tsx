"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import type { TableEventKind } from "@/types/investigation";

const EVENTS: { kind: TableEventKind; label: string; needsDetail?: boolean }[] = [
  { kind: "dealer-change", label: "Dealer Change", needsDetail: true },
  { kind: "shuffle", label: "Shuffle" },
  { kind: "seat-opens", label: "Spot Opens" },
  { kind: "seat-closes", label: "Spot Closes" },
  { kind: "player-joins", label: "Player Joins" },
  { kind: "player-leaves", label: "Player Leaves" },
  { kind: "table-closed", label: "Table Closed" },
];

/** Table events aren't tied to any one seat's hand — logged straight to the current round's event log for the record. */
export function TableEventsSheet({ onClose }: { onClose: () => void }) {
  const { logTableEvent, busy } = useInvestigationContext();
  const [pendingDetailFor, setPendingDetailFor] = useState<TableEventKind | null>(null);
  const [detail, setDetail] = useState("");

  async function handleLog(kind: TableEventKind, needsDetail?: boolean) {
    if (needsDetail && pendingDetailFor !== kind) {
      setPendingDetailFor(kind);
      setDetail("");
      return;
    }
    await logTableEvent(kind, needsDetail ? detail : undefined);
    onClose();
  }

  return (
    <BottomSheet open onClose={onClose} title="Log Table Event">
      <div className="flex flex-col gap-1 pb-4">
        {EVENTS.map(({ kind, label, needsDetail }) => (
          <div key={kind}>
            <button
              disabled={busy}
              onClick={() => handleLog(kind, needsDetail)}
              className="tap-target w-full rounded-lg px-3 text-left text-sm font-medium text-foreground hover:bg-surface-raised disabled:opacity-40"
            >
              {label}
            </button>
            {pendingDetailFor === kind && (
              <div className="mb-1 flex gap-2 px-3">
                <input
                  autoFocus
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  placeholder="New dealer name/badge #"
                  className="tap-target w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
                />
                <Button variant="primary" disabled={busy} onClick={() => handleLog(kind, needsDetail)}>
                  Log
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </BottomSheet>
  );
}
