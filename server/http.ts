import type { IncomingMessage, ServerResponse } from "node:http";
import type { AppConfig } from "./config.js";

const MAX_BODY_BYTES = 1_000_000;

export function setCorsHeaders(res: ServerResponse, config: AppConfig): void {
  res.setHeader("Access-Control-Allow-Origin", config.allowedOrigin);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
}

export function sendJson(
  res: ServerResponse,
  config: AppConfig,
  status: number,
  payload: unknown,
): void {
  setCorsHeaders(res, config);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

export function sendNoContent(res: ServerResponse, config: AppConfig): void {
  setCorsHeaders(res, config);
  res.writeHead(204);
  res.end();
}

export function sendSseHeaders(res: ServerResponse, config: AppConfig): void {
  setCorsHeaders(res, config);
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
}

export function sendSseEvent(
  res: ServerResponse,
  event: { type: string; data: Record<string, unknown> },
): void {
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event.data)}\n\n`);
}

export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  let size = 0;

  for await (const chunk of req) {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    size += bytes.byteLength;

    if (size > MAX_BODY_BYTES) {
      throw new Error("Request body is too large.");
    }

    chunks.push(bytes);
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw);
}

export function routeSegments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
