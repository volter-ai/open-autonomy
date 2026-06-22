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
  // OpenRouter "vendor/slug" models settle on OpenRouter's reported real cost, so a table entry is not
  // needed for billing. The entry below exists to right-size the UP-FRONT reservation: the generic
  // OPENROUTER_RESERVE_USD_PER_MTOK ceiling ($30/Mtok) over-reserves Claude Code's large (~200KB) request
  // bodies past a typical per-run cap, rejecting the call before a cent is spent and starving the agent.
  // This is the standardized self-driving model, so price it realistically (settle still uses real cost).
  'deepseek/deepseek-v4-flash': {
    provider: 'openrouter',
    input_usd_per_mtok: 0.5,
    output_usd_per_mtok: 1.5,
  },
};
