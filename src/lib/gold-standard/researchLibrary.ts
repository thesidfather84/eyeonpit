import type { VersionedRecord } from "@/lib/versioning/types";
import { generateCanonicalId } from "@/lib/versioning/id";
import type { CountMethodVerificationStatus } from "./countMethodRegistry";

/**
 * PRIORITY B11 — the Research Library model: a record of a CLAIM about a
 * counting/advantage-play method found in the wild (a book, a paper, a
 * video, a forum post, a user submission), independent of whether EyeOnPit
 * has implemented or verified it yet. This is explicitly a research/intake
 * record, not a CountMethodDefinition — a research entry only becomes a
 * real, simulatable CountMethodDefinition once someone builds and validates
 * an actual `tags` table from it (see countMethodRegistry.ts).
 */

export type ResearchSourceType = "book" | "paper" | "video" | "forum" | "article" | "patent" | "user-submission" | "other";
export type ImplementationStatus = "not-started" | "in-progress" | "implemented" | "abandoned";
export type SimulationStatus = "not-simulated" | "simulated" | "inconclusive";

export interface ResearchLibraryEntry extends VersionedRecord {
  sourceType: ResearchSourceType;
  /** Free text — a URL, a book title/edition, a video link, whatever identifies the source. */
  source: string;
  author?: string;
  dateFound: string;
  /** The core claim being made, in the source's own terms (e.g. "reduced volatility via X"). Never rewritten/embellished by EyeOnPit. */
  claim: string;
  /** The formula/method AS DISCLOSED by the source, verbatim or closely paraphrased — never invented or filled in where the source is silent (Priority B4's "do not invent any formulas" applies here too). Omitted (not guessed) when the source doesn't disclose one. */
  disclosedFormula?: string;
  reconstructionNotes?: string;
  implementationStatus: ImplementationStatus;
  verificationStatus: CountMethodVerificationStatus;
  simulationStatus: SimulationStatus;
  /** Free-text summary of simulation findings, if any — never a fabricated number; only populated once a real SimulationResult exists for this method. */
  simulationResultsSummary?: string;
  /** Once implemented, the canonicalId of the resulting CountMethodDefinition — links the research record forward to the real, simulatable method. */
  resultingCountMethodCanonicalId?: string;
  notes?: string;
}

export type CreateResearchLibraryEntryInput = Omit<ResearchLibraryEntry, keyof VersionedRecord>;

export type ResearchEntryValidation = { valid: true } | { valid: false; errors: string[] };

export function validateResearchLibraryEntry(input: CreateResearchLibraryEntryInput): ResearchEntryValidation {
  const errors: string[] = [];
  if (!input.source.trim()) errors.push("Source is required.");
  if (!input.claim.trim()) errors.push("Claim is required.");
  if (!input.dateFound) errors.push("Date found is required.");
  if (input.implementationStatus === "implemented" && !input.resultingCountMethodCanonicalId) {
    errors.push("An 'implemented' entry must reference the resulting CountMethodDefinition's canonicalId.");
  }
  if (input.verificationStatus === "VERIFIED" && input.simulationStatus === "not-simulated") {
    errors.push("A method cannot be VERIFIED without at least having been simulated — see Priority B12.");
  }
  return errors.length > 0 ? { valid: false, errors } : { valid: true };
}

export function buildResearchLibraryEntry(input: CreateResearchLibraryEntryInput): ResearchLibraryEntry {
  const validation = validateResearchLibraryEntry(input);
  if (!validation.valid) throw new Error(`Invalid research library entry: ${validation.errors.join(" ")}`);
  const now = new Date().toISOString();
  return { ...input, id: generateCanonicalId(), version: 1, createdAt: now, updatedAt: now };
}
