import type { Metadata } from "next";
import Link from "next/link";
import { DocsPageHeader } from "@/components/site/DocsPageHeader";
import { FaqItem } from "@/components/site/FaqItem";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Frequently asked questions about EyeOnPit — what it is, how voice works, and what's available now versus planned.",
};

export default function FaqPage() {
  return (
    <>
      <DocsPageHeader title="FAQ" subtitle="Answered against the current application. Anything future is labeled as such." />

      <div className="flex flex-col gap-3">
        <FaqItem question="What is EyeOnPit?">
          <p>
            EyeOnPit is a casino game-protection investigation platform. It turns surveillance observations —
            spoken or tapped — into structured evidence, deterministic count analysis, and a professional
            investigation record.
          </p>
        </FaqItem>

        <FaqItem question="Is EyeOnPit a card-counting calculator?">
          <p>
            No. A count is one output of an investigation, not the product itself. EyeOnPit is built around the
            full investigation workflow — observation, evidence, analysis, and reporting — with the count as one
            part of that record.
          </p>
        </FaqItem>

        <FaqItem question="What makes EyeOnPit different?">
          <p>
            Natural voice narration instead of computer-style shorthand, one deterministic engine behind every input
            method, and an evidence-first approach that shows the record behind an investigation rather than just a
            label.
          </p>
        </FaqItem>

        <FaqItem question="Does EyeOnPit require specialized hardware?">
          <p>
            No. It runs on ordinary surveillance workstations, smartphones, tablets, and standard headsets — no
            proprietary table hardware required for the core product.
          </p>
        </FaqItem>

        <FaqItem question="Can I use a headset?">
          <p>
            Yes. EyeOnPit speaks count, status, and dealer-bust confirmations back through a connected headset, and
            listens continuously once voice is turned on — hands-free operation is a core design goal.
          </p>
        </FaqItem>

        <FaqItem question="Can I say &ldquo;seat&rdquo; or &ldquo;player&rdquo;?">
          <p>
            Yes — &ldquo;seat,&rdquo; &ldquo;player,&rdquo; and &ldquo;spot&rdquo; are interchangeable and all refer
            to the same target. See the <Link href="/docs/voice">Voice Guide</Link> for the full reference.
          </p>
        </FaqItem>

        <FaqItem question="Does EyeOnPit support natural speech?">
          <p>
            Yes — that&apos;s the intended interface. You can narrate multiple players and cards in one sentence,
            describe the same player across two clauses, and use everyday phrasing rather than a rigid command
            syntax.
          </p>
        </FaqItem>

        <FaqItem question="What happens if EyeOnPit is unsure what I said?">
          <p>
            It rejects the utterance rather than guessing. Nothing is recorded when EyeOnPit can&apos;t confidently
            resolve what was said — including speculative language like &ldquo;maybe&rdquo; or &ldquo;I
            think.&rdquo; Count integrity takes priority over accepting uncertain input.
          </p>
        </FaqItem>

        <FaqItem question="Does AI calculate the count?">
          <p>
            No. The count is calculated by a deterministic engine — the same recorded cards always produce the same
            result. Voice recognition is used to capture what you say; it does not calculate or estimate the count
            itself.
          </p>
        </FaqItem>

        <FaqItem question="What is the EyeOnPit Engine?">
          <p>
            The proprietary deterministic analysis engine behind every input method (voice, touch, and future
            vision/integration sources). All inputs feed the same structured event system, so calculations and
            history stay consistent regardless of how a card was entered.
          </p>
        </FaqItem>

        <FaqItem question="What counting systems are supported?">
          <p>Hi-Lo, KO, Zen, and Omega II — calculated in parallel, with true count available where applicable.</p>
        </FaqItem>

        <FaqItem question="Does EyeOnPit work offline?">
          <p>
            The core investigation workflow — card entry, counting, undo, notes, and history — works fully offline.
            Voice recognition depends on the platform&apos;s speech service and may be unavailable without a
            network connection; when that happens, EyeOnPit tells you clearly and manual entry remains fully
            functional.
          </p>
        </FaqItem>

        <FaqItem question="What is Quick mode?">
          <p>
            The fastest way to start — one tap opens a live investigation with your last-used table settings, no
            setup screen. See the <Link href="/docs/quick">Quick Mode guide</Link>.
          </p>
        </FaqItem>

        <FaqItem question="What is Advanced mode?">
          <p>
            Lets you configure table format, deck count, and rules before starting. See the{" "}
            <Link href="/docs/advanced">Advanced Mode guide</Link>.
          </p>
        </FaqItem>

        <FaqItem question="What is Practice mode?">
          <p>
            A dedicated training investigation that uses the exact same live workflow as a real case, kept
            completely separate from production data. See the <Link href="/docs/practice">Practice Mode guide</Link>.
          </p>
        </FaqItem>

        <FaqItem question="Can EyeOnPit detect dealer bust automatically?">
          <p>
            Yes. Bust is derived automatically from the dealer cards you&apos;ve already recorded — you never have
            to say &ldquo;dealer busted&rdquo; yourself. EyeOnPit announces &ldquo;Dealer bust&rdquo; the moment the
            recorded hand mathematically transitions into one.
          </p>
        </FaqItem>

        <FaqItem question="Can EyeOnPit use camera/video input?">
          <p>
            This is EyeOnPit Vision, and it is <strong>in development</strong> — not available in production today.
            The direction is authorized camera/video input feeding the same engine voice and touch already use.
          </p>
        </FaqItem>

        <FaqItem question="Is Vision available now?">
          <p>No. Vision is in development and not part of the current release.</p>
        </FaqItem>

        <FaqItem question="Can EyeOnPit integrate with existing surveillance systems?">
          <p>
            Integrations (DVR, smart-shoe, casino systems, and other authorized sources) are <strong>planned</strong>
            , not currently available.
          </p>
        </FaqItem>

        <FaqItem question="What happens to investigation history?">
          <p>
            Every round, card, and event is retained — nothing is deleted when an investigation is closed. Closed
            investigations remain available in History for review or export.
          </p>
        </FaqItem>

        <FaqItem question="How does Undo work?">
          <p>
            Undo reverses the most recent entry for whatever target is currently active (or the last action overall
            if that target has nothing of its own to undo). The Undo control always labels what it&apos;s about to
            reverse before you commit to it.
          </p>
        </FaqItem>

        <FaqItem question="How are updates handled?">
          <p>
            EyeOnPit checks for a new deployed version and prompts you to update — updates never swap the running
            app out from under you mid-hand; they apply the next time you choose to reload.
          </p>
        </FaqItem>
      </div>
    </>
  );
}
