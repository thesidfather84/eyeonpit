# EyeOnPit — PC Voice Field Test #3 (protocol, not yet run)

**Status: prepared, 2026-08-20. NOT performed.** This document defines what
Field Test #3 validates, the exact phrase corpus, how to run it, and the
pass/fail criteria. No code was changed to produce this document — the
existing diagnostic tooling (`VoiceDiagnosticsPanel.tsx`, the JSON
session export, `sessionMetrics.ts`) already captures everything this
round needs; see §6 for why nothing new was built. **Do not mark this
complete, and do not report any pass/fail result, until a real operator
has spoken this script into a real Chrome/Edge session and the export has
been reviewed.**

---

## 1. Purpose — exactly what this validates

Field Test #2's remediation (`docs/EYEONPIT_VOICE_FIELD_TEST_2.md`) and the
subsequent "Final Chrome Patch" round (`docs/EYEONPIT_ROADMAP.md`, four
fixes: `"play the 3 hits gets a 4"`, `"player 3 hits of 4"`, `"players
that are down at spot 3"`, `"Taylor has a king in a five"`) were both
built and regression-tested **against text only** — every fix has a
passing `*.test.ts` case, but **none of it has been spoken into a real
browser since.** Field Test #3 is that first real check: does Chrome's
actual speech recognizer, on real hardware, in a real room, still produce
the transcripts these fixes were built to handle — and does the existing
pipeline still resolve them the same way the text-regression suite says it
should.

This is **not** a search for new grammar to add. Per explicit instruction,
if a real discrepancy shows up, it gets documented and reported — the
parser is not to be broadened just to make this test pass.

## 2. Methodology — reusing what already exists, not inventing a new one

Field Test #1 and #2 both used the same protocol, already built into the
production app:

