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

      <h2>Voice heard incorrectly</h2>
      <p>
        If EyeOnPit didn&apos;t understand what you said, it shows &ldquo;Not recognized&rdquo; rather than guessing
        — nothing is recorded. If a phrase keeps getting missed, check the Debug panel on the live screen (the small
        &ldquo;Debug&rdquo; toggle) to see exactly what was transcribed, and try the phrasing in the{" "}
        <Link href="/docs/voice">Voice Guide</Link>.
      </p>

      <h2>Command rejected / control disabled</h2>
      <p>
        A command can be correctly recognized but still not act — for example, saying a card while the investigation
        is paused. EyeOnPit distinguishes this from &ldquo;not recognized&rdquo;: it shows what it heard along with
        the specific reason the action isn&apos;t available right now (e.g. &ldquo;Investigation paused &mdash;
        resume to continue&rdquo;).
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
