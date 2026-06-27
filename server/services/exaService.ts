import type { MarketContextSnapshot } from "../../src/shared/negotiation.js";
import { getConfig } from "../config.js";

export class ExaService {
  private readonly config = getConfig();

  async fetchMarketContext(input: {
    title: string;
    condition: string;
    listingPrice: number;
  }): Promise<MarketContextSnapshot> {
    if (!this.config.exaApiKey) {
      console.warn("[ExaService] EXA_API_KEY is not configured. Using fallback market context.", {
        title: input.title,
        condition: input.condition,
        listingPrice: input.listingPrice,
      });
      return this.buildFallbackContext(input);
    }

    const query = `${input.title} ${input.condition} market price`;
    const requestBody = {
      query,
      numResults: 5,
      contents: {
        highlights: true,
        summary: true,
      },
    };

    console.info("[ExaService] Calling Exa search API.", {
      title: input.title,
      condition: input.condition,
      listingPrice: input.listingPrice,
      requestBody,
    });

    try {
      const response = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.config.exaApiKey,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.warn("[ExaService] Exa search API returned a non-OK response. Using fallback market context.", {
          status: response.status,
          statusText: response.statusText,
          body: errorBody,
          query,
        });
        return this.buildFallbackContext(input);
      }

      const payload = (await response.json()) as {
        results?: Array<{
          title?: string;
          url?: string;
          summary?: string;
          text?: string;
        }>;
      };

      console.info("[ExaService] Exa search API response payload.", payload);

      const extractedPrices = (payload.results ?? [])
        .map((result) => {
          const combinedText = [result.title, result.summary, result.text].filter(Boolean).join(" ");
          const match = combinedText.match(/\$?\b(\d{2,6})\b/g);
          if (!match || match.length === 0) {
            return null;
          }

          const candidate = Number(match[0].replace(/[^\d]/g, ""));
          return Number.isFinite(candidate) ? candidate : null;
        })
        .filter((value): value is number => value !== null);

      if (extractedPrices.length === 0) {
        console.warn("[ExaService] Exa response did not yield any usable prices. Using fallback market context.", {
          query,
          payload,
        });
        return this.buildFallbackContext(input);
      }

      const averagePrice = Math.round(
        extractedPrices.reduce((sum, value) => sum + value, 0) / extractedPrices.length,
      );
      const lowestListing = Math.min(...extractedPrices);
      const highestListing = Math.max(...extractedPrices);

      const marketContext: MarketContextSnapshot = {
        query,
        averagePrice,
        lowestListing,
        highestListing,
        comparableListings: (payload.results ?? []).slice(0, 4).map((result, index) => ({
          title: result.title ?? `Comparable ${index + 1}`,
          price: extractedPrices[index] ?? averagePrice,
          url: result.url ?? null,
          source: "exa",
        })),
        generatedAt: new Date().toISOString(),
        source: "exa",
      };

      console.info("[ExaService] Normalized market context from Exa response.", marketContext);

      return marketContext;
    } catch (error) {
      console.error("[ExaService] Exa search API request failed. Using fallback market context.", {
        query,
        error,
      });
      return this.buildFallbackContext(input);
    }
  }

  private buildFallbackContext(input: {
    title: string;
    condition: string;
    listingPrice: number;
  }): MarketContextSnapshot {
    const base = input.listingPrice;

    return {
      query: `${input.title} ${input.condition} market price`,
      averagePrice: base,
      lowestListing: Math.max(1, Math.round(base * 0.92)),
      highestListing: Math.round(base * 1.08),
      comparableListings: [
        { title: `${input.title} comparable A`, price: Math.round(base * 0.94), source: "fallback" },
        { title: `${input.title} comparable B`, price: base, source: "fallback" },
        { title: `${input.title} comparable C`, price: Math.round(base * 1.05), source: "fallback" },
      ],
      generatedAt: new Date().toISOString(),
      source: "fallback",
    };
  }
}
