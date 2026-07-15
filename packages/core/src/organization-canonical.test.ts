import { describe, expect, test } from 'bun:test';
import { canonicalSemanticJson, semanticDigest } from './organization-canonical';

describe('P2 canonical semantic serialization', () => {
  test('is invariant under recursively permuted object keys but preserves array order', () => {
    const left = { z: 3, nested: { b: true, a: ['first', 'second'] }, a: 1 };
    const right = { a: 1, nested: { a: ['first', 'second'], b: true }, z: 3 };
    expect(canonicalSemanticJson(left)).toBe(canonicalSemanticJson(right));
    expect(semanticDigest(left, 'organization')).toEqual(semanticDigest(right, 'organization'));
    expect(semanticDigest({ ...right, nested: { ...right.nested, a: ['second', 'first'] } }, 'organization').value)
      .not.toBe(semanticDigest(left, 'organization').value);
  });

  test('excludes only declared nonsemantic metadata and retains labels and extensions', () => {
    const base = { name: 'org', labels: { security: 'high' }, extensions: { dialect: { value: 1 } } };
    const annotated = { ...base, documentation: 'new prose', provenance: [{ uri: 'file:/local/path' }] };
    const policy = { nonsemanticKeys: new Set(['documentation', 'provenance']) };
    expect(semanticDigest(base, 'organization', policy).value).toBe(semanticDigest(annotated, 'organization', policy).value);
    expect(semanticDigest(base, 'organization').value).not.toBe(semanticDigest(annotated, 'organization').value);
    expect(semanticDigest({ ...base, labels: { security: 'low' } }, 'organization').value)
      .not.toBe(semanticDigest(base, 'organization').value);
    expect(semanticDigest({ ...base, extensions: { dialect: { value: 2 } } }, 'organization').value)
      .not.toBe(semanticDigest(base, 'organization').value);
  });

  test('frames hashes by semantic domain and canonicalization version', () => {
    const value = { name: 'same' };
    expect(semanticDigest(value, 'organization').value).not.toBe(semanticDigest(value, 'deployment').value);
    expect(semanticDigest(value, 'organization')).toMatchObject({
      algorithm: 'sha256', canonicalization: 'oa-c14n-v1', domain: 'organization',
    });
  });

  test('normalizes negative zero and rejects non-finite, cyclic, and undefined sequence values', () => {
    expect(canonicalSemanticJson({ value: -0 })).toBe('{"value":0}');
    expect(() => canonicalSemanticJson({ value: Number.NaN })).toThrow('non-finite number');
    expect(() => canonicalSemanticJson([undefined])).toThrow('undefined array/root value');
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    expect(() => canonicalSemanticJson(cyclic)).toThrow('cyclic value');
    expect(() => canonicalSemanticJson({ value: '\ud800' })).toThrow('lone Unicode surrogate');
  });

  test('matches RFC 8785 number rendering and UTF-16 property ordering vectors', () => {
    expect(canonicalSemanticJson([333333333.33333329, 1e30, 4.5, 0.002, 1e-27]))
      .toBe('[333333333.3333333,1e+30,4.5,0.002,1e-27]');
    expect(canonicalSemanticJson({ '\ue000': 2, '😀': 1 })).toBe('{"😀":1,"":2}');
  });

  test('is stable over a generated family of key permutations', () => {
    const keys = Array.from({ length: 24 }, (_, index) => `k${index.toString().padStart(2, '0')}`);
    const expected = semanticDigest(Object.fromEntries(keys.map((key, index) => [key, index])), 'generated').value;
    for (let rotation = 0; rotation < keys.length; rotation++) {
      const permuted = [...keys.slice(rotation), ...keys.slice(0, rotation)].reverse();
      expect(semanticDigest(Object.fromEntries(permuted.map((key) => [key, Number(key.slice(1))])), 'generated').value).toBe(expected);
    }
  });
});
