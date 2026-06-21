import type { ModelPrice } from './pricing.js';

// Production can override or extend this table with MODEL_PRICES_JSON.
// Keep this fallback table conservative and update it with source links in
// services/agent-model-proxy/README.md whenever model defaults change.
export const MODEL_PRICES: Record<string, ModelPrice> = {
  'gpt-4o-mini': {
    provider: 'openai',
    input_usd_per_mtok: 0.15,
    output_usd_per_mtok: 0.60,
  },
  'gpt-4.1-mini': {
    provider: 'openai',
    input_usd_per_mtok: 0.40,
    output_usd_per_mtok: 1.60,
  },
  'gpt-4o': {
    provider: 'openai',
    input_usd_per_mtok: 2.50,
    output_usd_per_mtok: 10,
  },
  'gpt-5.4-mini': {
    provider: 'openai',
    input_usd_per_mtok: 0.75,
    output_usd_per_mtok: 4.50,
  },
  'gpt-5.4': {
    provider: 'openai',
    input_usd_per_mtok: 2.50,
    output_usd_per_mtok: 15,
  },
  'gpt-5-mini': {
    provider: 'openai',
    input_usd_per_mtok: 0.25,
    output_usd_per_mtok: 2,
  },
  'claude-sonnet-4-6': {
    provider: 'anthropic',
    input_usd_per_mtok: 3,
    output_usd_per_mtok: 15,
    cache_write_multiplier: 1.25,
    cache_read_multiplier: 0.1,
  },
  'claude-haiku-4-5': {
    provider: 'anthropic',
    input_usd_per_mtok: 1,
    output_usd_per_mtok: 5,
    cache_write_multiplier: 1.25,
    cache_read_multiplier: 0.1,
  },
  // No OpenRouter entries needed: any "vendor/slug" model (e.g. deepseek/deepseek-v4-flash) routes to
  // OpenRouter, which reports the real cost we settle against. Add an entry only to tighten its
  // up-front budget reservation below the generic OPENROUTER_RESERVE_USD_PER_MTOK ceiling.
};
