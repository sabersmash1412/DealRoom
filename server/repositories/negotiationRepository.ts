import { randomUUID } from "node:crypto";
import { Prisma } from "../../src/generated/prisma/client.js";
import type { FinalDeal, Listing, Seller } from "../../src/generated/prisma/client.js";
import type {
  AgentTurnOutput,
  AuditEventView,
  BuyerAgentProfile,
  CampaignView,
  CreateListingRequest,
  CreateNegotiationCampaignRequest,
  FinalDealView,
  MarketContextSnapshot,
  MediatorDecision,
  MarketplaceListingView,
  NegotiationBranchView,
  NegotiationMessageView,
  OfferTerms,
  RankedSellerOutcome,
  SellerAgentConfig,
  StoredNegotiationState,
  UpdateBuyerAgentProfileRequest,
} from "../../src/shared/negotiation.js";
import { prisma } from "../db/prisma.js";
import { calculateBuyerUtility, rankSellerOutcomes } from "../domain/utilityCalculator.js";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toNullableJson(
  value: unknown | null,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

function defaultSellerConfig(seller: Seller): SellerAgentConfig {
  return {
    utilityWeights: {
      profitMargin: 0.6,
      inventoryClearance: 0.25,
      customerSatisfaction: 0.15,
    },
    reservationValue: {
      minimumAcceptablePrice: seller.minPrice,
    },
    strategy: "balanced",
    guardrails: [
      "Do not go below the seller reservation value.",
      "Preserve delivery feasibility.",
    ],
    inventoryPressure: seller.inventory > 10 ? "high" : seller.inventory > 5 ? "medium" : "low",
    customerSatisfactionTarget: "medium",
  };
}

function listingSnapshot(listing: Listing) {
  return {
    listingId: listing.id,
    title: listing.title,
    price: listing.price,
    condition: listing.condition,
    returnPolicy: listing.returnPolicy ?? null,
  };
}

function sellerSnapshot(seller: Seller) {
  return {
    sellerId: seller.id,
    name: seller.name,
    rating: seller.rating,
    inventory: seller.inventory,
    deliveryDays: seller.deliveryDays,
  };
}

function toBuyerAgentProfile(
  userId: string,
  row: {
    displayName: string | null;
    utilityWeights: unknown;
    reservationValue: unknown;
    strategy: string;
    guardrails: unknown;
    preferences: unknown;
  },
): BuyerAgentProfile {
  return {
    userId,
    displayName: row.displayName,
    utilityWeights: row.utilityWeights as BuyerAgentProfile["utilityWeights"],
    reservationValue: row.reservationValue as BuyerAgentProfile["reservationValue"],
    strategy: row.strategy as BuyerAgentProfile["strategy"],
    guardrails: Array.isArray(row.guardrails)
      ? row.guardrails.filter((value): value is string => typeof value === "string")
      : [],
    preferences: asRecord(row.preferences) as BuyerAgentProfile["preferences"],
  };
}

function toStoredState(value: unknown): StoredNegotiationState {
  return value as StoredNegotiationState;
}

function toMarketContext(value: unknown): MarketContextSnapshot | null {
  if (!value) {
    return null;
  }

  return value as MarketContextSnapshot;
}

function toMessageView(row: {
  id: string;
  actor: string;
  type: string;
  content: string;
  offerPrice: number | null;
  metadata: unknown;
  createdAt: Date;
}): NegotiationMessageView {
  return {
    id: row.id,
    actor: row.actor,
    type: row.type,
    content: row.content,
    offerPrice: row.offerPrice,
    metadata: asRecord(row.metadata) ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAuditView(row: {
  id: string;
  actor: string;
  eventType: string;
  metadata: unknown;
  createdAt: Date;
}): AuditEventView {
  return {
    id: row.id,
    actor: row.actor,
    eventType: row.eventType,
    metadata: asRecord(row.metadata) ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toFinalDealView(finalDeal: FinalDeal | null): FinalDealView | null {
  if (!finalDeal) {
    return null;
  }

  return {
    finalPrice: finalDeal.finalPrice,
    originalPrice: finalDeal.originalPrice,
    savings: finalDeal.savings,
    deliveryDate: finalDeal.deliveryDate,
    selectedVariant: finalDeal.selectedVariant,
    verified: finalDeal.verified,
    approved: finalDeal.approved,
    createdAt: finalDeal.createdAt.toISOString(),
  };
}

function scoreOutcome(negotiation: NegotiationBranchView): RankedSellerOutcome {
  const offerTerms =
    negotiation.finalDeal
      ? {
          price: negotiation.finalDeal.finalPrice,
          deliveryDays: negotiation.state.snapshot.seller.deliveryDays,
          returnPolicy: negotiation.state.snapshot.listing.returnPolicy ?? null,
        }
      : negotiation.state.currentOffer ?? null;
  const score = calculateBuyerUtility({
    weights: negotiation.state.snapshot.buyerProfile.utilityWeights,
    offerTerms,
    marketContext: negotiation.marketContext ?? null,
    sellerRating: negotiation.state.snapshot.seller.rating,
    sellerDeliveryDays: negotiation.state.snapshot.seller.deliveryDays,
  });

  return {
    negotiationId: negotiation.id,
    sellerId: negotiation.sellerId,
    score,
    finalTerms: offerTerms,
    rankingExplanation: `Utility score ${score.toFixed(3)} favors this branch based on the buyer's configured weights.`,
    status: negotiation.status,
  };
}

export class NegotiationRepository {
  async createListing(input: CreateListingRequest): Promise<MarketplaceListingView> {
    const created = await prisma.$transaction(async (tx) => {
      const seller = await tx.seller.create({
        data: {
          name: input.seller.name,
          rating: input.seller.rating,
          minPrice: input.seller.minPrice,
          inventory: input.seller.inventory,
          deliveryDays: input.seller.deliveryDays,
        },
      })

      const listing = await tx.listing.create({
        data: {
          title: input.title,
          description: input.description ?? null,
          price: input.price,
          condition: input.condition,
          returnPolicy: input.returnPolicy ?? null,
          sellerId: seller.id,
        },
        include: {
          seller: true,
        },
      })

      return listing
    })

    return {
      id: created.id,
      title: created.title,
      description: created.description,
      price: created.price,
      condition: created.condition,
      returnPolicy: created.returnPolicy,
      sellerId: created.sellerId,
      sellerName: created.seller.name,
      sellerRating: created.seller.rating,
      sellerInventory: created.seller.inventory,
      deliveryDays: created.seller.deliveryDays,
    }
  }

  async listListings(): Promise<MarketplaceListingView[]> {
    const listings = await prisma.listing.findMany({
      include: {
        seller: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return listings.map((listing) => ({
      id: listing.id,
      title: listing.title,
      description: listing.description,
      price: listing.price,
      condition: listing.condition,
      returnPolicy: listing.returnPolicy,
      sellerId: listing.sellerId,
      sellerName: listing.seller.name,
      sellerRating: listing.seller.rating,
      sellerInventory: listing.seller.inventory,
      deliveryDays: listing.seller.deliveryDays,
    }));
  }

  async getBuyerAgentProfile(userId: string): Promise<BuyerAgentProfile | null> {
    const row = await prisma.buyerAgentProfile.findUnique({
      where: { userId },
    });

    if (!row) {
      return null;
    }

    return toBuyerAgentProfile(userId, row);
  }

  async upsertBuyerAgentProfile(
    input: UpdateBuyerAgentProfileRequest,
  ): Promise<BuyerAgentProfile> {
    const row = await prisma.buyerAgentProfile.upsert({
      where: { userId: input.userId },
      update: {
        displayName: input.displayName ?? null,
        utilityWeights: toJson(input.utilityWeights),
        reservationValue: toJson(input.reservationValue),
        strategy: input.strategy,
        guardrails: toJson(input.guardrails),
        preferences: toNullableJson(input.preferences ?? null),
      },
      create: {
        userId: input.userId,
        displayName: input.displayName ?? null,
        utilityWeights: toJson(input.utilityWeights),
        reservationValue: toJson(input.reservationValue),
        strategy: input.strategy,
        guardrails: toJson(input.guardrails),
        preferences: toNullableJson(input.preferences ?? null),
      },
    });

    return toBuyerAgentProfile(input.userId, row);
  }

  async updateSellerAgentConfig(
    sellerId: string,
    config: SellerAgentConfig,
  ): Promise<SellerAgentConfig> {
    await prisma.seller.update({
      where: { id: sellerId },
      data: {
        agentConfig: toJson(config),
        minPrice: config.reservationValue.minimumAcceptablePrice,
      },
    });

    return config;
  }

  async getSellerAgentConfig(sellerId: string): Promise<SellerAgentConfig> {
    const seller = await prisma.seller.findUnique({
      where: { id: sellerId },
    });

    if (!seller) {
      throw new Error(`Seller ${sellerId} was not found.`);
    }

    return (seller.agentConfig as SellerAgentConfig | null) ?? defaultSellerConfig(seller);
  }

  async createCampaign(
    input: CreateNegotiationCampaignRequest,
  ): Promise<{ campaignId: string; negotiationIds: string[] }> {
    const buyerProfile =
      input.buyerProfile ?? (await this.getBuyerAgentProfile(input.buyerUserId));

    if (!buyerProfile) {
      throw new Error("Buyer agent profile was not provided and no saved profile exists.");
    }

    const campaignId = randomUUID();
    const negotiationIds: string[] = [];

    for (const target of input.targets) {
      const listing = await prisma.listing.findUnique({
        where: { id: target.listingId },
        include: { seller: true },
      });

      if (!listing) {
        throw new Error(`Listing ${target.listingId} was not found.`);
      }

      if (listing.sellerId !== target.sellerId) {
        throw new Error(
          `Listing ${target.listingId} does not belong to seller ${target.sellerId}.`,
        );
      }

      const sellerConfig =
        (listing.seller.agentConfig as SellerAgentConfig | null) ??
        defaultSellerConfig(listing.seller);

      const engineState: StoredNegotiationState = {
        campaignId,
        round: 1,
        turnCount: 0,
        currentActor: "buyer",
        status: "queued",
        retryCounts: { buyer: 0, seller: 0 },
        selectedSellerId: null,
        terminalReason: undefined,
        currentOffer: null,
        lastMediatorDecision: null,
        autoApprove: input.autoApprove ?? false,
        maxRounds: 8,
        snapshot: {
          buyerProfile,
          sellerConfig,
          listing: listingSnapshot(listing),
          seller: sellerSnapshot(listing.seller),
        },
      };

      const negotiation = await prisma.negotiation.create({
        data: {
          campaignId,
          listingId: listing.id,
          sellerId: listing.sellerId,
          buyerBudget: buyerProfile.reservationValue.maximumBudget,
          deliveryDeadline: target.deliveryDeadline ?? null,
          preferredVariant: target.preferredVariant ?? null,
          negotiationStyle: buyerProfile.strategy,
          priority: input.priority,
          status: "queued",
          marketContext: Prisma.JsonNull,
          engineState: toJson(engineState),
        },
      });

      negotiationIds.push(negotiation.id);

      await prisma.auditEvent.create({
        data: {
          negotiationId: negotiation.id,
          actor: "system",
          eventType: "campaign_created",
          metadata: {
            campaignId,
            buyerUserId: buyerProfile.userId,
          },
        },
      });
    }

    return { campaignId, negotiationIds };
  }

  async getNegotiationBranch(id: string): Promise<NegotiationBranchView | null> {
    const negotiation = await prisma.negotiation.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        auditEvents: { orderBy: { createdAt: "asc" } },
        finalDeal: true,
      },
    });

    if (!negotiation) {
      return null;
    }

    return {
      id: negotiation.id,
      campaignId: negotiation.campaignId,
      listingId: negotiation.listingId,
      sellerId: negotiation.sellerId,
      buyerBudget: negotiation.buyerBudget,
      deliveryDeadline: negotiation.deliveryDeadline,
      preferredVariant: negotiation.preferredVariant,
      negotiationStyle: negotiation.negotiationStyle,
      priority: negotiation.priority,
      status: negotiation.status as NegotiationBranchView["status"],
      marketContext: toMarketContext(negotiation.marketContext),
      state: toStoredState(negotiation.engineState),
      messages: negotiation.messages.map(toMessageView),
      auditEvents: negotiation.auditEvents.map(toAuditView),
      finalDeal: toFinalDealView(negotiation.finalDeal),
    };
  }

  async getCampaign(campaignId: string): Promise<CampaignView> {
    const negotiations = await prisma.negotiation.findMany({
      where: { campaignId },
      orderBy: { createdAt: "asc" },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        auditEvents: { orderBy: { createdAt: "asc" } },
        finalDeal: true,
      },
    });

    const views = negotiations.map((negotiation) => ({
      id: negotiation.id,
      campaignId: negotiation.campaignId,
      listingId: negotiation.listingId,
      sellerId: negotiation.sellerId,
      buyerBudget: negotiation.buyerBudget,
      deliveryDeadline: negotiation.deliveryDeadline,
      preferredVariant: negotiation.preferredVariant,
      negotiationStyle: negotiation.negotiationStyle,
      priority: negotiation.priority,
      status: negotiation.status as NegotiationBranchView["status"],
      marketContext: toMarketContext(negotiation.marketContext),
      state: toStoredState(negotiation.engineState),
      messages: negotiation.messages.map(toMessageView),
      auditEvents: negotiation.auditEvents.map(toAuditView),
      finalDeal: toFinalDealView(negotiation.finalDeal),
    }));

    return {
      campaignId,
      negotiations: views,
      rankedOutcomes: rankSellerOutcomes({
        outcomes: views.map(scoreOutcome),
      }),
    };
  }

  async listNegotiationBranches(): Promise<NegotiationBranchView[]> {
    const negotiations = await prisma.negotiation.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        auditEvents: { orderBy: { createdAt: "asc" } },
        finalDeal: true,
      },
    });

    return negotiations.map((negotiation) => ({
      id: negotiation.id,
      campaignId: negotiation.campaignId,
      listingId: negotiation.listingId,
      sellerId: negotiation.sellerId,
      buyerBudget: negotiation.buyerBudget,
      deliveryDeadline: negotiation.deliveryDeadline,
      preferredVariant: negotiation.preferredVariant,
      negotiationStyle: negotiation.negotiationStyle,
      priority: negotiation.priority,
      status: negotiation.status as NegotiationBranchView["status"],
      marketContext: toMarketContext(negotiation.marketContext),
      state: toStoredState(negotiation.engineState),
      messages: negotiation.messages.map(toMessageView),
      auditEvents: negotiation.auditEvents.map(toAuditView),
      finalDeal: toFinalDealView(negotiation.finalDeal),
    }))
  }

  async saveMarketContext(
    negotiationId: string,
    marketContext: MarketContextSnapshot,
  ): Promise<void> {
    await prisma.negotiation.update({
      where: { id: negotiationId },
      data: { marketContext: toJson(marketContext) },
    });
  }

  async updateNegotiationState(
    negotiationId: string,
    state: StoredNegotiationState,
    status: string,
  ): Promise<void> {
    await prisma.negotiation.update({
      where: { id: negotiationId },
      data: {
        engineState: toJson(state),
        status,
      },
    });
  }

  async recordAuditEvent(input: {
    negotiationId: string;
    actor: string;
    eventType: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await prisma.auditEvent.create({
      data: {
        negotiationId: input.negotiationId,
        actor: input.actor,
        eventType: input.eventType,
        metadata: toNullableJson(input.metadata ?? null),
      },
    });
  }

  async recordApprovedTurn(input: {
    negotiationId: string;
    actor: "buyer" | "seller";
    turn: AgentTurnOutput;
    mediatorDecision: MediatorDecision;
    state: StoredNegotiationState;
    status: string;
  }): Promise<void> {
    await prisma.$transaction([
      prisma.negotiationMessage.create({
        data: {
          negotiationId: input.negotiationId,
          actor: `${input.actor}_agent`,
          type: input.turn.action,
          content: input.turn.message,
          offerPrice: input.turn.offerTerms?.price ?? null,
          metadata: toJson({
            offerTerms: input.turn.offerTerms,
            reasoning: input.turn.reasoning,
            marketReferences: input.turn.marketReferences,
            round: input.state.round,
          }),
        },
      }),
      prisma.auditEvent.create({
        data: {
          negotiationId: input.negotiationId,
          actor: "mediator",
          eventType: "turn_approved",
          metadata: toJson({
            explanation: input.mediatorDecision.explanation,
            violations: input.mediatorDecision.violations,
            needsRegeneration: input.mediatorDecision.needsRegeneration,
          }),
        },
      }),
      prisma.negotiation.update({
        where: { id: input.negotiationId },
        data: {
          engineState: toJson(input.state),
          status: input.status,
        },
      }),
    ]);
  }

  async upsertFinalDeal(input: {
    negotiationId: string;
    finalTerms: OfferTerms;
    originalPrice: number;
    deliveryDate?: string | null;
    selectedVariant?: string | null;
    approved: boolean;
  }): Promise<void> {
    await prisma.finalDeal.upsert({
      where: { negotiationId: input.negotiationId },
      update: {
        finalPrice: input.finalTerms.price,
        originalPrice: input.originalPrice,
        savings: Math.max(0, input.originalPrice - input.finalTerms.price),
        deliveryDate: input.deliveryDate ?? null,
        selectedVariant: input.selectedVariant ?? null,
        verified: true,
        approved: input.approved,
      },
      create: {
        negotiationId: input.negotiationId,
        finalPrice: input.finalTerms.price,
        originalPrice: input.originalPrice,
        savings: Math.max(0, input.originalPrice - input.finalTerms.price),
        deliveryDate: input.deliveryDate ?? null,
        selectedVariant: input.selectedVariant ?? null,
        verified: true,
        approved: input.approved,
      },
    });
  }

  async approveFinalDeal(negotiationId: string): Promise<NegotiationBranchView | null> {
    const negotiation = await this.getNegotiationBranch(negotiationId);
    if (!negotiation?.finalDeal) {
      return null;
    }

    await prisma.$transaction([
      prisma.finalDeal.update({
        where: { negotiationId },
        data: { approved: true },
      }),
      prisma.negotiation.update({
        where: { id: negotiationId },
        data: { status: "approved" },
      }),
      prisma.auditEvent.create({
        data: {
          negotiationId,
          actor: "system",
          eventType: "final_deal_approved",
          metadata: Prisma.JsonNull,
        },
      }),
    ]);

    return this.getNegotiationBranch(negotiationId);
  }

  async setSelectedSellerForCampaign(
    campaignId: string,
    sellerId: string,
  ): Promise<void> {
    const negotiations = await prisma.negotiation.findMany({
      where: { campaignId },
      select: {
        id: true,
        engineState: true,
        status: true,
      },
    });

    await Promise.all(
      negotiations.map((negotiation) =>
        this.updateNegotiationState(
          negotiation.id,
          {
            ...toStoredState(negotiation.engineState),
            selectedSellerId: sellerId,
          },
          negotiation.status,
        ),
      ),
    );
  }
}
