# EyeOnPit 1.6 — Blackjack Gold Standard Architecture

**Status: foundation built, pending review.** This document describes the
research/simulation architecture built for EyeOnPit 1.6: the Blackjack Game
Definition, the Count Method Registry, the exact-composition model, the
Simulation Scenario/Result models and deterministic engine, the private
`/lab` research area, the method import/export format, the Research
Library, and the Counter Detection Confidence Engine's architecture. It is
an engineering reference — see `docs/EYEONPIT_PRODUCT_SPEC.md` for
product-level principles and the Implementation Status Matrix for what's
actually shipped.

This is **research infrastructure**, not the trusted counting product. It
never replaces, and is never used by, `lib/counting-engine/*` — every file
here either wraps that engine read-only (§3) or exists entirely alongside
it (§2, §4–8) for research/simulation purposes that do not touch a live
investigation. See `docs/EYEONPIT_1_5_REPORTING.md` §9 for exactly how (and
under what conditions) validated output from here is allowed to eventually
appear in a Report.

---

## 1. Design principles carried through every piece of this architecture

- **Do not invent formulas.** Every count method's tag table, the standard
  basic-strategy chart, and every probability/statistics calculation here
  is a well-known, citable reference implementation — never something
  guessed or approximated to "seem right."
- **Wrap, don't rewrite.** The four currently-trusted count systems
  (Hi-Lo/KO/Zen/Omega II) are adapted from the real engine's own exported
  tag tables, never re-typed by hand — see §3.
- **Version everything, never silently overwrite.** `GameDefinition`,
  `CountMethodDefinition`, `BettingStrategy`, `PlayingStrategy`,
  `SimulationScenario`, and `SimulationResult` all extend `VersionedRecord`
  (`src/lib/versioning/types.ts`). A historical scenario/result keeps the
  exact version references it was built with even after newer versions
  exist.
- **Correctness before performance.** The simulation engine (§6) is
  deterministic and validated first; it is not yet optimized for large-N
  runs.
- **Verification-status honesty (Priority B12).** Every count method
  carries one of four statuses — VERIFIED / RECONSTRUCTED / EXPERIMENTAL /
  RESEARCH_ONLY — enforced by `validateCountMethodInput`, not just by
  documentation. A reconstructed system can never be labeled VERIFIED.
- **No fake data anywhere in `/lab`.** Every list/detail screen in the
  private research area reads real Dexie data; a not-yet-built creation
  flow says so honestly rather than faking a result.

## 2. Blackjack Game Definition (Priority B1)

`src/lib/gold-standard/gameDefinition.ts` — `GameDefinition extends
VersionedRecord`: deck count, dealer soft-17 rule (`DealerSoft17Rule`),
double-after-split, doubling-total restrictions, split/resplit/ace-split
rules, surrender availability, blackjack payout (`BlackjackPayout`),
penetration, cut-card/burn-card behavior, and shuffle type
(`ShuffleType`). `validateGameDefinition` enforces internal consistency
(e.g. penetration in range, payout is a recognized ratio).
`GAME_DEFINITION_PRESETS` ships two real, named presets
(`vegas-strip-6d-s17`, `single-deck-h17`) as concrete, citable starting
points — not placeholders. All game rules live in this one typed record;
nothing about table rules is scattered across simulation or UI components.

## 3. Count Method Registry & existing-method adapters (Priorities B2–B4, B12)

`src/lib/gold-standard/countMethodRegistry.ts` defines the registry shape:
`CountMethodDefinition` — canonical ID, display name, author/source,
verification status, balanced/unbalanced, a flat `tags:
Partial<Record<Rank, number>>` lookup table, true-count method, ace
handling, side counts, insurance-logic note, betting correlation/playing
efficiency/insurance correlation (published metrics only, never computed
or invented here), notes, and source references.
`computeRunningCountForMethod` is the one generic calculation this file
provides — any method describable as a flat rank→tag table (which covers
most real point-count systems) works through it with zero new engine code,
which is what makes "simple systems addable without touching core engine
code" (Priority B2) actually true rather than aspirational.

**Existing-method adapters** (`src/lib/gold-standard/countMethodAdapters.ts`)
wrap Hi-Lo, KO, Zen, and Omega II by spreading each system's *live* export
from `lib/counting-engine`'s own `COUNT_TAGS` — never a second hand-typed
copy of the tag values. `countMethodAdapters.test.ts` is a regression suite
proving byte-identical output against `COUNT_TAGS`/`isBalancedSystem` for
all four systems across all thirteen ranks, plus a running-count
cross-check against the real engine's `calculateCountSnapshot`. If the
underlying engine's tag values ever change, this suite fails immediately —
that is the intended trip-wire for "don't rewrite validated math without
proof," not a coincidence.

