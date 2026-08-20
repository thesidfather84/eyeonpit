# EyeOnPit — PC Voice Field Test #2 Remediation

**Status: implemented and tested, pending review.** This document records
the root causes found in PC Voice Field Test #2 and the remediation built
against them. Per explicit instruction, this work did not modify CardEvent
ledger semantics, counting mathematics, simulation mathematics, the 1.9
investigation lifecycle, or the global Spot terminology rule (it completed
that rule's enforcement in two places it had missed, described in §11) —
and started no unrelated feature work. All 1.9 lifecycle tests pass
unchanged.

---

## 1. Safety principle (unchanged, load-bearing)

> If interpretation is genuinely ambiguous, reject. If a recurring ASR
> error can be recovered using narrow casino grammar, recover it and log
> exactly why.

Every extension below is a **narrow, closed grammar rule** — a specific
word, a specific lookahead, a specific sentence shape — never a fuzzy or
statistical matcher. Nothing here changes what a CardEvent *is* or how
counting math works; every change is about which spoken utterances are
recognized as a command in the first place, and how clearly a *rejected*
one is explained.

## 2. Root causes found

Every real Field Test #2 finding traced to one of four categories:

1. **Missing ASR-artifact vocabulary** — Chrome's specific mishearings of
   "player" ("play your"/"play are"/"play Air"/"play everyone") and of
   "and" ("in") were not yet in the narrow substitution tables that already
   handle "seat"→"set"/"seet"/etc. Same category of fix as every prior
   field-test round, just more instances of it.
2. **Grammar shapes not yet supported** — natural sentence structures
   (target trailing a verb phrase: "player sat down at spot one"; third-
   person action verbs: "spot one stands"; a live active target implied
   but not restated: "has a ten and a three") had no parser path at all,
   independent of any ASR mishearing.
3. **Correct rejections with unhelpful explanations** — CONTROL_DISABLED
   cases ("Start count" while already active, "Next hand" while the round
   wasn't complete) were legitimate refusals with a generic "not available
   right now" message instead of the truthful, specific reason.
4. **A real, narrow safety gap** — a glued 2+-digit ASR artifact ("55"
   from "3:55") could decompose into two extra cards once a target was
   already established, because the multi-card-no-target guard that
   protected the *unscoped* case didn't extend to the *scoped* one. Closed
   in §10.

No category required loosening the core safety rules (uncertainty-
language hard rejection, the noise-token cap, "never guess between two
targets," "never partially commit a narration") — every extension adds
recognition of a specific new *safe* shape, or adds an explicit, narrow
exception proven safe by construction (see §5's `allowUnscopedContinuation`
flag).

## 3. Player ASR recovery (PRIORITY 1)

`lib/voice/parseVoiceCommand.ts`'s `normalizeAsrSeatArtifacts` gained three
new narrow, lookahead-guarded rules, alongside the existing "play"→"player"
before a bare seat number:

- `PLAY_FILLER_WORDS` = `your`/`are`/`air`/`everyone`, immediately before a
  seat NUMBER — `"play your 7"` → `"player 7"`. `"play your favorite song"`
  is untouched (no seat number follows).
- `"play your"` immediately before a full seat-**prefix** phrase (not just
  a bare number) — `"play your spot one left"` → `"player spot one left"`,
  which the existing stacked-prefix grammar (`matchSeatTargetPhrase`) then
  resolves normally.
- `"play"` immediately before `"sat"` — `"play sat down on spot one"` →
  `"player sat down on spot one"`, feeding the new trailing-target
  table-change shape (§6).

No global "play"→"player" substitution exists anywhere — every rule
requires the specific word(s) that follow, exactly the existing
"play"/"start"/"set" discipline.

## 4. Multi-card dealer confusion recovery (PRIORITY 2)

`classifyVoiceTranscript.ts`'s `recoverDealerConfusionCore` — previously
single-card only — now collects an **ordered list** of ranks after the
confusion token + connector, tolerating `"and"` between them exactly like
`"a"`/`"an"`/`"the"` already were. "Spotify has a five and a king" →
`DEALER 5, K`, two cards in spoken order. Every existing safety condition
still applies to the WHOLE transcript unconditionally: the confusion token
must still be first, a seat-prefix word or `"dealer"` anywhere still
aborts the recovery entirely, uncertainty language still hard-rejects.
Committed via the exact same transactional `commitNarration` path ordinary
narration uses (see §12), not a second commit mechanism.

## 5. Active-target continuation (PRIORITY 3)

`parseNarration.ts` gained an explicit, caller-supplied
`{ allowUnscopedContinuation?: boolean }` option — the **one** deliberate
exception to this module's "pure function of the transcript text alone"
rule, and it works exactly like the pre-existing
`allowDealerConfusionRecovery` flag on `classifyVoiceTranscript`: an
explicit input, never an implicit read of global state, so the function
stays fully deterministic given its complete inputs. VoiceControl always
passes `true` (there is always a live active target once mounted).

Two rules relax under this flag, and **only** together with genuine
connector-word evidence (`sawUnscopedConnector` — see §7):

- Hand-connector words ("has"/"and"/"gets"/...) are tolerated even with no
  target named in *this* utterance.
- Two or more unscoped ranks are no longer automatically ambiguous.

**Critically, `"king ace"` (two bare adjacent card words, zero connector
grammar) still rejects even with the flag on** — the relaxation is gated
on `sawUnscopedConnector`, not the flag alone, which is what keeps this
from silently reopening the exact ambiguity the original single-card
"Team 5" rule was built to close. Every unscoped card produced this way
still resolves against whatever the live active target actually is, and
is still rejected at COMMIT time (`resolveCardEntryTarget`) if that target
turns out not to be usable — the flag only ever affects whether the PARSE
is attempted, never whether the eventual write is safe.

## 6. Connector ASR variants + table-change grammar (PRIORITIES 4 & 7)

- `"in"` added to `HAND_CONNECTOR_WORDS` (ASR mishearing of `"and"` —
  `"has a 10 in a 3"`), gated identically to every other connector.
  `"and the"` and `"as a"` needed no new code: `"and"`/`"as"` were already
  connectors and `"the"`/`"a"` were already unconditional filler.
- `parseTableChangeCommand.ts` gained a **second grammar shape** — the
  target trailing a verb phrase instead of leading it: `"[new/a] player
  sat down at/on <target>"`. Requires the literal word `"player"` to
  anchor it; a bare `"sat down at spot one"` with no player-word anchor is
  never guessed at.
- An optional leading `"new "`/`"a "` filler is now stripped ahead of the
  existing target-first grammar too — `"new player at spot six"` now
  resolves exactly like `"player at spot six"` always did.

## 7. Compound narration (PRIORITY 5)

The compound-narration **architecture already existed** — `parseNarration`
already produces an ordered `NarrationOp[]` list, and `commitNarration`
(VoiceControl.tsx) already preflights the WHOLE list synchronously before
committing anything, all-or-nothing, through the exact same primitives a
single spoken card uses. The real gap was narrower: `INERT_ACTION_WORDS`
only recognized the imperative verb forms (`"stand"`/`"hit"`/...), not the
natural third-person narration an operator actually says (`"spot one
stands"`, `"spot three hits"`). Added the inflected forms (`stands`,
`hits`, `doubles`, `splits`, `surrenders`) — same permanently-inert
semantics (§ parseNarration.ts's own `INERT_ACTION_WORDS` doc comment:
"another card entered is an implicit hit, ending entry is an implicit
stand"), recognizing more of the same vocabulary, not adding new mutation
behavior. `"Dealer gets a five next hand"` already worked before this
round — verified with a permanent regression test (§13).

## 8. Natural target-setting intent (PRIORITY 6)

New file `lib/voice/parseSetActiveTargetIntent.ts` — a small, closed-grammar
parser (architecture mirrors `parseTableChangeCommand.ts`) recognizing a
fixed list of leading phrases (`"current player is "`, `"current spot is
"`, `"current seat is "`, `"player is at "`, `"i am on "`, `"i'm on "`,
`"im on "`, `"watching "`) immediately followed by a clean, complete target
phrase with nothing left over. Sets the active target through the exact
same `selectTarget` narration op a bare `"spot one"` already produces —
**never creates a CardEvent.** Checked in the same ordered position in
both `classifyVoiceTranscript.ts`'s `classifyCore` and VoiceControl's own
re-parse chain: after table-change/read-only-query, before narration.

## 9. CONTROL_DISABLED root causes (PRIORITY 8)

Both real reports investigated — **the state logic was correct in every
case; the gap was entirely in operator feedback.**

- **"Start count" while already active** → correctly parses as Resume,
  correctly refused (Resume only makes sense from `"paused"`). Old
  message: `"Not currently paused"`. New: `"Count is already running —
  nothing to resume"` — names the actual situation, not the internal
  concept of "paused."
- **"Next hand" while the round wasn't complete** → correctly parses as
  Done (`WORKFLOW_WORDS["next hand"] = "done"`), correctly gated by
  `canCompleteRound`. The REAL bug: `dispatch()` returned bare `null` for
  every disabled legacy command (done/next/undo/card), so the generic
  handler had nothing but `"that action isn't available right now"` to
  show. New `explainControlDisabledReason` recomputes the SAME disabled
  state `dispatch` already checked — purely to describe it, never a second
  source of truth for whether the action is allowed — and returns the
  specific reason (e.g. `"Dealer cards pending — enter cards or declare a
  round exception"`, reusing `canCompleteRound`'s own reasons array).

This closes the gap for every legacy single-command disablement (done,
next, undo, card entry via active or explicit target) and for Pause's own
message (now distinguishes "already paused" from "investigation isn't
active"). The dealer-confusion-recovery and set-active-target paths (§4,
§8) get equally specific reasons for free, since both now commit through
`commitNarration`, which already carries `preflightNarration`'s own
specific blocked-reason text.

## 10. Numeric/time safety (PRIORITY 10)

New `containsTimeOrFractionPattern` (`parseVoiceCommand.ts`) detects a
clock-time (`\d{1,2}:\d{2}`) or fraction (`\d{1,2}/\d{1,2}`) shape in the
**raw** transcript, before `normalizeTranscript` strips the `:`/`/` that
proves it was punctuation, not two spoken digits. Standalone examples
(`"3:55"`, `"5:00"`, `"1/8"`, `"3/5"`) were already safely rejected by
*existing* ambiguity rules (the compact-digit-stream decompose-with-no-
target guard, and the two-distinct-unscoped-ranks guard) — verified, not
assumed, with permanent regression tests (§13). The genuinely new gap:
**with a target already established**, the existing guard didn't apply —
`"spot 6 has a 3:55"` would decompose `"55"` into two extra cards (5, 5)
onto Spot 6. `containsTimeOrFractionPattern` closes exactly this gap: when
present anywhere in the utterance, a glued 2+-digit run is never
decomposed into cards, target established or not.

## 11. Operator feedback terminology (PRIORITY 11)

Audited every voice-adjacent confirmation/rejection string for a residual
1.9 terminology leak (bare `S1`-style shorthand or the pre-1.9 "Seat"
default) that the 1.9 sweep missed:

- `lib/voice/narrationConfirmation.ts`'s `targetLabel` — the actual
  **normal operator confirmation pill** text (`✓ S1: 10, 6`) — was still
  emitting bare `"S1"`. Fixed to `"SPOT 1"`. This was the single highest-
  impact leak found: every narration confirmation on screen used this.
- `VoiceControl.tsx`'s `dispatch()` "select-seat" return string
  (`"Seat N selected"`) and all four table-change accept/reject strings
  (`"Seat N occupied"`, `"Seat N is already empty"`, `"Seat N left"`,
  `"Seat N left the table"`) → `"Spot N"`.
- `lib/utils/roundValidation.ts`, `lib/utils/workflowStatus.ts` — the Hand
  Status line / Operator Assistant bar's own `"Seat N has no wager..."`,
  `"Seat N is doubled..."`, `"Split hand active on Seat N"`, and
  `"Seat N (split hand) has no cards recorded"` strings — all
  operator-facing (visible in the sticky header status line and now also
  reused by `explainControlDisabledReason`, §9) → `"Spot N"`.
- `lib/utils/cardEventTarget.ts`'s `describeLedgerTarget` — the visible
  **Undo button label** (`"Undo Seat 3"`) → `"Undo Spot 3"`.
- `contexts/InvestigationContext.tsx`'s bet-change/hand-cleared event-log
  messages (`"Seat N bet set to..."`, `"Seat N hand cleared"`) → `"Spot N"`.

Internal identifiers are unchanged everywhere — `classifyVoiceTranscript
.ts`'s own `targetSummary`/`canonicalSummary` (used only in the Debug-panel
PARSE ALT diagnostic lines) still legitimately use `SEAT3`-style internal
labels, per the explicit "raw debug/export JSON may retain canonical
identifiers" allowance.

## 12. Diagnostic session metrics (PRIORITY 12) + ASR_NO_FINAL (PRIORITY 9)

New `lib/voice/sessionMetrics.ts` — a pure `computeSessionMetrics` function
aggregating every field the task asked for (total/accepted/rejected/
acceptance rate, ASR_NO_FINAL count/rate, N-best rescues, dealer/player-
confusion rescues, normalization rescues, compound-utterance count,
active-target-continuation count, average/median speech→final ms,
average final→commit ms) purely from data `VoiceControl` already collects
— `VoiceUtteranceSummary` gained a handful of new optional fields
(`nBestRescue`, `normalizationRuleIds`, `recoveryRuleId`,
`narrationOpsCount`, `hasExplicitTarget`, `speechStartToFinalMs`), all
populated generically inside the existing `finishUtterance` closure with
zero new call-site plumbing. Three new small counters
(`sessionsStarted`/`sessionsWithFinal`/`asrNoFinalCount`) track what
`VoiceUtteranceSummary` structurally cannot (a session that never produced
an utterance at all). Surfaced as a compact summary line above the
existing Debug panel log, and included in the JSON export's own
`sessionMetrics` block.

**ASR_NO_FINAL investigation:** the restart/session-recovery logic in
`useVoiceRecognition.ts` was audited and found already correct — the
restart-or-stop decision correctly lives exclusively in `onend`, and the
network-exhaustion backstop is unrelated to ordinary no-final stalls. The
one real, safely-scoped lever available without touching that logic: the
per-session hard timeout (`timeoutMs`) was tuned for single-target
commands and is meaningfully short for the new compound narration this
round adds (§7) — raised from 8000ms to 12000ms so genuinely longer speech
has more room before this backstop forces a stop. This does not change
Chrome's own silence-detection (still outside this app's control — see
§14) and does not touch duplicate/stale-session protection.

## 13. Regression corpus (PRIORITY 13)

`src/lib/voice/fieldTest2Regression.test.ts` (new, 33 tests) — every real
ACCEPT/RECOVER and REJECT/SAFETY case from the remediation brief, tested
against the pure classification/parsing layer directly (the same layer
`VoiceControl.tsx` dispatches from). Plus dedicated per-module test files
for the two new modules: `parseSetActiveTargetIntent.test.ts` (24 tests),
`sessionMetrics.test.ts` (7 tests). Every existing voice test file was
updated only where its assertions encoded the OLD "S1"/"Seat N" text or
the OLD generic CONTROL_DISABLED message — zero test was changed to
tolerate a behavior regression.

## 14. Explicitly not overfit (PRIORITY 14)

No dictionary of arbitrary Chrome transcripts was built. Every rule above
is: casino grammar + (optionally) known live target state + an explicit,
named ASR-confusion rule + N-best agreement + deterministic validation.
"play music"/"play your favorite song"/"everyone has lunch" remain
correctly rejected — same lookahead guards that accept the real recovered
phrases refuse these by construction, not by a separate blocklist.

## 15. Still dependent on Chrome/browser ASR

Nothing in this round changes that. Every fix here operates on the
transcript(s) `useVoiceRecognition.ts` hands to `VoiceControl` — it cannot
change what Chrome's own recognizer decides to transcribe, how it
segments an utterance, or its own internal silence-detection timing (see
§12's ASR_NO_FINAL investigation). The `SpeechProvider` abstraction that
would eventually decouple this app from any one browser's engine remains
architecture-only — see `docs/EYEONPIT_1_9_VOICE_INDEPENDENCE.md`, entirely
unmodified in this round.

## 16. Deferred / not built

- No `SpeechProvider` implementation, no Firefox support — out of scope
  for this round, unchanged from 1.9.
- No fuzzy/statistical matching of any kind was introduced anywhere.
- `lib/voice/classifyVoiceTranscript.ts`'s own diagnostic-only
  `targetSummary`/table-change `summary` strings still say `SEATn`/`Seat
  N` — left as internal diagnostics per the raw-debug-export allowance,
  not fixed for cosmetic consistency (would be scope creep against a
  Debug-only surface).
- Recommended Field Test #3 script — see the final remediation report.
