// TS.1 acceptance tests — packages/core/src/setup-pack.ts. Run via `bun run check:core`
// (`bun test packages/*/src/*.test.ts`), cwd = repo root, so profile paths below are repo-root-relative —
// same convention as bin/lint-profile.test.ts's `lint('profiles/hello')`.
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getSetupPack, validateSetupPack } from './setup-pack';
import type { SetupPack } from './setup-pack';

// --- a minimal valid pack, mutated per-test for validateSetupPack's structural checks ---------------
function basePack(): SetupPack {
  return {
    targets: ['local'],
    codeHost: 'local-git',
    roster: [{ name: 'pm', kind: 'agent', behavior: 'pm', trigger: [{ cron: '*/15 * * * *' }], capabilities: ['tasks:converse'] }],
    landing_mode: 'pr-free',
    board_seed_recipe: { originator_skill: 'draft', promotion_fence: 'state', import_verb: 'ztrack issue add', landing_path: 'direct' },
    direction_spec: { mode: 'operator' },
    human_gates: [],
    maturity_signals: { m3_tool: 'doctor', m4_predicate: 'ztrack', m6_signal: 'per-issue' },
    extra_rungs: [],
    terminal_stage: 'M5',
  };
}

// --- a throwaway profile fixture on disk, for getSetupPack's file-reading path ------------------------
function fixtureProfile(irYml: string, setupPackYml?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'setup-pack-fixture-'));
  writeFileSync(join(dir, 'ir.yml'), irYml);
  mkdirSync(join(dir, 'skills', 'pm'), { recursive: true });
  writeFileSync(join(dir, 'skills', 'pm', 'SKILL.md'), '---\nname: pm\ndescription: test\n---\n# pm\n');
  if (setupPackYml !== undefined) writeFileSync(join(dir, 'setup-pack.yml'), setupPackYml);
  return dir;
}

const MINIMAL_IR = [
  'schema: autonomy.ir.v1',
  'targets: [local]',
  'codeHost: local-git',
  'agents:',
  '  pm:',
  '    behavior: pm',
  '    capabilities: [tasks:converse]',
  '    triggers:',
  '      - cron: "*/15 * * * *"',
  'policy:',
  '  box: {}',
  'resources: []',
  '',
].join('\n');

describe('validateSetupPack — structural validation', () => {
  test('a well-formed pack validates with zero errors', () => {
    expect(validateSetupPack(basePack())).toEqual([]);
  });

  test('missing landing_mode FAILS validation', () => {
    const pack = basePack();
    // @ts-expect-error — deliberately simulating a missing/omitted field (e.g. from untyped YAML)
    delete pack.landing_mode;
    const errors = validateSetupPack(pack);
    expect(errors.some((e) => e.includes('landing_mode'))).toBe(true);
  });

  test('an invalid landing_mode value FAILS validation', () => {
    const pack = basePack();
    // @ts-expect-error — 'human-approval' is a required_check, never a landing_mode; a pack that says
    // otherwise must fail (DESIGN §Q0's explicit correction).
    pack.landing_mode = 'human-approval';
    const errors = validateSetupPack(pack);
    expect(errors.some((e) => e.includes('landing_mode'))).toBe(true);
  });

  test('landing_mode accepts EXACTLY the three declared values, nothing else', () => {
    for (const v of ['auto-merge', 'manual-after-review', 'pr-free'] as const) {
      const pack = basePack();
      pack.landing_mode = v;
      expect(validateSetupPack(pack)).toEqual([]);
    }
  });

  test('an invalid board_seed_recipe.promotion_fence FAILS validation', () => {
    const pack = basePack();
    // @ts-expect-error — invalid enum value
    pack.board_seed_recipe.promotion_fence = 'vibes';
    expect(validateSetupPack(pack).some((e) => e.includes('promotion_fence'))).toBe(true);
  });

  test('an invalid maturity_signals.m6_signal FAILS validation', () => {
    const pack = basePack();
    // @ts-expect-error — invalid enum value
    pack.maturity_signals.m6_signal = 'vibes';
    expect(validateSetupPack(pack).some((e) => e.includes('m6_signal'))).toBe(true);
  });

  test('an invalid terminal_stage FAILS validation', () => {
    const pack = basePack();
    // @ts-expect-error — only M5|M6 are valid
    pack.terminal_stage = 'M7';
    expect(validateSetupPack(pack).some((e) => e.includes('terminal_stage'))).toBe(true);
  });

  test('GitHub-only fields (required_checks, check_realizations, enforce_admins, labels) absent validates OK', () => {
    const pack = basePack(); // basePack already omits all four
    expect(pack.required_checks).toBeUndefined();
    expect(pack.check_realizations).toBeUndefined();
    expect(pack.enforce_admins).toBeUndefined();
    expect(pack.labels).toBeUndefined();
    expect(validateSetupPack(pack)).toEqual([]);
  });

  test('an invalid check_realizations[].via FAILS validation when the field IS present', () => {
    const pack = basePack();
    // @ts-expect-error — invalid enum value
    pack.check_realizations = [{ check: 'ci', via: 'magic' }];
    expect(validateSetupPack(pack).some((e) => e.includes('check_realizations'))).toBe(true);
  });
});

