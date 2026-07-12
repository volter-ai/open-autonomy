// TE.7 acceptance tests — bin/install-prove-advancing.ts (Phase 7 PROVE ADVANCING, the final unit).
// Three report shapes + pass-through-evidence fidelity, per the task brief's own acceptance section:
//   1. ADVANCING       — reuses TF.1's OWN fixture positive-path VERBATIM (m6-signal.test.ts's "TRUE
//      (fixture)" case: profiles/self-driving, issue #999 / merged PR #1000, roadmap:fixture-item label,
//      all 4 required checks SUCCESS) — proves present:true is reported with TF.1's evidence passed through
//      unmodified, and TB.2/computeMaturity is never invoked on this path.
//   2. TICKED_WITHOUT_ADVANCING — a pr-free (simple-sdlc-shaped) fixture install that reaches M5/RUNNING
//      (fence lifted + a recorded last-fire, mirroring maturity.test.ts's own M5-boundary fixture) but
//      whose ztrack board has zero 'done' items — DESIGN's own "empty board" example of "ticks without
//      advancing". Distinguishes this from case 3 by citing the ACTUAL composed stage (M5).
//   3. NOT_YET_M5      — a freshly-compiled, nothing-committed install (maturity.test.ts's own M2-boundary
//      fixture) — never reached M5 at all; the missing rung cites TB.2's own blockers[0].
// Plus CLI-level tests (parseArgs/run/USAGE) mirroring bin/install-select.test.ts's own conventions.
//
// House style (mirrors maturity.test.ts / m6-signal.test.ts): filesystem/git-shaped state is built against
// REAL temp dirs with REAL git plumbing; `gh`/`ztrack` are driven through StubProc — no real network call,
// no real `gh`/`ztrack` auth required to run this suite. The LIVE proof (real vendored `gh`, real repo) is
// the PR body's transcript, not this file.
import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { missionAdvancingSignal } from '../packages/local-runner-cli/src/m6-signal.ts';
import { defaultProc } from '../packages/local-runner-cli/src/proc.ts';
import { StubProc, fail, ok } from '../packages/local-runner-cli/src/test-support/stub-proc.ts';
import type { ProcRunner } from '../packages/local-runner-cli/src/types.ts';
import { parseArgs, proveAdvancing, renderReportHuman, run } from './install-prove-advancing.ts';

const REPO_ROOT = join(import.meta.dir, '..');
const SELF_DRIVING_PROFILE_DIR = join(REPO_ROOT, 'profiles', 'self-driving');
const SELF_DRIVING_REPO = 'volter-ai/open-autonomy';
const SELF_DRIVING_CHECKS = ['ci', 'agent-review', 'security', 'human-approval'];

function tmpDir(prefix = 'oa-te7-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

// --- fixture-building helpers, mirroring maturity.test.ts's own (not exported from a .test.ts file, so
// reimplemented here in miniature — same shapes, same conventions). ----------------------------------------

function withRealGit(stub: StubProc): ProcRunner {
  return (cmd, args, opts) => (cmd === 'git' ? defaultProc(cmd, args, opts) : stub.runner(cmd, args, opts));
}

function writeGenerated(dir: string, files: string[]): void {
  mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
  writeFileSync(join(dir, '.open-autonomy', 'generated.json'), JSON.stringify({ schema: 'open-autonomy.generated.v1', files: [...files].sort() }, null, 2));
}

function writeAutonomyYml(dir: string): void {
  mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
  writeFileSync(
    join(dir, '.open-autonomy', 'autonomy.yml'),
    JSON.stringify({ schema: 'open-autonomy.autonomy.v1', codeHost: 'local-git', agents: { pm: { skill: 'pm', triggers: { schedule: '*/15 * * * *' } } } }),
  );
}

function writeSchedule(dir: string, opts: { pin?: string } = {}): void {
  mkdirSync(join(dir, 'scheduler'), { recursive: true });
  const body: Record<string, unknown> = { intervalSeconds: 900, scripts: ['bun scripts/sweep.ts'] };
  if (opts.pin) body.env = { TERMFLEET_PROVIDER_URL: opts.pin };
  writeFileSync(join(dir, 'scheduler', 'schedule.json'), JSON.stringify(body));
}

function gitInit(dir: string): void {
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'te7-test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'TE7 test'], { cwd: dir });
}
function gitCommitAll(dir: string): void {
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'install harness'], { cwd: dir });
}

