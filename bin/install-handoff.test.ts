// TE.6 — unit tests for bin/install-handoff.ts (Phase 6 HAND-OFF: G4a verify+go-live, G4b runbook).
//
// House style (mirrors install-execute.test.ts / maturity.test.ts): every subprocess call goes through an
// injected `StubProc`/`ProcRunner` (or real, offline `git`/filesystem ops in a throwaway tmp dir) — nothing
// here ever shells out to a real `gh`/`ztrack`, launches a real agent, spawns a real `tmux`/`oa start`, or
// touches a real GitHub repo. Every "go-live" assertion below stops at "the command/action was constructed
// correctly" — see this file's own SAFETY notes at the local-go-live and hosted-go-live suites.
import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildHostedGoLive,
  buildLocalGoLive,
  G4B_RUNBOOK,
  localPauseState,
  runG4a,
  verifyG4aReady,
  type DispatchCommand,
} from './install-handoff.ts';
import { computeMaturity } from '../packages/local-runner-cli/src/maturity.ts';
import type { SessionProbe } from '../packages/local-runner-cli/src/maturity.ts';
import { pause } from '../packages/local-runner-cli/src/pause.ts';
import { StubProc, fail, ok } from '../packages/local-runner-cli/src/test-support/stub-proc.ts';
import { defaultProc } from '../packages/local-runner-cli/src/proc.ts';
import type { ProcRunner } from '../packages/local-runner-cli/src/types.ts';

const tmps: string[] = [];
function track(dir: string): string {
  tmps.push(dir);
  return dir;
}
function cleanupAll() {
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true });
}

function withRealGit(stub: StubProc): ProcRunner {
  return (cmd, args, opts) => (cmd === 'git' ? defaultProc(cmd, args, opts) : stub.runner(cmd, args, opts));
}

// =========================================================================================================
// G4a verification — acceptance (a): fixture board WITHOUT the promotion -> "not ready...promote an item
// first"; fixture WITH exactly one ready+oa-approved item -> "ready for go-live". Uses TA.2's REAL
// `hasDispatchableWork` (never re-derived) against `profiles/simple-sdlc`'s real setup-pack.yml (ztrack +
// `oa-approved` allowlist — the exact shape the task names).
// =========================================================================================================

describe('verifyG4aReady — G4a is a VERIFICATION of a human act, never a promotion', () => {
  test('empty board (nothing promoted yet) -> not ready, names the required act', () => {
    const stub = new StubProc().onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'ready'], () => ok('[]'));
    const v = verifyG4aReady({ cwd: '/fake/repo', variant: 'ztrack', allowlistLabel: 'oa-approved', proc: stub.runner });
    expect(v.ready).toBe(false);
    expect(v.message).toMatch(/not ready for go-live, promote an item first/);
    expect(v.message).toMatch(/board empty/);
  });

  test('a ready item WITHOUT the oa-approved label (promotion not yet done) -> still not ready', () => {
    const stub = new StubProc()
      .onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'ready'], () => ok(JSON.stringify([{ identifier: 'X-1', labels: [] }])))
      .onArgs('git', ['rev-parse', '--verify', '--quiet', 'agent/issue-X-1'], () => fail('unknown revision', 1));
    const v = verifyG4aReady({ cwd: '/fake/repo', variant: 'ztrack', allowlistLabel: 'oa-approved', proc: stub.runner });
    expect(v.ready).toBe(false);
    expect(v.message).toMatch(/not ready for go-live, promote an item first/);
    expect(v.message).toMatch(/oa-approved/);
  });

  test('exactly one ready+oa-approved item, not already in flight -> ready for go-live', () => {
    const stub = new StubProc()
      .onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'ready'], () => ok(JSON.stringify([{ identifier: 'X-2', labels: ['oa-approved'] }])))
      .onArgs('git', ['rev-parse', '--verify', '--quiet', 'agent/issue-X-2'], () => fail('unknown revision', 1));
    const v = verifyG4aReady({ cwd: '/fake/repo', variant: 'ztrack', allowlistLabel: 'oa-approved', proc: stub.runner });
    expect(v.ready).toBe(true);
    expect(v.message).toMatch(/^ready for go-live/);
    expect(v.verdict.actionableCount).toBe(1);
  });

  test('resolved via the REAL profiles/simple-sdlc setup-pack.yml (ztrack + oa-approved), not a hand-fed variant', () => {
    const stub = new StubProc()
      .onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'ready'], () => ok(JSON.stringify([{ identifier: 'S-1', labels: ['oa-approved'] }])))
      .onArgs('git', ['rev-parse', '--verify', '--quiet', 'agent/issue-S-1'], () => fail('unknown revision', 1));
    const v = verifyG4aReady({ cwd: '/fake/repo', profileDir: 'profiles/simple-sdlc', proc: stub.runner });
    expect(v.ready).toBe(true);
    expect(v.verdict.source).toBe('setup-pack');
    expect(v.verdict.allowlistLabel).toBe('oa-approved');
  });

  test('an already-in-flight ready+oa-approved item (agent/issue-<id> branch exists) -> not ready (not fresh work)', () => {
    const stub = new StubProc()
      .onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'ready'], () => ok(JSON.stringify([{ identifier: 'X-3', labels: ['oa-approved'] }])))
      .onArgs('git', ['rev-parse', '--verify', '--quiet', 'agent/issue-X-3'], () => ok('deadbeef'));
    const v = verifyG4aReady({ cwd: '/fake/repo', variant: 'ztrack', allowlistLabel: 'oa-approved', proc: stub.runner });
    expect(v.ready).toBe(false);
  });
});

