"use client";

import { useParams } from "next/navigation";

export default function LiveEntryPage() {
  const params = useParams<{ id: string }>();

  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="text-lg font-semibold">Live Hand Entry</h1>
      <p className="text-sm text-muted-foreground">
        Investigation {params.id}. The dealer panel and round-entry loop land
        in Phase 3.
      </p>
    </div>
  );
}
