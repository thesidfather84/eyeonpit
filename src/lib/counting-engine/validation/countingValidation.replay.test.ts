// @vitest-environment jsdom
//
// Replay helper for a saved failure payload (requirement 8 — see
// docs/VALIDATION.md). When a random simulation finds a mismatch, its
// report (see report.ts) includes a `ReplayPayload` JSON blob scoped to
// exactly the one shoe where the divergence was found. Paste that JSON
// into the EYEONPIT_REPLAY_PAYLOAD environment variable and run this file
// alone to reproduce the exact same failure deterministically, in
// isolation, without re-running the original (possibly huge) simulation:
//
//   Bash/zsh:
//     EYEONPIT_REPLAY_PAYLOAD='{"seed":123,...}' npx vitest run src/lib/counting-engine/validation/countingValidation.replay.test.ts
//
//   PowerShell:
//     $env:EYEONPIT_REPLAY_PAYLOAD = '{"seed":123,...}'
//     npx vitest run src/lib/counting-engine/validation/countingValidation.replay.test.ts
//
// With no payload set, this file's one test is skipped (not a failure) —
// it exists to be used on demand while debugging a specific reported
// mismatch, not to run as part of any routine suite.
import { describe, expect, it } from "vitest";
import { resetAllData } from "@/lib/db/repositories/investigations";
import { formatHarnessReport } from "./report";
import { replayPayload } from "./simulator";
import type { ReplayPayload } from "./types";

function loadPayloadFromEnv(): ReplayPayload | null {
  const raw = process.env.EYEONPIT_REPLAY_PAYLOAD;
  if (!raw) return null;
  return JSON.parse(raw) as ReplayPayload;
}

const payload = loadPayloadFromEnv();

describe.skipIf(!payload)("counting validation harness — replay a saved failure payload", () => {
  it("reproduces (or confirms fixed) the exact reported mismatch", async () => {
    await resetAllData();
    const result = await replayPayload(payload!);
    console.log(formatHarnessReport(result));
    expect(result.mismatches).toEqual([]);
  });
});
