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

## Next Up

- **Real iPhone field testing** of the voice diagnostics/N-best work above,
  using Export JSON to capture and review field sessions.
- **1.5 reporting work** — paused for the duration of the voice reliability
  effort above; resumes once field testing confirms the diagnostic system
  and N-best resolver hold up under real conditions.

## Longer-Term / Not Yet Scheduled

See `docs/EYEONPIT_PRODUCT_SPEC.md`'s Implementation Status Matrix for the
full list of **PLANNED**/**FUTURE** capabilities (voice wager mutation,
hit/stand/double/split/surrender/insurance voice commands, fully natural
conversational capture, etc.) — that matrix is the authoritative source for
long-range voice scope; this roadmap only tracks active/near-term work.
