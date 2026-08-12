"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bug, Mic, X } from "lucide-react";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { useCardEntry } from "@/hooks/useCardEntry";
import { useRoundControls } from "@/hooks/useRoundControls";
import { useSpeechRecognitionSupport } from "@/hooks/useSpeechRecognitionSupport";
import { useVoiceRecognition, type VoiceLifecycleEvent, type VoiceResult } from "@/hooks/useVoiceRecognition";
import { parseVoiceCommand, type VoiceCommandKind, type VoiceSeat, type VoiceTarget } from "@/lib/voice/parseVoiceCommand";
import { parseNarration, type NarrationOp } from "@/lib/voice/parseNarration";
import { parseTableChangeCommand } from "@/lib/voice/parseTableChangeCommand";
import { formatNarrationConfirmation, type ConfirmationEntry } from "@/lib/voice/narrationConfirmation";
import { normalizeTranscript } from "@/lib/voice/normalizeTranscript";
import { resolveCardEntryTarget, type CardTarget } from "@/lib/utils/cardEntryResolution";
import { canCompleteRound } from "@/lib/utils/roundValidation";
import {
  addOperatorNote,
  completeInvestigation,
  createEmptySeatRecord,
  getInvestigation,
} from "@/lib/db/repositories/investigations";
import { getCardEventsForInvestigation } from "@/lib/db/repositories/cardEvents";
import { eventsInShoe } from "@/lib/counting-engine/ledger";
import { computeHandTotal } from "@/lib/utils/blackjackTotal";
import { diagnostics } from "@/lib/diagnostics/logger";
import {
  buildAcesAnnouncement,
  buildCountAnnouncement,
  buildDecksRemainingAnnouncement,
  buildNewShoeAnnouncement,
  buildStatusAnnouncement,
  buildSystemAnnouncement,
  buildTrueCountAnnouncement,
} from "@/lib/voice/spokenSummary";
import { getLastSpokenText, onSpeechDiagnostic, onSpeechEnd, onSpeechStart, speak } from "@/lib/voice/speechOutput";
import { parseReadOnlyQuery } from "@/lib/voice/parseReadOnlyQuery";
import { useSettingsStore } from "@/store/useSettingsStore";
import type { CardEventTargetType } from "@/lib/counting-engine/types";
import type { Investigation, Rank, Round } from "@/types/investigation";
import { VoiceDiagnosticsPanel, type VoiceDiagnosticEntry } from "./VoiceDiagnosticsPanel";

type StatusState =
  | { kind: "idle" }
  | { kind: "listening"; transcript: string }
  | { kind: "accepted"; label: string }
  /** The parser genuinely didn't match anything in the lexicon. */
  | { kind: "unrecognized"; transcript: string }
  /**
   * The parser matched a real command (e.g. a card rank), but its target
   * control is currently disabled (round completed, paused, etc.) — kept
   * distinct from `unrecognized` so the operator never sees "Not
   * recognized" for a word recognition genuinely understood; that
   * mislabeling is exactly what made a correctly-heard "king" look like a
   * silent failure. `reason` (narration only) names specifically what
   * couldn't be applied — e.g. "SEAT 3 isn't available right now" — so the
   * operator knows what to fix before repeating the narration, rather than
   * a generic "not available."
   */
  | { kind: "disabled"; transcript: string; reason?: string }
  /** Free dictation is active ("start note"/"note" heard, "end note" not yet heard) — no card/seat/workflow parsing happens while this is showing. `text` is everything captured so far. */
  | { kind: "note-mode"; text: string }
  | { kind: "error"; message: string };

/**
 * A lifecycle command awaiting its explicit spoken confirmation — "new
 * shoe"/"end investigation" set this instead of acting immediately;
 * "confirm new shoe"/"confirm end investigation" only ever do anything
 * when it matches. ANY other recognized final result (including a
 * completely different command) silently drops whatever was pending — see
 * handleFinalResult — so a stray later utterance can never be
 * misinterpreted as confirming something the operator never actually
 * said yes to.
 */
type PendingConfirmation = { kind: "new-shoe" } | { kind: "end-investigation" };

/** Exact-phrase triggers for voice note dictation — deliberately as strict/exact as every other command word in this file, no fuzzy matching. */
const NOTE_START_PHRASES = new Set(["start note", "note"]);
const NOTE_END_PHRASE = "end note";
const NOTE_CANCEL_PHRASE = "cancel note";
/** Handles a single utterance that front-loads the trigger and the first words of the note together ("start note the player at seat three...") — matched on the raw transcript (not the normalized one) so the captured remainder keeps the operator's original wording/casing for a more readable saved note. */
const NOTE_START_WITH_CONTENT_RE = /^\s*start\s+note[.,!?]?\s+(.+)$/i;

/**
 * Investigation-lifecycle voice commands — Pause/Resume ("Start Count"/"End
 * Count" are natural-wording aliases for the exact same two, see below) /
 * New Shoe/End Investigation. Deliberately exact multi-word phrases
 * (matching every other workflow word in this file — no fuzzy matching),
 * checked directly in handleFinalResult BEFORE narration/legacy dispatch,
 * exactly like the note-mode phrases above: none of these are card-entry
 * vocabulary, and none of them should ever be reinterpreted by
 * parseNarration/parseVoiceCommand (which don't know about them and would
 * just treat the words as noise). New Shoe and End Investigation both
 * require a SEPARATE, explicit confirmation phrase before anything actually
 * happens — see `pendingConfirmation` state below — matching the exact same
 * "never finalize on one recognition result" rule §17 of the operator-loop
 * milestone requires for End Investigation, applied consistently to New
 * Shoe too since it's equally consequential (resets the running count).
 */
const PAUSE_PHRASE = "pause investigation";
const RESUME_PHRASE = "resume investigation";
/**
 * "Start Count" / "End Count" — natural operator wording for exactly the
 * same pause/resume machinery above, nothing more. Per explicit product
 * direction: Start Count begins/continues live card entry without
 * resetting the running count, shoe, or history (= Resume Investigation);
 * End Count stops accepting entries while preserving everything (= Pause
 * Investigation). Only "New Shoe" ever resets the running count — these
 * two phrases are deliberately just aliases dispatched through the same
 * checks below, never a second lifecycle path.
 */
const START_COUNT_PHRASE = "start count";
const END_COUNT_PHRASE = "end count";
const NEW_SHOE_PHRASE = "new shoe";
const CONFIRM_NEW_SHOE_PHRASE = "confirm new shoe";
const END_INVESTIGATION_PHRASE = "end investigation";
const CONFIRM_END_INVESTIGATION_PHRASE = "confirm end investigation";
const FULL_STATUS_PHRASE = "full status";

const DISPLAY_RESET_MS = 2200;
const DUPLICATE_WINDOW_MS = 1500;
const MAX_LOG_ENTRIES = 200;

const LIFECYCLE_LABEL: Record<VoiceLifecycleEvent, string> = {
  started: "STARTED",
  "audio-start": "AUDIO START",
  "sound-start": "SOUND START",
  "speech-start": "SPEECH START",
  "speech-end": "SPEECH END",
  "sound-end": "SOUND END",
  "audio-end": "AUDIO END",
  ended: "END",
};

/**
 * Every code this beta was explicitly asked to handle, plus a verbatim
 * fallback for anything else — never silently dropped or generically
 * relabeled. The raw `error` string is always shown alongside the
 * description, both in the status pill and the diagnostics log.
 */
