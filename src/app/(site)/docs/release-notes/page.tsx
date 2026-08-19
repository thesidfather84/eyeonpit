import type { Metadata } from "next";
import { DocsPageHeader } from "@/components/site/DocsPageHeader";
import { ReleaseEntry } from "@/components/site/ReleaseEntry";

export const metadata: Metadata = {
  title: "Release Notes",
  description: "EyeOnPit release notes, version by version.",
};

export default function ReleaseNotesPage() {
  return (
    <>
      <DocsPageHeader title="Release Notes" subtitle="What changed, version by version." />

      <div className="mt-2">
        <ReleaseEntry version="1.4.4" date="2026-08-18" title="Floor Mode Operator Usability Cleanup">
          <p>
            A presentation-only cleanup: Floor Mode&apos;s screen now consistently uses the same plain casino
            language an operator would use out loud, with no internal shorthand anywhere in view.
          </p>
          <ul>
            <li>
              <strong>&ldquo;Spot 1&rdquo; through &ldquo;Spot 7,&rdquo; never &ldquo;S1&rdquo;–&ldquo;S7.&rdquo;</strong>{" "}
              The compact play-field summary previously abbreviated each player position down to a bare
              &ldquo;S3&rdquo; — the only place in the app that ever showed that shorthand. It now reads &ldquo;Spot
              3,&rdquo; matching every other label on screen.
            </li>
            <li>
              <strong>One consistent word per screen.</strong> Floor Mode now says &ldquo;Spot&rdquo; everywhere —
              the active-target banner, the compact play field, and the card-entry status message. Surveillance
              keeps its own &ldquo;Seat&rdquo; wording, unchanged. Voice recognition still understands &ldquo;seat,&rdquo;
              &ldquo;spot,&rdquo; and &ldquo;player&rdquo; interchangeably either way — this only changes what&apos;s
              displayed, never what&apos;s recognized.
            </li>
            <li>
              <strong>Card entry, then round controls.</strong> The keypad now appears before Done/Next/Undo,
              matching the natural glance-to-tap order: see the active target, enter the card, then advance.
            </li>
          </ul>
          <p className="!mt-4 text-xs">
            ~10 new/updated automated tests. Full suite: 883 passed, 1 pre-existing skip. Counting engine, voice
            recognition, and investigation persistence were not touched in this release.
          </p>
        </ReleaseEntry>

        <ReleaseEntry version="1.4.3" date="2026-08-18" title="PC Field Test Fixes — Compact Forms &amp; Dealer Recovery">
          <p>
            A follow-up to 1.4.2, fixing issues surfaced by the very first round of PC field testing.
          </p>
          <ul>
            <li>
              <strong>Fixed a resolver bug.</strong> A correctly-heard &ldquo;seat one has a five&rdquo; was sometimes
              rejected as ambiguous, because two different valid readings of the same card were being compared as if
              they described different actions. They&apos;re now recognized as identical whenever they really are.
            </li>
            <li>
              <strong>More recognized phrasing.</strong> &ldquo;set one has a 3&rdquo;, &ldquo;seet&rdquo;/&ldquo;ceit&rdquo;/&ldquo;see&rdquo;/&ldquo;cheap&rdquo;
              before a seat number, and &ldquo;eighth&rdquo; for eight are now all recognized, alongside the existing
              &ldquo;C1&rdquo;-style shorthand extended to &ldquo;S1&rdquo; and &ldquo;T1&rdquo;.
            </li>
            <li>
              <strong>Compact forms.</strong> &ldquo;S1 9&rdquo; and &ldquo;Seat 1:9&rdquo; are now recognized the
              same as &ldquo;Seat 1 has a 9&rdquo;.
            </li>
            <li>
              <strong>Dealer recovery, as a last resort.</strong> When every reading offered fails to make sense on
              its own, EyeOnPit now recognizes a short, specific list of known dealer misreadings (e.g.
              &ldquo;Taylor&rdquo;) — but only in an unambiguous shape, and always logged as a rescue in the Debug
              panel, never a silent correction. Unrelated speech (&ldquo;Spotify is dead&rdquo;) is unaffected and
              stays rejected.
            </li>
            <li>The Debug panel now shows exactly which normalization or recovery rule fired, and why, for each alternative considered.</li>
          </ul>
          <p className="!mt-4 text-xs">
            ~55 new automated tests added. Full suite: 880 passed, 1 pre-existing skip. Counting engine and
            recognition lifecycle untouched.
          </p>
        </ReleaseEntry>

        <ReleaseEntry version="1.4.2" date="2026-08-18" title="Voice Diagnostics &amp; Multi-Alternative Recognition">
          <p>
            A reliability-focused release: EyeOnPit now checks every alternative your device&apos;s speech recognizer
            offers, not just its first guess, and gives you a much deeper look at exactly what happened when a
            command is accepted or rejected.
          </p>
          <ul>
            <li>
              <strong>Multiple interpretations, checked safely.</strong> Speech recognizers often return several
              possible readings of what you said, ranked by confidence — but the top-ranked one is not always
              correct. EyeOnPit now evaluates every alternative it&apos;s given and accepts whichever one is a clean,
              unambiguous command, rather than only ever looking at the first. If two alternatives would produce
              genuinely different commands, EyeOnPit still refuses to guess between them, exactly as before.
            </li>
            <li>
              <strong>Richer Debug panel.</strong> The existing &ldquo;Debug&rdquo; toggle on the live screen now
              shows a detailed breakdown of the most recent thing you said — every alternative considered, which one
              was used and why, the active target before and after, and how long each step took.
            </li>
            <li>
              <strong>Export JSON.</strong> A new button next to &ldquo;Copy Voice Log&rdquo; in the Debug panel
              exports the full diagnostic session as structured JSON — useful for sharing a detailed report of a
              recognition issue for review.
            </li>
            <li>
              <strong>&ldquo;start 3 as a 7&rdquo; and similar.</strong> A recognition artifact where &ldquo;spot&rdquo;
              is misheard as &ldquo;start&rdquo; immediately before a seat number is now recognized correctly.
            </li>
            <li>Every recognition event is now tagged with a unique ID, and a session that ends without ever producing a usable result is now explicitly logged rather than failing silently.</li>
          </ul>
          <p className="!mt-4 text-xs">
            45 new automated tests added. Full suite: 826 passed, 1 pre-existing skip. Counting engine, count rules,
            and the recognition restart/lifecycle logic were not touched in this release.
          </p>
        </ReleaseEntry>

        <ReleaseEntry version="1.4" date="2026-08-12" title="Public Website &amp; Documentation">
          <ul>
            <li>Added the public EyeOnPit marketing website at the site root.</li>
            <li>Added a full documentation section, including this release-notes page, a FAQ, troubleshooting, and the operator Voice Guide.</li>
            <li>Moved the operational application to <code>/app</code>, cleanly separated from the public site — no change to how the application itself works.</li>
            <li>The counting engine, voice parser, and CardEvent ledger were not touched in this release.</li>
          </ul>
        </ReleaseEntry>

        <ReleaseEntry version="1.3" date="2026-08-11" title="Natural Voice &amp; Dealer Bust Feedback">
          <p>A major voice/parser update focused on natural surveillance speech and count-integrity safety.</p>
          <ul>
            <li>Natural seat/player/spot phrasing — &ldquo;seat one,&rdquo; &ldquo;player one,&rdquo; &ldquo;spot one,&rdquo; &ldquo;the player in seat one,&rdquo; and &ldquo;player at spot one&rdquo; all resolve to the same target.</li>
            <li>Multi-target narration — multiple players (and the dealer) can be described in a single utterance, each card landing on the correct target in spoken order.</li>
            <li>Repeated same-target narration — describing the same player across two clauses now correctly merges into one hand instead of being rejected.</li>
            <li>Natural count queries — &ldquo;What&apos;s the true count?&rdquo;, &ldquo;What&apos;s the KO count?&rdquo;, &ldquo;Status of Omega,&rdquo; and &ldquo;How many decks remain?&rdquo; are all recognized.</li>
            <li>&ldquo;Next hand&rdquo; added as a natural alias for Done.</li>
            <li>Active-seat phrases — &ldquo;Active seat one&rdquo; and &ldquo;Seat one active&rdquo; both work.</li>
            <li>Table-change narration improvements, including &ldquo;Player seat one left the table.&rdquo;</li>
            <li>Uncertainty-language rejection — speculative phrasing (&ldquo;maybe,&rdquo; &ldquo;probably,&rdquo; &ldquo;I think&rdquo;) is now rejected outright rather than risking a wrong entry.</li>
            <li>Safe, narrow ASR normalization for a couple of observed speech-recognition artifacts.</li>
            <li>Automatic &ldquo;Dealer bust&rdquo; headset announcement, derived from recorded dealer cards.</li>
          </ul>
          <p className="!mt-4 text-xs">
            99 new automated tests added. Full suite: 679 passed, 1 pre-existing skip. Counting engine untouched.
          </p>
        </ReleaseEntry>
      </div>
    </>
  );
}
