// TE.8 — unit + integration tests for bin/install.ts (the unified `oa install` orchestrator).
//
// Covers: (1) --help documents the flow + all 4 gates; (2) each gate's pause-by-default / --auto-approve /
// explicit-answer behavior in isolation (fast, no real compile); (3) a FULL dry-run of the entire chain
// (DETECT through PROVE ADVANCING) against a scratch fixture with all four gates auto-approved, proving
// real phase-chaining (each phase's real output record correctly threads into the next phase's real input)
// and reaching the honest ceiling this program's other units already established (never M5/M6, since no
// real agent ever launches — go-live's `oa start` launch half is construct-only, though the safe `oa
// resume` fence-lift is performed for real).
//
// SAFETY (repeat of install.ts's own file header): every subprocess call in this file goes through an
// injected `proc`. Git/compile/identity-read calls are allowed to be REAL (offline-deterministic or
// already-established-safe — see makeStubProc's own comment); the ONE dangerous command shape
// (`node scripts/run-agent.mjs`, TE.5's planner dispatch) is ALWAYS intercepted here — this file never lets
// a real agent launch, and `report.handoff.goLive` is only ever asserted as "constructed", never spawned.
import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  ok,
  paused,
  blocked,
  parseArgs,
  phaseAuthorize,
  phaseDirection,
  phaseSelect,
  renderInstallHuman,
  runInstall,
  toProcFn,
  type Ctx,
  type InstallReport,
} from './install.ts';
import { defaultProc } from '../packages/local-runner-cli/src/proc.ts';
import { profilesRoot } from './bundled-profiles.ts';
import { getSetupPack } from '@open-autonomy/core';
import type { SelectionRecord } from './install-select.ts';
import type { ProcResult, ProcRunner } from '../packages/local-runner-cli/src/types.ts';

const REPO_ROOT = join(import.meta.dir, '..');

// Well over install-direction.ts's MIN_READABLE_CHARS (200) / MIN_PROSE_LINE_CHARS (40) floors — clears the
// readable-positioning bar so G2 (direction) is satisfied by the fixture's own README, never fabricated.
const LONG_PROSE =
  'This scratch repository exists purely to prove the TE.8 install orchestrator chains all seven phases end ' +
  'to end, with substantially more than two hundred non-whitespace characters of real prose on a single ' +
  'line, so this test never has to fabricate mission content to satisfy G2.';

const tmps: string[] = [];
function track(dir: string): string {
  tmps.push(dir);
  return dir;
}
function cleanupAll(): void {
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true });
}

function realGitProc(): ProcRunner {
  return (cmd, args, opts = {}) => {
    const r = spawnSync(cmd, args, { cwd: opts.cwd, encoding: 'utf8', env: opts.env ?? process.env });
    return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  };
}
function initGitRepo(dir: string): void {
  const proc = realGitProc();
  proc('git', ['init', '-q'], { cwd: dir });
  proc('git', ['config', 'user.email', 'te8@example.com'], { cwd: dir });
  proc('git', ['config', 'user.name', 'TE8 Test'], { cwd: dir });
}

function seedDummyPackage(dir: string, name: string): void {
  const pkgDir = join(dir, 'node_modules', name);
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name, version: '0.0.0', main: 'index.js' }));
  writeFileSync(join(pkgDir, 'index.js'), '');
}

/** A scratch git repo: real README positioning (so G2 is already satisfied), no GitHub remote (so
 *  detection/recommendation never touches a real target repo), and dummy ztrack/termfleet packages so
 *  EXECUTE's install-deps step never shells out to a real (network-dependent) `npm install`. */
function makeFixture(): string {
  const dir = track(mkdtempSync(join(tmpdir(), 'oa-te8-')));
  initGitRepo(dir);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'scratch', version: '0.0.0' }));
  writeFileSync(join(dir, 'README.md'), `# Scratch\n\n${LONG_PROSE}\n`);
  seedDummyPackage(dir, 'ztrack');
  seedDummyPackage(dir, 'termfleet');
  const proc = realGitProc();
  proc('git', ['add', '-A'], { cwd: dir });
  proc('git', ['commit', '-q', '-m', 'initial'], { cwd: dir });
  return dir;
}