const ERROR_DESCRIPTIONS: Record<string, string> = {
  unsupported: "SpeechRecognition is not available in this browser.",
  "start-failed": "Recognition failed to start (already running, or the browser rejected start()).",
  "no-speech": "No speech was detected.",
  "audio-capture": "No microphone was found or it could not be used.",
  "not-allowed": "Microphone permission was denied.",
  "service-not-allowed": "The browser's speech recognition service refused the request.",
  network: "A network error interrupted recognition.",
  aborted: "Recognition was aborted.",
  "language-not-supported": 'The requested language ("en-US") is not supported.',
  "network-unavailable": "Voice unavailable — no network connection for speech recognition.",
};

function describeError(code: string): string {
  return ERROR_DESCRIPTIONS[code] ?? "Unrecognized error code.";
}

function nowLabel(): string {
  const d = new Date();
  return `${d.toLocaleTimeString([], { hour12: false })}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

function formatConfidence(confidence: number | null): string {
  return confidence == null ? "n/a" : confidence.toFixed(2);
}

function toCardTarget(target: VoiceTarget): CardTarget {
  return target.kind === "dealer" ? "dealer" : target.seat;
}

/** Inverse of toCardTarget — only ever applied to a target narration itself produced or the investigation's own current active target, both always "dealer" or a real seat 1-7, never a split target. */
function fromCardTarget(target: CardTarget): VoiceTarget {
  return target === "dealer" ? { kind: "dealer" } : { kind: "seat", seat: target as VoiceSeat };
}

/**
 * One already-resolved, ready-to-execute action produced by
 * `preflightNarration` — carries everything `commitNarration` needs to
 * actually perform the op without recomputing anything against (possibly
 * different) live state. For a "card" step, `applyToRound`/`eventMessage`
 * are already bound to the specific card and the specific
 * `resolveCardEntryTarget` resolution preflight used to prove it safe —
 * committing never re-derives these against real investigation/round
 * state, which is what would reintroduce the exact staleness bug this
 * design closes.
 */
type PreflightStep =
  | { kind: "selectTarget"; cardTarget: CardTarget; voiceTarget: VoiceTarget; bareOnly: boolean }
  | {
      kind: "card";
      targetType: CardEventTargetType;
      targetId: number | "dealer";
      rank: Rank;
      applyToRound: (round: Round) => Round;
      eventMessage: string;
      cardTarget: CardTarget;
      voiceTarget: VoiceTarget;
      displayRank: string;
    }
  | { kind: "workflow"; action: "done" | "next" | "undo" };

type PreflightResult = { ok: true; steps: PreflightStep[] } | { ok: false; reason: string };

/**
 * Validates a WHOLE narration's ops before anything commits — the atomicity
 * guarantee requirement #2 of the natural-narration milestone requires
 * ("ALL operations commit in order OR ZERO operations commit"). This is a
 * pure, synchronous simulation: it never calls addCard/completeRound/
 * setActiveTarget, only the same pure decision functions the single-command
 * path already uses (resolveCardEntryTarget, canCompleteRound), walked
 * against a LOCAL `simRound`/`simInvestigation` that folds forward with
 * each simulated card/done op via the exact same pure updater
 * (`resolution.applyCard`) the real write will use later — so a "done" (or
 * a later card) placed after earlier cards in the SAME narration is
 * evaluated against a round that already reflects them, without any
 * database round-trip. The very first op that would be infeasible aborts
 * the whole validation immediately (`ok: false`); every op before it,
 * however individually valid, is discarded along with it. Being entirely
 * synchronous (no `await`) is what makes the guarantee real: there is no
 * window between finishing this walk and the caller actually executing
 * `steps` for any concurrent action to invalidate what was just proven.
 *
 * "next"/"undo" are checked against the caller's existing hook-derived
 * `nextDisabled`/`undoDisabled` rather than being simulated — neither's
 * feasibility depends on card content this narration could itself change
 * (`nextDisabled` is just busy/active-status; `undoDisabled` depends on
 * undo-history state that lives in React state, not the round, and isn't
 * safely re-derivable here). This is a disclosed, narrower limitation (see
 * the milestone report), not a gap in the atomicity guarantee itself — no
 * required scenario has a narration whose own earlier ops change whether
 * Next or Undo is allowed.
 */
function preflightNarration(
  ops: NarrationOp[],
  investigation: Investigation,
  currentRound: Round,
  activeTarget: CardTarget,
  busy: boolean,
  nextDisabled: boolean,
  undoDisabled: boolean
): PreflightResult {
  let simRound = currentRound;
  let liveTarget: CardTarget | undefined;
  const steps: PreflightStep[] = [];
  // See commitNarration's own doc comment on `isBareTargetOnly` — identical
  // rule, computed here since this is where the steps themselves are built.
  const isBareTargetOnly = ops.length === 1 && ops[0].kind === "selectTarget";

  for (const op of ops) {
    if (op.kind === "selectTarget") {
      liveTarget = toCardTarget(op.target);
      // An explicit voice target naming an empty seat is the narration
      // equivalent of tapping that seat tile — occupySeat both creates the
      // seat's round record AND makes it active (see commitNarration,
      // which routes this step through the same occupySeat context
      // function SeatTilesRow itself calls). Simulated here too, purely in
      // memory, so a card for THIS seat later in the SAME narration
      // resolves as available without a database round-trip — otherwise
      // "seat two five seven" would preflight-fail on "five" even though
      // the seat is about to exist by the time it's actually entered.
      if (typeof liveTarget === "number" && !simRound.seats[liveTarget]) {
        simRound = { ...simRound, seats: { ...simRound.seats, [liveTarget]: createEmptySeatRecord(liveTarget) } };
      }
      steps.push({ kind: "selectTarget", cardTarget: liveTarget, voiceTarget: op.target, bareOnly: isBareTargetOnly });
      continue;
    }

    if (op.kind === "card") {
      const targetToUse = op.target ? toCardTarget(op.target) : (liveTarget ?? activeTarget);
      const resolution = resolveCardEntryTarget(investigation, simRound, targetToUse, busy);
      if (resolution.disabled) {
        return { ok: false, reason: `${resolution.targetLabel} isn't available right now` };
      }
      const card = { rank: op.rank, suit: "unspecified" as const };
      simRound = resolution.applyCard(simRound, card); // simulated only — no addCard call yet
      liveTarget = targetToUse;
      steps.push({
        kind: "card",
        targetType: resolution.targetType,
        targetId: resolution.targetId,
        rank: op.rank,
        applyToRound: (round) => resolution.applyCard(round, card),
        eventMessage: resolution.eventMessage(card),
        cardTarget: targetToUse,
        voiceTarget: op.target ?? fromCardTarget(targetToUse),
        displayRank: op.displayRank ?? op.rank,
      });
      continue;
    }

    // workflow
    if (op.action === "done") {
      const canDone =
        investigation.status === "active" && !simRound.completed && canCompleteRound(investigation, simRound).canComplete;
      if (!canDone) return { ok: false, reason: "Done isn't available yet — the round isn't complete" };
      simRound = { ...simRound, completed: true }; // simulated only — no completeRound call yet
    } else if (op.action === "next") {
      if (nextDisabled) return { ok: false, reason: "Next isn't available right now" };
    } else {
      if (undoDisabled) return { ok: false, reason: "Undo isn't available right now" };
    }
    steps.push({ kind: "workflow", action: op.action });
  }

  return { ok: true, steps };
}

