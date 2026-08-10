// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { addCardToRound, getCardEventsForInvestigation } from "@/lib/db/repositories/cardEvents";
import { createInvestigation, occupySeat, resetAllData } from "@/lib/db/repositories/investigations";
import {
  buildAcesAnnouncement,
  buildCountAnnouncement,
  buildDecksRemainingAnnouncement,
  buildStatusAnnouncement,
  buildSystemAnnouncement,
  buildTrueCountAnnouncement,
} from "./spokenSummary";
import type { CardCode } from "@/types/investigation";

beforeEach(async () => {
  await resetAllData();
});

async function freshInvestigation() {
  return createInvestigation({
    casino: "",
    tableNumber: "",
    dealerName: "",
    investigationDate: "2026-08-09",
    operatorName: "",
    countingSystem: "Hi-Lo",
    shoeTotalDecks: 1, // single deck — clean, small numbers to assert on
    status: "active",
  });
}

function dealerAdd(investigationId: string, roundId: string, rank: CardCode["rank"]) {
  return addCardToRound({
    investigationLocalId: investigationId,
    roundId,
    targetType: "dealer",
    targetId: "dealer",
    rank,
    applyToRound: (round) => ({
      ...round,
      dealerHand: { cards: [...round.dealerHand.cards, { rank, suit: "unspecified" }] },
    }),
    event: { type: "card", message: `Dealer: ${rank}` },
  });
}

describe("buildCountAnnouncement — read-only, reuses the exact same CountSnapshot values CountSummaryPanel renders", () => {
  it("speaks the primary system's running count with no cards dealt (zero, not swallowed)", async () => {
    const inv = await freshInvestigation();
    const events = await getCardEventsForInvestigation(inv.localId);
    const text = buildCountAnnouncement(inv, events, inv.rounds[0].shoeNumber);
    expect(text).toContain("Hi-Lo 0.");
  });

  it("speaks a positive running count, true count, and every other system, never mutating any investigation data", async () => {
    const inv = await freshInvestigation();
    const round = inv.rounds[0];
    // Low cards (2-6) are all Hi-Lo +1 — three of them for a clean +3.
    await dealerAdd(inv.localId, round.id, "2");
    await dealerAdd(inv.localId, round.id, "3");
    await dealerAdd(inv.localId, round.id, "4");

    const eventsBefore = await getCardEventsForInvestigation(inv.localId);
    const text = buildCountAnnouncement(inv, eventsBefore, round.shoeNumber);

    expect(text).toContain("Hi-Lo +3.");
    expect(text).toContain("True count");
    expect(text).toContain("K O");
    expect(text).toContain("Zen");
    expect(text).toContain("Omega II");

    // Purely a read — the ledger this function was handed is untouched.
    const eventsAfter = await getCardEventsForInvestigation(inv.localId);
    expect(eventsAfter).toEqual(eventsBefore);
  });

  it("omits the true count sentence entirely for an unbalanced primary system (KO) rather than fabricating one", async () => {
    const inv = await createInvestigation({
      casino: "",
      tableNumber: "",
      dealerName: "",
      investigationDate: "2026-08-09",
      operatorName: "",
      countingSystem: "KO",
      shoeTotalDecks: 1,
      status: "active",
    });
    const events = await getCardEventsForInvestigation(inv.localId);
    const text = buildCountAnnouncement(inv, events, inv.rounds[0].shoeNumber);
    expect(text).not.toContain("True count");
  });
});

describe("buildStatusAnnouncement — count-only, content-configurable, read-only", () => {
  it('"hiloRc" -> Hi-Lo running count alone, no target/round preamble', async () => {
    const inv = await freshInvestigation();
    const round = inv.rounds[0];
    await occupySeat(inv.localId, 3);
    await dealerAdd(inv.localId, round.id, "10");

    const events = await getCardEventsForInvestigation(inv.localId);
    const text = buildStatusAnnouncement(inv, events, round.shoeNumber, "hiloRc");

    expect(text).toBe("Hi-Lo -1.");
  });

  it('"hiloRcTc" -> adds the Hi-Lo true count sentence', async () => {
    const inv = await freshInvestigation();
    const round = inv.rounds[0];
    await dealerAdd(inv.localId, round.id, "2");

    const events = await getCardEventsForInvestigation(inv.localId);
    const text = buildStatusAnnouncement(inv, events, round.shoeNumber, "hiloRcTc");

    expect(text).toContain("Hi-Lo +1.");
    expect(text).toContain("True count");
  });

  it('"all" -> reuses buildCountAnnouncement verbatim, the same text "Count" already speaks', async () => {
    const inv = await freshInvestigation();
    const round = inv.rounds[0];
    await dealerAdd(inv.localId, round.id, "2");

    const events = await getCardEventsForInvestigation(inv.localId);
    const statusText = buildStatusAnnouncement(inv, events, round.shoeNumber, "all");
    const countText = buildCountAnnouncement(inv, events, round.shoeNumber);

    expect(statusText).toBe(countText);
    expect(statusText).toContain("K O");
    expect(statusText).toContain("Zen");
    expect(statusText).toContain("Omega II");
  });
});

