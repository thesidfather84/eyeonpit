# EyeOnPit — PC Voice Field Test #4: Split/Double + Split-Hand Card (protocol, not yet run)

**Status: prepared, 2026-08-20. NOT performed.** This document defines what
Field Test #4 validates, the exact phrase corpus/script, how to run it, and
the pass/fail criteria for EyeOnPit 1.10 Phases 4-5 (voice Split/Double —
`docs/EYEONPIT_1_10_SPLIT_DOUBLE_DESIGN.md` §0.4 — and explicit split-hand
voice card targeting, §0.5). No production code was changed to produce this
document. **Do not mark this complete, and do not report any pass/fail
result, until a real operator has spoken this script into a real
Chrome/Edge session and the export has been reviewed.**

Conversational split-hand continuation (a later card resolving against a
previously-named hand with no fresh target spoken) is explicitly **NOT**
covered here — it isn't implemented yet (§12 of the design doc lists it as
future work), so there is nothing to field-test.

---

## 1. Purpose — exactly what this validates

Phases 4 and 5 were built and regression-tested **against text only** —
every command shape (Split, Double, explicit Hand 1/Hand 2 card targeting,
every rejection path, the cross-grammar collision fix between the two
parsers) has a passing `*.test.ts`/`*.test.tsx` case, but **none of it has
been spoken into a real browser since.** Field Test #4 is that first real
check: does Chrome's actual speech recognizer, on real hardware, in a real
room, produce transcripts the two new parsers (`parseSplitDoubleCommand.ts`,
`parseSplitHandCardCommand.ts`) correctly recognize — and, just as
importantly, does every rejection path still correctly reject with a real
microphone, never silently misfiring a CardEvent.

This is **not** a search for new grammar to add. Per explicit instruction,
if a real ASR variant surfaces that the current grammar doesn't handle, it
gets documented and reported — the parser is not to be broadened before or
during this test based on a hypothetical failure; only a real, captured
transcript from this session is grounds for a follow-up fix.

## 2. Methodology — reusing what already exists, not inventing a new one

Identical protocol to Field Test #3 (`docs/EYEONPIT_VOICE_FIELD_TEST_3.md`),
already built into the production app:

1. Open EyeOnPit, start a **new, disposable test investigation** — not a
   real live surveillance case. Speaking this script through the real
   production voice pipeline genuinely writes real CardEvents and doubles
   real (test) wagers — that's the point, it's testing the real pipeline —
   so those writes must never land in an investigation anyone will treat
   as real casino data. Discard the investigation when done.
2. Open the Debug panel (`VoiceDiagnosticsPanel.tsx`) and speak the script
   in §4, one line at a time, waiting for each result before the next.
   Keep the live table visible at the same time (not just the Debug
   panel) — Phase 3's `ActiveSeatHeader` HAND 1/HAND 2 switcher is your
   second, independent confirmation channel: watch it, alongside the
   diagnostics pill, for which hand actually received each card.
3. Click **Export JSON** (copies to clipboard) and paste the export
   somewhere it can be reviewed. `buildVoiceSessionExport`'s own doc
   comment guarantees this artifact **excludes** every real investigation
   field (no card events, no counts, no casino/table identifiers) — it's
   already a voice-pipeline-only diagnostic artifact, safe to share even
   though the live session behind it wrote real (disposable) game data.

No new lab page, no new export format, and no new instrumentation was
built for this round — see §6 for why, and exactly how to read the
EXISTING `VoiceUtteranceSummary` export for these two new command families
specifically (their `actionSummary` shape is new text this round
introduced, even though the export mechanism itself is unchanged).

## 3. Scope boundaries

- **Diagnostic-only in the sense that matters**: the *investigation* is
  disposable test data, never a real case. The *voice pipeline itself* is
  the real, unmodified production path.
- **No parser/classifier code was changed to prepare this test**, and none
  should be changed afterward except to fix a genuinely confirmed defect,
  reported first — never a hypothetical one guessed at in advance.
- **No counting-engine changes.** Nothing here touches
  `src/lib/counting-engine/`.
- **No conversational split-hand continuation** — not implemented, not
  tested, not scoped by this document.
- **All current uncommitted Phase 1-5 work, Sherpa A/B/C, and Field Test
  #3 are preserved exactly** — this round added one new file only.

## 4. Test corpus — a single ordered script, not independent phrases

