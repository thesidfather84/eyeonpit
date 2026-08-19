/**
 * PRIORITY 1.8-9 — multi-property membership readiness. TYPES AND PURE
 * FUNCTIONS ONLY — no persistence, no auth changes, no wiring into
 * `/lab`'s existing server-side passcode gate (lib/labAuth/session.ts,
 * untouched) or the main app's session (lib/auth/session.ts, untouched).
 * "Do NOT weaken current server-side /lab gate" (this priority's own
 * rule) — nothing here is capable of doing so; it isn't consulted by any
 * gate anywhere yet.
 */
export type Role = "Observer" | "Supervisor" | "Investigator" | "Administrator" | "ResearchAnalyst";

export const ALL_ROLES: Role[] = ["Observer", "Supervisor", "Investigator", "Administrator", "ResearchAnalyst"];

export type Permission =
  | "view-investigation"
  | "edit-investigation"
  | "manage-property"
  | "access-lab"
  | "run-simulation"
  | "view-counter-detection"
  | "manage-users"
  | "view-research-library"
  | "export-reports";

/** A real, documented permission matrix — a starting design for future enforcement, not a claim that any of it is enforced anywhere today. */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  Observer: ["view-investigation"],
  Supervisor: ["view-investigation", "edit-investigation", "export-reports"],
  Investigator: ["view-investigation", "edit-investigation", "export-reports", "view-research-library"],
  ResearchAnalyst: ["view-investigation", "access-lab", "run-simulation", "view-counter-detection", "view-research-library"],
  Administrator: [
    "view-investigation",
    "edit-investigation",
    "manage-property",
    "access-lab",
    "run-simulation",
    "view-counter-detection",
    "manage-users",
    "view-research-library",
    "export-reports",
  ],
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