/** Mirrors maturity.test.ts's writeLocalGitProfile, but with a FULLY VALID ir.yml (this tool's own
 *  getSetupPack step (a) runs core's real parseIr+validateIR, unlike maturity.ts's own dependency-free
 *  miniature `readPack` — the minimal shape here mirrors packages/core/src/setup-pack.test.ts's
 *  MINIMAL_IR exactly). A minimal pr-free, ztrack-board fixture PROFILE dir. */
function writeLocalGitProfile(profileDir: string): void {
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(
    join(profileDir, 'ir.yml'),
    [
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
    ].join('\n'),
  );
  mkdirSync(join(profileDir, 'skills', 'pm'), { recursive: true });
  writeFileSync(join(profileDir, 'skills', 'pm', 'SKILL.md'), '---\nname: pm\ndescription: test\n---\n# pm\n');
  writeFileSync(
    join(profileDir, 'setup-pack.yml'),
    [
      'landing_mode: pr-free',
      'board_seed_recipe: {originator_skill: draft, promotion_fence: state, import_verb: "ztrack issue add", landing_path: direct}',
      'maturity_signals: {m3_tool: doctor, m4_predicate: ztrack, m4_allowlist_label: oa-approved, m6_signal: per-issue}',
      'extra_rungs: []',
      'terminal_stage: M5',
      '',
    ].join('\n'),
  );
}

function baseStub(): StubProc {
  return new StubProc().onArgs('gh', [], () => fail('gh: not logged in', 1));
}

function stubRepoView(stub: StubProc, repo = SELF_DRIVING_REPO): StubProc {
  return stub.onArgs('gh', ['repo', 'view', '--json', 'nameWithOwner'], () => ok(repo));
}

const NO_PREFLIGHT = '/nonexistent-oa-te7-fixture/preflight.ts';
const NO_GH_PREFLIGHT = '/nonexistent-oa-te7-fixture/open-autonomy-preflight.ts';

// =========================================================================================================
// 1. ADVANCING — TF.1's own fixture positive-path, reused VERBATIM.
// =========================================================================================================

