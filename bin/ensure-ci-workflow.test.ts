import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getSetupPack } from '@open-autonomy/core';
import type { SetupPack } from '@open-autonomy/core';
import { ensureCiScaffold, ensureCiWorkflowForProfile, formatCiScaffoldResult } from './ensure-ci-workflow';

function tmpRepo(): string {
  return mkdtempSync(join(tmpdir(), 'ci-scaffold-fixture-'));
}

// A minimal pack carrying exactly one authored-workflow required check ('ci') — everything else is
// irrelevant to this module, so kept minimal (mirrors packages/core/src/setup-pack.test.ts's basePack()).
function packWith(checkRealizations: SetupPack['check_realizations']): SetupPack {
  return {
    targets: ['github'],
    codeHost: 'github',
    roster: [{ name: 'pm', kind: 'agent', behavior: 'pm', trigger: [{ cron: '*/15 * * * *' }], capabilities: ['tasks:converse'] }],
    landing_mode: 'manual-after-review',
    check_realizations: checkRealizations,
    board_seed_recipe: { originator_skill: 'planner', promotion_fence: 'state', import_verb: 'x', landing_path: 'board-pr-carveout' },
    direction_spec: { mode: 'operator' },
    human_gates: [],
    maturity_signals: { m3_tool: 'doctor', m4_predicate: 'ztrack', m6_signal: 'per-issue' },
    extra_rungs: [],
    terminal_stage: 'M5',
  };
}

const CI_PACK = packWith([{ check: 'ci', via: 'authored-workflow' }]);

function writePackageJson(dir: string, opts: { test?: boolean } = {}) {
  const pkg: Record<string, unknown> = { name: 'fixture', version: '0.0.0' };
  if (opts.test) pkg.scripts = { test: 'node --test' };
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
}