Unlike Field Test #3's independent one-liners, Split/Double/split-hand-card
commands are **stateful** (a seat can't be split twice; a hand can't be
doubled twice) — so this corpus is one continuous script against ONE
disposable investigation, seats numbered so no line accidentally collides
with an earlier line's new state. The exact seat NUMBER used per line
matters only for sequencing; the words/grammar being tested are what to
pay attention to, copied as closely as possible from the passing
regression tests in `VoiceSplitDouble.test.tsx`/`VoiceSplitHandCard.test.tsx`.

**Setup (once, before line 1):** Occupy Spots 3, 4, 5, and 6 (tap each
seat tile, or say "spot 3"/"spot 4"/"spot 5"/"spot 6" — either way; this
setup step isn't itself part of what's being field-tested). Give each a
small bet, e.g. $25 (tap the quick-bet panel) — not strictly required for
Split/Double to function, but makes the wager-doubling effect visibly
obvious to confirm by eye.

### Scene 1 — Split (all three accepted phrasings, one seat each)

1. "Spot 3 split." → **expect ACCEPTED** — Spot 3 splits (Hand 2 appears
   in the live UI); spoken confirmation "Spot 3 split."
2. "Player 4 split." → **expect ACCEPTED** — Spot 4 splits, via the
   "player" synonym.
3. "Split spot 5." → **expect ACCEPTED** — Spot 5 splits, via the
   leading-verb form.

(Spot 6 is deliberately left unsplit for Scene 2's first line.)

### Scene 2 — Double

4. "Spot 6 double." → Spot 6 is **unsplit** → **expect ACCEPTED** — its
   one hand doubles, wager visibly doubles. (This is the task's "Spot 3
   double on unsplit seat" case — Spot 6 substituted only because Spot 3
   was split in Scene 1; the grammar and expected behavior are identical
   regardless of which seat digit is spoken.)
5. "Spot 3 Hand 1 double." → Spot 3 is split (Scene 1) → **expect
   ACCEPTED** — Hand 1 doubles; confirm Hand 2 is UNCHANGED.
6. "Spot 3 Hand 2 double." → **expect ACCEPTED** — Hand 2 doubles;
   confirm Hand 1 stays doubled from line 5 (unaffected either way).

### Scene 3 — Explicit split-hand card entry (accepted forms)

7. "Spot 4 Hand 1 has a five." → Spot 4 is split, clean (not doubled) →
   **expect ACCEPTED** — one card, Hand 1 shows 5; Hand 2 stays empty.
8. "Spot 4 Hand 2 has a king." → **expect ACCEPTED** — one card, Hand 2
   shows K; Hand 1 stays at just the 5.
9. "Player 5 Hand 1 has an ace." → Spot 5 is split, clean → **expect
   ACCEPTED** — one card, Hand 1 shows A.
10. "Player 5 Hand 2 has a ten." → **expect ACCEPTED** — one card, Hand 2
    shows 10.
11. "Seat 4 Hand 1 has a seven." (representative **Seat** variant) →
    **expect ACCEPTED** — Hand 1 now shows two cards, 5 and 7 (a second
    card lands correctly on the SAME hand a prior line already used).
12. "Seat 4 Hand 2 has a queen." (representative **Seat** variant) →
    **expect ACCEPTED** — Hand 2 now shows two cards, K and Q.

### Scene 4 — Safety: must reject, every time

13. "Spot 5 has a five." → Spot 5 IS split (Scene 1) but this line names
    **no hand** → **expect REJECTED as AMBIGUOUS_HAND_TARGET.** Confirm
    via the live UI that NEITHER of Spot 5's hands gained a card (still
    exactly A on Hand 1, 10 on Hand 2 from Scene 3).
14. "Spot 4 Hand 3 has a five." → malformed hand number → **expect
    REJECTED**, "Not recognized." Zero new CardEvent.
15. "Spot 4 Hand zero has a five." → malformed hand number → **expect
    REJECTED**, "Not recognized." Zero new CardEvent.
16. "Spot 4 Hand has a five." → malformed — no hand number at all →
    **expect REJECTED**, "Not recognized." Zero new CardEvent.
17. "Spot 4 Hand 1 has a five and a king." → a multi-card attempt under
    one named hand — **explicitly out of scope for this phase** → **expect
    REJECTED**, "Not recognized," never a partial entry of just the five.
    Confirm Hand 1 is UNCHANGED (still exactly 5, 7 from lines 7/11).

### Scene 5 — Undo/Redo after voice entry

18. "Undo." → **expect ACCEPTED** — reverts line 12's card (the queen):
    Spot 4 Hand 2 should drop back to showing just K; Hand 1 stays
    unchanged (5, 7); the displayed count should shift back by exactly
    the queen's Hi-Lo value (+1, since a ten-value card is -1 and undoing
    it moves the count back up by 1).
