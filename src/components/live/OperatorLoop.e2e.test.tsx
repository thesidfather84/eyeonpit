// @vitest-environment jsdom
//
// Operator-loop milestone (+ its final correction), requirement #24: a
// single end-to-end test that walks the REAL core loop start to finish —
// Floor start, natural voice narration across four targets in one hand,
// Done (which in Floor completes AND immediately starts the next hand, no
// separate "Next"), a second hand entered immediately with no intervening
// step, a read-only Status check, New Shoe with confirmation, a live Floor
// <-> Surveillance consistency check, and End & Review (landing on that
// same investigation's own review, not bare home) — through the actual
// production components (FloorScreen, LiveScreen, VoiceControl) and the
// actual repository/ledger/count-engine code, exactly as VoiceControl.test.tsx
// and FloorScreen.test.tsx already do for their own narrower slices. Nothing
// here mocks away CardEvent semantics, the count engine, or the narration
// parser — only the browser's SpeechRecognition/SpeechSynthesis constructors
// (and next/navigation's useSearchParams, which jsdom has no router for) are
// stubbed.
//
// One deliberate sequencing choice vs. the milestone's prose script: "New
// Shoe" is spoken after the second hand's own Done, not mid-hand. This
// matches real casino practice (a shuffle happens between hands, never
// mid-hand) and matches this codebase's own product decision (see
// VoiceControl.tsx's commitNarration/new-shoe handling): voice New Shoe
// deliberately rejects an OPEN round that still has cards in it and defers
// to the manual menu rather than guessing whether to void or complete it
// first. An open round with nothing in it (exactly what Floor's own
// Done-and-advance leaves behind) is a different, safe case — see
// VoiceControl.tsx's `roundHasCards` check — and is exactly what this test
// exercises, since that's genuinely what "Done -> immediately talk next hand
// -> Done -> New Shoe" produces.
import { act, render, screen, waitFor as rtlWaitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvestigationProvider, useInvestigationContext } from "@/contexts/InvestigationContext";
import { LockProvider } from "@/contexts/LockContext";
import { EntryLockProvider } from "@/contexts/EntryLockContext";
import { createInvestigation, getInvestigation } from "@/lib/db/repositories/investigations";
import { getCardEventsForInvestigation } from "@/lib/db/repositories/cardEvents";
import { eventsInShoe } from "@/lib/counting-engine/ledger";
import { FloorScreen } from "./FloorScreen";
import { LiveScreen } from "./LiveScreen";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * This test drives many real, sequential Dexie round-trips (occupySeat,
 * addCard, completeRound, advanceRound, completeInvestigation...) through
 * the full FloorScreen + LiveScreen + VoiceControl tree at once — under
 * the full suite's parallel worker load, that chain can comfortably exceed
 * @testing-library's default 1000ms waitFor timeout even though nothing is
 * actually stuck (confirmed by running this file alone, repeatedly, with
 * no failures). A local, longer default here trades a slower failure mode
 * for not flaking on CI load, without masking a genuine hang — an actually
 * broken step still fails, just after 5s instead of 1s.
 */
function waitFor<T>(callback: () => T | Promise<T>): Promise<T> {
  return rtlWaitFor(callback, { timeout: 5000 });
}

class MockSpeechRecognition {
  static instances: MockSpeechRecognition[] = [];
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  lang = "";
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;
  onaudiostart: (() => void) | null = null;
  onsoundstart: (() => void) | null = null;
  onspeechstart: (() => void) | null = null;
  onspeechend: (() => void) | null = null;
  onsoundend: (() => void) | null = null;
  onaudioend: (() => void) | null = null;

  constructor() {
    MockSpeechRecognition.instances.push(this);
  }
  start() {
    this.onstart?.();
  }
  stop() {
    this.onend?.();
  }
  abort() {
    this.onend?.();
  }

  static latest(): MockSpeechRecognition {
    const instance = MockSpeechRecognition.instances[MockSpeechRecognition.instances.length - 1];
    if (!instance) throw new Error("No MockSpeechRecognition instance was created — was the mic button clicked?");
    return instance;
  }

  static reset() {
    MockSpeechRecognition.instances = [];
  }
}

