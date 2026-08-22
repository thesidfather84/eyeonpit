// @vitest-environment jsdom
//
// EyeOnPit 1.15a — the single most important regression in this release
// (AGENTS.md 1.15a §7): "1.15a Vision MUST NOT create CardEvents, change
// running/true count, change wagers, occupy seats, change rounds/shoes/
// dealer, or invoke ANY game mutation. There should be NO VisionProvider ->
// addCardEvent() path." Proven two independent ways, deliberately
// redundant — a source-level check that the forbidden import/call
// literally cannot exist in the code as written, AND a behavioral check
// that actually running the shipped provider against a real investigation
// changes nothing observable.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createInvestigation, getInvestigation } from "@/lib/db/repositories/investigations";
import { getCardEventsForInvestigation } from "@/lib/db/repositories/cardEvents";
import { NoModelVisionProvider } from "./noModelVisionProvider";

/** Doc comments in these files legitimately NAME the forbidden modules in prose (explaining the boundary) — block/line comments are stripped before scanning, same technique mic-check's own "NO PROVIDER DEPENDENCY" test uses, so those mentions don't produce a false positive against real import statements. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const VISION_SOURCE_FILES = [
  "visionTypes.ts",
  "noModelVisionProvider.ts",
  "cameraCheck.ts",
].map((f) => path.join(__dirname, f));

const VISION_PAGE_FILE = path.join(__dirname, "../../app/lab/(protected)/vision/page.tsx");

const FORBIDDEN_MODULE_FRAGMENTS = [
  "db/repositories/investigations",
  "db/repositories/cardEvents",
  "db/client",
  "contexts/InvestigationContext",
];

const FORBIDDEN_CALL_NAMES = [
  "addCardToRound",
  "occupySeatAndAddCard",
  "undoTargetCard",
  "redoTargetCard",
  "createInvestigation",
  "updateInvestigation",
  "mutateRound",
  "occupySeat(",
  "markSeatEmpty",
  "updateSeatBet",
  "splitSeat",
  "changeDealer",
  "advanceRound",
  "completeInvestigation",
];

describe("Vision CardEvent firewall — source-level proof", () => {
  it("no Vision file imports the investigation/CardEvent mutation layer", () => {
    for (const file of VISION_SOURCE_FILES) {
      const code = stripComments(readFileSync(file, "utf8"));
      for (const forbidden of FORBIDDEN_MODULE_FRAGMENTS) {
        expect(code, `${path.basename(file)} must not import "${forbidden}"`).not.toContain(forbidden);
      }
    }
  });

  it("no Vision file calls any known game-mutation function by name", () => {
    for (const file of VISION_SOURCE_FILES) {
      const code = stripComments(readFileSync(file, "utf8"));
      for (const forbidden of FORBIDDEN_CALL_NAMES) {
        expect(code, `${path.basename(file)} must not call ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it("the Vision Lab page itself imports no game-mutation function — it may read investigation identity for display, but never writes", () => {
    const code = stripComments(readFileSync(VISION_PAGE_FILE, "utf8"));
    for (const forbidden of FORBIDDEN_CALL_NAMES) {
      expect(code, `Vision Lab page must not call ${forbidden}`).not.toContain(forbidden);
    }
  });
});

describe("Vision CardEvent firewall — behavioral proof", () => {
  it("running the shipped VisionProvider repeatedly against a real investigation changes nothing observable in it", async () => {
    const inv = await createInvestigation({
      casino: "",
      tableNumber: "",
      dealerName: "",
      investigationDate: "2026-08-22",
      operatorName: "",
      countingSystem: "Hi-Lo",
      shoeTotalDecks: 6,
      status: "active",
    });

    const before = await getInvestigation(inv.localId);
    const eventsBefore = await getCardEventsForInvestigation(inv.localId);

    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;

    const provider = new NoModelVisionProvider();
    await provider.load();
    await provider.infer(canvas, "still-image");
    await provider.infer(canvas, "camera");
    await provider.infer(canvas, "camera");
    provider.dispose();

    const after = await getInvestigation(inv.localId);
    const eventsAfter = await getCardEventsForInvestigation(inv.localId);

    expect(after).toEqual(before);
    expect(eventsAfter).toEqual(eventsBefore);
    expect(eventsAfter).toHaveLength(0);
  });

  it("VisionProvider.infer() never returns a promise that resolves to anything but observations — no hidden side channel", async () => {
    const provider = new NoModelVisionProvider();
    await provider.load();
    const canvas = document.createElement("canvas");
    const result = await provider.infer(canvas, "still-image");
    expect(Object.keys(result).sort()).toEqual(["inferenceMs", "observations"]);
    expect(result.observations).toEqual([]);
    provider.dispose();
  });
});
