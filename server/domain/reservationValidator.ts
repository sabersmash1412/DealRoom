import type {
  AgentRole,
  AgentTurnOutput,
  BuyerReservationValue,
  SellerReservationValue,
} from "../../src/shared/negotiation.js";

export interface ReservationValidationResult {
  valid: boolean;
  violations: string[];
}

export function validateOfferAgainstReservations(input: {
  actor: Exclude<AgentRole, "mediator">;
  turn: AgentTurnOutput;
  buyerReservationValue: BuyerReservationValue;
  sellerReservationValue: SellerReservationValue;
}): ReservationValidationResult {
  const { actor, turn, buyerReservationValue, sellerReservationValue } = input;
  const violations: string[] = [];

  if (turn.action === "walk_away") {
    return { valid: true, violations };
  }

  if (!turn.offerTerms) {
    violations.push("Offer-bearing actions must include offer terms.");
    return { valid: false, violations };
  }

  if (turn.offerTerms.price > buyerReservationValue.maximumBudget) {
    violations.push(
      `Offer price ${turn.offerTerms.price} exceeds buyer budget ${buyerReservationValue.maximumBudget}.`,
    );
  }

  if (turn.offerTerms.price < sellerReservationValue.minimumAcceptablePrice) {
    violations.push(
      `Offer price ${turn.offerTerms.price} is below seller minimum ${sellerReservationValue.minimumAcceptablePrice}.`,
    );
  }

  if (actor === "buyer" && turn.offerTerms.price > buyerReservationValue.maximumBudget) {
    violations.push("Buyer turn violated the buyer hard cap.");
  }

  if (actor === "seller" && turn.offerTerms.price < sellerReservationValue.minimumAcceptablePrice) {
    violations.push("Seller turn violated the seller hard floor.");
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
