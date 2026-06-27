import type {
  AgentTurnOutput,
  MediatorDecision,
  NegotiationBranchStatus,
  NegotiationTerminalReason,
  StoredNegotiationState,
} from "../../src/shared/negotiation.js";
import { BuyerAgent } from "../agents/buyerAgent.js";
import { MediatorAgent } from "../agents/mediatorAgent.js";
import { SellerAgent } from "../agents/sellerAgent.js";
import { validateOfferAgainstReservations } from "./reservationValidator.js";
import { ExaService } from "../services/exaService.js";
import { NegotiationRepository } from "../repositories/negotiationRepository.js";
import { NegotiationEventBus } from "../services/eventBus.js";

const MAX_REGENERATIONS = 2;

function deriveTerminalStatus(input: {
  action: AgentTurnOutput["action"];
  actor: "buyer" | "seller";
}): {
  status: NegotiationBranchStatus;
  terminalReason?: NegotiationTerminalReason;
} {
  if (input.action === "accept") {
    return {
      status: "agreement_reached",
      terminalReason: "agreement",
    };
  }

  if (input.action === "walk_away") {
    return {
      status: "walked_away",
      terminalReason: input.actor === "buyer" ? "buyer_walked_away" : "seller_walked_away",
    };
  }

  return { status: "active" };
}

export class NegotiationEngine {
  private readonly activeCampaigns = new Set<string>();

  constructor(
    private readonly repository: NegotiationRepository,
    private readonly buyerAgent: BuyerAgent,
    private readonly sellerAgent: SellerAgent,
    private readonly mediatorAgent: MediatorAgent,
    private readonly exaService: ExaService,
    private readonly eventBus: NegotiationEventBus,
  ) {}

  startCampaign(campaignId: string): void {
    if (this.activeCampaigns.has(campaignId)) {
      return;
    }

    this.activeCampaigns.add(campaignId);

    void (async () => {
      try {
        const campaign = await this.repository.getCampaign(campaignId);
        await Promise.all(
          campaign.negotiations.map((negotiation) => this.runBranch(negotiation.id)),
        );

        const refreshedCampaign = await this.repository.getCampaign(campaignId);
        const winningOutcome = refreshedCampaign.rankedOutcomes[0];
        if (winningOutcome) {
          await this.repository.setSelectedSellerForCampaign(campaignId, winningOutcome.sellerId);
        }
      } finally {
        this.activeCampaigns.delete(campaignId);
      }
    })();
  }