describe('ensureCiScaffold — nothing to do', () => {
  test('a pack with no authored-workflow required checks is a clean no-op', () => {
    const dir = tmpRepo();
    const pack = packWith([{ check: 'security', via: 'propose_dispatch_checks' }]);
    const r = ensureCiScaffold(dir, pack);
    expect(r.ok).toBe(true);
    expect(r.results).toEqual([]);
    expect(existsSync(join(dir, '.github'))).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  test('a pack with no check_realizations at all is a clean no-op', () => {
    const dir = tmpRepo();
    const pack = packWith(undefined);
    const r = ensureCiScaffold(dir, pack);
    expect(r.ok).toBe(true);
    expect(r.results).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('ensureCiScaffold — acceptance path 1: bare repo, detectable language, no existing workflow', () => {
  test('authors a workflow whose job name === the required check context; language = node (no bun lockfile)', () => {
    const dir = tmpRepo();
    writePackageJson(dir, { test: true });
    const r = ensureCiScaffold(dir, CI_PACK);
    expect(r.ok).toBe(true);
    expect(r.results).toHaveLength(1);
    expect(r.results[0]).toMatchObject({ check: 'ci', status: 'authored', workflowPath: join('.github', 'workflows', 'ci.yml') });
    const yaml = readFileSync(join(dir, '.github', 'workflows', 'ci.yml'), 'utf8');
    expect(yaml).toContain('name: ci');
    expect(yaml).toMatch(/jobs:\n {2}ci:\n {4}name: ci/);
    expect(yaml).toContain('actions/setup-node');
    expect(yaml).toContain('npm test');
    rmSync(dir, { recursive: true, force: true });
  });

  test('detects bun via bun.lock and emits a bun-based workflow', () => {
    const dir = tmpRepo();
    writePackageJson(dir, { test: true });
    writeFileSync(join(dir, 'bun.lock'), '{}');
    const r = ensureCiScaffold(dir, CI_PACK);
    expect(r.ok).toBe(true);
    const yaml = readFileSync(join(dir, '.github', 'workflows', 'ci.yml'), 'utf8');
    expect(yaml).toContain('oven-sh/setup-bun');
    expect(yaml).toContain('bun install');
    expect(yaml).toContain('bun run test');
    rmSync(dir, { recursive: true, force: true });
  });

  test('no test script in package.json => the authored workflow runs a no-op build step, not a guessed test command', () => {
    const dir = tmpRepo();
    writePackageJson(dir); // no scripts.test
    const r = ensureCiScaffold(dir, CI_PACK);
    expect(r.ok).toBe(true);
    const yaml = readFileSync(join(dir, '.github', 'workflows', 'ci.yml'), 'utf8');
    expect(yaml).toContain('no-op build step');
    expect(yaml).not.toContain('npm test');
    rmSync(dir, { recursive: true, force: true });
  });

  test('re-running after authoring is a no-op: second invocation reports already-realized, file byte-untouched', () => {
    const dir = tmpRepo();
    writePackageJson(dir, { test: true });
    const first = ensureCiScaffold(dir, CI_PACK);
    expect(first.results[0].status).toBe('authored');
    const before = readFileSync(join(dir, '.github', 'workflows', 'ci.yml'), 'utf8');

    const second = ensureCiScaffold(dir, CI_PACK);
    expect(second.ok).toBe(true);
    expect(second.results).toHaveLength(1);
    expect(second.results[0]).toMatchObject({ check: 'ci', status: 'already-realized', workflowPath: join('.github', 'workflows', 'ci.yml') });
    const after = readFileSync(join(dir, '.github', 'workflows', 'ci.yml'), 'utf8');
    expect(after).toBe(before); // byte-identical — never overwritten
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('ensureCiScaffold — acceptance path 2: undetectable language halts with a named blocker, writes nothing', () => {
  test('no package.json at all => blocked, exact named-blocker message, .github never created', () => {
    const dir = tmpRepo();
    const r = ensureCiScaffold(dir, CI_PACK);
    expect(r.ok).toBe(false);
    expect(r.blocker).toBe("author CI first: required check 'ci' has no workflow and language is undetectable");
    expect(r.results).toEqual([{ check: 'ci', status: 'blocked', detail: r.blocker as string }]);
    expect(existsSync(join(dir, '.github'))).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  test('an unparsable package.json is treated the same as undetectable — no crash, named blocker, no writes', () => {
    const dir = tmpRepo();
    writeFileSync(join(dir, 'package.json'), '{ not valid json');
    const r = ensureCiScaffold(dir, CI_PACK);
    expect(r.ok).toBe(false);
    expect(r.blocker).toContain('language is undetectable');
    expect(existsSync(join(dir, '.github'))).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  test('multiple authored-workflow checks + undetectable language => ALL are blocked (no partial scaffold)', () => {
    const dir = tmpRepo();
    const pack = packWith([
      { check: 'ci', via: 'authored-workflow' },
      { check: 'human-approval', via: 'authored-workflow' },
    ]);
    const r = ensureCiScaffold(dir, pack);
    expect(r.ok).toBe(false);
    expect(r.results.map((x) => x.status)).toEqual(['blocked', 'blocked']);
    expect(existsSync(join(dir, '.github'))).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('ensureCiScaffold — acceptance path 3: an already ci-posting workflow is left untouched', () => {
  test('an existing workflow whose job name already equals the check context is reported already-realized, byte-untouched', () => {
    const dir = tmpRepo();
    writePackageJson(dir, { test: true });
    mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
    const existing = ['name: My Custom CI', 'on: [push, pull_request]', 'jobs:', '  ci:', '    runs-on: ubuntu-latest', '    steps:', '      - run: echo hand-rolled', ''].join('\n');
    writeFileSync(join(dir, '.github', 'workflows', 'my-ci.yml'), existing);

    const r = ensureCiScaffold(dir, CI_PACK);
    expect(r.ok).toBe(true);
    expect(r.results).toEqual([{ check: 'ci', status: 'already-realized', workflowPath: join('.github', 'workflows', 'my-ci.yml'), detail: `already realized by ${join('.github', 'workflows', 'my-ci.yml')}` }]);
    expect(readFileSync(join(dir, '.github', 'workflows', 'my-ci.yml'), 'utf8')).toBe(existing);
    // and no NEW file was authored either
    expect(existsSync(join(dir, '.github', 'workflows', 'ci.yml'))).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  test('a workflow-level `name:` match (not just a job name) also counts as already-realized', () => {
    const dir = tmpRepo();
    mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
    const existing = ['name: ci', 'on: [push]', 'jobs:', '  build:', '    runs-on: ubuntu-latest', '    steps: []', ''].join('\n');
    writeFileSync(join(dir, '.github', 'workflows', 'build.yml'), existing);

    const r = ensureCiScaffold(dir, CI_PACK);
    expect(r.ok).toBe(true);
    expect(r.results[0].status).toBe('already-realized');
    expect(r.results[0].workflowPath).toBe(join('.github', 'workflows', 'build.yml'));
    rmSync(dir, { recursive: true, force: true });
  });

  test('an unrelated existing workflow (does not post the required context) does not block authoring a NEW one, and is left alone', () => {
    const dir = tmpRepo();
    writePackageJson(dir, { test: true });
    mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
    const unrelated = ['name: Deploy', 'on: [push]', 'jobs:', '  deploy:', '    runs-on: ubuntu-latest', '    steps: []', ''].join('\n');
    writeFileSync(join(dir, '.github', 'workflows', 'deploy.yml'), unrelated);

    const r = ensureCiScaffold(dir, CI_PACK);
    expect(r.ok).toBe(true);
    expect(r.results[0].status).toBe('authored');
    expect(readFileSync(join(dir, '.github', 'workflows', 'deploy.yml'), 'utf8')).toBe(unrelated);
    expect(existsSync(join(dir, '.github', 'workflows', 'ci.yml'))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('ensureCiScaffold — filename collision safety', () => {
  test('an unrelated file already named <check>.yml is never clobbered — a suffixed filename is chosen instead', () => {
    const dir = tmpRepo();
    writePackageJson(dir, { test: true });
    mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
    const unrelatedCiYml = ['name: Something Else', 'on: [push]', 'jobs:', '  other:', '    runs-on: ubuntu-latest', '    steps: []', ''].join('\n');
    writeFileSync(join(dir, '.github', 'workflows', 'ci.yml'), unrelatedCiYml);

    const r = ensureCiScaffold(dir, CI_PACK);
    expect(r.ok).toBe(true);
    expect(r.results[0].status).toBe('authored');
    expect(r.results[0].workflowPath).not.toBe(join('.github', 'workflows', 'ci.yml'));
    expect(readFileSync(join(dir, '.github', 'workflows', 'ci.yml'), 'utf8')).toBe(unrelatedCiYml); // untouched
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('formatCiScaffoldResult', () => {
  test('renders one line per check and appends the blocker when blocked', () => {
    const r = ensureCiScaffold(tmpRepo(), CI_PACK); // undetectable language (no package.json)
    const out = formatCiScaffoldResult(r);
    expect(out).toContain('[blocked] ci');
    expect(out).toContain("BLOCKED: author CI first: required check 'ci' has no workflow and language is undetectable");
  });
});

// --- integration with the real TS.1 SetupPack loader against a real baseline profile ---------------------
describe('ensureCiWorkflowForProfile — integration with the real simple-gh SetupPack (TS.1 getSetupPack)', () => {
  test("simple-gh's pack declares ci as authored-workflow, and the scaffold correctly authors it on a bare fixture repo", () => {
    const pack = getSetupPack('profiles/simple-gh');
    expect(pack.check_realizations).toEqual([{ check: 'ci', via: 'authored-workflow' }]);

    const dir = tmpRepo();
    writePackageJson(dir, { test: true });
    const r = ensureCiWorkflowForProfile(dir, 'profiles/simple-gh');
    expect(r.ok).toBe(true);
    expect(r.results[0]).toMatchObject({ check: 'ci', status: 'authored' });
    rmSync(dir, { recursive: true, force: true });
  });

  test("self-driving declares BOTH 'ci' and 'human-approval' as authored-workflow (ci.yml is repo-owned per pr-141 — neither ships as a profile resource on a bare install), so a bare fixture needs both authored", () => {
    const pack = getSetupPack('profiles/self-driving');
    const authoredWorkflowChecks = (pack.check_realizations ?? []).filter((cr) => cr.via === 'authored-workflow').map((cr) => cr.check);
    expect(authoredWorkflowChecks.sort()).toEqual(['ci', 'human-approval']);

    const dir = tmpRepo();
    writePackageJson(dir, { test: true });
    const r = ensureCiWorkflowForProfile(dir, 'profiles/self-driving');
    expect(r.ok).toBe(true);
    expect(r.results.map((x) => ({ check: x.check, status: x.status })).sort((a, b) => a.check.localeCompare(b.check))).toEqual([
      { check: 'ci', status: 'authored' },
      { check: 'human-approval', status: 'authored' },
    ]);
    rmSync(dir, { recursive: true, force: true });
  });

  test("self-driving on an install that ALREADY carries the profile-shipped human-approval.yml resource realizes 'human-approval' as already-realized and only authors 'ci'", () => {
    const dir = tmpRepo();
    writePackageJson(dir, { test: true });
    mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
    // mirrors this repo's own compiled .github/workflows/human-approval.yml: workflow name === job name === 'human-approval'
    writeFileSync(join(dir, '.github', 'workflows', 'human-approval.yml'), ['name: human-approval', 'on: [pull_request_target]', 'jobs:', '  human-approval:', '    runs-on: ubuntu-latest', '    steps: []', ''].join('\n'));

    const r = ensureCiWorkflowForProfile(dir, 'profiles/self-driving');
    expect(r.ok).toBe(true);
    const byCheck = Object.fromEntries(r.results.map((x) => [x.check, x.status]));
    expect(byCheck['human-approval']).toBe('already-realized');
    expect(byCheck['ci']).toBe('authored');
    rmSync(dir, { recursive: true, force: true });
  });
});
