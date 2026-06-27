import type { MarketContextSnapshot } from "../../src/shared/negotiation.js";
import { getConfig } from "../config.js";

type ExaSearchResult = {
  title?: string;
  url?: string;
  summary?: string;
  text?: string;
};

type PriceCandidate = {
  index: number;
  score: number;
  source: "summary" | "text" | "title";
  value: number;
};

export class ExaService {
  private readonly config = getConfig();
  private static readonly currencyPattern =
    /(?:[$£€]\s?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?\s?(?:[$£€]|USD|GBP|EUR))/gi;

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

      const payload = (await response.json()) as { results?: ExaSearchResult[] };

      console.info("[ExaService] Exa search API response payload.", payload);

      const comparableResults = (payload.results ?? [])
        .map((result, index) => {
          const price = this.extractComparablePrice(result);
          if (price === null) {
            console.info("[ExaService] Skipping Exa result without a usable market price.", {
              index,
              title: result.title ?? null,
              url: result.url ?? null,
            });
          }

          return {
            price,
            result,
          };
        })
        .filter((entry): entry is { price: number; result: ExaSearchResult } => entry.price !== null);

      const extractedPrices = comparableResults.map((entry) => entry.price);

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
        comparableListings: comparableResults.slice(0, 4).map(({ result, price }, index) => ({
          title: result.title ?? `Comparable ${index + 1}`,
          price,
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

  private extractComparablePrice(result: ExaSearchResult): number | null {
    const candidates = [
      ...this.extractPriceCandidates(result.summary, "summary"),
      ...this.extractPriceCandidates(result.text, "text"),
      ...this.extractPriceCandidates(result.title, "title"),
    ];

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (right.value !== left.value) {
        return right.value - left.value;
      }

      return left.index - right.index;
    });

    return Math.round(candidates[0].value);
  }

  private extractPriceCandidates(
    content: string | undefined,
    source: PriceCandidate["source"],
  ): PriceCandidate[] {
    if (!content) {
      return [];
    }

    return Array.from(content.matchAll(ExaService.currencyPattern))
      .map((match) => {
        const rawValue = match[0];
        const value = this.parseCurrencyValue(rawValue);
        if (value === null) {
          return null;
        }

        const index = match.index ?? 0;
        const prefix = content.slice(Math.max(0, index - 24), index);
        const suffix = content.slice(index + rawValue.length, Math.min(content.length, index + rawValue.length + 24));
        let score = source === "title" ? 0 : 2;

        if (/\b(price|priced|pricing|listing|listed|market|deal|cost|sale|sell)\b/i.test(prefix)) {
          score += 4;
        }

        if (/\b(price|priced|pricing|listing|listed|market|deal|cost|sale|sell)\b/i.test(suffix)) {
          score += 1;
        }

        if (/\b(from|at|around|shows?)\b/i.test(prefix)) {
          score += 1;
        }

        if (/\b(month|monthly|\/mo|contract)\b/i.test(`${prefix} ${suffix}`)) {
          score -= 6;
        }

        if (/\b(new price|trade-?in|msrp|retail)\b/i.test(prefix)) {
          score -= 8;
        }

        return {
          index,
          score,
          source,
          value,
        };
      })
      .filter((candidate): candidate is PriceCandidate => candidate !== null);
  }

  private parseCurrencyValue(rawValue: string): number | null {
    const normalized = rawValue.replace(/[$£€]|USD|GBP|EUR/gi, "").replace(/,/g, "").trim();
    const value = Number.parseFloat(normalized);

    return Number.isFinite(value) && value > 0 ? value : null;
  }
}
