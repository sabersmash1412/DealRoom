import { buildSellerPrompt } from "./promptBuilder.js";
import { getConcessionStrategy } from "../domain/concessionStrategy.js";
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

export class SellerAgent {
  constructor(private readonly openAiService: OpenAIService) {}

  async generateTurn(input: {
    negotiation: NegotiationBranchView;
    state: StoredNegotiationState;
    feedback?: string[];
  }): Promise<AgentTurnOutput> {
    const prompt = buildSellerPrompt(input);

    return this.openAiService.generateStructuredOutput<AgentTurnOutput>({
      schemaName: "seller_agent_turn",
      schema: agentTurnSchema,
      system: prompt.system,
      user: prompt.user,
      mock: () => this.buildFallbackTurn(input.state),
    });
  }

  private buildFallbackTurn(state: StoredNegotiationState): AgentTurnOutput {
    const strategy = getConcessionStrategy(
      state.snapshot.sellerConfig.strategy,
      state.round,
      state.maxRounds,
    );
    const floor = state.snapshot.sellerConfig.reservationValue.minimumAcceptablePrice;
    const ask = state.snapshot.listing.price;
    const currentBuyerOffer = state.currentOffer?.price ?? 0;

    if (currentBuyerOffer >= ask * strategy.walkAwayThresholdRatio) {
      return {
        action: "accept",
        message: `I accept ${currentBuyerOffer} because it protects the seller floor and closes efficiently.`,
        offerTerms: state.currentOffer ?? null,
        reasoning: [
          "The offer remains above the seller reservation value.",
          "Closing now preserves customer satisfaction without further discounting.",
        ],
        marketReferences: [],
      };
    }

    const gap = Math.max(ask - Math.max(currentBuyerOffer, floor), 0);
    const counterPrice = Math.max(
      floor,
      Math.round(ask - gap * strategy.concessionStepRatio),
    );

    if (counterPrice <= floor && currentBuyerOffer < floor) {
      return {
        action: "walk_away",
        message: `I cannot go below ${floor}, so I am ending the negotiation.`,
        offerTerms: null,
        reasoning: [
          "The buyer offer remains below the seller minimum acceptable price.",
          "Further concessions would violate the seller reservation value.",
        ],
        marketReferences: [],
      };
    }

    return {
      action: "counter",
      message: `I can move to ${counterPrice} because it keeps the deal above the seller floor while maintaining delivery expectations.`,
      offerTerms: {
        price: counterPrice,
        deliveryDays: state.snapshot.seller.deliveryDays,
        returnPolicy: state.snapshot.listing.returnPolicy ?? null,
        notes: ["Seller fallback agent response"],
      },
      reasoning: [
        "The counter-offer protects the seller floor.",
        "The concession size is governed by the seller strategy parameters.",
      ],
      marketReferences: [],
    };
  }
}
