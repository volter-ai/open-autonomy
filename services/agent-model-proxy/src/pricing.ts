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
  // Some upstreams (e.g. OpenRouter) report the actual USD cost of the call. When present it is the
  // authoritative settle amount — no per-model price table needed.
  cost_usd?: number;
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

// Generic worst-case price used to RESERVE budget for an OpenRouter model we hold no table entry for.
// The reservation is later trued down to the exact cost OpenRouter reports, so this only needs to be a
// safe ceiling, not accurate. One env-tunable rate, not a per-model table.
export function openrouterReservePrice(reserveUsdPerMtok: number): ModelPrice {
  return { provider: 'openrouter', input_usd_per_mtok: reserveUsdPerMtok, output_usd_per_mtok: reserveUsdPerMtok };
}

// The amount to actually charge a run, in US cents (fractional — sub-cent precision is kept). If the
// upstream reported a real cost, that is authoritative; otherwise fall back to metering token counts
// against the price table. We must NOT floor/ceil each request to a whole cent: a deepseek request costs
// a small fraction of a cent, and agents fire thousands of requests, so a 1¢-per-request floor over-counts
// real spend ~3× — inflating account balances and tripping the global daily cap at a third of true spend.
// Cents are carried as real numbers throughout the ledger; rounding happens only at display.
export function settleCents(price: ModelPrice, usage: TokenUsage, fallbackCents: number): number {
  // Only trust the reported cost when it is a finite, non-negative number — a malformed upstream value
  // (NaN/Infinity/negative) must not become the charge (it would poison the ledger / disable a cap).
  if (usage.cost_usd !== undefined && Number.isFinite(usage.cost_usd) && usage.cost_usd >= 0) {
    // toFixed(6) tames float noise (0.07 * 100 = 7.0000000000000001) without losing sub-cent precision.
    return Number((usage.cost_usd * 100).toFixed(6));
  }
  return actualCents(price, usage, fallbackCents);
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
  // Fractional cents — no per-request whole-cent floor (see settleCents): flooring over-counts cheap models.
  // Clamp to >= 0 so a malformed (negative) token count can never produce a negative charge.
  return Math.max(0, Number(((inputUsd + outputUsd + cacheWriteUsd + cacheReadUsd) * 100).toFixed(6)));
}
