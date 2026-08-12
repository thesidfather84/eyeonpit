import type { Metadata } from "next";
import Link from "next/link";
import { DocsPageHeader } from "@/components/site/DocsPageHeader";

export const metadata: Metadata = {
  title: "Quick Mode",
  description: "Quick Mode — the fastest way to start an EyeOnPit investigation.",
};

export default function QuickModePage() {
  return (
    <>
      <DocsPageHeader
        title="Quick Mode"
        subtitle="Minimal setup, start watching. Quick is the default path for most shifts."
      />

      <h2>The idea</h2>
      <p>
        Quick exists for the moment you notice something and need to start recording <em>now</em>, not after a setup
        screen. Tapping Quick goes straight from the launch screen into a live console with zero questions asked.
      </p>

      <h2>What happens when you tap Quick</h2>
      <ol>
        <li>EyeOnPit creates a new investigation using your last-used table and game settings (or sensible defaults if this is your first investigation on the device).</li>
        <li>The live console opens immediately — the dealer is the active target, and the count starts at zero.</li>
        <li>You can begin narrating or tapping cards right away.</li>
      </ol>

      <h2>Floor — the hands-free variant of Quick</h2>
      <p>
        <strong>Floor</strong> creates an investigation the exact same way Quick does, but opens the compact,
        voice-first Floor screen instead of the full console. Floor and the full console are two views of the{" "}
        <em>same</em> investigation — switching between them never creates a second copy of anything or loses data.
      </p>

      <h2>Changing settings after starting</h2>
      <p>
        Quick doesn&apos;t lock you in. Table and game settings can still be adjusted from within the live console
        if something needs correcting once you&apos;re already recording.
      </p>

      <h2>When to use Advanced instead</h2>
      <p>
        If you need to set the table, deck count, or rule profile <em>before</em> the first card is recorded, use{" "}
        <Link href="/docs/advanced">Advanced Mode</Link> instead.
      </p>
    </>
  );
}
