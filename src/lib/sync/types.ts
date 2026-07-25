import type { Investigation } from "@/types/investigation";

/**
 * The seam a future secure sync backend plugs into. Nothing implements this
 * for real yet — see plan.md §5 and §11 (Phase 6). Keeping the interface in
 * place from Phase 1 is what makes "local storage is a prototype, not the
 * architecture" (plan.md §0.3) more than a slogan: the repository layer and
 * UI never need to change shape when a real adapter replaces localOnlyAdapter.
 */
export interface SyncAdapter {
  push(investigations: Investigation[]): Promise<void>;
  pull(since?: string): Promise<Investigation[]>;
  resolveConflict(local: Investigation, remote: Investigation): Investigation;
}
