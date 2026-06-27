import { createServer } from "node:http";
import { getConfig } from "./config.js";
import { BuyerAgent } from "./agents/buyerAgent.js";
import { MediatorAgent } from "./agents/mediatorAgent.js";
import { SellerAgent } from "./agents/sellerAgent.js";
import { NegotiationEngine } from "./domain/negotiationEngine.js";
import { setCorsHeaders } from "./http.js";
import { NegotiationRepository } from "./repositories/negotiationRepository.js";
import { ApiRouter } from "./routes/apiRouter.js";
import { NegotiationEventBus } from "./services/eventBus.js";
import { ExaService } from "./services/exaService.js";
import { OpenAIService } from "./services/openaiService.js";

const config = getConfig();
const repository = new NegotiationRepository();
const openAiService = new OpenAIService();
const exaService = new ExaService();
const eventBus = new NegotiationEventBus();
const engine = new NegotiationEngine(
  repository,
  new BuyerAgent(openAiService),
  new SellerAgent(openAiService),
  new MediatorAgent(openAiService),
  exaService,
  eventBus,
);
const router = new ApiRouter(config, repository, engine, eventBus);

const server = createServer((req, res) => {
  void router.handle(req, res).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown server error.";
    setCorsHeaders(res, config);
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: message }));
  });
});

server.listen(config.port, () => {
  console.log(`DealRoom backend listening on http://localhost:${config.port}`);
});