19. **Redo — no voice command exists for this** (confirmed during Phase 5
    development: only "Undo" is a recognized voice workflow word; there is
    no "redo" phrase anywhere in the grammar). Use the app's own visible
    Undo/Redo control (the manual on-screen button, not voice) to redo,
    and confirm the queen returns to Spot 4 Hand 2 exactly as before line
    18, and the count restores to its line-12 value. This step is
    included specifically so you don't spend time trying to speak "redo"
    and wondering why nothing happens — that's expected, not a bug.

**19 spoken lines total** (18 commands + 1 explicit non-voice UI step),
covering every phrase category the task requested: all three Split
phrasings, Double on both an unsplit seat and both hands of a split seat,
six accepted explicit card-entry forms across Spot/Player/Seat synonyms
and both hands, the mandatory bare-target ambiguity rejection, three
distinct malformed-hand rejections, the multi-card-under-one-hand
rejection, and a full Undo → Redo round-trip.

## 5. What to capture per line

The existing `VoiceUtteranceSummary` export (`voiceDiagnosticsTypes.ts`,
unchanged this round) already carries everything below — nothing new was
built. The ONE thing that IS new this round is the exact TEXT shape
`actionSummary` takes for these two command families, since Phases 4-5
introduced their own confirmation wording (verified directly against the
shipped `VoiceControl.tsx` source, not guessed):

| Field you need | Where it is in the export |
|---|---|
| Raw transcript(s) heard | `alternatives[].transcript` (every alternative, not just the winner) |
| Normalized/classified interpretation | `normalized` |
| Resolved target (which hand) | `activeTargetAfter` — `SEAT3` = Spot 3's primary/Hand 1; `SEAT-3` (negative) = Spot 3's Hand 2. This is the existing, unchanged `CardTarget` convention (`splitTargetFor`), simply surfaced as a signed number in the log. |
| Accepted/rejected | `outcome` (`ACCEPTED`/`REJECTED`) + `code` + `resolveReason` |
| Whether a CardEvent was (or would be) produced, and which hand | `actionSummary` — see the exact shapes table below |
| Count delta | Read the live HI-LO running count pill before and after each line (not itself in the JSON export as a delta, but the export's own `SUMMARY` log line plus the visible pill together tell you unambiguously) |
| Latency | `speechStartToFinalMs`, `finalToCommitMs` |

**Exact `actionSummary` text this round's code produces** (for reading the
export without guessing):