/** The ONE mandatory mock (planner dispatch, `node scripts/run-agent.mjs`) plus `npx` (ztrack board
 *  probes — always report empty: deterministic and offline, never letting `npx` fall back to a network
 *  registry fetch for a package this fixture only vendors a dummy stub of). Everything else — git, the
 *  REAL `bun bin/autonomy-compile.ts` compile, `gh auth status`/`gh api user` identity-only reads — is a
 *  real subprocess call (defaultProc), matching this program's own precedent (install-execute.test.ts's
 *  "full ordering" test mixes real git with a mocked planner dispatch the same way). */
function makeStubProc(callLog: string[]): ProcRunner {
  return (cmd, args, opts) => {
    callLog.push(`${cmd} ${args.join(' ')}`);
    if (cmd === 'node' && args[0] === 'scripts/run-agent.mjs') {
      return { status: 0, stdout: '(mocked planner dispatch — TE.8 dry-run proof, no real agent ever launched)', stderr: '' };
    }
    if (cmd === 'npx') {
      return { status: 0, stdout: '[]', stderr: '' };
    }
    return defaultProc(cmd, args, opts);
  };
}

const GENERIC_HEALTHY = { ok: true, service: 'console', provider: 'virtual-tmux' };
function stubFetch(): typeof fetch {
  return (async () => ({ ok: true, status: 200, json: async () => GENERIC_HEALTHY }) as unknown as Response) as unknown as typeof fetch;
}
const FAKE_BRING_UP = { isPortFree: () => true, spawnImpl: () => ({ pid: 4242, unref: () => {} }), fetchImpl: stubFetch(), rangeStart: 43000, rangeEnd: 43100 };

// =========================================================================================================
// --help
// =========================================================================================================

describe('bun bin/install.ts --help', () => {
  function help(...args: string[]): { code: number; stdout: string; stderr: string } {
    const r = Bun.spawnSync(['bun', join(REPO_ROOT, 'bin', 'install.ts'), ...args], { cwd: REPO_ROOT, stdout: 'pipe', stderr: 'pipe' });
    return { code: r.exitCode, stdout: r.stdout.toString('utf8'), stderr: r.stderr.toString('utf8') };
  }

  test('exits 0 and documents the full DETECT->...->PROVE ADVANCING flow', () => {
    const r = help('--help');
    expect(r.code).toBe(0);
    for (const phase of ['DETECT', 'SELECT', 'DIRECTION', 'AUTHORIZE', 'EXECUTE', 'VALIDATE', 'HAND-OFF', 'PROVE ADVANCING']) {
      expect(r.stdout).toContain(phase);
    }
  });

  test('documents all 4 human gates by name', () => {
    const r = help('--help');
    for (const gate of ['G1', 'G2', 'G3', 'G4a']) {
      expect(r.stdout).toContain(gate);
    }
  });

  test('documents --auto-approve and every gate-answer flag', () => {
    const r = help('--help');
    for (const flag of ['--auto-approve', '--confirm-select', '--override-select', '--direction-fill', '--spend-cadence', '--consent-gh-admin', '--consent-proxy', '--launcher']) {
      expect(r.stdout).toContain(flag);
    }
  });

  test('bare invocation (no repoDir) exits 2', () => {
    const r = help();
    expect(r.code).toBe(2);
  });
});

// =========================================================================================================
// parseArgs
// =========================================================================================================

describe('parseArgs', () => {
  test('unknown flag is a loud error', () => {
    const { error } = parseArgs(['/tmp/x', '--comfirm-select', 'foo@local']);
    expect(error).toMatch(/unknown flag/);
  });
  test('positional repoDir + typed flags parse correctly', () => {
    const { opts, error } = parseArgs(['/tmp/x', '--auto-approve', '--owner-repo', 'acme/widgets', '--spend-wip', '2']);
    expect(error).toBeUndefined();
    expect(opts.repoDir).toBe('/tmp/x');
    expect(opts.autoApprove).toBe(true);
    expect(opts.ownerRepo).toBe('acme/widgets');
    expect(opts.spendWip).toBe(2);
  });
  test('--substrate rejects an invalid value', () => {
    const { error } = parseArgs(['/tmp/x', '--substrate', 'bogus']);
    expect(error).toMatch(/local.*gh-actions/);
  });
});

