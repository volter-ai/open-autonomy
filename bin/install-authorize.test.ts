// TE.4 — unit tests for bin/install-authorize.ts (Phase 3 AUTHORIZE, G3 batched + probe-PR check-name
// discovery). Covers the task's own acceptance list:
//   (a) question-batching leg against 2 fixture selection records — a local-only profile (skip GH questions
//       entirely) and a GitHub profile (full batch incl. admin/identity) — confirming ONE question set (not
//       serial prompts) and that harness-file-count is read from the real compiled manifest, never hardcoded.
//   (b) self-driving record -> the proxy question appears; non-self-driving -> it doesn't.
//   (c) probe-PR discovery: a MOCKED-gh-CLI integration test exercising the real open -> read-checks ->
//       close sequence end-to-end (only the gh/git subprocess calls are stubbed; the orchestration in
//       runProbePr is real) — the live leg against a real GitHub repo is deferred (see the PR body: no safe
//       disposable repo was available/confirmed in this session, so per the task's own "if in doubt, default
//       to the mocked-CLI integration test path" this is the proof path taken).
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compiledPaths, getSetupPack, parseIr, type SetupPack } from '@open-autonomy/core';
import {
  buildAuthorizeBatch,
  computeHarnessManifest,
  loadSelectionRecord,
  parseArgs,
  renderBatchHuman,
  renderRecordHuman,
  run,
  runProbePr,
  type ProcFn,
  type SelectionRecordRef,
} from './install-authorize.ts';

const REPO_ROOT = join(import.meta.dir, '..');
const PROFILES_ROOT = join(REPO_ROOT, 'profiles');

const tmps: string[] = [];
function track(dir: string): string {
  tmps.push(dir);
  return dir;
}
function cleanupAll() {
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true });
}

function selectionRecord(profile: string, repoDir: string, ghAdmin?: boolean): SelectionRecordRef {
  const pack: SetupPack = getSetupPack(join(PROFILES_ROOT, profile));
  return {
    profile,
    substrate: pack.codeHost === 'github' ? 'gh-actions' : 'local',
    pack,
    g1: { asked: false, answer: 'test-fixture' },
    detect: { source: 'live', repoDir, repoFacts: { onGitHub: pack.codeHost === 'github', populated: true, ghAdmin } },
  };
}
function writeRecord(dir: string, profile: string, repoDir: string, ghAdmin?: boolean): string {
  const f = join(dir, 'record.json');
  writeFileSync(f, JSON.stringify(selectionRecord(profile, repoDir, ghAdmin), null, 2));
  return f;
}

// A `gh`/`git` stub that fails loudly if called unexpectedly — the batching tests never touch a subprocess
// at all (buildAuthorizeBatch/computeHarnessManifest are pure compiles + reads), so any call here is a bug.
const unexpectedProc: ProcFn = (cmd, args) => ({ status: 1, stdout: '', stderr: `unexpected subprocess call in test: ${cmd} ${args.join(' ')}` });

// =========================================================================================================
// loadSelectionRecord — malformed input -> loud errors (mirrors TE.2/TE.3's own convention).
// =========================================================================================================

describe('loadSelectionRecord — malformed record file -> loud error', () => {
  test('missing file -> throws', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-auth-rec-')));
    expect(() => loadSelectionRecord(join(dir, 'nope.json'))).toThrow(/could not read file/);
    cleanupAll();
  });

  test('invalid JSON -> throws', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-auth-rec-')));
    const f = join(dir, 'bad.json');
    writeFileSync(f, '{ not valid json ][');
    expect(() => loadSelectionRecord(f)).toThrow(/not valid JSON/);
    cleanupAll();
  });

  test('a JSON array -> throws (not silently treated as an object)', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-auth-rec-')));
    const f = join(dir, 'array.json');
    writeFileSync(f, JSON.stringify([1, 2, 3]));
    expect(() => loadSelectionRecord(f)).toThrow(/malformed selection record/);
    cleanupAll();
  });

  test('missing pack.codeHost -> throws', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-auth-rec-')));
    const f = join(dir, 'wrong.json');
    writeFileSync(f, JSON.stringify({ profile: 'x', substrate: 'local', pack: {}, detect: { repoDir: '/tmp' } }));
    expect(() => loadSelectionRecord(f)).toThrow(/missing\/invalid "pack\.codeHost"/);
    cleanupAll();
  });

  test('invalid substrate -> throws', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-auth-rec-')));
    const f = join(dir, 'bad-substrate.json');
    writeFileSync(f, JSON.stringify({ profile: 'x', substrate: 'quantum', pack: { codeHost: 'local-git' }, detect: { repoDir: '/tmp' } }));
    expect(() => loadSelectionRecord(f)).toThrow(/"substrate" must be 'local' or 'gh-actions'/);
    cleanupAll();
  });
});

