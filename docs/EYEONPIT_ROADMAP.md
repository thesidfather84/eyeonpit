# EyeOnPit — Roadmap

This tracks what's actually been shipped and what's actively planned, at the
milestone level. It is not a design document — for product direction and
requirements, see `docs/EYEONPIT_PRODUCT_SPEC.md`; for day-to-day usage, see
`docs/EYEONPIT_OPERATOR_MANUAL.md`; for user-facing release history, see the
public [Release Notes](../src/app/(site)/docs/release-notes/page.tsx) page.
This file is the internal, engineering-facing companion to that page — same
history, aimed at contributors rather than operators.

---

## Completed

### Sherpa Real A/B/C Mic Session — Findings, Safety Fix, Finalization Fix, Lab UX Fix (2026-08-20)

**Problem:** the user ran the real production A/B/C microphone comparison
(§9.4/§10 of `docs/EYEONPIT_VOICE_PROVIDER_RESEARCH.md`) that every prior
round could build but not itself execute. Three things came out of it: a
headline result (C preferred on phrase-level blackjack recognition
quality), a real safety defect (a false `SEAT5:3` CardEvent from a phrase
that never named a seat), and a real finalization defect (FINAL transcripts
missing their last word even when an interim already had it right).

**Headline result:** A (hotwords off) clearly inferior. B (shipped
cjkchar/lowercase) and C (tuned bpe/uppercase) close in aggregate rate
(44.4%/25.9% vs. 44.0%/28.0%, on 27 vs. 25 completed records — NOT equal-N,
reported as captured, never padded), but **C preferred anyway** — it
correctly recovered specific real Dealer/Player phrases A and B both
missed, which is the actual criterion, not the aggregate percentage.

**Safety defect found and fixed:** "Has a five and a three" (no seat named)
was misrecognized by Sherpa (config B) as "FIVE IN THE THREE," which
EyeOnPit's own classifier then read as `SEAT5:3` — a false, accepted
CardEvent. Root-caused to a **generic, provider-agnostic defect in
`parseNarration.ts`'s leading-seat-shorthand rule** (not Sherpa-specific):
it treated a bare number followed by ANY hand-connector word, including two
words (`in`/`as`) already documented elsewhere in the same file as
ASR-recovery-only aliases, as sufficient evidence to invent a brand-new
seat target. Fixed by requiring the immediate connector to be exactly
`"has"` — the only word any existing test or real transcript ever actually
uses in that position; every legitimate shorthand phrase is unaffected,
Browser Web Speech's own behavior was not weakened, and this fix protects
BOTH providers equally, since the bug is reachable from any provider that
produces this token shape.

**Finalization truncation investigated and a real defect fixed:** traced to
a genuine delivery race in `SherpaOnnxProvider.stop()` — audio already
captured by the AudioWorkletProcessor but not yet delivered to the main
thread at the exact instant "End Phrase" was clicked was silently dropped
before finalization. Fixed with a finalization DRAIN (`stop()` now awaits
one event-loop tick before flushing) — purely additive ordering, never a
promotion of interim text to final. Extracted as a pure, unit-tested
function (`finalizeSherpaStream`) specifically so this has real regression
coverage without a microphone. A second, real property of
`modified_beam_search` decoding (its top hypothesis can in principle
re-rank during the trailing flush) was investigated and documented but not
acted on — the delivery race is independently sufficient and is the only
one of the two with a deterministic fix; re-ranking remains a documented
open question for a future session if truncation recurs after this fix.

**Lab UX fixed:** switching the A/B/C selector previously left the phrase
run wherever the previous configuration had reached, requiring a page
reload — a real, confirmed contributor to the session's unequal
per-configuration completed-record totals (A=26, B=27, C=25). Now resets
the phrase run to Phrase 1 and clears transient session state automatically
on any config/provider switch, with no reload; the active configuration is
now shown as a persistent, unmistakable banner; the aggregate table now
flags unequal totals explicitly rather than presenting them as a controlled
comparison. Grouping/config-mapping logic extracted to
`src/lib/voice/sherpaAbTestHarness.ts`, pure and unit-tested.

**Configuration decision:** config C is now the default selection on
`/lab/sherpa-voice-test` load (Lab-only — production EyeOnPit does not
reference Sherpa-ONNX anywhere and is completely unaffected). A and B
remain fully selectable for ongoing comparison.

**Explicitly not done:** Sherpa was NOT made the production voice provider
— it remains EXPERIMENTAL, Lab-only, gated behind `/lab`, never wired into
`VoiceControl.tsx`/`useVoiceRecognition.ts`. No new hotword aliases or
grammar were added speculatively. No 1.10 Split/Double behavior touched. No
`counting-engine/` changes.

**Tests:** 6 new regression tests in `parseNarration.test.ts` (the false
SEAT5:3 fix + legitimate-form preservation), 4 new in
`classifyVoiceTranscript.test.ts` (classification-layer confirmation), 6 new
in `sherpaOnnxProvider.test.ts` (`finalizeSherpaStream` ordering
guarantees), a new `sherpaAbTestHarness.test.ts` (11 tests — config mapping,
aggregate grouping, unequal-totals accounting), and a new Lab page test
(`page.test.tsx`, 5 tests — config-switch reset, records preserved across
switches). Full suite green (1509 passed, 1 pre-existing CPU-contention
flake reconfirmed passing in isolation, 1 pre-existing skip), `tsc --noEmit`
clean, `eslint` clean, `counting-engine/` diff empty.

**Status:** complete, gates green. See
`docs/EYEONPIT_VOICE_PROVIDER_RESEARCH.md` §11 for full detail. Recommended
next step: a follow-up real-mic session specifically re-running the Dealer/
Player phrases that previously truncated, to confirm the finalization drain
fix actually eliminates the pattern in practice (see §11.3's own note on
what would count as evidence the beam-search-re-ranking mechanism is also
contributing).

### 1.10 Split/Double — Phase 6, Natural Split-Hand Continuation (2026-08-20)

**Scope:** once an operator explicitly selects a split hand ("spot 3 hand
2 has a five"), a subsequent bare card in a new utterance ("king") now
continues onto that same hand — no new target needs to be spoken. This is
the "conversational continuation" half of §7.1 that Phase 5 explicitly
left open. No new voice grammar was added: the bare-card continuation
path is the exact mechanism that has always continued onto whatever
`activeTarget` currently is for an ordinary seat — Phase 6 verified (and
fixed three real gaps in) that this already sign-agnostic mechanism stays
correct when `activeTarget` is negative (a split hand).

**Why this was nearly free:** `activeTarget`'s signed-number convention
(positive = primary hand, negative = split hand, since Phase 4/5) meant
the production write path (`useCardEntry` → `resolveCardEntryTarget`) and
the multi-card narration continuation gate
(`allowUnscopedContinuation: activeTarget !== "dealer"`) were both already
completely agnostic to the sign of `activeTarget`. 14 of the first 17
integration tests written for this phase passed on the first run against
zero new production code.

**Three real pre-existing gaps found and fixed:** (1) `markSeatEmpty`
only cleared `activeTarget` for the positive form of the seat being
emptied, even though emptying a seat clears both its hands — a stale
negative target would have silently rejected every later bare-card
continuation. (2) `undo()`'s whole-round-snapshot branch (how undoing a
bare Split, before any card on Hand 2, is reached) never repaired
`activeTarget` when the restored round no longer had the split hand it
pointed at. (3) Multi-card narration confirmation carried a `VoiceTarget`
(structurally always a positive 1-7 seat) — continuing onto an active
split hand with no target named in that utterance rendered as the
nonsensical "SPOT -3"; replaced with a plain resolved `targetLabel`
string via a new round-aware `confirmationLabelFor` helper.