**Future method library (Priority B4).** Wong Halves, Hi-Opt I/II, Red
Seven, REKO, KISS variants, Uston and Revere systems, and custom/research
systems all fit the same `tags`-table shape and can be added as new
`CountMethodDefinition` rows via `createCountMethod` — no registry, engine,
or adapter code changes required. A method whose logic cannot be expressed
as a flat tag table (a device-based composition method, an advanced
side-count-driven system) stays `RESEARCH_ONLY` with `tags: null` until a
real, reviewed implementation exists.

**UPDATE (EyeOnPit 1.8):** `CountMethodDefinition` gained two OPTIONAL
fields — `supportedGameFamilies?: GameFamily[]` and `methodKind?:
MethodKind` — purely additive, every existing method/adapter still
type-checks and validates unchanged. See
`docs/EYEONPIT_1_8_GLOBAL_ARCHITECTURE.md` §7 for the generic Game
Definition/Method framework and `lib/gold-standard/game/
gameMethodCompatibility.ts` for the resulting compatibility validator
(standalone, not yet force-integrated into scenario creation).

## 4. Exact shoe composition (Priority B5)

`src/lib/gold-standard/exactComposition.ts` — `computeExactComposition`
derives the exact remaining count of every rank (A–K) from a configured
shoe size and the same `CardEvent` history the trusted ledger already
uses (`activeEventsInOrder` — undone/void events correctly excluded).
`validateCardConservation` checks the totals never exceed what a
configured shoe can physically contain. This is **research
infrastructure** for simulation/analysis — it does not replace, gate, or
feed back into the trusted count ledger in any way.

## 5. Simulation Scenario model (Priority B6)

`src/lib/gold-standard/simulation/scenario.ts` — `SimulationScenario
extends VersionedRecord`, referencing a `GameDefinition` version, a
`CountMethodDefinition` version, a `BettingStrategy` (bet-by-true-count
steps), a `PlayingStrategy` (`baseStrategy: "basic"`, plus optional
user/research-supplied deviations — never invented deviation numbers),
penetration, bankroll assumptions, hands/shoes to simulate, and a required
explicit integer `seed`. The contract is exact: **the same seed, the same
scenario, and the same simulator version reproduce the same result** —
proven directly by `engine.test.ts`'s determinism test.

## 6. Deterministic Simulation Engine (Priority B7)

`src/lib/gold-standard/simulation/`:

- `rng.ts` — `mulberry32`, a small deterministic seeded PRNG, and
  `buildShuffledShoe`. Deliberately its **own** copy, not shared with
  `lib/counting-engine/validation/rng.ts` (that copy is explicitly
  test-only and never imported by production code) — keeping these
  separate means a future change to one can never silently change the
  other's behavior.
- `basicStrategy.ts` — the standard multi-deck S17 basic-strategy
  reference chart (hard totals, soft totals, pairs, surrender). Documented
  scope limitation: it does not yet adjust for single-deck/H17 index
  differences from that baseline chart.
- `handEvaluation.ts` — wraps the real `computeHandTotal` /
  `isAutoDetectedBlackjack` from the counting engine rather than
  reimplementing hand-total logic a second time.
- `engine.ts` — `runSimulation(input)`: deals hands against a shuffled,
  seeded shoe, applies basic strategy (with one supported split level),
  settles bets, and tracks true count via the real `computeDecksRemaining`.
  Validates card conservation, penetration/reshuffle behavior, dealer
  rules, hand totals (hard/soft), splits, doubles, and blackjack payouts as
  part of its own test suite.

**Documented scope limitations** (prominent in `engine.ts`'s own doc
comment, not hidden): single seat only, one split level maximum, no
insurance, standard-chart strategy only (deviations recorded on the
scenario but not yet applied during play), only balanced count methods
supported (an unbalanced method's scenario throws rather than silently
producing a wrong true count), dealer hand always fully played out.
**Correctness first, per Priority B7** — these are the honest boundaries of
"correct within documented scope," not a claim of full-featured play.

One implementation detail worth noting for future extension: a split
round's sub-hands are **not** treated as independent samples when computing
`handsSimulated`/EV/variance — all sub-hand settlements within one dealt
round are summed into a single per-round outcome before being added to the
result set, since they share the same parent cards and the same
underlying deal. Any future engine change that adds a second split level
must preserve this aggregation, not push one outcome per sub-hand.

## 7. Simulation Result model (Priority B8)

