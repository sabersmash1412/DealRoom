import type { ConcessionStrategyName } from "../../src/shared/negotiation.js";

export interface ConcessionStrategyParameters {
  name: ConcessionStrategyName;
  openingAnchorRatio: number;
  concessionStepRatio: number;
  marketReferenceBias: "low" | "medium" | "high";
  deadlinePressureMultiplier: number;
  walkAwayThresholdRatio: number;
}

export function getConcessionStrategy(
  name: ConcessionStrategyName,
  round: number,
  maxRounds: number,
): ConcessionStrategyParameters {
  const roundPressure = round / Math.max(maxRounds, 1);

  if (name === "aggressive") {
    return {
      name,
      openingAnchorRatio: 0.84,
      concessionStepRatio: 0.04,
      marketReferenceBias: "high",
      deadlinePressureMultiplier: 0.8,
      walkAwayThresholdRatio: 0.96,
    };
  }

  if (name === "time-sensitive") {
    const lateRoundBoost = roundPressure >= 0.65 ? 1.8 : 1;
    return {
      name,
      openingAnchorRatio: 0.9,
      concessionStepRatio: 0.05 * lateRoundBoost,
      marketReferenceBias: "medium",
      deadlinePressureMultiplier: roundPressure >= 0.65 ? 1.5 : 1.1,
      walkAwayThresholdRatio: 1,
    };
  }

  return {
    name: "balanced",
    openingAnchorRatio: 0.92,
    concessionStepRatio: 0.06,
    marketReferenceBias: "medium",
    deadlinePressureMultiplier: 1,
    walkAwayThresholdRatio: 0.99,
  };
}

export function describeConcessionStrategy(
  name: ConcessionStrategyName,
  round: number,
  maxRounds: number,
): string[] {
  const strategy = getConcessionStrategy(name, round, maxRounds);

  return [
    `Opening anchor ratio: ${strategy.openingAnchorRatio.toFixed(2)} of your ceiling/floor reference.`,
    `Concession step ratio: ${strategy.concessionStepRatio.toFixed(2)} per response.`,
    `Market reference bias: ${strategy.marketReferenceBias}.`,
    `Deadline pressure multiplier: ${strategy.deadlinePressureMultiplier.toFixed(2)}.`,
    `Walk-away threshold ratio: ${strategy.walkAwayThresholdRatio.toFixed(2)}.`,
  ];
}
