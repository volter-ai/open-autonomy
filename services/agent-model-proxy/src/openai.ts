import { limitsFromEnv } from './config.js';
import { error, methodNotAllowed, parseJson, readCappedBody } from './errors.js';
import { estimateInputTokensFromBody, openrouterReservePrice, priceTable, settleCents, worstCaseCents, type ModelPrice, type TokenUsage } from './pricing.js';
import { reserveBudget } from './spend.js';
import type { Env, Provider, RunClaims, UsageEvent } from './types.js';

const OPENAI_BASE = 'https://api.openai.com';
// OpenRouter also speaks the OpenAI chat/completions wire, so openrouter-provider models route here too
// (the agent loop's proxyTurn uses this wire). Same vendor/slug convention + reported-cost settle as the
// Anthropic handler.
const OPENROUTER_BASE = 'https://openrouter.ai/api';
const MAX_OUTPUT_TOKENS = 4096;

export async function handleOpenAI(
  req: Request,
  env: Env,
  claims: RunClaims,
  ctx: ExecutionContext,
  route: '/v1/chat/completions' | '/v1/responses',
): Promise<Response> {
  if (req.method !== 'POST') return methodNotAllowed();

  const bodyText = await readCappedBody(req, Number(env.MAX_BODY_BYTES ?? 1024 * 1024));
  if (bodyText === null) return error('body_too_large', 413);
  const body = parseJson<Record<string, unknown>>(bodyText);
  if (!body) return error('invalid_json', 400);

  const model = typeof body.model === 'string' ? body.model : '';
  if (!claims.models.includes(model)) return error('model_not_allowed', 403);

  // Pick the provider for this OpenAI-wire request: an explicit table entry wins; otherwise an
  // OpenRouter-style "vendor/slug" id routes to OpenRouter (no table entry needed — it reports real
  // cost) and a bare id is first-party OpenAI. Anthropic-priced models don't belong on this wire.
  const priced = priceTable(env.MODEL_PRICES_JSON)[model];
  if (priced && priced.provider === 'anthropic') return error('model_price_not_configured', 403);
  const provider: 'openai' | 'openrouter' = priced?.provider === 'openrouter' ? 'openrouter'
    : priced?.provider === 'openai' ? 'openai'
    : model.includes('/') ? 'openrouter'
    : 'openai';
  let price: ModelPrice | null = priced ?? null;
  if (!price) {
    if (provider === 'openrouter') price = openrouterReservePrice(Number(env.OPENROUTER_RESERVE_USD_PER_MTOK ?? 30));
    else return error('model_price_not_configured', 403);
  }
  const apiKey = provider === 'openrouter' ? env.OPENROUTER_API_KEY : env.OPENAI_API_KEY;
  if (!apiKey) return error('provider_not_configured', 503);

  const outputTokens = clampOpenAiOutputTokens(body, route);
  if (route === '/v1/chat/completions' && body.stream === true) {
    body.stream_options = {
      ...(typeof body.stream_options === 'object' && body.stream_options !== null ? body.stream_options : {}),
      include_usage: true,
    };
  }
  const reserved = worstCaseCents(price, outputTokens, estimateInputTokensFromBody(bodyText));
  const reservation = await reserveBudget(env, claims.run_id, reserved, limitsFromEnv(env));
  if (reservation instanceof Response) return reservation;

  let upstream: Response;
  try {
    upstream = await fetch(`${provider === 'openrouter' ? OPENROUTER_BASE : OPENAI_BASE}${route}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch {
    await reservation.release();
    return error('upstream_unavailable', 502);
  }

  if (!upstream.ok) {
    await reservation.release();
    return sanitizeUpstream(upstream);
  }

  const headers = forwardedHeaders(upstream.headers);
  headers.set('x-agent-proxy-remaining-usd-cents', String(reservation.remainingRunUsdCents));
  headers.set('x-agent-proxy-remaining-global-usd-cents', String(reservation.remainingGlobalUsdCents));
  const contentType = upstream.headers.get('content-type') ?? '';
  if (contentType.includes('text/event-stream')) {
    const [clientStream, meterStream] = upstream.body!.tee();
    ctx.waitUntil(parseUsageFromSse(meterStream)
      .then((usage) => {
        const actual = settleCents(price, usage, reserved);
        return reservation.consume(actual, usageEvent(provider, reservation.requestId, model, route, reserved, actual, usage, 'ok'));
      })
      .catch(() => reservation.consume(reserved, usageEvent(provider, reservation.requestId, model, route, reserved, reserved, {}, 'metering_error'))));
    return new Response(clientStream, { status: upstream.status, headers });
  }

  const text = await upstream.text();
  const usage = parseUsage(text);
  const actual = settleCents(price, usage ?? {}, reserved);
  await reservation.consume(actual, usageEvent(provider, reservation.requestId, model, route, reserved, actual, usage ?? {}, 'ok'));
  return new Response(text, { status: upstream.status, headers });
}

function clampOpenAiOutputTokens(body: Record<string, unknown>, route: string): number {
  const key = route === '/v1/responses' ? 'max_output_tokens' : 'max_tokens';
  const alternate = route === '/v1/chat/completions' ? 'max_completion_tokens' : key;
  const requested = typeof body[key] === 'number'
    ? body[key]
    : typeof body[alternate] === 'number'
      ? body[alternate]
      : MAX_OUTPUT_TOKENS;
  const clamped = Math.max(1, Math.min(requested, MAX_OUTPUT_TOKENS));
  body[key] = clamped;
  if (alternate !== key) delete body[alternate];
  return clamped;
}

function sanitizeUpstream(upstream: Response): Response {
  if (upstream.status === 429) return error('provider_rate_limited', 429);
  if (upstream.status === 401 || upstream.status === 403) return error('upstream_auth_failed', 502);
  if (upstream.status >= 500) return error('upstream_unavailable', 502);
  return error('provider_rejected_request', 400);
}

function forwardedHeaders(source: Headers): Headers {
  const headers = new Headers();
  headers.set('content-type', source.get('content-type') ?? 'application/json');
  headers.set('cache-control', 'no-store');
  const requestId = source.get('x-request-id');
  if (requestId) headers.set('x-request-id', requestId);
  return headers;
}

export function parseUsage(text: string): TokenUsage | null {
  const parsed = parseJson<{ usage?: Record<string, unknown> }>(text);
  const usage = parsed?.usage;
  if (!usage) return null;
  const input = usage.input_tokens ?? usage.prompt_tokens;
  const output = usage.output_tokens ?? usage.completion_tokens;
  return {
    input_tokens: typeof input === 'number' ? input : undefined,
    output_tokens: typeof output === 'number' ? output : undefined,
    // OpenRouter reports the real USD cost here on the chat/completions wire too; authoritative when set.
    cost_usd: typeof usage.cost === 'number' ? usage.cost : undefined,
  };
}

export async function parseUsageFromSse(stream: ReadableStream<Uint8Array>): Promise<TokenUsage> {
  const usage: TokenUsage = {};
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (!data || data === '[DONE]') continue;
        const parsed = parseJson<Record<string, any>>(data);
        const eventUsage = usageFromOpenAiObject(parsed);
        if (eventUsage) Object.assign(usage, eventUsage);
      }
    }
  }
  return usage;
}

function usageFromOpenAiObject(parsed: Record<string, any> | null): TokenUsage | null {
  const raw = parsed?.usage ?? parsed?.response?.usage;
  if (!raw || typeof raw !== 'object') return null;
  const input = raw.input_tokens ?? raw.prompt_tokens;
  const output = raw.output_tokens ?? raw.completion_tokens;
  return {
    input_tokens: typeof input === 'number' ? input : undefined,
    output_tokens: typeof output === 'number' ? output : undefined,
    cost_usd: typeof raw.cost === 'number' ? raw.cost : undefined,
  };
}

function usageEvent(
  provider: Provider,
  requestId: string,
  model: string,
  route: string,
  reserved: number,
  actual: number,
  usage: TokenUsage,
  outcome: UsageEvent['outcome'],
): UsageEvent {
  return {
    request_id: requestId,
    provider,
    model,
    route: `/${provider}${route}`,
    reserved_usd_cents: reserved,
    actual_usd_cents: actual,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    outcome,
    created_at: new Date().toISOString(),
  };
}
