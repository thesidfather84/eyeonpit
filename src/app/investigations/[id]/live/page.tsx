"use client";

import { useParams } from "next/navigation";
import { LiveEntryScreen } from "@/components/live-entry/LiveEntryScreen";

export default function LiveEntryPage() {
  const params = useParams<{ id: string }>();
  return <LiveEntryScreen investigationId={params.id} />;
}