`src/lib/gold-standard/simulation/result.ts` — `SimulationResult extends
VersionedRecord`: scenario ID, seed, simulator version, count-method
version, game-rules version, hands simulated, expected value, variance,
standard deviation, standard error, confidence interval, and (where
applicable) betting correlation / playing efficiency / insurance
correlation. `isResultTrustworthy(result)` requires every one of the
result's own `validationChecks` to have passed — a result is never
presented as trustworthy just because a number was produced. No metric
this model doesn't actually compute is ever reported (Priority B8's "do
not fabricate unsupported metrics").

## 8. Counter Detection Confidence Engine — architecture only (Priority B13)

**UPDATE (EyeOnPit 1.7): this architecture is now implemented.** See
`docs/EYEONPIT_1_7_COUNTER_DETECTION.md` for the full, real, tested
Confidence Engine, `PlayerObservation` model, bet/count/playing-deviation/
insurance/entry-exit analytics, and the 50-hand synthetic validation
benchmark — all EXPERIMENTAL / NOT VALIDATED against real-world data,
exactly as this section anticipated. The rest of this section is kept as
the original architecture-only record of what was planned before that
implementation existed.

**As of the 1.6 patch, nothing in this section was implemented.** No
detection code, no scoring function, no classification threshold existed
anywhere in the codebase at that time. This section existed so the
*shape* of that future work was decided in advance, and so `/lab`'s
Counter Detection placeholder screen
(`src/app/lab/(protected)/counter-detection/page.tsx`) can honestly say
what's coming instead of linking to nothing.

### 8.1 Why this isn't a fixed-hands-count classifier

**Do not force a classification at a fixed number of hands.** A real
counter detection engine has to weigh multiple independent, individually
weak signals (below) into a running confidence estimate that improves as
more hands are observed — a hard cutoff at hand N would either force a
premature call on thin evidence or waste already-sufficient evidence
waiting for an arbitrary number. The competitive target is roughly **50
observed hands** to reach a usable confidence level, with 60 acceptable
*only if real validation data shows 50 measurably increases the
false-positive rate* — this number is a target to validate against, not a
constant to hardcode ahead of that validation.

### 8.2 Future input signals (not yet computed)

- Bet size versus true count at time of bet (the existing
  `computeApLikelihoodBySeat` correlation is a **precursor** to this, not
  the detection engine itself — see `docs/EYEONPIT_1_5_REPORTING.md` §9)
- Direction and magnitude of bet-size changes following positive- versus
  negative-count swings
- Bet spread (min/max ratio) and how it evolves over a session
- Wong-in / wong-out behavior (entering/leaving a shoe at specific counts)
- Count-consistent basic-strategy deviations (index plays that only make
  sense at a specific true count)
- Insurance decisions relative to the count
- Cross-count-system-family correlation (does the player's behavior track
  more closely with one known system's index numbers than another's)
- Cross-shoe consistency (does the same behavioral pattern repeat across
  multiple shoes for the same tracked player)

### 8.3 Required validation metrics before ANY claim ships

Per Priority B13's own instruction — **do not make marketing claims until
benchmark data proves them** — any future implementation must report, and
this architecture must be validated against, all of:

- Sensitivity (true positive rate)
- Specificity (true negative rate)
- False-positive rate
- False-negative rate
- Confidence calibration (does a stated "80% confidence" actually resolve
  correctly ~80% of the time against a real/simulated benchmark)
- Average hands-to-classification, at whatever confidence threshold is
  chosen

### 8.4 Where this connects to the rest of the architecture

- Consumes `SimulationResult`/scenario data (§5–7) to benchmark itself
  against known counting *and* known non-counting play patterns before any
  live use.
- Its eventual output is a candidate future field on
  `ReportAnalysisSection` (`docs/EYEONPIT_1_5_REPORTING.md` §9) —
  deliberately not reserved as a placeholder field yet, so an unpopulated
  field can never be mistaken for a real, validated capability.
- Lives in the private `/lab` area (§10) — advisory only, never an
  automatic accusation. Human judgment is always final, matching
  `docs/EYEONPIT_PRODUCT_SPEC.md` §15's Deep Eye principle exactly.

## 9. Method import/export format (Priority B10)

