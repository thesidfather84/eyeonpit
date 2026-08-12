import type { Metadata } from "next";
import Link from "next/link";
import { DocsPageHeader } from "@/components/site/DocsPageHeader";
import { VoicePhrase, VoicePhraseGroup } from "@/components/site/VoicePhrase";

export const metadata: Metadata = {
  title: "Getting Started",
  description: "How to open EyeOnPit, start an investigation, and record your first hand — manual entry and voice.",
};

export default function GettingStartedPage() {
  return (
    <>
      <DocsPageHeader
        title="Getting Started"
        subtitle="The whole job, start to finish — this is everything you need for your first investigation."
      />

      <h2>1. Opening EyeOnPit</h2>
      <p>
        Launch EyeOnPit from <Link href="/app">eyeonpit.com/app</Link> (or your installed home-screen icon). If an
        investigation is already active or paused on the device, EyeOnPit opens straight into it — there is no
        separate &ldquo;resume&rdquo; step to find.
      </p>

      <h2>2. Choosing Quick, Advanced, or Practice</h2>
      <p>If nothing is active, you land on the launch screen with four options:</p>
      <ul>
        <li>
          <strong>Quick</strong> — starts immediately with your last-used table settings. See the{" "}
          <Link href="/docs/quick">Quick Mode guide</Link>.
        </li>
        <li>
          <strong>Floor</strong> — starts the same way as Quick, but opens the compact, hands-free Floor screen
          instead of the full console.
        </li>
        <li>
          <strong>Advanced</strong> — lets you set the table, deck count, and rules before starting. See the{" "}
          <Link href="/docs/advanced">Advanced Mode guide</Link>.
        </li>
        <li>
          <strong>Practice</strong> — a training investigation kept completely separate from real cases. See the{" "}
          <Link href="/docs/practice">Practice Mode guide</Link>.
        </li>
      </ul>

      <h2>3. Starting an investigation</h2>
      <p>
        Quick and Floor start instantly with no setup screen. Advanced lets you confirm table/game details first.
        Either way, you land in the live console with the dealer selected as the active target and the count at
        zero.
      </p>

      <h2>4. Entering cards manually</h2>
      <p>
        Tap a seat or the dealer to make it the active target, then tap a rank on the card keypad. Every tap enters
        exactly one card — the same underlying record voice narration produces, so manual and voice entry can be
        mixed freely within the same investigation.
      </p>

      <h2>5. Using voice</h2>
      <p>
        Tap the microphone once to start continuous listening — you don&apos;t tap it again between commands. Then
        just describe what you see:
      </p>
      <VoicePhraseGroup>
        <VoicePhrase result="Seat 1: 7">Player one has a seven.</VoicePhrase>
        <VoicePhrase result="Dealer: K, 5">Dealer king five.</VoicePhrase>
      </VoicePhraseGroup>
      <p>
        The full reference for what you can say lives in the <Link href="/docs/voice">Voice Guide</Link>.
      </p>

      <h2>6. Dealer tracking</h2>
      <p>
        Say &ldquo;Dealer&rdquo; (or tap the dealer) to make it the active target, then name cards as they&apos;re
        dealt. When the recorded dealer hand mathematically busts, EyeOnPit announces{" "}
        <strong>&ldquo;Dealer bust&rdquo;</strong> automatically through your headset — you never have to say it
        yourself.
      </p>

      <h2>7. Seat / player tracking</h2>
      <p>
        Say a seat naturally — &ldquo;Seat one,&rdquo; &ldquo;Player one,&rdquo; &ldquo;Spot one,&rdquo; or
        &ldquo;The player in seat one&rdquo; are all the same target. Naming an empty seat occupies it automatically;
        there&apos;s no separate &ldquo;enable this seat&rdquo; step.
      </p>

      <h2>8. Status and count queries</h2>
      <p>
        Ask any time — asking never changes anything. &ldquo;Status,&rdquo; &ldquo;What&apos;s the count?&rdquo;,
        &ldquo;What&apos;s the true count?&rdquo;, and &ldquo;How many decks remain?&rdquo; all work. See the full
        list in the <Link href="/docs/voice">Voice Guide</Link>.
      </p>

      <h2>9. Done / Next Hand</h2>
      <p>
        Say or tap <strong>&ldquo;Done&rdquo;</strong> once a hand is finished. In Floor Mode, Done saves the hand,
        speaks the count back, and is already listening for the next hand&apos;s cards — nothing else to say or tap.
        &ldquo;Next hand&rdquo; is a natural alternate phrasing for the same action.
      </p>

      <h2>10. Undo</h2>
      <p>
        Say or tap <strong>&ldquo;Undo&rdquo;</strong> to reverse the most recent entry for whatever target
        you&apos;re currently on. The Undo control&apos;s own label always tells you what it&apos;s about to reverse
        before you commit to it.
      </p>

      <h2>11. Table changes</h2>
      <p>Describe players sitting down or leaving the same way you&apos;d describe it out loud:</p>
      <VoicePhraseGroup>
        <VoicePhrase result="Occupies seat 6">Spot six sat down.</VoicePhrase>
        <VoicePhrase result="Vacates seat 1">Spot one left.</VoicePhrase>
      </VoicePhraseGroup>

      <h2>12. Ending or reviewing an investigation</h2>
      <p>
        Say <strong>&ldquo;End Investigation&rdquo;</strong> and confirm with <strong>&ldquo;Confirm End
        Investigation&rdquo;</strong> (or use End &amp; Review in the menu). Nothing recorded is ever deleted — you
        land directly on that investigation&apos;s review, with the full evidence record and export available from
        there.
      </p>
    </>
  );
}