// =========================================================================================================
// Gate-level unit tests — fast, no real compile. Each gate function is exercised directly against a Ctx.
// =========================================================================================================

function selectionRecordFor(profile: string, repoDir: string): SelectionRecord {
  const pack = getSetupPack(join(profilesRoot, profile));
  return {
    profile,
    substrate: pack.codeHost === 'github' ? 'gh-actions' : 'local',
    pack,
    g1: { asked: false, answer: 'test fixture' },
    detect: { source: 'live', repoDir, repoFacts: { onGitHub: pack.codeHost === 'github', populated: true, ghAdmin: undefined } },
  };
}

function baseCtx(repoDir: string, workDir: string, autoApprove: boolean, extra: Partial<Ctx['opts']> = {}): Ctx {
  return {
    repoDir,
    workDir,
    profilesRoot,
    proc: defaultProc,
    autoApprove,
    opts: { repoDir, ...extra },
  };
}

describe('GateResult helpers', () => {
  test('ok/paused/blocked shape their status correctly', () => {
    expect(ok({ x: 1 })).toEqual({ status: 'ok', record: { x: 1 } });
    expect(paused('q', 'hint').status).toBe('paused');
    expect(blocked('q').status).toBe('blocked');
  });
});

describe('phaseDirection (G2) — never fabricates mission content', () => {
  test('operator mode, repo already has readable positioning -> ok, no fill needed', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-te8-')));
    writeFileSync(join(dir, 'README.md'), `# X\n\n${LONG_PROSE}\n`);
    const workDir = join(dir, 'work');
    mkdirSync(workDir, { recursive: true });
    const record = selectionRecordFor('simple-sdlc', dir);
    const recordFile = join(workDir, '01-selection.json');
    writeFileSync(recordFile, JSON.stringify(record));
    const ctx = baseCtx(dir, workDir, false);
    const r = phaseDirection(ctx, recordFile);
    expect(r.status).toBe('ok');
    expect(r.record?.action).toBe('no-action-needed');
    cleanupAll();
  });

  test('operator mode, no positioning at all, no --direction-fill, --auto-approve TRUE -> still PAUSED (never fabricates content)', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-te8-')));
    const workDir = join(dir, 'work');
    mkdirSync(workDir, { recursive: true });
    const record = selectionRecordFor('simple-sdlc', dir);
    const recordFile = join(workDir, '01-selection.json');
    writeFileSync(recordFile, JSON.stringify(record));
    const ctx = baseCtx(dir, workDir, /* autoApprove */ true);
    const r = phaseDirection(ctx, recordFile);
    expect(r.status).toBe('paused');
    expect(r.resumeHint).toMatch(/--direction-fill/);
    cleanupAll();
  });

  test('no positioning, --direction-fill supplied -> ok (content already gathered, EXECUTE applies+re-verifies it)', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-te8-')));
    const workDir = join(dir, 'work');
    mkdirSync(workDir, { recursive: true });
    const record = selectionRecordFor('simple-sdlc', dir);
    const recordFile = join(workDir, '01-selection.json');
    writeFileSync(recordFile, JSON.stringify(record));
    const fillFile = join(workDir, 'fill.json');
    writeFileSync(fillFile, JSON.stringify({ files: [{ path: 'README.md', content: LONG_PROSE }] }));
    const ctx = baseCtx(dir, workDir, false, { directionFill: fillFile });
    const r = phaseDirection(ctx, recordFile);
    expect(r.status).toBe('ok');
    cleanupAll();
  });
});

