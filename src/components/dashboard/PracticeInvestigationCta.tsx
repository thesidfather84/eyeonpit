"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { findOrCreatePracticeInvestigation } from "@/lib/onboarding/practiceInvestigationSeed";
import { Button } from "@/components/ui/Button";

export function PracticeInvestigationCta() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const investigation = await findOrCreatePracticeInvestigation();
      router.push(`/investigations/${investigation.localId}/live`);
    } catch (error) {
      console.error("Failed to start practice investigation:", error);
      setLoading(false);
    }
  }

  return (
    <Button variant="secondary" fullWidth onClick={handleClick} disabled={loading}>
      {loading ? "Loading…" : "▷ Try a Practice Investigation"}
    </Button>
  );
}