// =========================================================================================================
// LOCAL go-live — command construction only. ⛔ SAFETY: `startCommand` returned below is asserted on, NEVER
// passed to a real proc/spawn anywhere in this suite.
// =========================================================================================================

describe('buildLocalGoLive — construction only, FORCED PIN (the single most important proof in this unit)', () => {
  test('no schedule.json pin recorded -> BLOCKED, never falls through to ambient', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-te6-')));
    const r = buildLocalGoLive(dir);
    expect(r.status).toBe('blocked');
    expect((r as { message: string }).message).toMatch(/no TERMFLEET_PROVIDER_URL pin found/);
    expect((r as { message: string }).message).toMatch(/oa provider up/);
    cleanupAll();
  });

  // Regression test, same shape as TE.5's own `buildPlannerDispatchCommand` forced-pin test
  // (bin/install-execute.test.ts: "forces TERMFLEET_PROVIDER_URL to the INSTALL-SCOPED pin, never
  // ambient") — this session's own TE.5 incident is exactly the hazard this proves closed for Phase 6's
  // go-live command too: an ambient TERMFLEET_PROVIDER_URL pointing at a DIFFERENT (e.g. box-wide) provider
  // must NEVER win over this install's own schedule pin in the constructed `oa start` launch command.
  test('WITH a TG.1 schedule pin, and a DIFFERENT ambient TERMFLEET_PROVIDER_URL set -> startCommand.env forces the SCHEDULE pin, never ambient', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-te6-')));
    mkdirSync(join(dir, 'scheduler'), { recursive: true });
    writeFileSync(join(dir, 'scheduler', 'schedule.json'), JSON.stringify({ intervalSeconds: 900, env: { TERMFLEET_PROVIDER_URL: 'http://127.0.0.1:55812' }, scripts: ['bun scripts/sweep.ts'] }));
    const savedAmbient = process.env.TERMFLEET_PROVIDER_URL;
    process.env.TERMFLEET_PROVIDER_URL = 'http://127.0.0.1:7373'; // the box-wide ambient hazard (OA-09 default port)
    try {
      let resumeCalls = 0;
      const r = buildLocalGoLive(dir, { resumeFn: (opts) => { resumeCalls++; return { wasPaused: true, path: join((opts?.cwd ?? dir), '.open-autonomy', 'paused') }; } });
      expect(r.status).toBe('ok');
      const ok_ = r as Extract<typeof r, { status: 'ok' }>;
      expect(ok_.pin).toBe('http://127.0.0.1:55812');
      expect(ok_.startCommand.cmd).toBe('tmux');
      // The forced pin, NOT the ambient 7373 value — the exact assertion shape of TE.5's own regression test.
      expect(ok_.startCommand.env).toEqual({ TERMFLEET_PROVIDER_URL: 'http://127.0.0.1:55812' });
      expect(ok_.startCommand.args).toContain('oa');
      expect(ok_.startCommand.args).toContain('start');
      expect(ok_.startCommand.args.join(' ')).toContain('-e TERMFLEET_PROVIDER_URL=http://127.0.0.1:55812');
      expect(resumeCalls).toBe(1);
      expect(ok_.message).toMatch(/FORCED/);
      expect(ok_.message).toMatch(/never ambient/);
    } finally {
      if (savedAmbient === undefined) delete process.env.TERMFLEET_PROVIDER_URL;
      else process.env.TERMFLEET_PROVIDER_URL = savedAmbient;
      cleanupAll();
    }
  });

  test('nohup launcher -> still forces the pin via the command\'s own env, never ambient', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-te6-')));
    mkdirSync(join(dir, 'scheduler'), { recursive: true });
    writeFileSync(join(dir, 'scheduler', 'schedule.json'), JSON.stringify({ intervalSeconds: 900, env: { TERMFLEET_PROVIDER_URL: 'http://127.0.0.1:44100' } }));
    const r = buildLocalGoLive(dir, { launcher: 'nohup', resumeFn: () => ({ wasPaused: false, path: join(dir, '.open-autonomy', 'paused') }) });
    expect(r.status).toBe('ok');
    const ok_ = r as Extract<typeof r, { status: 'ok' }>;
    expect(ok_.startCommand.cmd).toBe('nohup');
    expect(ok_.startCommand.env).toEqual({ TERMFLEET_PROVIDER_URL: 'http://127.0.0.1:44100' });
    expect(ok_.startCommand.args.join(' ')).toContain('oa start');
    cleanupAll();
  });

  test('resume() is the REAL pause.ts function by default — actually removes .open-autonomy/paused (safe: a single unlink, no process spawn)', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-te6-')));
    mkdirSync(join(dir, 'scheduler'), { recursive: true });
    writeFileSync(join(dir, 'scheduler', 'schedule.json'), JSON.stringify({ intervalSeconds: 900, env: { TERMFLEET_PROVIDER_URL: 'http://127.0.0.1:33221' } }));
    pause({ cwd: dir }); // seed paused, mirroring a4PausedSeeded's fresh-install default
    expect(localPauseState(dir).paused).toBe(true);
    const r = buildLocalGoLive(dir);
    expect(r.status).toBe('ok');
    expect((r as Extract<typeof r, { status: 'ok' }>).resume.wasPaused).toBe(true);
    expect(localPauseState(dir).paused).toBe(false); // really removed — not simulated
    // and the START command was still only ever CONSTRUCTED, never executed — no session/process exists.
    cleanupAll();
  });

  // =========================================================================================================
  // --dry-run: even resume() — normally safe/real by design (a single unlink) — is suppressed, because a
  // dry-run's contract is "the target repo is left byte-for-byte untouched" (a real unlink would show up as
  // a git-tracked change). `resumeFn` below THROWS if ever called — a passing test IS the proof.
  // =========================================================================================================
  test('--dry-run: resume() is NEVER called (not even the real, otherwise-safe one) — reports the plan via a read-only isPaused() check', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-te6-')));
    mkdirSync(join(dir, 'scheduler'), { recursive: true });
    writeFileSync(join(dir, 'scheduler', 'schedule.json'), JSON.stringify({ intervalSeconds: 900, env: { TERMFLEET_PROVIDER_URL: 'http://127.0.0.1:33333' } }));
    pause({ cwd: dir }); // seed paused
    expect(localPauseState(dir).paused).toBe(true);
    const poisonResume = () => {
      throw new Error('buildLocalGoLive dry-run must NEVER call the real resume()');
    };
    const r = buildLocalGoLive(dir, { dryRun: true, resumeFn: poisonResume as never });
    expect(r.status).toBe('ok');
    const ok_ = r as Extract<typeof r, { status: 'ok' }>;
    expect(ok_.resume.wasPaused).toBe(true); // accurately reflects current state, via a pure read
    expect(ok_.message).toMatch(/\[DRY-RUN\]/);
    expect(ok_.message).toMatch(/would lift the fence/);
    // the file was NEVER actually removed — the whole point.
    expect(localPauseState(dir).paused).toBe(true);
    cleanupAll();
  });

  test('--dry-run: resume() also default-safe (no resumeFn at all) never touches the real pause.ts unlink', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-te6-')));
    mkdirSync(join(dir, 'scheduler'), { recursive: true });
    writeFileSync(join(dir, 'scheduler', 'schedule.json'), JSON.stringify({ intervalSeconds: 900, env: { TERMFLEET_PROVIDER_URL: 'http://127.0.0.1:33334' } }));
    // NOT paused this time — would be a no-op even for real, but dry-run must still never call resumeReal.
    const r = buildLocalGoLive(dir, { dryRun: true });
    expect(r.status).toBe('ok');
    const ok_ = r as Extract<typeof r, { status: 'ok' }>;
    expect(ok_.resume.wasPaused).toBe(false);
    expect(ok_.message).toMatch(/would be a no-op/);
    cleanupAll();
  });
});

