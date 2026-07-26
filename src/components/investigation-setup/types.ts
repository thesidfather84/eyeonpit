import type { CountingSystem } from "@/types/investigation";

export interface WizardDraft {
  casino: string;
  tableNumber: string;
  dealerName: string;
  operatorName: string;
  investigationDate: string;
  countingSystem: CountingSystem;
  shoeTotalDecks: number;
  startingShoeNumber: number;
  setupNotes: string;
}