/**
 * Voice entry: seat 1-7 / dealer selection, the ten card ranks (jack/
 * queen/king normalize to "10", the same value CardEntryPad's own keypad
 * produces), Done/Next/Undo, and free-form voice notes. One tap turns
 * continuous listening on — the mic keeps restarting a fresh recognition
 * session after every Web Speech end/result until a second tap turns it
 * off, so a run of commands ("dealer", "king", "seat two", "five") never
 * needs a tap in between (see useVoiceRecognition for the restart
 * mechanics). Every command dispatches through the *same* hooks
 * CardEntryPad and RoundControlsRow themselves use (useCardEntry,
 * useRoundControls) or the *same* exported context actions (occupySeat —
 * the same tap-parity path SeatTilesRow itself calls, so an explicit
 * voice target naming an empty seat occupies it exactly like a tap would —
 * setActiveTarget) — this component contains no card-entry, round-advance,
 * or undo logic of its own, only parsing and dispatch. It never touches
 * the running count or the card ledger directly, and note text is saved
 * through the existing addOperatorNote repository function — no second
 * notes architecture.
 *
 * "Start note" / "note" enters free dictation: every subsequent final
 * result is captured as note text (never parsed as a card/seat/workflow
 * command) until "end note" saves it via addOperatorNote and returns to
 * normal command listening, or "cancel note" discards it — both
 * automatically, with continuous listening never interrupted either way.
 *
 * "Count" / "status" are read-only: they build a short sentence from the
 * exact same CountSnapshot CountSummaryPanel renders (see
 * lib/voice/spokenSummary.ts) and, if speech synthesis is available and the
 * operator hasn't turned spoken feedback off in Settings (see
 * useSettingsStore's `voiceAudioFeedback`), speak it via
 * lib/voice/speechOutput.ts — headset-oriented for Floor Mode. Neither ever
 * calls addCard/mutate; there is no code path from these two commands to
 * the ledger.
 *
 * Mounted once inside LiveScreen, which itself unmounts entirely under the
 * privacy lock (see InvestigationChrome) — that's what makes "voice is
 * unavailable while locked" true without any extra check here.
 *
 * EyeOnPit is offline-first: if the platform's speech service can't be
 * reached (a genuinely offline device, or one whose Web Speech
 * implementation depends on a remote server), useVoiceRecognition gives up
 * after a bounded number of consecutive "network" failures rather than
 * restarting into that same wall forever, and this component replaces the
 * mic button with a clear, persistent "Voice unavailable — offline" state
 * (tap to retry) instead of looping silently. Nothing about that ever
 * touches card entry, the ledger, or any other investigation state — the
 * whole point is that losing voice must never degrade the investigation
 * itself, only the convenience of hands-free entry.
 *
 * The diagnostics log (VoiceDiagnosticsPanel) records every recognition
 * lifecycle event, transcript, alternative + confidence, and exact error
 * code, but stays collapsed behind the small "Debug" toggle at all times —
 * it never renders itself just because entries exist. Ordinary voice entry
 * only ever shows the compact status pill (Listening.../accepted/rejected/
 * note mode/error) over the live table; a field issue (e.g. a word not
 * registering) is chased by deliberately opening Debug and using "Copy
 * Voice Log," not by the panel appearing on its own. None of this changes
 * what actually gets dispatched — only `alternatives[0]` (parsed strictly)
 * is ever checked against a command, exactly as before.
 *
 * `floorMode` (operator-loop correction) is passed straight through to
 * useRoundControls, so voice "done" — bare or narration-embedded — gets
 * the same Floor-only auto-advance a tap on Done gets from RoundControlsRow.
 * This component otherwise still has no idea which shell it's mounted in;
 * `floorMode` is the one deliberate exception, not a precedent for
 * threading more shell-awareness through here.
 */
