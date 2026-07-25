import type { SyncAdapter } from "./types";

/**
 * No-op SyncAdapter used through Phase 5. There is no backend yet — every
 * investigation lives only on the device that created it. See plan.md §5.
 */
export const localOnlyAdapter: SyncAdapter = {
  async push() {
    // Intentionally does nothing: no backend exists yet.
  },
  async pull() {
    return [];
  },
  resolveConflict(local) {
    // No remote data ever arrives via this adapter, so local always wins.
    return local;
  },
};
