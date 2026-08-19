import Link from "next/link";

/**
 * PRIORITY B2/B10 — "Add Method" is intentionally NOT a full form in this
 * foundation pass. The underlying capability is real and tested
 * (createCountMethod in lib/db/repositories/goldStandard.ts, validated by
 * validateCountMethodInput per Priority B12's safety rules) — what's
 * deferred is the UI form itself. See docs/EYEONPIT_1_6_ARCHITECTURE.md's
 * "Deferred" section.
 */
export default function AddMethodPage() {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-lg font-bold text-foreground">Add Method</h1>
      <p className="text-sm text-muted-foreground">
        The Add Method form is not yet built in this foundation pass. The underlying capability is complete and
        tested: <code className="text-xs">createCountMethod()</code> in{" "}
        <code className="text-xs">lib/db/repositories/goldStandard.ts</code>, with full validation per the
        VERIFIED/RECONSTRUCTED/EXPERIMENTAL/RESEARCH_ONLY safety rules in{" "}
        <code className="text-xs">lib/gold-standard/countMethodRegistry.ts</code>.
      </p>
      <Link href="/lab/methods" className="text-sm font-semibold text-accent">
        ← Back to Method Library
      </Link>
    </div>
  );
}