// =========================================================================================================
// HOSTED go-live — reads the REAL PUBLIC_AGENT_REPO_PAUSED variable, never the agent-paused label. ⛔
// SAFETY: `command` returned below (when present) is asserted on, never executed against a real repo.
// =========================================================================================================

describe('buildHostedGoLive — the corrected mechanism (PUBLIC_AGENT_REPO_PAUSED variable, NOT agent-paused label)', () => {
  test('repo is actually paused (variable=true) -> constructs the clear command, never executes it', () => {
    const stub = new StubProc().onArgs('gh', ['variable', 'get', 'PUBLIC_AGENT_REPO_PAUSED', '--repo', 'acme/widgets'], () => ok('true\n'));
    const r = buildHostedGoLive('acme/widgets', { proc: stub.runner });
    expect(r.paused).toBe(true);
    expect(r.action).toBe('clear-pause');
    expect(r.command).toEqual({ cmd: 'gh', args: ['variable', 'set', 'PUBLIC_AGENT_REPO_PAUSED', '--repo', 'acme/widgets', '--body', 'false'] });
    expect(stub.calls).toHaveLength(1); // only the READ happened — the clear was constructed, not run
    expect(r.mechanism).toBe('PUBLIC_AGENT_REPO_PAUSED repository variable');
    expect(r.notAgentPausedLabel).toMatch(/PER-ISSUE only/);
  });

  test('variable explicitly false -> already live, no action fabricated', () => {
    const stub = new StubProc().onArgs('gh', ['variable', 'get', 'PUBLIC_AGENT_REPO_PAUSED', '--repo', 'acme/widgets'], () => ok('false\n'));
    const r = buildHostedGoLive('acme/widgets', { proc: stub.runner });
    expect(r.paused).toBe(false);
    expect(r.action).toBe('none-needed');
    expect(r.command).toBeUndefined();
  });

  test('variable unset (gh reports not found — the documented default) -> already live, no action fabricated', () => {
    const stub = new StubProc().onArgs('gh', ['variable', 'get', 'PUBLIC_AGENT_REPO_PAUSED', '--repo', 'acme/widgets'], () => fail("variable PUBLIC_AGENT_REPO_PAUSED not found", 1));
    const r = buildHostedGoLive('acme/widgets', { proc: stub.runner });
    expect(r.currentValue).toBeUndefined();
    expect(r.paused).toBe(false);
    expect(r.action).toBe('none-needed');
    expect(r.message).toMatch(/unset means "running"/);
  });

  test('gh call fails for an unrelated reason -> verdict withheld (never assumes unpaused)', () => {
    const stub = new StubProc().onArgs('gh', ['variable', 'get', 'PUBLIC_AGENT_REPO_PAUSED', '--repo', 'acme/widgets'], () => fail('gh: not logged in', 1));
    const r = buildHostedGoLive('acme/widgets', { proc: stub.runner });
    expect(r.action).toBe('unknown');
    expect(r.message).toMatch(/verdict withheld/);
  });
});

