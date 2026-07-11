// TE.2 — unit tests for bin/install-select.ts (Phase 1 SELECT: G1 recommend/confirm + SetupPack
// instantiation). Two live-proof fixtures per the task's acceptance section:
//   1. RECOMMEND flow — an empty, non-GitHub repo. Invocation 1 emits the ONE G1 question; invocation 2
//      (--confirm) emits the SELECTION RECORD with the right pack loaded.
//   2. VALIDATE-A-PRE-PICK flow — a populated GitHub repo. `--pick self-driving` is BLOCKED (cites the
//      real clobber-guard line range); `--pick simple-gh-sdlc` is validated OK and emits a record.
// Both driven against the REAL bundled `profiles/*` catalog (not a synthetic fixture), matching TD.2's own
// `run()` test convention (bin/recommend-profile.test.ts) — `getSetupPack` is exercised for real too, so
// the pack-fidelity assertions are meaningful.
//
// `gh` is always stubbed here (offline, deterministic) — same convention as bin/install-detect.test.ts /
// bin/recommend-profile.test.ts: the ghAdmin probe is exercised elsewhere (those two suites); this suite
// is about install-select's own SELECT/instantiate logic, not re-proving ghAdmin ambiguity handling.
import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getSetupPack } from '@open-autonomy/core';
import { detect } from './install-detect.ts';
import {
  formatG1Question,
  loadDetectReport,
  parseArgs,
  repoFactsFromDetectReport,
  run,
} from './install-select.ts';
import type { ProcFn } from './recommend-profile.ts';
import type { DetectReport } from './install-detect.ts';

const REPO_ROOT = join(import.meta.dir, '..');
const PROFILES_ROOT = join(REPO_ROOT, 'profiles');