describe('getSetupPack — file-reading + composition path', () => {
  test('missing setup-pack.yml throws (no silent partial pack)', () => {
    const dir = fixtureProfile(MINIMAL_IR /* no setup-pack.yml */);
    expect(() => getSetupPack(dir)).toThrow(/setup-pack\.yml missing/);
    rmSync(dir, { recursive: true, force: true });
  });

  test('an invalid hand-authored landing_mode throws with the validation error surfaced', () => {
    const dir = fixtureProfile(
      MINIMAL_IR,
      ['landing_mode: not-a-real-mode', 'board_seed_recipe: { originator_skill: pm, promotion_fence: state, import_verb: x, landing_path: direct }', 'maturity_signals: { m3_tool: doctor, m4_predicate: ztrack, m6_signal: per-issue }', 'terminal_stage: M5', ''].join('\n'),
    );
    expect(() => getSetupPack(dir)).toThrow(/landing_mode/);
    rmSync(dir, { recursive: true, force: true });
  });

  test('direction_spec derives documents.roles from ir.yml when the profile declares one and the pack omits it', () => {
    const irWithDocs = MINIMAL_IR.replace(
      'agents:',
      ['documents:', '  roles:', '    vision: docs/VISION.md', '    constitution: docs/CONSTITUTION.md', 'agents:'].join('\n'),
    );
    const dir = fixtureProfile(
      irWithDocs,
      ['landing_mode: auto-merge', 'board_seed_recipe: { originator_skill: pm, promotion_fence: upstream-ratified, import_verb: x, landing_path: direct }', 'maturity_signals: { m3_tool: gh-preflight, m4_predicate: gh-issues, m6_signal: roadmap-rollup }', 'terminal_stage: M5', ''].join('\n'),
    );
    const pack = getSetupPack(dir);
    expect(pack.direction_spec.mode).toBe('documents.roles');
    expect(pack.direction_spec.templates).toEqual(['docs/VISION.md', 'docs/CONSTITUTION.md']);
    rmSync(dir, { recursive: true, force: true });
  });

  test('direction_spec derives operator when ir.yml declares no documents block', () => {
    const dir = fixtureProfile(
      MINIMAL_IR,
      ['landing_mode: pr-free', 'board_seed_recipe: { originator_skill: pm, promotion_fence: state, import_verb: x, landing_path: direct }', 'maturity_signals: { m3_tool: doctor, m4_predicate: ztrack, m6_signal: per-issue }', 'terminal_stage: M5', ''].join('\n'),
    );
    expect(getSetupPack(dir).direction_spec.mode).toBe('operator');
    rmSync(dir, { recursive: true, force: true });
  });
});

// --- TS.1's exact acceptance bullets, asserted against the four REAL baseline packs -------------------
describe('TS.1 acceptance — the four real baseline packs', () => {
  test('simple-gh: landing_mode = manual-after-review (cf ir.yml merge_policy)', () => {
    expect(getSetupPack('profiles/simple-gh').landing_mode).toBe('manual-after-review');
  });

  test('simple-gh-sdlc: landing_mode = auto-merge', () => {
    expect(getSetupPack('profiles/simple-gh-sdlc').landing_mode).toBe('auto-merge');
  });

  test('self-driving: landing_mode = auto-merge (NOT a fourth mode)', () => {
    expect(getSetupPack('profiles/self-driving').landing_mode).toBe('auto-merge');
  });

  test('simple-sdlc: landing_mode = pr-free', () => {
    expect(getSetupPack('profiles/simple-sdlc').landing_mode).toBe('pr-free');
  });

  test("self-driving: 'human-approval' appears in required_checks, NOT as landing_mode", () => {
    const pack = getSetupPack('profiles/self-driving');
    expect(pack.required_checks).toContain('human-approval');
    expect(pack.landing_mode).not.toBe('human-approval');
    expect(['auto-merge', 'manual-after-review', 'pr-free']).toContain(pack.landing_mode);
  });

  test("simple-gh: board_seed_recipe.landing_path = 'board-pr-carveout'", () => {
    expect(getSetupPack('profiles/simple-gh').board_seed_recipe.landing_path).toBe('board-pr-carveout');
  });

  test("self-driving: board_seed_recipe.promotion_fence = 'upstream-ratified'", () => {
    expect(getSetupPack('profiles/self-driving').board_seed_recipe.promotion_fence).toBe('upstream-ratified');
  });

  test('simple-sdlc: GitHub fields absent, and the pack still validates OK', () => {
    const pack = getSetupPack('profiles/simple-sdlc');
    expect(pack.required_checks).toBeUndefined();
    expect(pack.check_realizations).toBeUndefined();
    expect(pack.enforce_admins).toBeUndefined();
    expect(pack.labels).toBeUndefined();
    expect(validateSetupPack(pack)).toEqual([]);
  });

  test('every baseline profile (simple-gh, simple-gh-sdlc, self-driving, simple-sdlc) returns a validated pack', () => {
    for (const p of ['simple-gh', 'simple-gh-sdlc', 'self-driving', 'simple-sdlc']) {
      const pack = getSetupPack(`profiles/${p}`);
      expect(validateSetupPack(pack)).toEqual([]);
    }
  });

  test('the roster is a view over ir.yml agents (not hand-duplicated) — self-driving carries its maintainer as kind:human', () => {
    const pack = getSetupPack('profiles/self-driving');
    const maintainer = pack.roster.find((r) => r.name === 'maintainer');
    expect(maintainer?.kind).toBe('human');
  });
});
