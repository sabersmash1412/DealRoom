import type { IncomingMessage, ServerResponse } from "node:http";
import type { AppConfig } from "../config.js";
import { sendSseEvent, sendSseHeaders } from "../http.js";
import type { SseNegotiationEvent } from "../../src/shared/negotiation.js";

interface Subscriber {
  response: ServerResponse<IncomingMessage>;
  heartbeat: NodeJS.Timeout;
}

export class NegotiationEventBus {
  private readonly subscribers = new Map<string, Set<Subscriber>>();

  subscribe(
    negotiationId: string,
    req: IncomingMessage,
    res: ServerResponse<IncomingMessage>,
    config: AppConfig,
  ): void {
    sendSseHeaders(res, config);

    const heartbeat = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 15_000);

    const subscriber: Subscriber = { response: res, heartbeat };
    const set = this.subscribers.get(negotiationId) ?? new Set<Subscriber>();
    set.add(subscriber);
    this.subscribers.set(negotiationId, set);

    sendSseEvent(res, { type: "connected", data: { negotiationId } });

    req.on("close", () => {
      clearInterval(heartbeat);
      set.delete(subscriber);
      if (set.size === 0) {
        this.subscribers.delete(negotiationId);
      }
    });
  }

  publish(negotiationId: string, event: SseNegotiationEvent): void {
    const subscribers = this.subscribers.get(negotiationId);
    if (!subscribers) {
      return;
    }

    for (const subscriber of subscribers) {
      sendSseEvent(subscriber.response, event);
    }
  }
}
