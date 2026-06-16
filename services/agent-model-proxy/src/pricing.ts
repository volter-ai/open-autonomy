import type { Provider } from './types.js';
import { MODEL_PRICES } from './model-prices.js';

export interface ModelPrice {
  provider: Provider;
  input_usd_per_mtok: number;
  output_usd_per_mtok: number;
  cache_write_multiplier?: number;
  cache_read_multiplier?: number;
}

export interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export function priceTable(modelPricesJson?: string): Record<string, ModelPrice> {
  if (!modelPricesJson || modelPricesJson.trim() === '' || modelPricesJson.trim() === '{}') return MODEL_PRICES;
  const parsed = JSON.parse(modelPricesJson) as Record<string, ModelPrice>;
  return { ...MODEL_PRICES, ...parsed };
}

export function priceFor(modelPricesJson: string | undefined, model: string, provider: Provider): ModelPrice | null {
  const price = priceTable(modelPricesJson)[model];
  if (!price || price.provider !== provider) return null;
  return price;
}

export function worstCaseCents(price: ModelPrice, outputTokens: number, inputEstimate = 2000): number {
  const inputUsd = (inputEstimate / 1_000_000)
    * price.input_usd_per_mtok
    * Math.max(1, price.cache_write_multiplier ?? 1);
  const outputUsd = (outputTokens / 1_000_000) * price.output_usd_per_mtok;
  return Math.max(1, Math.ceil((inputUsd + outputUsd) * 100));
}

export function estimateInputTokensFromBody(bodyText: string): number {
  return Math.max(2000, new TextEncoder().encode(bodyText).byteLength);
}

export function actualCents(price: ModelPrice, usage: TokenUsage, fallbackCents: number): number {
  const hasUsage = usage.input_tokens !== undefined || usage.output_tokens !== undefined;
  if (!hasUsage) return fallbackCents;

  const inputUsd = ((usage.input_tokens ?? 0) / 1_000_000) * price.input_usd_per_mtok;
  const outputUsd = ((usage.output_tokens ?? 0) / 1_000_000) * price.output_usd_per_mtok;
  const cacheWriteUsd = ((usage.cache_creation_input_tokens ?? 0) / 1_000_000)
    * price.input_usd_per_mtok
    * (price.cache_write_multiplier ?? 1);
  const cacheReadUsd = ((usage.cache_read_input_tokens ?? 0) / 1_000_000)
    * price.input_usd_per_mtok
    * (price.cache_read_multiplier ?? 1);
  return Math.max(1, Math.ceil((inputUsd + outputUsd + cacheWriteUsd + cacheReadUsd) * 100));
}
