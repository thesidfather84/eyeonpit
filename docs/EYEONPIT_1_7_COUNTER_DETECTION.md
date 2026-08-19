# EyeOnPit 1.7 — Counter Detection + Player Analytics

**Status: foundation + first validated-methodology implementation built,
pending review. EXPERIMENTAL — NOT VALIDATED against real-world data.**
This document describes the `PlayerObservation` model, the bet/count,
playing-deviation, insurance, and entry/exit analytics, the Counter
Detection Confidence Engine, and the synthetic validation/benchmark
harness built for EyeOnPit 1.7. All of it lives under
`src/lib/player-analytics/`. See `docs/EYEONPIT_1_6_ARCHITECTURE.md` §8
for the architecture-only groundwork this builds on, and
`docs/EYEONPIT_1_5_REPORTING.md` §9 for how validated output is allowed to
reach a Report.

**Read this before citing any number from this system anywhere
product-facing.** Every classification, confidence score, and benchmark
metric this system produces is real and freshly computed — nothing is
hardcoded — but the Confidence Engine's own thresholds are an initial,
documented design, not yet proven against real-world player data. Treat
its output as an investigative indicator for a human analyst, never an
accusation, a conclusion, or a fact.

---

## 1. Design principles

- **Never classify from hand count alone.** A minimum-hands floor
  (`MIN_HANDS_FOR_ANY_CLASSIFICATION`) is a *necessary*, never
  *sufficient*, gate — it only ever caps how high a classification can go
  when evidence is thin. A player with 200 hands of flat, count-independent
  betting stays `LOW` forever.
- **No fabrication.** Every signal the Confidence Engine considers is a
  real, computed statistic over real `PlayerObservation` data (Pearson
  correlation, OLS regression, or a plain rate) — never an invented
  "AI confidence" figure.
- **No invented strategy/index data.** Basic-strategy consistency reuses
  the already-verified chart from `lib/gold-standard/simulation/
  basicStrategy.ts`. Index-deviation (count-threshold) consistency ships
  with **zero bundled index entries** — the machinery is real and tested,
  but produces no claim without a caller-supplied, sourced table.
- **No unnecessary player PII.** `PlayerObservation` identifies a player
  only by investigation/spot/session (+ the existing non-PII
  `playerGroupId` label) — see `docs/EYEONPIT_1_5_REPORTING.md` §3's
  Player Identity Privacy Rule, unchanged and extended, never weakened.
- **Conservative by construction.** It is always better to return
  `INSUFFICIENT_DATA` than a weak accusation — proven directly by the
  false-positive safety suite (§10).
- **Never automatic.** Nothing in this system runs against a live
  investigation or auto-populates a Report. Every invocation — from `/lab`
  or from `attachPlayerAnalytics` — is a deliberate, explicit action.

## 2. PlayerObservation model (Priority 1)

`src/lib/player-analytics/playerObservation.ts` — `PLAYER_OBSERVATION_SCHEMA_VERSION
= 1`. One record per observed decision point (a seat's hand, or a split
sub-hand), covering investigation/table/spot identity, shoe/round/hand
sequence, wager + wager-change fields, running/true count *at the moment
the wager was placed* (matching `lib/analysis/apLikelihood.ts`'s existing
convention), which built-in count method/version produced that count,
player cards + dealer up-card, actions, outcome, insurance
offered/taken/amount, entry/exit flags, and verbatim observer notes.

`src/lib/player-analytics/extractObservations.ts` — `extractPlayerObservations`
derives this entirely from real `Investigation`/`CardEvent` data (via the
same `calculateRoundCountSnapshot` the existing AP-correlation feature
uses) — no new counting mathematics, no field invented. Deliberate scope
decision: RC/TC are read from the investigation's own trusted counting
system (Hi-Lo/KO/Zen/Omega II), never re-derived for an arbitrary custom
method. Insurance is inferred from the real rule that it's only offered
when the dealer's first card is an Ace. Entry/exit is inferred from
genuine gaps in a seat's per-round presence, looking one round ahead so
the final round of an investigation is never misread as "exit" evidence.
9 regression tests in `extractObservations.test.ts` cover every one of
these derivations against hand-verified fixtures.