describe('phaseAuthorize (G3) — universal consents auto-approve; GitHub-admin/proxy NEVER auto-approve', () => {
  test('local, non-GitHub profile, --auto-approve -> ok with no extra flags', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-te8-')));
    const workDir = join(dir, 'work');
    mkdirSync(workDir, { recursive: true });
    const record = selectionRecordFor('simple-sdlc', dir);
    const recordFile = join(workDir, '01-selection.json');
    writeFileSync(recordFile, JSON.stringify(record));
    const ctx = baseCtx(dir, workDir, true);
    const r = await phaseAuthorize(ctx, recordFile);
    expect(r.status).toBe('ok');
    expect(r.record?.spend.cadence).toBe('*/15');
    expect(r.record?.gh).toBeUndefined();
    cleanupAll();
  });

  test('local, non-GitHub profile, NOT auto-approve, no flags -> paused at the universal consents', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-te8-')));
    const workDir = join(dir, 'work');
    mkdirSync(workDir, { recursive: true });
    const record = selectionRecordFor('simple-sdlc', dir);
    const recordFile = join(workDir, '01-selection.json');
    writeFileSync(recordFile, JSON.stringify(record));
    const ctx = baseCtx(dir, workDir, false);
    const r = await phaseAuthorize(ctx, recordFile);
    expect(r.status).toBe('paused');
    cleanupAll();
  });

  test('GitHub profile, --auto-approve, NO --consent-gh-admin -> still PAUSED (named security boundary, never self-granted)', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-te8-')));
    const workDir = join(dir, 'work');
    mkdirSync(workDir, { recursive: true });
    const record = selectionRecordFor('simple-gh-sdlc', dir);
    const recordFile = join(workDir, '01-selection.json');
    writeFileSync(recordFile, JSON.stringify(record));
    const ctx = baseCtx(dir, workDir, true);
    const r = await phaseAuthorize(ctx, recordFile);
    expect(r.status).toBe('paused');
    expect(r.resumeHint).toMatch(/consent-gh-admin/);
    cleanupAll();
  });

  test('GitHub profile, --auto-approve + explicit --consent-gh-admin --identity -> ok', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-te8-')));
    const workDir = join(dir, 'work');
    mkdirSync(workDir, { recursive: true });
    const record = selectionRecordFor('simple-gh-sdlc', dir);
    const recordFile = join(workDir, '01-selection.json');
    writeFileSync(recordFile, JSON.stringify(record));
    const ctx = baseCtx(dir, workDir, true, { consentGhAdmin: true, identity: 'own-token' });
    const r = await phaseAuthorize(ctx, recordFile);
    expect(r.status).toBe('ok');
    expect(r.record?.gh?.identity).toBe('own-token');
    // never opens a real probe PR unless --live-probe was explicitly given.
    expect(r.record?.checkNameDiscovery.status).toBe('deferred');
    cleanupAll();
  });

  test('self-driving-shaped profile, --auto-approve, no --consent-proxy -> paused (real infra/spend decision, never auto-approved)', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-te8-')));
    const workDir = join(dir, 'work');
    mkdirSync(workDir, { recursive: true });
    const record = selectionRecordFor('self-driving', dir);
    const recordFile = join(workDir, '01-selection.json');
    writeFileSync(recordFile, JSON.stringify(record));
    const ctx = baseCtx(dir, workDir, true, { consentGhAdmin: true, identity: 'own-token' });
    const r = await phaseAuthorize(ctx, recordFile);
    expect(r.status).toBe('paused');
    expect(r.resumeHint).toMatch(/consent-proxy/);
    cleanupAll();
  });
});

// =========================================================================================================
// runInstall — pause-by-default + resume-across-invocations (fast: stops at G1, never reaches EXECUTE).
// =========================================================================================================

