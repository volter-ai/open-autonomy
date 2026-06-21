import { limitsFromEnv } from './config.js';
import { error, methodNotAllowed, parseJson, readCappedBody } from './errors.js';
import { awaitPendingModelResponse, beginPendingModelResponse, buildModelCacheKey, cachedResponseToResponse, readCachedModelResponse, resolvePendingModelResponse, storeCachedModelResponse } from './model-cache.js';
import { actualCents, estimateInputTokensFromBody, priceFor, worstCaseCents, type TokenUsage } from './pricing.js';
import { reserveBudget } from './spend.js';
import type { Env, RunClaims, UsageEvent } from './types.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_VERSION = '2023-06-01';
const MAX_OUTPUT_TOKENS = 4096;

export async function handleAnthropic(req: Request, env: Env, claims: RunClaims, ctx: ExecutionContext): Promise<Response> {
  if (req.method !== 'POST') return methodNotAllowed();
  if (!env.ANTHROPIC_API_KEY) return error('provider_not_configured', 503);

  const bodyText = await readCappedBody(req, Number(env.MAX_BODY_BYTES ?? 1024 * 1024));
  if (bodyText === null) return error('body_too_large', 413);
  const body = parseJson<Record<string, unknown>>(bodyText);
  if (!body) return error('invalid_json', 400);

  const model = typeof body.model === 'string' ? body.model : '';
  if (!claims.models.includes(model)) return error('model_not_allowed', 403);
  const price = priceFor(env.MODEL_PRICES_JSON, model, 'anthropic');
  if (!price) return error('model_price_not_configured', 403);

  const requestedMax = typeof body.max_tokens === 'number' ? body.max_tokens : MAX_OUTPUT_TOKENS;
  body.max_tokens = Math.max(1, Math.min(requestedMax, MAX_OUTPUT_TOKENS));
  const cacheKey = await buildModelCacheKey({
    provider: 'anthropic',
    route: '/v1/messages',
    runId: claims.run_id,
    body,
    headers: {
      'anthropic-version': req.headers.get('anthropic-version') ?? DEFAULT_VERSION,
      'anthropic-beta': req.headers.get('anthropic-beta') ?? undefined,
    },
  });

  const cached = readCachedModelResponse(cacheKey);
  if (cached) return cached;

  const pending = awaitPendingModelResponse(cacheKey);
  if (pending) {
    const resolved = await pending;
    if (resolved) return cachedResponseToResponse(resolved);
  }
  beginPendingModelResponse(cacheKey);

  const reserved = worstCaseCents(price, body.max_tokens as number, estimateInputTokensFromBody(bodyText));
  const reservation = await reserveBudget(env, claims.run_id, reserved, limitsFromEnv(env));
  if (reservation instanceof Response) {
    resolvePendingModelResponse(cacheKey, null);
    return reservation;
  }

  let upstream: Response;
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': req.headers.get('anthropic-version') ?? DEFAULT_VERSION,
        ...(req.headers.get('anthropic-beta') ? { 'anthropic-beta': req.headers.get('anthropic-beta')! } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    await reservation.release();
    resolvePendingModelResponse(cacheKey, null);
    return error('upstream_unavailable', 502);
  }

  if (!upstream.ok) {
    await reservation.release();
    resolvePendingModelResponse(cacheKey, null);
    return sanitizeUpstream(upstream);
  }

  const headers = forwardedHeaders(upstream.headers);
  const contentType = upstream.headers.get('content-type') ?? '';
  if (!contentType.includes('text/event-stream')) {
    const text = await upstream.text();
    const usage = parseUsageFromJson(text);
    const actual = actualCents(price, usage ?? {}, reserved);
    await reservation.consume(actual, usageEvent(claims, reservation.requestId, 'anthropic', model, '/anthropic/v1/messages', reserved, actual, usage ?? {}, 'ok'));
    headers.set('x-agent-proxy-remaining-usd-cents', String(reservation.remainingRunUsdCents));
    headers.set('x-agent-proxy-remaining-global-usd-cents', String(reservation.remainingGlobalUsdCents));
    storeCachedModelResponse(cacheKey, { status: upstream.status, headers, body: text });
    return new Response(text, { status: upstream.status, headers });
  }

  const [clientStream, cacheAndMeterStream] = upstream.body!.tee();
  const [meterStream, cacheStream] = cacheAndMeterStream.tee();
  ctx.waitUntil(parseUsageFromSse(meterStream)
    .then((usage) => {
      const actual = actualCents(price, usage, reserved);
      return reservation.consume(actual, usageEvent(claims, reservation.requestId, 'anthropic', model, '/anthropic/v1/messages', reserved, actual, usage, 'ok'));
    })
    .catch(() => reservation.consume(reserved, usageEvent(claims, reservation.requestId, 'anthropic', model, '/anthropic/v1/messages', reserved, reserved, {}, 'metering_error'))));
  ctx.waitUntil(new Response(cacheStream).text()
    .then((text) => {
      storeCachedModelResponse(cacheKey, { status: upstream.status, headers, body: text });
    })
    .catch(() => resolvePendingModelResponse(cacheKey, null)));
  headers.set('x-agent-proxy-remaining-usd-cents', String(reservation.remainingRunUsdCents));
  headers.set('x-agent-proxy-remaining-global-usd-cents', String(reservation.remainingGlobalUsdCents));
  return new Response(clientStream, { status: upstream.status, headers });
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
  const requestId = source.get('anthropic-request-id');
  if (requestId) headers.set('anthropic-request-id', requestId);
  headers.set('cache-control', 'no-store');
  return headers;
}

export function parseUsageFromJson(text: string): TokenUsage | null {
  const parsed = parseJson<{ usage?: Record<string, unknown> }>(text);
  const usage = parsed?.usage;
  if (!usage) return null;
  return usageFromRecord(usage);
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
        const event = parseJson<Record<string, any>>(data);
        if (event?.type === 'message_start' && event.message?.usage) Object.assign(usage, usageFromRecord(event.message.usage));
        if (event?.type === 'message_delta' && event.usage) Object.assign(usage, usageFromRecord(event.usage));
      }
    }
  }
  return usage;
}

function usageFromRecord(record: Record<string, unknown>): TokenUsage {
  return {
    input_tokens: typeof record.input_tokens === 'number' ? record.input_tokens : undefined,
    output_tokens: typeof record.output_tokens === 'number' ? record.output_tokens : undefined,
    cache_creation_input_tokens: typeof record.cache_creation_input_tokens === 'number' ? record.cache_creation_input_tokens : undefined,
    cache_read_input_tokens: typeof record.cache_read_input_tokens === 'number' ? record.cache_read_input_tokens : undefined,
  };
}

function usageEvent(
  _claims: RunClaims,
  requestId: string,
  provider: 'anthropic',
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
    route,
    reserved_usd_cents: reserved,
    actual_usd_cents: actual,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    outcome,
    created_at: new Date().toISOString(),
  };
}
