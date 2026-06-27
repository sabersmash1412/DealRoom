import { getConfig } from "../config.js";

interface GenerateStructuredOutputOptions<T> {
  schemaName: string;
  schema: Record<string, unknown>;
  system: string;
  user: string;
  mock: () => T;
  maxOutputTokens?: number;
}

export class OpenAIService {
  private readonly config = getConfig();

  async generateStructuredOutput<T>(
    options: GenerateStructuredOutputOptions<T>,
  ): Promise<T> {
    if (!this.config.openAiApiKey) {
      return options.mock();
    }

    const payload = await this.requestStructuredOutput(options, true);
    const text = this.extractOutputText(payload);
    return JSON.parse(text) as T;
  }

  private async requestStructuredOutput<T>(
    options: GenerateStructuredOutputOptions<T>,
    includeReasoning: boolean,
  ): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = {
      model: this.config.openAiModel,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: options.system }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: options.user }],
        },
      ],
      max_output_tokens: options.maxOutputTokens ?? 900,
      text: {
        format: {
          type: "json_schema",
          name: options.schemaName,
          schema: options.schema,
        },
      },
    };

    if (includeReasoning) {
      body.reasoning = { effort: "medium" };
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.openAiApiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();

      if (
        includeReasoning &&
        errorText.includes("reasoning.effort") &&
        errorText.includes("unsupported_parameter")
      ) {
        return this.requestStructuredOutput(options, false);
      }

      throw new Error(`OpenAI request failed: ${response.status} ${errorText}`);
    }

    return (await response.json()) as Record<string, unknown>;
  }

  private extractOutputText(payload: Record<string, unknown>): string {
    if (typeof payload.output_text === "string" && payload.output_text.length > 0) {
      return payload.output_text;
    }

    const output = Array.isArray(payload.output) ? payload.output : [];
    const chunks: string[] = [];

    for (const item of output) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const content = Array.isArray((item as { content?: unknown }).content)
        ? ((item as { content: unknown[] }).content as unknown[])
        : [];

      for (const entry of content) {
        if (
          entry &&
          typeof entry === "object" &&
          (entry as { type?: unknown }).type === "output_text" &&
          typeof (entry as { text?: unknown }).text === "string"
        ) {
          chunks.push((entry as { text: string }).text);
        }
      }
    }

    if (chunks.length === 0) {
      throw new Error("OpenAI response did not contain structured output text.");
    }

    return chunks.join("\n");
  }
}