// =========================================================================================================
// computeHarnessManifest — the REAL compiled file count, never hardcoded.
// =========================================================================================================

describe('computeHarnessManifest', () => {
  test('simple-sdlc @ local — count matches compiledPaths(compileLocal(ir)) computed independently', async () => {
    const profileDir = join(PROFILES_ROOT, 'simple-sdlc');
    const manifest = await computeHarnessManifest(profileDir, 'local');
    expect(manifest.fileCount).toBeGreaterThan(0);
    expect(manifest.fileCount).toBe(manifest.files.length);

    // independent re-derivation, proving this isn't a hardcoded number:
    const ir = parseIr(readFileSync(join(profileDir, 'ir.yml'), 'utf8'));
    const { compileLocal } = await import('@open-autonomy/substrate-local');
    const out = compileLocal(ir, {});
    const independent = compiledPaths(out);
    expect(manifest.files).toEqual(independent);
    expect(manifest.fileCount).toBe(independent.length);
  });

  test('self-driving @ gh-actions — a DIFFERENT real count than simple-sdlc@local (different profile/substrate)', async () => {
    const profileDir = join(PROFILES_ROOT, 'self-driving');
    const manifest = await computeHarnessManifest(profileDir, 'gh-actions');
    expect(manifest.fileCount).toBeGreaterThan(0);
    const sdlc = await computeHarnessManifest(join(PROFILES_ROOT, 'simple-sdlc'), 'local');
    expect(manifest.fileCount).not.toBe(sdlc.fileCount);
  });
});

// =========================================================================================================
// buildAuthorizeBatch — THE ONE BATCH. Fixture (a): local-only skips GH questions; GitHub gets the full
// batch incl. admin/identity. Fixture (b): self-driving gets the proxy question; non-self-driving doesn't.
// =========================================================================================================

describe('buildAuthorizeBatch — fixture 1: local-only profile skips GH questions entirely', () => {
  test('simple-sdlc (codeHost=local-git) — exactly spend + harness-commit, no gh-admin-identity, no model-proxy', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-auth-local-')));
    const sel = selectionRecord('simple-sdlc', dir);
    expect(sel.pack.codeHost).toBe('local-git');

    const batch = await buildAuthorizeBatch(sel, join(PROFILES_ROOT, 'simple-sdlc'));
    expect(batch.ghProfile).toBe(false);
    expect(batch.selfDriving).toBe(false);
    const ids = batch.questions.map((q) => q.id);
    expect(ids).toEqual(['spend', 'harness-commit']); // ONE combined set, exactly these two, in order
    expect(ids).not.toContain('gh-admin-identity');
    expect(ids).not.toContain('model-proxy');
    expect(batch.harness.fileCount).toBeGreaterThan(0);
    // the spend question plainly cites the uncapped-spend fact:
    const spendQ = batch.questions.find((q) => q.id === 'spend')!;
    expect(spendQ.text).toMatch(/UNCAPPED/);
    expect(spendQ.fact).toMatch(/no OA spend cap/);
    cleanupAll();
  });
});

