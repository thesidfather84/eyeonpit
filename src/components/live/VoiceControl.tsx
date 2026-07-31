"use client";

import { useCallback, useRef, useState } from "react";
import { Mic, X } from "lucide-react";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { useCardEntry } from "@/hooks/useCardEntry";
import { useRoundControls } from "@/hooks/useRoundControls";
import { useSpeechRecognitionSupport } from "@/hooks/useSpeechRecognitionSupport";
import { useVoiceRecognition, type VoiceResult } from "@/hooks/useVoiceRecognition";
import { parseVoiceCommand, type VoiceCommandKind } from "@/lib/voice/parseVoiceCommand";
import { diagnostics } from "@/lib/diagnostics/logger";

type StatusState =
  | { kind: "idle" }
  | { kind: "listening"; transcript: string }
  | { kind: "accepted"; label: string }
  | { kind: "rejected"; transcript: string }
  | { kind: "error"; message: string };

const DISPLAY_RESET_MS = 2200;
const DUPLICATE_WINDOW_MS = 1500;

function friendlyError(error: string): string {
  if (error === "unsupported") return "Voice isn't supported in this browser.";
  if (error === "not-allowed" || error === "permission-denied" || error === "service-not-allowed") {
    return "Microphone permission denied.";
  }
  if (error === "no-speech") return "Didn't catch that — try again.";
  if (error === "audio-capture") return "No microphone found.";
  if (error === "network") return "Network error during recognition.";
  return "Voice recognition error.";
}

/**
 * Voice-entry beta, v1.1 scope only: seat 1-7 / dealer selection, the ten
 * card ranks (jack/queen/king normalize to "10", the same value
 * CardEntryPad's own keypad produces), and Done/Next/Undo. Every command
 * dispatches through the *same* hooks CardEntryPad and RoundControlsRow
 * themselves use (useCardEntry, useRoundControls) or the *same* exported
 * context actions (selectSeat, setActiveTarget) — this component contains
 * no card-entry, round-advance, or undo logic of its own, only parsing and
 * dispatch. It never touches the running count, the card ledger, or Dexie
 * directly.
 *
 * Mounted once inside LiveScreen, which itself unmounts entirely under the
 * privacy lock (see InvestigationChrome) — that's what makes "voice is
 * unavailable while locked" true without any extra check here.
 */
