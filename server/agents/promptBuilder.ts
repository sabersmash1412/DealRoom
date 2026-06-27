import {
  describeConcessionStrategy,
  getConcessionStrategy,
} from "../domain/concessionStrategy.js";
import type {
  AgentTurnOutput,
  MarketContextSnapshot,
  MediatorDecision,
  NegotiationBranchView,
  StoredNegotiationState,
} from "../../src/shared/negotiation.js";

interface BuildPromptBaseInput {
  negotiation: NegotiationBranchView;
  state: StoredNegotiationState;
  feedback?: string[];
}

function historySummary(negotiation: NegotiationBranchView): string {
  return negotiation.messages
    .map((message) => `${message.actor} (${message.type}): ${message.content}`)
    .join("\n");
}

function marketSummary(marketContext: MarketContextSnapshot | null | undefined): string {
  if (!marketContext) {
    return "No market context is available.";
  }

  return JSON.stringify(marketContext, null, 2);
}

export function buildBuyerPrompt(input: BuildPromptBaseInput): {
  system: string;
  user: string;
} {
  const strategy = getConcessionStrategy(
    input.state.snapshot.buyerProfile.strategy,
    input.state.round,
    input.state.maxRounds,
  );

  const system = [
    "You are the Buyer Agent for Agentic DealRoom.",
    "You are stateless and must decide the next action from the provided state only.",
    "Maximize buyer utility while never violating the buyer maximum budget or seller minimum acceptable price.",
    "Every non-walk-away response must include clear reasoning and offer terms.",
    "If you cite market evidence, only use the supplied market context.",
    "If the buyer profile includes a communication style or persona brief, reflect it consistently in tone without violating any guardrails.",
    ...describeConcessionStrategy(strategy.name, input.state.round, input.state.maxRounds),
  ].join("\n");

  const user = JSON.stringify(
    {
      task: "Produce the next buyer negotiation turn.",
      feedback: input.feedback ?? [],
      buyerProfile: input.state.snapshot.buyerProfile,
      sellerConfig: input.state.snapshot.sellerConfig,
      listing: input.state.snapshot.listing,
      seller: input.state.snapshot.seller,
      round: input.state.round,
      currentOffer: input.state.currentOffer ?? null,
      marketContext: input.negotiation.marketContext ?? null,
      history: historySummary(input.negotiation),
    },
    null,
    2,
  );

  return { system, user };
}

export function buildSellerPrompt(input: BuildPromptBaseInput): {
  system: string;
  user: string;
} {
  const strategy = getConcessionStrategy(
    input.state.snapshot.sellerConfig.strategy,
    input.state.round,
    input.state.maxRounds,
  );

  const system = [
    "You are the Seller Agent for Agentic DealRoom.",
    "You are stateless and must decide the next action from the provided state only.",
    "Maximize seller utility while never violating the seller minimum acceptable price or the buyer maximum budget.",
    "Every non-walk-away response must include clear reasoning and offer terms.",
    "Do not fabricate market information.",
    "If the seller config includes a communication style or persona brief, reflect it consistently in tone without violating any guardrails.",
    ...describeConcessionStrategy(strategy.name, input.state.round, input.state.maxRounds),
  ].join("\n");

  const user = JSON.stringify(
    {
      task: "Produce the next seller negotiation turn.",
      feedback: input.feedback ?? [],
      sellerConfig: input.state.snapshot.sellerConfig,
      buyerProfile: input.state.snapshot.buyerProfile,
      listing: input.state.snapshot.listing,
      seller: input.state.snapshot.seller,
      round: input.state.round,
      currentOffer: input.state.currentOffer ?? null,
      marketContext: input.negotiation.marketContext ?? null,
      history: historySummary(input.negotiation),
    },
    null,
    2,
  );

  return { system, user };
}

export function buildMediatorPrompt(input: {
  negotiation: NegotiationBranchView;
  state: StoredNegotiationState;
  candidateTurn: AgentTurnOutput;
  deterministicViolations: string[];
}): { system: string; user: string } {
  const system = [
    "You are the neutral Mediator Agent for Agentic DealRoom.",
    "You do not negotiate. You validate transparency, truthfulness, explainability, and compliance.",
    "Return a strict JSON decision only.",
  ].join("\n");

  const user = JSON.stringify(
    {
      task: "Review the candidate negotiation turn and return mediator approval.",
      deterministicViolations: input.deterministicViolations,
      candidateTurn: input.candidateTurn,
      marketContext: marketSummary(input.negotiation.marketContext),
      state: input.state,
      history: historySummary(input.negotiation),
    },
    null,
    2,
  );

  return { system, user };
}

export function buildMediatorFallbackDecision(input: {
  deterministicViolations: string[];
}): MediatorDecision {
  const approved = input.deterministicViolations.length === 0;

  return {
    approved,
    explanation: approved
      ? "Deterministic checks passed and no additional mediator concerns were raised."
      : "The candidate turn failed deterministic mediation checks.",
    violations: input.deterministicViolations,
    needsRegeneration: !approved,
  };
}
