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
