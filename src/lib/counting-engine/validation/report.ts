import type { HarnessResult } from "./types";

/**
 * Human-readable summary for `npm run validate:counting[:stress]` and the
 * smoke test's console output. Deliberately conservative in its wording —
 * see docs/VALIDATION.md and docs/EYEONPIT_PRODUCT_SPEC.md: a passing run
 * is evidence from a large number of simulated cases against an
 * independent reference model, never a claim of formal/mathematical proof.
 */
export function formatHarnessReport(result: HarnessResult): string {
  const lines: string[] = [];
  lines.push("EyeOnPit counting/ledger validation harness");
  lines.push("=".repeat(44));
  lines.push(`Seed:              ${result.config.seed}`);
  lines.push(`Sessions:          ${result.sessionsSimulated}`);
  lines.push(`Shoes:             ${result.shoesSimulated}`);
  lines.push(`Hands (rounds):    ${result.roundsSimulated}`);
  lines.push(`CardEvents:        ${result.cardEventsProcessed}`);
  lines.push(`Undo operations:   ${result.undoOpsProcessed}`);
  lines.push(`Redo operations:   ${result.redoOpsProcessed}`);
  lines.push(`Reload checks:     ${result.reloadChecksProcessed}`);
  lines.push(`Snapshot checks:   ${result.snapshotChecksProcessed}`);
  lines.push(`Systems checked:   ${result.systemsChecked.join(", ")}`);
  lines.push(`Elapsed:           ${(result.elapsedMs / 1000).toFixed(2)}s`);
  lines.push("");

  if (result.mismatches.length === 0) {
    lines.push(
      `PASS — passed ${result.roundsSimulated} simulated hands (${result.cardEventsProcessed} CardEvents) ` +
        "with zero detected mismatches against the independent reference model."
    );
  } else {
    lines.push(`FAIL — ${result.mismatches.length} mismatch(es) detected:`);
    for (const m of result.mismatches) {
      lines.push("");
      lines.push(`  seed=${m.seed} investigation=${m.investigationId} shoe=${m.shoeNumber} round=${m.roundNumber} op#${m.opIndex}`);
      lines.push(`  op:       ${JSON.stringify(m.op)}`);
      lines.push(`  field:    ${m.field}`);
      lines.push(`  expected: ${JSON.stringify(m.expected)}`);
      lines.push(`  actual:   ${JSON.stringify(m.actual)}`);
      lines.push(`  replay:   ${JSON.stringify(m.replay)}`);
    }
  }

  return lines.join("\n");
}