function git(dir: string, args: string[]) {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${dir}: ${r.stderr}`);
  return r;
}
function gitInit(dir: string) {
  mkdirSync(dir, { recursive: true });
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 'te2-test@example.com']);
  git(dir, ['config', 'user.name', 'TE2 test']);
}
function commitAll(dir: string, msg: string) {
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', msg]);
}

// A `gh` stub that never touches the network — reports "not authenticated" so any admin probe reads as
// unknown, never a false negative (mirrors bin/install-detect.test.ts's own convention).
const offlineGhProc: ProcFn = (cmd) => {
  if (cmd === 'gh') return { status: 1, stdout: '', stderr: 'gh: not authenticated (stubbed, offline test)' };
  return { status: 1, stdout: '', stderr: `unexpected command in test: ${cmd}` };
};

const tmps: string[] = [];
function track(dir: string): string {
  tmps.push(dir);
  return dir;
}
function cleanupAll() {
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true });
}

// =========================================================================================================
// repoFactsFromDetectReport / loadDetectReport
// =========================================================================================================

function fakeDetectReport(over: { onGitHub?: boolean; populated?: boolean; admin?: boolean }): DetectReport {
  return {
    repoDir: '/fake',
    build: { hasPackageJson: false, language: 'unknown', buildFiles: [], notes: [] },
    git: { isGitRepo: true, onGitHub: over.onGitHub ?? false, populated: over.populated ?? false, trackedFileCount: 0, notes: [] },
    gh: { ghInstalled: true, authStatus: 'authenticated', admin: over.admin, adminBasis: 'test', notes: [] },
    existingInstall: { dirPresent: false, manifestPresent: false, manifestFileCount: 0, autonomyYmlPresent: false, installJsonPresent: false, roadmapYmlPresent: false, pausedPresent: false, reinstall: false, notes: [] },
    tools: {
      node: { version: 'v22.18.0', floor: '>=22.18', meetsFloor: true },
      git: { present: true },
      tmux: { present: true },
      bun: { present: true },
      ztrack: { vendored: true, global: false, note: '' },
      termfleet: { installed: true, reachable: 'not-running', note: '' },
      codingCli: { status: 'PASS', detail: 'test' },
      notes: [],
    },
    humanGates: [],
    doctorChecks: { env: { status: 'PASS', detail: 'test' }, auth: { status: 'PASS', detail: 'test' }, provider: { status: 'SKIP', detail: 'test' } },
  } as unknown as DetectReport;
}

describe('repoFactsFromDetectReport', () => {
  test('maps git.onGitHub/populated and gh.admin straight across', () => {
    const report = fakeDetectReport({ onGitHub: true, populated: true, admin: false });
    const facts = repoFactsFromDetectReport(report);
    expect(facts.onGitHub).toBe(true);
    expect(facts.populated).toBe(true);
    expect(facts.ghAdmin).toBe(false);
  });

  test('gh.admin=undefined ("unknown") is carried through as undefined, never coerced', () => {
    const report = fakeDetectReport({ onGitHub: true, admin: undefined });
    const facts = repoFactsFromDetectReport(report);
    expect(facts.ghAdmin).toBeUndefined();
  });

  test('operator overrides (hostedRunner/canFundProxy/...) layer on top — never present in a detect report', () => {
    const report = fakeDetectReport({ onGitHub: true, populated: false });
    const facts = repoFactsFromDetectReport(report, { canFundProxy: true, hostedRunner: true });
    expect(facts.canFundProxy).toBe(true);
    expect(facts.hostedRunner).toBe(true);
  });
});

describe('loadDetectReport — malformed detect file -> loud error', () => {
  let dir: string;
  test('missing file -> throws', () => {
    dir = track(mkdtempSync(join(tmpdir(), 'oa-select-detect-')));
    expect(() => loadDetectReport(join(dir, 'nope.json'))).toThrow(/could not read file/);
    cleanupAll();
  });

  test('invalid JSON -> throws', () => {
    dir = track(mkdtempSync(join(tmpdir(), 'oa-select-detect-')));
    const f = join(dir, 'bad.json');
    writeFileSync(f, '{ not valid json ][');
    expect(() => loadDetectReport(f)).toThrow(/not valid JSON/);
    cleanupAll();
  });

  test('valid JSON but not shaped like a DetectReport (missing git.onGitHub) -> throws', () => {
    dir = track(mkdtempSync(join(tmpdir(), 'oa-select-detect-')));
    const f = join(dir, 'wrong-shape.json');
    writeFileSync(f, JSON.stringify({ hello: 'world' }));
    expect(() => loadDetectReport(f)).toThrow(/missing\/invalid "git\.onGitHub"/);
    cleanupAll();
  });

  test('a JSON array -> throws (not silently treated as an object)', () => {
    dir = track(mkdtempSync(join(tmpdir(), 'oa-select-detect-')));
    const f = join(dir, 'array.json');
    writeFileSync(f, JSON.stringify([1, 2, 3]));
    expect(() => loadDetectReport(f)).toThrow(/malformed detect report/);
    cleanupAll();
  });

  test('valid DetectReport shape parses cleanly', () => {
    dir = track(mkdtempSync(join(tmpdir(), 'oa-select-detect-')));
    const f = join(dir, 'good.json');
    writeFileSync(f, JSON.stringify(fakeDetectReport({ onGitHub: false, populated: false })));
    const report = loadDetectReport(f);
    expect(report.git.onGitHub).toBe(false);
    cleanupAll();
  });
});

describe('formatG1Question', () => {
  test('formats THE ONE G1 QUESTION verbatim per the task brief', () => {
    const q = formatG1Question({ profile: 'simple-sdlc', substrate: 'local', reasons: ['reason one', 'reason two'] });
    expect(q).toBe('I recommend simple-sdlc on local because reason one; reason two; confirm or override?');
  });
});

// =========================================================================================================
// Fixture 1 — RECOMMEND flow, end-to-end, live: an empty, non-GitHub repo.
// =========================================================================================================

describe('Fixture 1 — RECOMMEND flow (empty, non-GitHub repo)', () => {
  test('invocation 1 (no --confirm/--override): emits exactly the ONE G1 question, no record', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-select-recommend-')));
    gitInit(dir);
    // deliberately no remote, no commits beyond git-init -> onGitHub=false, populated=false.

    const result = await run([dir, '--json'], PROFILES_ROOT, offlineGhProc);
    expect(result.ok).toBe(true);
    expect(result.asked).toBe(true);
    expect(result.record).toBeUndefined();

    const parsed = JSON.parse(result.output);
    expect(parsed.mode).toBe('recommend');
    expect(parsed.asked).toBe(true);
    expect(parsed.recommendation.profile).toBe('simple-sdlc');
    expect(parsed.recommendation.substrate).toBe('local');
    expect(parsed.question).toBe('I recommend simple-sdlc on local because ' + parsed.recommendation.reasons.join('; ') + '; confirm or override?');

    cleanupAll();
  });

  test('invocation 2 (--confirm <profile>): zero NEW questions, emits a SELECTION RECORD whose pack byte-matches getSetupPack', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-select-recommend-confirm-')));
    gitInit(dir);

    // Stateless re-derivation: same repoDir/args as invocation 1, plus --confirm <the profile invocation
    // 1's question named>. No session file exists between the two calls — this whole test only runs
    // invocation 2, proving statelessness works alone.
    const result = await run([dir, '--json', '--confirm', 'simple-sdlc'], PROFILES_ROOT, offlineGhProc);
    expect(result.ok).toBe(true);
    expect(result.asked).toBe(false); // no NEW question this invocation
    expect(result.record).toBeDefined();
    const record = result.record!;

    expect(record.profile).toBe('simple-sdlc');
    expect(record.substrate).toBe('local');
    expect(record.g1.asked).toBe(true); // documents that a question WAS asked (in invocation 1)
    expect(record.g1.answer).toMatch(/^confirmed "simple-sdlc" @ local$/);
    expect(record.g1.question).toMatch(/^I recommend simple-sdlc on local because/);

    // PACK FIDELITY: byte-matches getSetupPack's own output for this profile.
    const directPack = getSetupPack(join(PROFILES_ROOT, 'simple-sdlc'));
    expect(JSON.stringify(record.pack)).toBe(JSON.stringify(directPack));
    expect(record.pack.landing_mode).toBe('pr-free');
    expect(record.pack.maturity_signals.m4_predicate).toBe('ztrack');

    // detect ref present.
    expect(record.detect.repoDir).toBe(dir);
    expect(record.detect.repoFacts.onGitHub).toBe(false);

    cleanupAll();
  });

  test('CONFIRM-DRIFT GUARD (D1): repo changed between invocations -> --confirm <old profile> HARD-ERRORS naming both profiles + the changed facts, binds NOTHING', async () => {
    // The reviewer's live repro, as a test: invocation 1 on an EMPTY, non-GitHub repo asks
    // "I recommend simple-sdlc on local ... confirm or override?" — then the repo mutates (real content +
    // a GitHub remote) BEFORE the human's answer lands. The stateless re-derivation now recommends
    // simple-gh-sdlc; a bare "yes" would silently flip landing_mode pr-free -> auto-merge. The guard must
    // refuse: hard error, both profile names, the changed facts, no record, exit-worthy.
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-select-drift-')));
    gitInit(dir);

    const inv1 = await run([dir, '--json'], PROFILES_ROOT, offlineGhProc);
    expect(JSON.parse(inv1.output).recommendation.profile).toBe('simple-sdlc');

    // The repo mutates between the two stateless invocations.
    git(dir, ['remote', 'add', 'origin', 'https://github.com/example-org/example-repo.git']);
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'app.js'), 'module.exports = {}\n');
    commitAll(dir, 'real app content');

    const inv2 = await run([dir, '--json', '--confirm', 'simple-sdlc'], PROFILES_ROOT, offlineGhProc);
    expect(inv2.ok).toBe(false);
    expect(inv2.asked).toBe(false);
    expect(inv2.record).toBeUndefined(); // nothing bound, no record, no pack instantiated
    expect(inv2.output).toMatch(/recommendation drifted since the question was asked/);
    expect(inv2.output).toMatch(/was "simple-sdlc", now "simple-gh-sdlc"/); // both profiles named
    expect(inv2.output).toMatch(/onGitHub=true/); // the changed fact, cited
    expect(inv2.output).toMatch(/populated=true/); // the changed fact, cited
    expect(inv2.output).toMatch(/re-ask G1/);

    cleanupAll();
  });

  test('no-drift --confirm <profile>: the confirmed name matches the re-derivation -> record, g1.answer records exactly what the human confirmed', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-select-nodrift-')));
    gitInit(dir);

    const result = await run([dir, '--confirm', 'simple-sdlc'], PROFILES_ROOT, offlineGhProc);
    expect(result.ok).toBe(true);
    expect(result.record!.profile).toBe('simple-sdlc');
    expect(result.record!.g1.answer).toBe('confirmed "simple-sdlc" @ local');

    cleanupAll();
  });

  test('bare --confirm (no profile name) -> loud usage error pointing at the required syntax, never a silent bind', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-select-bareconfirm-')));
    gitInit(dir);

    const result = await run([dir, '--confirm'], PROFILES_ROOT, offlineGhProc);
    expect(result.ok).toBe(false);
    expect(result.record).toBeUndefined();
    expect(result.output).toMatch(/--confirm requires the profile name being confirmed/);
    expect(result.output).toMatch(/--confirm simple-sdlc/); // the example syntax
    expect(result.output).toMatch(/usage:/);

    cleanupAll();
  });

  test('--override <profile> validates the override (never blindly trusted) and records the override, not the recommendation', async () => {
    // A populated GitHub repo recommends simple-gh-sdlc@local by default; override to "simple-gh" instead
    // (a valid, non-scaffold, additive choice for this repo) and confirm the record reflects the override.
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-select-override-')));
    gitInit(dir);
    git(dir, ['remote', 'add', 'origin', 'https://github.com/example-org/example-repo.git']);
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'app.js'), 'module.exports = {}\n');
    commitAll(dir, 'real app content');

    const first = await run([dir, '--json'], PROFILES_ROOT, offlineGhProc);
    expect(first.asked).toBe(true);
    const firstParsed = JSON.parse(first.output);
    expect(firstParsed.recommendation.profile).toBe('simple-gh-sdlc');

    const second = await run([dir, '--json', '--override', 'simple-gh'], PROFILES_ROOT, offlineGhProc);
    expect(second.ok).toBe(true);
    expect(second.asked).toBe(false);
    const record = second.record!;
    expect(record.profile).toBe('simple-gh');
    expect(record.g1.answer).toMatch(/^overridden to "simple-gh" @ local \(recommendation had been "simple-gh-sdlc" @ local\)$/);
    expect(JSON.stringify(record.pack)).toBe(JSON.stringify(getSetupPack(join(PROFILES_ROOT, 'simple-gh'))));

    cleanupAll();
  });

  test('an invalid --override (would clobber a populated repo) is refused with a loud error, not silently applied', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-select-bad-override-')));
    gitInit(dir);
    git(dir, ['remote', 'add', 'origin', 'https://github.com/example-org/example-repo.git']);
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'app.js'), 'module.exports = {}\n');
    commitAll(dir, 'real app content');

    const result = await run([dir, '--override', 'self-driving'], PROFILES_ROOT, offlineGhProc);
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/whole-repo scaffold/);
    expect(result.record).toBeUndefined();

    cleanupAll();
  });

  test('--detect <json-file> mode reaches the SAME recommendation as a live detect() run on the same repo', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-select-detect-file-')));
    gitInit(dir);

    const report = await detect(dir, offlineGhProc);
    const detectFile = join(dir, '..', 'detect-report.json');
    writeFileSync(detectFile, JSON.stringify(report));
    track(detectFile);

    const viaFile = await run([dir, '--detect', detectFile, '--json'], PROFILES_ROOT, offlineGhProc);
    const viaLive = await run([dir, '--json'], PROFILES_ROOT, offlineGhProc);

    const parsedFile = JSON.parse(viaFile.output);
    const parsedLive = JSON.parse(viaLive.output);
    expect(parsedFile.recommendation.profile).toBe(parsedLive.recommendation.profile);
    expect(parsedFile.recommendation.substrate).toBe(parsedLive.recommendation.substrate);
    expect(parsedFile.detect.source).toBe('file');
    expect(parsedFile.detect.file).toBe(detectFile);
    expect(parsedLive.detect.source).toBe('live');

    cleanupAll();
  });

  test('--out <file> writes the SELECTION RECORD to disk (stdout stays the primary channel)', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-select-out-')));
    gitInit(dir);
    const outFile = join(dir, '..', 'selection-record.json');
    track(outFile);

    const result = await run([dir, '--confirm', 'simple-sdlc', '--out', outFile], PROFILES_ROOT, offlineGhProc);
    expect(result.ok).toBe(true);
    const written = JSON.parse(readFileSync(outFile, 'utf8'));
    expect(written.profile).toBe('simple-sdlc');

    cleanupAll();
  });
});

// =========================================================================================================
// Fixture 2 — VALIDATE-A-PRE-PICK flow, end-to-end, live: a populated GitHub repo.
// =========================================================================================================

describe('Fixture 2 — VALIDATE-A-PRE-PICK flow (populated GitHub repo)', () => {
  function populatedGithubRepo(name: string): string {
    const dir = track(mkdtempSync(join(tmpdir(), `oa-select-prepick-${name}-`)));
    gitInit(dir);
    git(dir, ['remote', 'add', 'origin', 'https://github.com/example-org/example-repo.git']);
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'app.js'), 'module.exports = {}\n');
    commitAll(dir, 'real app content');
    return dir;
  }

  test('--pick self-driving -> BLOCKED, exactly one question, citing the real clobber-guard line range, NO record', async () => {
    const dir = populatedGithubRepo('self-driving');
    const result = await run([dir, '--pick', 'self-driving', '--json'], PROFILES_ROOT, offlineGhProc);

    expect(result.ok).toBe(false);
    expect(result.asked).toBe(true);
    expect(result.record).toBeUndefined();

    const parsed = JSON.parse(result.output);
    expect(parsed.mode).toBe('validate');
    expect(parsed.asked).toBe(true);
    expect(parsed.question).toMatch(/^BLOCKED: "self-driving"/);
    expect(parsed.question).toMatch(/whole-repo scaffold/);
    expect(parsed.question).toMatch(/bin\/autonomy-compile\.ts:233-257/);
    expect(parsed.question).toMatch(/new-repo-only/);
    expect(parsed.question).toMatch(/pick simple-gh-sdlc/);

    cleanupAll();
  });

  test('--pick simple-gh-sdlc -> validated OK, ZERO questions, emits a SELECTION RECORD whose pack byte-matches getSetupPack', async () => {
    const dir = populatedGithubRepo('simple-gh-sdlc');
    const result = await run([dir, '--pick', 'simple-gh-sdlc', '--json'], PROFILES_ROOT, offlineGhProc);

    expect(result.ok).toBe(true);
    expect(result.asked).toBe(false); // validated pre-pick needs no confirmation question
    expect(result.record).toBeDefined();
    const record = result.record!;

    expect(record.profile).toBe('simple-gh-sdlc');
    expect(record.g1.asked).toBe(false);
    expect(record.g1.answer).toMatch(/^pre-picked "simple-gh-sdlc" — validated OK/);
    expect(record.g1.question).toBeUndefined();

    const directPack = getSetupPack(join(PROFILES_ROOT, 'simple-gh-sdlc'));
    expect(JSON.stringify(record.pack)).toBe(JSON.stringify(directPack));
    expect(record.pack.landing_mode).toBe('auto-merge');

    cleanupAll();
  });

  test('an unpopulated repo + --pick self-driving -> validated OK (no clobber risk), zero questions', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-select-prepick-sd-empty-')));
    gitInit(dir);
    git(dir, ['remote', 'add', 'origin', 'https://github.com/example-org/example-repo.git']);

    const result = await run([dir, '--pick', 'self-driving', '--json', '--can-fund-proxy'], PROFILES_ROOT, offlineGhProc);
    expect(result.ok).toBe(true);
    expect(result.asked).toBe(false);
    expect(result.record!.profile).toBe('self-driving');
    expect(result.record!.pack.landing_mode).toBe('auto-merge');

    cleanupAll();
  });
});

// =========================================================================================================
// The one-question invariant, summarized across both flows (acceptance (ii)).
// =========================================================================================================

describe('one-question invariant — count question emissions per flow, zero re-asks after answer', () => {
  test('recommend-flow: invocation 1 asks 1, invocation 2 (--confirm) asks 0 -> total 1 question for the whole exchange', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-select-oneq-recommend-')));
    gitInit(dir);

    const inv1 = await run([dir], PROFILES_ROOT, offlineGhProc);
    const inv2 = await run([dir, '--confirm', 'simple-sdlc'], PROFILES_ROOT, offlineGhProc);
    const questionCount = [inv1, inv2].filter((r) => r.asked).length;
    expect(questionCount).toBe(1);
    expect(inv1.asked).toBe(true);
    expect(inv2.asked).toBe(false);

    cleanupAll();
  });

  test('validate-a-pre-pick, blocked: exactly 1 question in the single invocation', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-select-oneq-blocked-')));
    gitInit(dir);
    git(dir, ['remote', 'add', 'origin', 'https://github.com/example-org/example-repo.git']);
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'app.js'), 'x');
    commitAll(dir, 'content');

    const result = await run([dir, '--pick', 'self-driving'], PROFILES_ROOT, offlineGhProc);
    expect(result.asked).toBe(true);

    cleanupAll();
  });

  test('validate-a-pre-pick, validated OK: exactly 0 questions in the single invocation', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-select-oneq-ok-')));
    gitInit(dir);
    git(dir, ['remote', 'add', 'origin', 'https://github.com/example-org/example-repo.git']);
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'app.js'), 'x');
    commitAll(dir, 'content');

    const result = await run([dir, '--pick', 'simple-gh-sdlc'], PROFILES_ROOT, offlineGhProc);
    expect(result.asked).toBe(false);

    cleanupAll();
  });
});

// =========================================================================================================
// parseArgs + basic error paths
// =========================================================================================================

describe('parseArgs', () => {
  test('parses the repoDir positional plus flags', () => {
    const { opts, error } = parseArgs(['/tmp/some-repo', '--json', '--detect', '/tmp/d.json', '--pick', 'self-driving', '--substrate', 'gh-actions', '--out', '/tmp/out.json']);
    expect(error).toBeUndefined();
    expect(opts.repoDir).toBe('/tmp/some-repo');
    expect(opts.json).toBe(true);
    expect(opts.detectFile).toBe('/tmp/d.json');
    expect(opts.pick).toBe('self-driving');
    expect(opts.substrate).toBe('gh-actions');
    expect(opts.out).toBe('/tmp/out.json');
  });

  test('--confirm <profile> and --override <profile> parse independently', () => {
    expect(parseArgs(['/tmp/x', '--confirm', 'simple-sdlc']).opts.confirm).toBe('simple-sdlc');
    expect(parseArgs(['/tmp/x', '--override', 'simple-gh']).opts.override).toBe('simple-gh');
  });

  test('D2: an unknown flag (e.g. a typo\'d --comfirm) -> loud error, never silently dropped', () => {
    const { error } = parseArgs(['/tmp/x', '--comfirm', 'simple-sdlc']);
    expect(error).toBeDefined();
    expect(error).toMatch(/unknown flag "--comfirm"/);
  });

  test('D3: a value-taking flag at end of argv -> loud error, never a silent undefined', () => {
    for (const flag of ['--pick', '--override', '--detect', '--out', '--substrate', '--profiles-root']) {
      const { error } = parseArgs(['/tmp/x', flag]);
      expect(error).toBeDefined();
      expect(error).toMatch(new RegExp(`${flag} requires a value`));
    }
  });

  test('D3: a value-taking flag whose "value" is another flag -> loud error (the value was omitted, not "--json")', () => {
    const { error } = parseArgs(['/tmp/x', '--pick', '--json']);
    expect(error).toBeDefined();
    expect(error).toMatch(/--pick requires a value/);
  });

  test('D1: bare --confirm -> loud error demanding the confirmed profile name', () => {
    const { error } = parseArgs(['/tmp/x', '--confirm']);
    expect(error).toBeDefined();
    expect(error).toMatch(/--confirm requires the profile name being confirmed/);
  });
});

describe('run() — error paths', () => {
  test('no repoDir -> usage, not ok', async () => {
    const result = await run([], PROFILES_ROOT, offlineGhProc);
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/usage:/);
  });

  test('invalid --substrate -> error, not ok', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-select-badsub-')));
    gitInit(dir);
    const result = await run([dir, '--substrate', 'nonsense'], PROFILES_ROOT, offlineGhProc);
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/--substrate must be/);
    cleanupAll();
  });

  test('--pick combined with --confirm -> rejected (the two flows are mutually exclusive)', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-select-mixedflags-')));
    gitInit(dir);
    const result = await run([dir, '--pick', 'simple-sdlc', '--confirm', 'simple-sdlc'], PROFILES_ROOT, offlineGhProc);
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/cannot be combined/);
    cleanupAll();
  });

  test('--confirm and --override together -> rejected', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-select-mixedflags2-')));
    gitInit(dir);
    const result = await run([dir, '--confirm', 'simple-sdlc', '--override', 'simple-gh'], PROFILES_ROOT, offlineGhProc);
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/mutually exclusive/);
    cleanupAll();
  });

  test('nonexistent repoDir with no --detect -> loud error, not a silent empty-repo guess', async () => {
    const result = await run(['/definitely/not/a/real/path/oa-select-test'], PROFILES_ROOT, offlineGhProc);
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/does not exist/);
  });

  test('D2 end-to-end: run() with a typo\'d flag -> loud usage error, exit-worthy, never a silent re-ask', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-select-typo-')));
    gitInit(dir);
    const result = await run([dir, '--comfirm', 'simple-sdlc'], PROFILES_ROOT, offlineGhProc);
    expect(result.ok).toBe(false);
    expect(result.asked).toBe(false); // the typo did NOT silently fall through to the question-emitting flow
    expect(result.output).toMatch(/unknown flag "--comfirm"/);
    expect(result.output).toMatch(/usage:/);
    cleanupAll();
  });

  test('D3 end-to-end: run() with a dangling --pick -> loud usage error, never a silent flow switch', async () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-select-dangling-')));
    gitInit(dir);
    const result = await run([dir, '--pick'], PROFILES_ROOT, offlineGhProc);
    expect(result.ok).toBe(false);
    expect(result.asked).toBe(false); // did NOT silently become the recommend flow
    expect(result.output).toMatch(/--pick requires a value/);
    expect(result.output).toMatch(/usage:/);
    cleanupAll();
  });
});
