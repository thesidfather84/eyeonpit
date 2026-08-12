import type { Metadata } from "next";
import Link from "next/link";
import { DocsPageHeader } from "@/components/site/DocsPageHeader";
import { VoicePhrase, VoicePhraseGroup } from "@/components/site/VoicePhrase";

export const metadata: Metadata = {
  title: "Voice Guide",
  description: "The full EyeOnPit operator voice reference — natural seat/player/spot phrasing, multi-target narration, count queries, and parser safety.",
};

export default function VoiceGuidePage() {
  return (
    <>
      <DocsPageHeader
        title="Voice Guide"
        subtitle="EyeOnPit is designed for natural surveillance speech. You don't need computer-style shorthand — say it the way you'd say it out loud at the table."
      />

      <h2>Naming a seat or player</h2>
      <p>All of these mean exactly the same target — use whichever feels natural in the moment:</p>
      <VoicePhraseGroup>
        <VoicePhrase>Seat one has a seven.</VoicePhrase>
        <VoicePhrase>Player one has a seven.</VoicePhrase>
        <VoicePhrase>Spot one has a seven.</VoicePhrase>
        <VoicePhrase>The player in seat one has a seven.</VoicePhrase>
        <VoicePhrase>Player at spot one has a seven.</VoicePhrase>
        <VoicePhrase>Dealer has a ten.</VoicePhrase>
      </VoicePhraseGroup>

      <h2>Naming a target once, then just the cards</h2>
      <p>Once a target is named, plain card words that follow keep applying to it until you name a different target or say a workflow word:</p>
      <VoicePhraseGroup>
        <VoicePhrase>Seat one.</VoicePhrase>
        <VoicePhrase>Seven.</VoicePhrase>
        <VoicePhrase>Five.</VoicePhrase>
      </VoicePhraseGroup>

      <h2>Multiple players in one utterance</h2>
      <p>Describe more than one hand in a single breath — each card lands on its own clause&apos;s target, in the order you said them:</p>
      <VoicePhraseGroup>
        <VoicePhrase result="S1: 7 · S3: 5">Player one has a seven, player three has a five.</VoicePhrase>
      </VoicePhraseGroup>

      <h2>The same player, more than one card</h2>
      <VoicePhraseGroup>
        <VoicePhrase result="S3: 5, K">Seat three has a five, seat three has a king.</VoicePhrase>
      </VoicePhraseGroup>

      <h2>Locking in an active target</h2>
      <p>Say a target alone to make it active, then keep naming bare cards — they&apos;ll apply to that target until you switch:</p>
      <VoicePhraseGroup>
        <VoicePhrase>Seat one.</VoicePhrase>
        <VoicePhrase>Active seat one.</VoicePhrase>
        <VoicePhrase>Seat one active.</VoicePhrase>
      </VoicePhraseGroup>

      <h2>Asking a question — read-only, always safe</h2>
      <p>A question never adds a card, never completes a hand, and never advances anything. It&apos;s always safe to ask:</p>
      <VoicePhraseGroup>
        <VoicePhrase>Status.</VoicePhrase>
        <VoicePhrase>What&apos;s the true count?</VoicePhrase>
        <VoicePhrase>What&apos;s the KO count?</VoicePhrase>
        <VoicePhrase>Status of Omega.</VoicePhrase>
        <VoicePhrase>How many decks remain?</VoicePhrase>
      </VoicePhraseGroup>

      <h2>Workflow commands</h2>
      <VoicePhraseGroup>
        <VoicePhrase result="Same as Done">Next hand.</VoicePhrase>
        <VoicePhrase result="Reverses the last entry">Undo.</VoicePhrase>
        <VoicePhrase result="Resume — begins/continues entry">Start count.</VoicePhrase>
        <VoicePhrase result="Pause — stops entry, keeps everything recorded">End count.</VoicePhrase>
      </VoicePhraseGroup>

      <h2>Table changes</h2>
      <p>Describe a player sitting down or leaving the same way you&apos;d say it out loud:</p>
      <VoicePhraseGroup>
        <VoicePhrase>Spot six sat down.</VoicePhrase>
        <VoicePhrase>Player at spot six.</VoicePhrase>
        <VoicePhrase>Spot one left.</VoicePhrase>
        <VoicePhrase>Player seat one left the table.</VoicePhrase>
      </VoicePhraseGroup>

      <h2>What EyeOnPit intentionally refuses to guess</h2>
      <p>
        EyeOnPit is built to protect count integrity over accepting questionable narration. Uncertain, speculative,
        or purely conversational speech is rejected outright — nothing gets recorded rather than risk recording the
        wrong thing:
      </p>
      <VoicePhraseGroup>
        <VoicePhrase result="Rejected">Maybe player one has a three.</VoicePhrase>
        <VoicePhrase result="Rejected">I think dealer has a five.</VoicePhrase>
        <VoicePhrase result="Rejected">Probably seat two has a king.</VoicePhrase>
      </VoicePhraseGroup>
      <p>
        When EyeOnPit can&apos;t confidently tell what you meant, it says so rather than guessing — nothing is ever
        silently recorded on a best-effort guess.
      </p>

      <h2>Dealer bust feedback</h2>
      <p>
        Once the cards you&apos;ve recorded for the dealer mathematically add up to a bust, EyeOnPit announces{" "}
        <strong>&ldquo;Dealer bust&rdquo;</strong> through your headset on its own — you never have to say
        &ldquo;dealer busted&rdquo; yourself. It announces once per bust, and if you undo the card that caused it,
        a later re-bust of the same hand announces again.
      </p>

      <h2>If voice isn&apos;t working</h2>
      <p>
        Nothing about EyeOnPit depends on voice working. The seat/dealer targets, the full card keypad, and
        Done/Next/Undo are always available to tap — a failed or noisy microphone never blocks recording the game.
        See <Link href="/docs/troubleshooting">Troubleshooting</Link> for microphone and headset issues.
      </p>
    </>
  );
}
