export interface AppConfig {
  port: number;
  openAiApiKey: string;
  openAiModel: string;
  exaApiKey: string;
  allowedOrigin: string;
}

function parsePort(value: string | undefined): number {
  const parsed = Number(value ?? "8787");
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 8787;
}

export function getConfig(): AppConfig {
  return {
    port: parsePort(process.env.PORT),
    openAiApiKey: process.env.OPENAI_API_KEY ?? "",
    openAiModel: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    exaApiKey: process.env.EXA_API_KEY ?? "",
    allowedOrigin: process.env.ALLOWED_ORIGIN ?? "*",
  };
}
