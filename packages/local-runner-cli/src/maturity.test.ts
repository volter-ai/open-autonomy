// TB.2 acceptance tests — packages/local-runner-cli/src/maturity.ts. Run via `bun run check:core`
// (`bun test packages/*/src/*.test.ts`), cwd = repo root — same convention as imm-signals.test.ts /
// signal-sets.test.ts / m6-signal.test.ts.
//
// House style, continued from imm-signals.test.ts: filesystem/git-shaped state is built against REAL temp
// dirs with REAL git plumbing; anything that talks to `gh`/`ztrack`/a heavier subprocess is driven through
// `StubProc` — no real network call, no real `gh`/`ztrack` auth required to run this suite. The LIVE proof
// (real vendored CLI, real compile, real git, real ztrack) is the PR body's transcript, not this file.
import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { computeMaturity, directionContentSignal, INSTALL_JSON_REL, STAGE_NAMES } from './maturity.ts';
import { StubProc, fail, ok } from './test-support/stub-proc.ts';
import { defaultProc } from './proc.ts';
import type { ProcRunner } from './types.ts';

// A11/A12 both softened on `doctor-unavailable:` (see maturity.ts's own header) — point them at a
// path that genuinely does not exist so this suite tests STAGE COMPOSITION, not TB.1's own A11/A12
// correctness (already proven by imm-signals.test.ts).
const NO_PREFLIGHT = '/nonexistent-oa-test-fixture/preflight.ts';
const NO_GH_PREFLIGHT = '/nonexistent-oa-test-fixture/open-autonomy-preflight.ts';

// A6 (harness-committed) shells to REAL git regardless of the injected proc — house style (imm-signals.
// test.ts's own header: "filesystem/git-shaped signals... REAL temp dirs with REAL git... no stubbing").
// Wrap every StubProc so `git` always reaches the real binary (with the RIGHT cwd, which a StubProc
// handler cannot see) while every other command (gh/npx ztrack) stays fully stubbed.
function withRealGit(stub: StubProc): ProcRunner {
  return (cmd, args, opts) => (cmd === 'git' ? defaultProc(cmd, args, opts) : stub.runner(cmd, args, opts));
}

function tmpDir(prefix = 'oa-maturity-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeGenerated(dir: string, files: string[]): void {
  mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
  const sorted = [...files].sort();
  writeFileSync(join(dir, '.open-autonomy', 'generated.json'), JSON.stringify({ schema: 'open-autonomy.generated.v1', files: sorted }, null, 2));
}

function writeAutonomyYml(dir: string, opts: { codeHost?: string; agents?: Record<string, unknown>; documents?: unknown } = {}): void {
  mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
  const codeHost = opts.codeHost ?? 'local-git';
  const agents = opts.agents ?? { pm: { skill: 'pm', triggers: { schedule: '*/15 * * * *' } } };
  const body: Record<string, unknown> = { schema: 'open-autonomy.autonomy.v1', codeHost, agents };
  if (opts.documents) body.documents = opts.documents;
  writeFileSync(join(dir, '.open-autonomy', 'autonomy.yml'), JSON.stringify(body));
}

function writeSchedule(dir: string): void {
  // script-only, no runner/provider needed — the same trick imm-signals.test.ts's A8/A10 suite uses to get
  // a real, honest doctor() PASS without a termfleet provider on the box.
  mkdirSync(join(dir, 'scheduler'), { recursive: true });
  writeFileSync(join(dir, 'scheduler', 'schedule.json'), JSON.stringify({ intervalSeconds: 900, scripts: ['bun scripts/sweep.ts'] }));
}

function gitInit(dir: string): void {
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@test.dev'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'test'], { cwd: dir });
}

function gitCommitAll(dir: string): void {
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'install harness'], { cwd: dir });
}

/** A minimal local-git, doctor/ztrack-board fixture PROFILE dir — mirrors simple-sdlc's real
 *  ir.yml/setup-pack.yml leaf fields exactly enough for `readPack`/`hasDispatchableWork`/
 *  `missionAdvancingSignal` to resolve without a real profile source checkout. */