## 3. Bet/count correlation analytics (Priority 2)

`src/lib/player-analytics/betCountAnalytics.ts` — Pearson correlation and
ordinary least-squares regression (both standard, citable statistics),
bet spread, average wager by count sign, and count-threshold response
(fraction of wager increases following a positive count / decreases
following a non-positive one). Uses `startingWagerAmount`, never the
post-Double `wagerAmount`, and excludes split sub-hands, since neither
carries an independent bet-sizing decision. **Outputs only numbers and
sample sizes — never a "counter" label**, per this priority's own explicit
rule; interpretation is the Confidence Engine's job alone.

## 4. Playing-deviation analysis (Priority 3)

`src/lib/player-analytics/playingDeviationAnalysis.ts`. Two halves, two
honesty statuses:

- **Basic-strategy consistency — IMPLEMENTED + FUNCTIONAL.** Reuses
  `basicStrategyDecision` unchanged. Evaluates only the FIRST decision
  point of each hand (initial two cards vs. dealer up-card) — a documented
  scope limitation, not a hidden one; later hit/stand decisions on a 3+
  card hand aren't re-evaluated in this pass.
- **Index-deviation consistency — FOUNDATION ONLY.** `IndexDeviationTable`
  is a real, typed, lookup-and-threshold-comparison mechanism — but ships
  with **no bundled entries**. `indexConsistentDeviationRate` is `null`
  for every report/analysis until a caller explicitly supplies a real,
  sourced table (e.g. a properly cited Illustrious-18-style entry).

## 5. Insurance analysis (Priority 4)

`src/lib/player-analytics/insuranceAnalysis.ts` — `computeInsuranceAnalysis`
takes `trueCountThreshold` as a **required** argument; there is no default
baked in. `HI_LO_INSURANCE_REFERENCE_TRUE_COUNT = 3` is exported as a
citable, well-published reference value a caller *may* choose to pass —
the module never assumes it. Split sub-hands are excluded (one round has
exactly one insurance decision, not one per sub-hand).

## 6. Entry/exit evidence (Priority 5)

`src/lib/player-analytics/entryExitAnalysis.ts` — plain counts/rates over
entry/exit timing vs. count sign. A player's very first-ever appearance is
excluded from "entry consistency" (sitting down isn't wong-in behavior by
definition) — only later resumes count. **Evidence only** — this module
never outputs a classification, matching Priority 5's own rule exactly.

## 7. Counter Detection Confidence Engine (Priority 6)

`src/lib/player-analytics/confidenceEngine.ts` — `CONFIDENCE_ENGINE_VERSION
= 1`. Combines every signal above into one of five states —
`INSUFFICIENT_DATA` / `LOW` / `MODERATE` / `HIGH` / `VERY_HIGH` — never a
boolean.

**Scoring methodology (a documented design, not yet validated):**

1. Each of up to six signals (bet/count correlation, regression fit,
   count-threshold response, index-deviation consistency [only if a table
   was supplied], insurance count-consistency, entry/exit consistency) is
   computed as a strength in `[0, 1]`.
2. Each signal is weighted by a sample-size confidence factor
   `n / (n + 10)` — a standard shrinkage technique so a strong-looking
   signal from a handful of hands can't dominate the score the way the
   same strength from 40+ hands would.
3. A signal whose raw metric is strongly negative (e.g. wagers that
   *shrink* as the count rises) is flagged **contradictory** and excluded
   from the positive-weighted average — each contradictory signal instead
   discounts the final score by 25%.
4. Classification requires BOTH a score threshold AND a hand-count floor:
   `INSUFFICIENT_DATA` below 15 usable hands regardless of score;
   `HIGH` requires score ≥ 0.55 **and** ≥ 30 usable hands; `VERY_HIGH`
   requires score ≥ 0.75 **and** ≥ 50 usable hands. **The hand-count floors
   only ever cap a classification down, never produce one on their own** —
   this is the literal mechanism behind "never classify from hand count
   alone."

Every result carries `handsObserved`, `handsWithUsableEvidence`, reason
codes, the strongest contributing signals, any contradictory signals, and
every input analytic's own version number.

## 8. 50-hand validation / benchmark harness (Priority 7)

