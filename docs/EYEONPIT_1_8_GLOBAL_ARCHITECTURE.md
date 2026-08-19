# EyeOnPit 1.8 — Global / Multi-Property / Multi-Game Architecture

**Status: foundation built, pending review.** This document describes the
internationalization foundation, property terminology/profile
configuration, locale-aware formatting, the (documentation-only) global
voice architecture plan, the generic Game Definition and Count Method
frameworks, game/method compatibility validation, and the multi-property
membership/entitlement foundation built for EyeOnPit 1.8. None of this
changes what EyeOnPit does today — it is architecture for future work,
built additively so nothing existing has to be rewritten later.

---

## 1. Design principles

- **Additive, never breaking.** Every 1.8 change either adds a new,
  independent module or adds OPTIONAL fields to an existing type. No
  existing required field, function signature, or persisted shape changed.
- **Do not translate the whole app yet.** The i18n foundation is real,
  tested infrastructure with a deliberately small seed catalog — not a
  claim of completed translation.
- **Internal IDs stay canonical and language-independent.** Nothing in
  this architecture ever uses a translated string as a lookup key.
- **Do not weaken `/lab`'s server-side gate.** The membership/entitlement
  foundation (§6) is types and pure functions only — `lib/labAuth/
  session.ts` and `src/proxy.ts` are completely untouched.
- **Do not implement billing or fake paid functionality.** The
  entitlement model documents a future feature boundary; it enforces
  nothing today.

## 2. Internationalization foundation (Priority 1)

`src/lib/i18n/`:

- `locale.ts` — `Locale` type covering the eight target languages (English,
  Spanish, French, German, Portuguese, Korean, Simplified Chinese,
  Traditional Chinese), `DEFAULT_LOCALE = "en"`, display names, and a
  BCP-47 tag mapper for `Intl.*` APIs.
- `catalog.ts` — a real, working string-catalog architecture keyed by
  language-independent `TranslationKey`s (e.g.
  `"lab.counterDetection.title"`), never a translated string used as a
  key. Only `en` is complete; `es`/`fr` seed a handful of real keys purely
  to prove `translate()`'s fallback-to-English mechanism genuinely works
  end to end — every other locale/key combination falls back to English,
  tested explicitly.
- `format.ts` — `formatDate`/`formatDateTime`/`formatNumber`/
  `formatCurrency`/`formatSignedNumber`, all thin wrappers over the
  browser/Node's own `Intl` APIs, never a hand-rolled formatter.