// =========================================================================================================
// runG4a — the orchestrator (verify -> substrate-specific go-live construction).
// =========================================================================================================

describe('runG4a', () => {
  test('local substrate, board NOT promoted -> verification only, no go-live constructed', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-te6-')));
    const stub = new StubProc().onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'ready'], () => ok('[]'));
    const r = runG4a({ substrate: 'local', repoDir: dir, variant: 'ztrack', allowlistLabel: 'oa-approved', proc: stub.runner });
    expect(r.verification.ready).toBe(false);
    expect(r.goLive).toBeUndefined();
    cleanupAll();
  });

  test('local substrate, board promoted, no pin -> go-live BLOCKED (never falls through to ambient)', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-te6-')));
    const stub = new StubProc()
      .onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'ready'], () => ok(JSON.stringify([{ identifier: 'A-1', labels: ['oa-approved'] }])))
      .onArgs('git', ['rev-parse', '--verify', '--quiet', 'agent/issue-A-1'], () => fail('unknown revision', 1));
    const r = runG4a({ substrate: 'local', repoDir: dir, variant: 'ztrack', allowlistLabel: 'oa-approved', proc: stub.runner });
    expect(r.verification.ready).toBe(true);
    expect((r.goLive as { status?: string } | undefined)?.status).toBe('blocked');
    cleanupAll();
  });

  test('gh-actions substrate, board promoted, no --owner-repo -> go-live BLOCKED with a clear usage message', () => {
    const stub = new StubProc()
      .onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'ready'], () => ok(JSON.stringify([{ identifier: 'B-1', labels: [] }])))
      .onArgs('git', ['rev-parse', '--verify', '--quiet', 'agent/issue-B-1'], () => fail('unknown revision', 1));
    const r = runG4a({ substrate: 'gh-actions', repoDir: '/fake', variant: 'ztrack', proc: stub.runner });
    expect(r.verification.ready).toBe(true);
    expect((r.goLive as { status?: string } | undefined)?.status).toBe('blocked');
    expect((r.goLive as { message: string }).message).toMatch(/--owner-repo/);
  });

  test('gh-actions substrate, board promoted, --owner-repo given -> hosted go-live constructed', () => {
    const stub = new StubProc()
      .onArgs('gh', ['issue', 'list'], () => ok('[]'))
      .onArgs('gh', ['variable', 'get', 'PUBLIC_AGENT_REPO_PAUSED', '--repo', 'acme/widgets'], () => ok('true\n'));
    const stub2 = stub.onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'ready'], () => ok(JSON.stringify([{ identifier: 'C-1', labels: [] }])))
      .onArgs('git', ['rev-parse', '--verify', '--quiet', 'agent/issue-C-1'], () => fail('unknown revision', 1));
    const r = runG4a({ substrate: 'gh-actions', repoDir: '/fake', variant: 'ztrack', ownerRepo: 'acme/widgets', proc: stub2.runner });
    expect(r.verification.ready).toBe(true);
    expect(r.goLive && 'mechanism' in r.goLive).toBe(true);
    if (r.goLive && 'mechanism' in r.goLive) {
      expect(r.goLive.action).toBe('clear-pause');
    }
  });

  test('--dry-run: top-level dryRun forwards into buildLocalGoLive without an explicit `local` option', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-te6-')));
    mkdirSync(join(dir, 'scheduler'), { recursive: true });
    writeFileSync(join(dir, 'scheduler', 'schedule.json'), JSON.stringify({ intervalSeconds: 900, env: { TERMFLEET_PROVIDER_URL: 'http://127.0.0.1:33335' } }));
    const stub = new StubProc()
      .onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'ready'], () => ok(JSON.stringify([{ identifier: 'D-1', labels: ['oa-approved'] }])))
      .onArgs('git', ['rev-parse', '--verify', '--quiet', 'agent/issue-D-1'], () => fail('unknown revision', 1));
    const r = runG4a({ substrate: 'local', repoDir: dir, variant: 'ztrack', allowlistLabel: 'oa-approved', proc: stub.runner, dryRun: true });
    expect(r.verification.ready).toBe(true);
    const gl = r.goLive as { status?: string; message?: string } | undefined;
    expect(gl?.status).toBe('ok');
    expect(gl?.message).toMatch(/\[DRY-RUN\]/);
    cleanupAll();
  });
});

