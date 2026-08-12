import type { Metadata } from "next";
import { DocsPageHeader } from "@/components/site/DocsPageHeader";
import { StatusBadge } from "@/components/site/StatusBadge";

export const metadata: Metadata = {
  title: "Advanced Mode",
  description: "Advanced Mode — custom table and game setup, plus the current EyeOnPit analysis roadmap.",
};

export default function AdvancedModePage() {
  return (
    <>
      <DocsPageHeader
        title="Advanced Mode"
        subtitle="Custom table and game setup before you start recording — and where the deeper analysis roadmap is headed."
      />

      <div className="mb-6 flex items-center gap-2">
        <StatusBadge status="available" />
        <h2 className="!mt-0">Available Now</h2>
      </div>
      <p>Advanced lets you confirm every table/game detail before the first card is recorded:</p>
      <ul>
        <li><strong>Blackjack Format</strong> — Single Deck, Double Deck, or Shoe Game.</li>
        <li><strong>Deck Count</strong> — including a custom count for non-standard shoes.</li>
        <li><strong>Rule Profile</strong> — standard presets (e.g. 3:2 H17, 3:2 S17, 6:5 H17) or fully custom rules.</li>
        <li><strong>Entry Direction</strong> — the order seats are dealt in.</li>
        <li><strong>Table ID and pit/area</strong> — for identifying the investigation later.</li>
        <li>Optional custom rule notes.</li>
      </ul>
      <p>
        Everything Advanced configures can still be reached and adjusted from inside a live investigation
        afterward — Advanced is a convenience for setting it up front, not a one-time lock.
      </p>

      <div className="mb-6 mt-12 flex items-center gap-2">
        <StatusBadge status="in-development" />
        <h2 className="!mt-0">In Development</h2>
      </div>
      <p>Capabilities actively being built on top of the current Advanced workflow, not yet available:</p>
      <ul>
        <li>Wager tracking and betting-spread capture.</li>
        <li>Stronger, more detailed report generation.</li>
      </ul>

      <div className="mb-6 mt-12 flex items-center gap-2">
        <StatusBadge status="planned" />
        <h2 className="!mt-0">Planned</h2>
      </div>
      <p>Longer-term roadmap items — not started, not guaranteed for any specific release:</p>
      <ul>
        <li>Bet / count correlation analysis.</li>
        <li>Strategy-deviation analysis.</li>
        <li>Player advantage estimates.</li>
        <li>Session merging and historical player/session intelligence.</li>
        <li>Detailed graphs.</li>
        <li>Enterprise integration (see the homepage Enterprise section).</li>
      </ul>
    </>
  );
}