function writeLocalGitProfile(profileDir: string, opts: { withRoles?: boolean } = {}): void {
  mkdirSync(profileDir, { recursive: true });
  const documents = opts.withRoles ? '\ndocuments:\n  roles:\n    vision: docs/VISION.md\n    constitution: docs/CONSTITUTION.md\n' : '';
  writeFileSync(join(profileDir, 'ir.yml'), `targets: [local]\ncodeHost: local-git${documents}\n`);
  writeFileSync(
    profileDir + '/setup-pack.yml',
    [
      'landing_mode: pr-free',
      'board_seed_recipe: {originator_skill: draft, promotion_fence: state, import_verb: "ztrack issue add", landing_path: direct}',
      opts.withRoles ? 'direction_spec: {mode: documents.roles}' : '',
      'maturity_signals: {m3_tool: doctor, m4_predicate: ztrack, m4_allowlist_label: oa-approved, m6_signal: per-issue}',
      'extra_rungs: []',
      'terminal_stage: M5',
      '',
    ]
      .filter(Boolean)
      .join('\n'),
  );
}

/** A minimal github-codeHost profile dir (mirrors simple-gh-sdlc's leaf shape) — used for the A13
 *  HARD-block-M3 tests. */
function writeGithubProfile(profileDir: string): void {
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'ir.yml'), 'targets: [local]\ncodeHost: github\n');
  writeFileSync(
    join(profileDir, 'setup-pack.yml'),
    'landing_mode: auto-merge\nboard_seed_recipe: {originator_skill: planner, promotion_fence: label, import_verb: tasks:author, landing_path: direct}\nmaturity_signals: {m3_tool: doctor, m4_predicate: gh-issues, m6_signal: pr-close}\nextra_rungs: []\nterminal_stage: M5\n',
  );
  writeFileSync(join(profileDir, 'provision.json'), JSON.stringify({ branch_protection: { branch: 'main', required_checks: ['ci'] } }));
}

/** A stub that answers ztrack (empty ready list -> A14 false) and gh (auth failure -> everything gh-shaped
 *  reports unverifiable, never a fabricated pass) — the shared "nothing extra happens" baseline every
 *  fixture below layers on top of via `.on(...)` overrides. */
function baseStub(): StubProc {
  return new StubProc()
    .onArgs('npx', ['ztrack', 'issue', 'list'], () => ok('[]'))
    .onArgs('gh', [], () => fail('gh: not logged in', 1));
}

