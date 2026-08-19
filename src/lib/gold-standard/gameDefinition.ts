import type { VersionedRecord } from "@/lib/versioning/types";
import { generateCanonicalId } from "@/lib/versioning/id";

/**
 * PRIORITY B1 — the typed, versioned Blackjack Game Definition. Centralizes
 * every rule a shoe's play depends on in ONE place (see this file's own
 * "do not scatter game rules across components" mandate) — the Simulation
 * Engine (Priority B7) and, later, live-investigation rule capture both
 * read from this same shape rather than each inventing their own rule
 * fields. Pure data + validation — no simulation logic lives here.
 *
 * Deliberately independent of `Investigation.blackjackFormat`/`ruleProfile`
 * (types/investigation.ts) — those existing fields are NOT modified or
 * replaced by this file; a future pass may map between the two, but that
 * mapping is out of scope for this foundation (see
 * docs/EYEONPIT_1_6_ARCHITECTURE.md).
 */

export type DealerSoft17Rule = "H17" | "S17";
export type DoublingRule = "any-two-cards" | "9-10-11-only" | "10-11-only" | "9-11-only";
export type BlackjackPayout = "3:2" | "6:5" | "1:1" | "2:1";
export type ShuffleType = "hand-shuffle" | "continuous-shuffler" | "unknown";

export interface GameDefinition extends VersionedRecord {
  name: string;
  deckCount: number;
  dealerSoft17: DealerSoft17Rule;
  doubleAfterSplitAllowed: boolean;
  doublingRule: DoublingRule;
  resplitAllowed: boolean;
  /** Total hands a single starting hand may become via repeated splits — e.g. 4 for "resplit to 4 hands." Ignored (treated as 1) when `resplitAllowed` is false. */
  maxSplitHands: number;
  resplitAcesAllowed: boolean;
  /** Standard rule: split aces receive exactly one card each and cannot be hit again. False only for a deliberately unusual rule set. */
  oneCardOnSplitAces: boolean;
  lateSurrenderAllowed: boolean;
  earlySurrenderAllowed: boolean;
  blackjackPayout: BlackjackPayout;
  /** 0-100, the percentage of the shoe dealt before the cut card ends the shoe. */
  penetrationPercent: number;
  cutCardUsed: boolean;
  /** Cards burned immediately after a shuffle, before the first hand — 0 if none. */
  burnCardCount: number;
  shuffleType: ShuffleType;
  notes?: string;
}

export type CreateGameDefinitionInput = Omit<GameDefinition, keyof VersionedRecord>;

export type GameDefinitionValidation = { valid: true } | { valid: false; errors: string[] };

/** Pure validation — every range/consistency rule a GameDefinition must satisfy before it can be simulated against (Priority B7's "correctness first" starts here: a simulation is only as trustworthy as the rules it was run under). */
export function validateGameDefinition(input: CreateGameDefinitionInput): GameDefinitionValidation {
  const errors: string[] = [];
  if (!input.name.trim()) errors.push("Name is required.");
  if (!Number.isInteger(input.deckCount) || input.deckCount < 1 || input.deckCount > 8) {
    errors.push("Deck count must be an integer between 1 and 8.");
  }
  if (!Number.isInteger(input.maxSplitHands) || input.maxSplitHands < 1 || input.maxSplitHands > 4) {
    errors.push("Max split hands must be an integer between 1 and 4.");
  }
  if (input.penetrationPercent <= 0 || input.penetrationPercent > 100) {
    errors.push("Penetration percent must be between 0 (exclusive) and 100.");
  }
  if (!Number.isInteger(input.burnCardCount) || input.burnCardCount < 0) {
    errors.push("Burn card count must be a non-negative integer.");
  }
  return errors.length > 0 ? { valid: false, errors } : { valid: true };
}

export function buildGameDefinition(input: CreateGameDefinitionInput): GameDefinition {
  const validation = validateGameDefinition(input);
  if (!validation.valid) throw new Error(`Invalid game definition: ${validation.errors.join(" ")}`);
  const now = new Date().toISOString();
  return { ...input, id: generateCanonicalId(), version: 1, createdAt: now, updatedAt: now };
}

/**
 * A small set of well-known, published rule sets — reference presets only,
 * never presented as the ONLY valid configuration. Every numeric value here
 * is a widely-published industry-standard convention (a "Vegas Strip"
 * 6-deck S17 game, a single-deck hand-held game), not an invented formula.
 */
export const GAME_DEFINITION_PRESETS: Record<string, CreateGameDefinitionInput> = {
  "vegas-strip-6d-s17": {
    name: "Vegas Strip 6-Deck, S17",
    deckCount: 6,
    dealerSoft17: "S17",
    doubleAfterSplitAllowed: true,
    doublingRule: "any-two-cards",
    resplitAllowed: true,
    maxSplitHands: 4,
    resplitAcesAllowed: false,
    oneCardOnSplitAces: true,
    lateSurrenderAllowed: true,
    earlySurrenderAllowed: false,
    blackjackPayout: "3:2",
    penetrationPercent: 75,
    cutCardUsed: true,
    burnCardCount: 1,
    shuffleType: "hand-shuffle",
  },
  "single-deck-h17": {
    name: "Single-Deck, H17",
    deckCount: 1,
    dealerSoft17: "H17",
    doubleAfterSplitAllowed: false,
    doublingRule: "9-10-11-only",
    resplitAllowed: false,
    maxSplitHands: 2,
    resplitAcesAllowed: false,
    oneCardOnSplitAces: true,
    lateSurrenderAllowed: false,
    earlySurrenderAllowed: false,
    blackjackPayout: "3:2",
    penetrationPercent: 65,
    cutCardUsed: true,
    burnCardCount: 1,
    shuffleType: "hand-shuffle",
  },
};