`src/lib/player-analytics/validation/` — `syntheticArchetypes.ts` (14
deterministic, seeded, clearly-synthetic player archetypes — see the full
list below) and `benchmarkHarness.ts` (`runBenchmark`, checkpoints 10,
20, 30, 40, 50, 60, 75, 100 hands).

**What this proves, and what it does not** (same discipline as
`docs/VALIDATION.md`'s counting harness): a favorable result here is
evidence that, against these labeled SYNTHETIC behavior models, the
Confidence Engine's current thresholds behave as intended. **It is not a
claim that real casino players behave like these archetypes**, and it is
not a substitute for real-world validation.

**Archetypes**: non-counters (flat bettor, random bettor, casual
variation) · adversarial non-counters designed to *look* count-correlated
without counting (progressive/press-your-win, martingale, high-roller
variable, random-insurance, brief-entry) · counters (conservative Hi-Lo,
aggressive Hi-Lo, KO, Zen, Omega II, covered/disguised). Scope limitation:
every archetype's *playing* decisions are held constant (always the
basic-strategy-correct action on a fixed hand) — only wager size,
insurance, and entry/exit timing vary. This benchmark therefore does not
exercise playing-deviation-based detection.

**Measured results (5-seed default run, locked in as regression tests in
`benchmarkHarness.test.ts`)**:

| Hands | Sensitivity | Specificity | False-Positive Rate | Precision |
|---|---|---|---|---|
| 10 | 0% | 100% | 0% | — |
| 20 | 0% | 100% | 0% | — |
| 30 | 96.7% | 100% | 0% | 100% |
| 40–75 | 96.7% | 100% | 0% | 100% |
| 100 | 80% | 100% | 0% | 100% |

**Zero measured false positives at every checkpoint, against every
non-counter archetype including every adversarial pattern.** Average
hands-to-`HIGH`: 30. Median: 30. `evaluate50HandDefensibility` — which
reads the ACTUAL checkpoint-50 vs. checkpoint-60 false-positive rates
rather than asserting an answer — currently returns `50-hands-defensible`
against this synthetic benchmark (both rates measured at 0%). This is a
real, reproducible, regression-tested result — not the product's final
word on 50 vs. 60 hands, which requires real-world validation this
benchmark cannot provide.

### 8.1 The 100-hand sensitivity dip — root-caused, not tuned away

**An honest, reproducible characteristic surfaced by this harness, not
hidden:** sensitivity is not perfectly monotonic — it dips from 96.7% to
80% at the 100-hand checkpoint (5-seed default run). This was
investigated directly (diagnostic scripts run and discarded, not left in
the codebase) rather than left as a vague "noise" hand-wave, and rather
than tuned away — Priority-4's own instruction was explicit: **do not
tune the Counter Detection model just to improve benchmark numbers, and
do not hide inconvenient benchmark behavior.**