// =========================================================================================================
// Acceptance (d) — after G4a's local dry-run "go-live" mock, `oa maturity` (TB.2, real, reused) reports
// HONESTLY: fence lifted (A5 present) but no real session/fire evidence -> M4/ARMED, never a fabricated
// M5/RUNNING. This chains THIS unit's own buildLocalGoLive with TB.2's real computeMaturity end to end —
// nothing here was launched for real, so the honest reading is exactly what this test proves.
// =========================================================================================================

describe('acceptance (d) — post-mock-go-live oa maturity is honest: M4, never a fabricated M5', () => {
  function localGitProfile(profileDir: string): void {
    mkdirSync(profileDir, { recursive: true });
    writeFileSync(join(profileDir, 'ir.yml'), 'targets: [local]\ncodeHost: local-git\n');
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

  test('G4a verify (ready) -> buildLocalGoLive (resume, construct-only start) -> oa maturity honestly reports M4/ARMED', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-te6-maturity-')));
    const profileDir = track(mkdtempSync(join(tmpdir(), 'oa-te6-profile-')));
    try {
      localGitProfile(profileDir);
      mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
      writeFileSync(join(dir, '.open-autonomy', 'generated.json'), JSON.stringify({ schema: 'open-autonomy.generated.v1', files: ['.open-autonomy/autonomy.yml', '.open-autonomy/generated.json', 'scheduler/schedule.json'] }));
      writeFileSync(join(dir, '.open-autonomy', 'autonomy.yml'), JSON.stringify({ schema: 'open-autonomy.autonomy.v1', codeHost: 'local-git', agents: { pm: { skill: 'pm', triggers: { schedule: '*/15 * * * *' } } } }));
      mkdirSync(join(dir, 'scheduler'), { recursive: true });
      writeFileSync(join(dir, 'scheduler', 'schedule.json'), JSON.stringify({ intervalSeconds: 900, env: { TERMFLEET_PROVIDER_URL: 'http://127.0.0.1:58211' }, scripts: ['bun scripts/sweep.ts'] }));
      execFileSync('git', ['init', '-q'], { cwd: dir });
      execFileSync('git', ['config', 'user.email', 'test@test.dev'], { cwd: dir });
      execFileSync('git', ['config', 'user.name', 'test'], { cwd: dir });
      pause({ cwd: dir }); // fresh installs start paused (a4PausedSeeded default) — mirrored explicitly here

      const stub = new StubProc()
        .onArgs('npx', ['ztrack', 'issue', 'list'], () => ok('[]')) // default: overridden below for --state ready
        .onArgs('gh', [], () => fail('gh: not logged in', 1))
        .onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'ready'], () => ok(JSON.stringify([{ identifier: 'A-1', labels: ['oa-approved'] }])))
        .onArgs('git', ['rev-parse', '--verify', '--quiet', 'agent/issue-A-1'], () => fail('unknown revision', 1));
      const proc = withRealGit(stub);

      execFileSync('git', ['add', '-A'], { cwd: dir });
      execFileSync('git', ['commit', '-q', '-m', 'install harness'], { cwd: dir });

      // Step 1 — G4a verification: the human's promotion (oa-approved label) IS present in this fixture.
      const verification = verifyG4aReady({ cwd: dir, profileDir, proc });
      expect(verification.ready).toBe(true);

      // Step 2 — the mocked local go-live: resume() for real (safe), construct (never execute) `oa start`.
      const goLive = buildLocalGoLive(dir);
      expect(goLive.status).toBe('ok');
      expect(localPauseState(dir).paused).toBe(false); // fence genuinely lifted

      // Step 3 — oa maturity (TB.2, real): fence lifted but NOTHING was actually launched -> honest M4.
      const noSessionProbe: SessionProbe = async () => []; // install-scoped probe reachable, zero sessions
      const record = await computeMaturity({
        cwd: dir,
        profileDir,
        proc,
        preflightBin: '/nonexistent-oa-test-fixture/preflight.ts',
        ghPreflightScript: '/nonexistent-oa-test-fixture/open-autonomy-preflight.ts',
        sessionProbe: noSessionProbe,
      });
      expect(record.stage).toBe('M4');
      expect(record.stageName).toBe('ARMED');
      expect(record.blockers[0]).toMatch(/^M5 blocked:/);
      const a5 = record.signals.find((s) => s.id === 'A5')!;
      expect(a5.present).toBe(true); // the fence IS lifted — G4a's own act really happened
    } finally {
      cleanupAll();
    }
  });
});

