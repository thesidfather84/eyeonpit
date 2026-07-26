"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { seatHasCurrentRoundData } from "@/lib/db/repositories/investigations";
import { seatNumbersFor } from "@/lib/utils/seats";

type Step = "menu" | "link-picker" | "additional-spot-picker" | "add-label";

interface SeatOptionsSheetProps {
  seatNumber: number;
  onClose: () => void;
}

/**
 * The deliberate-action menu — reached only by press-and-hold or the small
 * "⋮" button on a seat tile, never by a normal tap. Content differs for an
 * occupied seat (which already has a player + possibly links) versus an
 * empty one (which only offers ways to populate it).
 */
export function SeatOptionsSheet({ seatNumber, onClose }: SeatOptionsSheetProps) {
  const {
    investigation,
    currentRound,
    selectSeat,
    occupySeat,
    markSeatEmpty,
    linkSeats,
    unlinkSeat,
    assignSeatToPlayerGroup,
    renamePlayerGroup,
    clearSeatHand,
  } = useInvestigationContext();

  const [step, setStep] = useState<Step>("menu");
  const [labelDraft, setLabelDraft] = useState("");
  const [markEmptyConfirmOpen, setMarkEmptyConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const isOccupied = investigation.occupiedSeats.includes(seatNumber);
  const groupId = investigation.seatPlayerGroups[seatNumber];
  const group = groupId ? investigation.playerGroups[groupId] : undefined;
  const linkedSeatNumbers = groupId
    ? Object.entries(investigation.seatPlayerGroups)
        .filter(([, gId]) => gId === groupId)
        .map(([seat]) => Number(seat))
        .sort((a, b) => a - b)
    : [];
  const isLinked = linkedSeatNumbers.length > 1;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  function handleMarkEmpty() {
    if (seatHasCurrentRoundData(currentRound, seatNumber)) {
      setMarkEmptyConfirmOpen(true);
    } else {
      run(() => markSeatEmpty(seatNumber));
    }
  }

  const title = isOccupied
    ? `Seat ${seatNumber}${group ? ` — ${group.label}` : ""}`
    : `Seat ${seatNumber} (empty)`;

  return (
    <>
      <BottomSheet open={step !== "add-label"} onClose={onClose} title={title}>
        {step === "menu" && isOccupied && (
          <div className="flex flex-col gap-1 pb-4">
            <MenuButton
              label="Select Seat"
              onClick={() => run(async () => selectSeat(seatNumber))}
            />
            <MenuButton
              label="Change Bet"
              onClick={() => run(async () => selectSeat(seatNumber))}
            />
            <MenuButton label="Link to Another Seat" onClick={() => setStep("link-picker")} />
            <MenuButton
              label="Unlink Seat"
              disabled={!isLinked}
              onClick={() => run(() => unlinkSeat(seatNumber))}
            />
            <MenuButton label="Mark Empty" onClick={handleMarkEmpty} />
            <MenuButton
              label="Clear Current Hand"
              onClick={() => run(() => clearSeatHand(seatNumber))}
            />
            <MenuButton
              label="Add Player Label"
              onClick={() => {
                setLabelDraft(group?.label ?? "");
                setStep("add-label");
              }}
            />
            <MenuButton label="Cancel" onClick={onClose} muted />
          </div>
        )}

        {step === "menu" && !isOccupied && (
          <div className="flex flex-col gap-1 pb-4">
            <MenuButton
              label="Add New Player"
              onClick={() => run(() => occupySeat(seatNumber))}
            />
            <MenuButton
              label="Add as Additional Spot for Existing Player"
              disabled={Object.keys(investigation.playerGroups).length === 0}
              onClick={() => setStep("additional-spot-picker")}
            />
            <MenuButton label="Cancel" onClick={onClose} muted />
          </div>
        )}

        {step === "link-picker" && (
          <SeatPicker
            excludeSeats={linkedSeatNumbers.length > 0 ? linkedSeatNumbers : [seatNumber]}
            investigation={investigation}
            busy={busy}
            onBack={() => setStep("menu")}
            onPick={(target) => run(() => linkSeats(seatNumber, target))}
          />
        )}

        {step === "additional-spot-picker" && (
          <div className="flex flex-col gap-1 pb-4">
            <button
              onClick={() => setStep("menu")}
              className="mb-1 text-left text-xs text-muted-foreground hover:text-foreground"
            >
              ← Back
            </button>
            {Object.values(investigation.playerGroups).length === 0 && (
              <p className="px-3 text-sm text-muted-foreground">No other players yet.</p>
            )}
            {Object.values(investigation.playerGroups).map((g) => {
              const spots = Object.entries(investigation.seatPlayerGroups).filter(
                ([, gId]) => gId === g.id
              ).length;
              return (
                <button
                  key={g.id}
                  disabled={busy}
                  onClick={() => run(() => assignSeatToPlayerGroup(seatNumber, g.id))}
                  className="tap-target flex items-center justify-between rounded-lg px-3 text-sm font-medium text-foreground hover:bg-surface-raised disabled:opacity-40"
                >
                  <span>{g.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {spots} spot{spots === 1 ? "" : "s"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </BottomSheet>

      <BottomSheet
        open={step === "add-label"}
        onClose={() => setStep("menu")}
        title={`Label — Seat ${seatNumber}`}
      >
        <div className="flex flex-col gap-3 pb-4">
          <input
            autoFocus
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            placeholder="e.g. Player A"
            maxLength={24}
            className="tap-target rounded-lg border border-border bg-surface-raised px-3 text-sm text-foreground"
          />
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setStep("menu")}>
              Back
            </Button>
            <Button
              variant="primary"
              fullWidth
              disabled={busy || !labelDraft.trim() || !groupId}
              onClick={() =>
                run(async () => {
                  if (groupId) await renamePlayerGroup(groupId, labelDraft.trim());
                })
              }
            >
              Save
            </Button>
          </div>
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={markEmptyConfirmOpen}
        title="Clear this seat?"
        message={`Seat ${seatNumber} contains a bet or hand data. Clear this seat?`}
        confirmLabel="Clear Seat"
        destructive
        busy={busy}
        onConfirm={() => {
          setMarkEmptyConfirmOpen(false);
          run(() => markSeatEmpty(seatNumber));
        }}
        onCancel={() => setMarkEmptyConfirmOpen(false)}
      />
    </>
  );
}

function MenuButton({
  label,
  onClick,
  disabled,
  muted,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  muted?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`tap-target rounded-lg px-3 text-left text-sm font-medium hover:bg-surface-raised disabled:opacity-40 ${
        muted ? "text-muted-foreground" : "text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function SeatPicker({
  investigation,
  excludeSeats,
  busy,
  onBack,
  onPick,
}: {
  investigation: import("@/types/investigation").Investigation;
  excludeSeats: number[];
  busy: boolean;
  onBack: () => void;
  onPick: (seatNumber: number) => void;
}) {
  const candidates = seatNumbersFor(investigation).filter((s) => !excludeSeats.includes(s));

  return (
    <div className="flex flex-col gap-1 pb-4">
      <button
        onClick={onBack}
        className="mb-1 text-left text-xs text-muted-foreground hover:text-foreground"
      >
        ← Back
      </button>
      {candidates.map((seat) => {
        const occupied = investigation.occupiedSeats.includes(seat);
        const groupId = investigation.seatPlayerGroups[seat];
        const group = groupId ? investigation.playerGroups[groupId] : undefined;
        return (
          <button
            key={seat}
            disabled={busy}
            onClick={() => onPick(seat)}
            className="tap-target flex items-center justify-between rounded-lg px-3 text-sm font-medium text-foreground hover:bg-surface-raised disabled:opacity-40"
          >
            <span>Seat {seat}</span>
            <span className="text-xs text-muted-foreground">
              {occupied ? group?.label ?? "occupied" : "empty"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
