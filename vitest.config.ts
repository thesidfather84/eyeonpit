import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    // jsdom (not "node") so `typeof window !== "undefined"` — getDb()'s
    // guard against server-side IndexedDB access — passes in repository
    // integration tests; fake-indexeddb (setupFiles) supplies the actual
    // IndexedDB implementation Dexie talks to.
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
