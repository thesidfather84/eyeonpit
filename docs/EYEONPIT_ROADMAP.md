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
6. **PC Voice Field Test #3** — a fresh diagnostic export against this
   round's remediation, using the suggested script in
   `docs/EYEONPIT_VOICE_FIELD_TEST_2.md`'s closing section, before any
   further voice changes. *(up next)*
7. Fix/validate remaining Voice failures surfaced by Field Test #3.
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
