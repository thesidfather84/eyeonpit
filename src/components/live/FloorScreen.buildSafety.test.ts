// @vitest-environment node
//
// Regression coverage for a real incident: a "Jest worker encountered N
// child process exceptions, exceeding retry limit" error was reported when
// opening Floor Mode. Investigation found no defect in the Floor route's
// own code or dependency graph (see the investigation notes in the PR/
// commit this file shipped with) — "Jest worker" here is Next.js's own
// internal build-worker pool (a bundled dependency, unrelated to this
// project's Vitest suite), and the crash coincided with a long-running,
// stale dev server process rather than anything reachable from Floor's
// imports. This test exists so that if test-only or Node-only
// infrastructure — in particular the src/lib/counting-engine/validation/
// mass-validation harness (see docs/VALIDATION.md), or `vitest` itself —
// ever DOES become reachable from the real browser dependency graph in the
// future, a normal `npm test` run catches it immediately, before it can
// reach a browser/runtime and produce a much more confusing symptom there.
//
// Deliberately a small, dependency-free static import-graph walk (regex
// over `import ... from "..."` / `export * from "..."` statements) rather
// than invoking webpack/Turbopack — the point is a fast, always-on guard,
// not a full bundler.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = path.resolve(__dirname, "../../");

const ENTRY_POINTS = [
  path.resolve(__dirname, "../../app/investigations/[id]/floor/page.tsx"),
  path.resolve(__dirname, "./FloorScreen.tsx"),
];

const IMPORT_SPECIFIER_RE = /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/g;

const FORBIDDEN_PATH_SEGMENTS = [
  `${path.sep}counting-engine${path.sep}validation${path.sep}`,
  ".massvalidate.",
];
const FORBIDDEN_BARE_SPECIFIERS = ["vitest", "vitest/config"];

function resolveSpecifier(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) {
    return null; // external package (react, next, lucide-react, ...) — not part of our own source graph
  }
  const base = specifier.startsWith("@/")
    ? path.join(SRC_ROOT, specifier.slice(2))
    : path.resolve(path.dirname(fromFile), specifier);

  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];
  for (const candidate of candidates) {
    try {
      readFileSync(candidate, "utf8");
      return candidate;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

function walkImportGraph(entryPoints: string[]): { visited: Set<string>; bareSpecifiers: Set<string> } {
  const visited = new Set<string>();
  const bareSpecifiers = new Set<string>();
  const queue = [...entryPoints];

  while (queue.length > 0) {
    const file = queue.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);

    let source: string;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      continue; // couldn't read this candidate — resolveSpecifier already tried its alternatives
    }

    for (const match of source.matchAll(IMPORT_SPECIFIER_RE)) {
      const specifier = match[1];
      if (!specifier.startsWith(".") && !specifier.startsWith("@/")) {
        bareSpecifiers.add(specifier);
        continue;
      }
      const resolved = resolveSpecifier(file, specifier);
      if (resolved && !visited.has(resolved)) {
        queue.push(resolved);
      }
    }
  }

  return { visited, bareSpecifiers };
}

describe("Floor route dependency graph never reaches test/validation/Node-only infrastructure", () => {
  it("no file reachable from the Floor page or FloorScreen resolves into lib/counting-engine/validation or a .massvalidate module", () => {
    const { visited } = walkImportGraph(ENTRY_POINTS);

    expect(visited.size).toBeGreaterThan(5); // sanity check: the walk actually traversed a real graph, not an empty/broken one

    const offenders = [...visited].filter((file) =>
      FORBIDDEN_PATH_SEGMENTS.some((segment) => file.includes(segment))
    );
    expect(offenders).toEqual([]);
  });

  it('no file reachable from the Floor page or FloorScreen imports "vitest" as a bare package specifier', () => {
    const { bareSpecifiers } = walkImportGraph(ENTRY_POINTS);

    const offenders = [...bareSpecifiers].filter((specifier) =>
      FORBIDDEN_BARE_SPECIFIERS.includes(specifier)
    );
    expect(offenders).toEqual([]);
  });
});
