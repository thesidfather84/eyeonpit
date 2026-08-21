# EyeOnPit 1.10 — Split/Double Design (2026-08-20)

**Status: design approved with locked decisions; Phase 1 (reporting fix),
Phase 2 (Double/Undo defect fix), Phase 3 (split-hand operator UX polish),
Phase 4 (voice Split/Double commands), Phase 5 (EXPLICIT split-hand
voice card targeting), AND Phase 6 (natural split-hand continuation)
implemented, tested, and verified BY AUTOMATED TEXT-REGRESSION TESTS ONLY.
A real-microphone field-test protocol for Phases 4-5
(`docs/EYEONPIT_VOICE_FIELD_TEST_4.md`) has still NOT been run — do not
treat voice Split/Double, split-hand card targeting, or Phase 6's natural
continuation as field-validated until that session actually happens and
its export is reviewed. Phase 6 lets an operator explicitly select a
split hand once ("Player 3 Hand 2 has a five") and then continue naturally
with bare cards ("King.") that land on that same hand — built entirely on
the EXISTING active-target architecture (`activeTarget`'s signed-number
convention, `resolveCardEntryTarget`, `useCardEntry`,
`allowUnscopedContinuation`) with no new conversational-memory mechanism.
It does NOT broaden voice grammar beyond what Phase 4/5 already
established, and never infers which split hand is meant — a split seat
named without an explicit hand still rejects `AMBIGUOUS_HAND_TARGET`
exactly as before.** This
document's original version was planning-only. This revision records the
user's approved decisions (§0), Phase 1's real, shipped result (§0.1),
Phase 2's real, shipped fix (§0.2), Phase 3's real, shipped UX work (§0.3),
Phase 4's real, shipped voice work (§0.4), Phase 5's real, shipped
split-hand card-targeting work (§0.5), and Phase 6's real, shipped natural
continuation work (§0.6) — it does not retroactively claim anything beyond
Phases 1-6 is implemented, and none of it is field-validated (see the
Field Test #4 status above).

## 0. Locked decisions (approved 2026-08-20)

1. **Pre-split cards (§5.1 option A, approved):** keep current behavior.
   Split does NOT move or recreate historical cards, and CardEvents are
   never mutated to accomplish this. Count integrity takes priority over
   visual hand-reconstruction convenience.
2. **Re-splits:** explicitly OUT of 1.10 scope. One split producing Hand 1
   and Hand 2 is the full 1.10 scope. Future work must not be architected
   in a way that unnecessarily forecloses later re-split support (e.g.
   Phase 1's report shape uses a `handIndex: 1 | 2` field, not a hardcoded
   two-entry assumption, specifically so a future `handIndex: 3` is additive).
3. **UX (H1/H2 clarity):** confirmed as warranting improvement. Implemented
   in Phase 3 — see §0.3.
4. **Double/Undo verification:** required before any voice work. Done —
   see §0.2. A real defect was found in the verification round and **has
   now been fixed**, narrowly, in Phase 2.
5. **Reporting — Phase 1:** approved and executed. See §0.1.

### 0.1 Phase 1 result — reporting fix, shipped and tested

`reportBuilder.ts`'s `buildRoundEvidence` now reads `round.splitHands` in
addition to `round.seats` — a split seat produces two entries in
`ReportRoundEvidence.seats[]` (`handIndex: 1` and `handIndex: 2`), each
carrying its own `cards`/`betAmount`/`doubled`/`outcome`, independently.
`REPORT_SCHEMA_VERSION` bumped 2 → 3 (additive; a v2 report simply had no
way to represent a split hand at all). Zero CardEvent mutation, zero card
duplication, zero counting-engine involvement — the report reads the exact
same `playerCards` display arrays every other live/reporting surface
already reads. 7 new regression tests, all passing (§0.1 detail in the
Phase 1 report below this document).

### 0.2 Double/Undo — defect found, then fixed (Phase 2, 2026-08-20)

**Original finding:** pressing Undo immediately after Double (before any
further card is added) did not undo the Double. It silently undid the
seat's most recent CARD instead, leaving `doubled: true` and the doubled
wager intact — because `undo()`'s context-aware per-target lookup (find
this target's own most recent active CardEvent) always ran BEFORE the
whole-round history-stack fallback that actually held the Double, and a
target with any of its own cards remaining always satisfied that lookup
first.

**The fix (narrowly scoped, per explicit instruction):** `undo()` now
checks, FIRST, whether the active target's own hand is `doubled` with NO
post-double card yet (`playerCards.length === doubledAtCardCount`, a pure,
deterministic read of fields already on `SeatRoundRecord` — no new
CardEvent, no history-stack redesign). When true, Undo reverts the Double
itself (halves `betAmount`, clears `doubled`/`doubledAtCardCount`, drops
the `"double"` action) via the exact same `mutateRound` primitive every
other round-state undo already uses, and pushes a new, narrow
`HistoryEntry` variant (`"target-double"`) onto `future` so Redo restores
it exactly. Once a post-double card exists, this check is false and
`undo()` falls through to the pre-existing card-undo path unchanged —
removing that card first is what makes the SECOND Undo naturally reach the
double-revert branch on its own, with zero additional logic. Global LIFO
behavior for ordinary card entry (and split-hand card entry) is completely
unchanged — the new check only ever activates for a target the operator
has explicitly Doubled.

**One known, accepted side effect:** the ORIGINAL generic `"round"` history
snapshot that `handleDouble`'s `mutate()` call still pushes when Double is
first pressed is now, in the common case, never reached — the new
target-scoped check intercepts first. That old entry becomes an inert
"ghost" sitting in `history`; if it were ever reached via the fully generic
fallback (an unlikely ordering requiring several other actions to unwind
first), it would perform a harmless-in-effect but imprecise whole-round
revert. This exact characteristic already existed for every `mutate()`-
based action (Double, Insurance, Surrender) before this fix — Phase 2 does
not introduce it, and removing it would mean changing `handleDouble`
itself (touching `PlayerActionsRow.tsx`), a larger change than this
narrowly-scoped fix called for. See the Phase 2 chat report for the full
verification narrative that originally surfaced this — the deprecated text
below (superseded) described the still-broken state before the fix:

<details><summary>Original (now-fixed) finding, kept for history</summary>

Pressing Undo immediately after Double (before any further card is
added) does not undo the Double. It silently undoes the seat's most
recent CARD instead, leaving `doubled: true` and the doubled wager intact
— because `undo()`'s context-aware per-target lookup (find this target's
own most recent active CardEvent) always runs BEFORE the whole-round
history-stack fallback that would actually revert the Double, and a
target with any of its own cards remaining always satisfies that
context-aware lookup first. Originally proven with a real, passing
automated test that has since been replaced with tests proving the FIXED
behavior (the old test's own assertions now correctly fail against the
fixed code — that failure was the confirmation the fix worked). Full
detail in the Phase 1 and Phase 2 chat reports.

</details>

### 0.3 Split-hand operator UX polish (Phase 3, 2026-08-20)

**What changed, presentation-only — zero mutation/undo/counting-engine
code touched:**

