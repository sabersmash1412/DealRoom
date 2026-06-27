import type {
  BuyerUtilityWeights,
  MarketContextSnapshot,
  OfferTerms,
  RankedSellerOutcome,
  SellerUtilityWeights,
  SellerAgentConfig,
} from "../../src/shared/negotiation.js";

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function returnPolicyScore(policy: string | null | undefined): number {
  if (!policy) {
    return 0.3;
  }

  const normalized = policy.toLowerCase();
  if (normalized.includes("30")) return 1;
  if (normalized.includes("14")) return 0.8;
  if (normalized.includes("7")) return 0.6;
  if (normalized.includes("no")) return 0.1;
  return 0.5;
}

export function calculateBuyerUtility(input: {
  weights: BuyerUtilityWeights;
  offerTerms: OfferTerms | null;
  marketContext: MarketContextSnapshot | null;
  sellerRating: number;
  sellerDeliveryDays: number;
}): number {
  if (!input.offerTerms) {
    return 0;
  }

  const buyerWeightTotal =
    input.weights.price +
    input.weights.delivery +
    input.weights.reputation +
    input.weights.returns ||
    1;
  const weights: BuyerUtilityWeights = {
    price: input.weights.price / buyerWeightTotal,
    delivery: input.weights.delivery / buyerWeightTotal,
    reputation: input.weights.reputation / buyerWeightTotal,
    returns: input.weights.returns / buyerWeightTotal,
  };
  const referenceHigh = input.marketContext?.highestListing ?? input.offerTerms.price;
  const referenceLow = input.marketContext?.lowestListing ?? input.offerTerms.price;
  const spread = Math.max(referenceHigh - referenceLow, 1);

  const priceScore = clamp(1 - (input.offerTerms.price - referenceLow) / spread);
  const deliveryDays = input.offerTerms.deliveryDays ?? input.sellerDeliveryDays;
  const deliveryScore = clamp(1 - (deliveryDays - 1) / Math.max(input.sellerDeliveryDays, 1));
  const reputationScore = clamp(input.sellerRating / 5);
  const returnsScore = returnPolicyScore(input.offerTerms.returnPolicy);

  return (
    priceScore * weights.price +
    deliveryScore * weights.delivery +
    reputationScore * weights.reputation +
    returnsScore * weights.returns
  );
}

export function calculateSellerUtility(input: {
  weights: SellerUtilityWeights;
  offerTerms: OfferTerms | null;
  minPrice: number;
  askPrice: number;
  inventory: number;
  config: SellerAgentConfig;
}): number {
  if (!input.offerTerms) {
    return 0;
  }

  const sellerWeightTotal =
    input.weights.profitMargin +
    input.weights.inventoryClearance +
    input.weights.customerSatisfaction ||
    1;
  const weights: SellerUtilityWeights = {
    profitMargin: input.weights.profitMargin / sellerWeightTotal,
    inventoryClearance: input.weights.inventoryClearance / sellerWeightTotal,
    customerSatisfaction: input.weights.customerSatisfaction / sellerWeightTotal,
  };
  const marginSpread = Math.max(input.askPrice - input.minPrice, 1);
  const profitMarginScore = clamp((input.offerTerms.price - input.minPrice) / marginSpread);

  const inventoryBias =
    input.config.inventoryPressure === "high"
      ? 1
      : input.config.inventoryPressure === "medium"
        ? 0.7
        : 0.4;
  const inventoryClearanceScore = clamp((Math.min(input.inventory, 20) / 20 + inventoryBias) / 2);

  const deliveryDays = input.offerTerms.deliveryDays ?? 0;
  const satisfactionTarget =
    input.config.customerSatisfactionTarget === "high"
      ? 1
      : input.config.customerSatisfactionTarget === "medium"
        ? 0.75
        : 0.5;
  const customerSatisfactionScore = clamp(
    ((deliveryDays <= 3 ? 1 : 0.6) + satisfactionTarget) / 2,
  );

  return (
    profitMarginScore * weights.profitMargin +
    inventoryClearanceScore * weights.inventoryClearance +
    customerSatisfactionScore * weights.customerSatisfaction
  );
}

export function rankSellerOutcomes(input: {
  outcomes: RankedSellerOutcome[];
}): RankedSellerOutcome[] {
  return [...input.outcomes].sort((left, right) => right.score - left.score);
}
