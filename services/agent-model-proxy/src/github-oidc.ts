import type { Env } from './types.js';

const GITHUB_ISSUER = 'https://token.actions.githubusercontent.com';
const DEFAULT_AUDIENCE = 'volter-agent-model-proxy';
const DEFAULT_OPENID_CONFIGURATION_URL = `${GITHUB_ISSUER}/.well-known/openid-configuration`;

interface JwtHeader {
  alg?: string;
  kid?: string;
}

export interface GitHubOidcClaims {
  iss: string;
  aud: string | string[];
  exp: number;
  nbf?: number;
  iat?: number;
  repository?: string;
  actor?: string;
  run_id?: string;
  run_attempt?: string;
  job_workflow_ref?: string;
  workflow_ref?: string;
}

interface OpenIdConfiguration {
  jwks_uri?: string;
}

interface JwkWithKid extends JsonWebKey {
  kid?: string;
}

interface Jwks {
  keys?: JwkWithKid[];
}

export async function verifyGitHubOidcToken(env: Env, token: string | null): Promise<GitHubOidcClaims | null> {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = parseJsonPart<JwtHeader>(encodedHeader);
  const claims = parseJsonPart<GitHubOidcClaims>(encodedPayload);
  if (!header || !claims || header.alg !== 'RS256' || !header.kid) return null;
  if (!validateClaims(env, claims)) return null;

  const key = await signingKey(env, header.kid);
  if (!key) return null;
  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    key,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const signed = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
  return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, toArrayBuffer(fromBase64url(encodedSignature)), signed)
    ? claims
    : null;
}

function validateClaims(env: Env, claims: GitHubOidcClaims): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== GITHUB_ISSUER) return false;
  if (claims.exp <= now) return false;
  if (claims.nbf !== undefined && claims.nbf > now + 60) return false;

  const expectedAudience = env.GITHUB_OIDC_AUDIENCE ?? DEFAULT_AUDIENCE;
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  return audiences.includes(expectedAudience);
}

async function signingKey(env: Env, kid: string): Promise<JwkWithKid | null> {
  const jwksUrl = env.GITHUB_OIDC_JWKS_URL ?? await discoverJwksUrl(env);
  const res = await fetch(jwksUrl, { headers: { accept: 'application/json' } });
  if (!res.ok) return null;
  const jwks = await res.json() as Jwks;
  return jwks.keys?.find((key) => key.kid === kid && key.kty === 'RSA') ?? null;
}

async function discoverJwksUrl(env: Env): Promise<string> {
  const configUrl = env.GITHUB_OIDC_OPENID_CONFIGURATION_URL ?? DEFAULT_OPENID_CONFIGURATION_URL;
  const res = await fetch(configUrl, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error('github_oidc_discovery_failed');
  const config = await res.json() as OpenIdConfiguration;
  if (!config.jwks_uri) throw new Error('github_oidc_jwks_missing');
  return config.jwks_uri;
}

function parseJsonPart<T>(value: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(fromBase64url(value))) as T;
  } catch {
    return null;
  }
}

function fromBase64url(value: string): Uint8Array {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
