import {
  buildMediatorFallbackDecision,
  buildMediatorPrompt,
} from "./promptBuilder.js";
import type {
  AgentTurnOutput,
  MediatorDecision,
  NegotiationBranchView,
  StoredNegotiationState,
} from "../../src/shared/negotiation.js";
import { OpenAIService } from "../services/openaiService.js";

const mediatorSchema = {
  type: "object",
  additionalProperties: false,
  required: ["approved", "explanation", "violations", "needsRegeneration"],
  properties: {
    approved: { type: "boolean" },
    explanation: { type: "string" },
    violations: {
      type: "array",
      items: { type: "string" },
    },
    needsRegeneration: { type: "boolean" },
  },
} as const;

function verifyMarketReferences(
  negotiation: NegotiationBranchView,
  candidateTurn: AgentTurnOutput,
): string[] {
  const violations: string[] = [];
  const marketContext = negotiation.marketContext;

  if (!marketContext) {
    return candidateTurn.marketReferences.length > 0
      ? ["Market references were supplied without any cached market context."]
      : [];
  }

  for (const reference of candidateTurn.marketReferences) {
    if (
      reference.kind === "average_price" &&
      reference.value !== marketContext.averagePrice
    ) {
      violations.push("Average market price reference does not match the cached Exa result.");
    }

    if (
      reference.kind === "lowest_listing" &&
      reference.value !== marketContext.lowestListing
    ) {
      violations.push("Lowest listing reference does not match the cached Exa result.");
    }

    if (
      reference.kind === "highest_listing" &&
      reference.value !== marketContext.highestListing
    ) {
      violations.push("Highest listing reference does not match the cached Exa result.");
    }

    if (
      reference.kind === "comparable" &&
      !marketContext.comparableListings.some((entry) => entry.price === reference.value)
    ) {
      violations.push("Comparable listing reference does not match cached market evidence.");
    }
  }

  return violations;
}

function deterministicMediatorViolations(
  negotiation: NegotiationBranchView,
  candidateTurn: AgentTurnOutput,
  reservationViolations: string[],
): string[] {
  const violations = [...reservationViolations];

  if (candidateTurn.action !== "walk_away") {
    if (!candidateTurn.offerTerms) {
      violations.push("Offer-bearing actions must include offer terms.");
    }

    if (candidateTurn.reasoning.length === 0) {
      violations.push("Every counter-offer must include reasoning.");
    }

    if (candidateTurn.message.trim().length < 24) {
      violations.push("Offer explanations are too terse for transparency requirements.");
    }
  }

  return [...violations, ...verifyMarketReferences(negotiation, candidateTurn)];
}

export class MediatorAgent {
  constructor(private readonly openAiService: OpenAIService) {}

  async validateTurn(input: {
    negotiation: NegotiationBranchView;
    state: StoredNegotiationState;
    candidateTurn: AgentTurnOutput;
    reservationViolations: string[];
  }): Promise<MediatorDecision> {
    const deterministicViolations = deterministicMediatorViolations(
      input.negotiation,
      input.candidateTurn,
      input.reservationViolations,
    );

    if (!this.openAiService) {
      return buildMediatorFallbackDecision({ deterministicViolations });
    }

    const prompt = buildMediatorPrompt({
      negotiation: input.negotiation,
      state: input.state,
      candidateTurn: input.candidateTurn,
      deterministicViolations,
    });

    const llmDecision = await this.openAiService.generateStructuredOutput<MediatorDecision>({
      schemaName: "mediator_decision",
      schema: mediatorSchema,
      system: prompt.system,
      user: prompt.user,
      mock: () => buildMediatorFallbackDecision({ deterministicViolations }),
      maxOutputTokens: 500,
    });

    if (deterministicViolations.length === 0) {
      return llmDecision;
    }

    return {
      approved: false,
      explanation: llmDecision.explanation,
      violations: Array.from(new Set([...deterministicViolations, ...llmDecision.violations])),
      needsRegeneration: true,
    };
  }
}
