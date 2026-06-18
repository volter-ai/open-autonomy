import type { Env, RunClaims } from './types.js';

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function utf8Base64url(value: string): string {
  return base64url(new TextEncoder().encode(value));
}

function fromBase64url(value: string): Uint8Array {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function hmac(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return base64url(new Uint8Array(sig));
}

export async function signRunToken(env: Env, claims: RunClaims): Promise<string> {
  const payload = utf8Base64url(JSON.stringify(claims));
  return `${payload}.${await hmac(env.AGENT_PROXY_HMAC_SECRET, payload)}`;
}

export async function verifyRunToken(env: Env, token: string | null): Promise<RunClaims | null> {
  if (!token) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra !== undefined) return null;
  const expected = await hmac(env.AGENT_PROXY_HMAC_SECRET, payload);
  if (!constantTimeEqual(signature, expected)) return null;

  let claims: RunClaims;
  try {
    claims = JSON.parse(new TextDecoder().decode(fromBase64url(payload))) as RunClaims;
  } catch {
    return null;
  }
  if (!claims.run_id || !claims.repo || !claims.actor || !Array.isArray(claims.models)) return null;
  if (Date.parse(claims.expires_at) <= Date.now()) return null;
  return claims;
}

export function extractBearer(req: Request): string | null {
  const auth = req.headers.get('authorization');
  const match = auth?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export function constantTimeEqual(a: string, b: string): boolean {
  const aa = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  const len = Math.max(aa.length, bb.length);
  let diff = aa.length ^ bb.length;
  for (let i = 0; i < len; i++) diff |= (aa[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}
