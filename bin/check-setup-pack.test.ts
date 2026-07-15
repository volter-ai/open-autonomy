import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseIr } from '@open-autonomy/core';
import { checkPackDrift, profilesWithPack } from './check-setup-pack';

function fixture(opts: { ir: string; pack: string; provision?: string; skills?: Record<string, string> }): string {
  const dir = mkdtempSync(join(tmpdir(), 'setup-pack-drift-'));
  writeFileSync(join(dir, 'ir.yml'), opts.ir);
  writeFileSync(join(dir, 'setup-pack.yml'), opts.pack);
  if (opts.provision) writeFileSync(join(dir, 'provision.json'), opts.provision);
  for (const [agent, body] of Object.entries(opts.skills ?? {})) {
    mkdirSync(join(dir, 'skills', agent), { recursive: true });
    writeFileSync(join(dir, 'skills', agent, 'SKILL.md'), body);
  }
  return dir;
}

const IR_WITH_REVIEWER = [
  'schema: autonomy.ir.v1',
  'targets: [gh-actions]',
  'codeHost: github',
  'agents:',
  '  develop:',
  '    behavior: develop',
  '    capabilities: [code:propose, tasks:converse]',
  '    review: reviewer',
  '    triggers: [{ dispatch: true }]',
  '  reviewer:',
  '    behavior: reviewer',
  '    capabilities: [code:review, tasks:converse]',
  '    result: { schema: open-autonomy.review.v1 }',
  '    triggers: [{ dispatch: true, params: { TARGET_REF: subject.ref } }]',
  'policy:',
  '  box: {}',
  'resources: []',
  '',
].join('\n');

const IR_NO_REVIEWER = [
  'schema: autonomy.ir.v1',
  'targets: [local]',
  'codeHost: github',
  'agents:',
  '  manager:',
  '    behavior: manager',
  '    capabilities: [code:propose, tasks:converse]',
  '    triggers: [{ cron: "*/30 * * * *" }]',
  'policy:',
  '  box: {}',
  'resources: []',
  '',
].join('\n');

// These fixtures are the subjects of the contradiction tests below. Keep them independently valid so
// a new IR invariant cannot make getSetupPack fail early and silently turn every semantic assertion into
// a false negative with an unrelated "pack failed to load/validate" result.
test('setup-pack contradiction fixtures remain valid profile IR', () => {
  expect(() => parseIr(IR_WITH_REVIEWER)).not.toThrow();
  expect(() => parseIr(IR_NO_REVIEWER)).not.toThrow();
});

describe('checkPackDrift — the four real baseline packs are drift-free', () => {
  for (const p of ['profiles/simple-gh', 'profiles/simple-gh-sdlc', 'profiles/self-driving', 'profiles/simple-sdlc']) {
    test(`${p} has zero drift/contradictions`, () => {
      expect(checkPackDrift(p)).toEqual([]);
    });
  }
});

