import { v4 as uuidv4 } from "uuid";

const STORAGE_KEY = "eyeonpit:deviceId";

/**
 * A stable per-device identifier, persisted in localStorage. Used to stamp
 * Investigation.deviceId — meaningless today, load-bearing once a future
 * sync backend needs to tell devices apart. See plan.md §5.
 */
export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") {
    throw new Error("getOrCreateDeviceId() can only run in the browser.");
  }

  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;

  const generated = uuidv4();
  window.localStorage.setItem(STORAGE_KEY, generated);
  return generated;
}
