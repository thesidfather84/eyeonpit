import type { CountMethodDefinition } from "../countMethodRegistry";
import type { GameFamily } from "./gameFamily";

/**
 * PRIORITY 1.8-8 — game/method compatibility validation. "Prevent
 * incompatible methods from silently running against the wrong game" —
 * this is a STANDALONE, tested validator; it is deliberately NOT
 * force-integrated into `createSimulationScenario`/`validateSimulationScenario`
 * (lib/gold-standard/simulation/scenario.ts) in this patch, to avoid
 * changing that already-approved, already-tested 1.6 code's existing
 * behavior without being asked — see
 * docs/EYEONPIT_1_8_GLOBAL_ARCHITECTURE.md's "Deferred" section.
 *
 * A method with no `supportedGameFamilies` declared is treated as
 * INCOMPATIBLE with every game family, not as "compatible with
 * blackjack by default" — an undeclared method is unverified, not
 * presumed safe; every one of the four built-in adapters explicitly
 * declares `["blackjack"]` (see countMethodAdapters.ts), so this never
 * affects the trusted, already-shipped systems.
 */
export interface CompatibilityResult {
  compatible: boolean;
  reason?: string;
}

export function validateMethodGameCompatibility(method: CountMethodDefinition, gameFamily: GameFamily): CompatibilityResult {
  if (!method.supportedGameFamilies || method.supportedGameFamilies.length === 0) {
    return {
      compatible: false,
      reason: `${method.displayName} does not declare which game(s) it supports — treated as incompatible until it does.`,
    };
  }
  if (!method.supportedGameFamilies.includes(gameFamily)) {
    return {
      compatible: false,
      reason: `${method.displayName} supports ${method.supportedGameFamilies.join(", ")}, not ${gameFamily}.`,
    };
  }
  return { compatible: true };
}