- `ActiveSeatHeader.tsx` — a split seat now shows a spelled-out, two-button
  `HAND 1` / `HAND 2` switcher (`role="group"`, 48px touch targets, 44px in
  `short:` landscape) directly under the seat identity line. Each button
  carries `aria-pressed` for the active hand plus a filled background,
  border, and a checkmark icon — active state is signaled on three
  channels, never color alone. An unsplit seat's header is byte-identical
  to before this round.
- `PlayerActionsRow.tsx` — a caption ("Actions below apply to Hand 1/Hand 2
  only") appears above the Double/Split/Insurance/Surrender/More row, but
  only for a seat that has split. Button labels/behavior unchanged.
- `PlayerDetailSheet.tsx` / `PlayerDetailBar.tsx` — the dialog title and
  compact collapsed-row text now read "Hand 1"/"Hand 2" (spelled out) for a
  split seat instead of the old bare "· SPLIT" suffix. Unsplit-seat text is
  unchanged.
- `SeatTilesRow.tsx` — the dense table-overview tile's small split-hand
  badge enlarged 20px → 24px with an added border for active-state weight;
  `aria-label` clarified from "Spot n split hand" to "Spot n, Hand 2 —
  select". Kept intentionally compact as a secondary, table-overview-scale
  affordance — the primary interaction surface for switching hands is now
  `ActiveSeatHeader`, not this tile.

**Why this satisfies the "no cryptic shorthand as the primary label"
requirement:** the fully spelled-out `HAND 1`/`HAND 2` switcher in
`ActiveSeatHeader` is the primary surface an operator uses to both see and
change which hand is active. The tile's small "H2" glyph is deliberately
secondary — it's a fast shortcut for an operator who already understands
the convention, not the place a new operator learns it.

**9 new tests** in `src/components/live/SplitHandUX.test.tsx`, driving the
real `LiveScreen` component tree (not isolated components), covering:
unsplit seat display is unchanged; a split seat shows both HAND 1 and HAND
2 labels spelled out in full; the active hand is represented via
`aria-pressed` (not color alone); selecting HAND 1 and HAND 2 each
correctly retarget `activeTarget`; the seat tile's H2 badge is a working
shortcut; Double applies only to whichever hand is currently selected
(verified by checking each hand's own `doubled` state independently); and
both hand-select buttons stay simultaneously present in the DOM regardless
of the `short:` (landscape) CSS variant, since this component never drops
either control via orientation-specific JS branching — only CSS sizing
changes.

**§6's three UX flags from the original design are now resolved:**
the H2 badge is enlarged and better-labeled (not eliminated — deliberately
kept as a secondary affordance, see above); the active-hand indicator now
has a dedicated, multi-channel signal (`aria-pressed` + fill + border +
icon) instead of relying on the same generic cyan seat-selection border;
and Double's own action row now carries an explicit hand-context caption,
so an operator glancing only at the action row (not the seat tile) can
confirm which hand Double will apply to before tapping.

### 0.4 Voice Split/Double commands (Phase 4, 2026-08-20)

**Scope, precisely:** ONLY the plain, explicit-target "spot N split"/"spot N
[hand H] double" commands from §7.2. Split-hand voice CARD ENTRY/targeting
("spot 3 hand 2 has a five") and continuation narration scoped to a
just-named split hand — §7.1, listed as Phase 6 in §12 — are explicitly
**NOT implemented** by this round. A voice-triggered Split creates Hand 2
exactly like the manual button; entering cards into either hand by voice
still requires manual card entry (CardEntryPad) until Phase 6.

**Grammar shipped** (`src/lib/voice/parseSplitDoubleCommand.ts`), exact and
closed, no broader than these six shapes:

- `spot 3 split` / `player 3 split` / `seat 3 split`
- `split spot 3` / `split player 3` / `split seat 3`
- `spot 3 double` / `player 3 double` (bare — targets the primary hand on
  an unsplit seat; **rejected as ambiguous** on an already-split seat)
- `double spot 3` / `double player 3`
- `spot 3 hand 1 double` / `spot 3 hand 2 double` (also with `one`/`two`)
- `double spot 3 hand 1` / `double spot 3 hand 2`

**Why this couldn't just reuse the existing narration/legacy parsers:**
`parseNarration.ts` already recognizes bare "split"/"double" as
`INERT_ACTION_WORDS` — permanently-no-op filler, by original 1.9-era
design, kept only so the words don't trip narration's noise-rejection
threshold. Left unguarded, "spot 3 split" would have silently narrated as
nothing but a target selection, discarding "split" entirely. This is why
`parseSplitDoubleCommand` is checked in BOTH `classifyVoiceTranscript.ts`
(so N-best alternative scoring understands it too, not just the final
dispatch) and `VoiceControl.tsx`'s `handleFinalResult`, in the same
position table-change/read-only-query already occupy: before narration.

**Malformed-attempt safety (a real bug found and fixed during this
round):** an early version of the parser returned plain `null` for a
malformed hand number (e.g. "spot 3 hand 3 double" — hand 3 doesn't
exist). Testing proved this was unsafe: `null` meant "not my grammar,"
which let the transcript fall through to `parseNarration`, whose noise
tolerance absorbed "hand" as one stray tolerated word and "double" as
inert filler, then read the trailing "3" as an ordinary **card**, entering
Hi-Lo +1 — a real, wrong CardEvent from a REJECTED command. Fixed by
giving the parser a third return state, `{kind: "blocked"}`: once a clean
seat target is found, any leftover tokens that still contain one of this
grammar's own trigger words ("split"/"double"/"hand") block the utterance
outright rather than deferring it — never a guess, never a silent card.
Ordinary sentences that merely start with a valid seat phrase ("spot 3
raised his bet") are unaffected — they contain none of those trigger
words, so they still fall through and get rejected by the existing
downstream noise-cap exactly as before.

**Safety guarantees, verified by test:**

- A bare double on an already-split seat is rejected with a new
  `AMBIGUOUS_HAND_TARGET` diagnostic code — never guesses Hand 1 vs. Hand
  2, per §7.2's explicit rule.
- Splitting a seat with no hand, an already-split seat, or a locked hand
  is rejected (`CONTROL_DISABLED`), never silently no-ops.
- Doubling a seat/hand with no record, an already-doubled hand, or a
  locked hand is rejected the same way.
- Both dispatch through the EXACT SAME `splitSeat`/`mutate` functions
  `PlayerActionsRow.tsx`'s manual buttons call — `mutate`'s Double updater
  is byte-identical to `handleDouble`'s — never a parallel commit path.
  Neither ever creates a CardEvent; both are verified (by direct
  `getCardEventsForInvestigation` assertion) to leave the ledger and every
  displayed count completely unchanged.
- Because voice Double reuses `mutate` with the identical
  `doubled`/`doubledAtCardCount` shape, Phase 2's Undo fix
  (`isDoubledWithNoPostDoubleCard`/`revertDouble`) applies to a
  voice-triggered Double exactly as it does to a manually-pressed one —
  verified directly: Undo right after a voice Double reverts the double,
  not a card.

**Feedback:** accepted commands speak through the existing `speak()`
abstraction, gated by the existing `voiceAudioFeedback` setting — no new
TTS system. Confirmation text: `"Spot 3 split"`, `"Spot 3 doubled"` (bare/
unsplit), `"Spot 3 Hand 1 doubled"` / `"Spot 3 Hand 2 doubled"` (explicit
hand). Rejections never speak — they use the existing visual-only
`disabled`/`unrecognized` status pill, exactly like every other rejection
in this app.

**11 new tests** in `src/components/live/VoiceSplitDouble.test.tsx`,
driving the real `VoiceControl` component end to end (mock
`SpeechRecognition`, real `InvestigationProvider`/repository/ledger) —
covering every accepted form, every rejection listed above, the malformed-
hand-number safety fix, zero CardEvent/count mutation for both commands,
voice Double → Undo, and Player/Spot terminology compatibility.

### 0.5 EXPLICIT split-hand voice card targeting (Phase 5, 2026-08-20)

**Scope, precisely:** ONLY a spoken card that names the seat AND the hand
explicitly in the same utterance — "spot 3 hand 1 has a five", "spot 3
hand 2 has a king." Conversational continuation (a later card, in a new
utterance, resolving against a previously-named hand with no fresh target
spoken) is explicitly **NOT implemented**. Multi-card narration under one
named hand ("...has a five and a king") is also **NOT implemented** — it
is deliberately BLOCKED outright, same as a malformed attempt, rather than
silently entering only the first card. Neither of these was asked for by
the design brief and both would be genuinely new grammar, not a "safe
equivalent" of something the existing parser architecture already does.

**Grammar shipped** (`src/lib/voice/parseSplitHandCardCommand.ts`), exact
and closed, three shapes only:

- `spot 3 hand 1 has a five` / `player 3 hand 1 has an ace` / `seat 3
  hand 1 has a seven` (and the Hand 2 equivalents) — the primary form.
- `spot 3 hand 1 has five` (connector, no filler) and `spot 3 hand 1
  five` (no connector at all) are also accepted — this is NOT new
  tolerance invented for this grammar: the plain, non-hand-qualified
  equivalent ("spot 3 five") is already accepted by the existing legacy
  parser's `extractFromNoisyTokens`, so the hand-qualified form inherits
  the identical tolerance rather than being stricter than the un-qualified
  case for no real reason.
- Connector words recognized: `has`/`is`/`gets`/`got`/`shows` — a
  deliberately NARROWER set than `parseNarration.ts`'s own
  `HAND_CONNECTOR_WORDS` (which also includes `and`/`with`/`in`/`as`):
  those four are either multi-card/ASR-artifact-specific words with no
  established meaning in this new, closed, single-card grammar, or (for
  `as`, an ASR misreading of `has`) have no real captured field evidence
  yet for THIS specific phrase shape — adding them now would be exactly
  the "aggressive recovery to make split-hand phrases pass" the design
  brief says not to do. Deferred to the real microphone field test, per
  §6 of the brief.

**Targeting — the `splitTargetFor`/negative-number convention, unchanged:**
Hand 1 → the seat's own positive number (`resolveSeatTarget`'s existing
primary-hand target). Hand 2 → `splitTargetFor(seat)` (the existing
negative-number split-hand target). Both resolve through the EXACT SAME
`resolveCardEntryTarget`/`addCard` production path every other card entry
(manual tap or voice) already uses — this is what makes "one logical hand"
and "one physical CardEvent" completely separate, structurally guaranteed
concerns: there is exactly one `addCard` call site in the new dispatch
block, full stop, so a second CardEvent for one spoken card is not just
untested but architecturally not possible from this code.

**Unsplit-seat behavior (§3 of the brief) — resolved by reading, not
guessing:** explicit Hand 1 on an unsplit seat is ACCEPTED — its resolved
`CardTarget` is the identical positive seat number a bare card would use,
so there is no new ambiguity to introduce; confirmed correct by reading
`resolveCardEntryTarget`/`resolveSeatTarget` before writing a single line
of dispatch code, then proven by test. Explicit Hand 2 on an unsplit seat
is REJECTED — `resolveCardEntryTarget` itself reports `notEnabled` because
`round.splitHands[seat]` doesn't exist, so this needed no bespoke
validation at all, just reading the existing resolution's own result.

**Bare split-seat ambiguity (§4 of the brief) — the one place existing
code was changed, not just added to:** "Spot 3 has a five" (no "hand" word
at all) does not go through the new parser — it is the SAME transcript
shape the legacy/narration pipeline has always handled, and today it would
silently resolve to the primary hand with no idea a split even exists.
This is exactly what `docs/EYEONPIT_1_10_SPLIT_DOUBLE_DESIGN.md` §7.1
already locked, before Phase 5 started: *"Bare 'Spot 3' after a split MUST
stay ambiguous between hand 1 and hand 2... never guess which hand a bare
target phrase means once a seat has split."* A new shared helper,
`isAmbiguousSplitSeatCardTarget` (`VoiceControl.tsx`), enforces this at
the two places a plain, EXPLICIT seat-target card ever gets resolved: the
legacy single-card dispatch path (gets the distinct new
`AMBIGUOUS_HAND_TARGET` rejection code) and `preflightNarration`'s card-op
branch (covers the rarer multi-card-narration case, via the existing
generic `CONTROL_DISABLED` preflight-failure convention). A card with NO
target at all — continuation against whatever's already active — is
completely untouched by this check; that is an already-disambiguated
situation (the operator, or the UI, chose the active hand earlier), not a
fresh ambiguous utterance.

**A real cross-grammar bug found and fixed during this round:** Phase 4's
`parseSplitDoubleCommand.ts` blocks on ANY leftover tokens containing its
own trigger words (`"split"`/`"double"`/`"hand"`) once a clean seat target
is found. Since `"hand"` is ALSO Phase 5's own trigger word, EVERY valid
Phase 5 card command ("spot 3 hand 1 has a five") was being incorrectly
swallowed and blocked by Phase 4's parser before Phase 5's own parser ever
got a chance — caught immediately by the new tests (18 of 24 failed on
first run). Fixed by making each parser's "blocked" fallback recognize the
sibling grammar's own shape and defer (return `null`) to it instead of
blocking: `parseSplitDoubleCommand` now defers when the tail's last token
is a real card-rank word; `parseSplitHandCardCommand` defers when the tail
is exactly `"double"`. Both directions are fixed (not just the one the
current check order happens to need) so this doesn't silently depend on
which parser VoiceControl.tsx happens to check first.

### 0.6 Natural split-hand continuation (Phase 6, 2026-08-20)

**Scope, precisely:** once an operator explicitly selects a split hand
("spot 3 hand 2 has a five"), a SUBSEQUENT bare card in a new utterance
("king") now continues onto that SAME hand — no target needs to be
re-spoken. This is the ONLY new capability. No new voice grammar was
added: the bare-card path is the exact same one that has always
continued onto whatever `activeTarget` currently is for an ordinary seat;
Phase 6 verifies (and, where it found real gaps, fixes) that this already
sign-agnostic mechanism stays correct when `activeTarget` is negative
(a split hand) rather than positive.

**Why this was nearly free:** `activeTarget`'s type has been `"dealer" |
number` since Phase 4/5, with negative numbers already meaning "this
seat's split hand" via `splitTargetFor`. The production write path for
EVERY card entry, manual or voice — `useCardEntry` → `resolveCardEntryTarget`
— and the multi-card narration continuation gate
(`allowUnscopedContinuation: activeTarget !== "dealer"`) were both already
completely agnostic to the sign of `activeTarget`. 14 of the first 17
integration tests written for this phase passed on the very first run
against zero new production code — only the 3 gaps below needed fixing.

**Three real gaps found and fixed (all pre-existing, not introduced by
Phase 5):**

1. `markSeatEmpty` cleared `activeTarget` only when it matched the seat's
   POSITIVE form (`activeTarget === seatNumber`), even though clearing a
   seat removes both its primary AND split hand. A stale negative target
   left behind would silently reject every later bare-card continuation.
   Now checks both `activeTarget === seatNumber || activeTarget === -seatNumber`.
2. `undo()`'s whole-round-snapshot branch (the path a bare Split — no card
   yet on Hand 2 — is undone through) never repaired `activeTarget` when
   the restored round no longer had the split hand it was pointing at.
   Now redirects back to the seat's primary hand when
   `!round.splitHands[-activeTarget]` after a round-snapshot restore.
3. Multi-card narration confirmation (`ConfirmationEntry`) carried a
   `VoiceTarget`, whose seat number is structurally always positive 1-7 —
   continuing onto an active split hand with no target named in that
   utterance rendered as the nonsensical "SPOT -3". Replaced with a plain
   resolved `targetLabel: string`, computed via a new round-aware
   `confirmationLabelFor` helper in `VoiceControl.tsx` that correctly
   renders "SPOT 3 HAND 2".

**Never guesses:** a split seat named without an explicit hand
("spot 3 has a five") still rejects `AMBIGUOUS_HAND_TARGET` exactly as
Phase 5 left it — Phase 6 added no inference. Confirmed by a dedicated
test where a DIFFERENT hand is the live active target at the time.

**Fail-closed, verified by test:** an active split-hand target that
becomes stale (its hand ceases to exist via any path) rejects the next
bare card with a graceful "not enabled" message and writes zero
CardEvents — never misapplies the card to a hand that no longer exists,
and never a silent DB-layer failure.

**Round/session boundaries:** every round-advance path already
unconditionally calls `setActiveTarget`, and every new round's
`splitHands` always starts `{}` — so a split-hand target can never leak
across a round boundary; this was already true by construction and Phase
6 only added a test proving it, not new code.

**Testing:** 17 new tests in
`src/components/live/VoiceSplitHandContinuation.test.tsx`, driving the
real `VoiceControl` component end to end through complete spoken
sequences (not isolated parser strings) — explicit-hand-then-bare-card
continuation for both hands, target switching between an ordinary seat
and a split hand in both directions, switching between Hand 1 and Hand 2,
Double preserving active-hand targeting, Undo/Redo of a continuation
card, self-healing after undoing a bare Split, round-boundary clearing,
seat-leaving redirect, six fail-closed cases (ambiguous bare split-seat
target, malformed Hand 3, Hand 2 on an unsplit seat, a stale split-hand
target forced independently of the `markSeatEmpty` fix, unrelated speech,
conflicting N-best hand alternatives), and a 4-card count-integrity
sequence across both hands.

**Explicitly NOT done in Phase 6** (none of these were asked for): no
broadening of voice grammar beyond Phase 4/5's existing forms; no
speculative ASR recovery; no changes to `counting-engine/`, reporting, or
the Sherpa provider/deployment; `advanceToNext`'s guided-mode auto-advance
jumping to "dealer" for a negative `activeTarget` was noted as adjacent
by investigation but is untouched — it was not in the user's explicit
requirement list.

**Deterministic active-target behavior (§7 of the brief):** after a
successful explicit split-hand card, the named hand becomes the active
target (`setActiveTarget(cardTarget)`) — the identical "explicit target →
switch active target" convention every other explicit-target voice command
in this app already follows (see the legacy `card` dispatch case's own
comment: "switched to match, exactly as if the operator had tapped that
seat/dealer tile first"). This introduces no continuation of its own — a
FOLLOWING bare card still just uses whatever is now active, the same
pre-existing mechanism every other target change already relies on.

**N-best safety (§10 of the brief) — reviewed, no architectural conflict
found:** `classifyVoiceTranscript.ts` is a pure, transcript-only function
with no access to live round state (by design, see its own doc comment) —
it cannot know whether a seat is split, so the bare-target ambiguity check
above is correctly a commit-time-only concern, exactly like
`resolution.disabled`/`resolution.locked` already are; nothing about that
is new or Phase-5-specific. For alternatives that genuinely disagree on
WHICH hand was named (e.g. ALT1 "...hand 2 has a five" vs. ALT2 "...has a
five" from the same noisy recognition), each classifies to a DIFFERENT,
distinct `actionKey` — `nBestResolver.ts`'s existing conflict handling
already fails closed on this (`CONFLICTING_ALTERNATIVES`/
`MULTIPLE_VALID_CONFLICTS`, rejecting outright unless one alternative wins
by a decisive scoring margin) — the exact same mechanism that already
protects every other pair of structurally different valid alternatives in
this app. No changes were needed to `nBestResolver.ts` itself.

**Count/ledger integrity, verified by test:** a Hand 1 card and a Hand 2
card each produce exactly one CardEvent, targeted correctly (`targetType:
"seat"` vs. `"split"`); the running count changes exactly once per card;
Undo of a Hand 1 or Hand 2 card removes exactly that card (flips its
CardEvent's `status` to `"undone"` — never deletes the row, see
`CardEventStatus`'s own doc comment) and reverses the count exactly once,
leaving the OTHER hand completely untouched; Redo restores it to the same
logical hand and the count exactly once more; a card entered on one hand
never appears on the other; cards present on the primary hand from BEFORE
the split remain untouched by a later voice-entered Hand 2 card; Double
state (`doubled`/`doubledAtCardCount`) stays correctly associated with
whichever hand it was set on regardless of later voice card entry on the
other hand; and a voice-entered Hand 2 card reports correctly under
`handIndex: 2` for the right seat via the EXISTING, unmodified Phase 1
`buildReportFromInvestigation` — it reads `round.seats`/`round.splitHands`
directly, the same arrays voice entry writes to via `updateSeatAtTarget`,
so no reporting code needed to change at all.

**24 new tests** in `src/components/live/VoiceSplitHandCard.test.tsx`,
driving the real `VoiceControl` component end to end — accepted forms
(all six seat/hand/rank combinations from the brief plus the connector-
less form), unsplit-seat behavior (Hand 1 accepted, Hand 2 rejected),
bare-target ambiguity on a split seat (and confirmation the SAME bare
phrase still works normally on an unsplit seat), every malformed-hand
case, the blocked multi-card case, count/ledger integrity, Undo/Redo (Redo
triggered via the context's own `redo()` — there is no voice command for
Redo, only Undo, so this exercises the real production Redo path directly
rather than inventing a phrase that doesn't exist), and reporting
association.

---

## 1. What already exists — do not redesign this

Every item below was verified by reading the actual, current source, not
inferred from a comment or a roadmap line.

| Capability | Status | Where |
|---|---|---|
| Split hand data model (`Round.splitHands`, keyed by seat number, same shape as a primary hand) | **IMPLEMENTED** | `types/investigation.ts` |
| Double state (`doubled`, `doubledAtCardCount`, wager doubling) | **IMPLEMENTED** | `types/investigation.ts`, `PlayerActionsRow.tsx` |
| Split-hand targeting convention (negative seat number = that seat's split hand) | **IMPLEMENTED** | `lib/utils/seatTarget.ts` |
| CardEvent ledger target type for split hands | **IMPLEMENTED** | `lib/counting-engine/types.ts` (`CardEventTargetType` includes `"split"`), `lib/utils/cardEventTarget.ts` |
| Per-target undo/redo (flips exactly one CardEvent, never touches another target's data) | **IMPLEMENTED**, already split-hand-safe | `lib/db/repositories/cardEvents.ts` (`undoTargetCard`/`redoTargetCard`) |
| Manual UI: Split button, Double button | **IMPLEMENTED** | `components/live/PlayerActionsRow.tsx` |
| Manual UI: split-hand indicator + tap-to-target on the seat tile | **IMPLEMENTED** (small "H2" badge — see §6 for a UX flag) | `components/live/SeatTilesRow.tsx` |
| Round-completion validation requiring split hands to be resolved before "Next Hand" | **IMPLEMENTED** | `lib/utils/roundValidation.ts` |
| Counter Detection / Player Analytics extraction of split-hand observations | **IMPLEMENTED** — a split hand produces its own `PlayerObservation`, same as a primary hand | `lib/player-analytics/extractObservations.ts` |
| Backward compatibility for investigations recorded before `splitHands` existed | **IMPLEMENTED** — `normalizeInvestigation.ts` defaults a missing `splitHands` map to empty | `lib/db/normalizeInvestigation.ts` |
| Voice: split/double/hit/stand/surrender/insurance commands | **NOT IMPLEMENTED** — explicitly `PLANNED` in the Product Spec's own status matrix | `docs/EYEONPIT_PRODUCT_SPEC.md` §Implementation Status Matrix |
| Reporting: split-hand cards/outcome/wager in the generated Report | **NOT IMPLEMENTED — a real, confirmed gap**, see §2 | `lib/reporting/reportBuilder.ts` |

**Why this matters:** per your own instruction #2, existing locked
decisions win. The negative-seat-number targeting convention, the
CardEvent ledger's per-target undo, the "split creates an empty second
hand rather than moving cards" behavior (see §5.1), and the manual UI's
button placement are all real, shipped, tested decisions. This document
does not propose replacing any of them.

## 2. Confirmed architectural gap — reporting

`reportBuilder.ts`'s round-summary section maps `Object.values(round.seats)`
only — `round.splitHands` is never read. **A split hand's cards, wager,
and outcome are completely absent from every generated Report today**,
even though the same data is fully captured live and fully extracted for
Counter Detection. This is a real defect, not a hypothetical one, found by
reading the code — reported per your instruction #8, not silently patched.

## 3. Existing capabilities we can reuse (summary of §1)

- The full data model: `SeatRoundRecord`, `Round.splitHands`, `doubled`/`doubledAtCardCount`/`wagerChange`.
- The targeting convention (`resolveSeatTarget`/`splitTargetFor`/`updateSeatAtTarget`).
- The CardEvent ledger's `"split"` target type and its already-correct per-target undo/redo.
- The manual dispatch functions (`splitSeat`, the `handleDouble`/`handleSplit` mutators in `PlayerActionsRow.tsx`) — voice should call into these same functions, never a parallel path.
- Counter Detection's split-hand-aware observation extraction.
- The lifecycle/completion validation that already requires split hands to resolve.

## 4. Architectural gaps (the actual list, evidence-based)

1. **Reporting** (§2) — confirmed, real, needs fixing before or alongside any voice work, since voice would only make it easier to generate MORE split hands whose data then silently vanishes from reports.
2. **Voice** — genuinely not designed or implemented. See §7.
3. **Split does not move the pre-split cards** (§5.1) — an open design question, not yet a confirmed defect, because it may be intentional given EyeOnPit's "record what's observed" philosophy. Needs your decision, not a silent fix.
4. **UX polish** — the "H2" split-hand badge is small and easy to miss under fast, high-pressure surveillance conditions; see §6.

## 5. Data model — what's genuinely new to design

Almost nothing. The model already supports one split per seat (`splitHands`
is keyed by seat number, singular — not an array), matching standard
casino floor rules (most properties allow one split, occasionally
re-splitting to 2-3 hands is allowed at some tables). **Open question for
you:** does EyeOnPit need to support more than one split (re-split) per
seat? Today's `Partial<Record<number, SeatRoundRecord>>` shape only has
room for exactly one split hand per seat number. Supporting re-splits
would require either a small array per seat or a compound key
(`seatNumber-handIndex`) — a real, if modest, data model change, not
needed unless you confirm re-splits must be tracked.

### 5.1 The one real open design question: does Split move cards?

`splitSeat` (`investigations.ts`) creates a **new, empty** second hand —
the original seat's already-recorded pre-split cards stay exactly where
they are. In real blackjack, splitting takes the original two-card hand
and separates it into two one-card hands. Today, after pressing Split:

- Hand 1 (original) still shows both pre-split cards.
- Hand 2 (new) shows zero cards.

Two ways to reconcile this, **neither implemented, both requiring your
decision**:

- **(A) Leave it as-is, document it explicitly.** The operator, upon
  observing a split at the table, is expected to correct Hand 1 manually
  (Undo one card, or use "More" → a correction action) and enter that same
  card into Hand 2, then continue normally. Zero code changes. Relies on
  operator training/muscle memory under time pressure — a real usability
  risk during a fast surveillance moment.
- **(B) Make Split move one card automatically.** Splitting would need to:
  pop the second (or first — casino convention varies) card off the
  original hand's CardEvent-backed array and re-target it onto the new
  split hand. **This is the part that directly touches your #4 concern
  ("splitting a hand must never double-count an already-seen card")**: the
  CardEvent ledger's events are designed as an append-only record keyed to
  a specific `targetType`/`targetId` at creation time (see
  `lib/counting-engine/ledger.ts`) — reassigning an existing CardEvent's
  target after the fact is not a capability that exists today and was not
  found anywhere in the codebase. It would need to be a NEW, carefully
  reviewed ledger operation (not a delete+recreate, which would show as
  two events for what a reviewer needs to see as one continuous card) —
  real design work, not a small change, and squarely a counting-engine
  question this document does not have authority to decide unilaterally.

**Recommendation, not a decision:** (A) is far lower-risk and requires no
ledger changes. If you want (B), it deserves its own focused round with
the counting-engine implications reviewed on their own, separate from
voice.

## 6. Operator UX — what exists, what may need polish

**Superseded by Phase 3 (§0.3):** the three flags originally raised in
this section (small/cryptic H2 badge, no dedicated active-hand indicator,
Double with no hand-context) are now resolved. This section is kept as-is
below for historical record of the original design analysis.

**Already good:** large touch targets (`tap-target` class, consistent with
every other action button), Double/Split sit in the same row as
Insurance/Surrender/More (no extra taps to find them), the active target
gets a clear cyan-highlight treatment identical to every other seat
selection, portrait (arch layout) and landscape (`short:` — flat 3×2 grid)
are both already handled for the seat tiles that host the split badge.

**Real, specific flags, not redesigns:**

- The split-hand indicator is a 20×20px "H2" badge in the tile's bottom-left
  corner — small, and "H2" requires the operator to already know EyeOnPit's
  own convention (the primary hand has no visible "H1" label at all, so
  "H2" appearing without a paired "H1" could read as unexplained rather
  than self-evidently "hand two of two"). Worth operator feedback before
  any change — this is exactly the kind of thing that's obvious once you
  know it and invisible until then, which is a real risk during a fast
  moment but not a functional bug.
- There is no dedicated "which hand is active" indicator beyond the same
  cyan border already used for every other active-target seat — for a
  split seat, both the primary tile and the H2 badge can independently
  show the active cyan state, so the distinction relies on the operator
  reading the small badge's state, not a larger, harder-to-miss signal.
- Double's button reads simply "Double" regardless of which hand
  (`target`) it's currently bound to — correct behavior-wise (it already
  operates on whichever hand is the current `target`), but there's no
  on-button hand indicator, so an operator glancing only at the action row
  (not the seat tile) has no confirmation of which hand Double will apply
  to before tapping.

None of these are proposed as required changes — they're flagged
observations for you to weigh, per instruction #6's ask to design for
"fast surveillance use" and "no cryptic labels."

## 7. Voice design (design only — no grammar implemented)

This is the one area with no existing implementation to reuse or preserve.
Design principles, following the exact same discipline every prior voice
round in this codebase already established (deterministic, closed
grammar, never guess, reject on ambiguity):

### 7.1 Targeting a split hand

The existing `CardTarget` convention (negative number = split hand) is
already how the manual UI encodes this — voice should target the SAME
concept, not invent a parallel one. Proposed closed-grammar phrases,
**narrow and explicit only**:

- "Spot 3, hand 2, has a five." / "Spot 3 hand two has a five." — an
  explicit, unambiguous hand-2 designation, mirroring the existing
  `splitTargetFor(seatNumber)` concept in spoken form.
- "Spot 3's split hand has a five." — an alternate phrasing for the same
  target.
- Bare "Spot 3" after a split MUST stay ambiguous between hand 1 and hand
  2 unless the operator says which — **never guess which hand a bare
  target phrase means once a seat has split.** This is the single most
  important safety rule in this section: a wrong-hand card write silently
  corrupts which hand's outcome is recorded, without corrupting the count
  (the count is target-independent), but does corrupt the
  investigation/report record of what happened to each hand.
- Continuation narration ("has a five") after a split-hand target was just
  explicitly named should resolve against THAT hand specifically (not
  fall back to the seat's primary hand) — same continuation-safety
  precedent already established for ordinary active-target continuation
  (`allowUnscopedContinuation`, PC Field Test #2 remediation) extends
  naturally here, but needs its own explicit regression tests before
  shipping, not an assumption that the existing mechanism "just works"
  for this new case.

### 7.2 Split and Double as voice commands

- "Spot 3, split." — a workflow-shaped command (like "next hand"/"done"),
  dispatching to the SAME `splitSeat` function the manual button already
  calls — never a parallel commit path.
- "Spot 3, double." — dispatches to the same `handleDouble`-equivalent
  mutation. Needs an explicit target (never a bare "double" resolving
  against whatever's active, given how much is riding on getting the
  right hand doubled) — mirrors the existing "never guess between two
  targets" rule already enforced for narration.
- Neither of these should ever be inferable from ambiguous phrasing — if
  "split" or "double" appears without a clear, explicit target attached in
  the same utterance, reject, exactly like an incomplete narration rejects
  today.

### 7.3 Explicitly deferred, not designed here

- Hit/Stand/Surrender/Insurance voice grammar — same category of work,
  intentionally out of this document's scope (1.10 is titled
  Split/Double); each deserves the same "existing manual function, no
  parallel path, explicit target only" treatment when its own round comes.
- Any grammar implementation, tests, or wiring — this section is
  vocabulary/shape design only, per your explicit "do not implement new
  grammar yet."

## 8. Undo semantics

Per-CardEvent undo is **already correct and already split-hand-safe** —
`undoTargetCard`/`redoTargetCard` operate on one specific `targetType`/
`targetId` and never touch another target's array, confirmed by reading
`cardEvents.ts` directly (this is exactly the mechanism that replaced an
earlier, less safe whole-round-snapshot restore for cards). What's
genuinely worth confirming explicitly, one at a time:

| Action | Current mechanism | Verified safe? |
|---|---|---|
| Split (creating the second hand) | Whole-round history snapshot (`pushHistory`) in `InvestigationContext.splitSeat`, not the CardEvent ledger | Undoes the split hand's *existence*, not a card — correct, since creating an empty hand isn't itself a CardEvent. Confirmed by reading the code; not yet covered by a dedicated regression test for the split-then-undo sequence specifically. |
| Card to split Hand 1 (i.e. the primary hand) | `undoTargetCard` with `targetId = seatNumber` | Already correct — same mechanism every primary-hand card undo already uses. |
| Card to split Hand 2 | `undoTargetCard` with `targetId` encoding the split target | Already correct by construction — `cardEventTarget.ts`'s `"split"` targetType is a first-class case in the same function, not a special case bolted on. |
| Double | Whole-round history snapshot, same as Split | Reverts `betAmount`/`doubled`/`doubledAtCardCount`/the `"double"` action entry together, atomically — correct, since Double is a single compound state change, not a card. |
| Doubled wager specifically | Same as Double — not separable | If a future voice "undo the double, keep the card" need arises, that's a NEW, narrower undo granularity not designed here — flagged, not solved. |
| Subsequent cards after a double | Same per-target CardEvent undo as any other card | The `doubledAtCardCount` lock (in `SeatRoundRecord`) already prevents further cards past the one-card-after-double rule at entry time — undoing that one card should also need to clear the lock correctly; **not verified by a specific test this round** — flagged as a real, small thing to verify before voice wiring, not before this planning document. |

**Voice's own undo needs no new design** — it dispatches to the exact same
functions manual entry already uses, so it inherits every guarantee above
for free, provided (per §7) it never introduces a second commit path.

## 9. Count integrity guarantees

Already fully guaranteed by the existing architecture, not something this
milestone needs to newly establish:

- The count is computed exclusively from the CardEvent ledger
  (`lib/counting-engine`), never from `Round.seats`/`splitHands`
  directly — confirmed by this session's own repeated verification of
  that boundary in prior rounds and by `Round.runningCount`'s own doc
  comment ("Never the source of truth").
- Each CardEvent carries its own `targetType`/`targetId` at creation and
  is never duplicated across targets — a split hand's cards are
  independent CardEvents with `targetType: "split"`, exactly as real,
  distinct physical cards, never a copy of the primary hand's cards.
- **The one thing that would violate this** is exactly the §5.1 option
  (B) "move a card to the split hand" design, if implemented as a naive
  delete-and-recreate rather than a real, carefully-designed
  target-reassignment operation — flagged there specifically so it's
  never implemented by accident as a shortcut.

## 10. Reporting behavior (what needs to change, not designed in detail here)

`reportBuilder.ts` needs to fold `round.splitHands` into the same
round-summary structure `round.seats` already produces — likely the
smallest, most mechanical piece of this whole milestone, and the
highest-value one to do FIRST (see §12), since it fixes a real, already-
existing gap that has nothing to do with voice. Exact schema shape (a
second "hand" array per seat vs. a flat list of hands each carrying their
own seat+hand-index) is an implementation-phase decision, not decided
here — either is compatible with the existing `SeatRoundRecord` shape.

## 11. Backward compatibility

No new migration work required. `splitHands` and every `SeatRoundRecord`
field this document discusses already exist in the current
`INVESTIGATION_SCHEMA_VERSION = 2` shape, and `normalizeInvestigation.ts`
already defaults a legacy record's missing `splitHands` to an empty map.
Voice-command wiring changes no stored shape at all — it only adds a new
way to call functions that already write today's shape.

## 12. Implementation phases (small, test-gated, in order)

Each phase is scoped to be independently reviewable and independently
shippable — no phase requires a later one to be safe to ship on its own.

1. **✅ DONE — Fix the reporting gap (§2, §10).** Folded `splitHands` into
   `reportBuilder.ts`'s round summary (`REPORT_SCHEMA_VERSION` 2 → 3, a
   split seat now produces `handIndex: 1`/`handIndex: 2` entries). 7 new
   regression tests, all passing. No CardEvent mutation, no card
   duplication, no counting-engine involvement.
2. **✅ DECIDED — §5.1 locked to option (A).** Leave Split's "new empty
   hand" behavior exactly as-is. No code change was needed for this
   decision itself.
3. **✅ DONE — Double/Undo/Redo verification AND fix (§8, §0.2).** Targeted
   automated tests added and passing (16 tests total in
   `InvestigationContext.integration.test.tsx`). The originally-found
   defect (Undo right after Double silently undoing a card instead) is
   now fixed: `undo()` checks the active target's own
   `doubled`/`doubledAtCardCount`/card-count state first, deterministically,
   and reverts the Double itself when no post-double card exists yet. A
   new, narrow `HistoryEntry` variant (`"target-double"`) makes this
   Redo-able too. Global LIFO behavior for ordinary/split-hand card entry
   is unchanged.
4. **✅ DONE — UX polish pass (§0.3, §6).** `HAND 1`/`HAND 2` switcher in
   `ActiveSeatHeader`, hand-context caption on the action row, spelled-out
   hand labels in the detail bar/sheet, enlarged seat-tile badge. 9 new
   tests in `SplitHandUX.test.tsx`. Presentation-only — no mutation/undo/
   counting-engine code touched.
5. **✅ DONE — Voice: Split/Double commands only (§7.2, §0.4).**
   Explicit-target-only "spot N split"/"spot N [hand H] double", dispatching
   to the existing manual `splitSeat`/`mutate` functions — never a parallel
   commit path. A bare double on a split seat is rejected as ambiguous
   (new `AMBIGUOUS_HAND_TARGET` code); a malformed hand number is blocked
   outright rather than falling through to narration (see §0.4's own
   account of the real bug this closed). 11 new tests in
   `VoiceSplitDouble.test.tsx`. Zero CardEvent/count mutation either way;
   Phase 2's Undo/Redo guarantees verified to hold for a voice-triggered
   Double.
6. **✅ DONE — Voice: EXPLICIT split-hand card targeting (§7.1 partial,
   §0.5).** "Spot 3 hand 1/2 has a [card]" — explicit-target-only, dispatches
   through the same `resolveCardEntryTarget`/`addCard` production path as
   every other card entry. Bare "spot 3 has a five" on a split seat now
   correctly rejects as ambiguous (`AMBIGUOUS_HAND_TARGET`) rather than
   silently landing on the primary hand, per §7.1's own already-locked
   safety rule. 24 new tests in `VoiceSplitHandCard.test.tsx`. A real
   cross-grammar bug between this and Phase 4's parser was found and fixed
   during this round (see §0.5). Conversational continuation for split
   hands is explicitly NOT part of this phase — see item 7 below.
7. **✅ DONE — Natural split-hand continuation (§7.1's other half, §0.6).**
   A bare card in a new utterance now continues onto whichever split hand
   (or ordinary seat) was last explicitly selected, using the existing
   sign-agnostic `activeTarget`/`resolveCardEntryTarget` mechanism — no new
   grammar. Never infers which hand is meant. Three pre-existing gaps
   found and fixed (`markSeatEmpty`, `undo()`'s round-snapshot branch, the
   "SPOT -3" confirmation-label bug). 17 new tests in
   `VoiceSplitHandContinuation.test.tsx`.
8. **🔶 PROTOCOL PREPARED, NOT RUN — Field Test #4 for split/double +
   split-hand-card voice.** `docs/EYEONPIT_VOICE_FIELD_TEST_4.md` — a full
   19-line ordered script (all three Split phrasings, Double on both an
   unsplit seat and both hands of a split seat, six accepted explicit
   card-entry forms across Spot/Player/Seat synonyms and both hands, the
   mandatory bare-target ambiguity rejection, three distinct malformed-hand
   rejections, the multi-card-under-one-hand rejection, and a full
   Undo→Redo round-trip), an exact mapping of this round's new
   `actionSummary` text shapes to the existing JSON export (nothing new
   needed there), and six explicit safety gates. **Not yet performed — no
   pass/fail result exists.** Do not treat Phase 4/5 as field-validated
   until this is actually run with a real microphone and the export
   reviewed. Would also be the natural place to evaluate any real ASR
   variants for the split-hand-card connector grammar (see §0.5's own note
   on deferring "as" and similar) — never added speculatively before this
   test runs.

Phase 6 (continuation) is now done — see item 7 above. Phase 8's protocol
document exists; the real-microphone session itself has not happened.

## 13. Files changed (Phases 1-6)

- `src/lib/reporting/reportBuilder.ts` — Phase 1, the reporting fix.
- `src/lib/reporting/reportSchema.ts` — Phase 1, `handIndex`/`doubled`
  fields, `REPORT_SCHEMA_VERSION` 2 → 3.
- `src/lib/reporting/reportBuilder.test.ts` — Phase 1, 7 new split-hand
  regression tests + one existing version-number assertion updated.
- `src/lib/utils/seatTarget.ts` — Phase 2, three new pure functions
  (`isDoubledWithNoPostDoubleCard`, `revertDouble`, `reapplyDouble`).
- `src/contexts/InvestigationContext.tsx` — Phase 2, the `undo()`/`redo()`
  fix and the new `"target-double"` `HistoryEntry` variant; `undoLabel`/
  `canUndo` updated to mirror the new priority.
- `src/contexts/InvestigationContext.integration.test.tsx` — Phase 2, 16
  total Double/Undo/Redo tests (the earlier defect-proving test replaced
  with tests proving the fix; 7 new scenarios added).
- `src/components/live/ActiveSeatHeader.tsx` — Phase 3, new spelled-out
  `HAND 1`/`HAND 2` switcher for split seats; unsplit-seat markup
  unchanged.
- `src/components/live/PlayerActionsRow.tsx` — Phase 3, hand-context
  caption above the action row for split seats only; button labels/
  behavior unchanged.
- `src/components/live/PlayerDetailSheet.tsx` — Phase 3, dialog title now
  spells out "Hand 1"/"Hand 2" for split seats; unsplit-seat title
  unchanged.
- `src/components/live/PlayerDetailBar.tsx` — Phase 3, compact row text
  now spells out "HAND 1"/"HAND 2" for split seats.
- `src/components/live/SeatTilesRow.tsx` — Phase 3, enlarged/clarified
  split-hand tile badge (20px → 24px, clearer `aria-label`).
- `src/components/live/SplitHandUX.test.tsx` — Phase 3, new file, 9 tests
  driving the real `LiveScreen` tree.
- `src/lib/voice/parseSplitDoubleCommand.ts` — Phase 4, new file. The
  closed six-shape grammar (§0.4) and the `{kind: "blocked"}` malformed-
  attempt safety state.
- `src/lib/voice/classifyVoiceTranscript.ts` — Phase 4, wires
  `parseSplitDoubleCommand` into N-best classification (new
  `"split-double"` `ClassificationSource`), checked before narration for
  the same INERT_ACTION_WORDS reason as the live dispatch path; a
  `{kind:"blocked"}` result returns an immediate `UNKNOWN_COMMAND`
  rejection rather than falling through.
- `src/lib/voice/voiceDiagnosticsTypes.ts` — Phase 4, new `RejectionCode`
  member `AMBIGUOUS_HAND_TARGET` + its `REJECTION_CODE_TEXT` entry.
- `src/components/live/VoiceControl.tsx` — Phase 4, the actual dispatch
  block (checked before the READ-ONLY QUERY layer, after table-change),
  plus `mutate`/`splitSeat` added to the existing context destructure and
  to `handleFinalResult`'s dependency array.
- `src/components/live/VoiceSplitDouble.test.tsx` — Phase 4, new file, 11
  tests driving the real `VoiceControl` component end to end.
- `src/lib/voice/parseSplitHandCardCommand.ts` — Phase 5, new file. The
  closed three-shape split-hand card grammar (§0.5) and its own
  `{kind: "blocked"}` malformed-attempt safety state, plus the deferral
  fix so a clean "double" tail correctly yields to Phase 4's parser.
- `src/lib/voice/parseSplitDoubleCommand.ts` — Phase 5, the cross-grammar
  fix (§0.5): its own `{kind:"blocked"}` fallback now defers (returns
  `null`) when a leftover tail's last token is a real card-rank word,
  instead of unconditionally blocking any tail containing "hand".
  `HAND_NUMBER_BY_WORD` exported for the new file to share, rather than
  duplicating the hand-number vocabulary.
- `src/lib/voice/classifyVoiceTranscript.ts` — Phase 5, wires
  `parseSplitHandCardCommand` into N-best classification (new
  `"split-hand-card"` `ClassificationSource`), checked immediately after
  Phase 4's split-double block, before narration.
- `src/components/live/VoiceControl.tsx` — Phase 5: the new split-hand-card
  dispatch block (same position as Phase 4's split/double block); the new
  `isAmbiguousSplitSeatCardTarget` helper and its two call sites (the
  legacy `card` dispatch path, gets the distinct `AMBIGUOUS_HAND_TARGET`
  code; `preflightNarration`'s card-op branch, for the multi-card-narration
  case); `addCard` added to the existing context destructure and to
  `handleFinalResult`'s dependency array.
- `src/components/live/VoiceSplitHandCard.test.tsx` — Phase 5, new file,
  24 tests driving the real `VoiceControl` component end to end.
- `src/contexts/InvestigationContext.tsx` — Phase 6, `markSeatEmpty` now
  also matches the negative (split-hand) form of the seat being emptied;
  `undo()`'s whole-round-snapshot branch now redirects `activeTarget` back
  to the primary hand when the restored round no longer has the split hand
  it was pointing at.
- `src/lib/voice/narrationConfirmation.ts` — Phase 6, `ConfirmationEntry`
  now carries a plain resolved `targetLabel: string` instead of a
  `VoiceTarget`, closing the "SPOT -3" split-hand confirmation bug.
- `src/lib/voice/narrationConfirmation.test.ts` — Phase 6, existing tests
  updated for the type change, plus one new split-hand-label test.
- `src/components/live/VoiceControl.tsx` — Phase 6, new round-aware
  `confirmationLabelFor` helper replaces the removed `fromCardTarget`
  (whose doc comment falsely claimed "never a split target"); both
  `preflightNarration` construction sites and `commitNarration` updated to
  use it.
- `src/components/live/VoiceSplitHandContinuation.test.tsx` — Phase 6, new
  file, 17 tests driving the real `VoiceControl` component end to end
  through complete spoken sequences.

**Not touched:** `src/lib/counting-engine/` (confirmed via `git status`),
`src/lib/db/repositories/investigations.ts` (`splitSeat` itself — §5.1
was decided as "no change," not implemented as one), the Phase 1 reporting
schema (read, not modified — see §0.5's reporting-association note),
any Phase 3 UI component, `src/lib/voice/parseNarration.ts` (its
INERT_ACTION_WORDS vocabulary is read, never modified — see §0.4/§0.5),
`src/app/lab/` (Sherpa A/B/C and Field Test #3 work preserved exactly).

## 14. Risks / open decisions requiring your approval

1. ~~§5.1~~ — **RESOLVED**, locked to option (A).
2. ~~Re-splits~~ — **RESOLVED**, out of 1.10 scope; Phase 1's `handIndex`
   field was deliberately kept extensible (`1 | 2` today, not hardcoded
   two-entry logic) so this stays non-blocking later.
3. ~~§6 UX flags~~ — **RESOLVED**: implemented in Phase 3 (§0.3) — HAND
   1/HAND 2 switcher, multi-channel active-hand signal, Double
   hand-context caption.
4. ~~§8 Double/Undo~~ — **RESOLVED**: verified, defect found, and fixed
   in Phase 2. One accepted, documented side effect remains (§0.2) — a
   pre-existing, harmless-in-practice "ghost" history entry, not
   something this fix introduced.
5. Reporting schema shape — **RESOLVED**: flat per-hand entries with
   `handIndex`, chosen and shipped in Phase 1.
6. Remaining usability note (not a defect): a split seat's table-overview
   tile can still independently show the tile's own cyan active-state AND
   the H2 badge's active-state at the same time — this was true before
   Phase 3 and is unchanged by it, since Phase 3 deliberately left the
   tile's badge as a secondary affordance rather than redesigning the
   dense multi-seat grid. Not raised as a defect; flagged for awareness
   only if a future round revisits `SeatTilesRow.tsx`.
7. ~~§7.2 voice Split/Double~~ — **RESOLVED**: implemented in Phase 4
   (§0.4).
8. ~~§7.1 explicit split-hand card targeting~~ — **RESOLVED**: implemented
   in Phase 5 (§0.5). ~~Conversational continuation for split hands~~ —
   **RESOLVED**: implemented in Phase 6 (§0.6, §12 item 7).
9. Split-hand-card connector vocabulary (§0.5) — deliberately narrower
   than plain-seat narration's own connector set (no "and"/"with"/"in"/
   "as"). Not a defect; flagged as a real, evidence-gated decision for the
   Field Test round (§12 item 8) to revisit if real ASR variants are
   captured that need one of those recognized for this specific phrase
   shape.

Phases 1-6 code changes are real, tested, and described above. Remaining
work to declare 1.10 complete: run the real-microphone Field Test #4
session (`docs/EYEONPIT_VOICE_FIELD_TEST_4.md`) and review its export —
nothing in Phases 1-6 should be treated as field-validated until that
happens.