  private async runBranch(negotiationId: string): Promise<void> {
    let negotiation = await this.repository.getNegotiationBranch(negotiationId);
    if (!negotiation) {
      return;
    }

    let state = negotiation.state;

    if (!negotiation.marketContext) {
      const marketContext = await this.exaService.fetchMarketContext({
        title: state.snapshot.listing.title,
        condition: state.snapshot.listing.condition,
        listingPrice: state.snapshot.listing.price,
      });
      await this.repository.saveMarketContext(negotiationId, marketContext);
      negotiation = await this.repository.getNegotiationBranch(negotiationId);
      if (!negotiation) {
        return;
      }
      this.eventBus.publish(negotiationId, {
        type: "state",
        data: { state: negotiation.state, marketContext },
      });
    }

    if (state.status === "queued") {
      state = { ...state, status: "active" };
      await this.repository.updateNegotiationState(negotiationId, state, "active");
    }

    while (true) {
      negotiation = await this.repository.getNegotiationBranch(negotiationId);
      if (!negotiation) {
        return;
      }

      state = negotiation.state;

      if (state.status !== "active" && state.status !== "queued") {
        this.eventBus.publish(negotiationId, {
          type: "completed",
          data: { state },
        });
        return;
      }

      if (state.round > state.maxRounds) {
        const terminalState: StoredNegotiationState = {
          ...state,
          status: "max_rounds_reached",
          terminalReason: "max_rounds",
        };
        await this.repository.updateNegotiationState(
          negotiationId,
          terminalState,
          "max_rounds_reached",
        );
        await this.repository.recordAuditEvent({
          negotiationId,
          actor: "system",
          eventType: "max_rounds_reached",
          metadata: { maxRounds: state.maxRounds },
        });
        this.eventBus.publish(negotiationId, {
          type: "completed",
          data: { state: terminalState },
        });
        return;
      }

      const actor = state.currentActor;
      const approvedTurn = await this.generateApprovedTurn(negotiationId, actor);

      if (!approvedTurn) {
        const blockedState: StoredNegotiationState = {
          ...state,
          status: "blocked",
          terminalReason: "mediator_blocked",
        };
        await this.repository.updateNegotiationState(negotiationId, blockedState, "blocked");
        await this.repository.recordAuditEvent({
          negotiationId,
          actor: "mediator",
          eventType: "turn_regeneration_exhausted",
          metadata: { actor },
        });
        this.eventBus.publish(negotiationId, {
          type: "completed",
          data: { state: blockedState },
        });
        return;
      }

      const { turn, mediatorDecision } = approvedTurn;
      const terminal = deriveTerminalStatus({ action: turn.action, actor });
      const nextState: StoredNegotiationState = {
        ...state,
        turnCount: state.turnCount + 1,
        round: actor === "seller" ? state.round + 1 : state.round,
        currentActor: actor === "buyer" ? "seller" : "buyer",
        currentOffer: turn.offerTerms ?? state.currentOffer,
        lastMediatorDecision: mediatorDecision,
        status: terminal.status,
        terminalReason: terminal.terminalReason,
      };

      await this.repository.recordApprovedTurn({
        negotiationId,
        actor,
        turn,
        mediatorDecision,
        state: nextState,
        status: terminal.status,
      });

      if (terminal.status === "agreement_reached" && nextState.currentOffer) {
        await this.repository.upsertFinalDeal({
          negotiationId,
          finalTerms: nextState.currentOffer,
          originalPrice: nextState.snapshot.listing.price,
          deliveryDate: negotiation.deliveryDeadline ?? null,
          selectedVariant: negotiation.preferredVariant ?? null,
          approved: nextState.autoApprove,
        });
      }

      const updatedBranch = await this.repository.getNegotiationBranch(negotiationId);
      if (!updatedBranch) {
        return;
      }

      const latestMessage = updatedBranch.messages.at(-1);
      const latestAudit = updatedBranch.auditEvents.at(-1);

      if (latestMessage) {
        this.eventBus.publish(negotiationId, {
          type: "message",
          data: { message: latestMessage },
        });
      }

      if (latestAudit) {
        this.eventBus.publish(negotiationId, {
          type: "audit",
          data: { auditEvent: latestAudit },
        });
      }

      this.eventBus.publish(negotiationId, {
        type: terminal.status === "active" ? "state" : "completed",
        data: {
          state: updatedBranch.state,
          status: updatedBranch.status,
          finalDeal: updatedBranch.finalDeal,
        },
      });

      if (terminal.status !== "active") {
        return;
      }
    }
  }

  private async generateApprovedTurn(
    negotiationId: string,
    actor: "buyer" | "seller",
  ): Promise<{ turn: AgentTurnOutput; mediatorDecision: MediatorDecision } | null> {
    let feedback: string[] | undefined;

    for (let attempt = 0; attempt <= MAX_REGENERATIONS; attempt += 1) {
      const negotiation = await this.repository.getNegotiationBranch(negotiationId);
      if (!negotiation) {
        return null;
      }

      const state = negotiation.state;
      const turn =
        actor === "buyer"
          ? await this.buyerAgent.generateTurn({ negotiation, state, feedback })
          : await this.sellerAgent.generateTurn({ negotiation, state, feedback });

      const reservationResult = validateOfferAgainstReservations({
        actor,
        turn,
        buyerReservationValue: state.snapshot.buyerProfile.reservationValue,
        sellerReservationValue: state.snapshot.sellerConfig.reservationValue,
      });

      const mediatorDecision = await this.mediatorAgent.validateTurn({
        negotiation,
        state,
        candidateTurn: turn,
        reservationViolations: reservationResult.violations,
      });

      if (mediatorDecision.approved && reservationResult.valid) {
        return { turn, mediatorDecision };
      }

      feedback = mediatorDecision.violations;
      const retryState: StoredNegotiationState = {
        ...state,
        retryCounts: {
          ...state.retryCounts,
          [actor]: state.retryCounts[actor] + 1,
        },
        lastMediatorDecision: mediatorDecision,
      };

      await this.repository.updateNegotiationState(negotiationId, retryState, negotiation.status);
      await this.repository.recordAuditEvent({
        negotiationId,
        actor: "mediator",
        eventType: "turn_rejected",
        metadata: {
          forActor: actor,
          attempt,
          violations: mediatorDecision.violations,
        },
      });

      this.eventBus.publish(negotiationId, {
        type: "state",
        data: { state: retryState, violations: mediatorDecision.violations },
      });
    }

    return null;
  }
}