describe("buildSystemAnnouncement — a specific counting system's own running count (natural read-only questions, e.g. \"What's the KO?\")", () => {
  it("KO/Zen/Omega II each read their OWN tag values, not Hi-Lo's — a 7 then an ace diverges across all four systems", async () => {
    const inv = await freshInvestigation();
    const round = inv.rounds[0];
    await dealerAdd(inv.localId, round.id, "7");
    await dealerAdd(inv.localId, round.id, "A");
    const events = await getCardEventsForInvestigation(inv.localId);

    // Hi-Lo: 7=0, A=-1 -> -1. KO: 7=1, A=-1 -> 0. Zen: 7=1, A=-1 -> 0.
    // Omega II: 7=1, A=0 -> +1. Deliberately NOT all the same value —
    // proves each call reads its own system's tags out of the shared
    // snapshot, not a copy-pasted Hi-Lo result relabeled.
    expect(buildSystemAnnouncement(inv, events, round.shoeNumber, "Hi-Lo")).toBe("Hi-Lo -1.");
    expect(buildSystemAnnouncement(inv, events, round.shoeNumber, "KO")).toBe("K O 0.");
    expect(buildSystemAnnouncement(inv, events, round.shoeNumber, "Zen")).toBe("Zen 0.");
    expect(buildSystemAnnouncement(inv, events, round.shoeNumber, "Omega II")).toBe("Omega II +1.");
  });

  it("never mutates the CardEvent ledger — purely a read", async () => {
    const inv = await freshInvestigation();
    const round = inv.rounds[0];
    await dealerAdd(inv.localId, round.id, "K");
    const eventsBefore = await getCardEventsForInvestigation(inv.localId);
    buildSystemAnnouncement(inv, eventsBefore, round.shoeNumber, "KO");
    const eventsAfter = await getCardEventsForInvestigation(inv.localId);
    expect(eventsAfter).toEqual(eventsBefore);
  });
});

describe("buildTrueCountAnnouncement — Hi-Lo's own true count, answering \"What is the true count?\"", () => {
  it("matches exactly the True Count sentence buildStatusAnnouncement('hiloRcTc') already produces — one authoritative calculation, not a second engine", async () => {
    const inv = await freshInvestigation();
    const round = inv.rounds[0];
    await dealerAdd(inv.localId, round.id, "2");
    const events = await getCardEventsForInvestigation(inv.localId);

    const tcText = buildTrueCountAnnouncement(inv, events, round.shoeNumber);
    const statusText = buildStatusAnnouncement(inv, events, round.shoeNumber, "hiloRcTc");

    expect(tcText).toMatch(/^True count .+\.$/);
    expect(statusText).toContain(tcText);
  });
});

describe("buildAcesAnnouncement — the same Aces Seen tally CountSummaryPanel's ACES chip shows", () => {
  it("0/1/2 aces seen, singular vs. plural wording", async () => {
    const inv = await freshInvestigation();
    const round = inv.rounds[0];

    const eventsBefore = await getCardEventsForInvestigation(inv.localId);
    expect(buildAcesAnnouncement(eventsBefore, round.shoeNumber)).toBe("0 aces seen.");

    await dealerAdd(inv.localId, round.id, "A");
    const eventsOne = await getCardEventsForInvestigation(inv.localId);
    expect(buildAcesAnnouncement(eventsOne, round.shoeNumber)).toBe("1 ace seen.");

    await dealerAdd(inv.localId, round.id, "A");
    const eventsTwo = await getCardEventsForInvestigation(inv.localId);
    expect(buildAcesAnnouncement(eventsTwo, round.shoeNumber)).toBe("2 aces seen.");
  });

  it("never counts a non-ace, and never mutates the ledger", async () => {
    const inv = await freshInvestigation();
    const round = inv.rounds[0];
    await dealerAdd(inv.localId, round.id, "K");
    await dealerAdd(inv.localId, round.id, "5");
    const eventsBefore = await getCardEventsForInvestigation(inv.localId);

    expect(buildAcesAnnouncement(eventsBefore, round.shoeNumber)).toBe("0 aces seen.");

    const eventsAfter = await getCardEventsForInvestigation(inv.localId);
    expect(eventsAfter).toEqual(eventsBefore);
  });
});

describe("buildDecksRemainingAnnouncement — the same Decks Remaining value CountSummaryPanel's DECKS chip shows", () => {
  it("matches calculateCountSnapshot's own decksRemaining, formatted to one decimal", async () => {
    const inv = await freshInvestigation();
    const round = inv.rounds[0];
    await dealerAdd(inv.localId, round.id, "2");
    await dealerAdd(inv.localId, round.id, "3");
    const events = await getCardEventsForInvestigation(inv.localId);

    const { calculateCountSnapshot } = await import("@/lib/counting-engine/calculateCounts");
    const { eventsInShoe } = await import("@/lib/counting-engine/ledger");
    const snapshot = calculateCountSnapshot(eventsInShoe(events, round.shoeNumber), inv.shoeTotalDecks);

    expect(buildDecksRemainingAnnouncement(inv, events, round.shoeNumber)).toBe(
      `${snapshot.decksRemaining.toFixed(1)} decks remaining.`
    );
  });
});
