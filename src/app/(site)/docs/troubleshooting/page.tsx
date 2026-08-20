import type { Metadata } from "next";
import Link from "next/link";
import { DocsPageHeader } from "@/components/site/DocsPageHeader";

export const metadata: Metadata = {
  title: "Troubleshooting",
  description: "Practical troubleshooting for EyeOnPit — microphone permissions, headset audio, voice recognition, offline behavior, and updates.",
};

export default function TroubleshootingPage() {
  return (
    <>
      <DocsPageHeader title="Troubleshooting" subtitle="Practical fixes for the issues that actually come up in the field." />

      <h2>Microphone permission</h2>
      <p>
        If the browser blocked microphone access, EyeOnPit shows &ldquo;Microphone permission was denied&rdquo; and
        switches to manual-only entry — nothing is lost. Check your browser&apos;s site permissions for EyeOnPit and
        allow microphone access, then tap the microphone button again to retry.
      </p>

      <h2>Headset not detected</h2>
      <p>
        EyeOnPit doesn&apos;t maintain its own list of connected audio devices — it uses whatever input/output your
        operating system currently has routed (Bluetooth headset, wired headset, or device microphone/speaker). If a
        headset isn&apos;t being used, confirm it&apos;s connected and selected as the active audio device at the OS
        level first, then reload EyeOnPit.
      </p>

      <h2>Browser speech permission</h2>
      <p>
        Voice recognition depends on your browser&apos;s built-in speech recognition service. If that service
        itself refuses the request, EyeOnPit shows &ldquo;The browser&apos;s speech recognition service refused the
        request&rdquo; — this is a browser/OS-level permission, separate from the microphone permission above.
      </p>

      <h2>Which browsers support voice</h2>
      <p>
        Voice runs on Chrome and Edge (desktop and Android) today, with partial, version-dependent support on
        Safari/iOS. <strong>Firefox does not ship a speech recognition engine and cannot run Voice</strong> —
        EyeOnPit detects this cleanly and switches to manual-only entry; nothing is lost, and the rest of the
        investigation continues normally. This is a browser limitation, not an EyeOnPit bug, and there is nothing to
        configure to work around it on Firefox today.
      </p>

      <h2>Voice heard incorrectly</h2>
      <p>
        If EyeOnPit didn&apos;t understand what you said, it shows &ldquo;Not recognized&rdquo; rather than guessing
        — nothing is recorded. Your device&apos;s speech recognizer usually offers several possible readings of what
        you said; EyeOnPit checks all of them, not just the first, so a noisy top guess doesn&apos;t block a clean
        lower-ranked one from being used. If a phrase keeps getting missed, check the Debug panel on the live screen
        (the small &ldquo;Debug&rdquo; toggle) and try the phrasing in the <Link href="/docs/voice">Voice Guide</Link>.
      </p>

      <h3>Reading the Debug panel</h3>
      <p>Opening Debug shows two things:</p>
      <ul>
        <li>
          <strong>Latest utterance detail</strong> — the most recent thing EyeOnPit heard: every alternative reading
          your device offered with its confidence, which one was actually used (marked with an arrow) and why, the
          active target before and after, how long it took, and — if rejected — the specific reason.
        </li>
        <li>
          <strong>The full session log</strong> — every recognition event in order (listening started/stopped,
          each alternative heard, normalization, the decision made, anything spoken back), each tagged with a
          short ID (e.g. <code>V-000042</code>) so every line about the same thing you said is easy to pick out.
        </li>
      </ul>
      <p>
        Two buttons let you get that information off the phone: <strong>Copy Voice Log</strong> copies the plain-text
        session log, and <strong>Export JSON</strong> copies a complete structured report — every alternative
        considered, the decision and reasoning for each utterance, and timing — suitable for pasting into a bug
        report or sharing with whoever is investigating a recognition issue. Neither includes any card, count, or
        investigation data; both are voice-pipeline debugging information only.
      </p>
      <p>
        A compact summary line above the raw log shows the whole session at a glance — acceptance rate, how many
        recognition sessions ended without ever producing a usable result, how many times a lower-ranked alternative
        was actually the correct one, and average recognition timing. The same numbers are included in the JSON
        export&apos;s own <code>sessionMetrics</code> section.
      </p>

      <h3>Normalization and recovery lines</h3>
      <p>
        When EyeOnPit corrects a known, narrow recognition quirk — a misheard &ldquo;seat&rdquo;, a punctuated
        shorthand like &ldquo;seat 1:9&rdquo;, or (rarely, as a last resort) a known dealer misreading — the Debug log
        shows exactly which rule fired and why, right next to that alternative&apos;s line. Nothing is ever corrected
        silently: if a card ends up somewhere unexpected, the Debug panel will always show whether it came from a
        normalization/recovery rule or from ordinary recognition, and which one.
      </p>

      <h2>Command rejected / control disabled</h2>
      <p>
        A command can be correctly recognized but still not act — for example, saying a card while the investigation
        is paused. EyeOnPit distinguishes this from &ldquo;not recognized&rdquo;: it always shows what it heard
        along with the SPECIFIC, truthful reason the action isn&apos;t available right now — never a generic
        &ldquo;not available.&rdquo; For example: &ldquo;Count is already running &mdash; nothing to resume&rdquo;
        (saying &ldquo;Start count&rdquo; when it&apos;s already running) or &ldquo;Dealer cards pending &mdash;
        enter cards or declare a round exception&rdquo; (saying &ldquo;Next hand&rdquo; before the dealer&apos;s
        cards are in).
      </p>

      <h2>Seat/player confusion</h2>
      <p>
        &ldquo;Seat,&rdquo; &ldquo;player,&rdquo; and &ldquo;spot&rdquo; are all interchangeable and always resolve
        to the same target — see the <Link href="/docs/voice">Voice Guide</Link>. If a card ever lands on the wrong seat,
        say &ldquo;Undo&rdquo; immediately; it reverses the most recent entry for the currently active target.
      </p>

      <h2>TTS / headset feedback not audible</h2>
      <p>Check two separate settings, both in Settings:</p>
      <ul>
        <li><strong>Spoken voice feedback</strong> — the master on/off switch for all spoken output. If this is off, nothing speaks at all.</li>
        <li><strong>Floor Spoken Count</strong> — controls what &ldquo;Status&rdquo; and the Done-completion announcement include (Hi-Lo only, Hi-Lo + true count, all enabled systems, or off). This is separate from the master switch above.</li>
      </ul>

      <h2>App running while the browser/tab backgrounds</h2>
      <p>
        EyeOnPit keeps whatever you&apos;ve already recorded safe regardless — entries are persisted locally as they
        happen, not batched. Browsers commonly suspend background tabs to save power, which can pause active voice
        listening; bring the tab back to the foreground and confirm the microphone is still listening before
        continuing to narrate.
      </p>

      <h2>Offline behavior</h2>
      <p>
        Card entry, counting, undo, notes, and history all work fully offline. Voice recognition depends on your
        platform&apos;s speech service, which generally requires network access — if EyeOnPit can&apos;t reach it
        after several attempts, it shows a persistent &ldquo;Voice unavailable&rdquo; state and switches to
        manual-only, rather than retrying silently forever. Manual entry is completely unaffected either way.
      </p>

      <h2>Local storage / session behavior</h2>
      <p>
        Investigations are stored locally on the device. &ldquo;Export All Investigations (JSON)&rdquo; in Settings
        downloads a full copy for backup or transfer. &ldquo;Reset all local data&rdquo; permanently deletes
        everything stored on the device — use it deliberately, not as a routine troubleshooting step.
      </p>

      <h2>Update / deployment / version issues</h2>
      <p>
        Settings → About shows the currently running build and whether an update is waiting. Use &ldquo;Check for
        Update&rdquo; to check manually, or &ldquo;Export Diagnostics&rdquo; to capture a report if something needs
        investigating. Updates never reload the app out from under you mid-session — a banner offers &ldquo;Update
        Now&rdquo; or &ldquo;Later,&rdquo; and the new version only takes over once you choose to apply it.
      </p>
    </>
  );
}
