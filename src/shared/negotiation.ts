export type AgentRole = "buyer" | "seller" | "mediator";

export type ConcessionStrategyName =
  | "aggressive"
  | "balanced"
  | "time-sensitive";

export type NegotiationBranchStatus =
  | "queued"
  | "active"
  | "agreement_reached"
  | "reservation_blocked"
  | "walked_away"
  | "max_rounds_reached"
  | "blocked"
  | "approved";

export type NegotiationTerminalReason =
  | "agreement"
  | "buyer_walked_away"
  | "seller_walked_away"
  | "reservation_blocked"
  | "max_rounds"
  | "mediator_blocked";

export type InventoryPressure = "low" | "medium" | "high";
export type CustomerSatisfactionTarget = "low" | "medium" | "high";

export interface BuyerUtilityWeights {
  price: number;
  delivery: number;
  reputation: number;
  returns: number;
}

export interface SellerUtilityWeights {
  profitMargin: number;
  inventoryClearance: number;
  customerSatisfaction: number;
}

export interface BuyerReservationValue {
  maximumBudget: number;
}

export interface SellerReservationValue {
  minimumAcceptablePrice: number;
}

export interface BuyerPreferences {
  targetPrice?: number;
  maxDeliveryDays?: number;
  minimumSellerRating?: number;
  preferredReturnPolicy?: string;
}

export interface BuyerAgentProfile {
  userId: string;
  displayName?: string | null;
  utilityWeights: BuyerUtilityWeights;
  reservationValue: BuyerReservationValue;
  strategy: ConcessionStrategyName;
  guardrails: string[];
  preferences?: BuyerPreferences;
}

export interface SellerAgentConfig {
  utilityWeights: SellerUtilityWeights;
  reservationValue: SellerReservationValue;
  strategy: ConcessionStrategyName;
  guardrails: string[];
  inventoryPressure?: InventoryPressure;
  customerSatisfactionTarget?: CustomerSatisfactionTarget;
}

export interface ComparableListing {
  title: string;
  price: number;
  url?: string | null;
  source?: string | null;
}

export interface MarketContextSnapshot {
  query: string;
  averagePrice: number;
  lowestListing: number;
  highestListing: number;
  comparableListings: ComparableListing[];
  generatedAt: string;
  source: "exa" | "fallback";
}

export interface MarketReference {
  kind: "average_price" | "lowest_listing" | "highest_listing" | "comparable";
  value: number;
  sourceLabel: string;
}

export interface OfferTerms {
  price: number;
  deliveryDays?: number | null;
  returnPolicy?: string | null;
  notes?: string[];
}

export interface AgentTurnOutput {
  action: "offer" | "counter" | "accept" | "walk_away";
  message: string;
  offerTerms: OfferTerms | null;
  reasoning: string[];
  marketReferences: MarketReference[];
}

export interface MediatorDecision {
  approved: boolean;
  explanation: string;
  violations: string[];
  needsRegeneration: boolean;
}

export interface ListingSnapshot {
  listingId: string;
  title: string;
  price: number;
  condition: string;
  returnPolicy?: string | null;
}

export interface SellerSnapshot {
  sellerId: string;
  name: string;
  rating: number;
  inventory: number;
  deliveryDays: number;
}

export interface NegotiationSnapshot {
  buyerProfile: BuyerAgentProfile;
  sellerConfig: SellerAgentConfig;
  listing: ListingSnapshot;
  seller: SellerSnapshot;
}

export interface NegotiationState {
  campaignId: string;
  round: number;
  turnCount: number;
  currentActor: Exclude<AgentRole, "mediator">;
  status: NegotiationBranchStatus;
  retryCounts: Record<Exclude<AgentRole, "mediator">, number>;
  selectedSellerId?: string | null;
  terminalReason?: NegotiationTerminalReason;
  currentOffer?: OfferTerms | null;
  lastMediatorDecision?: MediatorDecision | null;
}

export interface StoredNegotiationState extends NegotiationState {
  autoApprove: boolean;
  maxRounds: number;
  snapshot: NegotiationSnapshot;
}

export interface RankedSellerOutcome {
  negotiationId: string;
  sellerId: string;
  score: number;
  finalTerms: OfferTerms | null;
  rankingExplanation: string;
  status: NegotiationBranchStatus;
}

export interface NegotiationTargetInput {
  listingId: string;
  sellerId: string;
  deliveryDeadline?: string | null;
  preferredVariant?: string | null;
}

export interface MarketplaceListingView {
  id: string;
  title: string;
  description?: string | null;
  price: number;
  condition: string;
  returnPolicy?: string | null;
  sellerId: string;
  sellerName: string;
  sellerRating: number;
  sellerInventory: number;
  deliveryDays: number;
}

export interface CreateListingRequest {
  title: string;
  description?: string | null;
  price: number;
  condition: string;
  returnPolicy?: string | null;
  seller: {
    name: string;
    rating: number;
    minPrice: number;
    inventory: number;
    deliveryDays: number;
  };
}

export interface CreateNegotiationCampaignRequest {
  buyerUserId: string;
  buyerProfile?: BuyerAgentProfile;
  targets: NegotiationTargetInput[];
  priority: string;
  autoApprove?: boolean;
}

export interface UpdateBuyerAgentProfileRequest extends BuyerAgentProfile {}

export interface UpdateSellerAgentConfigRequest {
  config: SellerAgentConfig;
}

export interface NegotiationMessageView {
  id: string;
  actor: string;
  type: string;
  content: string;
  offerPrice?: number | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditEventView {
  id: string;
  actor: string;
  eventType: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface FinalDealView {
  finalPrice: number;
  originalPrice: number;
  savings: number;
  deliveryDate?: string | null;
  selectedVariant?: string | null;
  verified: boolean;
  approved: boolean;
  createdAt: string;
}

export interface NegotiationBranchView {
  id: string;
  campaignId: string | null;
  listingId: string;
  sellerId: string;
  buyerBudget: number;
  deliveryDeadline?: string | null;
  preferredVariant?: string | null;
  negotiationStyle: string;
  priority: string;
  status: NegotiationBranchStatus;
  marketContext?: MarketContextSnapshot | null;
  state: StoredNegotiationState;
  messages: NegotiationMessageView[];
  auditEvents: AuditEventView[];
  finalDeal?: FinalDealView | null;
}

export interface CampaignView {
  campaignId: string;
  negotiations: NegotiationBranchView[];
  rankedOutcomes: RankedSellerOutcome[];
}

export interface SseNegotiationEvent {
  type:
    | "connected"
    | "state"
    | "message"
    | "audit"
    | "completed"
    | "error";
  data: Record<string, unknown>;
}
