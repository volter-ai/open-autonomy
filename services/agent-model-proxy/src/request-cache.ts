const CACHE_TTL_SECONDS = 60;
const CACHE_TTL_MS = CACHE_TTL_SECONDS * 1000;

interface CachedResponse {
  status: number;
  headers: [string, string][];
  body: string;
}

const memoryCache = new Map<string, { expiresAt: number; response: CachedResponse }>();

export async function buildRequestCacheKey(input: {
  provider: 'anthropic' | 'openai';
  route: string;
  runId: string;
  body: unknown;
  headers?: Record<string, string | undefined>;
}): Promise<string> {
  const payload = stableStringify({
    provider: input.provider,
    route: input.route,
    runId: input.runId,
    body: input.body,
    headers: normalizeHeaders(input.headers ?? {}),
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return `agent-model-proxy:${toBase64Url(new Uint8Array(digest))}`;
}

export async function readCachedResponse(key: string): Promise<CachedResponse | null> {
  const cached = memoryCache.get(key);
  if (cached) {
    if (cached.expiresAt > Date.now()) return cached.response;
    memoryCache.delete(key);
  }

  const cache = cacheStorage();
  if (!cache) return null;
  let res: Response | undefined;
  try {
    res = await cache.match(cacheRequest(key));
  } catch {
    return null;
  }
  if (!res) return null;
  return {
    status: res.status,
    headers: [...res.headers.entries()],
    body: await res.text(),
  };
}

export async function writeCachedResponse(key: string, response: CachedResponse): Promise<void> {
  memoryCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, response });

  const cache = cacheStorage();
  if (!cache) return;

  const headers = new Headers(response.headers);
  headers.set('cache-control', `public, max-age=${CACHE_TTL_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}`);
  try {
    await cache.put(cacheRequest(key), new Response(response.body, { status: response.status, headers }));
  } catch {
    // Cache is best-effort. Memory cache already holds the response for the current process.
  }
}

export function toCachedResponse(response: Response, body: string): CachedResponse {
  return {
    status: response.status,
    headers: [...response.headers.entries()],
    body,
  };
}

export function responseFromCachedResponse(cached: CachedResponse): Response {
  const headers = new Headers(cached.headers);
  headers.set('cache-control', 'no-store');
  return new Response(cached.body, { status: cached.status, headers });
}

function cacheRequest(key: string): Request {
  return new Request(`https://agent-model-proxy.local/cache/${encodeURIComponent(key)}`);
}

function cacheStorage(): {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
} | null {
  return (globalThis as {
    caches?: { default?: { match(request: Request): Promise<Response | undefined>; put(request: Request, response: Response): Promise<void> } };
  }).caches?.default ?? null;
}

function normalizeHeaders(headers: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers)
      .filter(([, value]) => typeof value === 'string')
      .map(([key, value]) => [key, value as string])
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeValue(value));
}

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => normalizeValue(entry));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, normalizeValue(entry)]),
  );
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