describe('buildAuthorizeBatch — fixture 2: GitHub profile gets the full batch incl. admin/identity', () => {
  test('simple-gh-sdlc (codeHost=github, non-self-driving) — spend + harness-commit + gh-admin-identity, no model-proxy', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-auth-gh-')));
    const sel = selectionRecord('simple-gh-sdlc', dir, true);
    expect(sel.pack.codeHost).toBe('github');

    const batch = await buildAuthorizeBatch(sel, join(PROFILES_ROOT, 'simple-gh-sdlc'));
    expect(batch.ghProfile).toBe(true);
    expect(batch.selfDriving).toBe(false); // simple-gh-sdlc's extra_rungs is [] — no proxy-ready
    const ids = batch.questions.map((q) => q.id);
    expect(ids).toEqual(['spend', 'harness-commit', 'gh-admin-identity']);
    expect(ids).not.toContain('model-proxy');

    // ghAdmin is REUSED from the record's own detect.repoFacts.ghAdmin — never re-derived (no subprocess
    // call happened anywhere in buildAuthorizeBatch/computeHarnessManifest — this whole test never touches
    // a ProcFn at all).
    const ghQ = batch.questions.find((q) => q.id === 'gh-admin-identity')!;
    expect(ghQ.text).toMatch(/confirmed admin/);
  });

  test('ghAdmin=false is surfaced plainly (never silently coerced) and the default flags the block', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-auth-gh-noadmin-')));
    const sel = selectionRecord('simple-gh-sdlc', dir, false);
    const batch = await buildAuthorizeBatch(sel, join(PROFILES_ROOT, 'simple-gh-sdlc'));
    const ghQ = batch.questions.find((q) => q.id === 'gh-admin-identity')!;
    expect(ghQ.text).toMatch(/confirmed NON-admin/);
    expect(ghQ.default).toMatch(/BLOCKED/);
    cleanupAll();
  });

  test('ghAdmin=undefined (unknown) is surfaced as unknown, never coerced to a definite value', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-auth-gh-unknown-')));
    const sel = selectionRecord('simple-gh-sdlc', dir, undefined);
    const batch = await buildAuthorizeBatch(sel, join(PROFILES_ROOT, 'simple-gh-sdlc'));
    const ghQ = batch.questions.find((q) => q.id === 'gh-admin-identity')!;
    expect(ghQ.text).toMatch(/unknown\/unverified/);
    cleanupAll();
  });
});

describe('buildAuthorizeBatch — fixture 3: self-driving gets the proxy question; non-self-driving does not', () => {
  test('self-driving (extra_rungs includes proxy-ready) — the full 4-question batch, incl. model-proxy', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-auth-sd-')));
    const sel = selectionRecord('self-driving', dir, true);
    expect(sel.pack.extra_rungs).toContain('proxy-ready');

    const batch = await buildAuthorizeBatch(sel, join(PROFILES_ROOT, 'self-driving'));
    expect(batch.selfDriving).toBe(true);
    const ids = batch.questions.map((q) => q.id);
    expect(ids).toEqual(['spend', 'harness-commit', 'gh-admin-identity', 'model-proxy']);
    cleanupAll();
  });

  test('simple-gh-sdlc (no proxy-ready rung) — model-proxy is absent', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-auth-nonsd-')));
    const sel = selectionRecord('simple-gh-sdlc', dir, true);
    expect(sel.pack.extra_rungs).not.toContain('proxy-ready');
    const batch = await buildAuthorizeBatch(sel, join(PROFILES_ROOT, 'simple-gh-sdlc'));
    expect(batch.questions.map((q) => q.id)).not.toContain('model-proxy');
    cleanupAll();
  });
});

describe('renderBatchHuman / renderRecordHuman — smoke (non-empty, cites the batch)', () => {
  test('renders a batch with the right count line', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-auth-render-')));
    const sel = selectionRecord('simple-sdlc', dir);
    const batch = await buildAuthorizeBatch(sel, join(PROFILES_ROOT, 'simple-sdlc'));
    const rendered = renderBatchHuman(batch);
    expect(rendered).toMatch(/AUTHORIZE \(G3, BATCHED\)/);
    expect(rendered).toMatch(new RegExp(`${batch.harness.fileCount} file`));
    cleanupAll();
  });
});

// =========================================================================================================
// run() — the CLI's two-invocation discipline.
// =========================================================================================================

describe('run() — invocation 1 emits the batch, no record', () => {
  test('local-only profile: asked=true, exactly 2 questions, no record', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-auth-cli1-')));
    const record = writeRecord(dir, 'simple-sdlc', dir);
    const result = await run(['--record', record, '--profiles-root', PROFILES_ROOT, '--json'], PROFILES_ROOT, unexpectedProc);
    expect(result.ok).toBe(true);
    expect(result.asked).toBe(true);
    expect(result.record).toBeUndefined();
    const parsed = JSON.parse(result.output);
    expect(parsed.mode).toBe('batch');
    expect(parsed.batch.questions.map((q: { id: string }) => q.id)).toEqual(['spend', 'harness-commit']);
    cleanupAll();
  });
});