`src/lib/gold-standard/methodImportExport.ts` — `eyeonpit-method.json`,
`METHOD_EXPORT_SCHEMA_VERSION = 1`. `serializeMethodToJson`/
`parseMethodImportFile` round-trip a method's metadata, tags, and
verification/source fields as **pure JSON data**. Security boundary,
enforced in code, not just written down: `JSON.parse` is the *only*
parsing step used on untrusted input anywhere in this file — no `eval`, no
`new Function`, no dynamic `import()`. There is no field in this format
capable of carrying executable code, so there is nothing to accidentally
execute even if this file changes carelessly later. An imported file
claiming `VERIFIED` status is always downgraded to `RECONSTRUCTED` on
import — only EyeOnPit's own built-in adapters (§3) are ever `VERIFIED`,
never anything imported. Every imported method is re-validated through the
exact same `validateCountMethodInput` a UI-created method must pass — an
import gets no special trust. "Advanced algorithms need a safe plugin
architecture later" (Priority B10's own words) is intentionally **not**
solved by this format — a method whose logic can't be expressed as a flat
tag table stays `RESEARCH_ONLY` and un-importable as a working method
until that future plugin architecture exists.

## 10. Research Library (Priority B11)

`src/lib/gold-standard/researchLibrary.ts` — `ResearchLibraryEntry extends
VersionedRecord`: source type (book/paper/TikTok/YouTube/Reddit/forum/
article/patent/user-submitted), author, date found, the claim being made,
any disclosed formula, reconstruction notes, implementation status,
verification status, simulation status, simulation results reference, and
free-text notes. This is the intake point for every future method that
isn't yet a working `CountMethodDefinition` — a claim gets recorded and
tracked through implementation/verification/simulation stages honestly,
rather than either being ignored or being promoted to "verified" without
that trail.

## 11. Private `/lab` area (Priority B9)

A fully **independent** second authorization gate — `src/lib/labAuth/`
mirrors `src/lib/auth/` structurally (stateless signed-cookie session,
HMAC-derived signing key, `timingSafeEqual` comparison, generic failure
messages) but uses its own env var (`EYEONPIT_LAB_PASSCODE`), its own
cookie name (`eyeonpit_lab_session`), and its own HMAC namespace — a
`/lab` session and a main-app session are never interchangeable, even if
the two passcodes happened to collide (see
`proxy.test.ts`'s dedicated cross-session test). The passcode is never
hard-coded, never committed, and never logged — it is read once from the
environment at request time. `src/proxy.ts` gates `/lab/*` before the
main-app routing logic runs at all; `src/app/lab/(protected)/layout.tsx`
re-checks the same session token as defense-in-depth, per Next.js's own
guidance to never rely on middleware alone.

This is deliberately built as a **separable** area (own auth, own routes)
because it is the architectural seam for Priority S5's future paid
membership tier — Simulation Lab, advanced method library, research
tools, and (once built) Counter Detection all live behind this same gate,
so that gate can later grow real accounts/subscriptions/roles without
relocating any of this code. No payment processing exists or was added.

Sections shipped as real, data-backed screens today: Blackjack Lab (home),
Method Library, Simulation Scenarios, Results, Research Library, and — as
of EyeOnPit 1.7 — Counter Detection, Player Behavior Analysis, and
Validation Benchmarks (see `docs/EYEONPIT_1_7_COUNTER_DETECTION.md` §11).
Sections still shipped as honest, clearly-labeled placeholders (explaining
what's deferred and why, never faking a working flow): Add Method,
Admin/Method Validation.

## 12. Internationalization & terminology readiness (Priorities S3, S4)

Nothing in this architecture hard-codes an English-only assumption into
its *data model* — canonical IDs (`hi-lo`, `wong-halves`, `vegas-strip-6d-s17`)
are language-independent slugs, never translated strings used as keys.
User-facing strings in `/lab`'s screens are today plain English JSX text,
not yet centralized through a translation layer. **UPDATE (EyeOnPit 1.8):**
a real i18n foundation and property terminology preference now exist — see
`docs/EYEONPIT_1_8_GLOBAL_ARCHITECTURE.md` §2–3. `/lab`'s screens are not
yet wired through that catalog (still plain English JSX), which remains
listed as follow-on work there.

## 13. Deferred / not yet built

- ~~Counter Detection Confidence Engine implementation~~ — now implemented,
  see `docs/EYEONPIT_1_7_COUNTER_DETECTION.md`.
- Any UI for creating a new count method, game definition, or simulation
  scenario through `/lab` (the underlying create/validate functions are
  built and tested; the forms are not).
- Multi-seat, multi-split-level, and insurance support in the simulation
  engine.
- Single-deck/H17 basic-strategy index adjustments (today's chart is the
  standard multi-deck S17 reference only).
- A safe plugin architecture for methods that can't be expressed as a flat
  tag table (explicitly deferred per Priority B10).
- Real accounts/subscriptions/roles for `/lab` (today: one shared
  environment-variable passcode, matching the existing main-app pattern).