describe('computeMaturity — M0/M1: nothing compiled yet', () => {
  test('empty dir, no profile choice -> M0/EMPTY, blocked at M1', async () => {
    const dir = tmpDir();
    try {
      const record = await computeMaturity({ cwd: dir, proc: withRealGit(baseStub()), preflightBin: NO_PREFLIGHT, ghPreflightScript: NO_GH_PREFLIGHT });
      expect(record.stage).toBe('M0');
      expect(record.stageName).toBe(STAGE_NAMES.M0);
      expect(record.profile).toBeNull();
      expect(record.blockers[0]).toMatch(/^M1 blocked:/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('empty dir but --profile-dir supplied -> M1/SCOPED, blocked at M2, and install.json becomes the durable M1 artifact', async () => {
    const dir = tmpDir();
    const profileDir = tmpDir('oa-maturity-profile-');
    try {
      writeLocalGitProfile(profileDir);
      const record = await computeMaturity({ cwd: dir, profileDir, proc: withRealGit(baseStub()), preflightBin: NO_PREFLIGHT, ghPreflightScript: NO_GH_PREFLIGHT });
      expect(record.stage).toBe('M1');
      expect(record.profile).toBe(basename(profileDir));
      expect(record.substrate).toBe('local');
      expect(record.blockers[0]).toMatch(/^M2 blocked:/);

      // a SECOND run against a completely fresh cwd (nothing compiled) but reading the FIRST run's
      // install.json now sees the recorded choice too, even without --profile-dir this time.
      const record2 = await computeMaturity({ cwd: dir, proc: withRealGit(baseStub()), preflightBin: NO_PREFLIGHT, ghPreflightScript: NO_GH_PREFLIGHT });
      expect(record2.stage).toBe('M1');
      expect(record2.profile).toBe(record.profile);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(profileDir, { recursive: true, force: true });
    }
  });
});

describe('computeMaturity — M2 boundary: manifest + parse valid', () => {
  test('generated.json + autonomy.yml valid, nothing else -> M2/SCAFFOLDED, blocked at M3 (not a git repo)', async () => {
    const dir = tmpDir();
    const profileDir = tmpDir('oa-maturity-profile-');
    try {
      writeLocalGitProfile(profileDir);
      writeGenerated(dir, ['.open-autonomy/autonomy.yml', '.open-autonomy/generated.json']);
      writeAutonomyYml(dir);
      const record = await computeMaturity({ cwd: dir, profileDir, proc: withRealGit(baseStub()), preflightBin: NO_PREFLIGHT, ghPreflightScript: NO_GH_PREFLIGHT });
      expect(record.stage).toBe('M2');
      expect(record.stageName).toBe('SCAFFOLDED');
      expect(record.blockers[0]).toMatch(/^M3 blocked:/);
      expect(record.blockers[0]).toContain('A6 harness not committed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(profileDir, { recursive: true, force: true });
    }
  });

  test('invalid generated.json (bad schema) -> stays at M1, cites A1 in the M2 blocker', async () => {
    const dir = tmpDir();
    const profileDir = tmpDir('oa-maturity-profile-');
    try {
      writeLocalGitProfile(profileDir);
      mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
      writeFileSync(join(dir, '.open-autonomy', 'generated.json'), JSON.stringify({ schema: 'wrong', files: [] }));
      const record = await computeMaturity({ cwd: dir, profileDir, proc: withRealGit(baseStub()), preflightBin: NO_PREFLIGHT, ghPreflightScript: NO_GH_PREFLIGHT });
      expect(record.stage).toBe('M1');
      expect(record.blockers[0]).toMatch(/^M2 blocked:/);
      expect(record.blockers[0]).toContain('A1 generated.json invalid');
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(profileDir, { recursive: true, force: true });
    }
  });
});

describe('computeMaturity — M3 boundary: harness committed + doctor + (github) A13 HARD', () => {
  test('local-git profile: committed harness + doctor pass -> M3/INSTALLED, blocked at M4 (empty board)', async () => {
    const dir = tmpDir();
    const profileDir = tmpDir('oa-maturity-profile-');
    try {
      writeLocalGitProfile(profileDir);
      writeGenerated(dir, ['.open-autonomy/autonomy.yml', '.open-autonomy/generated.json', 'scheduler/schedule.json']);
      writeAutonomyYml(dir);
      writeSchedule(dir);
      gitInit(dir);
      gitCommitAll(dir);
      const record = await computeMaturity({ cwd: dir, profileDir, proc: withRealGit(baseStub()), preflightBin: NO_PREFLIGHT, ghPreflightScript: NO_GH_PREFLIGHT });
      expect(record.stage).toBe('M3');
      expect(record.stageName).toBe('INSTALLED');
      expect(record.blockers[0]).toMatch(/^M4 blocked:/);
      expect(record.blockers[0]).toContain('A14 board has no dispatchable work');
      const a6 = record.signals.find((s) => s.id === 'A6')!;
      expect(a6.present).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(profileDir, { recursive: true, force: true });
    }
  });

  test('github codeHost, non-admin gh token -> A13 unverifiable BLOCKS M3, even though doctor/preflight would pass (standing rule: unverifiable never waved through)', async () => {
    const dir = tmpDir();
    const profileDir = tmpDir('oa-maturity-profile-');
    try {
      writeGithubProfile(profileDir);
      writeGenerated(dir, ['.open-autonomy/autonomy.yml', '.open-autonomy/generated.json', 'scheduler/schedule.json']);
      writeAutonomyYml(dir, { codeHost: 'github' });
      writeSchedule(dir);
      gitInit(dir);
      gitCommitAll(dir);
      const stub = baseStub()
        .onArgs('gh', ['repo', 'view'], () => ok('acme/widgets'))
        // non-admin: .permissions.admin reads 'false' -> A13 must report unverifiable, never a bare negative
        .onArgs('gh', ['api'], () => ok('false'));
      const record = await computeMaturity({ cwd: dir, profileDir, proc: withRealGit(stub), preflightBin: NO_PREFLIGHT, ghPreflightScript: NO_GH_PREFLIGHT });
      expect(record.stage).toBe('M2'); // M3 blocked -> verdict caps at the last stage that DID pass
      expect(record.blockers[0]).toMatch(/^M3 blocked:/);
      expect(record.blockers[0]).toContain('A13 branch-protection HARD signal failed');
      expect(record.blockers[0]).toContain('unverifiable');
      const a13 = record.signals.find((s) => s.id === 'A13')!;
      expect(a13.present).toBe(false);
      expect(a13.evidence).toMatch(/^unverifiable:/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(profileDir, { recursive: true, force: true });
    }
  });

  test('github codeHost, admin token, live protection matches provision.json -> A13 true, M3 reached', async () => {
    const dir = tmpDir();
    const profileDir = tmpDir('oa-maturity-profile-');
    try {
      writeGithubProfile(profileDir);
      writeGenerated(dir, ['.open-autonomy/autonomy.yml', '.open-autonomy/generated.json', 'scheduler/schedule.json']);
      writeAutonomyYml(dir, { codeHost: 'github' });
      writeSchedule(dir);
      gitInit(dir);
      gitCommitAll(dir);
      const stub = baseStub()
        .onArgs('gh', ['repo', 'view'], () => ok('acme/widgets'))
        .onArgs('gh', ['api', 'repos/acme/widgets'], () => ok('true'))
        .onArgs('gh', ['api', 'repos/acme/widgets/branches/main/protection'], () => ok(JSON.stringify({ required_status_checks: { contexts: ['ci'] } })));
      const record = await computeMaturity({ cwd: dir, profileDir, proc: withRealGit(stub), preflightBin: NO_PREFLIGHT, ghPreflightScript: NO_GH_PREFLIGHT });
      expect(record.stage).toBe('M3');
      const a13 = record.signals.find((s) => s.id === 'A13')!;
      expect(a13.present).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(profileDir, { recursive: true, force: true });
    }
  });
});

describe('computeMaturity — M4 boundary: board work + direction content', () => {
  function committedInstall(dir: string): void {
    writeGenerated(dir, ['.open-autonomy/autonomy.yml', '.open-autonomy/generated.json', 'scheduler/schedule.json']);
    writeAutonomyYml(dir);
    writeSchedule(dir);
    gitInit(dir);
    gitCommitAll(dir);
  }

  test('a ready+oa-approved ztrack item -> A14 true, M4/ARMED reached, blocked at M5 (still paused)', async () => {
    const dir = tmpDir();
    const profileDir = tmpDir('oa-maturity-profile-');
    try {
      writeLocalGitProfile(profileDir);
      committedInstall(dir);
      mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
      writeFileSync(join(dir, '.open-autonomy', 'paused'), 'fresh install\n');
      const stub = baseStub().onArgs('npx', ['ztrack', 'issue', 'list'], () => ok(JSON.stringify([{ identifier: 'A-1', labels: ['oa-approved'] }])));
      const record = await computeMaturity({ cwd: dir, profileDir, proc: withRealGit(stub), preflightBin: NO_PREFLIGHT, ghPreflightScript: NO_GH_PREFLIGHT });
      expect(record.stage).toBe('M4');
      expect(record.stageName).toBe('ARMED');
      expect(record.blockers[0]).toMatch(/^M5 blocked:/);
      expect(record.blockers[0]).toContain('A5 fence not lifted');
      const a14 = record.signals.find((s) => s.id === 'A14')!;
      expect(a14.present).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(profileDir, { recursive: true, force: true });
    }
  });

  test('a ready item WITHOUT the oa-approved allowlist label -> A14 stays false, M4 blocked (day-one fence honored)', async () => {
    const dir = tmpDir();
    const profileDir = tmpDir('oa-maturity-profile-');
    try {
      writeLocalGitProfile(profileDir);
      committedInstall(dir);
      const stub = baseStub().onArgs('npx', ['ztrack', 'issue', 'list'], () => ok(JSON.stringify([{ identifier: 'A-1', labels: [] }])));
      const record = await computeMaturity({ cwd: dir, profileDir, proc: withRealGit(stub), preflightBin: NO_PREFLIGHT, ghPreflightScript: NO_GH_PREFLIGHT });
      expect(record.stage).toBe('M3');
      expect(record.blockers[0]).toMatch(/^M4 blocked:/);
      expect(record.blockers[0]).toContain('A14 board has no dispatchable work');
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(profileDir, { recursive: true, force: true });
    }
  });

  test('documents.roles profile with an UNEDITED vision template -> M4 blocked naming the WARN, exact DESIGN acceptance phrasing shape', async () => {
    const dir = tmpDir();
    const profileDir = tmpDir('oa-maturity-profile-');
    try {
      writeLocalGitProfile(profileDir, { withRoles: true });
      writeGenerated(dir, ['.open-autonomy/autonomy.yml', '.open-autonomy/generated.json', 'scheduler/schedule.json', 'docs/VISION.md']);
      writeAutonomyYml(dir, { documents: { roles: { vision: 'docs/VISION.md', constitution: 'docs/CONSTITUTION.md' } } });
      writeSchedule(dir);
      mkdirSync(join(dir, 'docs'), { recursive: true });
      writeFileSync(join(dir, 'docs', 'VISION.md'), '<!-- REPLACE THIS with your real north star -->\n');
      gitInit(dir);
      gitCommitAll(dir);
      const stub = baseStub().onArgs('npx', ['ztrack', 'issue', 'list'], () => ok(JSON.stringify([{ identifier: 'A-1', labels: ['oa-approved'] }])));
      const record = await computeMaturity({ cwd: dir, profileDir, proc: withRealGit(stub), preflightBin: NO_PREFLIGHT, ghPreflightScript: NO_GH_PREFLIGHT });
      expect(record.stage).toBe('M3');
      expect(record.blockers[0]).toMatch(/^M4 blocked:/);
      expect(record.blockers[0]).toContain('unedited template');
      expect(record.blockers[0]).toContain('REPLACE THIS');
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(profileDir, { recursive: true, force: true });
    }
  });
});

describe('computeMaturity — M5 boundary: fence lifted AND real session/fire evidence, never A5 alone', () => {
  function armedInstall(dir: string): void {
    writeGenerated(dir, ['.open-autonomy/autonomy.yml', '.open-autonomy/generated.json', 'scheduler/schedule.json']);
    writeAutonomyYml(dir);
    writeSchedule(dir);
    gitInit(dir);
    gitCommitAll(dir);
  }

  test('unpaused but nothing has ever fired -> honestly BLOCKED at M5, never a false M5 (DESIGN §Q1)', async () => {
    const dir = tmpDir();
    const profileDir = tmpDir('oa-maturity-profile-');
    try {
      writeLocalGitProfile(profileDir);
      armedInstall(dir);
      const stub = baseStub().onArgs('npx', ['ztrack', 'issue', 'list'], () => ok(JSON.stringify([{ identifier: 'A-1', labels: ['oa-approved'] }])));
      const record = await computeMaturity({ cwd: dir, profileDir, proc: withRealGit(stub), preflightBin: NO_PREFLIGHT, ghPreflightScript: NO_GH_PREFLIGHT });
      expect(record.stage).toBe('M4');
      expect(record.blockers[0]).toMatch(/^M5 blocked:/);
      expect(record.blockers[0]).toContain('no real profile-agent session/fire evidence found');
      const a5 = record.signals.find((s) => s.id === 'A5')!;
      expect(a5.present).toBe(true); // unpaused IS true — it just isn't sufficient alone
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(profileDir, { recursive: true, force: true });
    }
  });

  test('unpaused WITH a recorded last-fire -> M5/RUNNING reached, blocked at M6 (no mission-advancing evidence)', async () => {
    const dir = tmpDir();
    const profileDir = tmpDir('oa-maturity-profile-');
    try {
      writeLocalGitProfile(profileDir);
      armedInstall(dir);
      mkdirSync(join(dir, '.open-autonomy', 'runner-state', 'last-fire'), { recursive: true });
      writeFileSync(
        join(dir, '.open-autonomy', 'runner-state', 'last-fire', 'pm.json'),
        JSON.stringify({ agent: 'pm', cmd: 'bun scripts/sweep.ts', firedAt: '2026-01-01T00:00:00.000Z' }),
      );
      const stub = baseStub().onArgs('npx', ['ztrack', 'issue', 'list'], () => ok(JSON.stringify([{ identifier: 'A-1', labels: ['oa-approved'] }])));
      const record = await computeMaturity({ cwd: dir, profileDir, proc: withRealGit(stub), preflightBin: NO_PREFLIGHT, ghPreflightScript: NO_GH_PREFLIGHT });
      expect(record.stage).toBe('M5');
      expect(record.stageName).toBe('RUNNING');
      expect(record.blockers[0]).toMatch(/^M6 blocked:/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(profileDir, { recursive: true, force: true });
    }
  });
});

describe('computeMaturity — M6: delegates wholesale to TF.1', () => {
  test('missionAdvancingSignal present -> M6/ADVANCING, no blockers', async () => {
    const dir = tmpDir();
    const profileDir = tmpDir('oa-maturity-profile-');
    try {
      writeLocalGitProfile(profileDir);
      writeGenerated(dir, ['.open-autonomy/autonomy.yml', '.open-autonomy/generated.json', 'scheduler/schedule.json']);
      writeAutonomyYml(dir);
      writeSchedule(dir);
      gitInit(dir);
      gitCommitAll(dir);
      mkdirSync(join(dir, '.open-autonomy', 'runner-state', 'last-fire'), { recursive: true });
      writeFileSync(join(dir, '.open-autonomy', 'runner-state', 'last-fire', 'pm.json'), JSON.stringify({ agent: 'pm', cmd: 'x', firedAt: 'now' }));
      const stub = baseStub()
        .onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'ready'], () => ok(JSON.stringify([{ identifier: 'A-1', labels: ['oa-approved'] }])))
        .onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'done'], () => ok(JSON.stringify([{ identifier: 'A-2' }])))
        .onArgs('npx', ['ztrack', 'check'], () => ok('AC-evidence: green'));
      const record = await computeMaturity({ cwd: dir, profileDir, proc: withRealGit(stub), preflightBin: NO_PREFLIGHT, ghPreflightScript: NO_GH_PREFLIGHT });
      expect(record.stage).toBe('M6');
      expect(record.stageName).toBe('ADVANCING');
      expect(record.blockers).toEqual([]);
      const m6 = record.signals.find((s) => s.id === 'M6')!;
      expect(m6.present).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(profileDir, { recursive: true, force: true });
    }
  });
});

describe('computeMaturity — install.json shape + determinism', () => {
  test('every run writes .open-autonomy/install.json with stable key order; identical state -> byte-identical output (no timestamp field)', async () => {
    const dir = tmpDir();
    const profileDir = tmpDir('oa-maturity-profile-');
    try {
      writeLocalGitProfile(profileDir);
      writeGenerated(dir, ['.open-autonomy/autonomy.yml', '.open-autonomy/generated.json', 'scheduler/schedule.json']);
      writeAutonomyYml(dir);
      writeSchedule(dir);
      gitInit(dir);
      gitCommitAll(dir);
      const stub = () => baseStub();
      await computeMaturity({ cwd: dir, profileDir, proc: withRealGit(stub()), preflightBin: NO_PREFLIGHT, ghPreflightScript: NO_GH_PREFLIGHT });
      const first = readFileSync(join(dir, INSTALL_JSON_REL), 'utf8');
      const parsed = JSON.parse(first);
      expect(Object.keys(parsed)).toEqual(['stage', 'stageName', 'signals', 'skipped', 'profile', 'substrate', 'blockers']);
      expect(parsed).not.toHaveProperty('ts');
      expect(parsed).not.toHaveProperty('timestamp');

      await computeMaturity({ cwd: dir, profileDir, proc: withRealGit(stub()), preflightBin: NO_PREFLIGHT, ghPreflightScript: NO_GH_PREFLIGHT });
      const second = readFileSync(join(dir, INSTALL_JSON_REL), 'utf8');
      expect(second).toBe(first);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(profileDir, { recursive: true, force: true });
    }
  });

  test('write:false computes without touching the filesystem', async () => {
    const dir = tmpDir();
    try {
      const record = await computeMaturity({ cwd: dir, write: false, proc: withRealGit(baseStub()), preflightBin: NO_PREFLIGHT, ghPreflightScript: NO_GH_PREFLIGHT });
      expect(record.stage).toBe('M0');
      expect(existsSync(join(dir, INSTALL_JSON_REL))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('directionContentSignal — the M4 direction rung in isolation', () => {
  test('no documents.roles block -> present:true (operator-mode has nothing to check)', () => {
    const dir = tmpDir();
    try {
      writeAutonomyYml(dir);
      const s = directionContentSignal(dir);
      expect(s.present).toBe(true);
      expect(s.evidence).toContain('no documents.roles');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('declared vision file missing entirely -> present:false', () => {
    const dir = tmpDir();
    try {
      writeAutonomyYml(dir, { documents: { roles: { vision: 'docs/VISION.md' } } });
      const s = directionContentSignal(dir);
      expect(s.present).toBe(false);
      expect(s.evidence).toContain('does not exist');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('vision + constitution both edited past the template -> present:true', () => {
    const dir = tmpDir();
    try {
      writeAutonomyYml(dir, { documents: { roles: { vision: 'docs/VISION.md', constitution: 'docs/CONSTITUTION.md' } } });
      mkdirSync(join(dir, 'docs'), { recursive: true });
      writeFileSync(join(dir, 'docs', 'VISION.md'), 'Our real north star.\n');
      writeFileSync(join(dir, 'docs', 'CONSTITUTION.md'), 'Our real operating rules.\n');
      const s = directionContentSignal(dir);
      expect(s.present).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
