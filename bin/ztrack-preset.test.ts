import { describe, expect, test } from 'bun:test';
import { resolveZtrackPreset } from './ztrack-preset';
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