describe('run() — invocation 2 applies consents and emits the AUTHORIZE RECORD', () => {
  test('local-only profile: full consent -> record with checkNameDiscovery=not-applicable', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-auth-cli2-local-')));
    const record = writeRecord(dir, 'simple-sdlc', dir);
    const result = await run(
      ['--record', record, '--profiles-root', PROFILES_ROOT, '--json', '--spend-cadence', '*/15', '--spend-wip', '1', '--consent-harness-commit'],
      PROFILES_ROOT,
      unexpectedProc,
    );
    expect(result.ok).toBe(true);
    expect(result.record).toBeDefined();
    const r = result.record!;
    expect(r.spend).toEqual({ cadence: '*/15', wip: 1 });
    expect(r.harness.consented).toBe(true);
    expect(r.gh).toBeUndefined();
    expect(r.proxy).toBeUndefined();
    expect(r.checkNameDiscovery.status).toBe('not-applicable');
    expect(renderRecordHuman(r)).toMatch(/AUTHORIZE RECORD/);
    cleanupAll();
  });

  test('missing --consent-harness-commit -> loud error, never a silently-emitted record', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-auth-cli2-noharness-')));
    const record = writeRecord(dir, 'simple-sdlc', dir);
    const result = await run(['--record', record, '--profiles-root', PROFILES_ROOT, '--spend-cadence', '*/15', '--spend-wip', '1'], PROFILES_ROOT, unexpectedProc);
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/harness-commit consent is required/);
    cleanupAll();
  });

  test('GitHub profile missing gh-admin/identity consent -> loud error', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-auth-cli2-noadmin-')));
    const record = writeRecord(dir, 'simple-gh-sdlc', dir, true);
    const result = await run(
      ['--record', record, '--profiles-root', PROFILES_ROOT, '--spend-cadence', '*/15', '--spend-wip', '1', '--consent-harness-commit'],
      PROFILES_ROOT,
      unexpectedProc,
    );
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/--consent-gh-admin AND --identity/);
    cleanupAll();
  });

  test('GitHub profile, full consent, NO --live-probe -> checkNameDiscovery=deferred, never fabricated', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-auth-cli2-deferred-')));
    const record = writeRecord(dir, 'simple-gh-sdlc', dir, true);
    const result = await run(
      [
        '--record', record, '--profiles-root', PROFILES_ROOT, '--json',
        '--spend-cadence', '*/15', '--spend-wip', '1', '--consent-harness-commit',
        '--consent-gh-admin', '--identity', 'bot-reviewer',
      ],
      PROFILES_ROOT,
      unexpectedProc, // proves no subprocess call ever happens on this path
    );
    expect(result.ok).toBe(true);
    const r = result.record!;
    expect(r.gh).toEqual({ adminConsent: true, identity: 'bot-reviewer', ghAdmin: true });
    expect(r.checkNameDiscovery.status).toBe('deferred');
    expect((r.checkNameDiscovery as { reason: string }).reason).toMatch(/NEVER guesses/);
    cleanupAll();
  });

  test('self-driving profile missing --consent-proxy -> loud error', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-auth-cli2-noproxy-')));
    const record = writeRecord(dir, 'self-driving', dir, true);
    const result = await run(
      [
        '--record', record, '--profiles-root', PROFILES_ROOT,
        '--spend-cadence', '*/15', '--spend-wip', '1', '--consent-harness-commit',
        '--consent-gh-admin', '--identity', 'own-token',
      ],
      PROFILES_ROOT,
      unexpectedProc,
    );
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/--consent-proxy/);
    cleanupAll();
  });

  test('self-driving profile, full consent incl. proxy -> recorded', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-auth-cli2-proxy-')));
    const record = writeRecord(dir, 'self-driving', dir, true);
    const result = await run(
      [
        '--record', record, '--profiles-root', PROFILES_ROOT,
        '--spend-cadence', '*/15', '--spend-wip', '1', '--consent-harness-commit',
        '--consent-gh-admin', '--identity', 'own-token', '--consent-proxy', 'deploy-own',
      ],
      PROFILES_ROOT,
      unexpectedProc,
    );
    expect(result.ok).toBe(true);
    expect(result.record!.proxy).toEqual({ decision: 'deploy-own' });
    cleanupAll();
  });
});

// =========================================================================================================
// runProbePr — MOCKED-gh-CLI integration test: the real open -> read-checks -> close sequence, end-to-end.
// Only the `gh`/`git` subprocess calls are stubbed; the orchestration (poll loop, ordering, never-merge) is
// the real function under test.
// =========================================================================================================