export function VoiceControl() {
  const supported = useSpeechRecognitionSupport();
  const { investigation, selectSeat, setActiveTarget } = useInvestigationContext();
  const { enterCard, disabled: cardDisabled } = useCardEntry();
  const { handleDone, handleNext, handleUndo, doneDisabled, nextDisabled, undoDisabled } = useRoundControls();

  const [status, setStatus] = useState<StatusState>({ kind: "idle" });
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDispatchRef = useRef<{ key: string; at: number } | null>(null);

  const scheduleReset = useCallback(() => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setStatus({ kind: "idle" }), DISPLAY_RESET_MS);
  }, []);

  // Returns a label on success, or null if the command was recognized but
  // its target control is currently disabled (e.g. "next" while paused) —
  // in both the parser's "unrecognized" case and this "disabled" case the
  // caller must treat it as "no action," just with a different message.
  const dispatch = useCallback(
    (command: VoiceCommandKind): string | null => {
      switch (command.kind) {
        case "select-seat":
          selectSeat(command.seat);
          return `Seat ${command.seat} selected`;
        case "select-dealer":
          setActiveTarget("dealer");
          return "Dealer selected";
        case "card":
          if (cardDisabled) return null;
          enterCard(command.rank);
          return `Card ${command.rank} entered`;
        case "done":
          if (doneDisabled) return null;
          handleDone();
          return "Done";
        case "next":
          if (nextDisabled) return null;
          handleNext();
          return "Next";
        case "undo":
          if (undoDisabled) return null;
          handleUndo();
          return "Undo";
        default:
          return null;
      }
    },
    [selectSeat, setActiveTarget, enterCard, cardDisabled, handleDone, doneDisabled, handleNext, nextDisabled, handleUndo, undoDisabled]
  );

  const handleFinalResult = useCallback(
    (result: VoiceResult) => {
      const parsed = parseVoiceCommand(result.transcript);

      // Belt-and-suspenders duplicate guard on top of useVoiceRecognition's
      // own one-final-result-per-session cap — catches the case of two
      // back-to-back listening sessions producing the identical transcript
      // (e.g. a rapid double-tap of the mic button).
      const now = Date.now();
      if (
        lastDispatchRef.current &&
        lastDispatchRef.current.key === parsed.normalized &&
        now - lastDispatchRef.current.at < DUPLICATE_WINDOW_MS
      ) {
        return;
      }
      lastDispatchRef.current = { key: parsed.normalized, at: now };

      if (!parsed.command) {
        diagnostics.info("voice", "rejected — unrecognized speech", { transcript: parsed.normalized });
        setStatus({ kind: "rejected", transcript: parsed.normalized });
        scheduleReset();
        return;
      }

      const label = dispatch(parsed.command);
      if (label == null) {
        diagnostics.info("voice", "rejected — control currently disabled", {
          transcript: parsed.normalized,
          command: parsed.command,
        });
        setStatus({ kind: "rejected", transcript: parsed.normalized });
        scheduleReset();
        return;
      }

      diagnostics.info("voice", "accepted", { transcript: parsed.normalized, command: parsed.command });
      setStatus({ kind: "accepted", label });
      scheduleReset();
    },
    [dispatch, scheduleReset]
  );

  const handleInterimResult = useCallback((result: VoiceResult) => {
    setStatus({ kind: "listening", transcript: result.transcript });
  }, []);

  const handleError = useCallback(
    (error: string) => {
      setStatus({ kind: "error", message: friendlyError(error) });
      scheduleReset();
    },
    [scheduleReset]
  );

  const { listening, start, stop } = useVoiceRecognition({
    onFinalResult: handleFinalResult,
    onInterimResult: handleInterimResult,
    onError: handleError,
  });

  function handleToggle() {
    if (listening) {
      stop();
      return;
    }
    setStatus({ kind: "listening", transcript: "" });
    start();
  }

  // Nothing left to do voice entry for on a closed investigation.
  if (investigation.status === "closed") return null;

  if (!supported) {
    return (
      <div
        role="status"
        className="pointer-events-none fixed bottom-4 right-4 z-20 rounded-full border border-border bg-surface-raised px-3 py-2 text-[10px] text-muted-foreground shadow-lg"
      >
        Voice not supported in this browser
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-20 flex flex-col items-end gap-2">
      {status.kind !== "idle" && (
        <div role="status" className="max-w-[220px] rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-lg">
          {status.kind === "listening" && (
            <p className="text-accent-secondary">
              Listening… <span className="text-foreground">{status.transcript || "…"}</span>
            </p>
          )}
          {status.kind === "accepted" && <p className="font-semibold text-status-green">✓ {status.label}</p>}
          {status.kind === "rejected" && (
            <p className="font-semibold text-pending">✗ Not recognized: “{status.transcript || "…"}”</p>
          )}
          {status.kind === "error" && <p className="font-semibold text-destructive">{status.message}</p>}
        </div>
      )}

      {listening && (
        <button
          type="button"
          onClick={stop}
          aria-label="Emergency stop listening"
          className="tap-target flex items-center gap-1 rounded-full border border-destructive/60 bg-destructive/10 px-3 text-[10px] font-semibold text-destructive"
        >
          <X className="h-3 w-3" aria-hidden /> Stop
        </button>
      )}

      <button
        type="button"
        onClick={handleToggle}
        aria-label={listening ? "Stop listening" : "Start voice command"}
        aria-pressed={listening}
        className={`tap-target flex h-14 w-14 items-center justify-center rounded-full border shadow-lg ${
          listening
            ? "animate-pulse border-accent bg-accent text-accent-foreground"
            : "border-border bg-surface-raised text-foreground"
        }`}
      >
        <Mic className="h-6 w-6" aria-hidden />
      </button>
    </div>
  );
}
