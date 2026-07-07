import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KNOWN_GOOD_ZTRACK, resolveZtrackPreset } from './ztrack-preset';
import type { AutonomyIR } from '@open-autonomy/core';

function ir(box: Record<string, unknown> = {}): AutonomyIR {
  return { schema: 'autonomy.ir.v1', targets: ['local'], agents: {}, policy: { box }, resources: [] };
}

describe('resolveZtrackPreset (BL-29 dev/01)', () => {
  test('an explicit policy.box.tracker.ztrackPreset always wins, even over a renamed directory', () => {
    const r = resolveZtrackPreset(ir({ tracker: { ztrackPreset: 'simple-gh-sdlc' } }), 'my-forked-copy', ['self-driving']);
    expect(r.presetName).toBe('simple-gh-sdlc');
    expect(r.warning).toBeUndefined();
  });

  test('falls back to the directory basename when undeclared, no warning if it matches a bundled name', () => {
    const r = resolveZtrackPreset(ir(), 'simple-sdlc', ['self-driving', 'simple-sdlc', 'simple-gh-sdlc']);
    expect(r.presetName).toBe('simple-sdlc');
    expect(r.warning).toBeUndefined();
  });

  test('degrades LOUDLY (not silently) when the basename fallback matches no bundled preset', () => {
    const r = resolveZtrackPreset(ir(), 'my-renamed-fork', ['self-driving', 'simple-sdlc', 'simple-gh-sdlc']);
    expect(r.presetName).toBe('my-renamed-fork');
    expect(r.warning).toBeDefined();
    expect(r.warning).toContain('no policy.box.tracker.ztrackPreset');
    expect(r.warning).toContain('my-renamed-fork');
  });
});

describe('KNOWN_GOOD_ZTRACK (OA-12, F-11: version drift)', () => {
  test('stays in sync with package.json\'s own ztrack devDependency pin — bump both together', () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf8'));
    expect(KNOWN_GOOD_ZTRACK).toBe(pkg.devDependencies.ztrack);
  });
});
