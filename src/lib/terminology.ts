export type TerminologyLevel = "standard" | "casino" | "casinoProfessional";

export interface TerminologyDictionary {
  dashboard: string;
  session: string;
  liveSession: string;
  completeRound: string;
  resetShoe: string;
  dealerCard: string;
  secondDealerCard: string;
  playerPosition: string;
  currentPlayer: string;
  bet: string;
  currentBet: string;
  baseBet: string;
  notes: string;
  history: string;
  report: string;
  export: string;
}

/** Generic software terms — no casino-floor vocabulary at all. */
const STANDARD: TerminologyDictionary = {
  dashboard: "Dashboard",
  session: "Session",
  liveSession: "Live Session",
  completeRound: "Complete Round",
  resetShoe: "Reset Shoe",
  dealerCard: "Dealer Card",
  secondDealerCard: "Second Dealer Card",
  playerPosition: "Player Position",
  currentPlayer: "Current Player",
  bet: "Bet",
  currentBet: "Current Bet",
  baseBet: "Base Bet",
  notes: "Notes",
  history: "History",
  report: "Report",
  export: "Export",
};

/** Casino-floor terms for what the operator is directly doing at the table — the back-office/reporting vocabulary stays generic. */
const CASINO: TerminologyDictionary = {
  ...STANDARD,
  completeRound: "Next Hand",
  resetShoe: "New Shoe",
  dealerCard: "Dealer Up Card",
  secondDealerCard: "Dealer Hole Card",
  playerPosition: "Seat",
  currentPlayer: "Selected Seat",
  bet: "Wager",
  currentBet: "Current Wager",
  baseBet: "Starting Wager",
};

/** Full surveillance/regulatory vocabulary — everything Casino has, plus the investigation/back-office terms. Default level: this is professional surveillance software first. */
const CASINO_PROFESSIONAL: TerminologyDictionary = {
  ...CASINO,
  dashboard: "Table View",
  session: "Investigation",
  liveSession: "Live Table",
  notes: "Observation Notes",
  history: "Hand History",
  report: "Investigation Summary",
  export: "Export Investigation",
};

export const TERMINOLOGY: Record<TerminologyLevel, TerminologyDictionary> = {
  standard: STANDARD,
  casino: CASINO,
  casinoProfessional: CASINO_PROFESSIONAL,
};