**Never guesses:** a split seat named without an explicit hand ("spot 3
has a five") still rejects `AMBIGUOUS_HAND_TARGET` exactly as Phase 5 left
it. **Fail-closed:** a stale split-hand target whose hand ceases to exist
rejects the next bare card gracefully ("not enabled") and writes zero
CardEvents, never misapplying it. **Boundaries:** round-advance and
seat-leaving already unconditionally reset `activeTarget` to a valid
value by construction — Phase 6 added tests proving this, not new code.

**Tests:** 17 new tests in
`src/components/live/VoiceSplitHandContinuation.test.tsx`, driving the
real `VoiceControl` component through complete spoken sequences (not
isolated parser strings) — explicit-hand-then-bare-card continuation for
both hands, target switching in both directions between an ordinary seat
and a split hand, switching between Hand 1 and Hand 2, Double preserving
active-hand targeting, Undo/Redo of a continuation card, self-healing
after undoing a bare Split, round-boundary clearing, seat-leaving
redirect, six fail-closed cases, and a 4-card count-integrity sequence
across both hands. Full suite green (1479 passed, 1 pre-existing skip),
`tsc --noEmit` clean, `eslint` clean, `counting-engine/` diff empty,
Sherpa provider/deployment and Field Test #4 protocol untouched.

**Status:** Phase 6 complete — see commit hash in the session's final
report. **Not field-validated.** Voice Split/Double, explicit split-hand
card targeting, and this natural continuation all remain implemented and
text-verified only, pending the real-microphone Field Test #4 session
(`docs/EYEONPIT_VOICE_FIELD_TEST_4.md`) and export review. See
`docs/EYEONPIT_1_10_SPLIT_DOUBLE_DESIGN.md` §0.6/§12 item 7 for full
detail.

### Sherpa Lab "assets-not-found" Production Fix — Vercel Blob Deployment (2026-08-20)

**Problem:** a real production mic session against `/lab/sherpa-voice-test`
failed 30/30 with `error: "assets-not-found"` and zero recognition output.
Root cause: the ~204MB WASM/model/vocab bundle
(`public/sherpa-onnx-lab/`) is gitignored and was never committed, so
Vercel's deployment never contained it — every asset request 404'd before
the recognizer could even initialize. Confirmed present in every prior
committed version of the provider, not a regression from recent work.

**Fix:** uploaded the exact locally-verified assets (byte-identical,
sha256-checked) to a new public-read Vercel Blob store, at the
version-pinned, immutable path
`sherpa/en-zipformer-2023-06-21-v1.13.6/` (encodes both the model identity
and the engine/WASM release), and pointed production's
`NEXT_PUBLIC_SHERPA_ASSET_BASE_URL` at it. Local dev is unaffected (still
defaults to the gitignored local path). Total footprint: 204,249,120 bytes
(≈194.8 MiB) across 5 files, every URL verified reachable with the correct
`Content-Length` before any production config change.

**A real bug found and fixed in the same round:** the first
implementation of the env-var override silently never worked, because
Next.js's build-time inlining of `NEXT_PUBLIC_*` vars only recognizes the
literal `process.env.NEXT_PUBLIC_X` expression in source — passing the
whole `process.env` object into a function defeated it. Caught by the
local verification itself (requests kept hitting the local path even with
the env var set) before it ever reached production.

**Also shipped:** error diagnostics now name the exact failing asset
URL/detail instead of a bare generic code; a new asset manifest
(`sherpaAssetManifest.ts`, filename/size/sha256/version per file) with a
real runtime size check wired into the one asset fetched via plain
`fetch()` (`bpe.vocab`) — the `.wasm`/`.data`/glue files are loaded via
Emscripten's own internal fetch, which isn't hookable the same way, and
that's disclosed as a known scope boundary, not silently glossed over.

**Verified locally, both ways:** the recognizer reaches `status:
"listening"` with zero errors against (1) the local `/sherpa-onnx-lab/*`
files (default, unaffected) and (2) the real Blob-hosted URLs exclusively
(confirmed via network-request inspection — zero local-path requests),
~6.5s load over the real CDN vs. ~2.4s over localhost, ~205MB JS heap
either way. **Recognition accuracy against the Blob-hosted assets has NOT
been measured** — construction/loading only; a real microphone session
against the deployed production page is still required.

**Tests:** 10 new (`sherpaOnnxProvider.test.ts` — `resolveDefaultAssetBaseUrl`/
`classifySherpaStartError`) + 12 new (`sherpaAssetManifest.test.ts`). Full
suite green (1461 passed, 1 pre-existing skip), `tsc --noEmit` clean,
`eslint` clean, `counting-engine/` diff empty, 1.10 Split/Double, Field
Test #3/#4, and production Browser Web Speech/`VoiceControl.tsx` all
untouched.

**Status:** committed and pushed — see commit hash in the session's final
report. Sherpa-ONNX remains an EXPERIMENTAL, Lab-only provider, not
production-ready; this round fixed asset DEPLOYMENT, not recognition
ACCURACY, which is still awaiting the user's real-microphone session
against the live deployed page.

### PC Voice Field Test #4 — Protocol Prepared (2026-08-20)

**Problem:** EyeOnPit 1.10 Phases 4 (voice Split/Double) and 5 (explicit
split-hand voice card targeting) were both built and regression-tested
against TEXT only — every command shape and every rejection path has a
passing automated test, but none of it has been spoken into a real Chrome
session since. Needed a concise, real-microphone test script before either
phase can be considered field-validated, mirroring the standing "do not
skip a Field Test" discipline already established for Field Test #3.

**What shipped:** `docs/EYEONPIT_VOICE_FIELD_TEST_4.md` — a full protocol
(purpose, methodology, a single 19-line ordered script covering all three
Split phrasings, Double on an unsplit seat and both hands of a split seat,
six accepted explicit split-hand card forms across Spot/Player/Seat
synonyms, the mandatory bare-target ambiguity rejection, three malformed-
hand rejections, the multi-card-under-one-hand rejection, and a full
Undo→Redo round-trip), an exact table mapping this round's new
`actionSummary` confirmation-text shapes to the existing JSON export, and
six explicit safety gates (zero false CardEvents, zero wrong-hand entries,
exactly one CardEvent/count-change per accepted card, bare split-seat
targets never guessing a hand, malformed hand phrases never falling
through). **Zero production code was changed** — the existing
`VoiceUtteranceSummary`/`buildVoiceSessionExport` diagnostic tooling and
Phase 3's own `ActiveSeatHeader` HAND 1/HAND 2 display already capture
everything the protocol needs; see the doc's own §6 for why no new
diagnostic field was added, given how many more production dispatch sites
it would touch after Phases 4-5.

**Explicitly not done:** the actual real-microphone session — this is a
protocol, not a completed test. No grammar was changed or broadened based
on any hypothetical ASR failure. No parser/classifier behavior changed. No
counting-engine changes. No conversational split-hand continuation (not
implemented, so nothing to test). All current uncommitted Phase 1-5 work,
Sherpa A/B/C, and Field Test #3 preserved exactly.

**Tests:** no new tests (documentation-only round). Full suite green (1440
passed, 1 pre-existing skip), `tsc --noEmit` clean, `eslint` clean.

**Status:** protocol complete, pending review. Not committed/pushed. Voice
Split/Double and split-hand card targeting remain **implemented and
text-verified, but not field-validated** until the user runs this script
with a real microphone and reviews the export — see
`docs/EYEONPIT_1_10_SPLIT_DOUBLE_DESIGN.md`'s top status banner and §12
item 8.

### 1.10 Split/Double — Phase 5, Explicit Split-Hand Voice Card Targeting (2026-08-20)

**Scope:** voice CARD entry that names both the seat AND the hand
explicitly — "spot 3 hand 1 has a five", "spot 3 hand 2 has a king" (and
the connector-less "spot 3 hand 1 five" form, already tolerated for a
plain seat and inherited here unchanged). Conversational continuation for
split hands (a later card resolving against a previously-named hand with
no fresh target spoken) is explicitly NOT implemented — genuinely open,
separate future work.

**The core safety fix this phase adds:** "Spot 3 has a five" (no "hand"
word) on an ALREADY-SPLIT seat now correctly rejects as ambiguous
(`AMBIGUOUS_HAND_TARGET`) instead of silently landing on the primary hand
— enforcing a rule the design doc's own §7.1 had already locked before
this phase started ("never guess which hand a bare target phrase means
once a seat has split"). Enforced at the two places a plain, explicit
seat-target card is ever resolved (the legacy single-card dispatch path,
and `preflightNarration`'s card-op branch for multi-card narration), via a
new shared `isAmbiguousSplitSeatCardTarget` check — never for a card with
no target at all, which keeps ordinary bare-card continuation against
whatever's already active completely untouched.

**Targeting:** Hand 1 → the seat's existing positive-number target. Hand 2
→ the existing `splitTargetFor(seat)` negative-number target. Both flow
through the identical `resolveCardEntryTarget`/`addCard` production path
every other card entry already uses — one `addCard` call site, so a
second CardEvent for one spoken card isn't just untested, it's
architecturally impossible from this code.

**A real cross-grammar bug found and fixed during this round:** Phase 4's
split/double parser blocks on any leftover tail containing its own
trigger words, one of which ("hand") is ALSO this phase's own trigger
word — so every valid split-hand card command was being incorrectly
swallowed and blocked by Phase 4's parser before Phase 5's parser ever
got a chance (caught immediately: 18 of 24 new tests failed on first
run). Fixed by making each parser defer to its sibling's shape instead of
blocking blindly — the split/double parser now yields when a tail's last
token is a real card rank; the split-hand-card parser yields when a tail
is exactly "double."

**N-best safety reviewed:** `classifyVoiceTranscript.ts` stays a pure,
transcript-only function (no access to live split-seat state, by design)
— alternatives that genuinely disagree on which hand was named classify
to different `actionKey`s and fail closed via the existing
`CONFLICTING_ALTERNATIVES` mechanism, unchanged from before this phase.
No changes were needed to `nBestResolver.ts`.

**Tests:** 24 new tests in `src/components/live/VoiceSplitHandCard.test.tsx`
covering every accepted form, unsplit-seat behavior, the bare-target
ambiguity fix, every malformed-hand case, count/ledger integrity (exactly
one CardEvent and one count change per card, no migration between hands,
pre-split cards untouched, Double state stays correctly associated),
Undo/Redo (Redo exercised via the real context function directly — there
is no voice command for Redo), and reporting association via the
unmodified Phase 1 report builder. Full suite green (1440 passed, 1
pre-existing skip, stable across repeated runs — one known, pre-existing,
CPU-contention-only flaky test unrelated to this phase), `tsc --noEmit`
clean, `eslint` clean, `counting-engine/` diff empty, Phase 1 reporting
schema/Phase 3 UI untouched, Sherpa A/B/C and Field Test #3 preserved
exactly.

**Status:** Phase 5 complete, pending review. Not committed/pushed.
Conversational split-hand continuation remains not started — see
`docs/EYEONPIT_1_10_SPLIT_DOUBLE_DESIGN.md` §0.5/§12 for full detail and
the recommended next-phase path (a real microphone Field Test round for
split/double + split-hand-card voice, before continuation work begins).

### 1.10 Split/Double — Phase 4, Voice Split/Double Commands (2026-08-20)

**Scope:** voice commands for Split and Double ONLY — "spot 3 split",
"spot 3 double" (unsplit seat), "spot 3 hand 1 double"/"spot 3 hand 2
double" (split seat, hand required explicitly). Split-hand voice CARD
ENTRY ("spot 3 hand 2 has a five") is a separate, later phase (Phase 6) —
not touched here; entering cards into either hand still requires the
manual CardEntryPad until then.

**Why a new parser was needed:** `parseNarration.ts` already recognizes
bare "split"/"double" as `INERT_ACTION_WORDS` (permanently no-op filler,
from 1.9-era design) — without a dedicated grammar checked first, "spot 3
split" would have silently narrated as nothing but a target selection,
discarding "split" entirely. New file `src/lib/voice/
parseSplitDoubleCommand.ts` recognizes exactly six closed shapes (spot/
player/seat prefix synonyms × leading-or-trailing verb placement × an
optional explicit hand number), wired into both
`classifyVoiceTranscript.ts` (N-best alternative scoring) and
`VoiceControl.tsx`'s `handleFinalResult` (actual dispatch), in the same
position table-change/read-only-query already occupy — before narration.

**Real bug found and fixed during this round:** an early version of the
parser returned plain `null` for a malformed hand number ("spot 3 hand 3
double" — hand 3 doesn't exist). Testing proved that was unsafe: `null`
let the transcript fall through to `parseNarration`, whose one-word noise
tolerance absorbed "hand" as a stray token and "double" as inert filler,
then read the trailing "3" as an ordinary card — entering a real, wrong
Hi-Lo +1 CardEvent from what should have been a flatly rejected command.
Fixed by giving the parser a third return state, `{kind: "blocked"}`: once
a clean seat target is found, any leftover tokens still containing one of
this grammar's own trigger words ("split"/"double"/"hand") block the
utterance outright instead of deferring it. Ordinary sentences that merely
start with a valid seat phrase ("spot 3 raised his bet") are unaffected.

**Safety:** a bare double on an already-split seat is rejected with a new
`AMBIGUOUS_HAND_TARGET` diagnostic code — never guesses Hand 1 vs. Hand 2.
Both commands dispatch through the exact same `splitSeat`/`mutate`
functions the manual Split/Double buttons already call (Double's updater
is byte-identical to `PlayerActionsRow.tsx`'s `handleDouble`) — never a
parallel commit path, so Phase 2's Undo/Redo guarantees apply to a
voice-triggered Double exactly as they do to a manual one (verified
directly by test). Neither command ever creates a CardEvent or changes any
displayed count (verified via direct ledger assertion). Accepted commands
speak through the existing `speak()` abstraction under the existing
`voiceAudioFeedback` setting; rejections stay visual-only, like every
other rejection in this app.

**Tests:** 11 new tests in `src/components/live/VoiceSplitDouble.test.tsx`,
driving the real `VoiceControl` component end to end. Full suite green
(1416 passed, 1 pre-existing skip, stable across repeated runs), `tsc
--noEmit` clean, `eslint` clean, `counting-engine/` diff empty, Phase 1
reporting schema/Phase 3 UI untouched, Sherpa A/B/C and Field Test #3
preserved exactly.

**Status:** Phase 4 complete, pending review. Not committed/pushed.
Split-hand voice card-entry targeting (Phase 6, §7.1 of the design doc)
remains not started. See `docs/EYEONPIT_1_10_SPLIT_DOUBLE_DESIGN.md`
§0.4/§12 for full detail.

### 1.10 Split/Double — Phase 3, Split-Hand Operator UX Polish (2026-08-20)

**Problem:** the design round (below) flagged three real UX gaps for a
split seat: the split-hand indicator was a small, cryptic 20px "H2" badge
with no paired "H1"; the active hand relied on the same generic
cyan-highlight treatment every other seat selection uses, with no
dedicated signal; and the Double button gave no on-screen confirmation of
which hand it would apply to before tapping.

**What shipped, presentation-only:**

- `ActiveSeatHeader.tsx` — a split seat now shows a spelled-out, two-button
  `HAND 1` / `HAND 2` switcher directly under the seat identity line: 48px
  touch targets (44px in `short:` landscape), `role="group"`, and
  `aria-pressed` plus a filled background, border, and checkmark icon on
  the active button — three signal channels, never color alone. An
  unsplit seat's header is byte-identical to before this round.
- `PlayerActionsRow.tsx` — a caption ("Actions below apply to Hand 1/Hand
  2 only") now appears above the Double/Split/Insurance/Surrender/More
  row, shown only for a seat that has split. No button label or dispatch
  behavior changed.
- `PlayerDetailSheet.tsx` / `PlayerDetailBar.tsx` — the dialog title and
  compact collapsed-row text now spell out "Hand 1"/"Hand 2" for a split
  seat instead of the old bare "· SPLIT" suffix.
- `SeatTilesRow.tsx` — the dense table-overview tile's split-hand badge
  enlarged 20px → 24px with an added border; `aria-label` clarified to
  "Spot n, Hand 2 — select". Kept intentionally compact and secondary —
  `ActiveSeatHeader` is now the primary hand-switching surface.

**What did not change:** `mutate`/`addCard`/`splitSeat`/`undo`/`redo`, any
`CardEvent` handling, the counting engine, the reporting schema, or the
Phase 2 Double/Undo semantics. All five changed files are presentation
components only.

**Tests:** 9 new tests in `src/components/live/SplitHandUX.test.tsx`,
driving the real `LiveScreen` component tree end-to-end (not isolated
components) — unsplit-seat display unchanged; both hand labels shown
spelled out; active hand represented via `aria-pressed`; selecting each
hand correctly retargets; the seat-tile badge works as a shortcut; Double
applies only to the currently selected hand (each hand's own `doubled`
state checked independently); both hand controls stay present in the DOM
regardless of the `short:` landscape CSS variant. Full suite green (1395
passed, 1 pre-existing skip, stable across repeated runs), `tsc --noEmit`
clean, `eslint` clean, `counting-engine/` diff empty.

**Status:** Phase 3 complete, pending review. Not committed/pushed.
Recommended next step: Phase 4 (voice Split/Double), now that both the
Double/Undo defect (Phase 2) and the split-hand UX gaps (Phase 3) are
resolved. See `docs/EYEONPIT_1_10_SPLIT_DOUBLE_DESIGN.md` §0.3/§12 for
full detail.

### 1.10 Split/Double — Phase 2, Double/Undo Defect Fix (2026-08-20)

**Problem:** Phase 1's Double/Undo verification round found a real,
confirmed defect (below) and, per instruction, reported it without fixing
it. This round fixed it, narrowly.

**Root cause:** `InvestigationContext.undo()` always checked the active
target's own most recent active CardEvent BEFORE the whole-round history
snapshot that actually held a Double — so pressing Undo right after
Double, while the target still had its own cards, always undid a card
instead of the double, silently leaving the wager doubled.

**The fix:** `undo()` now checks, first, whether the active target's hand
is `doubled` with no post-double card yet — a deterministic read of
`doubled`/`doubledAtCardCount`/`playerCards.length`, fields already on
`SeatRoundRecord`. When true, it reverts the Double itself (via the same
`mutateRound` primitive every other round-state undo uses) instead of
touching a card. Once a post-double card exists, this check is false and
the pre-existing card-undo path runs unchanged — removing that card is
what makes a SECOND Undo naturally reach the double-revert case. A new,
narrow `HistoryEntry` variant (`"target-double"`) makes this symmetric
with Redo. No parallel CardEvent, no history-system redesign, no change
to global LIFO behavior for ordinary or split-hand card entry.

**What shipped:** `seatTarget.ts` gained three pure functions
(`isDoubledWithNoPostDoubleCard`/`revertDouble`/`reapplyDouble`);
`InvestigationContext.tsx`'s `undo()`/`redo()`/`undoLabel`/`canUndo`
updated to use them. 16 total Double/Undo/Redo integration tests (the
prior defect-proving test replaced with tests proving the fix; 7 new
scenarios: reverting a bare double, redo, the extra-card-then-double
two-step undo and its two-step redo, the same behavior on a split's Hand
2, an unrelated seat staying unaffected, and confirmation the CardEvent
ledger/count never change when undoing only Double state).

**One accepted, documented side effect:** the original generic `"round"`
history snapshot `handleDouble`'s `mutate()` call still pushes when Double
is first pressed becomes an inert "ghost" entry in the common case, now
that the new targeted check intercepts first. This exact characteristic
already existed for every `mutate()`-based action before this fix (Double,
Insurance, Surrender) — not introduced by this round, and not fixed here
since doing so would mean touching `PlayerActionsRow.tsx`, a larger change
than this narrowly-scoped fix called for.

**Explicitly not done:** Split/Double voice, H1/H2 UX, PC Voice Field Test
#3, Sherpa A/B/C — the latter two untouched and preserved exactly.

**Tests:** 16 total in the Double/Undo/Redo suite (net +7 over Phase 1's
verification round). Full suite green (1386 passed, 1 pre-existing skip),
`tsc --noEmit` clean, `eslint` clean, `counting-engine/` diff empty.

**Status:** Phase 2 complete, pending review. Not committed/pushed.
Recommended next step: Phase 3 (UX polish, only if you confirm it's
wanted) or skip straight to Phase 4 (voice Split/Double), now that the
Double/Undo defect blocking it is resolved.

### 1.10 Split/Double — Locked Decisions + Phase 1 Reporting Fix (2026-08-20)

**Problem:** the design round below left five open decisions and one
approved-but-unstarted Phase 1 (a confirmed real bug: split-hand data was
silently absent from every generated Report). This round locked those
decisions and executed Phase 1.

**Locked decisions:** pre-split cards stay as-is (Split creates a new
empty hand, never moves/mutates historical CardEvents — count integrity
over visual reconstruction); re-splits explicitly out of 1.10 scope, but
Phase 1's data shape was kept extensible for it anyway; H1/H2 UX
confirmed worth improving, explicitly deferred; Double/Undo verification
required before any voice work.

**What shipped:**

- **Phase 1, done:** `reportBuilder.ts` now folds `round.splitHands` into
  the report — a split seat produces two entries (`handIndex: 1`/`2`),
  each with its own cards/wager/doubled-state/outcome.
  `REPORT_SCHEMA_VERSION` bumped 2→3, additive only. 7 new regression
  tests (unsplit-unchanged, both hands present, cards/outcomes/doubled
  correctly attributed per hand, zero duplication) — all passing. No
  CardEvent mutation, no counting-engine involvement.
- **Double/Undo verification, done — real defect found:** targeted
  automated tests (`InvestigationContext.integration.test.tsx`) prove
  pressing Undo immediately after Double (before any further card) does
  NOT undo the Double — it silently undoes the seat's last card instead,
  leaving the wager doubled. Root cause: `undo()`'s context-aware
  per-target lookup always runs before the whole-round history-stack
  fallback that actually holds the Double, and a target with any of its
  own remaining cards always satisfies that lookup first. **Reported, not
  fixed**, per explicit instruction — see
  `docs/EYEONPIT_1_10_SPLIT_DOUBLE_DESIGN.md` §0.2.

**Explicitly not done:** UX polish (deferred by decision), Split/Double
voice (blocked in part on deciding what to do about the Double/Undo
defect), PC Voice Field Test #3, Sherpa A/B/C — the latter two untouched
and preserved exactly.

**Tests:** 10 new (7 reporting + 3 Double/Undo/Redo), 1 existing assertion
updated for the schema-version bump. Full suite green (1380 passed, 1
pre-existing skip), `tsc --noEmit` clean, `eslint` clean,
`counting-engine/` diff empty.

**Status:** Phase 1 complete, pending review. Not committed/pushed.
Recommended next step: a decision on the Double/Undo defect (fix, or
document as a known limitation) before Phase 2 (voice Split/Double)
begins.

### 1.10 Split/Double — Design Only, No Implementation (2026-08-20)

**Status: PLANNING ONLY.** Nothing in this entry is implemented as new
work — its main finding is that Split/Double were already substantially
built (see below), correcting an earlier, wrong assumption recorded in
this session's own prior recovery report that 1.10 hadn't started.

**What was found already implemented** (full detail in
`docs/EYEONPIT_1_10_SPLIT_DOUBLE_DESIGN.md` §1): the full split-hand data
model (`Round.splitHands`), the negative-seat-number targeting
convention, the CardEvent ledger's `"split"` target type with already-
safe per-target undo/redo, the manual Split/Double UI
(`PlayerActionsRow.tsx`/`SeatTilesRow.tsx`), round-completion validation
requiring split hands to resolve, Counter Detection's split-hand-aware
observation extraction, and backward compatibility for legacy
investigations. **What's genuinely missing:** voice commands for split/
double (explicitly `PLANNED` in the Product Spec's own status matrix,
unchanged by this entry), and a confirmed, real reporting gap —
`reportBuilder.ts` never reads `round.splitHands`, so a split hand's
cards/outcome/wager are silently absent from every generated Report today.

**What shipped:** the design document only — a 6-phase implementation
plan (reporting fix first, since it's a real bugfix independent of
voice; then an open decision on whether Split should move the pre-split
cards into the new hand; then optional UX polish; then voice in two
sub-phases; then a real field test), undo-semantics verification table,
count-integrity confirmation (already fully guaranteed by the existing
architecture), and five explicit open decisions requiring approval before
any implementation begins.

**Explicitly not done:** no code was written or modified. No counting-
engine changes. No voice grammar. No PC Voice Field Test #3 or Sherpa
A/B/C work touched — both remain exactly as left, gated on the user's own
real-microphone sessions.

**Status:** design complete, pending your review of the open decisions in
§14 of the design doc. Not committed/pushed.

### PC Voice Field Test #3 — Protocol Prepared (2026-08-20)

**Problem:** Field Test #2's remediation and the follow-up "Final Chrome
Patch" round were both built and regression-tested against TEXT only —
none of it had been spoken into a real Chrome session since. Needed a
concise, real-microphone test script before any further voice work, per
the roadmap's own standing "do not skip Field Test #3" rule.

**What shipped:** `docs/EYEONPIT_VOICE_FIELD_TEST_3.md` — a full protocol
(purpose, methodology, 27-line phrase corpus copied verbatim from existing
passing regression tests across every fix category since Field Test #2,
pass/fail criteria, and exactly how to read the existing JSON export for
each required field). **Zero production code was changed** — the existing
`VoiceUtteranceSummary`/`buildVoiceSessionExport` diagnostic tooling
already captures everything the protocol needs (raw alternatives,
normalized/recovered interpretation, accept/reject + code + reason,
whether a CardEvent was produced, latency, active target before/after);
see the doc's own §6 for why one candidate convenience field was
considered and deliberately not added, given how many production
call-sites it would touch for a documentation-only reviewer convenience.

**Explicitly not done:** the actual real-microphone session — this is a
protocol, not a completed test. No parser/classifier behavior changed. No
counting-engine changes. No 1.10 work.

**Tests:** none added — no diagnostic tooling code changed, so none was
needed. Full existing suite re-confirmed green as a no-op check (1371
passed, 1 pre-existing unrelated flake confirmed passing in isolation),
`tsc --noEmit` clean, `eslint` clean.

**Status:** prepared, pending the user's real-mic session. Kept alongside
the still-uncommitted Dealer A/B/C Sherpa lab work (below) — neither track
overwrites the other; see that entry for what remains separately pending
there.

### Dealer Hotword Investigation + Lab A/B/C Tooling (2026-08-20)

**Problem:** a real mic session found Sherpa's Dealer recognition unstable
even with hotwords "on" — "Dealer has a five" consistently misheard as
"Taylor," "Dealer showing ten" as "Tillers... a tin," while bare "Dealer"
and "Dealer has a king" worked. Needed to know why before touching any
configuration.

**What was found** (full detail in `docs/EYEONPIT_VOICE_PROVIDER_RESEARCH.md`
§9): two real, confirmed, compounding misconfigurations — `modelingUnit`
left at its default `"cjkchar"` for an English BPE model (confirmed
directly from sherpa-onnx's own C++ source), and hotword phrase text
lowercase against a vocabulary trained on uppercase-only text (confirmed
with a real sentencepiece test against the model's own training
tokenizer). The model bundle doesn't ship a `bpe.vocab` file; traced the
model to its real training source, verified (byte-identical `tokens.txt`)
it's the correct tokenizer, and generated a real `bpe.vocab` from it —
deployed lab-only, gitignored.

**What shipped:**

- Three new, all-optional `SherpaOnnxProviderOptions` fields
  (`modelingUnit`, `bpeVocabUrl`, `hotwordCasing`) — every one defaults to
  exactly what every prior round already shipped, so existing callers are
  byte-for-byte unchanged.
- A real recognizer with the corrected configuration was constructed and
  decode-tested in a real Chrome tab — confirmed it doesn't break ordinary
  recognition. Real-mic Dealer-accuracy improvement was NOT measured — no
  microphone exists in this environment.
- `/lab/sherpa-voice-test` now offers a Dealer A/B/C comparison (hotwords
  off / current-shipped / tuned) against the same phrase script, showing
  each recorded utterance's raw transcript AND EyeOnPit's real, unmodified,
  read-only classification (accepted/rejected, would-produce-a-CardEvent)
  side by side — informational only, this page still creates zero
  CardEvents.

**Explicitly not touched:** CardEvent ledger, counting engine, production
Browser Web Speech provider, production parser/classifier behavior. No PC
Voice Field Test #3. No 1.10/Split-Double work.

**Tests:** `sherpaOnnxProvider.test.ts` extended (8 new tests covering
hotword casing, the new tunable options, and the investigation's own
recorded findings). Full suite green (1371 passed, 1 pre-existing skip),
`tsc --noEmit` clean, `eslint` clean.

**Status:** complete, pending review. Not committed/pushed. Recommended
next step: the user runs the real A/B/C microphone comparison in the lab —
see `docs/EYEONPIT_VOICE_PROVIDER_RESEARCH.md` §9.4.

### Sherpa-ONNX Real Implementation Gate (2026-08-19)

**Problem:** the prior round's `SherpaOnnxProvider` was an honest but
non-functional scaffold (`supported: false`, `start()` immediately
errored). That answered "is the license clean" but not the question the
whole investigation exists to answer: does sherpa-onnx actually work,
here, against real audio, in a real browser.

**What shipped:**

- **A real, working `SherpaOnnxProvider`** — genuine WASM loading, real
  streaming recognizer, real `AudioWorkletNode` mic capture, real
  interim/final result routing, real hotwords wiring using EyeOnPit casino
  vocabulary. No longer a stub.
- **Independent, hands-on verification, not documentation research:**
  downloaded the official prebuilt sherpa-onnx browser-WASM release
  directly from k2-fsa's GitHub Releases (no emscripten toolchain exists
  in this environment, so nothing was compiled — this is the identical
  official artifact), loaded it unmodified in a real Chrome tab via
  browser automation, and fed real recorded English speech through the
  live recognizer (no microphone exists here, so the engine's own
  `acceptWaveform()` API was used directly, bypassing mic capture — a
  legitimate real-audio test, not a text-only one). **Both real test clips
  produced exact word-for-word correct transcripts**, with confirmed
  genuine incremental streaming (first partial at 205ms) and a working
  hotwords pipeline using actual EyeOnPit casino vocabulary.
- **One factual correction**: the model actually bundled in the official
  browser release is `sherpa-onnx-streaming-zipformer-en-2023-06-21`
  (Apache-2.0, LibriSpeech+GigaSpeech), not the
  `...-20M-2023-02-17` model the prior round's documentation-only research
  had guessed — traced directly from k2-fsa's own build workflow, not
  assumed.
- **Honest limits, stated plainly, not glossed over:** no real
  casino-vocabulary audio exists anywhere, so sherpa-onnx's accuracy on
  EyeOnPit's own phrase corpus is still unmeasured. No same-audio
  Chrome-vs-sherpa comparison is possible at all — the Web Speech API is
  microphone-only by spec and has no file-feed equivalent, a real
  architectural asymmetry, not a shortfall in this round's effort. CPU/RAM
  are measurable for sherpa-onnx (runs in-page) but structurally
  unmeasurable for Chrome's built-in recognizer (runs in the browser/OS's
  own internal service, invisible to any web page). Firefox was not
  tested (no Firefox browser-automation capability here); iPhone/Safari
  feasibility remains undetermined.

**Explicitly not touched:** CardEvent ledger, counting/simulation engine,
1.9 lifecycle, Spot terminology, `VoiceControl.tsx`/`useVoiceRecognition.ts`
production wiring (still untouched — Sherpa is not the default and is not
exposed to normal operators). No 1.10 work.

**Tests:** `sherpaOnnxProvider.test.ts` rewritten (17 tests, covering the
pure hotwords/feature-detection logic and unsupported-environment
behavior — a plain Node/vitest run cannot exercise the real WASM/audio
path, which was verified separately, by hand, in a real browser). Full
suite green, `tsc --noEmit` clean, `eslint` clean.

**Status:** complete, pending review. Not committed/pushed. The ~205MB
WASM/model asset bundle is gitignored (`public/sherpa-onnx-lab/`) and was
never committed. Recommended next step: real casino-phrase audio (via a
live microphone session) run through this same provider, to finally
measure sherpa-onnx's accuracy on EyeOnPit's own vocabulary — see
`docs/EYEONPIT_VOICE_PROVIDER_RESEARCH.md` §8.6.

### Final Chrome Patch + Open-Source Voice Provider Prototype (2026-08-19)

**Problem:** four narrow real-mic-captured Chrome parser gaps remained open
after the Field Test #2 remediation rounds below, and — separately — the
`SpeechProvider` abstraction `docs/EYEONPIT_1_9_VOICE_INDEPENDENCE.md`
designed but explicitly did not build needed to move from design to real,
tested code, plus real research into whether a free/open-source alternative
engine to Chrome's Web Speech API is even viable, without prematurely
replacing working production software.

**What shipped** (full detail in `docs/EYEONPIT_VOICE_ARCHITECTURE.md` and
`docs/EYEONPIT_VOICE_PROVIDER_RESEARCH.md`):

- **Four Chrome parser fixes**, each a narrow, closed-grammar extension
  with exact real-mic regression tests (`realMicChromePatch.test.ts`, 14
  tests): "play the 3 hits gets a 4" (broadened "play"+filler recognition),
  "player 3 hits of 4" (generalized the narration/legacy handoff rule so
  recognized narration vocabulary is never mis-downgraded to legacy purely
  by op-count), "players that are down at spot 3" (table-change ASR
  recovery extended to the "that are" phrasing), "Taylor has a king in a
  five" ("in" recognized as a dealer-recovery connector, matching the
  existing "and" rule).
- **`SpeechProvider` interface, real** — `src/lib/voice/speechProvider.ts`
  plus `BrowserWebSpeechProvider`
  (`src/lib/voice/browserWebSpeechProvider.ts`), a faithful, independently
  tested port of `useVoiceRecognition.ts`'s proven session/restart/backoff
  logic as a plain factory. **Not wired into production this round** — no
  audio-testing capability exists in this environment to verify a live
  swap; `VoiceControl.tsx`/`useVoiceRecognition.ts` are byte-for-byte
  unchanged.
- **`CasinoVoiceContext`/`buildHotwordList`** — a pure, weighted (not flat)
  hotword-list design (`src/lib/voice/casinoVoiceContext.ts`), reserved for
  a future hotword-capable provider; only `terminology`/`activeTarget` are
  load-bearing today, by design.
- **`SherpaOnnxProvider`, honestly scoped** — `supported: false`
  hardcoded, `start()` reports `"not-implemented"` and does nothing else.
  Real, cited sherpa-onnx (Apache-2.0 engine) and candidate model
  (Apache-2.0, LibriSpeech-trained) provenance recorded; no model files,
  WASM binaries, or engine source copied into the repo.
- **Voice benchmark corpus, real** —
  `src/lib/voice/voiceBenchmarkCorpus.ts`, implementing the methodology
  `docs/EYEONPIT_1_9_VOICE_INDEPENDENCE.md` §6 designed but didn't build.
  Scores real field-captured/documented-grammar phrases against EyeOnPit's
  own classifier; **zero false CardEvents** across the full corpus today.
  Latency/CPU/RAM/model-size fields are typed and explicitly `null` — not
  measurable without real audio-input capability, never fabricated.
- **whisper.cpp researched as a reference** (MIT engine, MIT model
  weights) — not chosen as primary candidate, on real latency/streaming-
  architecture grounds documented in the research doc, not integrated.

**Explicitly not touched:** CardEvent ledger semantics, counting/simulation
mathematics, the 1.9 lifecycle rule, Spot terminology, every existing voice
regression from prior rounds. No Firefox support added. No 1.10
split/multi-hand logic wired anywhere.

**Tests:** `realMicChromePatch.test.ts` (14), `browserWebSpeechProvider.test.ts`
(9), `sherpaOnnxProvider.test.ts` (5), `casinoVoiceContext.test.ts` (9),
`voiceBenchmarkCorpus.test.ts` (7) — all new, all passing. Full suite green,
`tsc --noEmit` clean, `eslint` clean.

**Status:** complete, pending review. Not committed/pushed — see the
round's own final report. Real-audio provider comparison (§7 of
`docs/EYEONPIT_VOICE_PROVIDER_RESEARCH.md`) is the recommended next step,
not 1.10.

### PC Voice Field Test #2 Remediation (2026-08-19)

**Problem:** the second round of PC voice field testing (run against the
clean, unmodified baseline 1.9 deliberately preserved) surfaced real gaps
across ten distinct areas — see `docs/EYEONPIT_VOICE_FIELD_TEST_2.md` for
the complete root-cause analysis. In summary: two more Chrome ASR
mishearings of "player" needed narrow recognition; several natural
sentence shapes (trailing-target table changes, third-person action verbs,
target-omitted continuation, a natural "watching spot one" target-setting
intent) had no parser path; two real CONTROL_DISABLED reports traced to
correct state logic paired with an unhelpfully generic message; and a
narrow, real safety gap let a glued ASR digit run ("55" from a misheard
"3:55") decompose into two extra cards once a target was already active.

**What shipped** (full detail in `docs/EYEONPIT_VOICE_FIELD_TEST_2.md`):

- **Player ASR recovery** — "play your"/"play are"/"play Air"/"play
  everyone" before a seat number or seat-prefix phrase, and "play" before
  "sat", all narrowly lookahead-guarded exactly like the existing "play"/
  "start"/"set" rules.
- **Multi-card dealer-confusion recovery** — "Spotify has a five and a
  king" now recovers an ORDERED two-card dealer hand, not just the first
  card, committed through the same transactional `commitNarration` path
  ordinary narration uses.
- **Active-target continuation** — "has a ten and a three," with a spot
  already active, now resolves against it, gated on genuine connector-word
  evidence (not just "a target exists") so "king ace" with zero connecting
  grammar still correctly rejects.
- **Connector ASR variant** — "in" recognized as "and" ("has a 10 in a
  3"), identically gated to every other connector.
- **Compound narration vocabulary gap closed** — "spot one stands spot 3
  hits gets a 3" now parses; the transactional all-or-nothing commit
  architecture already existed, the gap was only that third-person verb
  inflections ("stands"/"hits") weren't recognized as the same inert
  vocabulary as "stand"/"hit".
- **New natural target-setting intent** — "current player is spot one" /
  "watching spot one" / "I'm on spot one" set the active target through a
  new small closed-grammar parser, creating no CardEvent.
- **Expanded table-change grammar** — "player sat down at/on spot one"
  (target trailing the verb phrase) and an optional leading "new"/"a"
  filler before "player at spot six".
- **CONTROL_DISABLED root-caused and fixed** — both real reports had
  correct state logic; the actual gap was `dispatch()` returning bare
  `null` with no reason. Operators now hear the truthful specific reason
  ("Count is already running — nothing to resume," "Dealer cards pending
  — enter cards or declare a round exception") instead of a generic
  "not available right now."
- **Numeric/time safety gap closed** — a colon/slash clock-time or
  fraction pattern anywhere in an utterance now blocks glued-digit-run
  decomposition into cards even when a target is already active (the
  standalone "3:55"/"1/8"-alone cases were already safely rejected by
  existing ambiguity rules, verified with new regression tests, not
  assumed).
- **Operator feedback terminology completed** — two real remaining 1.9
  terminology leaks found and fixed: the actual narration confirmation
  pill (`✓ S1: 10, 6` → `✓ SPOT 1: 10, 6`) and several Hand-Status-line/
  Undo-button/event-log strings still defaulting to "Seat N".
- **Session reliability metrics** — a new `computeSessionMetrics` pure
  function surfaces acceptance rate, ASR_NO_FINAL rate, N-best/dealer/
  player-confusion/normalization rescue counts, compound-utterance and
  active-target-continuation counts, and speech-to-final/final-to-commit
  timing, in the existing Debug panel and JSON export. The per-session
  recognition timeout was raised from 8s to 12s to give the new, longer
  compound narration more room before the hook's own backstop force-stops
  a session — the restart/recovery logic itself was audited and found
  already correct.

**Explicitly not touched:** CardEvent ledger semantics, counting
mathematics, simulation mathematics, the 1.9 investigation lifecycle rule,
and the global Spot terminology *rule* itself (two remaining leaks were
fixed, the rule was not changed) — confirmed via the full 1.9 lifecycle
test suite passing unchanged. No `SpeechProvider`/Firefox work — those
remain exactly where 1.9 left them, architecture-only.

**Tests:** new `fieldTest2Regression.test.ts` (33 tests, every real
ACCEPT/RECOVER and REJECT/SAFETY case from the remediation brief),
`parseSetActiveTargetIntent.test.ts` (24 tests), `sessionMetrics.test.ts`
(7 tests), plus terminology/behavior assertion updates across the existing
voice suite. Full suite green, `tsc --noEmit` clean, `eslint` clean.

**Status:** complete, pending review. Not committed/pushed — see the
remediation's own final report for the full findings list. PC Voice Field
Test #3 is the recommended next step — see
`docs/EYEONPIT_VOICE_FIELD_TEST_2.md`'s own closing section for the
suggested script.

### 1.9 Operator Lifecycle + Global Terminology (2026-08-19)

**Problem:** nothing in the app checked investigation status before
deciding what to render — a completed (`"closed"`) investigation could
resurface as the live operational console after a reload, a History link,
or the End Investigation redirect, with only a "+New" button
acknowledging it was actually finished. Separately, an earlier session's
deliberate Floor="Spot"/Surveillance="Seat" terminology split meant
Surveillance's own live console still displayed bare "SEAT N" tiles —
confirmed as the root cause of a recent production screenshot showing
"SEAT 1", "SEAT 2", "SEAT 3" on an operational screen.

**What shipped** (full detail in
`docs/EYEONPIT_1_9_OPERATOR_LIFECYCLE.md`):

- **Investigation lifecycle rule (READY/ACTIVE/PAUSED/COMPLETED)** — a
  new pure classifier (`lib/investigationLifecycle.ts`) distinguishes a
  fresh active/paused investigation (auto-resume, no confirmation step —
  refresh/crash/tab-close recovery stays instant) from a stale or
  ambiguous one (explicit RESUME/START NEW choice via the new
  `ResumeOrNewScreen`) from nothing at all (clean READY launch screen).
  A `"closed"` investigation is never a lifecycle candidate at all.
- **Closed investigation → report view, never the live console** — a new
  shared `InvestigationReportsView` renders directly as the body of
  `LiveScreen`/`FloorScreen` whenever `status === "closed"`, replacing
  the old one-shot `?review=1` query-param mechanism entirely. This is
  what actually fixes the reload-after-completion regression: the guard
  is driven purely by persisted status, not a query flag.
  `ReportScreen.tsx` gained a "Finish & Start New Investigation" action
  that does a full page navigation back to `/app`, guaranteeing every
  piece of leftover operational state is gone, not just visually reset.
  The underlying investigation/report data is never cleared.
- **Global Spot-everywhere terminology** — the earlier Floor/Surveillance
  "Spot"/"Seat" split is superseded; Spot is now the operator-facing
  default everywhere (`ActiveSeatHeader`, `CardEntryPad`, `SeatTilesRow`,
  reports, exports, sheets, settings hints). Internal identifiers
  (`seatNumber`, Dexie keys, `activeTarget`, raw diagnostic export fields
  like `SEAT1`) are completely unchanged — this is a display-layer fix.
  A shared, non-voice utility (`lib/utils/cardEntryResolution.ts`)
  already fed both manual AND voice-triggered display text, so fixing it
  there corrected voice confirmation toasts too, with zero changes to
  any file under `lib/voice/` or `VoiceControl.tsx` — confirmed via a
  full, unmodified 177/177 `VoiceControl.test.tsx` pass.
  New dedicated `terminologyLeak.test.tsx` regression tests scan real
  rendered surfaces for bare `S1`–`S7` leakage, word-boundary-anchored so
  legitimate strings like the "S17" dealer-stands-on-17 rule label are
  never a false positive.
- **New product principles** added to `docs/EYEONPIT_PRODUCT_SPEC.md`:
  "the observer should not have to learn EyeOnPit language," "internal
  identifiers belong to EyeOnPit, casino language belongs to the
  operator," and "completed investigations belong in history, not in the
  live operational workspace."
- **Voice Independence architecture — documentation only** (see
  `docs/EYEONPIT_1_9_VOICE_INDEPENDENCE.md`): a `SpeechProvider`
  abstraction design (current browser Web Speech as the one real
  implementation), the Firefox/cross-browser gap this exists to close,
  and a benchmark-corpus methodology for evaluating any future
  replacement engine. Zero voice code added or changed.

**Explicitly not touched:** the voice parser/resolver/normalization,
browser ASR behavior, the CardEvent ledger, counting mathematics,
simulation mathematics, and Counter Detection mathematics — confirmed via
`git diff` showing zero changes under `src/lib/voice/`,
`src/hooks/useVoiceRecognition.ts`, `src/components/live/VoiceControl.tsx`,
the counting engine, or the simulation engine. No PC Voice Field Test #2
finding was fixed in this release, by explicit instruction, so that field
test measures a clean, unmodified baseline.

**Tests:** new lifecycle regression suite (`ConsoleShell.test.tsx`,
8 tests covering the full READY/fresh/stale/multiple-candidate/reload-
after-completion matrix), a rewritten `EndReview.test.tsx` proving closed
investigations have no dismissible overlay, and a new
`terminologyLeak.test.tsx` cross-cutting leak-detection suite, plus
targeted assertion updates across every file touched by the terminology
default flip. Full suite green, `tsc --noEmit` clean, `eslint` clean.

**Status:** complete, pending review. Not committed/pushed — see the
1.9 final report for the full findings list. PC Voice Field Test #2
remains in progress, unaffected by any of the above.

### 1.7 Counter Detection + Player Analytics, 1.8 Global/Multi-Property/Multi-Game Foundation (2026-08-19)

**Problem:** the 1.6 architecture explicitly deferred Counter Detection to
"architecture and documentation only" pending a real implementation and
validation plan; separately, EyeOnPit's data model had no path toward
multiple languages, per-property terminology, non-blackjack games, or
multi-property accounts without a future rewrite.

**What shipped** (full detail in `docs/EYEONPIT_1_7_COUNTER_DETECTION.md`
and `docs/EYEONPIT_1_8_GLOBAL_ARCHITECTURE.md` — this is a summary):

- **1.7: PlayerObservation model + real extraction** — derives one record
  per observed hand entirely from existing Investigation/CardEvent data,
  no new counting mathematics, no unnecessary player PII.
- **1.7: bet/count, playing-deviation, insurance, and entry/exit
  analytics** — real, versioned, testable statistics (Pearson correlation,
  OLS regression, plain rates); none of them output a "counter" label by
  themselves. Basic-strategy-deviation checking is real (reuses the
  verified 1.6 chart); index-deviation checking is architecture only —
  ships with zero bundled index numbers.
- **1.7: Counter Detection Confidence Engine** — a versioned, five-state
  classifier (`INSUFFICIENT_DATA`/`LOW`/`MODERATE`/`HIGH`/`VERY_HIGH`,
  never a boolean) that never classifies from hand count alone — a
  minimum-hands floor only ever caps a classification down, never produces
  one. **EXPERIMENTAL — NOT VALIDATED against real-world data.**
  Real measured results against this session's own deterministic synthetic
  benchmark: **zero false positives at every hand checkpoint (10-100),
  including every adversarial non-counter pattern tested** (progressive/
  martingale/high-roller/random-insurance/brief-entry), sensitivity 96.7%
  by 30 hands, and the harness's own (not hardcoded) verdict is
  "50-hands-defensible" against that synthetic data.
- **1.7: Report integration** — six new optional `ReportAnalysisSection`
  fields (report schema bumped to v2), populated only via an explicit,
  opt-in attachment step — never automatically — and always carrying an
  EXPERIMENTAL/NOT VALIDATED methodology disclosure.
- **1.7: `/lab` UI** — Counter Detection, Player Behavior Analysis, and
  Validation Benchmarks are now real, data-backed pages (no more
  placeholder) — every number is freshly computed on load/click, never
  pre-baked.
- **1.8: internationalization foundation** — a real string-catalog +
  Intl-based locale-aware formatting architecture for 8 target languages;
  seeded, not a completed translation.
- **1.8: property terminology + expanded Property Profile** — "Spot"/
  "Seat"/custom-localized player-position preference, plus optional
  timezone/language/currency/table-naming/default-rules/reporting-defaults
  fields on `PropertyMetadata`. Not yet wired into live Floor/Surveillance
  UI components (deliberately, to avoid unrelated UI changes this session).
- **1.8: global voice architecture — documentation only**, zero voice code
  touched, exactly as instructed.
- **1.8: generic Game Definition / Method framework / compatibility** — a
  non-breaking `GameFamily` umbrella over the existing (unchanged)
  blackjack `GameDefinition`; two new OPTIONAL fields on
  `CountMethodDefinition`; a standalone, tested game/method compatibility
  validator (not yet force-integrated into scenario creation).
- **1.8: multi-property membership + entitlement foundation** — Role/
  Organization/Membership types and a PUBLIC/PRO/ENTERPRISE feature-tier
  model. Types and pure functions only — `/lab`'s server-side gate is
  completely untouched, and no billing/enforcement exists anywhere.

**Explicitly not touched:** the voice resolver/parser, the CardEvent
ledger, existing counting mathematics, existing simulation-engine
mathematics, and `/lab`'s server-side authorization gate — confirmed via
`git diff` showing zero changes to any of `src/lib/voice/`,
`src/lib/counting-engine/`, `src/lib/gold-standard/simulation/engine.ts`,
`src/lib/labAuth/`, or `src/proxy.ts`.

**Tests:** extensive new coverage across every new model, analytic, the
Confidence Engine, the synthetic benchmark harness, false-positive safety,
report integration, i18n, property profile, generic game/method framework,
and membership/entitlements (see the combined-track final report for exact
counts). Full suite green, `tsc --noEmit` clean, `eslint` clean.

**Status:** complete, pending review. Not committed/pushed — see the
combined-track final report for the full 27-point findings/status list.
PC Voice Field Test #2 was being performed separately by the user during
this work and remains entirely unaffected by it.

### 1.5 Reporting + 1.6 Gold Standard Architecture Foundation (2026-08-19)

**Problem:** 1.5 (advanced reporting) and 1.6 (blackjack research/simulation
tooling) were both scoped as future work, but with a real risk of being
built as two unrelated efforts that would later have to be reconciled or
partly rewritten — the explicit instruction for this work was to build both
tracks' foundations together, sharing data models and versioning so 1.6
analytics can flow into 1.5 reports later without a structural rewrite.

**What shipped** (full detail in `docs/EYEONPIT_1_5_REPORTING.md` and
`docs/EYEONPIT_1_6_ARCHITECTURE.md` — this is a summary):

- **Shared versioning/ID foundation** (`lib/versioning/`) — collision-
  resistant canonical IDs, human-readable property-coded IDs
  (`PROPERTY-YYYYMMDD-XXXXXX`), and the `VersionedRecord`/`VersionRef`
  pattern used by every new entity below.
- **1.5: Investigation ID + property metadata + Player Identity Privacy
  Rule** — no player names/loyalty numbers/government IDs are ever
  persisted; see `docs/EYEONPIT_1_5_REPORTING.md` §3.
- **1.5: Report schema, builder, preview, export, AI-narrative-assist** —
  a versioned `Report` derived entirely from existing investigation/
  CardEvent data, a preview screen at `/investigations/[id]/report-preview`
  labeling every section OBSERVED FACT / NARRATIVE / DERIVED ANALYSIS,
  browser-print PDF export, dependency-free RTF ("Word") export, and a
  deterministic (non-LLM) narrative-draft provider that only ever
  summarizes fields already present on the report.
- **1.6: Blackjack Game Definition, Count Method Registry, and existing-
  method adapters** — Hi-Lo/KO/Zen/Omega II wrapped read-only from the
  real counting engine's own tag tables (never re-typed), with a
  regression suite proving byte-identical output.
- **1.6: exact shoe-composition model, Simulation Scenario/Result models,
  and a deterministic seeded simulation engine** — same seed + scenario +
  simulator version reproduces the same result, proven by a determinism
  test; documented scope limits (single seat, one split level, no
  insurance, standard-chart strategy only).
- **1.6: private `/lab` research area** — its own independent passcode
  gate (`EYEONPIT_LAB_PASSCODE`, never shared with the main app's
  session), real-data screens for the Method Library, Simulation
  Scenarios, Results, and Research Library, and honest placeholders
  (not fake flows) where creation UI doesn't exist yet.
- **1.6: method import/export format** (`eyeonpit-method.json`) — JSON-
  only parsing, no code execution possible, imported methods always
  re-validated and never trusted as VERIFIED.
- **1.6: Counter Detection Confidence Engine — architecture and
  documentation only**, no implementation. See
  `docs/EYEONPIT_1_6_ARCHITECTURE.md` §8 for the full signal list,
  ~50-hand competitive target, and required validation metrics before any
  future claim ships.

**Explicitly not touched:** the voice resolver/parser, the CardEvent
ledger, existing counting mathematics, and the existing `Investigation`
Dexie schema/records — every new table is additive, and `Report`/
`PropertyMetadata` reference an investigation only by its `localId`
string, specifically so this work carries zero risk to investigation
persistence integrity.

**Tests:** extensive new coverage across every new model, adapter,
validator, and repository (see the combined-track final report for exact
counts). Full suite green, `tsc --noEmit` clean, `eslint` clean across
every new file. Regression suite proves the four built-in count-method
adapters remain byte-identical to the live counting engine.

**Status:** complete, pending review. Not committed/pushed — see the
combined-track final report for the full 23-point findings/status list.
Voice Field Test #2 (below) was deliberately **not** performed or skipped
by this work; it remains the next voice-specific priority, unaffected by
any of the above.

### Floor Mode Operator Usability Cleanup (2026-08-18)

**Problem:** Floor Mode's compact play-field summary (`FloorPlayField.tsx`)
displayed each player position as the bare internal shorthand "S1"–"S7" —
the one place in the whole live UI that ever leaked an internal-style
identifier to the operator. Every other Floor/Surveillance surface, and
every doc source, already spelled the word out. Layout hierarchy also put
operational actions (Done/Next/Undo) between the active-target banner and
the keypad they don't act on, rather than after it.

**What shipped:**

- **"Spot N," never "Sn."** `FloorPlayField.tsx`'s seat labels/aria-labels
  now read "SPOT 3" / "ACTIVE · SPOT 3" — the sole occurrence of the bare
  abbreviation in the codebase, fixed at the source.
- **Floor Mode Terminology Standard** (new, see
  `docs/EYEONPIT_PRODUCT_SPEC.md` §4): Floor Mode's visible vocabulary is
  "Spot," Surveillance's stays "Seat" — a deliberate, tested divergence, not
  an inconsistency. `ActiveSeatHeader.tsx` and `CardEntryPad.tsx` gained an
  opt-in `terminology` prop (defaults to "seat," so Surveillance's call
  sites needed zero changes) so Floor Mode's active-target banner and
  "not enabled" card-entry message both say "Spot" too.
- **Information hierarchy fix**: card entry now renders before Done/Next/
  Undo in `FloorScreen.tsx`, matching the operator's actual glance-to-tap
  path (active target → enter a card → then advance/undo).
- **New permanent product principles** (`docs/EYEONPIT_PRODUCT_SPEC.md` §1):
  "EyeOnPit adapts to the operator" and "the observer should not have to
  learn EyeOnPit language."

**Explicitly not touched (deliberately out of scope):** the voice
resolver/parser (commit `4c90844` and everything built in the two rounds
above), the CardEvent ledger, counting mathematics, investigation
persistence, and reporting logic. VoiceControl's own confirmation toast and
Debug panel still say "SEAT"/"DEALER" (sourced from
`cardEntryResolution.ts`'s `targetLabel`, used by both manual and voice
dispatch) — a known, deliberately deferred inconsistency, flagged rather
than fixed, specifically to avoid touching anything voice-adjacent before
PC Field Test #2.

**Tests:** ~10 new/updated regression tests (`FloorScreen.test.tsx`)
proving no "S1"–"S7" leakage across every seat state, the Spot-terminology
card-entry message, and that Surveillance's own "Seat" terminology is
unaffected. Full suite: 883 passed, 1 pre-existing skip, zero regressions.

**Status:** complete, pending review. Not committed/pushed per this
patch's own instructions — see the field-test report for the full
findings/friction report.

### PC Field Test #1 Fixes — Canonicalization, ASR Normalization, Dealer Recovery (2026-08-18)

**Problem:** the very first PC field test of the diagnostic system above
surfaced a real resolver bug and several unhandled ASR patterns:

- A confirmed N-best bug (V-000006/V-000018): "seat one has a five" was
  correctly heard, but the resolver compared narration's and legacy's
  differently-shaped representations of the SAME resulting action as
  string keys, saw them as distinct, and rejected as
  `CONFLICTING_ALTERNATIVES`.
- Chrome's PC/headset speech recognizer showed additional recurring
  misreadings not yet handled: "seat" as "set"/"seet"/"ceit"/"see"/"cheap";
  "seat five" as "T5"/"C5"/"cheap 5"; "has" as "as"; "eight" as "eighth";
  and compact punctuated forms ("seat 1:9", "seat 1/9").
- "dealer" repeatedly misheard as "Taylor" or "Spotify" with **no**
  alternative containing the literal word "dealer" at all — the existing
  N-best resolver had nothing to fall back to in that situation.

**What shipped:**

- **Action canonicalization** (`classifyVoiceTranscript.ts`) — narration ops
  and legacy commands describing the identical resulting action now always
  produce the same `actionKey`/`summary`, regardless of which parser
  produced them or whether one representation carries redundant
  target-selection metadata. This is the actual fix for the V-000006 bug.
- **Blackjack-specific ASR normalization** (`normalizeAsrSeatArtifacts` in
  `parseVoiceCommand.ts`) — "set"/"seet"/"ceit"/"see"/"cheap" recognized as
  "seat" ASR artifacts under the same seat-number-lookahead safety guard as
  the existing "play"/"start" rules; "eighth" added as a rank word;
  deliberately did NOT add "ate" (common past-tense-verb collision risk —
  see the field-test report for the rationale). "as" added as a narration
  hand-connector (the "has"->"as" ASR pattern), gated on an
  already-established target exactly like every other connector word.
- **Compact narration forms** — "S1"/"T5" letter-prefix seat tokens
  (symmetric with the existing "C1" artifact — `seatFromLetterToken`), and
  `:`/`/` folded into ordinary punctuation stripping so "seat 1:9"/"seat
  1/9" tokenize identically to "seat 1 9".
- **Contextual dealer-confusion recovery** (`tryDealerConfusionRecovery` in
  `classifyVoiceTranscript.ts`, invoked only as nBestResolver's last resort
  when EVERY alternative has already failed ordinary classification) — a
  named, closed list of confusion tokens (`DEALER_ASR_TAYLOR`,
  `DEALER_ASR_SPOTIFY`), rescued to a dealer card ONLY when the transcript
  matches a narrow `<token> <connector> (a|an)? <single rank>` shape with no
  other explicit target present. Every recovery is logged with its specific
  rule ID — never a silent guess.
- **Diagnostic logging enrichment** — VoiceControl's `PARSE ALT` lines now
  show which normalization rule fired and why, the resolver score, and
  (when applicable) which recovery rule rescued the result.

**Explicitly refused:** a general fuzzy/phonetic target matcher; blindly
mapping every "Taylor"/"Spotify" occurrence to "dealer"; adding "ate" as a
rank word. See the field-test report for the full list of what was
deliberately left ambiguous/rejected and why.

**Tests:** ~55 new regression tests covering every confirmed field failure
from this round (including the exact V-000006/V-000018 shape, all four
required-recoverable Taylor/Spotify examples, and all four
required-to-remain-rejected examples). Full suite: 880 passed, 1
pre-existing skip, zero regressions. Counting engine and recognition
lifecycle untouched.

**Status:** approved and pushed to master. Next step is PC Field Test #2 —
a fresh diagnostic export, compared against this round's fixes, before any
further voice changes.

### Voice Reliability + Advanced Diagnostic System (2026-08-18)

**Problem:** field reports showed the correct recognition result was
sometimes the speech engine's *second*-ranked alternative, not its first —
but `VoiceControl` only ever parsed `alternatives[0]`. Every other
alternative was logged for diagnostics and then discarded. There was also no
way to correlate ASR/parse/resolve/commit/TTS events for a single utterance,
no structured rejection codes, and no way to export a session for offline
review.

**What shipped:**

- **N-best resolution** (`lib/voice/nBestResolver.ts`,
  `lib/voice/classifyVoiceTranscript.ts`) — every alternative the recognizer
  returns is now independently classified and scored; the resolver picks the
  only valid one, or the one multiple alternatives agree on, or refuses to
  guess when alternatives conflict without a decisive margin. Scoped to the
  ordinary command-dispatch path only — note-mode dictation and a pending
  New Shoe/End Investigation confirmation still read `alternatives[0]`
  only, deliberately (see the module's own doc comment).
- **Structured diagnostics** — a Voice Event ID (`lib/voice/voiceEventId.ts`)
  now correlates every event about one utterance; rejections carry a
  machine-readable code (`lib/voice/voiceDiagnosticsTypes.ts`) alongside the
  existing human-readable text; active target before/after and per-stage
  timing are now logged.
- **Developer diagnostics UI** (`components/live/VoiceDiagnosticsPanel.tsx`)
  — a "latest utterance" detail view (every alternative + confidence, the
  winner, active target before/after, timing, outcome/code) above the
  existing raw log, plus a new **Export JSON** button.
- **`"start 3 as a 7"` normalization** — `"start"` recognized as an ASR
  artifact for `"spot"`, under the same seat-number-lookahead safety guard as
  the existing `"play"`→`"player"` rule.
- **`ASR_NO_FINAL` diagnostic** — a recognition session that ends without
  ever producing a final result is now explicitly logged, surfacing the
  "correct interim, no final" class of field report instead of failing
  silently.

**Explicitly not touched:** the deterministic counting engine, count rules,
and the recognition restart/session lifecycle in `useVoiceRecognition.ts`
(audited, found already correct, left alone).

**Tests:** 45 new (resolver, classifier, integration, additional parser
regression variants). Full suite: 826 passed, 1 pre-existing skip, zero
regressions. See the release-notes entry (site) and the full engineering
report in the PR/commit history for root-cause analysis and the iPhone
field-test procedure.

**Status:** approved for field testing. Next step is real-device iPhone
testing using the new Export JSON diagnostic output — see
`docs/EYEONPIT_OPERATOR_MANUAL.md` and the Troubleshooting page for how to
use it.

---

## Sequence (current, authoritative order)

This is the actual next-priority order. The 1.5/1.6/1.7/1.8/1.9 foundation
and the PC Voice Field Test #2 remediation below are now **built** (pending
review), but that does not change voice's priority — **do not skip PC
Voice Field Test #3** for any reason; it remains the next voice-specific
gate.

1. ~~Floor Mode operator usability cleanup~~ — complete, see above.
2. ~~1.5 Reporting + 1.6 Gold Standard architecture foundation~~ — complete,
   pending review, see above. Built without touching voice.
3. ~~1.7 Counter Detection + Player Analytics, 1.8 Global/Multi-Property/
   Multi-Game foundation~~ — complete, pending review, see above. Built
   without touching voice.
4. ~~1.9 Operator Lifecycle + Global Terminology~~ — complete, pending
   review, see above. Built without touching voice.
5. ~~PC Voice Field Test #2 remediation~~ — complete, pending review, see
   above and `docs/EYEONPIT_VOICE_FIELD_TEST_2.md`.
6. **PC Voice Field Test #3** — protocol prepared, see
   `docs/EYEONPIT_VOICE_FIELD_TEST_3.md` (purpose, 27-line real-mic
   corpus, pass/fail criteria — supersedes the old placeholder pointer to
   Field Test #2's closing section). *(the real-microphone session itself
   is still up next, not yet run)*
6a. **1.10 Split/Double, Phases 1-6** — built and text-regression-tested
    since this list was last current (see the dedicated 1.10 entries
    above): reporting, the Double/Undo fix, split-hand operator UX, voice
    Split/Double commands, explicit split-hand voice card targeting, and
    natural split-hand continuation.
    **PC Voice Field Test #4** — protocol prepared, see
    `docs/EYEONPIT_VOICE_FIELD_TEST_4.md` (19-line real-mic script
    covering Phases 4-5's new voice surface, safety gates). *(also not yet
    run — neither Field Test #3 nor #4's real-microphone session has
    happened; both remain open gates, not just one)*
7. Fix/validate remaining Voice failures surfaced by Field Test #3 and #4.
8. Repeat Voice testing until the reliability gate is met.
9. Voice Independence — implement a real `SpeechProvider` abstraction
   (design finalized, see `docs/EYEONPIT_1_9_VOICE_INDEPENDENCE.md`) and,
   behind it, a Firefox/cross-browser-capable engine — only after the
   Field Test gate above closes on the current browser baseline; run
   the benchmark corpus (same doc §6) against any candidate before it is
   approved.
10. Build-out on top of the now-existing foundation: property metadata
   management UI, AI-narrative review/edit UI, `/lab` creation flows (add
   method, add scenario).
11. **i18n/terminology integration, in this explicit order — never skip
   ahead** (see `docs/EYEONPIT_1_8_GLOBAL_ARCHITECTURE.md` §3.1): (a) Floor
   Mode visible labels, (b) `/lab` UI, (c) Reporting, (d) Documentation/site
   UI, (e) Voice localization LAST, as its own separate project with its
   own safety re-verification — never bundled into the earlier stages.
   Note: (a) is now effectively also true of Surveillance, since 1.9 made
   Spot the global default across both shells — what remains for this
   stage is wiring 1.8's `resolveTerminology()` *property preference*
   into that now-shared default, not introducing Spot itself.
12. **Real-world Counter Detection validation** (see
   `docs/EYEONPIT_1_7_COUNTER_DETECTION.md` §9) — labeled datasets across
   known counters/non-counters/multiple count methods/conservative/covered
   profiles; the Confidence Engine's `EXPERIMENTAL_NOT_VALIDATED` status
   does not change until this exists and is reviewed.
13. **`validateMethodGameCompatibility` MUST be wired into
    `createSimulationScenario`/`validateSimulationScenario` before or
    alongside any second `GameFamily` implementation** — not after (see
    `docs/EYEONPIT_1_8_GLOBAL_ARCHITECTURE.md` §7's explicit
    production-readiness gate). A second real `GameFamily` (Spanish 21,
    Baccarat, etc.) itself — architecture ready, no second game
    implemented yet.
14. Real accounts/subscriptions/roles for `/lab`, once actually
    prioritized — foundation only today
    (`docs/EYEONPIT_1_8_GLOBAL_ARCHITECTURE.md` §8-9).

Also still pending, not yet scheduled into the sequence above:

- **Real iPhone field testing** of the voice diagnostics/N-best/PC-field-fix
  work, using Export JSON to capture and review field sessions.

See `docs/EYEONPIT_PRODUCT_SPEC.md`'s Implementation Status Matrix for the
full list of **PLANNED**/**FUTURE** capabilities (voice wager mutation,
hit/stand/double/split/surrender/insurance voice commands, fully natural
conversational capture, etc.) — that matrix is the authoritative source for
long-range voice scope; this roadmap only tracks active/near-term sequence.
