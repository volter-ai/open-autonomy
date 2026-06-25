import { limitsFromEnv } from './config.js';
import { error, methodNotAllowed, parseJson, readCappedBody } from './errors.js';
import { estimateInputTokensFromBody, openrouterReservePrice, priceTable, settleCents, worstCaseCents, type ModelPrice, type TokenUsage } from './pricing.js';
import { sessionTurnsFromBody } from './session-capture.js';
import { reserveBudget } from './spend.js';
import type { Env, Provider, RunClaims, UsageEvent } from './types.js';

// Single upstream: every model on the Anthropic Messages wire settles through OpenRouter (it speaks it).
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/messages';
const DEFAULT_VERSION = '2023-06-01';
const MAX_OUTPUT_TOKENS = 4096;

export async function handleAnthropic(req: Request, env: Env, claims: RunClaims, ctx: ExecutionContext): Promise<Response> {
  if (req.method !== 'POST') return methodNotAllowed();

  const bodyText = await readCappedBody(req, Number(env.MAX_BODY_BYTES ?? 1024 * 1024));
  if (bodyText === null) return error('body_too_large', 413);
  const body = parseJson<Record<string, unknown>>(bodyText);
  if (!body) return error('invalid_json', 400);

  const model = typeof body.model === 'string' ? body.model : '';
  if (!claims.models.includes(model)) return error('model_not_allowed', 403);

  // Single provider: every model settles through OpenRouter — prepaid, so the loaded credit balance is the
  // hard ceiling on all spend. A bare Anthropic id is mapped to its OpenRouter "vendor/slug"; a slug id
  // passes through. OpenRouter reports the real cost, so an unpriced model reserves at a conservative ceiling.
  const priced = priceTable(env.MODEL_PRICES_JSON)[model];
  if (priced && priced.provider === 'openai') return error('model_price_not_configured', 403);
  const provider = 'openrouter' as const;
  const price: ModelPrice = priced ?? openrouterReservePrice(Number(env.OPENROUTER_RESERVE_USD_PER_MTOK ?? 30));
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) return error('provider_not_configured', 503);
  if (!model.includes('/')) body.model = `anthropic/${model}`;

  const requestedMax = typeof body.max_tokens === 'number' ? body.max_tokens : MAX_OUTPUT_TOKENS;
  body.max_tokens = Math.max(1, Math.min(requestedMax, MAX_OUTPUT_TOKENS));

  const reserved = worstCaseCents(price, body.max_tokens as number, estimateInputTokensFromBody(bodyText));
  // Capture the run's live session window in the same in-request reserve write (reliable, lag-free) so the
  // live view + the PM can watch it move — the proxy is the only vantage point on an in-flight run.
  const reservation = await reserveBudget(env, claims.run_id, reserved, limitsFromEnv(env), sessionTurnsFromBody(body));
  if (reservation instanceof Response) return reservation;

  let upstream: Response;
  try {
    upstream = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
        'anthropic-version': req.headers.get('anthropic-version') ?? DEFAULT_VERSION,
        ...(req.headers.get('anthropic-beta') ? { 'anthropic-beta': req.headers.get('anthropic-beta')! } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    await reservation.release(false); // network error — provider never reached, refund the slot
    return error('upstream_unavailable', 502);
  }

  if (!upstream.ok) {
    await reservation.release(true); // provider responded (non-2xx) — the request reached it, keep the slot
    return sanitizeUpstream(upstream);
  }

  const headers = forwardedHeaders(upstream.headers);
  const contentType = upstream.headers.get('content-type') ?? '';
  if (!contentType.includes('text/event-stream')) {
    const text = await upstream.text();
    const usage = parseUsageFromJson(text);
    const actual = settleCents(price, usage ?? {}, reserved);
    await reservation.consume(actual, usageEvent(claims, reservation.requestId, provider, model, `/${provider}/v1/messages`, reserved, actual, usage ?? {}, 'ok'));
    headers.set('x-agent-proxy-remaining-usd-cents', String(reservation.remainingRunUsdCents));
    headers.set('x-agent-proxy-remaining-global-usd-cents', String(reservation.remainingGlobalUsdCents));
    return new Response(text, { status: upstream.status, headers });
  }

  const [clientStream, meterStream] = upstream.body!.tee();
  ctx.waitUntil(parseUsageFromSse(meterStream)
    .then((usage) => {
      const actual = settleCents(price, usage, reserved);
      return reservation.consume(actual, usageEvent(claims, reservation.requestId, provider, model, `/${provider}/v1/messages`, reserved, actual, usage, 'ok'));
    })
    .catch(() => reservation.consume(reserved, usageEvent(claims, reservation.requestId, provider, model, `/${provider}/v1/messages`, reserved, reserved, {}, 'metering_error'))));
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
    // OpenRouter reports the real USD cost of the call here; when present it is the authoritative charge.
    cost_usd: typeof record.cost === 'number' ? record.cost : undefined,
  };
}

function usageEvent(
  _claims: RunClaims,
  requestId: string,
  provider: Provider,
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