describe('proveAdvancing — ADVANCING (TF.1 fixture reused verbatim: self-driving issue #999/PR #1000)', () => {
  test('present:true -> classification ADVANCING, TF.1 evidence passed through unmodified, computeMaturity never invoked', async () => {
    const stub = stubRepoView(new StubProc())
      .onArgs('gh', ['issue', 'view', '999'], () => ok(JSON.stringify({ number: 999, state: 'CLOSED', labels: [{ name: 'roadmap:phase-99' }, { name: 'roadmap:fixture-item' }], body: '' })))
      .on(
        (c, a) => c === 'gh' && a[0] === 'pr' && a[1] === 'list' && a.includes('agent/issue-999'),
        () => ok(JSON.stringify([{ number: 1000, headRefOid: '1111111111111111111111111111111111111a', statusCheckRollup: SELF_DRIVING_CHECKS.map((n) => ({ context: n, state: 'SUCCESS' })) }])),
      );

    // Independently compute the raw TF.1 signal, to assert byte-identical pass-through (fidelity check —
    // "must appear verbatim, never paraphrased/summarized in a way that could drop a cited fact").
    const raw = await missionAdvancingSignal(REPO_ROOT, { profileDir: SELF_DRIVING_PROFILE_DIR, workItemId: '999', proc: stub.runner });
    expect(raw.present).toBe(true);

    const report = await proveAdvancing(REPO_ROOT, SELF_DRIVING_PROFILE_DIR, { proc: stub.runner, workItemId: '999' });
    expect(report.classification).toBe('ADVANCING');
    expect(report.m6Present).toBe(true);
    expect(report.m6Evidence).toBe(raw.evidence); // byte-identical, not a rephrasing
    expect(report.m6Evidence).toMatch(/roadmap:fixture-item/);
    expect(report.m6Evidence).toMatch(/gate PASSED/);
    expect(report.missingRung).toBe(report.m6Evidence);
    expect(report.maturity).toBeUndefined(); // TB.2 never invoked on the present:true path
    expect(report.pack.landingMode).toBe('auto-merge');
    expect(report.pack.terminalStage).toBe('M5');
    expect(report.pack.m6Signal).toBe('roadmap-rollup');
  });

  test('JSON output round-trip: the evidence string survives verbatim through run()/renderReportHuman (pass-through fidelity end-to-end)', async () => {
    const stub = stubRepoView(new StubProc())
      .onArgs('gh', ['issue', 'view', '999'], () => ok(JSON.stringify({ number: 999, state: 'CLOSED', labels: [{ name: 'roadmap:phase-99' }, { name: 'roadmap:fixture-item' }], body: '' })))
      .on(
        (c, a) => c === 'gh' && a[0] === 'pr' && a[1] === 'list' && a.includes('agent/issue-999'),
        () => ok(JSON.stringify([{ number: 1000, headRefOid: '1111111111111111111111111111111111111a', statusCheckRollup: SELF_DRIVING_CHECKS.map((n) => ({ context: n, state: 'SUCCESS' })) }])),
      );
    const result = await run(['--json', '--work-item', '999', REPO_ROOT, '--profile-dir', SELF_DRIVING_PROFILE_DIR], { proc: stub.runner });
    expect(result.ok).toBe(true);
    const parsed = JSON.parse(result.output);
    expect(parsed.classification).toBe('ADVANCING');
    expect(parsed.m6Evidence).toMatch(/roadmap:fixture-item/);
    expect(parsed.m6Evidence).toMatch(/PR #1000/);

    const human = renderReportHuman(result.report!, REPO_ROOT);
    expect(human).toContain(parsed.m6Evidence); // same evidence string, verbatim, in the human render too
    expect(human).toContain('classification: ADVANCING');
  });
});

// =========================================================================================================
// 2. TICKED_WITHOUT_ADVANCING — M5 reached (fence lifted + a recorded fire), empty board -> M6 not present.
// =========================================================================================================

describe('proveAdvancing — TICKED_WITHOUT_ADVANCING (M5/RUNNING reached, empty ztrack board, DESIGN\'s own "empty board" example)', () => {
  test('classification distinguishes "the loop IS ticking" from a not-yet-running install, citing TF.1\'s own "nothing to prove M6 against yet"', async () => {
    const dir = tmpDir();
    const profileDir = tmpDir('oa-te7-profile-');
    try {
      writeLocalGitProfile(profileDir);
      writeGenerated(dir, ['.open-autonomy/autonomy.yml', '.open-autonomy/generated.json', 'scheduler/schedule.json']);
      writeAutonomyYml(dir);
      writeSchedule(dir);
      gitInit(dir);
      gitCommitAll(dir);
      mkdirSync(join(dir, '.open-autonomy', 'runner-state', 'last-fire'), { recursive: true });
      writeFileSync(
        join(dir, '.open-autonomy', 'runner-state', 'last-fire', 'pm.json'),
        JSON.stringify({ agent: 'pm', cmd: 'bun scripts/sweep.ts', firedAt: '2026-01-01T00:00:00.000Z' }),
      );
      const stub = baseStub().onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'ready'], () => ok(JSON.stringify([{ identifier: 'A-1', labels: ['oa-approved'] }]))).onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'done'], () => ok('[]'));

      const report = await proveAdvancing(dir, profileDir, { proc: withRealGit(stub), target: 'local', preflightBin: NO_PREFLIGHT, ghPreflightScript: NO_GH_PREFLIGHT });
      expect(report.classification).toBe('TICKED_WITHOUT_ADVANCING');
      expect(report.m6Present).toBe(false);
      expect(report.maturity).toBeDefined();
      expect(report.maturity!.stage).toBe('M5');
      expect(report.maturity!.stageName).toBe('RUNNING');
      expect(report.m6Evidence).toMatch(/nothing to prove M6 against yet/);
      // The specific missing rung names the CURRENT stage explicitly — never conflated with "not running".
      expect(report.missingRung).toContain('M5/RUNNING');
      expect(report.missingRung).toContain('the loop IS ticking');
      expect(report.missingRung).toContain('nothing to prove M6 against yet');
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(profileDir, { recursive: true, force: true });
    }
  });
});

// =========================================================================================================
// 3. NOT_YET_M5 — a freshly-compiled, nothing-committed install (never reached M5 at all).
// =========================================================================================================