// =========================================================================================================
// G4b runbook sanity — acceptance (e): references only already-built, real primitives with correct syntax.
// =========================================================================================================

describe('G4B_RUNBOOK — content sanity', () => {
  test('names only already-built, real CLI primitives with correct invocation syntax', () => {
    expect(G4B_RUNBOOK).toContain('oa status');
    expect(G4B_RUNBOOK).toContain('oa maturity');
    expect(G4B_RUNBOOK).toContain('oa doctor');
    expect(G4B_RUNBOOK).toContain('oa provider status');
    expect(G4B_RUNBOOK).toContain('gh pr checks <pr-number>');
    expect(G4B_RUNBOOK).toContain('gh pr merge <pr-number> --squash');
    expect(G4B_RUNBOOK).toContain('gh repo edit <owner>/<repo> --enable-auto-merge');
    expect(G4B_RUNBOOK).toContain('gh pr view <pr-number> --json state,mergedAt');
  });

  test('never invents a repo-wide "auto-merge" step before merge confirmation (ordering matters — the whole point of babysitting)', () => {
    const armIdx = G4B_RUNBOOK.indexOf('gh repo edit');
    const mergeIdx = G4B_RUNBOOK.indexOf('gh pr merge');
    const confirmIdx = G4B_RUNBOOK.indexOf('mergedAt');
    expect(mergeIdx).toBeGreaterThan(-1);
    expect(confirmIdx).toBeGreaterThan(mergeIdx);
    expect(armIdx).toBeGreaterThan(confirmIdx);
  });

  test('mirrored verbatim into docs/OSS_AGENT_RUNBOOK.md', () => {
    const doc = require('node:fs').readFileSync(join(import.meta.dir, '..', 'docs', 'OSS_AGENT_RUNBOOK.md'), 'utf8');
    expect(doc).toContain(G4B_RUNBOOK.trim());
  });
});

// A `DispatchCommand` type-shape smoke check (kept as a real assertion, not just a compile-time check).
describe('DispatchCommand shape', () => {
  test('local start command is a plain argv + env object, never a shell string with an embedded secret-shaped pin', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-te6-')));
    mkdirSync(join(dir, 'scheduler'), { recursive: true });
    writeFileSync(join(dir, 'scheduler', 'schedule.json'), JSON.stringify({ intervalSeconds: 900, env: { TERMFLEET_PROVIDER_URL: 'http://127.0.0.1:41000' } }));
    const r = buildLocalGoLive(dir, { resumeFn: () => ({ wasPaused: false, path: dir }) });
    expect(r.status).toBe('ok');
    const cmd: DispatchCommand = (r as Extract<typeof r, { status: 'ok' }>).startCommand;
    expect(Array.isArray(cmd.args)).toBe(true);
    expect(typeof cmd.env).toBe('object');
    cleanupAll();
  });
});