**Root cause, confirmed by inspecting the actual data:** all 6 of the
checkpoint-100 false negatives trace to a real, identifiable mechanism —
5 of the 6 (`hi-lo-conservative`, `ko-counter`, `zen-counter`,
`omega-ii-counter`, `covered-counter`, all under seed 1) share the exact
same synthetic true-count walk (every archetype consumes the same
deterministic random-walk sequence first, before any archetype-specific
wager jitter — see `syntheticArchetypes.ts`'s `buildCountWalk`). For
seed 1, hands 76–100 — the harness's 4th simulated 25-hand "shoe" — landed
entirely at a **negative-or-zero true count for all 25 hands** (mean
-1.66, range 0 to -6.7). A counting player's own wager function
(`10 + max(0, min(tc, 6)) * multiplier`) correctly flat-bets the table
minimum through a stretch like that — it is genuinely count-consistent
behavior, not a lapse. But `computeBetCountAnalytics` measures Pearson
correlation and OLS regression fit over the **entire** observation
window, not per-shoe: a full quarter of the 100-hand sample contributing
zero bet-size variance in the positive-count direction measurably dilutes
the correlation/R² computed over the whole window (concretely, for
`hi-lo-conservative`/seed 1: correlation with true count was 0.981 and
R² was 0.962 at the 75-hand checkpoint, and dropped to 0.552/0.305 once
hands 76–100 were included). Because these large-sample signals carry a
high sample-size confidence weight by hand 100 (`n/(n+10)` ≈ 0.91), this
dilution has outsized influence on the blended score, pulling several
archetypes from just above the `HIGH` threshold (0.55) to just below it.
The 6th failure (`covered-counter`, seed 2) is the same class of effect
on a different seed — `covered-counter` is deliberately the
weakest-signal archetype (built with intentional "cover" noise), so it is
the most exposed to any single unfavorable stretch, on any seed.

**What this is, and what it isn't:** this is a genuine property of
computing an un-windowed, un-weighted correlation/regression over an
arbitrarily long, multi-shoe observation history — a real methodological
characteristic to account for in any future validation or refinement, not
a bug in the arithmetic and not evidence the synthetic archetypes are
unrealistic (a real counter really would flat-bet through a cold shoe).
**No model tuning was performed in response to this finding** — the
weights, thresholds, and formulas described in §7 are unchanged from
before this investigation. A natural, NOT-YET-IMPLEMENTED direction for
future work (subject to the same real-world validation requirement as
everything else in this document before it ships) would be per-shoe or
recency-weighted correlation rather than one flat regression across
however many shoes were observed — recorded here as a finding, not
applied.

## 9. Real-world (gold-standard) validation plan — not yet started

**Nothing in this section has been executed.** Everything in §8 is
synthetic-only evidence. This section is the concrete next-stage plan for
validating the Confidence Engine against real, labeled behavior — written
now, per explicit instruction, so the path from "synthetic benchmark" to
"real evidence" is decided in advance rather than improvised later.

### 9.1 Labeled dataset requirements

Each labeled case needs, at minimum, a real (or realistically
reconstructed) `PlayerObservation[]` sequence and a ground-truth label
supplied by someone OTHER than the detection system — never
self-labeled by the engine's own output:

- **Known non-counters** — verified basic-strategy or casual players,
  ideally with the property/surveillance team's own independent
  assessment as the label.
- **Known counters, across multiple count methods** — Hi-Lo, KO, Zen,
  Omega II at minimum, matching the four built-in adapters this
  architecture already trusts (§3 of `docs/EYEONPIT_1_6_ARCHITECTURE.md`).
- **Conservative counters** (small spread) and **aggressive counters**
  (large spread) as separate labeled groups — §8's synthetic benchmark
  already shows these behave differently (§8.1); real data should confirm
  or correct that.
- **Covered/disguised counters** — deliberately the hardest case; §8
  already shows this is the synthetic archetype most exposed to
  false negatives.
- **Progressive bettors, martingale bettors, random/high-variance
  bettors, high rollers** — the real-world equivalents of the §10/Priority 8
  adversarial archetypes, specifically to re-test the "zero measured false
  positives" result (§8's own headline number) against real, not
  synthetic, noise.
- **Real wong-in/wong-out behavior** — genuine entry/exit timing relative
  to the count, from real sessions, to validate §6's entry/exit evidence
  independent of the synthetic archetypes' idealized timing.

**Where this data would come from:** real EyeOnPit investigations already
produce genuine `PlayerObservation` sequences via `extractObservations.ts`
— no new capture mechanism is required. The gap is exclusively the
LABEL (a trusted, independent determination of whether the observed
player was actually counting), which EyeOnPit itself cannot supply and
must come from real surveillance/investigative judgment, case
files, or a controlled study design.

**Privacy discipline, unchanged from §2:** a labeled case is still bound
by the Player Identity Privacy Rule — a ground-truth label attaches to an
investigation/spot/session, never to a name, loyalty number, or
government ID. Do not collect or persist any player-identifying
information beyond what `PlayerObservation` already permits, even for
validation purposes; a label can be tracked by investigation ID + spot
number exactly like every other field this architecture already handles.

### 9.2 Metrics to measure (same discipline as §8, on real data)

For each labeled case, at hand checkpoints **25, 30, 40, 50, 60, 75, and
100** (the 25-hand checkpoint added specifically to give the real-world
plan finer resolution below the current 30-hand synthetic inflection
point identified in §8):

- Sensitivity, specificity, precision, recall
- False-positive rate, false-negative rate
- Calibration (does a stated confidence score of ~0.X actually resolve
  correctly ~X% of the time, bucketed — the same method
  `benchmarkHarness.ts`'s `computeCalibration` already implements, reused
  unchanged against real data rather than rewritten)
- Hands-to-HIGH-confidence distribution (mean, median, and — unlike §8's
  synthetic run — variance across real individual sessions, since real
  players won't share one deterministic count-walk the way synthetic
  archetypes under the same seed do)

### 9.3 Required before ANY product claim changes status

Per Priority B13's original instruction (`docs/EYEONPIT_1_6_ARCHITECTURE.md`
§8.3) and this document's own repeated caveat: the Confidence Engine's
`EXPERIMENTAL_NOT_VALIDATED` status in code, docs, and every UI/report
surface stays exactly as-is until real-world metrics exist and are
reviewed — no partial dataset, no "looks promising so far" interim
status change, no marketing language change ahead of that review.

