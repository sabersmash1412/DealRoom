import {
  buildBuyerPrompt,
} from "./promptBuilder.js";
import {
  getConcessionStrategy,
} from "../domain/concessionStrategy.js";
import type {
  AgentTurnOutput,
  NegotiationBranchView,
  StoredNegotiationState,
} from "../../src/shared/negotiation.js";
import { OpenAIService } from "../services/openaiService.js";

const agentTurnSchema = {
  type: "object",
  additionalProperties: false,
  required: ["action", "message", "offerTerms", "reasoning", "marketReferences"],
  properties: {
    action: { type: "string", enum: ["offer", "counter", "accept", "walk_away"] },
    message: { type: "string" },
    offerTerms: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["price", "deliveryDays", "returnPolicy", "notes"],
      properties: {
        price: { type: "number" },
        deliveryDays: { type: ["number", "null"] },
        returnPolicy: { type: ["string", "null"] },
        notes: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
    reasoning: {
      type: "array",
      items: { type: "string" },
    },
    marketReferences: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "value", "sourceLabel"],
        properties: {
          kind: {
            type: "string",
            enum: ["average_price", "lowest_listing", "highest_listing", "comparable"],
          },
          value: { type: "number" },
          sourceLabel: { type: "string" },
        },
      },
    },
  },
} as const;

export class BuyerAgent {
  constructor(private readonly openAiService: OpenAIService) {}

  async generateTurn(input: {
    negotiation: NegotiationBranchView;
    state: StoredNegotiationState;
    feedback?: string[];
  }): Promise<AgentTurnOutput> {
    const prompt = buildBuyerPrompt(input);

    return this.openAiService.generateStructuredOutput<AgentTurnOutput>({
      schemaName: "buyer_agent_turn",
      schema: agentTurnSchema,
      system: prompt.system,
      user: prompt.user,
      mock: () => this.buildFallbackTurn(input.negotiation, input.state),
    });
  }

  private buildFallbackTurn(
    negotiation: NegotiationBranchView,
    state: StoredNegotiationState,
  ): AgentTurnOutput {
    const strategy = getConcessionStrategy(
      state.snapshot.buyerProfile.strategy,
      state.round,
      state.maxRounds,
    );
    const marketAverage = negotiation.marketContext?.averagePrice ?? state.snapshot.listing.price;
    const hardCap = state.snapshot.buyerProfile.reservationValue.maximumBudget;
    const targetPrice = state.snapshot.buyerProfile.preferences?.targetPrice ?? marketAverage;
    const lastPrice = state.currentOffer?.price ?? state.snapshot.listing.price;
    const idealOpening = Math.round(
      Math.min(targetPrice, marketAverage, hardCap) * strategy.openingAnchorRatio,
    );

    const candidatePrice =
      state.turnCount === 0
        ? idealOpening
        : Math.round(
            Math.min(
              hardCap,
              lastPrice + (hardCap - lastPrice) * strategy.concessionStepRatio,
            ),
          );

    if (state.currentOffer && state.currentOffer.price <= hardCap * strategy.walkAwayThresholdRatio) {
      return {
        action: "accept",
        message: `I accept ${state.currentOffer.price} because it stays within my budget and aligns with the market range.`,
        offerTerms: state.currentOffer,
        reasoning: [
          "The current offer remains within the buyer hard cap.",
          "The offer is close enough to the market average to justify closing.",
        ],
        marketReferences: negotiation.marketContext
          ? [
              {
                kind: "average_price",
                value: negotiation.marketContext.averagePrice,
                sourceLabel: "Cached Exa market average",
              },
            ]
          : [],
      };
    }

    return {
      action: state.turnCount === 0 ? "offer" : "counter",
      message: `I'm offering ${candidatePrice} because comparable listings center around ${marketAverage}, and this keeps the deal grounded in current market evidence.`,
      offerTerms: {
        price: Math.min(candidatePrice, hardCap),
        deliveryDays:
          state.snapshot.buyerProfile.preferences?.maxDeliveryDays ?? state.snapshot.seller.deliveryDays,
        returnPolicy:
          state.snapshot.buyerProfile.preferences?.preferredReturnPolicy ??
          state.snapshot.listing.returnPolicy ??
          null,
        notes: ["Buyer fallback agent response"],
      },
      reasoning: [
        "The offer follows the buyer utility weighting toward price efficiency.",
        "The concession step is derived from the configured buyer strategy.",
      ],
      marketReferences: negotiation.marketContext
        ? [
            {
              kind: "average_price",
              value: negotiation.marketContext.averagePrice,
              sourceLabel: "Cached Exa market average",
            },
          ]
        : [],
    };
  }
}