function mockProbeProc(opts: { checkRunsSequence: string[][]; ownerRepo: string; defaultBranch?: string; prNumber?: number }): { proc: ProcFn; calls: Array<{ cmd: string; args: string[] }> } {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  let checkRunsCallIndex = 0;
  const defaultBranch = opts.defaultBranch ?? 'main';
  const prNumber = opts.prNumber ?? 42;
  const proc: ProcFn = (cmd, args) => {
    calls.push({ cmd, args });
    const joined = args.join(' ');
    if (cmd === 'git' && args.includes('rev-parse') && args.includes('--abbrev-ref')) {
      return { status: 0, stdout: 'work-branch\n', stderr: '' };
    }
    if (cmd === 'gh' && args[0] === 'api' && args[1] === `repos/${opts.ownerRepo}` ) {
      return { status: 0, stdout: JSON.stringify({ default_branch: defaultBranch }), stderr: '' };
    }
    if (cmd === 'git' && args.includes('checkout') && args.includes('-b')) {
      return { status: 0, stdout: '', stderr: '' };
    }
    if (cmd === 'git' && args.includes('commit')) {
      return { status: 0, stdout: '', stderr: '' };
    }
    if (cmd === 'git' && args.includes('rev-parse') && args.includes('HEAD')) {
      return { status: 0, stdout: 'deadbeef1234567890\n', stderr: '' };
    }
    if (cmd === 'git' && args.includes('push')) {
      return { status: 0, stdout: '', stderr: '' };
    }
    if (cmd === 'gh' && args[0] === 'pr' && args[1] === 'create') {
      return { status: 0, stdout: JSON.stringify({ number: prNumber }), stderr: '' };
    }
    if (cmd === 'gh' && args[0] === 'api' && joined.includes('check-runs')) {
      const seq = opts.checkRunsSequence[Math.min(checkRunsCallIndex, opts.checkRunsSequence.length - 1)];
      checkRunsCallIndex++;
      return { status: 0, stdout: JSON.stringify(seq), stderr: '' };
    }
    if (cmd === 'gh' && args[0] === 'pr' && args[1] === 'close') {
      return { status: 0, stdout: '', stderr: '' };
    }
    if (cmd === 'git' && args.includes('branch') && args.includes('-D')) {
      return { status: 0, stdout: '', stderr: '' };
    }
    if (cmd === 'git' && args.includes('checkout') && !args.includes('-b')) {
      return { status: 0, stdout: '', stderr: '' };
    }
    return { status: 1, stdout: '', stderr: `mockProbeProc: unhandled call ${cmd} ${joined}` };
  };
  return { proc, calls };
}

