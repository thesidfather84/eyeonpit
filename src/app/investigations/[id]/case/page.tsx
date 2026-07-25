"use client";

import { useParams } from "next/navigation";

export default function CasePage() {
  const params = useParams<{ id: string }>();

  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="text-lg font-semibold">Case</h1>
      <p className="text-sm text-muted-foreground">
        Investigation {params.id}. Review and Report land in Phase 5.
      </p>
    </div>
  );
}