export function VoiceControl({ floorMode = false }: { floorMode?: boolean } = {}) {
  const supported = useSpeechRecognitionSupport();
  const {
    investigation,
    currentRound,
    cardEvents,
    activeTarget,
    busy,
    addCard,
    occupySeat,
    occupySeatAndAddCard,
    markSeatEmpty,
    setActiveTarget,
    refresh,
    completeRound,
    completeRoundAndAdvance,
    pause,
    resume,
    startNewShoe,
  } = useInvestigationContext();
  const { enterCard, disabled: cardDisabled, targetLabel } = useCardEntry();
  const { handleDone, handleNext, handleUndo, doneDisabled, nextDisabled, undoDisabled } = useRoundControls(floorMode);
  const voiceAudioFeedback = useSettingsStore((s) => s.voiceAudioFeedback);
  const floorSpokenCountContent = useSettingsStore((s) => s.floorSpokenCountContent);

  const [status, setStatus] = useState<StatusState>({ kind: "idle" });
  const [log, setLog] = useState<VoiceDiagnosticEntry[]>([]);
  const [noteMode, setNoteMode] = useState(false);
  const [noteText, setNoteText] = useState("");
  /** See PendingConfirmation's own doc comment. */
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  // Persistent, not part of the transient `status` pill — set once the
  // hook gives up after several consecutive "network" failures (see
  // useVoiceRecognition's MAX_CONSECUTIVE_NETWORK_ERRORS). EyeOnPit is
  // offline-first: this must read as a clear, permanent "voice is down,
  // manual entry is fine" state, not fade away after a couple of seconds
  // the way an ordinary rejected/accepted command does.
  const [voiceUnavailable, setVoiceUnavailable] = useState(false);
  // Mirrors `listening` for scheduleReset's use, defined further down —
  // read here via ref (updated in an effect right after the hook call)
  // rather than needing `listening` itself in scope yet, which would
  // otherwise create a circular definition order (the hook needs the
  // handlers below, which need scheduleReset, which would need `listening`
  // from the hook).
  const listeningRef = useRef(false);
  // Diagnostics are opt-in only — the full recognition log is genuinely
  // useful for chasing an on-device issue, but it must never be the thing
  // that greets an operator doing ordinary voice entry. Collapsed by
  // default regardless of how many entries have accumulated; only this
  // deliberate toggle reveals it.
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDispatchRef = useRef<{ key: string; at: number } | null>(null);
  const logIdRef = useRef(0);

  const appendLog = useCallback((label: string, detail = "") => {
    // The id must be captured into a local const *here*, not read as
    // `logIdRef.current` from inside the setLog updater below. React defers
    // running that updater; if several appendLog calls happen synchronously
    // in the same tick (e.g. `result.alternatives.forEach(...)` logging
    // each alternative), every increment to the ref completes before any
    // of the queued updaters run — so a live `logIdRef.current` read inside
    // the closure would return the *same final* value for all of them,
    // producing duplicate ids (React's "two children with the same key").
    // A plain local variable is captured by value per call, so each entry
    // keeps the id it was actually assigned, regardless of when its
    // updater runs. `logIdRef` itself is never reset — monotonic for the
    // component's whole lifetime, across every start/stop session.
    logIdRef.current += 1;
    const id = logIdRef.current;
    setLog((prev) => {
      const next = [...prev, { id, time: nowLabel(), label, detail }];
      return next.length > MAX_LOG_ENTRIES ? next.slice(next.length - MAX_LOG_ENTRIES) : next;
    });
  }, []);

  // Reverts to a "still listening" placeholder — not true idle — whenever
  // continuous voice mode is still on, so the pill never goes fully blank
  // between commands and makes it look like listening silently stopped.
  const scheduleReset = useCallback(() => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      setStatus(listeningRef.current ? { kind: "listening", transcript: "" } : { kind: "idle" });
    }, DISPLAY_RESET_MS);
  }, []);

  // Returns a label on success, or null if the command was recognized but
  // its target control is currently disabled (e.g. "next" while paused) —
  // in both the parser's "unrecognized" case and this "disabled" case the
  // caller must treat it as "no action," just with a different message.
  const dispatch = useCallback(
    (command: VoiceCommandKind): string | null => {
      switch (command.kind) {
        case "select-seat":
          // An explicit voice target naming a seat ("seat 2"/"spot 2"/
          // "player 2"/"C2" — all four already normalize to the identical
          // { kind: "select-seat", seat } command above in
          // parseVoiceCommand) is the voice equivalent of tapping that
          // seat tile: SeatTilesRow's own tap handler always calls
          // `occupySeat`, never a select-only path, and voice must match
          // that exactly (occupySeat already no-ops to a plain select when
          // the seat is already occupied) — otherwise the UI can show
          // "ACTIVE — SEAT 2" while the card pad still says "not enabled,"
          // which is the exact bug this closes.
          void occupySeat(command.seat);
          return `Seat ${command.seat} selected`;
        case "select-dealer":
          setActiveTarget("dealer");
          return "Dealer selected";
        case "card": {
          // "dealer king" / "seat three ace" name a target in the same
          // utterance — that target is resolved and entered on directly
          // (resolveCardEntryTarget, the same rules useCardEntry itself
          // uses) rather than through the currently *active* target, since
          // setActiveTarget's state update wouldn't be visible to
          // useCardEntry's own snapshot until after this function returns.
          // The active target is then switched to match, exactly as if the
          // operator had tapped that seat/dealer tile first.
          if (command.target) {
            const cardTarget = toCardTarget(command.target);
            // Same tap-parity rule as "select-seat" above: an explicit
            // target named alongside a card must occupy an empty seat
            // first, not just fail with "not enabled." Simulated here
            // (createEmptySeatRecord mirrors exactly what occupySeat's own
            // ensureSeatRecord call will create) so the resolution below
            // sees the seat as available in the SAME beat, without waiting
            // on a round-trip. The actual occupy-then-enter is NOT two
            // independent writes chained by a Promise: occupySeatAndAddCard
            // wraps both in one Dexie transaction (see cardEvents.ts), so
            // "seat two five" can never leave the seat occupied with an
            // empty hand if the card write were to fail — either both land
            // or neither does.
            const needsOccupy = typeof cardTarget === "number" && !investigation.occupiedSeats.includes(cardTarget);
            const roundForResolution = needsOccupy
              ? { ...currentRound, seats: { ...currentRound.seats, [cardTarget as number]: createEmptySeatRecord(cardTarget as number) } }
              : currentRound;
            const resolution = resolveCardEntryTarget(investigation, roundForResolution, cardTarget, busy);
            if (resolution.disabled) return null;
            const card = { rank: command.rank, suit: "unspecified" as const };
            if (needsOccupy) {
              void occupySeatAndAddCard(
                cardTarget as number,
                { targetType: resolution.targetType, targetId: resolution.targetId, rank: command.rank },
                (round) => resolution.applyCard(round, card),
                { type: "card", message: resolution.eventMessage(card) }
              );
            } else {
              addCard(
                { targetType: resolution.targetType, targetId: resolution.targetId, rank: command.rank },
                (round) => resolution.applyCard(round, card),
                { type: "card", message: resolution.eventMessage(card) }
              );
            }
            setActiveTarget(cardTarget);
            return `${resolution.targetLabel}: ${command.displayRank ?? command.rank}`;
          }

          if (cardDisabled) return null;
          enterCard(command.rank);
          // Echoes back the actual target (dealer or a seat) and the
          // spoken face-card letter when there is one — "SEAT 3: K" /
          // "DEALER: A" — not just a generic "Card 10 entered" that gives
          // no confirmation of *where* it went. The stored rank is always
          // "10" for a face card either way; displayRank only changes this
          // message's wording.
          return `${targetLabel}: ${command.displayRank ?? command.rank}`;
        }
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
        case "count": {
          // Read-only — builds off the same CardEvent ledger/CountSnapshot
          // CountSummaryPanel renders, never touches addCard/mutate. Always
          // available regardless of busy/paused/closed, exactly like
          // select-seat/select-dealer: there is nothing here that could
          // conflict with an in-flight mutation.
          const text = buildCountAnnouncement(investigation, cardEvents, currentRound.shoeNumber);
          if (voiceAudioFeedback) speak(text);
          return text;
        }
        case "status": {
          // Read-only, always available, never mutates — same guarantee as
          // "count". The visual confirmation always shows a real count
          // (falls back to the concise Hi-Lo-only wording if the operator's
          // floorSpokenCountContent setting is "off"), but audio only plays
          // when BOTH voiceAudioFeedback (the master switch) and the
          // content setting allow it — "off" means "no count chatter,"
          // not "Status stops working."
          const spoken =
            floorSpokenCountContent === "off"
              ? null
              : buildStatusAnnouncement(investigation, cardEvents, currentRound.shoeNumber, floorSpokenCountContent);
          const text = spoken ?? buildStatusAnnouncement(investigation, cardEvents, currentRound.shoeNumber, "hiloRc");
          if (voiceAudioFeedback && spoken) speak(spoken);
          return text;
        }
        default:
          return null;
      }
    },
    [
      investigation,
      currentRound,
      cardEvents,
      busy,
      addCard,
      occupySeat,
      occupySeatAndAddCard,
      setActiveTarget,
      enterCard,
      cardDisabled,
      targetLabel,
      handleDone,
      doneDisabled,
      handleNext,
      nextDisabled,
      handleUndo,
      undoDisabled,
      voiceAudioFeedback,
      floorSpokenCountContent,
    ]
  );

  /**
   * A validated narration commits ALL of its ops or NONE of them — never a
   * partial prefix. `preflightNarration` (below, module scope) walks the
   * whole op list FIRST, purely in memory: no addCard/completeRound/
   * setActiveTarget call happens here, only the same pure decision
   * functions the single-command path already uses
   * (resolveCardEntryTarget, canCompleteRound) evaluated against a LOCAL,
   * incrementally-simulated copy of the round (each simulated card op
   * folds forward via `resolution.applyCard`, exactly the same pure
   * updater the real write will use) — so a trailing "done" correctly sees
   * cards THIS narration's own earlier ops would add, without ever
   * touching the database. If every op preflights successfully, the
   * resulting ordered `steps` are then actually executed here, in the same
   * order, through the exact primitives `dispatch` above already uses. If
   * any op fails preflight, this returns "blocked" with a reason and
   * nothing has been written anywhere — not even the ops preflight had
   * already proven safe. Because preflight is entirely synchronous (no
   * `await`, no I/O), there is no window between "preflight finished" and
   * "commit starts" for anything else to invalidate its conclusions.
   */
  const commitNarration = useCallback(
    async (
      ops: NarrationOp[]
    ): Promise<{ kind: "committed"; label: string; committedCount: number } | { kind: "blocked"; reason: string }> => {
      const preflight = preflightNarration(ops, investigation, currentRound, activeTarget, busy, nextDisabled, undoDisabled);
      if (!preflight.ok) return { kind: "blocked", reason: preflight.reason };

      const entries: ConfirmationEntry[] = [];
      for (const step of preflight.steps) {
        if (step.kind === "selectTarget") {
          // Tap parity: a seat target always goes through occupySeat (it
          // already no-ops to a plain select when the seat is already
          // occupied), exactly like SeatTilesRow's own tap handler — never
          // a select-only path for a seat. Dealer has no occupancy concept.
          if (step.cardTarget === "dealer") setActiveTarget("dealer");
          else await occupySeat(step.cardTarget);
          if (step.bareOnly) entries.push({ kind: "target", target: step.voiceTarget });
          continue;
        }
        if (step.kind === "card") {
          await addCard(
            { targetType: step.targetType, targetId: step.targetId, rank: step.rank },
            step.applyToRound,
            { type: "card", message: step.eventMessage }
          );
          setActiveTarget(step.cardTarget);
          entries.push({ kind: "card", target: step.voiceTarget, displayRank: step.displayRank });
          continue;
        }
        // workflow — preflight already proved each of these feasible; this
        // just runs the same handlers the single-command path uses. "done"
        // mirrors handleDone's own floorMode choice (see useRoundControls'
        // doc comment) so a narration that ends in "...done" auto-advances
        // in Floor exactly like a bare "done" does — narration is not a
        // second, differently-behaved completion path.
        if (step.action === "done") {
          if (floorMode) await completeRoundAndAdvance();
          else await completeRound();
        } else if (step.action === "next") handleNext();
        else handleUndo();
        entries.push({ kind: "workflow", action: step.action });
      }

      if (entries.length === 0) {
        return { kind: "blocked", reason: "recognized narration, but nothing in it is currently actionable" };
      }
      return { kind: "committed", label: formatNarrationConfirmation(entries), committedCount: entries.length };
    },
    [
      investigation,
      currentRound,
      activeTarget,
      busy,
      nextDisabled,
      undoDisabled,
      addCard,
      occupySeat,
      setActiveTarget,
      completeRound,
      completeRoundAndAdvance,
      floorMode,
      handleNext,
      handleUndo,
    ]
  );

  const handleFinalResult = useCallback(
    (result: VoiceResult) => {
      result.alternatives.forEach((alt, i) => {
        appendLog(`FINAL #${i + 1}`, `"${alt.transcript}" (confidence: ${formatConfidence(alt.confidence)})`);
      });

      const normalized = normalizeTranscript(result.transcript);

      // A blank/whitespace-only final result is common recognizer noise
      // (silence padded out to a "final" event, or a session ending with
      // nothing actually heard) — not an operator mistake, so it must never
      // surface as a visible "Not recognized" rejection the way a genuinely
      // unrecognized phrase does. Silent no-op: nothing dispatched, status
      // pill left exactly as it was.
      if (!normalized) {
        appendLog("EMPTY", "silent no-op — blank transcript");
        return;
      }

      // Belt-and-suspenders duplicate guard on top of useVoiceRecognition's
      // own one-final-result-per-native-session cap — catches the case of
      // two back-to-back sessions (a restart included) producing the
      // identical transcript. Applies uniformly whether or not note mode
      // is active: a genuinely duplicated final result must never be
      // processed twice either way.
      const now = Date.now();
      if (
        lastDispatchRef.current &&
        lastDispatchRef.current.key === normalized &&
        now - lastDispatchRef.current.at < DUPLICATE_WINDOW_MS
      ) {
        appendLog("DUPLICATE IGNORED", `"${normalized}"`);
        return;
      }
      lastDispatchRef.current = { key: normalized, at: now };

      if (noteMode) {
        if (normalized === NOTE_END_PHRASE) {
          const finalText = noteText.trim();
          setNoteMode(false);
          setNoteText("");
          if (finalText) {
            diagnostics.info("voice", "note saved", { text: finalText });
            appendLog("NOTE SAVED", finalText);
            void addOperatorNote(investigation.localId, finalText).then(refresh);
            setStatus({ kind: "accepted", label: "Note saved" });
          } else {
            appendLog("NOTE EMPTY", "nothing dictated — not saved");
            setStatus({ kind: "accepted", label: "Note empty — not saved" });
          }
          scheduleReset();
          return;
        }
        if (normalized === NOTE_CANCEL_PHRASE) {
          setNoteMode(false);
          setNoteText("");
          appendLog("NOTE CANCELLED", noteText);
          setStatus({ kind: "accepted", label: "Note cancelled" });
          scheduleReset();
          return;
        }
        // Free dictation — never checked against parseVoiceCommand at all
        // while note mode is active, so a card/seat/workflow word spoken
        // here is captured as text, never entered as a command.
        const chunk = result.transcript.trim();
        if (chunk) {
          const combined = noteText ? `${noteText} ${chunk}` : chunk;
          setNoteText(combined);
          appendLog("NOTE", chunk);
          setStatus({ kind: "note-mode", text: combined });
        }
        return;
      }

      if (NOTE_START_PHRASES.has(normalized)) {
        setNoteMode(true);
        setNoteText("");
        diagnostics.info("voice", "note mode started");
        appendLog("NOTE MODE", "started");
        setStatus({ kind: "note-mode", text: "" });
        return;
      }
      const startWithContent = NOTE_START_WITH_CONTENT_RE.exec(result.transcript);
      if (startWithContent) {
        const initial = startWithContent[1].trim();
        setNoteMode(true);
        setNoteText(initial);
        diagnostics.info("voice", "note mode started", { initial });
        appendLog("NOTE MODE", `started with "${initial}"`);
        setStatus({ kind: "note-mode", text: initial });
        return;
      }

      // Investigation-lifecycle commands — Pause/Resume/New Shoe/End
      // Investigation — checked here, before narration/legacy dispatch,
      // exactly like note-mode phrases above: none of this vocabulary
      // belongs to card entry, and none of it should ever reach
      // parseNarration/parseVoiceCommand (which don't know these words and
      // would just count them as noise).
      if (pendingConfirmation) {
        if (pendingConfirmation.kind === "new-shoe" && normalized === CONFIRM_NEW_SHOE_PHRASE) {
          setPendingConfirmation(null);
          void (async () => {
            await startNewShoe();
            // Fresh, direct re-read — not the closure's own investigation/
            // cardEvents, which still reflect the PRE-new-shoe state at
            // this point (same staleness this file's narration commit path
            // already solves the same way elsewhere): the shoe number just
            // advanced and the ledger now has a fresh (possibly non-zero,
            // e.g. KO) seeded count that only a live re-read can see.
            const fresh = await getInvestigation(investigation.localId);
            const freshEvents = await getCardEventsForInvestigation(investigation.localId);
            if (!fresh) return;
            const freshRound = fresh.rounds[fresh.rounds.length - 1];
            const text = buildNewShoeAnnouncement(fresh, freshEvents, freshRound.shoeNumber);
            diagnostics.info("voice", "new shoe confirmed", { investigationId: investigation.localId, shoeNumber: freshRound.shoeNumber });
            appendLog("ACCEPTED", text);
            setStatus({ kind: "accepted", label: text });
            if (voiceAudioFeedback) speak(text);
            scheduleReset();
          })();
          return;
        }
        if (pendingConfirmation.kind === "end-investigation" && normalized === CONFIRM_END_INVESTIGATION_PHRASE) {
          setPendingConfirmation(null);
          void (async () => {
            await completeInvestigation(investigation.localId);
            diagnostics.info("voice", "end investigation confirmed", { investigationId: investigation.localId });
            appendLog("ACCEPTED", "Investigation ended");
            const text = "Investigation ended.";
            setStatus({ kind: "accepted", label: text });
            if (voiceAudioFeedback) speak(text);
            // Same destination and same forced-full-navigation rule as
            // LiveMenu's End & Review button (see LiveMenu.tsx's
            // handleEndInvestigation) — lands on the just-closed
            // investigation's own review (Reports opened via `?review=1`),
            // never bare home, and a full navigation is required so every
            // consumer (this component included) remounts against the
            // now-closed investigation rather than trusting an in-place
            // refresh().
            window.location.assign(`/investigations/${investigation.localId}/live?review=1`);
          })();
          return;
        }
        // Anything else heard while a confirmation was pending — including
        // a different recognized command — silently drops it rather than
        // ever risking a later, unrelated utterance being misread as
        // confirming something the operator never actually said yes to.
        // Falls through to ordinary processing below for THIS utterance.
        setPendingConfirmation(null);
      }

      if (normalized === PAUSE_PHRASE || normalized === END_COUNT_PHRASE) {
        if (investigation.status !== "active") {
          appendLog("REJECTED", `"${normalized}" — already paused or not active`);
          setStatus({ kind: "disabled", transcript: normalized, reason: "Already paused, or the investigation isn't active" });
          scheduleReset();
          return;
        }
        void pause();
        appendLog("ACCEPTED", "Investigation paused");
        setStatus({ kind: "accepted", label: "Paused" });
        if (voiceAudioFeedback) speak("Investigation paused.");
        scheduleReset();
        return;
      }
      if (normalized === RESUME_PHRASE || normalized === START_COUNT_PHRASE) {
        if (investigation.status !== "paused") {
          appendLog("REJECTED", `"${normalized}" — not currently paused`);
          setStatus({ kind: "disabled", transcript: normalized, reason: "Not currently paused" });
          scheduleReset();
          return;
        }
        void resume();
        appendLog("ACCEPTED", "Investigation resumed");
        setStatus({ kind: "accepted", label: "Resumed" });
        if (voiceAudioFeedback) speak("Investigation resumed.");
        scheduleReset();
        return;
      }
      if (normalized === NEW_SHOE_PHRASE) {
        const shoeHasCards = eventsInShoe(cardEvents, currentRound.shoeNumber).length > 0;
        if (!shoeHasCards) {
          // Nothing recorded in this shoe yet — no evidence to lose, so no
          // confirmation is needed (matches the manual New Shoe button's
          // own confirmation dialog, which likewise only warns when the
          // shoe actually has history to reset).
          void (async () => {
            await startNewShoe();
            const fresh = await getInvestigation(investigation.localId);
            const freshEvents = await getCardEventsForInvestigation(investigation.localId);
            if (!fresh) return;
            const freshRound = fresh.rounds[fresh.rounds.length - 1];
            const text = buildNewShoeAnnouncement(fresh, freshEvents, freshRound.shoeNumber);
            appendLog("ACCEPTED", text);
            setStatus({ kind: "accepted", label: text });
            if (voiceAudioFeedback) speak(text);
            scheduleReset();
          })();
          return;
        }
        // A round that's open but genuinely empty (dealer and every seat
        // have zero cards) has nothing evidentiary to abandon — this is
        // exactly the round Floor's own Done-and-advance (operator-loop
        // correction) leaves behind immediately after finishing a hand, so
        // "Done" then "New Shoe" back to back must not get rejected just
        // because that fresh round's own `completed` flag hasn't been set.
        // `completed` alone is no longer sufficient here; an EMPTY open
        // round is treated the same as a completed one below.
        const roundHasCards =
          currentRound.dealerHand.cards.length > 0 ||
          Object.values(currentRound.seats).some((seat) => seat && seat.playerCards.length > 0);
        if (!currentRound.completed && roundHasCards) {
          // Voice deliberately does not attempt the manual UI's
          // complete-first-vs-void choice (LiveMenu's incomplete-round
          // prompt) — resolving which the operator meant by voice alone
          // would be guessing at something evidentiary. Explain briefly
          // and defer to the manual New Shoe control instead.
          const reason = "The current round isn't complete — finish the hand first, or use the New Shoe button";
          appendLog("REJECTED", `"${normalized}" — ${reason}`);
          setStatus({ kind: "disabled", transcript: normalized, reason });
          if (voiceAudioFeedback) speak("New shoe unavailable. The current round isn't complete.");
          scheduleReset();
          return;
        }
        setPendingConfirmation({ kind: "new-shoe" });
        const text = 'New shoe? Say "confirm new shoe" to proceed.';
        appendLog("ACCEPTED", text);
        setStatus({ kind: "accepted", label: text });
        if (voiceAudioFeedback) speak(text);
        scheduleReset();
        return;
      }
      if (normalized === END_INVESTIGATION_PHRASE) {
        setPendingConfirmation({ kind: "end-investigation" });
        const text = 'End investigation? Say "confirm end investigation" to proceed.';
        appendLog("ACCEPTED", text);
        setStatus({ kind: "accepted", label: text });
        if (voiceAudioFeedback) speak(text);
        scheduleReset();
        return;
      }
      if (normalized === FULL_STATUS_PHRASE) {
        // Read-only, same guarantee as "status"/"count" — always the "all"
        // content level regardless of the operator's configured
        // floorSpokenCountContent setting, since asking for it explicitly
        // by name is itself the request for everything.
        const text = buildStatusAnnouncement(investigation, cardEvents, currentRound.shoeNumber, "all");
        appendLog("ACCEPTED", text);
        setStatus({ kind: "accepted", label: text });
        if (voiceAudioFeedback) speak(text);
        scheduleReset();
        return;
      }

      // NATURAL TABLE CHANGES — "spot 6 sat down" / "player at spot 6" /
      // "spot 1 left" — checked here, before narration/legacy dispatch,
      // exactly like the lifecycle phrases above: this vocabulary
      // ("sat down"/"left") means nothing to parseNarration (which would
      // just count it as noise against a real target, or worse, treat a
      // trailing "left" as a stray word next to a correctly-recognized
      // seat) and nothing to parseVoiceCommand either. See
      // parseTableChangeCommand.ts for the exact grammars recognized.
      const tableChange = parseTableChangeCommand(result.transcript);
      if (tableChange) {
        if (tableChange.kind === "seat-joins") {
          void (async () => {
            // Same tap-parity primitive "seat six"/"spot six" already use
            // (occupySeat) — creates the seat if it wasn't occupied yet and
            // makes it the active target, exactly like a player sitting
            // down becomes who you're watching next; no-ops to a plain
            // select if the seat was already occupied.
            await occupySeat(tableChange.seat);
            const text = `Seat ${tableChange.seat} occupied`;
            diagnostics.info("voice", "table change — seat occupied", { seat: tableChange.seat });
            appendLog("ACCEPTED", text);
            setStatus({ kind: "accepted", label: text });
            if (voiceAudioFeedback) speak(text);
            scheduleReset();
          })();
          return;
        }
        // seat-leaves
        if (!investigation.occupiedSeats.includes(tableChange.seat)) {
          const reason = `Seat ${tableChange.seat} is already empty`;
          appendLog("REJECTED", `"${normalized}" — ${reason}`);
          setStatus({ kind: "disabled", transcript: normalized, reason });
          scheduleReset();
          return;
        }
        void (async () => {
          // Same primitive SeatOptionsSheet's "Mark Empty" button uses —
          // clears the seat's CURRENT round record and occupancy/player-
          // group assignment. Never touches the CardEvent ledger: every
          // card already recorded for this seat, in this round or any
          // earlier one, stays exactly as counted (see markSeatEmpty's own
          // doc comment in investigations.ts) — this is a table-occupancy
          // change, not an undo.
          await markSeatEmpty(tableChange.seat);
          const text = `Seat ${tableChange.seat} left the table`;
          diagnostics.info("voice", "table change — seat left", { seat: tableChange.seat });
          appendLog("ACCEPTED", text);
          setStatus({ kind: "accepted", label: text });
          if (voiceAudioFeedback) speak(text);
          scheduleReset();
        })();
        return;
      }

      // READ-ONLY QUERY LAYER (real-iPhone acceptance fix) — natural
      // questions ("What is the count?", "What's the KO?", "How many
      // aces?", "Repeat") that must NEVER mutate the CardEvent ledger.
      // Deliberately checked here: after the exact-phrase lifecycle
      // commands above (themselves already a bounded, exact-match layer)
      // and BEFORE narration/legacy dispatch — speech -> normalize ->
      // read-only query -> narration/mutation -> otherwise reject. See
      // parseReadOnlyQuery.ts for the full bounded phrase tables; "count"
      // and "status" (and every natural phrasing of the same question) are
      // now ONE intent, both governed by floorSpokenCountContent — "Full
      // Status" above remains the one deliberate "give me everything
      // regardless of the setting" phrase, so there is exactly one way to
      // ask for that, not two.
      const readOnlyQuery = parseReadOnlyQuery(normalized);
      if (readOnlyQuery) {
        if (readOnlyQuery.kind === "repeat") {
          // Audio replay ONLY — never a re-execution of whatever command
          // produced the text (see getLastSpokenText's own doc comment:
          // it's the last thing speak() was actually given, module-level,
          // so this also replays Done's own count announcement even
          // though that speak() call happens inside useRoundControls, a
          // different hook entirely).
          const previous = getLastSpokenText();
          const text = previous ?? "No previous message.";
          appendLog("ACCEPTED", `REPEAT: "${text}"`);
          setStatus({ kind: "accepted", label: text });
          if (voiceAudioFeedback && previous) speak(text);
          scheduleReset();
          return;
        }

        let text: string;
        if (readOnlyQuery.kind === "status") {
          // Exactly "status"'s own pre-existing behavior (see the dispatch
          // "status" case below, now unreachable for these phrases but
          // left as-is): the visual pill always shows a real count —
          // falling back to hiloRc wording when the setting is "off" —
          // but audio only plays when BOTH voiceAudioFeedback and the
          // content setting allow it.
          const spoken =
            floorSpokenCountContent === "off"
              ? null
              : buildStatusAnnouncement(investigation, cardEvents, currentRound.shoeNumber, floorSpokenCountContent);
          text = spoken ?? buildStatusAnnouncement(investigation, cardEvents, currentRound.shoeNumber, "hiloRc");
          appendLog("ACCEPTED", text);
          setStatus({ kind: "accepted", label: text });
          if (voiceAudioFeedback && spoken) speak(spoken);
          scheduleReset();
          return;
        }

        // Every other query kind is an explicit, deliberate question by
        // name — spoken unconditionally whenever voiceAudioFeedback (the
        // master switch) is on, exactly like "Count"/"Full Status" already
        // do; floorSpokenCountContent only trims UNPROMPTED announcements
        // (Done, bare "Status"), never something the operator specifically
        // asked for.
        switch (readOnlyQuery.kind) {
          case "system":
            text = buildSystemAnnouncement(investigation, cardEvents, currentRound.shoeNumber, readOnlyQuery.system);
            break;
          case "rc":
            text = buildSystemAnnouncement(investigation, cardEvents, currentRound.shoeNumber, "Hi-Lo");
            break;
          case "tc":
            text = buildTrueCountAnnouncement(investigation, cardEvents, currentRound.shoeNumber);
            break;
          case "aces":
            text = buildAcesAnnouncement(cardEvents, currentRound.shoeNumber);
            break;
          case "decks":
            text = buildDecksRemainingAnnouncement(investigation, cardEvents, currentRound.shoeNumber);
            break;
        }
        appendLog("ACCEPTED", text);
        setStatus({ kind: "accepted", label: text });
        if (voiceAudioFeedback) speak(text);
        scheduleReset();
        return;
      }

      // Natural hand narration — tried FIRST, above (never replacing) the
      // single-command parser below. "no-opinion" means this utterance
      // contained none of narration's own vocabulary at all (e.g. "count",
      // "banana"), so control falls straight through to the exact same
      // parseVoiceCommand path that already handled every transcript
      // before this feature existed. "reject" means narration recognized
      // SOME structured content but the utterance as a whole is unsafe —
      // that is final; it must never also be offered to the single-command
      // parser for a second opinion.
      const narration = parseNarration(result.transcript);
      if (narration.kind === "reject") {
        diagnostics.info("voice", "narration rejected — ambiguous or unsafe", { transcript: normalized });
        appendLog("REJECTED", `"${normalized}" — narration rejected (ambiguous or unsafe)`);
        setStatus({ kind: "unrecognized", transcript: normalized });
        scheduleReset();
        return;
      }
      if (narration.kind === "ops") {
        // commitNarration preflights the WHOLE op list (synchronously, no
        // writes) before executing anything — see its own doc comment and
        // preflightNarration's. Either everything commits or nothing does;
        // there is no partial-narration outcome. Wrapped in an IIFE rather
        // than making handleFinalResult itself async, since
        // useVoiceRecognition invokes this callback fire-and-forget either
        // way.
        void (async () => {
          const result = await commitNarration(narration.ops);
          if (result.kind === "blocked") {
            diagnostics.info("voice", "narration blocked — preflight validation failed, zero events committed", {
              transcript: normalized,
              reason: result.reason,
            });
            appendLog("REJECTED", `"${normalized}" — ${result.reason}`);
            setStatus({ kind: "disabled", transcript: normalized, reason: result.reason });
            scheduleReset();
            return;
          }
          diagnostics.info("voice", "narration accepted", { transcript: normalized, committed: result.committedCount });
          appendLog("ACCEPTED", result.label);
          setStatus({ kind: "accepted", label: result.label });
          if (voiceAudioFeedback) speak(result.label);
          scheduleReset();
        })();
        return;
      }

      const parsed = parseVoiceCommand(result.transcript);

      if (!parsed.command) {
        diagnostics.info("voice", "rejected — unrecognized speech", { transcript: normalized });
        appendLog("REJECTED", `"${normalized}" — no matching command`);
        setStatus({ kind: "unrecognized", transcript: normalized });
        scheduleReset();
        return;
      }

      const label = dispatch(parsed.command);
      if (label == null) {
        // Recognized correctly — the parser matched a real command — but
        // its control is currently disabled. Never call this "not
        // recognized": that mislabel is exactly what made a correctly-
        // heard "king" look like recognition itself had failed.
        diagnostics.info("voice", "rejected — control currently disabled", {
          transcript: normalized,
          command: parsed.command,
        });
        appendLog("REJECTED", `"${normalized}" — recognized, but that control is currently disabled`);
        setStatus({ kind: "disabled", transcript: normalized });
        scheduleReset();
        return;
      }

      diagnostics.info("voice", "accepted", { transcript: normalized, command: parsed.command });
      appendLog("ACCEPTED", label);
      setStatus({ kind: "accepted", label });
      scheduleReset();
    },
    [
      dispatch,
      commitNarration,
      voiceAudioFeedback,
      floorSpokenCountContent,
      scheduleReset,
      appendLog,
      noteMode,
      noteText,
      investigation,
      currentRound,
      cardEvents,
      pendingConfirmation,
      startNewShoe,
      pause,
      resume,
      refresh,
      occupySeat,
      markSeatEmpty,
    ]
  );

  const handleInterimResult = useCallback(
    (result: VoiceResult) => {
      appendLog("INTERIM", `"${result.transcript}" (confidence: ${formatConfidence(result.confidence)})`);
      if (noteMode) {
        // Keeps the note-mode indicator (and a live preview of what's
        // being captured) visible through in-progress speech, instead of
        // flashing back to the generic "Listening…" pill and losing the
        // "you're dictating a note" context until the next final result.
        setStatus({ kind: "note-mode", text: noteText ? `${noteText} ${result.transcript}` : result.transcript });
        return;
      }
      setStatus({ kind: "listening", transcript: result.transcript });
    },
    [appendLog, noteMode, noteText]
  );

  const handleError = useCallback(
    (error: string) => {
      appendLog("ERROR", `${error} — ${describeError(error)}`);
      if (error === "network-unavailable") {
        // Persistent, not a fading toast — see `voiceUnavailable`'s own
        // comment. Voice mode is already off by the time this fires
        // (useVoiceRecognition sets `listening` false first); nothing here
        // touches card entry, the ledger, or any investigation state.
        setVoiceUnavailable(true);
        diagnostics.info("voice", "voice unavailable — network exhausted, continuous listening stopped");
        return;
      }
      setStatus({ kind: "error", message: `${describeError(error)} (${error})` });
      scheduleReset();
    },
    [scheduleReset, appendLog]
  );

  const handleLifecycleEvent = useCallback(
    (event: VoiceLifecycleEvent) => {
      appendLog(LIFECYCLE_LABEL[event]);
    },
    [appendLog]
  );

  const { listening, start, stop, suppressForSpeech, resumeAfterSpeech } = useVoiceRecognition({
    onFinalResult: handleFinalResult,
    onInterimResult: handleInterimResult,
    onError: handleError,
    onLifecycleEvent: handleLifecycleEvent,
    timeoutMs: 8000,
    maxAlternatives: 5,
  });

  useEffect(() => {
    listeningRef.current = listening;
  }, [listening]);

  // TTS self-hearing protection: every spoken confirmation anywhere in the
  // app (Count, Status, Done's completion summary, Undo, narration
  // confirmations, the lifecycle commands below) goes through the single
  // `speak()` in lib/voice/speechOutput.ts, which fires these two
  // module-level events around every utterance — subscribing once here
  // suppresses THIS component's own recognition session for the duration,
  // so "Hi-Lo minus three" spoken back through the headset can never be
  // re-transcribed as if the operator had said it. `listening` itself
  // never flips false for this — see suppressForSpeech's own doc comment.
  useEffect(() => {
    const unsubscribeStart = onSpeechStart(suppressForSpeech);
    const unsubscribeEnd = onSpeechEnd(resumeAfterSpeech);
    return () => {
      unsubscribeStart();
      unsubscribeEnd();
    };
  }, [suppressForSpeech, resumeAfterSpeech]);

  // Real-device field reports (the "was Done's count actually spoken?"
  // acceptance issue) showed the recognition-side diagnostics log alone
  // didn't prove speech OUTPUT actually happened. Subscribes to every
  // speak()/skip event from the single funnel in speechOutput.ts — this
  // covers useRoundControls' handleDone/handleUndo too, not just this
  // component's own Count/Status/New Shoe/End Investigation announcements
  // — and funnels them into the SAME Debug log every other diagnostic
  // entry already uses. Debug-only: never touches the ordinary status pill.
  useEffect(() => {
    return onSpeechDiagnostic((event) => {
      switch (event.kind) {
        case "speak":
          appendLog("SPEAK", `"${event.text}"`);
          break;
        case "speak-end":
          appendLog("SPEAK END", `"${event.text}"`);
          break;
        case "speak-error":
          appendLog("SPEAK ERROR", `"${event.text}"`);
          break;
        case "speak-unsupported":
          appendLog("SPEAK UNSUPPORTED", `"${event.text}" — speech synthesis unavailable`);
          break;
        case "speak-skipped":
          appendLog("SPEAK SKIPPED", event.reason);
          break;
      }
    });
  }, [appendLog]);

  // Dealer bust headset feedback: bust is never a separate operator
  // command — it's derived, exactly like DealerTile's own on-screen
  // display, from whatever cards are already recorded on the dealer's hand
  // (computeHandTotal, the same pure function, over currentRound.dealerHand
  // .cards — never a second bust concept, and this effect never calls
  // addCard/completeRound/mutate anything itself). `dealerBustRef` is
  // seeded from the ACTUAL bust state at mount/round-change (not a
  // hardcoded `false`) specifically so reloading mid-round into an
  // already-busted hand does not itself read as a fresh transition and
  // announce again — only a LIVE not-busted -> busted change, witnessed by
  // this effect actually running with a changed value, ever speaks.
  // Keyed by round id: a new round always starts this tracking over, and
  // Undo removing the busting card flips `dealerBust` back to false (see
  // useRoundControls' handleUndo, which reads through this same derived
  // total), so a later re-bust of the SAME round announces again exactly
  // once, never silently suppressed and never repeated on an unrelated
  // render.
  const dealerBust = computeHandTotal(currentRound.dealerHand.cards).bust;
  const dealerBustRef = useRef<{ roundId: string; wasBust: boolean }>({
    roundId: currentRound.id,
    wasBust: dealerBust,
  });
  useEffect(() => {
    const prev = dealerBustRef.current;
    const wasBustBefore = prev.roundId === currentRound.id ? prev.wasBust : false;
    if (dealerBust && !wasBustBefore) {
      diagnostics.info("voice", "dealer bust detected", { roundId: currentRound.id });
      appendLog("DEALER BUST", `Round ${currentRound.id}`);
      if (voiceAudioFeedback) speak("Dealer bust.");
    }
    dealerBustRef.current = { roundId: currentRound.id, wasBust: dealerBust };
  }, [dealerBust, currentRound.id, voiceAudioFeedback, appendLog]);

  function handleToggle() {
    if (listening) {
      stop();
      // A deliberate full stop also ends any in-progress note dictation —
      // continuous listening itself is what's being turned off, so there's
      // no "command mode" left to return to. The partial note isn't saved
      // (only "end note" saves); this mirrors walking away mid-sentence.
      setNoteMode(false);
      setNoteText("");
      return;
    }
    setVoiceUnavailable(false);
    setStatus({ kind: "listening", transcript: "" });
    start();
  }

  function handleRetryVoice() {
    setVoiceUnavailable(false);
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

  // Offline-first: voice degrading never disables the investigation — the
  // manual keypad, round controls, and every other live-screen control are
  // completely untouched by this. This replaces the mic button itself
  // (rather than a fading status pill) precisely because it must stay
  // visible and unambiguous, not disappear after a couple of seconds the
  // way an ordinary rejected/accepted command does — "tap to retry" is the
  // one deliberate way back in, never an automatic background retry.
  if (voiceUnavailable) {
    return (
      <button
        type="button"
        onClick={handleRetryVoice}
        role="status"
        className="fixed bottom-4 right-4 z-20 max-w-[220px] rounded-xl border border-pending/40 bg-surface px-3 py-2 text-left text-xs text-pending shadow-lg"
      >
        <p className="font-semibold">🔇 Voice unavailable — offline</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          No network for speech recognition. The investigation is unaffected — tap to retry.
        </p>
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-20 flex flex-col items-end gap-2">
      {diagnosticsOpen && <VoiceDiagnosticsPanel entries={log} />}

      {status.kind !== "idle" && (
        <div role="status" className="max-w-[220px] rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-lg">
          {status.kind === "listening" && (
            <p className="text-accent-secondary">
              Listening… <span className="text-foreground">{status.transcript || "…"}</span>
            </p>
          )}
          {status.kind === "accepted" && <p className="font-semibold text-status-green">✓ {status.label}</p>}
          {status.kind === "unrecognized" && (
            <p className="font-semibold text-pending">✗ Not recognized: “{status.transcript || "…"}”</p>
          )}
          {status.kind === "disabled" && (
            <p className="font-semibold text-pending">
              Heard “{status.transcript || "…"}” — {status.reason ?? "that action isn’t available right now"}
            </p>
          )}
          {status.kind === "note-mode" && (
            <div>
              <p className="font-semibold text-accent-secondary">📝 Note mode — say “end note” to save</p>
              {status.text && <p className="mt-1 break-words text-foreground">{status.text}</p>}
            </div>
          )}
          {status.kind === "error" && <p className="font-semibold text-destructive">{status.message}</p>}
        </div>
      )}

      {log.length > 0 && (
        <button
          type="button"
          onClick={() => setDiagnosticsOpen((v) => !v)}
          aria-label={diagnosticsOpen ? "Hide Voice Diagnostics" : "Show Voice Diagnostics"}
          aria-pressed={diagnosticsOpen}
          className={`tap-target flex items-center gap-1 rounded-full border px-2.5 text-[10px] font-medium ${
            diagnosticsOpen
              ? "border-accent bg-accent/15 text-accent"
              : "border-border bg-surface-raised text-muted-foreground"
          }`}
        >
          <Bug className="h-3 w-3" aria-hidden /> Debug
        </button>
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
