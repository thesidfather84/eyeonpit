import type { Metadata } from "next";
import { DocsPageHeader } from "@/components/site/DocsPageHeader";
import { StatusBadge } from "@/components/site/StatusBadge";

export const metadata: Metadata = {
  title: "Practice Mode",
  description: "Practice Mode — train on EyeOnPit's real live workflow, kept separate from production investigations.",
};

export default function PracticeModePage() {
  return (
    <>
      <DocsPageHeader
        title="Practice Mode"
        subtitle="Train on the exact same workflow you'll use for real, without touching real case data."
      />

      <div className="mb-6 flex items-center gap-2">
        <StatusBadge status="available" />
        <h2 className="!mt-0">Available Now</h2>
      </div>
      <ul>
        <li>Tapping Practice opens (or creates) one fixed training investigation.</li>
        <li>It runs the exact same live console, card entry, and voice workflow as a real investigation — nothing about Practice is a simplified simulation.</li>
        <li>It is kept structurally separate from production data: it never appears mixed into your real investigation history.</li>
        <li>It can be returned to and continued across sessions for ongoing training and review.</li>
      </ul>

      <h2>Why practice on the real workflow</h2>
      <p>
        The fastest way to get comfortable with voice narration and the counting workflow is to use the same
        console you&apos;ll use on a live table — not a simplified tutorial that teaches habits you&apos;ll have to
        unlearn. Practice Mode exists so that comfort-building never risks a real case.
      </p>

      <div className="mb-6 mt-12 flex items-center gap-2">
        <StatusBadge status="planned" />
        <h2 className="!mt-0">Future Training Direction</h2>
      </div>
      <p>Dedicated training modules are on the roadmap, built on top of the same Practice foundation:</p>
      <ul>
        <li>Counting practice drills.</li>
        <li>Player tracking practice.</li>
        <li>Betting-spread recognition.</li>
        <li>Strategy-deviation recognition.</li>
        <li>Suspicious-play investigation practice.</li>
      </ul>
      <p>None of the items above are available yet — Practice Mode today is the live workflow itself, kept separate from real cases.</p>
    </>
  );
}