describe('runProbePr — mocked-gh-CLI integration test (real orchestration, stubbed gh/git)', () => {
  test('discovers real check contexts, closes (never merges) the PR, in the right order', async () => {
    const { proc, calls } = mockProbeProc({
      ownerRepo: 'acme/disposable-probe-repo',
      checkRunsSequence: [[], ['ci', 'agent-review']], // first poll: not posted yet; second: posted
      prNumber: 99,
    });

    const result = await runProbePr('/fake/repo', 'acme/disposable-probe-repo', proc, {
      branchName: 'oa-install-probe-test',
      pollAttempts: 5,
      pollDelayMs: 0,
      sleep: async () => {},
    });

    expect(result.status).toBe('discovered');
    if (result.status !== 'discovered') throw new Error('unreachable');
    expect(result.checks).toEqual(['ci', 'agent-review']); // exactly what the stub reported, never fabricated
    expect(result.prNumber).toBe(99);
    expect(result.closed).toBe(true);

    // ORDER: open (create) happens before the check-runs read, which happens before close.
    const createIdx = calls.findIndex((c) => c.cmd === 'gh' && c.args[0] === 'pr' && c.args[1] === 'create');
    const firstCheckRunsIdx = calls.findIndex((c) => c.cmd === 'gh' && c.args[0] === 'api' && c.args.join(' ').includes('check-runs'));
    const closeIdx = calls.findIndex((c) => c.cmd === 'gh' && c.args[0] === 'pr' && c.args[1] === 'close');
    expect(createIdx).toBeGreaterThanOrEqual(0);
    expect(firstCheckRunsIdx).toBeGreaterThan(createIdx);
    expect(closeIdx).toBeGreaterThan(firstCheckRunsIdx);

    // NEVER MERGE: no call anywhere in the whole sequence names the merge verb.
    expect(calls.some((c) => c.args.includes('merge'))).toBe(false);
  });

  test('no checks ever post -> status=error, but the PR is still closed (never left dangling)', async () => {
    const { proc, calls } = mockProbeProc({
      ownerRepo: 'acme/no-ci-repo',
      checkRunsSequence: [[]], // never posts anything
    });
    const result = await runProbePr('/fake/repo', 'acme/no-ci-repo', proc, {
      branchName: 'oa-install-probe-test-2',
      pollAttempts: 3,
      pollDelayMs: 0,
      sleep: async () => {},
    });
    expect(result.status).toBe('error');
    if (result.status !== 'error') throw new Error('unreachable');
    expect(result.closed).toBe(true);
    expect(result.detail).toMatch(/never reported any check-runs/);
    expect(calls.some((c) => c.cmd === 'gh' && c.args[0] === 'pr' && c.args[1] === 'close')).toBe(true);
    expect(calls.some((c) => c.args.includes('merge'))).toBe(false);
  });

  test('gh pr create fails -> status=error, closed=false (nothing to close), never crashes', async () => {
    const proc: ProcFn = (cmd, args) => {
      if (cmd === 'git' && args.includes('rev-parse') && args.includes('--abbrev-ref')) return { status: 0, stdout: 'main\n', stderr: '' };
      if (cmd === 'gh' && args[0] === 'api') return { status: 0, stdout: JSON.stringify({ default_branch: 'main' }), stderr: '' };
      if (cmd === 'git' && args.includes('checkout')) return { status: 0, stdout: '', stderr: '' };
      if (cmd === 'git' && args.includes('commit')) return { status: 0, stdout: '', stderr: '' };
      if (cmd === 'git' && args.includes('rev-parse') && args.includes('HEAD')) return { status: 0, stdout: 'abc123\n', stderr: '' };
      if (cmd === 'git' && args.includes('push')) return { status: 0, stdout: '', stderr: '' };
      if (cmd === 'gh' && args[0] === 'pr' && args[1] === 'create') return { status: 1, stdout: '', stderr: 'permission denied (mock)' };
      return { status: 0, stdout: '', stderr: '' };
    };
    const result = await runProbePr('/fake/repo', 'acme/perm-denied', proc, { branchName: 'x', pollAttempts: 1, pollDelayMs: 0, sleep: async () => {} });
    expect(result.status).toBe('error');
    if (result.status !== 'error') throw new Error('unreachable');
    expect(result.closed).toBe(false);
    expect(result.detail).toMatch(/gh pr create failed/);
  });
});

describe('run() — GitHub profile with --live-probe drives the mocked probe-PR end-to-end via the CLI', () => {
  test('discovered check names flow through into the AUTHORIZE RECORD', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-auth-cli-liveprobe-')));
    const record = writeRecord(dir, 'simple-gh-sdlc', dir, true);
    const { proc } = mockProbeProc({ ownerRepo: 'acme/disposable-probe-repo', checkRunsSequence: [['ci', 'agent-review', 'security']], prNumber: 7 });
    const result = await run(
      [
        '--record', record, '--profiles-root', PROFILES_ROOT, '--json',
        '--spend-cadence', '*/15', '--spend-wip', '1', '--consent-harness-commit',
        '--consent-gh-admin', '--identity', 'own-token',
        '--live-probe', 'acme/disposable-probe-repo',
      ],
      PROFILES_ROOT,
      proc,
    );
    expect(result.ok).toBe(true);
    const r = result.record!;
    expect(r.checkNameDiscovery.status).toBe('discovered');
    if (r.checkNameDiscovery.status === 'discovered') {
      expect(r.checkNameDiscovery.checks).toEqual(['ci', 'agent-review', 'security']);
      expect(r.checkNameDiscovery.ownerRepo).toBe('acme/disposable-probe-repo');
    }
    cleanupAll();
  });
});

// =========================================================================================================
// parseArgs — loud errors on malformed invocations (mirrors TE.2/TE.3's own discipline).
// =========================================================================================================

describe('parseArgs', () => {
  test('unknown flag -> error', () => {
    const parsed = parseArgs(['--record', 'x', '--comfirm']);
    expect(parsed.error).toMatch(/unknown flag/);
  });
  test('--identity with no value -> error', () => {
    const parsed = parseArgs(['--identity']);
    expect(parsed.error).toMatch(/requires a value/);
  });
  test('--live-probe with no value -> error', () => {
    const parsed = parseArgs(['--live-probe']);
    expect(parsed.error).toMatch(/NEVER volter-ai\/open-autonomy/);
  });
});