| Command | Outcome | `actionSummary` | `code` |
|---|---|---|---|
| Split, accepted | ACCEPTED | `Spot N split` | — |
| Split, rejected (already split / no hand / locked) | REJECTED | `Spot N split` | `CONTROL_DISABLED` |
| Split/Double, malformed (e.g. bad hand number) | REJECTED | `split/double` | `UNKNOWN_COMMAND` |
| Double, accepted, unsplit seat | ACCEPTED | `Spot N doubled` | — |
| Double, accepted, explicit Hand 1 | ACCEPTED | `Spot N Hand 1 doubled` | — |
| Double, accepted, explicit Hand 2 | ACCEPTED | `Spot N Hand 2 doubled` | — |
| Double, rejected, bare on a split seat | REJECTED | `Spot N double` | `AMBIGUOUS_HAND_TARGET` |
| Double, rejected, other (no hand yet / already doubled / locked) | REJECTED | `Spot N double` | `CONTROL_DISABLED` |
| Split-hand card, accepted, Hand 1 | ACCEPTED | `Spot N Hand 1: <rank>` | — |
| Split-hand card, accepted, Hand 2 | ACCEPTED | `Spot N Hand 2: <rank>` | — |
| Split-hand card, malformed (bad/missing hand number, or a multi-card tail) | REJECTED | `split-hand card` | `UNKNOWN_COMMAND` |
| Split-hand card, rejected (hand doesn't exist yet / locked) | REJECTED | `Spot N Hand H card` | `CONTROL_DISABLED` |
| Bare card on an explicit, already-split seat (no "hand" spoken at all) | REJECTED | `Spot N card` | `AMBIGUOUS_HAND_TARGET` |

`<rank>` echoes the SPOKEN face-card letter (`A`/`K`/`Q`/`J`) when one was
said, not the stored ledger value — a spoken "king" always writes rank
`"10"` to the actual CardEvent/count (same as every other card-entry
surface in this app), `actionSummary`/the spoken confirmation just say "K"
for readability. This is pre-existing behavior, not new to Phase 4/5.

**"Expected phrase," "actual vs. expected hand," and "correctness mark"
are not in the export** — they require you, the operator, since only you
know what you actually said and intended. Annotate the numbered script in
§4 directly (a ✓/✗ column, plus the raw transcript when it differs from
what you said) as you go, and keep that alongside the exported JSON when
reporting results back.

## 6. Why no new diagnostic tooling was built this round

Same reasoning as Field Test #3's own §6, re-verified for these two
specific new command families: `VoiceUtteranceSummary` already carries
every field §5 needs, and Phase 3's `ActiveSeatHeader` HAND 1/HAND 2
switcher already gives a second, fully independent, at-a-glance visual
channel for "which hand did this actually land on" — exactly the kind of
cross-check a reviewer would otherwise want a new diagnostic field for.
Adding a convenience field (e.g. an explicit `hand: 1 | 2` on the export
type) would mean touching `finishUtterance`, called from roughly thirty
production dispatch sites now (six more than Field Test #3's count, all
from Phases 4-5) — explicitly out of bounds per this round's own
instruction not to modify production dispatch merely for nicer
diagnostics. If a future round wants it, it's a small, clearly-scoped
addition — not done here.

## 7. Explicit safety gates

Beyond the per-line pass/fail in §4/§8, confirm these six invariants hold
across the ENTIRE script, not just individual lines:

1. **Zero false CardEvents from rejected/malformed commands.** Every line
   in Scene 4 (13-17) must leave the live card counts on every hand
   EXACTLY where they were before that line — verify by eye against the
   live UI, not just the export's `outcome: "REJECTED"` field.
2. **Zero wrong-hand entries.** Every ACCEPTED card in Scenes 2-3 must land
   on the hand its own `actionSummary` (§5's table) names — cross-checked
   against the live `ActiveSeatHeader` display, not the export alone.
3. **Exactly one CardEvent per accepted spoken card.** Each of lines 7-12
   must increase exactly one hand's visible card count by exactly one —
   never zero, never two.
4. **Exactly one count change per accepted physical card.** The HI-LO
   running count pill must move by exactly that one card's Hi-Lo value
   per accepted line — no double-counting, no silent skip.
5. **A bare split-seat target never guesses a hand.** Line 13 is the
   direct test of this; it must reject, not silently pick Hand 1.
6. **Malformed hand phrases never fall through to ordinary card
   parsing.** Lines 14-16 must each show `outcome: "REJECTED"` with
   `code: "UNKNOWN_COMMAND"` (or the visible "Not recognized" pill) — if
   any of them instead shows an `ACCEPTED` card summary for a DIFFERENT,
   unintended rank, that is the exact silent-misfire failure mode Phase
   5's own development round found and fixed once already (see
   `docs/EYEONPIT_1_10_SPLIT_DOUBLE_DESIGN.md` §0.5) — a real regression,
   highest priority to report.

## 8. Pass/fail criteria

**Pass:** every line in §4 produces the outcome its own line describes,
confirmed against BOTH the diagnostics export AND the live table display,
and all six §7 safety gates hold for the whole script.

**Fail (report, do not silently work around):**

- Any §7 safety gate is violated anywhere in the script — highest
  priority to report, especially gate 6 (malformed hand phrase producing
  a real card).
- Any Scene 1-3/5 line is rejected when it should have been accepted, or
  accepted with the wrong hand/rank — likely means Chrome's real ASR
  output for that phrase differs from the exact transcript the regression
  test encodes (a new ASR variant, not yet handled). Report the exact raw
  transcript from `alternatives[].transcript` in the export so it can be
  considered as a new, narrow, closed-grammar case in a follow-up round —
  never added speculatively before this test runs.
- Any Scene 4 line is accepted, or produces any card on any hand.
- Line 19's manual (non-voice) Redo doesn't restore the queen to the
  correct hand — this exercises Phase 2's Undo/Redo guarantees applying
  correctly to a voice-entered split-hand card, not the voice pipeline
  itself, but is still worth reporting precisely if it fails.

A partial pass (some scenes clean, others not) is a normal, expected
outcome — report exactly which lines failed, their raw transcripts, and
which §7 gate (if any) they violated; that becomes the next round's
remediation brief, exactly as Field Test #2 became a prior round's
starting point.

## 9. What requires your real microphone

Everything in §4. Nothing in this document was run — there is no
microphone in the environment that prepared it. This is the entire reason
this document exists as a protocol rather than a completed report.
