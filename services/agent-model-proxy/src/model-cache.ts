const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 128;

interface CachedModelResponse {
  status: number;
  headers: [string, string][];
  body: string;
  expiresAtMs: number;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

const responseCache = new Map<string, CachedModelResponse>();
const pendingResponses = new Map<string, Deferred<CachedModelResponse | null>>();

export interface ModelCacheInput {
  provider: 'anthropic' | 'openai';
  route: string;
  runId: string;
  body: unknown;
  headers?: Record<string, string | undefined>;
}

export async function buildModelCacheKey(input: ModelCacheInput): Promise<string> {
  const digestInput = stableJson({
    provider: input.provider,
    route: input.route,
    run_id: input.runId,
    headers: input.headers ?? {},
    body: input.body,
  });
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(digestInput));
  return `model:${toHex(new Uint8Array(hash))}`;
}

export function readCachedModelResponse(key: string): Response | null {
  const cached = responseCache.get(key);
  if (!cached) return null;
  if (cached.expiresAtMs <= Date.now()) {
    responseCache.delete(key);
    return null;
  }
  responseCache.delete(key);
  responseCache.set(key, cached);
  return cachedResponseToResponse(cached);
}

export function awaitPendingModelResponse(key: string): Promise<CachedModelResponse | null> | null {
  return pendingResponses.get(key)?.promise ?? null;
}

export function beginPendingModelResponse(key: string): void {
  if (pendingResponses.has(key)) return;
  let resolve!: (value: CachedModelResponse | null) => void;
  const promise = new Promise<CachedModelResponse | null>((settle) => {
    resolve = settle;
  });
  pendingResponses.set(key, { promise, resolve });
}

export function storeCachedModelResponse(key: string, response: { status: number; headers: Headers; body: string }): CachedModelResponse {
  const cached: CachedModelResponse = {
    status: response.status,
    headers: [...cacheHeaders(response.headers).entries()],
    body: response.body,
    expiresAtMs: Date.now() + CACHE_TTL_MS,
  };
  responseCache.set(key, cached);
  pruneResponseCache();
  resolvePendingModelResponse(key, cached);
  return cached;
}

export function clearPendingModelResponse(key: string): void {
  pendingResponses.delete(key);
}

export function resolvePendingModelResponse(key: string, response: CachedModelResponse | null): void {
  const pending = pendingResponses.get(key);
  if (!pending) return;
  pendingResponses.delete(key);
  pending.resolve(response);
}

export function cachedResponseToResponse(cached: CachedModelResponse): Response {
  return new Response(cached.body, { status: cached.status, headers: new Headers(cached.headers) });
}

function pruneResponseCache(): void {
  while (responseCache.size > MAX_CACHE_ENTRIES) {
    const oldest = responseCache.keys().next().value as string | undefined;
    if (!oldest) break;
    responseCache.delete(oldest);
  }
}

function cacheHeaders(headers: Headers): Headers {
  const cloned = new Headers(headers);
  cloned.delete('x-agent-proxy-remaining-usd-cents');
  cloned.delete('x-agent-proxy-remaining-global-usd-cents');
  return cloned;
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object' || value.constructor !== Object) return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortValue((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
