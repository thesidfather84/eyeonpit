import path from "path";
import { defineConfig } from "vitest/config";

/**
 * Separate config for the STANDARD/STRESS mass-validation scales (see
 * docs/VALIDATION.md). Deliberately kept out of the main `vitest.config.ts`
 * include glob (`src/**\/*.test.ts`) — files matched here end in
 * `.massvalidate.ts`, not `.test.ts`, so an ordinary `npm test` never
 * discovers or runs them; they only run via `npm run validate:counting` /
 * `validate:counting:stress`, which point vitest at this config explicitly.
 * The SMOKE scale (`countingValidation.smoke.test.ts`) is a normal
 * `.test.ts` file under the main config, so it *does* run with every
 * ordinary `npm test`.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/lib/counting-engine/validation/*.massvalidate.ts"],
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
});
