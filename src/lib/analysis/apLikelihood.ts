import type { Investigation } from "@/types/investigation";

export type ApLikelihoodLevel = "low" | "moderate" | "elevated";

export interface ApLikelihood {
  level: ApLikelihoodLevel;
  /** Pearson correlation coefficient, -1..1. */
  correlation: number;
  seatNumber: number | null;
  sampleSize: number;
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let numerator = 0;
  let sumSqX = 0;
  let sumSqY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    numerator += dx * dy;
    sumSqX += dx * dx;
    sumSqY += dy * dy;
  }
  const denominator = Math.sqrt(sumSqX * sumSqY);
  return denominator === 0 ? 0 : numerator / denominator;
}

function levelFor(correlation: number): ApLikelihoodLevel {
  const abs = Math.abs(correlation);
  return abs >= 0.6 ? "elevated" : abs >= 0.3 ? "moderate" : "low";
}

/**
 * A real, computed reference indicator — never hardcoded — of how closely
 * each tracked seat's wager has tracked the true count within the current
 * shoe. This is a statistical correlation between two numbers an operator
 * already recorded (bet size, true count going into that round), nothing
 * more. It is explicitly NOT a conclusion or accusation — see plan.md §0.1
 * and the disclaimer every caller of this data is required to render
 * alongside it.
 */
export function computeApLikelihoodBySeat(
  investigation: Investigation,
  shoeNumber: number
): Record<number, ApLikelihood> {
  const shoeRounds = investigation.rounds
    .filter((r) => r.shoeNumber === shoeNumber)
    .sort((a, b) => a.roundNumber - b.roundNumber);

  const bySeat: Record<number, ApLikelihood> = {};

  for (const seatNumber of investigation.occupiedSeats) {
    const bets: number[] = [];
    const countsGoingIn: number[] = [];
    let priorTrueCount = 0;

    for (const round of shoeRounds) {
      const record = round.seats[seatNumber];
      if (record && record.betAmount != null) {
        bets.push(record.betAmount);
        countsGoingIn.push(priorTrueCount);
      }
      if (round.trueCount != null) priorTrueCount = round.trueCount;
    }

    const correlation = pearson(bets, countsGoingIn);
    bySeat[seatNumber] = {
      level: levelFor(correlation),
      correlation,
      seatNumber,
      sampleSize: bets.length,
    };
  }

  return bySeat;
}

/** The single strongest-correlating tracked seat, for the Count Summary badge. */
export function computeApLikelihood(investigation: Investigation, shoeNumber: number): ApLikelihood {
  const bySeat = computeApLikelihoodBySeat(investigation, shoeNumber);
  let best: ApLikelihood = { level: "low", correlation: 0, seatNumber: null, sampleSize: 0 };

  for (const result of Object.values(bySeat)) {
    if (Math.abs(result.correlation) > Math.abs(best.correlation)) best = result;
  }

  return best;
}