describe('checkPackDrift — real contradictions are caught (not a stub)', () => {
  test("auto-merge with no agent-review realization FAILS (the task's own example)", () => {
    const dir = fixture({
      ir: IR_WITH_REVIEWER,
      pack: [
        'landing_mode: auto-merge',
        'check_realizations:',
        '  - { check: ci, via: authored-workflow }',
        'board_seed_recipe: { originator_skill: pm, promotion_fence: label, import_verb: x, landing_path: direct }',
        'maturity_signals: { m3_tool: gh-preflight, m4_predicate: gh-issues, m6_signal: pr-close }',
        'terminal_stage: M5',
        '',
      ].join('\n'),
      provision: JSON.stringify({ branch_protection: { required_checks: ['ci'] } }),
    });
    const errors = checkPackDrift(dir);
    expect(errors.some((e) => e.includes('agent-review'))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  test('auto-merge with agent-review realized but no code:review agent FAILS', () => {
    const dir = fixture({
      ir: IR_NO_REVIEWER,
      pack: [
        'landing_mode: auto-merge',
        'check_realizations:',
        '  - { check: agent-review, via: native }',
        'board_seed_recipe: { originator_skill: pm, promotion_fence: label, import_verb: x, landing_path: direct }',
        'maturity_signals: { m3_tool: doctor, m4_predicate: gh-issues, m6_signal: pr-close }',
        'terminal_stage: M5',
        '',
      ].join('\n'),
      provision: JSON.stringify({ branch_protection: { required_checks: ['agent-review'] } }),
    });
    const errors = checkPackDrift(dir);
    expect(errors.some((e) => e.includes('no agent in ir.yml holds code:review'))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  test('manual-after-review declaring agent-review FAILS (self-check on a shared token is dishonest)', () => {
    const dir = fixture({
      ir: IR_WITH_REVIEWER,
      pack: [
        'landing_mode: manual-after-review',
        'check_realizations:',
        '  - { check: agent-review, via: native }',
        'board_seed_recipe: { originator_skill: pm, promotion_fence: state, import_verb: x, landing_path: direct }',
        'maturity_signals: { m3_tool: doctor, m4_predicate: ztrack, m6_signal: per-issue }',
        'terminal_stage: M5',
        '',
      ].join('\n'),
      provision: JSON.stringify({ branch_protection: { required_checks: ['agent-review'] } }),
    });
    const errors = checkPackDrift(dir);
    expect(errors.some((e) => e.includes("manual-after-review"))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  test('pr-free declaring required_checks FAILS (no PR exists for a check to gate)', () => {
    const dir = fixture({
      ir: IR_NO_REVIEWER,
      pack: [
        'landing_mode: pr-free',
        'board_seed_recipe: { originator_skill: pm, promotion_fence: state, import_verb: x, landing_path: direct }',
        'maturity_signals: { m3_tool: doctor, m4_predicate: ztrack, m6_signal: per-issue }',
        'terminal_stage: M5',
        '',
      ].join('\n'),
      provision: JSON.stringify({ branch_protection: { required_checks: ['ci'] } }),
    });
    const errors = checkPackDrift(dir);
    expect(errors.some((e) => e.includes("pr-free"))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  test('a required check with no realization FAILS ("names don\'t self-realize")', () => {
    const dir = fixture({
      ir: IR_WITH_REVIEWER,
      pack: [
        'landing_mode: auto-merge',
        'check_realizations:',
        '  - { check: agent-review, via: native }',
        'board_seed_recipe: { originator_skill: pm, promotion_fence: label, import_verb: x, landing_path: direct }',
        'maturity_signals: { m3_tool: doctor, m4_predicate: gh-issues, m6_signal: pr-close }',
        'terminal_stage: M5',
        '',
      ].join('\n'),
      provision: JSON.stringify({ branch_protection: { required_checks: ['ci', 'agent-review'] } }),
    });
    const errors = checkPackDrift(dir);
    expect(errors.some((e) => e.includes("'ci'") && e.includes('no entry'))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  test('required_checks human-approval with no kind:human actor FAILS', () => {
    const dir = fixture({
      ir: IR_WITH_REVIEWER,
      pack: [
        'landing_mode: auto-merge',
        'check_realizations:',
        '  - { check: agent-review, via: native }',
        '  - { check: human-approval, via: authored-workflow }',
        'board_seed_recipe: { originator_skill: pm, promotion_fence: label, import_verb: x, landing_path: direct }',
        'maturity_signals: { m3_tool: gh-preflight, m4_predicate: gh-issues, m6_signal: pr-close }',
        'terminal_stage: M5',
        '',
      ].join('\n'),
      provision: JSON.stringify({ branch_protection: { required_checks: ['agent-review', 'human-approval'] } }),
    });
    const errors = checkPackDrift(dir);
    expect(errors.some((e) => e.includes('human-approval') && e.includes('kind:human'))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  test("promotion_fence 'upstream-ratified' with no roadmap-ratification loop FAILS", () => {
    const dir = fixture({
      ir: IR_WITH_REVIEWER,
      pack: [
        'landing_mode: auto-merge',
        'check_realizations:',
        '  - { check: agent-review, via: native }',
        'board_seed_recipe: { originator_skill: planner, promotion_fence: upstream-ratified, import_verb: x, landing_path: direct }',
        'maturity_signals: { m3_tool: gh-preflight, m4_predicate: gh-issues, m6_signal: roadmap-rollup }',
        'terminal_stage: M5',
        '',
      ].join('\n'),
      provision: JSON.stringify({ branch_protection: { required_checks: ['agent-review'] } }),
    });
    const errors = checkPackDrift(dir);
    expect(errors.some((e) => e.includes('upstream-ratified'))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  test("landing_path 'board-pr-carveout' with no carve-out documented in any SKILL.md FAILS", () => {
    const dir = fixture({
      ir: IR_NO_REVIEWER,
      pack: [
        'landing_mode: manual-after-review',
        'board_seed_recipe: { originator_skill: manager, promotion_fence: state, import_verb: x, landing_path: board-pr-carveout }',
        'maturity_signals: { m3_tool: doctor, m4_predicate: ztrack, m6_signal: per-issue }',
        'terminal_stage: M5',
        '',
      ].join('\n'),
      skills: { manager: '---\nname: manager\ndescription: test\n---\n# manager\nMerges its own PRs after CI is green.\n' },
    });
    const errors = checkPackDrift(dir);
    expect(errors.some((e) => e.includes('board-pr-carveout'))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  test('a pack that fails structural validation (getSetupPack throws) is reported, not thrown', () => {
    const dir = fixture({ ir: IR_NO_REVIEWER, pack: 'landing_mode: not-a-real-mode\n' });
    const errors = checkPackDrift(dir);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('failed to load/validate');
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('profilesWithPack — finds exactly the profiles carrying setup-pack.yml', () => {
  test('the real catalog currently has the four TS.1 baseline profiles', () => {
    const found = profilesWithPack().sort();
    expect(found).toContain('profiles/simple-gh');
    expect(found).toContain('profiles/simple-gh-sdlc');
    expect(found).toContain('profiles/self-driving');
    expect(found).toContain('profiles/simple-sdlc');
  });
});
