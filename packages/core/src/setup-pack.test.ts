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

// --- TP.1 acceptance — the simple-gh-sdlc pack asserted field-by-field against DESIGN §Q1's ladder ------
// ("`M3` adds required checks ci+agent-review+security with an independent reviewer posting agent-review
// (ir.yml:44-49) and auto-merge armed only after a supervised first merge -> M4 vision anchor (added) +
// >=1 GitHub issue with ready label + AC body (skills/pm/SKILL.md:18-24) -> M5 pm tick dispatches develop
// -> M6 a merged PR that passed ci+agent-review+security closed a ready issue
// (scripts/reconcile-merged-issues.ts:25-29). m3_tool: doctor(local)/gh-preflight(hosted) - m4_predicate:
// gh-issues - m6_signal: merged-PR->issue-close. Terminal one-shot: M5; M6 observable.")
describe('TP.1 acceptance — simple-gh-sdlc pack vs DESIGN §Q1 (the simple-gh-sdlc ladder)', () => {
  const pack = getSetupPack('profiles/simple-gh-sdlc');

  test('landing_mode: auto-merge (GitHub native, gated on ci+agent-review+security)', () => {
    expect(pack.landing_mode).toBe('auto-merge');
  });

  test('required_checks (provision.json view): exactly ci, agent-review, security', () => {
    expect(pack.required_checks).toEqual(['ci', 'agent-review', 'security']);
  });

  test('check_realizations: ci->authored-workflow, agent-review->native, security->propose_dispatch_checks (names don\'t self-realize)', () => {
    const byCheck = Object.fromEntries((pack.check_realizations ?? []).map((cr) => [cr.check, cr.via]));
    expect(byCheck).toEqual({ ci: 'authored-workflow', 'agent-review': 'native', security: 'propose_dispatch_checks' });
  });

  test('board_seed_recipe: planner originates, `ready` LABEL is the promotion fence, tasks:author files directly (no PR — planner holds no code:propose)', () => {
    expect(pack.board_seed_recipe).toEqual({
      originator_skill: 'planner',
      promotion_fence: 'label',
      import_verb: 'tasks:author',
      landing_path: 'direct',
    });
  });

  test('direction_spec: operator (ir.yml declares no documents.roles block for this profile)', () => {
    expect(pack.direction_spec.mode).toBe('operator');
  });

  test('maturity_signals: m4_predicate=gh-issues, m6_signal=pr-close (merged-PR -> issue-close, reconcile-merged-issues.ts)', () => {
    expect(pack.maturity_signals.m4_predicate).toBe('gh-issues');
    expect(pack.maturity_signals.m6_signal).toBe('pr-close');
  });

  test("maturity_signals.m3_tool: 'doctor' — this profile's ONE declared (schema-singular) value; the LOCAL leg of DESIGN's \"doctor(local)/gh-preflight(hosted)\" split. The hosted leg is mechanized by the composer's target-aware fallback (maturity.test.ts's dual-target fixture), not by a second pack field.", () => {
    expect(pack.maturity_signals.m3_tool).toBe('doctor');
  });

  test('extra_rungs: none — the common M0-M5 spine only (no self-driving-style extra rungs for this profile)', () => {
    expect(pack.extra_rungs).toEqual([]);
  });

  test('terminal_stage: M5 (one-shot terminal target; M6 merged-PR->issue-close is observable, async)', () => {
    expect(pack.terminal_stage).toBe('M5');
  });

  test('enforce_admins: true (provision.json view — only human admins can direct-push; agents forced through gated PRs)', () => {
    expect(pack.enforce_admins).toBe(true);
  });

  test('codeHost=github, targets include BOTH gh-actions and local (dual-target — the m3_tool split reason)', () => {
    expect(pack.codeHost).toBe('github');
    expect(pack.targets).toContain('gh-actions');
    expect(pack.targets).toContain('local');
  });

  test('the pack validates structurally with zero errors (drift-vs-ir.yml/provision.json/skills is bin/check-setup-pack.test.ts\'s own coverage, not duplicated here)', () => {
    expect(validateSetupPack(pack)).toEqual([]);
  });
});
