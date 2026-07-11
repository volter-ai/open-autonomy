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
import {
  computeMaturity,
  declaredAgentNames,
  directionContentSignal,
  evaluateExtraRung,
  humanSeamWiredSignal,
  proxyReadySignal,
  INSTALL_JSON_REL,
  STAGE_NAMES,
} from './maturity.ts';
import type { SessionProbe } from './maturity.ts';
import { StubProc, fail, ok } from './test-support/stub-proc.ts';
import { defaultProc } from './proc.ts';
import type { ProcRunner, Session } from './types.ts';

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

function writeSchedule(dir: string, opts: { pin?: string } = {}): void {
  // script-only, no runner/provider needed — the same trick imm-signals.test.ts's A8/A10 suite uses to get
  // a real, honest doctor() PASS without a termfleet provider on the box. `pin` writes the install-scoped
  // env.TERMFLEET_PROVIDER_URL pin (TG.1's durable artifact) the M5 session-evidence gate keys on.
  mkdirSync(join(dir, 'scheduler'), { recursive: true });
  const body: Record<string, unknown> = { intervalSeconds: 900, scripts: ['bun scripts/sweep.ts'] };
  if (opts.pin) body.env = { TERMFLEET_PROVIDER_URL: opts.pin };
  writeFileSync(join(dir, 'scheduler', 'schedule.json'), JSON.stringify(body));
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

  // --- fix-round D1 (HIGH): session evidence must be INSTALL-SCOPED — pin-scoped provider AND
  //     declared-agent-name-filtered sessions, never ambient/box-global state. -----------------------

  test('D1: NO schedule.json pin + ambient TERMFLEET_PROVIDER_URL set -> session probe NEVER called, M5 blocked "no install-scoped provider pin"', async () => {
    const dir = tmpDir();
    const profileDir = tmpDir('oa-maturity-profile-');
    const savedAmbient = process.env.TERMFLEET_PROVIDER_URL;
    try {
      writeLocalGitProfile(profileDir);
      armedInstall(dir); // writeSchedule with NO pin
      // The exact live failure mode: a box-global provider sits in ambient env, teeming with sessions.
      process.env.TERMFLEET_PROVIDER_URL = 'http://127.0.0.1:7373';
      let probeCalls = 0;
      const probe: SessionProbe = async () => {
        probeCalls++;
        return [{ id: 't1', agent: 'pm', status: 'running' }] as Session[]; // would be "evidence" if consulted
      };
      const stub = baseStub().onArgs('npx', ['ztrack', 'issue', 'list'], () => ok(JSON.stringify([{ identifier: 'A-1', labels: ['oa-approved'] }])));
      const record = await computeMaturity({ cwd: dir, profileDir, proc: withRealGit(stub), preflightBin: NO_PREFLIGHT, ghPreflightScript: NO_GH_PREFLIGHT, sessionProbe: probe });
      expect(probeCalls).toBe(0); // an unpinned install NEVER probes — ambient is not the install
      expect(record.stage).toBe('M4');
      expect(record.blockers[0]).toMatch(/^M5 blocked:/);
      expect(record.blockers[0]).toContain('no install-scoped provider pin');
    } finally {
      if (savedAmbient === undefined) delete process.env.TERMFLEET_PROVIDER_URL;
      else process.env.TERMFLEET_PROVIDER_URL = savedAmbient;
      rmSync(dir, { recursive: true, force: true });
      rmSync(profileDir, { recursive: true, force: true });
    }
  });

  test('D1: pinned provider carrying ONLY FOREIGN sessions -> not evidence, M5 blocked citing the ignored foreigners', async () => {
    const dir = tmpDir();
    const profileDir = tmpDir('oa-maturity-profile-');
    try {
      writeLocalGitProfile(profileDir);
      writeGenerated(dir, ['.open-autonomy/autonomy.yml', '.open-autonomy/generated.json', 'scheduler/schedule.json']);
      writeAutonomyYml(dir); // declares agents: {pm}
      writeSchedule(dir, { pin: 'http://127.0.0.1:59999' });
      gitInit(dir);
      gitCommitAll(dir);
      // The reviewer's exact repro shape: two sessions belonging to OTHER installs on the same provider.
      const probe: SessionProbe = async (_cwd, pinnedUrl) => {
        expect(pinnedUrl).toBe('http://127.0.0.1:59999'); // the probe gets the INSTALL's pin, nothing else
        return [
          { id: 't1', agent: 'supercode-oa-selfdev-study', status: 'running' },
          { id: 't2', agent: 'supercode-composable', status: 'running' },
        ] as Session[];
      };
      const stub = baseStub().onArgs('npx', ['ztrack', 'issue', 'list'], () => ok(JSON.stringify([{ identifier: 'A-1', labels: ['oa-approved'] }])));
      const record = await computeMaturity({ cwd: dir, profileDir, proc: withRealGit(stub), preflightBin: NO_PREFLIGHT, ghPreflightScript: NO_GH_PREFLIGHT, sessionProbe: probe });
      expect(record.stage).toBe('M4'); // NOT M5 — a foreign loop's sessions are never this install's evidence
      expect(record.blockers[0]).toMatch(/^M5 blocked:/);
      expect(record.blockers[0]).toContain('0 of 2 live session(s)');
      expect(record.blockers[0]).toContain('foreign session(s) on the same provider IGNORED');
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(profileDir, { recursive: true, force: true });
    }
  });

  test("D1: pinned provider with a session belonging to one of the install's OWN declared agents -> evidence, M5 reached", async () => {
    const dir = tmpDir();
    const profileDir = tmpDir('oa-maturity-profile-');
    try {
      writeLocalGitProfile(profileDir);
      writeGenerated(dir, ['.open-autonomy/autonomy.yml', '.open-autonomy/generated.json', 'scheduler/schedule.json']);
      writeAutonomyYml(dir); // declares agents: {pm}
      writeSchedule(dir, { pin: 'http://127.0.0.1:59999' });
      gitInit(dir);
      gitCommitAll(dir);
      const probe: SessionProbe = async () => [{ id: 't1', agent: 'pm', status: 'running' }] as Session[];
      const stub = baseStub().onArgs('npx', ['ztrack', 'issue', 'list'], () => ok(JSON.stringify([{ identifier: 'A-1', labels: ['oa-approved'] }])));
      const record = await computeMaturity({ cwd: dir, profileDir, proc: withRealGit(stub), preflightBin: NO_PREFLIGHT, ghPreflightScript: NO_GH_PREFLIGHT, sessionProbe: probe });
      expect(record.stage).toBe('M5');
      expect(record.stageName).toBe('RUNNING');
      expect(record.blockers[0]).toMatch(/^M6 blocked:/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(profileDir, { recursive: true, force: true });
    }
  });

  test('D1: pinned but probe unavailable (null) -> sessions unknown, M5 blocked honestly', async () => {
    const dir = tmpDir();
    const profileDir = tmpDir('oa-maturity-profile-');
    try {
      writeLocalGitProfile(profileDir);
      writeGenerated(dir, ['.open-autonomy/autonomy.yml', '.open-autonomy/generated.json', 'scheduler/schedule.json']);
      writeAutonomyYml(dir);
      writeSchedule(dir, { pin: 'http://127.0.0.1:59999' });
      gitInit(dir);
      gitCommitAll(dir);
      const probe: SessionProbe = async () => null;
      const stub = baseStub().onArgs('npx', ['ztrack', 'issue', 'list'], () => ok(JSON.stringify([{ identifier: 'A-1', labels: ['oa-approved'] }])));
      const record = await computeMaturity({ cwd: dir, profileDir, proc: withRealGit(stub), preflightBin: NO_PREFLIGHT, ghPreflightScript: NO_GH_PREFLIGHT, sessionProbe: probe });
      expect(record.stage).toBe('M4');
      expect(record.blockers[0]).toContain('probe unavailable against pinned http://127.0.0.1:59999');
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

// ============================================================================================
// Fix-round D2: the extra-rung signals (proxy-ready / human-seam-wired) + the unrecognized-rung
// fail-closed path + their M3.p/M4.h stage gating — direct signal tests first, then full
// computeMaturity fixtures against a self-driving-like profile.
// ============================================================================================

describe('extra rungs — direct signal tests (D2)', () => {
  const fetch200 = (async () => ({ ok: true, status: 200 })) as unknown as typeof fetch;
  const fetch503 = (async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
  const fetchThrows = (async () => {
    throw new Error('connect ECONNREFUSED');
  }) as unknown as typeof fetch;

  test('proxy-ready: MODEL_PROXY_URL unset -> unverifiable, never a guess', async () => {
    const s = await proxyReadySignal({}, fetch200);
    expect(s.present).toBe(false);
    expect(s.evidence).toMatch(/^unverifiable: MODEL_PROXY_URL not set/);
  });

  test('proxy-ready: set + healthz 200 -> present, wording stays reachability-only (never claims funded/allowlisted)', async () => {
    const s = await proxyReadySignal({ MODEL_PROXY_URL: 'http://proxy.test' }, fetch200);
    expect(s.present).toBe(true);
    expect(s.evidence).toContain('HTTP 200');
    expect(s.evidence).toContain('reachability only, NOT proof of funding/allowlist status');
  });

  test('proxy-ready: set + healthz 503 -> false, cites the status', async () => {
    const s = await proxyReadySignal({ MODEL_PROXY_URL: 'http://proxy.test' }, fetch503);
    expect(s.present).toBe(false);
    expect(s.evidence).toContain('HTTP 503');
  });

  test('proxy-ready: set but unreachable -> false, cites the transport error', async () => {
    const s = await proxyReadySignal({ MODEL_PROXY_URL: 'http://proxy.test' }, fetchThrows);
    expect(s.present).toBe(false);
    expect(s.evidence).toContain('unreachable');
    expect(s.evidence).toContain('ECONNREFUSED');
  });

  test('human-seam-wired: no manifest -> false', () => {
    const dir = tmpDir();
    try {
      const s = humanSeamWiredSignal(dir, { PUBLIC_AGENT_MAINTAINERS: 'brennan' });
      expect(s.present).toBe(false);
      expect(s.evidence).toContain('does not exist');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('human-seam-wired: manifest without a kind:human actor -> false', () => {
    const dir = tmpDir();
    try {
      mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
      writeFileSync(join(dir, '.open-autonomy', 'autonomy.yml'), 'schema: open-autonomy.autonomy.v1\ncodeHost: github\nagents:\n  pm:\n    skill: pm\n');
      const s = humanSeamWiredSignal(dir, { PUBLIC_AGENT_MAINTAINERS: 'brennan' });
      expect(s.present).toBe(false);
      expect(s.evidence).toContain('no agent declares "kind: human"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('human-seam-wired: kind:human present but PUBLIC_AGENT_MAINTAINERS unset -> false, names the missing var', () => {
    const dir = tmpDir();
    try {
      mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
      writeFileSync(join(dir, '.open-autonomy', 'autonomy.yml'), 'schema: open-autonomy.autonomy.v1\ncodeHost: github\nagents:\n  maintainer:\n    kind: human\n');
      const s = humanSeamWiredSignal(dir, {});
      expect(s.present).toBe(false);
      expect(s.evidence).toContain('PUBLIC_AGENT_MAINTAINERS is unset/empty');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('human-seam-wired: kind:human + PUBLIC_AGENT_MAINTAINERS set -> true', () => {
    const dir = tmpDir();
    try {
      mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
      writeFileSync(join(dir, '.open-autonomy', 'autonomy.yml'), 'schema: open-autonomy.autonomy.v1\ncodeHost: github\nagents:\n  maintainer:\n    kind: human\n');
      const s = humanSeamWiredSignal(dir, { PUBLIC_AGENT_MAINTAINERS: 'brennan' });
      expect(s.present).toBe(true);
      expect(s.evidence).toContain('PUBLIC_AGENT_MAINTAINERS="brennan"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('evaluateExtraRung: an unrecognized rung name fails CLOSED with a named reason, never waved through', async () => {
    const s = await evaluateExtraRung('quantum-flux', '/nonexistent', {}, fetch200);
    expect(s.present).toBe(false);
    expect(s.evidence).toContain('unverifiable: no signal implementation for extra rung "quantum-flux"');
  });
});

// ============================================================================================
// Fix-round D2, second half: the M3.p / M4.h stage GATING through computeMaturity, against a
// self-driving-like fixture (codeHost github, m3_tool gh-preflight, documents.roles, all three
// extra rungs) — values mirroring profiles/self-driving's real ir.yml/setup-pack.yml leaf facts.
// ============================================================================================

describe('computeMaturity — extra-rung stage gating (self-driving-like fixture, D2)', () => {
  const fetch200 = (async () => ({ ok: true, status: 200 })) as unknown as typeof fetch;

  function writeSelfDrivingLikeProfile(profileDir: string): void {
    mkdirSync(profileDir, { recursive: true });
    writeFileSync(
      join(profileDir, 'ir.yml'),
      'targets: [gh-actions, local]\ncodeHost: github\ndocuments:\n  roles:\n    vision: docs/VISION.md\n    constitution: docs/CONSTITUTION.md\n',
    );
    writeFileSync(
      join(profileDir, 'setup-pack.yml'),
      [
        'landing_mode: auto-merge',
        'board_seed_recipe: {originator_skill: planner, promotion_fence: upstream-ratified, import_verb: tasks:author, landing_path: direct}',
        'direction_spec: {mode: documents.roles}',
        'maturity_signals: {m3_tool: gh-preflight, m4_predicate: gh-issues, m6_signal: roadmap-rollup}',
        'extra_rungs: [proxy-ready, direction-present, human-seam-wired]',
        'terminal_stage: M5',
        '',
      ].join('\n'),
    );
    writeFileSync(join(profileDir, 'provision.json'), JSON.stringify({ branch_protection: { branch: 'main', required_checks: ['ci', 'agent-review', 'security', 'human-approval'] } }));
  }

  /** Writes a committed github-substrate install with filled (marker-free) direction docs; `withHuman`
   *  adds the kind:human maintainer actor line humanSeamWiredSignal keys on. */
  function writeSelfDrivingLikeInstall(dir: string, opts: { withHuman?: boolean } = {}): void {
    mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
    const humanBlock = opts.withHuman ? '  maintainer:\n    kind: human\n' : '';
    writeFileSync(
      join(dir, '.open-autonomy', 'autonomy.yml'),
      `schema: open-autonomy.autonomy.v1\ncodeHost: github\ndocuments:\n  roles:\n    vision: docs/VISION.md\n    constitution: docs/CONSTITUTION.md\nagents:\n  pm:\n    skill: pm\n    triggers:\n      schedule: "*/15 * * * *"\n${humanBlock}`,
    );
    writeGenerated(dir, ['.open-autonomy/autonomy.yml', '.open-autonomy/generated.json', 'scheduler/schedule.json', 'docs/VISION.md', 'docs/CONSTITUTION.md']);
    writeSchedule(dir);
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'VISION.md'), 'A real, edited north star.\n');
    writeFileSync(join(dir, 'docs', 'CONSTITUTION.md'), 'Real, edited operating rules.\n');
    gitInit(dir);
    gitCommitAll(dir);
  }

  /** gh fully stubbed green: repo resolvable, admin token, live protection matching provision.json,
   *  one ready gh-issue on the board, no open PRs, no closed issues (M6 scan comes up honestly empty). */
  function ghGreenStub(): StubProc {
    return new StubProc()
      .onArgs('gh', [], () => fail('gh: not logged in', 1))
      .onArgs('gh', ['repo', 'view'], () => ok('acme/widgets'))
      .onArgs('gh', ['api', 'repos/acme/widgets'], () => ok('true'))
      .onArgs('gh', ['api', 'repos/acme/widgets/branches/main/protection'], () =>
        ok(JSON.stringify({ required_status_checks: { contexts: ['ci', 'agent-review', 'security', 'human-approval'] } })),
      )
      .onArgs('gh', ['issue', 'list', '--state', 'open'], () => ok(JSON.stringify([{ number: 7, labels: [{ name: 'ready' }] }])))
      .onArgs('gh', ['pr', 'list', '--state', 'open'], () => ok('[]'))
      .onArgs('gh', ['issue', 'list', '-R'], () => ok('[]'));
  }

  function envWithout(...names: string[]): NodeJS.ProcessEnv {
    const env = { ...process.env };
    for (const n of names) delete env[n];
    return env;
  }

  test("D2: proxy-ready (M3.p) BLOCKS M3 on a self-driving-like install when MODEL_PROXY_URL is unset — DESIGN §Q3's honest 'stops at M3/M4' terminal", async () => {
    const dir = tmpDir();
    const profileDir = tmpDir('oa-maturity-sd-profile-');
    try {
      writeSelfDrivingLikeProfile(profileDir);
      writeSelfDrivingLikeInstall(dir, { withHuman: true });
      const record = await computeMaturity({
        cwd: dir,
        profileDir,
        proc: withRealGit(ghGreenStub()),
        env: envWithout('MODEL_PROXY_URL'),
        fetchImpl: fetch200,
        preflightBin: NO_PREFLIGHT,
        ghPreflightScript: NO_GH_PREFLIGHT,
      });
      expect(record.stage).toBe('M2'); // A13 green, gh-preflight softened — proxy-ready is the ONLY M3 blocker
      expect(record.blockers[0]).toMatch(/^M3 blocked:/);
      expect(record.blockers[0]).toContain("extra rung 'proxy-ready' (M3) failed");
      expect(record.blockers[0]).toContain('MODEL_PROXY_URL not set');
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(profileDir, { recursive: true, force: true });
    }
  });

  test('D2: human-seam-wired (M4.h) BLOCKS M4 when the manifest has no kind:human actor (proxy reachable, board ready, direction filled)', async () => {
    const dir = tmpDir();
    const profileDir = tmpDir('oa-maturity-sd-profile-');
    try {
      writeSelfDrivingLikeProfile(profileDir);
      writeSelfDrivingLikeInstall(dir, { withHuman: false });
      const env = envWithout('PUBLIC_AGENT_MAINTAINERS');
      env.MODEL_PROXY_URL = 'http://proxy.test';
      const record = await computeMaturity({
        cwd: dir,
        profileDir,
        proc: withRealGit(ghGreenStub()),
        env,
        fetchImpl: fetch200,
        preflightBin: NO_PREFLIGHT,
        ghPreflightScript: NO_GH_PREFLIGHT,
      });
      expect(record.stage).toBe('M3'); // proxy rung green now — M3 reached; M4 blocked on the human seam
      expect(record.blockers[0]).toMatch(/^M4 blocked:/);
      expect(record.blockers[0]).toContain("extra rung 'human-seam-wired' (M4) failed");
      expect(record.blockers[0]).toContain('no agent declares "kind: human"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(profileDir, { recursive: true, force: true });
    }
  });

  test('D2: all three rungs satisfied (proxy reachable + direction filled + human seam wired) -> M4/ARMED reached, blocked at M5', async () => {
    const dir = tmpDir();
    const profileDir = tmpDir('oa-maturity-sd-profile-');
    try {
      writeSelfDrivingLikeProfile(profileDir);
      writeSelfDrivingLikeInstall(dir, { withHuman: true });
      const env = { ...process.env, MODEL_PROXY_URL: 'http://proxy.test', PUBLIC_AGENT_MAINTAINERS: 'brennan' };
      const record = await computeMaturity({
        cwd: dir,
        profileDir,
        proc: withRealGit(ghGreenStub()),
        env,
        fetchImpl: fetch200,
        preflightBin: NO_PREFLIGHT,
        ghPreflightScript: NO_GH_PREFLIGHT,
      });
      expect(record.stage).toBe('M4');
      expect(record.stageName).toBe('ARMED');
      expect(record.blockers[0]).toMatch(/^M5 blocked:/);
      const proxyRung = record.signals.find((s) => s.id === 'proxy-ready')!;
      expect(proxyRung.present).toBe(true);
      const seamRung = record.signals.find((s) => s.id === 'human-seam-wired')!;
      expect(seamRung.present).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(profileDir, { recursive: true, force: true });
    }
  });

  test('D2: an UNRECOGNIZED extra rung fails closed and blocks its assumed stage (M4), never silently waved through', async () => {
    const dir = tmpDir();
    const profileDir = tmpDir('oa-maturity-profile-');
    try {
      // A local-git fixture whose pack declares a rung name this composer does not implement.
      mkdirSync(profileDir, { recursive: true });
      writeFileSync(join(profileDir, 'ir.yml'), 'targets: [local]\ncodeHost: local-git\n');
      writeFileSync(
        join(profileDir, 'setup-pack.yml'),
        'landing_mode: pr-free\nboard_seed_recipe: {originator_skill: draft, promotion_fence: state, import_verb: "ztrack issue add", landing_path: direct}\nmaturity_signals: {m3_tool: doctor, m4_predicate: ztrack, m4_allowlist_label: oa-approved, m6_signal: per-issue}\nextra_rungs: [custom-gate]\nterminal_stage: M5\n',
      );
      writeGenerated(dir, ['.open-autonomy/autonomy.yml', '.open-autonomy/generated.json', 'scheduler/schedule.json']);
      writeAutonomyYml(dir);
      writeSchedule(dir);
      gitInit(dir);
      gitCommitAll(dir);
      const stub = baseStub().onArgs('npx', ['ztrack', 'issue', 'list'], () => ok(JSON.stringify([{ identifier: 'A-1', labels: ['oa-approved'] }])));
      const record = await computeMaturity({ cwd: dir, profileDir, proc: withRealGit(stub), preflightBin: NO_PREFLIGHT, ghPreflightScript: NO_GH_PREFLIGHT });
      expect(record.stage).toBe('M3');
      expect(record.blockers[0]).toMatch(/^M4 blocked:/);
      expect(record.blockers[0]).toContain('no signal implementation for extra rung "custom-gate"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(profileDir, { recursive: true, force: true });
    }
  });
});

// ============================================================================================
// Fix-round D3: ran-and-FAILED external checkers are never softened — only the
// doctor-unavailable (checker-not-resolvable) case is.
// ============================================================================================

describe('computeMaturity — ran-and-failed checker semantics (D3)', () => {
  test('D3: A11 preflight that RAN and exited nonzero BLOCKS M3 (softening covers only doctor-unavailable, never a real failure)', async () => {
    const dir = tmpDir();
    const profileDir = tmpDir('oa-maturity-profile-');
    try {
      writeLocalGitProfile(profileDir);
      writeGenerated(dir, ['.open-autonomy/autonomy.yml', '.open-autonomy/generated.json', 'scheduler/schedule.json']);
      writeAutonomyYml(dir);
      writeSchedule(dir);
      gitInit(dir);
      gitCommitAll(dir);
      // A REAL, existing file as the preflight bin (so existsSync passes and A11 actually runs it via the
      // proc seam), with the `bun <bin>` invocation stubbed to a genuine nonzero exit.
      const realExistingBin = join(profileDir, 'ir.yml');
      const stub = baseStub()
        .onArgs('npx', ['ztrack', 'issue', 'list'], () => ok(JSON.stringify([{ identifier: 'A-1', labels: ['oa-approved'] }])))
        .onArgs('bun', [realExistingBin], () => fail('preflight: FAIL — 2 blocking issue(s) found', 1));
      const record = await computeMaturity({ cwd: dir, profileDir, proc: withRealGit(stub), preflightBin: realExistingBin, ghPreflightScript: NO_GH_PREFLIGHT });
      expect(record.stage).toBe('M2');
      expect(record.blockers[0]).toMatch(/^M3 blocked:/);
      expect(record.blockers[0]).toContain('A11 local preflight failed');
      expect(record.blockers[0]).toContain('exited 1');
      expect(record.blockers[0]).not.toContain('doctor-unavailable');
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(profileDir, { recursive: true, force: true });
    }
  });

  test('D3: A13 admin-confirmed 404 is the GENUINE negative ("protection NOT applied") and blocks M3 — distinct from unverifiable', async () => {
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
        .onArgs('gh', ['api', 'repos/acme/widgets'], () => ok('true')) // admin CONFIRMED
        .onArgs('gh', ['api', 'repos/acme/widgets/branches/main/protection'], () => fail('HTTP 404: Branch not protected (https://api.github.com/repos/acme/widgets/branches/main/protection)', 1));
      const record = await computeMaturity({ cwd: dir, profileDir, proc: withRealGit(stub), preflightBin: NO_PREFLIGHT, ghPreflightScript: NO_GH_PREFLIGHT });
      expect(record.stage).toBe('M2');
      expect(record.blockers[0]).toMatch(/^M3 blocked:/);
      expect(record.blockers[0]).toContain('protection NOT applied on acme/widgets@main');
      const a13 = record.signals.find((s) => s.id === 'A13')!;
      expect(a13.present).toBe(false);
      expect(a13.evidence).not.toMatch(/^unverifiable:/); // the admin-confirmed 404 is a definite negative
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(profileDir, { recursive: true, force: true });
    }
  });
});

// ============================================================================================
// TP.1 acceptance — ladder fixture tests driven against the REAL `profiles/simple-gh-sdlc` pack
// (getSetupPack/checkPackDrift's own real-catalog subject, not a synthetic mirror), proving the
// M3(A13-blocked)/M4/M5 boundaries with this pack's actual field values — the "upper rungs" evidence a
// local scratch install (no real GitHub repo, per the standing ⛔ no-real-repo rule) cannot itself reach
// live. Companion to the PR's live transcript (a real `compile` + `oa doctor` run against a scratch dir).
// ============================================================================================
describe('computeMaturity — TP.1 ladder fixtures (real profiles/simple-gh-sdlc pack)', () => {
  const REAL_PROFILE_DIR = 'profiles/simple-gh-sdlc';

  function committedGithubInstall(dir: string, opts: { pin?: string } = {}): void {
    writeGenerated(dir, ['.open-autonomy/autonomy.yml', '.open-autonomy/generated.json', 'scheduler/schedule.json']);
    writeAutonomyYml(dir, { codeHost: 'github' });
    writeSchedule(dir, opts);
    gitInit(dir);
    gitCommitAll(dir);
  }

  /** gh stubbed fully green for simple-gh-sdlc's REAL provision.json required_checks
   *  (['ci','agent-review','security']) + a `ready`-labeled gh-issue on the board (m4_predicate=gh-issues)
   *  + no open PRs (nothing in flight). */
  function ghGreenStubForRealPack(): StubProc {
    return baseStub()
      .onArgs('gh', ['repo', 'view'], () => ok('acme/widgets'))
      .onArgs('gh', ['api', 'repos/acme/widgets'], () => ok('true'))
      .onArgs('gh', ['api', 'repos/acme/widgets/branches/main/protection'], () =>
        ok(JSON.stringify({ required_status_checks: { contexts: ['ci', 'agent-review', 'security'] } })),
      )
      .onArgs('gh', ['issue', 'list', '--state', 'open'], () => ok(JSON.stringify([{ number: 9, labels: [{ name: 'ready' }] }])))
      .onArgs('gh', ['pr', 'list', '--state', 'open'], () => ok('[]'));
  }

  test('M3(A13-blocked): local target, no real GitHub repo (gh not logged in) -> honest M2, A13 unverifiable — the exact live-acceptance scenario for a github-codeHost profile on a local scratch install', async () => {
    const dir = tmpDir();
    try {
      committedGithubInstall(dir);
      const record = await computeMaturity({
        cwd: dir,
        profileDir: REAL_PROFILE_DIR,
        target: 'local',
        proc: withRealGit(baseStub()), // baseStub's catch-all: any `gh …` -> "not logged in"
        preflightBin: NO_PREFLIGHT,
        ghPreflightScript: NO_GH_PREFLIGHT,
      });
      expect(record.stage).toBe('M2');
      expect(record.substrate).toBe('local');
      expect(record.blockers[0]).toMatch(/^M3 blocked:/);
      expect(record.blockers[0]).toContain('A13 branch-protection HARD signal failed');
      expect(record.blockers[0]).toContain('unverifiable');
      const a13 = record.signals.find((s) => s.id === 'A13')!;
      expect(a13.present).toBe(false);
      expect(a13.evidence).toMatch(/^unverifiable:/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("m3_tool dual-target decision (TP.1 fix): target='gh-actions' against the real pack's literal m3_tool='doctor' falls back to A12/gh-preflight — A8 is correctly ABSENT from applicable (TB.3's own target-driven selection), and the M3 gate no longer permanently blocks on a signal that was never evaluated", async () => {
    const dir = tmpDir();
    try {
      committedGithubInstall(dir);
      const record = await computeMaturity({
        cwd: dir,
        profileDir: REAL_PROFILE_DIR,
        target: 'gh-actions',
        proc: withRealGit(ghGreenStubForRealPack()),
        preflightBin: NO_PREFLIGHT,
        ghPreflightScript: NO_GH_PREFLIGHT, // softened -> A12 doctor-unavailable counts as OK
      });
      // A8/A10 were never evaluated for this target — TB.3 already excludes them (signal-sets.test.ts's
      // own 'gh-actions target: A12/A13 present, doctor SKIPPED' acceptance) — so they carry no entry here.
      expect(record.signals.find((s) => s.id === 'A8')).toBeUndefined();
      expect(record.skipped.some((s) => s.id === 'A8' && /gh-actions/.test(s.reason))).toBe(true);
      // A12 (softened doctor-unavailable) + A13 (green) together satisfy the fallback M3 gate.
      const a13 = record.signals.find((s) => s.id === 'A13')!;
      expect(a13.present).toBe(true);
      expect(record.stage === 'M3' || record.stage === 'M4').toBe(true); // M3 reached (not permanently capped at M2)
      expect(record.blockers.every((b) => !b.includes('A8/A10 (m3_tool=doctor) failed'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('M4 boundary: a ready-labeled gh-issue (m4_predicate=gh-issues, this pack\'s real value) -> A14 true, M4/ARMED reached, blocked at M5 (still paused)', async () => {
    const dir = tmpDir();
    try {
      committedGithubInstall(dir);
      writeFileSync(join(dir, '.open-autonomy', 'paused'), 'fresh install\n'); // fence still down
      const record = await computeMaturity({
        cwd: dir,
        profileDir: REAL_PROFILE_DIR,
        target: 'gh-actions',
        proc: withRealGit(ghGreenStubForRealPack()),
        preflightBin: NO_PREFLIGHT,
        ghPreflightScript: NO_GH_PREFLIGHT,
      });
      expect(record.stage).toBe('M4');
      expect(record.stageName).toBe('ARMED');
      expect(record.blockers[0]).toMatch(/^M5 blocked:/);
      expect(record.blockers[0]).toContain('A5 fence not lifted');
      const a14 = record.signals.find((s) => s.id === 'A14')!;
      expect(a14.present).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('M5 boundary: fence lifted but no install-scoped provider pin -> honest M4 cap, session evidence "unknown" (never a foreign/ambient guess) — DESIGN §Q1 M5 requires a profile agent to have ACTUALLY fired', async () => {
    const dir = tmpDir();
    try {
      committedGithubInstall(dir);
      rmSync(join(dir, '.open-autonomy', 'paused'), { force: true }); // fence lifted (A5 true), but no provider pin
      const record = await computeMaturity({
        cwd: dir,
        profileDir: REAL_PROFILE_DIR,
        target: 'gh-actions',
        proc: withRealGit(ghGreenStubForRealPack()),
        preflightBin: NO_PREFLIGHT,
        ghPreflightScript: NO_GH_PREFLIGHT,
      });
      expect(record.stage).toBe('M4');
      expect(record.blockers[0]).toMatch(/^M5 blocked:/);
      expect(record.blockers[0]).toContain('no real profile-agent session/fire evidence');
      expect(record.blockers[0]).toContain('no install-scoped provider pin');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('M5 boundary: fence lifted + an install-scoped session belonging to a declared agent -> M5/RUNNING reached', async () => {
    const dir = tmpDir();
    try {
      committedGithubInstall(dir, { pin: 'http://pinned.test' }); // TG.1's durable schedule.json provider pin
      rmSync(join(dir, '.open-autonomy', 'paused'), { force: true });
      const fakeProbe: SessionProbe = async (_cwd, pinnedProviderUrl) => {
        expect(pinnedProviderUrl).toBe('http://pinned.test');
        return [{ agent: 'pm', status: 'running' } as Session];
      };
      const record = await computeMaturity({
        cwd: dir,
        profileDir: REAL_PROFILE_DIR,
        target: 'gh-actions',
        proc: withRealGit(ghGreenStubForRealPack()),
        preflightBin: NO_PREFLIGHT,
        ghPreflightScript: NO_GH_PREFLIGHT,
        sessionProbe: fakeProbe,
      });
      expect(record.stage).toBe('M5');
      expect(record.stageName).toBe('RUNNING');
      // M5 reached; M6 (ADVANCING) is a separate, OBSERVABLE-not-required rung for this profile
      // (terminal_stage: M5 — see setup-pack.yml) — an honest "nothing to prove M6 against yet" is
      // expected here, never a fabricated M6 pass.
      expect(record.blockers[0]).toMatch(/^M6 blocked:/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
