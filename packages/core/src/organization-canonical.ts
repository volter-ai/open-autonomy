import { createHash } from 'node:crypto';

export const ORGANIZATION_CANONICAL_VERSION = 'oa-c14n-v1';

export interface SemanticDigest {
  algorithm: 'sha256';
  canonicalization: typeof ORGANIZATION_CANONICAL_VERSION;
  domain: string;
  value: string;
}

export interface CanonicalizationPolicy {
  /** Object keys omitted from semantic content at every depth. */
  nonsemanticKeys?: ReadonlySet<string>;
}

const defaultNonsemantic = new Set<string>();

/**
 * Canonical JSON for semantic hashing. Objects are unordered; arrays remain ordered. Undefined object fields are
 * absent, non-finite numbers and cycles are rejected, and -0 is normalized to 0.
 */
export function canonicalSemanticJson(value: unknown, policy: CanonicalizationPolicy = {}): string {
  const active = new Set<object>();
  const nonsemantic = policy.nonsemanticKeys ?? defaultNonsemantic;
  const encode = (current: unknown, path: string): string => {
    if (current === null) return 'null';
    if (typeof current === 'string' || typeof current === 'boolean') return JSON.stringify(current);
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) throw new Error(`${path}: non-finite number is not canonicalizable`);
      return Object.is(current, -0) ? '0' : JSON.stringify(current);
    }
    if (typeof current === 'undefined') throw new Error(`${path}: undefined array/root value is not canonicalizable`);
    if (typeof current === 'bigint' || typeof current === 'symbol' || typeof current === 'function')
      throw new Error(`${path}: ${typeof current} is not canonicalizable`);
    if (typeof current !== 'object') throw new Error(`${path}: unsupported value`);
    if (active.has(current)) throw new Error(`${path}: cyclic value is not canonicalizable`);
    active.add(current);
    try {
      if (Array.isArray(current)) return `[${current.map((item, index) => encode(item, `${path}/${index}`)).join(',')}]`;
      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) throw new Error(`${path}: non-plain object is not canonicalizable`);
      const record = current as Record<string, unknown>;
      const keys = Object.keys(record).filter((key) => record[key] !== undefined && !nonsemantic.has(key)).sort();
      return `{${keys.map((key) => `${JSON.stringify(key)}:${encode(record[key], `${path}/${escapePointer(key)}`)}`).join(',')}}`;
    } finally {
      active.delete(current);
    }
  };
  return encode(value, '');
}

export function semanticDigest(value: unknown, domain: string, policy: CanonicalizationPolicy = {}): SemanticDigest {
  if (!domain.trim()) throw new Error('semantic digest domain is required');
  const canonical = canonicalSemanticJson(value, policy);
  const framed = `${ORGANIZATION_CANONICAL_VERSION}\0${domain}\0${canonical}`;
  return {
    algorithm: 'sha256', canonicalization: ORGANIZATION_CANONICAL_VERSION, domain,
    value: createHash('sha256').update(framed).digest('hex'),
  };
}

function escapePointer(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1');
}
