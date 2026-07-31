"use client";

import { useSyncExternalStore } from "react";
import { getSpeechRecognitionCtor } from "@/lib/voice/speechRecognitionTypes";

function subscribe() {
  // Speech-recognition support doesn't change mid-session — nothing to
  // subscribe to. useSyncExternalStore still requires a subscribe
  // function; this one just never calls its callback.
  return () => {};
}

function getSnapshot(): boolean {
  return !!getSpeechRecognitionCtor();
}

/** The server (and the client's very first hydration pass) has no `window` — same reasoning as useOnlineStatus.ts. Assume unsupported so there's nothing to mismatch; useSyncExternalStore corrects to the real value in one client-only re-render right after hydration. */
function getServerSnapshot(): boolean {
  return false;
}

/**
 * Runtime capability check only — never a browser-name assumption.
 * Built on useSyncExternalStore (same pattern as useOnlineStatus.ts)
 * specifically so the server-rendered snapshot and the client's first
 * paint always agree; a plain useState+useEffect version would compute the
 * real client value inside the effect and risk a hydration mismatch on the
 * render before it, exactly the failure mode useSyncExternalStore exists
 * to avoid.
 */
export function useSpeechRecognitionSupport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
