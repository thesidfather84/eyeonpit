import { EyeOnPitDB } from "./schema";

let dbInstance: EyeOnPitDB | null = null;

/**
 * Lazily creates the single Dexie instance. Guarded against server-side
 * execution: IndexedDB doesn't exist in Node, and every real call site is a
 * client component/hook, so a server call here is a mistake worth failing
 * loudly on rather than silently.
 */
export function getDb(): EyeOnPitDB {
  if (typeof window === "undefined") {
    throw new Error(
      "getDb() was called outside the browser. EyeOnPit's data layer is client-only by design (see plan.md §5)."
    );
  }
  if (!dbInstance) {
    dbInstance = new EyeOnPitDB();
  }
  return dbInstance;
}
