/**
 * The one shared EMPTY/OCCUPIED/ACTIVE visual vocabulary for a table
 * position tile — used by SeatTilesRow (Surveillance), FloorPlayField
 * (Floor), and DealerTile, so a seat never looks meaningfully different
 * between the two shells (AGENTS.md operational UI rebuild §5/§6/§20).
 * Never color alone: EMPTY is dashed and unfilled, OCCUPIED is a solid
 * border with a filled background, ACTIVE additionally gets a thicker
 * border. Each shell may still use its own accent color per state (e.g.
 * the dealer's own red) — this only fixes the *shape* vocabulary (dashed
 * vs. solid vs. thick), not every color choice.
 */
export function seatToneClasses(state: "empty" | "occupied" | "active"): string {
  switch (state) {
    case "active":
      return "border-2 border-accent-secondary bg-accent-secondary/15";
    case "occupied":
      return "border border-status-green/70 bg-status-green/10";
    case "empty":
    default:
      return "border border-dashed border-border/60 bg-transparent";
  }
}