class MockSpeechSynthesisUtterance {
  lang = "";
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

let spokenUtterances: string[] = [];
const mockSpeechSynthesis = {
  cancel: () => {},
  speak: (u: MockSpeechSynthesisUtterance) => {
    spokenUtterances.push(u.text);
    u.onend?.();
  },
};

function makeResultEvent(transcript: string) {
  const alt = { transcript, confidence: 0.9 };
  const result = { isFinal: true, length: 1, 0: alt };
  const results = { length: 1, 0: result };
  return { resultIndex: 0, results };
}

/** Speaks one final utterance, exactly as a real recognizer would deliver a completed phrase. */
function say(transcript: string) {
  MockSpeechRecognition.latest().onresult?.(makeResultEvent(transcript));
}

/** See VoiceControl.test.tsx's own awaitRestartFrom — continuous listening ends and auto-restarts its native session after every final result; the next `say()` must wait for that fresh instance. */
async function awaitRestart(previousInstanceCount: number) {
  await waitFor(() => expect(MockSpeechRecognition.instances.length).toBeGreaterThan(previousInstanceCount));
}

/**
 * Narration commits run as fire-and-forget async work inside
 * VoiceControl.handleFinalResult (see its own doc comment: "wrapped in an
 * IIFE rather than making handleFinalResult itself async, since
 * useVoiceRecognition invokes this callback fire-and-forget either way") —
 * the native session restart this test's other helper waits on fires
 * independently of that commit actually finishing. Driving two narrations
 * back to back off the restart alone races the first one's Dexie write, so
 * every multi-step narration in this test instead waits for its own
 * on-screen confirmation text first (proof the commit resolved), then for
 * the restart, before the next utterance is spoken.
 */
async function narrateAndAwaitConfirmation(transcript: string, confirmationRegex: RegExp) {
  const before = MockSpeechRecognition.instances.length;
  await act(async () => say(transcript));
  await waitFor(() => screen.getByText(confirmationRegex));
  await awaitRestart(before);
}

async function sayAndAwaitRestart(transcript: string) {
  const before = MockSpeechRecognition.instances.length;
  await act(async () => say(transcript));
  await awaitRestart(before);
}

beforeEach(() => {
  MockSpeechRecognition.reset();
  spokenUtterances = [];
  (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition = MockSpeechRecognition;
  (window as unknown as { speechSynthesis?: unknown }).speechSynthesis = mockSpeechSynthesis;
  (window as unknown as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance =
    MockSpeechSynthesisUtterance;
});

afterEach(() => {
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
  delete (window as unknown as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance;
});

async function freshInvestigationId(): Promise<string> {
  const inv = await createInvestigation({
    casino: "",
    tableNumber: "",
    dealerName: "",
    investigationDate: "2026-08-10",
    operatorName: "",
    countingSystem: "Hi-Lo",
    shoeTotalDecks: 6,
    status: "active",
  });
  return inv.localId;
}

function RoundProbe() {
  const { investigation } = useInvestigationContext();
  const round = investigation.rounds[investigation.rounds.length - 1];
  return (
    <div>
      <div data-testid="round-count">{investigation.rounds.length}</div>
      <div data-testid="round-completed">{String(round.completed)}</div>
      <div data-testid="shoe-number">{round.shoeNumber}</div>
      <div data-testid="investigation-status">{investigation.status}</div>
      <div data-testid="dealer-card-count">{round.dealerHand.cards.length}</div>
    </div>
  );
}

describe("Operator loop, end to end (requirement #24) — Floor start through End & Review, real production primitives throughout", () => {
  it("open Floor -> narrate a full hand across dealer + 3 seats -> Done -> next hand -> Status (read-only) -> New Shoe + confirm -> Floor/Surveillance stay in sync -> End & Review, with every CardEvent preserved throughout", async () => {
    const investigationId = await freshInvestigationId();

    // FLOOR START — a valid investigation opens directly into Floor, with
    // Surveillance mounted alongside from the very first render (rather than
    // a literal in-test route navigation) so every subsequent assertion can
    // prove "one investigation, one ledger, two views" (requirement #21)
    // continuously, not just as a final one-off check.
    render(
      <LockProvider>
        <EntryLockProvider>
          <InvestigationProvider investigationId={investigationId}>
            <div data-testid="floor-pane">
              <FloorScreen />
            </div>
            <div data-testid="surveillance-pane">
              <LiveScreen />
            </div>
            <RoundProbe />
          </InvestigationProvider>
        </EntryLockProvider>
      </LockProvider>
    );

    const floorPane = await screen.findByTestId("floor-pane");
    await within(floorPane).findByText("FLOOR");
    await waitFor(() => expect(screen.getByTestId("investigation-status").textContent).toBe("active"));

    // VOICE-FIRST FLOOR OPERATION + CONTEXTUAL CARD ENTRY (requirements #2, #3)
    // — natural narration, no rigid syntax, "Player N" establishing a target
    // that plain card words then keep applying to. Each sentence spoken as
    // its own utterance, matching how an operator would actually pause
    // between them at the table.
    const micButton = await within(floorPane).findByRole("button", { name: "Start voice command" });
    await act(async () => micButton.click());

    await narrateAndAwaitConfirmation("dealer king five", /✓ DEALER: K 5/);
    // "player" = seat prefix synonym; each unoccupied seat is occupied by
    // its own narration, exactly like tapping the seat tile would.
    await narrateAndAwaitConfirmation("player one seven three", /✓ S1: 7 3/);
    await narrateAndAwaitConfirmation("player two ace king", /✓ S2: A K/);
    await narrateAndAwaitConfirmation("player three five six", /✓ S3: 5 6/);

    // VISUAL CONFIRMATION (requirement #4) — the compact play field reflects
    // exactly what was heard, close to each target's own label. Cards for a
    // target render as one joined string (stored rank, not the spoken face
    // word — "10", not "K"), so each assertion matches that joined form.
    const field = await within(floorPane).findByTestId("floor-play-field");
    within(within(field).getByTestId("floor-dealer")).getByText("10 5");
    within(within(field).getByTestId("floor-seat-1")).getByText("7 3");
    within(within(field).getByTestId("floor-seat-2")).getByText("A 10");
    within(within(field).getByTestId("floor-seat-3")).getByText("5 6");

    // Hi-Lo by hand: K(-1) 5(+1) 7(0) 3(+1) A(-1) K(-1) 5(+1) 6(+1) = +1.
    await waitFor(() => expect(screen.getAllByLabelText("HI-LO running count")[0].textContent).toBe("+1"));

    // DONE — FLOOR SEMANTICS, CORRECTED (requirement #7 + the operator-loop
    // correction): in Floor, Done completes the hand AND immediately starts
    // the next round in one step — no separate "Next"/"New Hand" required
    // for normal play. Audited via useRoundControls' floorMode branch,
    // which drives the SAME existing completeRoundAndAdvance() primitive
    // the (previously unused) "Complete Round button" was always meant to
    // call — this is a single atomic operation, so the round-count and
    // round-completed transition below is observed as one settled state,
    // never an intermediate "locked, waiting for Next" one.
    const roundsBeforeDone = Number(screen.getByTestId("round-count").textContent);
    await sayAndAwaitRestart("done");
    // Exactly one new round exists — proof against a duplicate/double
    // advance, not just "a round was created."
    await waitFor(() => expect(Number(screen.getByTestId("round-count").textContent)).toBe(roundsBeforeDone + 1));
    expect(screen.getByTestId("round-completed").textContent).toBe("false"); // already the FRESH round — ready for entry, nothing left for Next to do here
    await within(floorPane).findByText("✓ Done");
    // The count itself is SPOKEN after Done (default Floor setting: Hi-Lo
    // RC only) — and it's the count for the hand that JUST completed, not
    // a reset/new-round value: advancing to a new round in the same shoe
    // never touches the CardEvent ledger, so this is the same +1 the
    // narration above already produced.
    await waitFor(() => expect(spokenUtterances.at(-1)).toBe("Hi-Lo +1."));

    const eventsAfterHand1 = await getCardEventsForInvestigation(investigationId);
    expect(eventsAfterHand1).toHaveLength(8);

    // IMMEDIATELY TALK NEXT HAND — no "Next"/"New Hand" spoken here at all;
    // the acceptance test's whole point is that none is needed.
    await narrateAndAwaitConfirmation("dealer nine", /✓ DEALER: 9/); // Hi-Lo +0, RC stays +1
    await waitFor(() => expect(screen.getAllByLabelText("HI-LO running count")[0].textContent).toBe("+1"));
    // The status pill's own confirmation text (waited on above) proves the
    // Dexie write landed, but not that InvestigationContext's own
    // investigation/currentRound state — what VoiceControl's next dispatch
    // actually reads canCompleteRound against — has finished
    // re-rendering through this same probe. Waiting on that directly here
    // (rather than assuming the two settle together) is what makes the
    // following "done" reliable under heavy parallel test-suite load.
    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("1"));
    const roundsBeforeDone2 = Number(screen.getByTestId("round-count").textContent);
    await sayAndAwaitRestart("done");
    await waitFor(() => expect(Number(screen.getByTestId("round-count").textContent)).toBe(roundsBeforeDone2 + 1));
    expect(screen.getByTestId("round-completed").textContent).toBe("false");
    await waitFor(() => expect(spokenUtterances.at(-1)).toBe("Hi-Lo +1.")); // hand 2 alone was net 0 (a lone 9) — RC unchanged, still the completed-hand value, not a stale/reset one

    // STATUS (requirement #9) — read-only, never changes the investigation.
    // Hand 2 has already auto-advanced into hand 3's fresh, empty round —
    // proves Status never nudges the round/workflow state either.
    const roundsBeforeStatus = Number(screen.getByTestId("round-count").textContent);
    const eventsBeforeStatus = await getCardEventsForInvestigation(investigationId);
    await sayAndAwaitRestart("status");
    await within(floorPane).findByText(/Hi-Lo \+1\./);
    expect(Number(screen.getByTestId("round-count").textContent)).toBe(roundsBeforeStatus);
    expect(screen.getByTestId("round-completed").textContent).toBe("false");
    expect(await getCardEventsForInvestigation(investigationId)).toHaveLength(eventsBeforeStatus.length);

    // NEW SHOE (requirement #12) — the current round (hand 3, just
    // auto-created by hand 2's Done) is open but genuinely empty; the
    // SHOE still has hand 1 + hand 2's evidence, so this still requires
    // "confirm new shoe" — an empty open round is safe to fold into that
    // same confirmation rather than being rejected as "incomplete" (see
    // VoiceControl.tsx's `roundHasCards` check, part of this correction).
    await sayAndAwaitRestart("new shoe");
    await within(floorPane).findByText(/confirm new shoe/);
    expect(screen.getByTestId("shoe-number").textContent).toBe("1"); // unchanged — only a pending confirmation exists so far

    await sayAndAwaitRestart("confirm new shoe");
    await waitFor(() => expect(screen.getByTestId("shoe-number").textContent).toBe("2"));
    await within(floorPane).findByText(/Shoe 2 started\. Hi-Lo 0\./); // Hi-Lo's IRC is 0 — a genuinely fresh count, not a leftover carry
    await waitFor(() => expect(screen.getAllByLabelText("HI-LO running count")[0].textContent).toBe("0"));

    // Prior-shoe evidence must never be deleted by New Shoe.
    const eventsAfterNewShoe = await getCardEventsForInvestigation(investigationId);
    const shoe1Events = eventsInShoe(eventsAfterNewShoe, 1);
    expect(shoe1Events).toHaveLength(9); // 8 from hand 1 + 1 (the dealer 9) from hand 2
    expect(eventsInShoe(eventsAfterNewShoe, 2)).toHaveLength(0); // the new shoe itself starts with zero events

    // FLOOR <-> SURVEILLANCE (requirement #21) — same investigation, same
    // ledger, two views; Surveillance's own header count must show the
    // exact same post-New-Shoe count Floor does, continuously, not just
    // once at the end.
    const surveillancePane = screen.getByTestId("surveillance-pane");
    await waitFor(() =>
      expect(within(surveillancePane).getByLabelText("HI-LO running count").textContent).toBe("0")
    );

    // END & REVIEW (requirement #17 + the operator-loop correction) — voice
    // "end investigation" never finalizes on a single recognition result;
    // it requires the explicit "confirm end investigation" phrase. Once
    // confirmed, EyeOnPit must navigate to THAT investigation's own review
    // (Reports opened via ?review=1), never bare home — see
    // EndReview.test.tsx for what that destination itself renders; jsdom
    // has no real router to actually follow window.location.assign, so the
    // proof here is the exact URL targeted.
    const assignSpy = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, pathname: `/investigations/${investigationId}/floor`, assign: assignSpy },
    });

    try {
      await sayAndAwaitRestart("end investigation");
      await within(floorPane).findByText(/confirm end investigation/);
      expect(screen.getByTestId("investigation-status").textContent).toBe("active"); // still active — nothing closed on the bare phrase alone

      await act(async () => say("confirm end investigation"));
      await waitFor(async () => {
        const closed = await getInvestigation(investigationId);
        expect(closed!.status).toBe("closed");
      });
      expect(assignSpy).toHaveBeenCalledTimes(1);
      expect(assignSpy).toHaveBeenCalledWith(`/investigations/${investigationId}/live?review=1`);
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
    }

    // INVESTIGATION REVIEW / evidence preservation (requirement #18) — every
    // CardEvent from both shoes survives closing the investigation; ending
    // an investigation is a status change, never a deletion. Same
    // investigation ID throughout — never a different/new investigation.
    const eventsAfterClose = await getCardEventsForInvestigation(investigationId);
    expect(eventsAfterClose).toHaveLength(eventsAfterNewShoe.length);
    expect(eventsInShoe(eventsAfterClose, 1)).toHaveLength(9);
    const closedInvestigation = await getInvestigation(investigationId);
    expect(closedInvestigation!.localId).toBe(investigationId);
  }, 20000); // see the local waitFor's own doc comment — this walks many real, sequential Dexie round-trips, which can run past vitest's default 5s test timeout under full-suite parallel load
});