describe('runInstall — pauses at G1 by default; a second invocation with the answer resumes', () => {
  test('no --auto-approve, no answers -> PAUSED at G1; EXECUTE never ran', async () => {
    const dir = makeFixture();
    const workDir = join(dir, 'work');
    const report = await runInstall({ repoDir: dir, workDir, proc: defaultProc });
    expect(report.classification).toBe('PAUSED');
    expect(report.stoppedAt).toBe('G1');
    expect(report.execute).toBeUndefined();
    expect(existsSync(join(workDir, '04-execute.json'))).toBe(false);
    expect(report.question).toMatch(/recommend/);
    expect(renderInstallHuman(report)).toContain('TO CONTINUE');
    cleanupAll();
  });

  test('second invocation supplying --confirm-select resumes past G1 and pauses at the NEXT unanswered gate', async () => {
    const dir = makeFixture();
    const workDir = join(dir, 'work');
    const first = await runInstall({ repoDir: dir, workDir, proc: defaultProc });
    expect(first.classification).toBe('PAUSED');
    expect(first.stoppedAt).toBe('G1');
    const token = first.resumeHint!.match(/--confirm-select (\S+)/)![1]!;

    const second = await runInstall({ repoDir: dir, workDir, proc: defaultProc, confirmSelect: token });
    expect(second.selection).toBeDefined();
    expect(second.stoppedAt).not.toBe('G1');
    // G2 is already satisfied by the fixture's README, so this should reach G3 and pause there (no consents given).
    expect(second.classification).toBe('PAUSED');
    expect(second.stoppedAt).toBe('G3');
    cleanupAll();
  });
});

// =========================================================================================================
// THE FULL DRY-RUN — DETECT through PROVE ADVANCING, all 4 gates auto-approved, against a scratch fixture.
// Proves real phase-chaining (each phase's real output record correctly threads into the next phase's real
// input) end to end. The ONLY mocked call is the planner dispatch (SAFETY — see file header); everything
// else is a real subprocess (git, a REAL `bun bin/autonomy-compile.ts` compile, gh identity-only reads).
// =========================================================================================================