**Where this is (and isn't) used today:** the catalog's seeded English
values are the real strings introduced by 1.7's `/lab` pages — but those
pages currently render plain English JSX text directly, not yet routed
through `translate()`. Wiring live UI text through this catalog is
follow-on work — see §3.1's safe integration order.

**Non-breaking, confirmed:** this foundation adds new modules and
optional fields only. Current English behavior is unchanged for this
commit — confirmed by `git diff` showing zero modifications to any
existing rendered UI component's text output.

## 3. Property terminology (Priority 2)

`src/lib/reporting/propertyMetadata.ts` gained `PropertyTerminologyPreference`
(`playerPositionLabel: "Spot" | "Seat" | { custom: string }`) and a pure
`resolveTerminology(property)` resolver, defaulting to `"Seat"` (matching
Surveillance's own existing default) when a property has no preference.
This directly extends the "EyeOnPit adapts to the operator" principle
(`docs/EYEONPIT_PRODUCT_SPEC.md` §1) to the property level.

**Scope limitation (documented, not hidden):** this is the data model and
resolver only. It is **not** wired into `ActiveSeatHeader.tsx`/
`FloorPlayField.tsx`/`CardEntryPad.tsx`'s existing `terminology` prop in
this patch — those are live Floor/Surveillance UI components, and this
session was explicitly instructed not to start unrelated visual work.
Wiring the resolver into that prop is a small, low-risk, clearly-scoped
follow-up — see §3.1.

### 3.1 Safe integration order (next stage, not started)

Neither `translate()` (§2) nor `resolveTerminology()` (§3) is wired into
any live rendered UI today — confirmed non-breaking, current English
behavior is unchanged for this commit. When integration work is actually
prioritized, it must proceed in this order, each stage shipped and
verified before the next begins:

1. **Floor Mode visible labels** — the highest-value, most contained
   surface (`ActiveSeatHeader.tsx`/`FloorPlayField.tsx`/`CardEntryPad.tsx`'s
   existing `terminology` prop already has exactly the seam
   `resolveTerminology()` needs to feed). Smallest blast radius: it's a
   presentation-only prop that already defaults safely.
2. **`/lab` UI** — internal, passcode-gated, no operator-facing risk;
   the natural second step since the 1.7 pages already introduced the
   catalog's only real seeded keys.
3. **Reporting** (`ReportPreview.tsx`, `exportRtf.ts`) — higher stakes
   than `/lab` (reports leave the app as PDF/RTF documents) but still
   operator-reviewed before export, not live/real-time.
4. **Documentation / site UI** — public-facing, so last among the
   "regular app" surfaces; requires its own review pass for translation
   accuracy before publishing, unlike internal tooling.
5. **Voice localization** — explicitly its OWN separate future project
   (§6), never bundled into this integration order. Voice safety
   architecture (deterministic parsing, no-LLM, never-guess-on-ambiguity)
   must be re-verified per language pack independently — it does not
   inherit safety from the text-only integration stages above.

Each stage is a distinct, separately-reviewable change — this order is
itself the risk-management plan, not just a checklist.

## 4. Property Profile (Priority 3)

`PropertyMetadata` gained a `PropertyProfileFields` set of **entirely
optional** fields: `timezone`, `defaultLanguage` (a `Locale`), `terminology`,
`defaultGameRulesRef` (a `VersionRef` to a `GameDefinition` — never an
embedded copy of the rules), `tableNamingConvention`, `currency`,
`reportingDefaults` (default investigator name/shift), and a reserved
`logoRef` (no upload/storage mechanism exists yet — the field exists so a
future feature doesn't need a schema migration to add it). No Dexie schema
version bump was needed — every field is optional and none requires a new
index.

## 5. Locale-aware data presentation (Priority 4)

Covered by `lib/i18n/format.ts` (§2). Every formatter takes an
already-canonical value (an ISO timestamp, a plain number) and returns a
**display-only** string — nothing in this architecture ever localizes or
mutates a stored `Investigation`/`Report`/`CardEvent` field. Canonical
values stay canonical regardless of viewer locale.

## 6. Global voice architecture — documentation only (Priority 5)

**Zero voice code was touched or added in this patch** — confirmed by
`git diff` showing no changes under `src/lib/voice/`, `src/hooks/
useVoiceRecognition.ts`, or any voice-adjacent component. This section is
architecture planning only, per explicit instruction.

**Why this isn't a mechanical translation problem.** The existing English
parser (`lib/voice/parseVoiceCommand.ts`, `lib/voice/classifyVoiceTranscript.ts`)
is built around English-specific ASR artifacts ("C1"→Seat 1, "set"/"seet"/
"cheap"→"seat," "start"→"spot") discovered through real field testing —
these are recognizer-specific mishearings of English words, not
translatable strings. A Spanish, French, German, Portuguese, Korean,
Simplified Chinese, or Traditional Chinese voice pack needs its **own**,
independently field-tested:

- casino vocabulary (the target language's own words for seat/spot/
  player/dealer/hit/stand/double/split/surrender/insurance)
- seat/spot/player terminology and its own natural synonyms
- card-rank vocabulary and how the target language names/orders ranks
- command aliases and natural phrasing patterns (word order differs
  meaningfully by language — a mechanical word-for-word translation of the
  English grammar would misparse in most target languages)
- its own recognizer-specific ASR confusion patterns — discovered only
  through real field testing in that language, the same way "Taylor"/
  "Spotify"→dealer was discovered for English, not guessed at in advance
- its own regression corpus of confirmed field failures, mirroring
  `src/proxy.test.ts`'s/the voice test suite's own pattern for English

**Proposed structure for a future implementation** (not built): a
`VoiceLanguagePack` interface — canonical seat/rank/command vocabulary,
ASR normalization rules, and a regression corpus — with English's own
existing `parseVoiceCommand.ts` rules refactored to be the FIRST such
pack rather than hardcoded, once a second real pack is actually being
built (not speculatively refactored ahead of that need). The deterministic
parsing / no-LLM / never-guess-on-ambiguity safety rules
(`docs/EYEONPIT_PRODUCT_SPEC.md` §12) apply identically to every future
language pack — safety architecture doesn't change per language, only
vocabulary does.

**No production multilingual voice implementation exists in this patch,**
exactly as instructed.

## 7. Generic Game Definition / Method framework / compatibility (Priorities 6–8)

`src/lib/gold-standard/game/`:

- `gameFamily.ts` — `GameFamily` union (blackjack, Spanish 21, Free Bet
  Blackjack, other blackjack variants, baccarat, baccarat side bets,
  proprietary shoe games) and `GAME_FAMILY_STATUS`, marking only
  `"blackjack"` `IMPLEMENTED` — every other family is honestly `PLANNED`.
- `genericGameDefinition.ts` — `AnyGameDefinition`, a discriminated union
  with exactly ONE real member today (`{ gameFamily: "blackjack",
  definition: GameDefinition }`), wrapping the EXISTING, completely
  unchanged blackjack `GameDefinition` (`lib/gold-standard/gameDefinition.ts`)
  rather than rewriting it. A second real game means adding a second union
  member and that game's own definition type — never touching blackjack's.
- `gameMethodCompatibility.ts` — `validateMethodGameCompatibility(method,
  gameFamily)`. Conservative by design: a method with no declared
  `supportedGameFamilies` is treated as **incompatible with everything**,
  never presumed blackjack-safe by default — "prevent incompatible methods
  from silently running against the wrong game" enforced structurally.

`CountMethodDefinition` (`lib/gold-standard/countMethodRegistry.ts`) gained
two **optional** fields: `supportedGameFamilies?: GameFamily[]` and
`methodKind?: MethodKind` (running-count / side-count / exact-composition /
side-bet-count / effect-of-removal / custom-research) — purely additive;
every existing built-in adapter and custom method continues to type-check
and validate unchanged. The four built-in adapters
(`countMethodAdapters.ts`) now explicitly declare `supportedGameFamilies:
["blackjack"]` and `methodKind: "running-count"`, verified against the
existing byte-identical regression suite (still 18/18 passing, unchanged
assertions).

**Deliberately NOT done:** `validateMethodGameCompatibility` is a
standalone, tested function — it is **not** force-integrated into
`createSimulationScenario`/`validateSimulationScenario`
(`lib/gold-standard/simulation/scenario.ts`), to avoid changing that
already-approved 1.6 code's behavior without being asked. Wiring
compatibility checks into scenario creation is listed as follow-on work
(§10, and in `docs/EYEONPIT_ROADMAP.md`'s Sequence).

**Production-readiness gate, stated explicitly:** `validateMethodGameCompatibility`
existing as a standalone function is a necessary but NOT sufficient
condition for multi-game support. **Before any second `GameFamily` is
considered production-ready, `validateMethodGameCompatibility` MUST be
wired into `createSimulationScenario`/`validateSimulationScenario` so an
incompatible method/game pairing is rejected at creation time, not just
detectable by a function nobody is required to call.** Today, with only
`"blackjack"` implemented and every built-in adapter declaring
`supportedGameFamilies: ["blackjack"]`, the absence of that wiring carries
no real risk — there is no second game for a method to be silently
mismatched against yet. That safety margin disappears the moment a second
`GameFamily` gains a real implementation, so this wiring must land
*before or alongside* that second game, never after.

## 8. Multi-property membership readiness (Priority 9)

`src/lib/membership/`:

- `roles.ts` — `Role` (Observer / Supervisor / Investigator /
  Administrator / ResearchAnalyst), `Permission`, and a real, documented
  `ROLE_PERMISSIONS` matrix + `roleHasPermission`.
- `organization.ts` — `Organization`, `OrganizationProperty`,
  `UserAccount`, `PropertyMembership` — **types only**, nothing persisted,
  nothing queried by any repository.

**"Do NOT weaken current server-side `/lab` gate":** `lib/labAuth/
session.ts` and `src/proxy.ts` are completely untouched by this priority —
confirmed via `git diff`. `/lab` remains reachable by anyone holding the
shared `EYEONPIT_LAB_PASSCODE`, exactly as before.

## 9. Advanced feature entitlements (Priority 10)

`src/lib/membership/entitlements.ts` — `FeatureTier` (`PUBLIC` / `PRO` /
`ENTERPRISE`), a `FEATURE_TIER_MAP` covering every example named in the
product instruction (PRO: advanced reporting, Simulation Lab, Method
Library, Counter Detection, Player Analytics, advanced exports, research
tools; ENTERPRISE: multi-property, roles, audit controls, identity tools,
centralized property management), and `isFeatureEntitled(tier, feature)`
(a higher tier includes every lower tier's features).

**"Do not implement billing. Do not create fake paid functionality":**
this model enforces nothing today — no feature anywhere in the app checks
`isFeatureEntitled` before rendering. It is the documented target shape a
future subscription system would enforce, not an enforcement mechanism.

## 10. Deferred / not yet built

- Wiring `lib/i18n/translate()` into any actual rendered UI text (the
  catalog exists; components still render plain English JSX).
- Wiring `resolveTerminology()` into `ActiveSeatHeader`/`FloorPlayField`/
  `CardEntryPad`'s existing `terminology` prop.
- Wiring `validateMethodGameCompatibility` into simulation scenario
  creation.
- A second real `GameFamily` member (Spanish 21, Baccarat, etc.) — only
  the umbrella interface exists; no second game's rules are implemented.
- Any real voice language pack (architecture documented in §6 only, by
  explicit instruction).
- Any persistence, UI, or enforcement for `Organization`/`UserAccount`/
  `PropertyMembership`/`FeatureTier` — types only, nowhere consumed yet.
- Property logo/branding upload (only a reserved `logoRef` string field
  exists).
