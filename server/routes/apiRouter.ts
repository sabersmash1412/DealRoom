import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  CreateNegotiationCampaignRequest,
  SellerAgentConfig,
  UpdateBuyerAgentProfileRequest,
} from "../../src/shared/negotiation.js";
import type { AppConfig } from "../config.js";
import { isRecord, readJsonBody, routeSegments, sendJson, sendNoContent } from "../http.js";
import { NegotiationEngine } from "../domain/negotiationEngine.js";
import { NegotiationRepository } from "../repositories/negotiationRepository.js";
import { NegotiationEventBus } from "../services/eventBus.js";

function assertString(value: unknown, message: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(message);
  }

  return value;
}

function parseBuyerProfile(input: unknown): UpdateBuyerAgentProfileRequest {
  if (!isRecord(input)) {
    throw new Error("Buyer profile payload must be an object.");
  }

  return input as unknown as UpdateBuyerAgentProfileRequest;
}

function parseSellerConfig(input: unknown): SellerAgentConfig {
  if (!isRecord(input)) {
    throw new Error("Seller config payload must be an object.");
  }

  return input as unknown as SellerAgentConfig;
}

function parseCampaignRequest(input: unknown): CreateNegotiationCampaignRequest {
  if (!isRecord(input)) {
    throw new Error("Negotiation creation payload must be an object.");
  }

  const buyerUserId = assertString(input.buyerUserId, "buyerUserId is required.");
  const priority = assertString(input.priority, "priority is required.");
  const targets = Array.isArray(input.targets) ? input.targets : null;

  if (!targets || targets.length === 0) {
    throw new Error("At least one negotiation target is required.");
  }

  return {
    buyerUserId,
    priority,
    autoApprove: Boolean(input.autoApprove),
    buyerProfile: input.buyerProfile as CreateNegotiationCampaignRequest["buyerProfile"],
    targets: targets.map((target) => {
      if (!isRecord(target)) {
        throw new Error("Each negotiation target must be an object.");
      }

      return {
        listingId: assertString(target.listingId, "Target listingId is required."),
        sellerId: assertString(target.sellerId, "Target sellerId is required."),
        deliveryDeadline:
          typeof target.deliveryDeadline === "string" ? target.deliveryDeadline : null,
        preferredVariant:
          typeof target.preferredVariant === "string" ? target.preferredVariant : null,
      };
    }),
  };
}

export class ApiRouter {
  constructor(
    private readonly config: AppConfig,
    private readonly repository: NegotiationRepository,
    private readonly engine: NegotiationEngine,
    private readonly eventBus: NegotiationEventBus,
  ) {}

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const segments = routeSegments(url.pathname);

    if (method === "OPTIONS") {
      sendNoContent(res, this.config);
      return;
    }

    if (segments.length === 1 && segments[0] === "health") {
      sendJson(res, this.config, 200, { ok: true });
      return;
    }

    if (
      method === "PUT" &&
      segments.length === 3 &&
      segments[0] === "api" &&
      segments[1] === "agent-profiles" &&
      segments[2] === "buyer"
    ) {
      const payload = parseBuyerProfile(await readJsonBody(req));
      const profile = await this.repository.upsertBuyerAgentProfile(payload);
      sendJson(res, this.config, 200, profile);
      return;
    }

    if (
      method === "PUT" &&
      segments.length === 4 &&
      segments[0] === "api" &&
      segments[1] === "sellers" &&
      segments[3] === "agent-config"
    ) {
      const sellerId = segments[2];
      const payload = await readJsonBody(req);
      if (!isRecord(payload) || !("config" in payload)) {
        throw new Error("Seller config payload must include a config object.");
      }

      const config = parseSellerConfig(payload.config);
      const updated = await this.repository.updateSellerAgentConfig(sellerId, config);
      sendJson(res, this.config, 200, updated);
      return;
    }

    if (
      method === "POST" &&
      segments.length === 2 &&
      segments[0] === "api" &&
      segments[1] === "negotiations"
    ) {
      const payload = parseCampaignRequest(await readJsonBody(req));
      const result = await this.repository.createCampaign(payload);
      this.engine.startCampaign(result.campaignId);
      const campaign = await this.repository.getCampaign(result.campaignId);
      sendJson(res, this.config, 201, campaign);
      return;
    }

    if (
      method === "GET" &&
      segments.length === 4 &&
      segments[0] === "api" &&
      segments[1] === "negotiations" &&
      segments[2] === "campaigns"
    ) {
      const campaign = await this.repository.getCampaign(segments[3]);
      sendJson(res, this.config, 200, campaign);
      return;
    }

    if (
      method === "GET" &&
      segments.length === 4 &&
      segments[0] === "api" &&
      segments[1] === "negotiations" &&
      segments[3] === "stream"
    ) {
      this.eventBus.subscribe(segments[2], req, res, this.config);
      const negotiation = await this.repository.getNegotiationBranch(segments[2]);
      if (negotiation) {
        this.eventBus.publish(segments[2], {
          type: "state",
          data: {
            state: negotiation.state,
            status: negotiation.status,
            finalDeal: negotiation.finalDeal,
          },
        });
      }
      return;
    }

    if (
      method === "GET" &&
      segments.length === 3 &&
      segments[0] === "api" &&
      segments[1] === "negotiations"
    ) {
      const negotiation = await this.repository.getNegotiationBranch(segments[2]);
      if (!negotiation) {
        sendJson(res, this.config, 404, { error: "Negotiation not found." });
        return;
      }
      sendJson(res, this.config, 200, negotiation);
      return;
    }

    if (
      method === "POST" &&
      segments.length === 5 &&
      segments[0] === "api" &&
      segments[1] === "negotiations" &&
      segments[3] === "actions" &&
      segments[4] === "approve"
    ) {
      const negotiation = await this.repository.approveFinalDeal(segments[2]);
      if (!negotiation) {
        sendJson(res, this.config, 409, {
          error: "No final deal exists for this negotiation yet.",
        });
        return;
      }
      sendJson(res, this.config, 200, negotiation);
      return;
    }

    sendJson(res, this.config, 404, { error: "Route not found." });
  }
}
