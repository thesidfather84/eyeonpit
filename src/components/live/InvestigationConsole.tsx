import { LockProvider } from "@/contexts/LockContext";
import { EntryLockProvider } from "@/contexts/EntryLockContext";
import { InvestigationProvider } from "@/contexts/InvestigationContext";
import { InvestigationChrome } from "@/components/navigation/InvestigationChrome";
import { LiveScreen } from "./LiveScreen";

/**
 * The full console composition (lock + investigation state + chrome +
 * screen) for a given investigation id. Shared by the root console
 * (`/`, which discovers the active id itself) and the `[id]/live`
 * compatibility route (a direct deep link, e.g. from History) — one
 * implementation, two entry points.
 */
export function InvestigationConsole({ investigationId }: { investigationId: string }) {
  return (
    <LockProvider>
      <EntryLockProvider>
        <InvestigationProvider investigationId={investigationId}>
          <InvestigationChrome>
            <LiveScreen />
          </InvestigationChrome>
        </InvestigationProvider>
      </EntryLockProvider>
    </LockProvider>
  );
}