## 10. False-positive safety (Priority 8)

`src/lib/player-analytics/validation/falsePositiveSafety.test.ts` —
explicit, dedicated tests (8 seeds × 4 hand counts each) proving the
Confidence Engine never reaches `HIGH`/`VERY_HIGH` for: a lucky-streak/
press-your-win progressive bettor, a martingale bettor, a high roller with
large naturally-variable bets, a player who takes insurance at random, and
a brief-entry player (who correctly stays `INSUFFICIENT_DATA`). All 5 test
groups pass with zero violations.

## 11. Report integration (Priority 9)

`src/lib/player-analytics/reportIntegration.ts` — `attachPlayerAnalytics`
is the **only** place a `Report` gains 1.7 analytics fields, and it is
**never** called from `buildReportFromInvestigation`. `ReportAnalysisSection`
(`lib/reporting/reportSchema.ts`, schema bumped to v2) gained six new
optional fields — `counterAnalysisBySeat`, `bettingAnalysisBySeat`,
`playingDeviationAnalysisBySeat`, `insuranceAnalysisBySeat`,
`observationConfidenceBySeat`, `methodology` — every one of them per-seat
(not merged across seats sharing a `playerGroupId` — a documented scope
limitation) and populated only via this explicit call.
`attachPlayerAnalytics` structurally guarantees `methodology.validationStatus:
"EXPERIMENTAL_NOT_VALIDATED"` is stamped alongside any analytics it adds —
there is no code path that adds one without the other. `ReportPreview.tsx`
and `exportRtf.ts` render these new sections — with a prominent
EXPERIMENTAL notice — only when actually present; they are omitted
entirely (not shown as "not available") for the overwhelming majority of
reports that will never invoke this.

## 12. `/lab` UI (Priority 10)

Three real, data-backed pages, replacing the former architecture-only
placeholder:

- **Counter Detection** (`/lab/counter-detection`) — status/overview,
  links to the other two, explicit EXPERIMENTAL notice.
- **Player Behavior Analysis** (`/lab/player-behavior`) — picks a real
  past investigation and spot, runs the real extraction + Confidence
  Engine pipeline live, shows classification, a genuinely re-computed
  confidence progression across hand checkpoints, full signal breakdown,
  bet/count relationship, and playing-deviation evidence.
- **Validation Benchmarks** (`/lab/validation-benchmarks`) — a "Run
  Benchmark" button that runs the real harness client-side and renders the
  real per-checkpoint metrics table, hands-to-HIGH figures, and worst-case
  false-positive list. No charts or numbers are pre-baked; everything is
  freshly computed on click.

## 13. Deferred / not yet built

- Cross-seat analytics merging for a player occupying multiple spots under
  one `playerGroupId`.
- Re-evaluating playing decisions beyond a hand's first decision point.
- Any bundled index-deviation table (architecture ready, no data shipped).
- Operator-facing UI to trigger `attachPlayerAnalytics` from within an
  actual investigation/report workflow (today: a library function, callable
  but not wired to any button outside `/lab`).
- Manual browser verification of the three new `/lab` pages this session
  (they are `tsc`/`eslint` clean and built on the same tested library
  functions as the rest of `/lab`, but were not walked through in a running
  browser during this pass — flagged honestly, not silently skipped).
