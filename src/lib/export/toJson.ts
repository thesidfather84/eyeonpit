import type { Investigation } from "@/types/investigation";

export function investigationToJson(investigation: Investigation): string {
  return JSON.stringify(investigation, null, 2);
}

/** Triggers a real browser download — no server, no filesystem, Vercel-safe. */
export function downloadInvestigationJson(investigation: Investigation): void {
  const json = investigationToJson(investigation);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${investigation.displayId}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