1. Open EyeOnPit, start a **new, disposable test investigation** — not a
   real live surveillance case. Speaking this script through the real
   production voice pipeline genuinely writes real CardEvents (that's the
   point — it's testing the real pipeline, not a sandbox), so those writes
   must never land in an investigation anyone will treat as real casino
   data. Discard the investigation when done.
2. Open the Debug panel (`VoiceDiagnosticsPanel.tsx`) and speak the script
   in §4, one line at a time, waiting for each result before the next.
3. Click **Export JSON** (copies to clipboard) and paste the export
   somewhere it can be reviewed. `buildVoiceSessionExport`'s own doc
   comment guarantees this artifact **excludes** every real investigation
   field (no card events, no counts, no casino/table identifiers) — it's
   already a voice-pipeline-only diagnostic artifact, safe to share even
   though the live session behind it did write real (disposable) game
   data.

No new lab page, no new export format, no new instrumentation was built
for this round — the existing `VoiceUtteranceSummary` type already carries
every field §5 asks for. See §6 for the one field that was considered and
deliberately not added.

## 3. Scope boundaries (unchanged from every prior voice round)

- **Diagnostic-only in the sense that matters**: the *investigation* is
  disposable test data, never a real case. The *voice pipeline itself* is
  the real, unmodified production path — that's what makes this a genuine
  field test rather than a simulation.
- **No parser/classifier code was changed to prepare this test**, and none
  should be changed afterward except to fix a genuinely confirmed defect,
  reported first.
- **No counting-engine changes.** Nothing in this document or its prep
  touches `src/lib/counting-engine/`.
- **No milestone 1.10 (Split/Double) work.**

## 4. Test corpus

Every phrase below is copied verbatim from an existing, passing
regression test (`fieldTest2Regression.test.ts`, `realMicChromePatch.test.ts`,
`realMicSessionGate2.test.ts`) — nothing here is newly invented. Say each
phrase naturally, the way an operator actually would, and wait for the
result before moving on.

### 4.1 Dealer-confusion recovery (Chrome's real "dealer" mishearings)

1. "Taylor has a 10." — expect Dealer 10 (single-card recovery).
2. "Spotify has a five and a king." — expect Dealer 5, K, in that order (multi-card recovery).
3. "Taylor has a king and a five." — expect Dealer K, 5 (the original "and" form).
4. "Taylor has a king in a five." — expect Dealer K, 5 (the "in"→"and" connector fix).

### 4.2 Player-target ASR recovery

5. "Play your 7 has a four." — expect Spot 7: 4.
6. "Play sat down on spot one." — expect Spot 1 sat down (table-change).
7. "Play your spot one left." — expect Spot 1 left.
8. "New player at spot six." — expect Spot 6 sat down.
9. "Player sat down at spot one." — expect Spot 1 sat down.
10. "Players that are down at spot 3." — expect Spot 3 sat down (Final Chrome Patch fix).

### 4.3 The two remaining Final Chrome Patch fixes

11. "Play the 3 hits gets a 4." — expect Spot 3: 4.
12. "Player 3 hits of 4." — expect Spot 3: 4.

### 4.4 Active-target continuation (only relevant with a live active target — say a target first, e.g. "spot 3", then the line below)

13. "Has a 10 and a 3." — with Spot active: expect both cards on that spot.
14. "Has a 10 in a 3." — with Spot active: expect both cards (the "in" connector variant).
15. "Has a 5 and a 3." — with the **dealer** active instead of a spot: expect **REJECTED** — continuation must only ever resolve against a live player/spot target, never the dealer implicitly.

### 4.5 Compound narration

16. "Spot one stands, spot 3 hits, gets a 3." — expect an ordered compound: select Spot 1 (inert stand), select Spot 3, Spot 3 gets a 3.

### 4.6 Natural target-setting (no CardEvent expected)

17. "Current player is spot one." — expect Spot 1 becomes the active target; confirm **no card** was recorded.

### 4.7 Numeric/time safety (must reject, every time)

18. "3:55." — alone, expect REJECTED.
19. "At 3:55 and spot 6." — expect REJECTED, never a card.
20. Say "spot 6", then "has a 3:55." — expect REJECTED; "55" must never decompose into two extra cards even with a target already active.

### 4.8 Must-still-reject safety cases

21. "King ace." — no target, no connector grammar at all — expect REJECTED, even though a live target may be active elsewhere in the session.
22. "Player five has a." — incomplete narration — expect REJECTED.
23. Any random unrelated sentence you'd actually say on shift (e.g. "what time's the break") — expect REJECTED, zero commands.

### 4.9 Legacy/compact forms (must remain unaffected)

24. "Seat one has a five." — expect Spot 1: 5 (still resolves via the legacy single-command path).
25. "Seat two stand." — a complete inert-action statement — expect accepted normally.

### 4.10 CONTROL_DISABLED reason clarity (PRIORITY 8 wording)

26. Say "next hand" while the current round is genuinely incomplete (e.g. dealer cards not yet entered) — expect a **specific** reason ("Dealer cards pending — enter cards or declare a round exception"), not a generic "not available right now."
27. Say "start count" while the count is already running — expect "Count is already running — nothing to resume."

## 5. What to capture per phrase (all already in the existing export — nothing new needed)

For each line in §4, the JSON export's `utterances[]` array already carries,
per utterance:

| What you need | Where it is in the export |
|---|---|
| Raw transcript(s) heard | `alternatives[].transcript` (every alternative, not just the winner) |
| Normalized/recovered interpretation | `normalized`, plus `recoveryRuleId`/`normalizationRuleIds` when a recovery/normalization rule fired |
| Parser/classifier result | `actionSummary` (e.g. `"DEALER:K"`, `"SPOT3:5"` for a card; `"NEXT"`/`"SPLIT"` for a workflow op; a bare target name for a select-only op) |
| Accepted/rejected | `outcome` (`ACCEPTED`/`REJECTED`/`BLOCKED`) + `code` (the structured `RejectionCode`) + `resolveReason` (human text) |
| **Whether a CardEvent was (or would be) produced** | `actionSummary` containing `TARGET:RANK` (a colon followed by a rank token) means a card was written; a bare target name or an all-caps workflow word means no card. `outcome: "ACCEPTED"` with a `TARGET:RANK` summary means a REAL CardEvent was written to the disposable test investigation. |
| Latency | `speechStartToFinalMs`, `finalToCommitMs` |
| Active target before/after | `activeTargetBefore`/`activeTargetAfter` |

**"Expected phrase" and "correct/incorrect" are not in the export** — they
require the human operator, since only you know what you actually said.
Keep your own note (even just annotating the numbered list in §4 with a
✓/✗ as you go) alongside the exported JSON when reporting results back.

## 6. Why no new diagnostic tooling was built this round

The existing `VoiceUtteranceSummary` type (`voiceDiagnosticsTypes.ts`) and
`buildVoiceSessionExport` (`VoiceDiagnosticsPanel.tsx`) already carry every
field §5 needs. One additional explicit boolean field
(`producedCardEvent: boolean`) was considered, to save a reviewer from
parsing `actionSummary`'s shape by hand — but adding it means touching
`VoiceControl.tsx`'s `finishUtterance`, which is called from roughly
twenty call sites in the real production dispatch path. Given this round's
explicit instruction not to change production behavior "merely to make
Field Test #3 pass," and that the information is already fully derivable
from the existing `actionSummary` string (documented precisely in §5's
table above), this was judged not worth the added surface area on a
sensitive, heavily-called production function for a convenience-only
diagnostic field. If a future round wants it, it's a small, clearly-scoped
addition — not done here.

## 7. Pass/fail criteria

**Pass:** every phrase in §4 produces the outcome its own line describes —
the same result the text-regression suite already proves for that exact
transcript, now confirmed against real Chrome ASR output. Zero false
CardEvents (a card written that shouldn't have been, or the wrong
target/rank). Zero safety-case leaks (§4.7/§4.8 items ever producing a
card).

**Fail (report, do not silently work around):**

- Any §4.7/§4.8 case produces a CardEvent — a real safety regression,
  highest priority to report.
- Any §4.1–4.6/4.9/4.10 case is rejected when it should have been
  accepted, or accepted with the wrong target/rank — likely means Chrome's
  real ASR output for that phrase differs from the exact transcript the
  regression test encodes (a new ASR variant, not yet handled) — report
  the exact raw transcript from the export so it can be added as a new,
  narrow, closed-grammar case, the same way every prior round's real fixes
  were derived.
- `code`/`outcome` present but `resolveReason` is generic/unhelpful for a
  §4.10 case — a CONTROL_DISABLED-clarity regression.

A partial pass (some categories clean, others not) is a normal, expected
outcome — report exactly which lines failed and their raw transcripts;
that becomes the next round's remediation brief, exactly as Field Test #2
became this round's starting point.

## 8. What requires your real microphone

Everything in §4. Nothing in this document was run — there is no
microphone in the environment that prepared it. This is the entire reason
this document exists as a protocol rather than a completed report.
