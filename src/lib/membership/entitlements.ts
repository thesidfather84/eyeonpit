/**
 * PRIORITY 1.8-10 — advanced feature entitlements. A clean feature-boundary
 * MODEL for future paid access — "Do not implement billing" and "Do not
 * create fake paid functionality" (this priority's and the shared rules'
 * own words): nothing here gates any real feature today; `/lab` remains
 * reachable by anyone who has the shared passcode, exactly as before this
 * file existed. This is the documented target shape a future subscription
 * system would enforce, not an enforcement mechanism itself.
 */
export type FeatureTier = "PUBLIC" | "PRO" | "ENTERPRISE";

const TIER_RANK: Record<FeatureTier, number> = { PUBLIC: 0, PRO: 1, ENTERPRISE: 2 };

export type FeatureKey =
  // PUBLIC / BASIC
  | "basic-docs"
  | "basic-app-features"
  // PRO / PAID
  | "advanced-reporting"
  | "simulation-lab"
  | "method-library"
  | "counter-detection"
  | "player-analytics"
  | "advanced-exports"
  | "research-tools"
  // ENTERPRISE
  | "multi-property"
  | "roles-and-permissions"
  | "audit-controls"
  | "identity-tools"
  | "centralized-property-management";

export const FEATURE_TIER_MAP: Record<FeatureKey, FeatureTier> = {
  "basic-docs": "PUBLIC",
  "basic-app-features": "PUBLIC",

  "advanced-reporting": "PRO",
  "simulation-lab": "PRO",
  "method-library": "PRO",
  "counter-detection": "PRO",
  "player-analytics": "PRO",
  "advanced-exports": "PRO",
  "research-tools": "PRO",

  "multi-property": "ENTERPRISE",
  "roles-and-permissions": "ENTERPRISE",
  "audit-controls": "ENTERPRISE",
  "identity-tools": "ENTERPRISE",
  "centralized-property-management": "ENTERPRISE",
};

/** A higher tier includes every feature of every lower tier — PRO includes PUBLIC, ENTERPRISE includes PRO and PUBLIC. */
export function isFeatureEntitled(accountTier: FeatureTier, feature: FeatureKey): boolean {
  return TIER_RANK[accountTier] >= TIER_RANK[FEATURE_TIER_MAP[feature]];
}