describe('runInstall — FULL CHAIN dry-run, all 4 gates auto-approved (bin/install.test.ts)', () => {
  test('DETECT -> SELECT -> DIRECTION -> AUTHORIZE -> EXECUTE -> VALIDATE -> HAND-OFF -> PROVE ADVANCING completes; honest ceiling, never M5/M6', async () => {
    const dir = makeFixture();
    const workDir = join(dir, '.open-autonomy', 'install-work');
    const callLog: string[] = [];
    const proc = makeStubProc(callLog);

    const report: InstallReport = await runInstall({
      repoDir: dir,
      workDir,
      autoApprove: true,
      proc,
      bringUp: FAKE_BRING_UP,
    });

    // --- reached the end, never blocked/paused ---------------------------------------------------------
    expect(report.classification).toBe('COMPLETED');

    // --- G1: recommended+confirmed a real profile for this local, non-GitHub fixture -------------------
    expect(report.selection?.substrate).toBe('local');
    expect(report.selection?.pack.codeHost).toBe('local-git');
    expect(report.selection?.g1.asked).toBe(true);
    expect(report.selection?.g1.answer).toMatch(/^confirmed/);
    const profile = report.selection!.profile;

    // --- G2: satisfied by the fixture's own README, nothing invented -----------------------------------
    expect(report.direction?.invariant.satisfied).toBe(true);
    expect(report.direction?.mode).toBe('operator');

    // --- G3: universal consents applied, GitHub/proxy legs never touched for a local-git profile -------
    expect(report.authorize?.spend.cadence).toBe('*/15');
    expect(report.authorize?.harness.consented).toBe(true);
    expect(report.authorize?.gh).toBeUndefined();
    expect(report.authorize?.proxy).toBeUndefined();

    // --- EXECUTE: all 7 steps ran; ci-and-provision skipped (local-git); the harness is really committed
    expect(report.execute?.ok).toBe(true);
    expect(report.execute?.steps.map((s) => s.id)).toEqual([
      'install-deps',
      'compile',
      'direction-fill',
      'commit-harness',
      'provider-up',
      'ci-and-provision',
      'seed-board-drafts',
    ]);
    expect(report.execute?.steps.find((s) => s.id === 'compile')?.status).toBe('ok');
    expect(report.execute?.steps.find((s) => s.id === 'direction-fill')?.status).toBe('skipped');
    expect(report.execute?.steps.find((s) => s.id === 'commit-harness')?.status).toBe('ok');
    expect(report.execute?.steps.find((s) => s.id === 'ci-and-provision')?.status).toBe('skipped');
    expect(report.execute?.steps.find((s) => s.id === 'seed-board-drafts')?.status).toBe('ok');
    // the REAL compile really materialized a harness manifest on disk (genuine end-to-end proof, not a stub).
    expect(existsSync(join(dir, '.open-autonomy', 'generated.json'))).toBe(true);

    // --- VALIDATE: an honest IMM stage report was produced ----------------------------------------------
    expect(report.validate).toBeDefined();
    expect(report.validate!.maturity.stage).toBeDefined();

    // --- HAND-OFF: verify-only + construct-only, board never had a REAL draft filed (planner mocked) ---
    expect(report.handoff).toBeDefined();
    expect(report.handoff!.verification.ready).toBe(false);
    // whatever go-live shape was reported, it is a construction, never an executed command.
    if (report.handoff!.goLive && 'startCommand' in report.handoff!.goLive) {
      expect(callLog.some((c) => c.startsWith('tmux new-session'))).toBe(false);
    }

    // --- PROVE ADVANCING: never overclaims M6 with a mocked planner dispatch ---------------------------
    expect(report.proveAdvancing?.m6Present).toBe(false);
    expect(report.proveAdvancing?.classification).not.toBe('ADVANCING');

    // --- SAFETY: exactly one real-agent-shaped dispatch happened, and it was intercepted ---------------
    // (exact-match, not `.includes` — the harness-commit step's own `git add/status` calls legitimately
    // carry "scripts/run-agent.mjs" as ONE of ~30 committed filenames in their argv, which must not be
    // miscounted as a second dispatch).
    const plannerCalls = callLog.filter((c) => c === 'node scripts/run-agent.mjs');
    expect(plannerCalls.length).toBe(1);
    expect(callLog.some((c) => c.startsWith('tmux ') || c.includes(' oa start') || c.startsWith('oa start'))).toBe(false);
    expect(callLog.some((c) => c.startsWith('gh pr merge') || c.startsWith('gh pr create'))).toBe(false);

    // --- phase-chaining evidence: every intermediate record landed on disk, correctly threaded ---------
    for (const f of ['00-detect.json', '01-selection.json', '02-direction.json', '03-authorize.json', '04-execute.json', '05-validate.json', '06-handoff.json', '07-prove-advancing.json']) {
      expect(existsSync(join(workDir, f))).toBe(true);
    }
    const detectOnDisk = JSON.parse(readFileSync(join(workDir, '00-detect.json'), 'utf8'));
    const selectionOnDisk = JSON.parse(readFileSync(join(workDir, '01-selection.json'), 'utf8'));
    const directionOnDisk = JSON.parse(readFileSync(join(workDir, '02-direction.json'), 'utf8'));
    const authorizeOnDisk = JSON.parse(readFileSync(join(workDir, '03-authorize.json'), 'utf8'));
    // SELECT's input was DETECT's own real output (same repoDir, same repoFacts.onGitHub reading).
    expect(selectionOnDisk.detect.repoFacts.onGitHub).toBe(detectOnDisk.git.onGitHub);
    // DIRECTION's input was SELECT's own real output (same profile).
    expect(directionOnDisk.profile).toBe(selectionOnDisk.profile);
    // AUTHORIZE's input was SELECT's own real output (same profile/substrate).
    expect(authorizeOnDisk.profile).toBe(selectionOnDisk.profile);
    expect(authorizeOnDisk.substrate).toBe(selectionOnDisk.substrate);

    // --- rendered human output is coherent (smoke) -------------------------------------------------------
    const human = renderInstallHuman(report);
    expect(human).toContain(profile);
    expect(human).toContain('HONEST CEILING');

    cleanupAll();
  }, 60000);
});