describe('proveAdvancing — NOT_YET_M5 (fresh, unstarted install — distinct report from case 2)', () => {
  test('classification cites the CURRENT stage + TB.2\'s own blocker, never conflated with "ticked without advancing"', async () => {
    const dir = tmpDir();
    const profileDir = tmpDir('oa-te7-profile-');
    try {
      writeLocalGitProfile(profileDir);
      writeGenerated(dir, ['.open-autonomy/autonomy.yml', '.open-autonomy/generated.json']);
      writeAutonomyYml(dir);
      gitInit(dir); // NOT committed — A6 harness-committed is false, well short of M5
      const stub = baseStub();

      const report = await proveAdvancing(dir, profileDir, {
        proc: withRealGit(stub),
        target: 'local',
        preflightBin: NO_PREFLIGHT,
        ghPreflightScript: NO_GH_PREFLIGHT,
      });
      expect(report.classification).toBe('NOT_YET_M5');
      expect(report.m6Present).toBe(false);
      expect(report.maturity).toBeDefined();
      // M2 (or lower) — the exact stage isn't the point; what matters is it's honestly short of M5.
      expect(['M0', 'M1', 'M2', 'M3', 'M4']).toContain(report.maturity!.stage);
      expect(report.missingRung).toContain('has not yet reached M5/RUNNING');
      expect(report.missingRung).not.toContain('the loop IS ticking');
      expect(report.maturity!.blockers.length).toBeGreaterThan(0);
      expect(report.missingRung).toContain(report.maturity!.blockers[0]!.replace(/^M\d blocked: /, ''));
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(profileDir, { recursive: true, force: true });
    }
  });
});

// =========================================================================================================
// CLI-level tests: parseArgs / run() / USAGE.
// =========================================================================================================

describe('parseArgs', () => {
  test('positional installDir + --profile-dir parse cleanly', () => {
    const { opts, error } = parseArgs(['/tmp/install', '--profile-dir', '/tmp/profile']);
    expect(error).toBeUndefined();
    expect(opts.installDir).toBe('/tmp/install');
    expect(opts.profileDir).toBe('/tmp/profile');
  });

  test('unknown flag is a loud error', () => {
    const { error } = parseArgs(['/tmp/install', '--comfirm']);
    expect(error).toMatch(/unknown flag/);
  });

  test('--profile-dir with a missing value is a loud error', () => {
    const { error } = parseArgs(['/tmp/install', '--profile-dir']);
    expect(error).toMatch(/--profile-dir requires a value/);
  });

  test('--scan-limit rejects a non-positive value', () => {
    const { error } = parseArgs(['/tmp/install', '--profile-dir', '/tmp/p', '--scan-limit', '0']);
    expect(error).toMatch(/must be a positive integer/);
  });

  test('--target rejects an invalid substrate', () => {
    const { error } = parseArgs(['/tmp/install', '--profile-dir', '/tmp/p', '--target', 'bogus']);
    expect(error).toMatch(/must be 'local' or 'gh-actions'/);
  });
});

describe('run — usage/validation', () => {
  test('no args -> USAGE, not ok', async () => {
    const result = await run([]);
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/usage: bun bin\/install-prove-advancing\.ts/);
  });

  test('missing --profile-dir -> USAGE, not ok', async () => {
    const result = await run([REPO_ROOT]);
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/usage:/);
  });

  test('nonexistent installDir -> loud error', async () => {
    const result = await run(['/nonexistent-oa-te7-install', '--profile-dir', SELF_DRIVING_PROFILE_DIR]);
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/does not exist/);
  });

  test('nonexistent --profile-dir -> loud error', async () => {
    const result = await run([REPO_ROOT, '--profile-dir', '/nonexistent-oa-te7-profile']);
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/does not exist/);
  });
});

// =========================================================================================================
// Always exits 0 posture (report verb): `run()`'s `ok` reflects INVOCATION validity, never "M6 not reached".
// =========================================================================================================

describe('run — a non-advancing verdict is still ok:true (a report verb never "fails" on its own payload)', () => {
  test('NOT_YET_M5 case still returns ok:true from run()', async () => {
    const dir = tmpDir();
    const profileDir = tmpDir('oa-te7-profile-');
    try {
      writeLocalGitProfile(profileDir);
      writeGenerated(dir, ['.open-autonomy/autonomy.yml', '.open-autonomy/generated.json']);
      writeAutonomyYml(dir);
      gitInit(dir);
      const stub = baseStub();
      const result = await run(
        [dir, '--profile-dir', profileDir, '--target', 'local', '--json', '--preflight-bin', NO_PREFLIGHT, '--gh-preflight-script', NO_GH_PREFLIGHT],
        { proc: withRealGit(stub) },
      );
      expect(result.ok).toBe(true);
      const parsed = JSON.parse(result.output);
      expect(parsed.classification).toBe('NOT_YET_M5');
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(profileDir, { recursive: true, force: true });
    }
  });
});
