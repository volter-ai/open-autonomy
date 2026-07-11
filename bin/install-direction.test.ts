// TE.3 — unit tests for bin/install-direction.ts (Phase 2 CAPTURE DIRECTION, G2, CONDITIONAL +
// existing-doc-first). Three live-proof fixtures per the task's acceptance section:
//   (a) documents.roles (self-driving) — both shipped templates carry REPLACE THIS -> both gaps reported
//       with exact paths + the marker; simulate a fill in a scratch copy of the target repo + --filled ->
//       confirms satisfied, and the run mutates NOTHING outside the tool's own --out file.
//   (b) operator (simple-gh) on a repo WITH real positioning (this repo's own checkout) -> "no action
//       needed" citing the files found, no vision file created, git status clean.
//   (c) operator (simple-gh) on an EMPTY/sparse repo -> "anchor needed", recommends role-mapping over
//       authoring a new file (hardening #3), authors nothing itself.
// Plus unit tests for `checkDirectionInvariant` standalone (task: "Unit tests for ... the invariant-check
// function standalone").
import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getSetupPack, type SetupPack } from '@open-autonomy/core';
import {
  checkDirectionInvariant,
  checkDocumentsRolesGaps,
  checkOperatorPositioning,
  confirmFilled,
  isReadablePositioning,
  loadSelectionRecord,
  parseArgs,
  run,
  UNEDITED_TEMPLATE_MARKER,
  type SelectionRecordRef,
} from './install-direction.ts';

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
  git(dir, ['config', 'user.email', 'te3-test@example.com']);
  git(dir, ['config', 'user.name', 'TE3 test']);
}
function commitAll(dir: string, msg: string) {
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', msg]);
}

const tmps: string[] = [];
function track(dir: string): string {
  tmps.push(dir);
  return dir;
}
function cleanupAll() {
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true });
}

function selectionRecord(profile: string, repoDir: string): SelectionRecordRef {
  const pack: SetupPack = getSetupPack(join(PROFILES_ROOT, profile));
  return {
    profile,
    substrate: pack.codeHost === 'github' ? 'gh-actions' : 'local',
    pack,
    g1: { asked: false, answer: 'test-fixture' },
    detect: { source: 'live', repoDir, repoFacts: {} },
  };
}
function writeRecord(dir: string, profile: string, repoDir: string): string {
  const f = join(dir, 'record.json');
  writeFileSync(f, JSON.stringify(selectionRecord(profile, repoDir), null, 2));
  return f;
}

// =========================================================================================================
// loadSelectionRecord — malformed input -> loud errors (mirrors TE.2's loadDetectReport tests).
// =========================================================================================================

describe('loadSelectionRecord — malformed record file -> loud error', () => {
  test('missing file -> throws', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-direction-rec-')));
    expect(() => loadSelectionRecord(join(dir, 'nope.json'))).toThrow(/could not read file/);
    cleanupAll();
  });

  test('invalid JSON -> throws', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-direction-rec-')));
    const f = join(dir, 'bad.json');
    writeFileSync(f, '{ not valid json ][');
    expect(() => loadSelectionRecord(f)).toThrow(/not valid JSON/);
    cleanupAll();
  });

  test('a JSON array -> throws (not silently treated as an object)', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-direction-rec-')));
    const f = join(dir, 'array.json');
    writeFileSync(f, JSON.stringify([1, 2, 3]));
    expect(() => loadSelectionRecord(f)).toThrow(/malformed selection record/);
    cleanupAll();
  });

  test('missing "profile" -> throws', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-direction-rec-')));
    const f = join(dir, 'wrong.json');
    writeFileSync(f, JSON.stringify({ pack: {}, detect: { repoDir: '/x' } }));
    expect(() => loadSelectionRecord(f)).toThrow(/missing\/invalid "profile"/);
    cleanupAll();
  });

  test('missing "pack.direction_spec" -> throws', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-direction-rec-')));
    const f = join(dir, 'wrong2.json');
    writeFileSync(f, JSON.stringify({ profile: 'simple-gh', pack: {}, detect: { repoDir: '/x' } }));
    expect(() => loadSelectionRecord(f)).toThrow(/missing\/invalid "pack\.direction_spec"/);
    cleanupAll();
  });

  test('missing "detect.repoDir" -> throws', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-direction-rec-')));
    const f = join(dir, 'wrong3.json');
    writeFileSync(f, JSON.stringify({ profile: 'simple-gh', pack: { direction_spec: { mode: 'operator' } } }));
    expect(() => loadSelectionRecord(f)).toThrow(/missing\/invalid "detect\.repoDir"/);
    cleanupAll();
  });

  test('valid selection record parses cleanly', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-direction-rec-')));
    const f = writeRecord(dir, 'simple-gh', '/some/repo');
    const rec = loadSelectionRecord(f);
    expect(rec.profile).toBe('simple-gh');
    expect(rec.detect.repoDir).toBe('/some/repo');
    cleanupAll();
  });
});

// =========================================================================================================
// isReadablePositioning — the concrete "readable positioning" bar, standalone.
// =========================================================================================================

describe('isReadablePositioning — the concrete bar', () => {
  test('carries UNEDITED_TEMPLATE_MARKER -> never readable, regardless of length', () => {
    const long = `# Title\n\n<!-- ${UNEDITED_TEMPLATE_MARKER} for your project. -->\n` + 'x'.repeat(500);
    const r = isReadablePositioning(long);
    expect(r.readable).toBe(false);
    expect(r.reason).toMatch(new RegExp(UNEDITED_TEMPLATE_MARKER));
  });

  test('title-only stub ("# my-repo") -> not readable (too sparse)', () => {
    const r = isReadablePositioning('# my-repo\n');
    expect(r.readable).toBe(false);
    expect(r.reason).toMatch(/too sparse/);
  });

  test('long but ALL badges/headings, no real prose line -> not readable', () => {
    const badgesOnly = '# my-repo\n\n[![build](https://x)](https://y)\n[![license](https://x)](https://y)\n'.repeat(10);
    const r = isReadablePositioning(badgesOnly);
    expect(r.readable).toBe(false);
    // either "too sparse" (badges stripped -> under floor) or "title-only stub" depending on stripped length
    expect(r.reason).toMatch(/too sparse|title-only stub/);
  });

  test('real prose over the floor -> readable', () => {
    const prose =
      '# My Project\n\nThis project builds a thing that does a specific job for a specific kind of user, ' +
      'and this paragraph explains why it exists, what it optimizes for, and how a reader should think ' +
      'about contributing to it going forward. It also explains what "better" means for this project, so ' +
      'that a contributor has a yardstick beyond an individual issue\'s acceptance criteria.\n';
    const r = isReadablePositioning(prose);
    expect(r.readable).toBe(true);
    expect(r.chars).toBeGreaterThan(200);
  });

  test('markdown comments are stripped and do not count toward the floor', () => {
    const commentOnly = '# Title\n\n<!-- ' + 'x'.repeat(500) + ' -->\n';
    const r = isReadablePositioning(commentOnly);
    expect(r.readable).toBe(false);
  });
});

describe('checkOperatorPositioning — candidate discovery', () => {
  test('no README/AGENTS/docs -> no candidates at all', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-direction-pos-')));
    const check = checkOperatorPositioning(dir);
    expect(check.candidates).toEqual([]);
    expect(check.readable).toEqual([]);
    cleanupAll();
  });

  test('sparse README.md present -> a candidate, but not readable', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-direction-pos-')));
    writeFileSync(join(dir, 'README.md'), '# stub\n');
    const check = checkOperatorPositioning(dir);
    expect(check.candidates.map((c) => c.path)).toEqual(['README.md']);
    expect(check.readable).toEqual([]);
    cleanupAll();
  });

  test('real README.md + docs/*.md -> readable, all cited', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-direction-pos-')));
    const prose = 'This is a real, substantial description of the project '.repeat(6);
    writeFileSync(join(dir, 'README.md'), `# Project\n\n${prose}\n`);
    mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'docs', 'NOTES.md'), `# Notes\n\n${prose}\n`);
    const check = checkOperatorPositioning(dir);
    expect(check.readable.map((c) => c.path).sort()).toEqual(['README.md', 'docs/NOTES.md']);
    cleanupAll();
  });
});

// =========================================================================================================
// checkDocumentsRolesGaps — profile-source fallback + repo-copy preference.
// =========================================================================================================

describe('checkDocumentsRolesGaps', () => {
  test('real self-driving profile, empty target repo: both roles fall back to profile source, both report gaps (REPLACE THIS present)', () => {
    const repoDir = track(mkdtempSync(join(tmpdir(), 'oa-direction-docroles-')));
    const check = checkDocumentsRolesGaps(join(PROFILES_ROOT, 'self-driving'), repoDir);
    expect(check.checkedRoles.map((r) => r.role).sort()).toEqual(['constitution', 'vision']);
    expect(check.checkedRoles.every((r) => r.source === 'profile-source')).toBe(true);
    expect(check.gaps.length).toBe(2);
    for (const g of check.gaps) {
      expect(g.marker).toBe(UNEDITED_TEMPLATE_MARKER);
      expect(readFileSync(g.checkedAt, 'utf8')).toContain(UNEDITED_TEMPLATE_MARKER);
    }
    cleanupAll();
  });

  test('a repo-local filled copy is PREFERRED over the profile source (no gap reported)', () => {
    const repoDir = track(mkdtempSync(join(tmpdir(), 'oa-direction-docroles-')));
    mkdirSync(join(repoDir, 'docs'), { recursive: true });
    writeFileSync(join(repoDir, 'docs', 'VISION.md'), '# Vision\n\nOur real filled mission statement.\n');
    writeFileSync(join(repoDir, 'docs', 'CONSTITUTION.md'), '# Constitution\n\nOur real filled rules.\n');
    const check = checkDocumentsRolesGaps(join(PROFILES_ROOT, 'self-driving'), repoDir);
    expect(check.gaps).toEqual([]);
    expect(check.checkedRoles.every((r) => r.source === 'repo' && r.filled)).toBe(true);
    cleanupAll();
  });

  test('a repo-local copy that STILL carries the marker still reports a gap (repo copy wins, not silently skipped)', () => {
    const repoDir = track(mkdtempSync(join(tmpdir(), 'oa-direction-docroles-')));
    mkdirSync(join(repoDir, 'docs'), { recursive: true });
    writeFileSync(join(repoDir, 'docs', 'VISION.md'), `# Vision\n\n${UNEDITED_TEMPLATE_MARKER} still here.\n`);
    const check = checkDocumentsRolesGaps(join(PROFILES_ROOT, 'self-driving'), repoDir);
    const visionGap = check.gaps.find((g) => g.role === 'vision');
    expect(visionGap).toBeDefined();
    expect(visionGap!.source).toBe('repo');
    cleanupAll();
  });

  test('operator-mode profile (no documents.roles declared) -> no checked roles, no gaps', () => {
    const repoDir = track(mkdtempSync(join(tmpdir(), 'oa-direction-docroles-')));
    const check = checkDocumentsRolesGaps(join(PROFILES_ROOT, 'simple-gh'), repoDir);
    expect(check.checkedRoles).toEqual([]);
    expect(check.gaps).toEqual([]);
    cleanupAll();
  });

  test('a declared role whose file exists NOWHERE -> reported as source=missing, not a gap', () => {
    const repoDir = track(mkdtempSync(join(tmpdir(), 'oa-direction-docroles-')));
    const profileDir = track(mkdtempSync(join(tmpdir(), 'oa-direction-fakeprofile-')));
    writeFileSync(
      join(profileDir, 'ir.yml'),
      [
        'schema: autonomy.ir.v1',
        'targets: [local]',
        'codeHost: local-git',
        'resources: []',
        'documents:',
        '  roles:',
        '    vision: docs/VISION.md',
        'agents:',
        '  a:',
        '    behavior: b',
        '    capabilities: []',
        '    triggers:',
        '      - cron: "*/15 * * * *"',
        'policy:',
        '  box: {}',
      ].join('\n'),
    );
    const check = checkDocumentsRolesGaps(profileDir, repoDir);
    expect(check.checkedRoles).toEqual([{ role: 'vision', path: 'docs/VISION.md', source: 'missing', filled: false }]);
    expect(check.gaps).toEqual([]);
    cleanupAll();
  });
});

describe('confirmFilled', () => {
  test('all gaps resolved -> satisfied', () => {
    const check = { gaps: [], checkedRoles: [{ role: 'vision' as const, path: 'docs/VISION.md', source: 'repo' as const, filled: true }] };
    const r = confirmFilled(check, ['docs/VISION.md']);
    expect(r.satisfied).toBe(true);
    expect(r.stillOutstanding).toEqual([]);
  });

  test('a gap remains -> not satisfied, cited in detail', () => {
    const check = {
      gaps: [{ role: 'vision' as const, path: 'docs/VISION.md', source: 'repo' as const, checkedAt: '/x', marker: UNEDITED_TEMPLATE_MARKER }],
      checkedRoles: [{ role: 'vision' as const, path: 'docs/VISION.md', source: 'repo' as const, filled: false }],
    };
    const r = confirmFilled(check, ['docs/VISION.md']);
    expect(r.satisfied).toBe(false);
    expect(r.stillOutstanding.length).toBe(1);
    expect(r.detail).toMatch(/still outstanding/);
  });

  test('claiming a path that was never a declared role -> reported as irrelevant, does not block satisfaction', () => {
    const check = { gaps: [], checkedRoles: [{ role: 'vision' as const, path: 'docs/VISION.md', source: 'repo' as const, filled: true }] };
    const r = confirmFilled(check, ['docs/VISION.md', 'docs/UNRELATED.md']);
    expect(r.satisfied).toBe(true);
    expect(r.irrelevantClaims).toEqual(['docs/UNRELATED.md']);
  });
});

// =========================================================================================================
// checkDirectionInvariant — standalone (task: "Unit tests for ... the invariant-check function standalone").
// =========================================================================================================

describe('checkDirectionInvariant — standalone', () => {
  test("mode 'none' -> trivially satisfied", () => {
    const pack = getSetupPack(join(PROFILES_ROOT, 'simple-gh'));
    const fakePack: SetupPack = { ...pack, direction_spec: { mode: 'none' } };
    const repoDir = track(mkdtempSync(join(tmpdir(), 'oa-direction-inv-')));
    const r = checkDirectionInvariant(fakePack, join(PROFILES_ROOT, 'simple-gh'), repoDir);
    expect(r.satisfied).toBe(true);
    expect(r.mode).toBe('none');
    cleanupAll();
  });

  test("mode 'documents.roles', both templates unfilled -> not satisfied", () => {
    const pack = getSetupPack(join(PROFILES_ROOT, 'self-driving'));
    const repoDir = track(mkdtempSync(join(tmpdir(), 'oa-direction-inv-')));
    const r = checkDirectionInvariant(pack, join(PROFILES_ROOT, 'self-driving'), repoDir);
    expect(r.satisfied).toBe(false);
    expect(r.mode).toBe('documents.roles');
    expect(r.reason).toMatch(/unfilled template/);
    cleanupAll();
  });

  test("mode 'documents.roles', both templates filled in repo -> satisfied", () => {
    const pack = getSetupPack(join(PROFILES_ROOT, 'self-driving'));
    const repoDir = track(mkdtempSync(join(tmpdir(), 'oa-direction-inv-')));
    mkdirSync(join(repoDir, 'docs'), { recursive: true });
    writeFileSync(join(repoDir, 'docs', 'VISION.md'), '# Vision\n\nreal filled content\n');
    writeFileSync(join(repoDir, 'docs', 'CONSTITUTION.md'), '# Constitution\n\nreal filled content\n');
    const r = checkDirectionInvariant(pack, join(PROFILES_ROOT, 'self-driving'), repoDir);
    expect(r.satisfied).toBe(true);
    cleanupAll();
  });

  test("mode 'operator', readable positioning present -> satisfied", () => {
    const pack = getSetupPack(join(PROFILES_ROOT, 'simple-gh'));
    const r = checkDirectionInvariant(pack, join(PROFILES_ROOT, 'simple-gh'), REPO_ROOT);
    expect(r.satisfied).toBe(true);
    expect(r.mode).toBe('operator');
    cleanupAll();
  });

  test("mode 'operator', truly empty repo -> not satisfied, 'must be authored' reason", () => {
    const pack = getSetupPack(join(PROFILES_ROOT, 'simple-gh'));
    const repoDir = track(mkdtempSync(join(tmpdir(), 'oa-direction-inv-')));
    const r = checkDirectionInvariant(pack, join(PROFILES_ROOT, 'simple-gh'), repoDir);
    expect(r.satisfied).toBe(false);
    expect(r.reason).toMatch(/must be authored/);
    cleanupAll();
  });

  test("mode 'operator', sparse candidate -> not satisfied, role-mapping reason", () => {
    const pack = getSetupPack(join(PROFILES_ROOT, 'simple-gh'));
    const repoDir = track(mkdtempSync(join(tmpdir(), 'oa-direction-inv-')));
    writeFileSync(join(repoDir, 'README.md'), '# stub\n');
    const r = checkDirectionInvariant(pack, join(PROFILES_ROOT, 'simple-gh'), repoDir);
    expect(r.satisfied).toBe(false);
    expect(r.reason).toMatch(/role-map/);
    cleanupAll();
  });
});

// =========================================================================================================
// parseArgs
// =========================================================================================================

describe('parseArgs', () => {
  test('unknown flag -> loud error', () => {
    const { error } = parseArgs(['--record', 'x.json', '--wat']);
    expect(error).toMatch(/unknown flag "--wat"/);
  });

  test('--record with a missing value -> loud error', () => {
    const { error } = parseArgs(['--record']);
    expect(error).toMatch(/--record requires a value/);
  });

  test('--filled parses a comma-separated list, trims whitespace, drops empties', () => {
    const { opts } = parseArgs(['--record', 'x.json', '--filled', ' docs/VISION.md, docs/CONSTITUTION.md ,']);
    expect(opts.filled).toEqual(['docs/VISION.md', 'docs/CONSTITUTION.md']);
  });
});

// =========================================================================================================
// Fixture (a) — documents.roles (self-driving): both markers present -> ask; simulate fill + --filled -> confirmed.
// =========================================================================================================

describe('Fixture (a) — documents.roles (self-driving), live', () => {
  test('both templates unfilled -> ASK with exact file paths + the marker; no repo mutation', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-direction-sd-')));
    const recDir = track(mkdtempSync(join(tmpdir(), 'oa-direction-sd-rec-')));
    gitInit(dir);
    writeFileSync(join(dir, 'placeholder.txt'), 'x\n');
    commitAll(dir, 'init');
    const recordFile = writeRecord(recDir, 'self-driving', dir);

    const before = git(dir, ['status', '--porcelain']).stdout;
    const result = run(['--record', recordFile, '--json'], PROFILES_ROOT);
    expect(result.ok).toBe(true);
    const record = result.record!;
    expect(record.mode).toBe('documents.roles');
    expect(record.action).toBe('ask-fill');
    expect(record.invariant.satisfied).toBe(false);
    expect(record.documentsRoles!.gaps.map((g) => g.role).sort()).toEqual(['constitution', 'vision']);
    for (const g of record.documentsRoles!.gaps) {
      expect(g.marker).toBe(UNEDITED_TEMPLATE_MARKER);
      expect(g.path).toMatch(/^docs\/(VISION|CONSTITUTION)\.md$/);
    }
    // read-only: the target repo (tracked by git) is untouched by the ask.
    const after = git(dir, ['status', '--porcelain']).stdout;
    expect(after).toBe(before);
    cleanupAll();
  });

  test('simulate a fill in a scratch copy + --filled -> confirms satisfied, still no repo mutation beyond the fill itself', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-direction-sd-fill-')));
    const recDir = track(mkdtempSync(join(tmpdir(), 'oa-direction-sd-fill-rec-')));
    gitInit(dir);
    writeFileSync(join(dir, 'placeholder.txt'), 'x\n');
    commitAll(dir, 'init');
    const recordFile = writeRecord(recDir, 'self-driving', dir);

    // Simulate the fill: write FILLED copies into the scratch target repo (never touching profiles/self-driving/).
    const visionSrc = readFileSync(join(PROFILES_ROOT, 'self-driving', 'docs', 'VISION.md'), 'utf8');
    const constSrc = readFileSync(join(PROFILES_ROOT, 'self-driving', 'docs', 'CONSTITUTION.md'), 'utf8');
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'VISION.md'), visionSrc.split(UNEDITED_TEMPLATE_MARKER).join('FILLED for the test'));
    writeFileSync(join(dir, 'docs', 'CONSTITUTION.md'), constSrc.split(UNEDITED_TEMPLATE_MARKER).join('FILLED for the test'));
    expect(readFileSync(join(dir, 'docs', 'VISION.md'), 'utf8')).not.toContain(UNEDITED_TEMPLATE_MARKER);

    // The real profile source templates must remain untouched by the simulated fill.
    expect(readFileSync(join(PROFILES_ROOT, 'self-driving', 'docs', 'VISION.md'), 'utf8')).toContain(UNEDITED_TEMPLATE_MARKER);
    expect(readFileSync(join(PROFILES_ROOT, 'self-driving', 'docs', 'CONSTITUTION.md'), 'utf8')).toContain(UNEDITED_TEMPLATE_MARKER);

    const result = run(['--record', recordFile, '--json', '--filled', 'docs/VISION.md,docs/CONSTITUTION.md'], PROFILES_ROOT);
    expect(result.ok).toBe(true);
    const record = result.record!;
    expect(record.action).toBe('confirmed-filled');
    expect(record.invariant.satisfied).toBe(true);
    expect(record.filledConfirmation!.satisfied).toBe(true);
    expect(record.filledConfirmation!.stillOutstanding).toEqual([]);

    // Real, tracked git repo (build-te3 itself) is proven clean by the shared `git status` assertion in the
    // outer harness (see PR body); this test itself proves the profile SOURCE templates are untouched.
    cleanupAll();
  });

  test('--filled but the marker is STILL present -> not satisfied, cites what remains', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-direction-sd-partial-')));
    const recDir = track(mkdtempSync(join(tmpdir(), 'oa-direction-sd-partial-rec-')));
    gitInit(dir);
    writeFileSync(join(dir, 'placeholder.txt'), 'x\n');
    commitAll(dir, 'init');
    const recordFile = writeRecord(recDir, 'self-driving', dir);

    mkdirSync(join(dir, 'docs'), { recursive: true });
    const visionSrc = readFileSync(join(PROFILES_ROOT, 'self-driving', 'docs', 'VISION.md'), 'utf8');
    writeFileSync(join(dir, 'docs', 'VISION.md'), visionSrc.split(UNEDITED_TEMPLATE_MARKER).join('FILLED for the test'));
    // CONSTITUTION.md deliberately left unfilled (falls back to the profile source, still carries the marker).

    const result = run(['--record', recordFile, '--json', '--filled', 'docs/VISION.md,docs/CONSTITUTION.md'], PROFILES_ROOT);
    expect(result.ok).toBe(false);
    const record = result.record!;
    expect(record.action).toBe('still-outstanding');
    expect(record.invariant.satisfied).toBe(false);
    expect(record.filledConfirmation!.stillOutstanding.map((g) => g.role)).toEqual(['constitution']);
    cleanupAll();
  });

  test('--filled on an operator-mode pack -> loud error (never a silent no-op)', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-direction-operr-')));
    const recDir = track(mkdtempSync(join(tmpdir(), 'oa-direction-operr-rec-')));
    gitInit(dir);
    writeFileSync(join(dir, 'placeholder.txt'), 'x\n');
    commitAll(dir, 'init');
    const recordFile = writeRecord(recDir, 'simple-gh', dir);
    const result = run(['--record', recordFile, '--filled', 'README.md'], PROFILES_ROOT);
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/--filled only applies to direction_spec\.mode 'documents\.roles'/);
    cleanupAll();
  });
});

// =========================================================================================================
// Fixture (b) — operator (simple-gh) on a repo WITH real positioning: this repo's own checkout.
// =========================================================================================================

describe('Fixture (b) — operator, repo WITH real positioning, live', () => {
  test('"no action needed", cites the real files found, authors nothing, repo untouched', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-direction-op-real-')));
    const recordFile = writeRecord(dir, 'simple-gh', REPO_ROOT);

    const beforeStatus = git(REPO_ROOT, ['status', '--porcelain']).stdout;
    const result = run(['--record', recordFile, '--json'], PROFILES_ROOT);
    expect(result.ok).toBe(true);
    const record = result.record!;
    expect(record.mode).toBe('operator');
    expect(record.action).toBe('no-action-needed');
    expect(record.invariant.satisfied).toBe(true);
    expect(record.positioning!.readable.map((f) => f.path)).toContain('README.md');
    expect(record.positioning!.readable.map((f) => f.path)).toContain('AGENTS.md');
    expect(record.detail).toMatch(/no action needed/);
    expect(record.detail).not.toMatch(/docs\/VISION\.md.*created/i);

    const afterStatus = git(REPO_ROOT, ['status', '--porcelain']).stdout;
    // The only permissible delta is untracked scratch files this test itself may have left OUTSIDE the
    // repo tree (it writes none) — the direction tool must not touch the repo at all.
    expect(afterStatus).toBe(beforeStatus);
    cleanupAll();
  });
});

// =========================================================================================================
// Fixture (c) — operator (simple-gh) on an EMPTY/sparse repo.
// =========================================================================================================

describe('Fixture (c) — operator, EMPTY/sparse repo, live', () => {
  test('truly empty repo -> "anchor needed", recommends AUTHORING (no candidates at all), authors nothing', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-direction-op-empty-')));
    const recDir = track(mkdtempSync(join(tmpdir(), 'oa-direction-op-empty-rec-')));
    gitInit(dir);
    writeFileSync(join(dir, 'file.txt'), 'x\n');
    commitAll(dir, 'init');
    const recordFile = writeRecord(recDir, 'simple-gh', dir);

    const result = run(['--record', recordFile, '--json'], PROFILES_ROOT);
    expect(result.ok).toBe(true);
    const record = result.record!;
    expect(record.action).toBe('anchor-needed-author');
    expect(record.invariant.satisfied).toBe(false);
    expect(record.positioning!.candidates).toEqual([]);
    expect(record.detail).toMatch(/must be authored/);
    expect(record.detail).not.toMatch(/wrote|created|authored a/i); // never claims to have done it itself

    const status = git(dir, ['status', '--porcelain']).stdout;
    expect(status).toBe(''); // nothing written by the tool
    cleanupAll();
  });

  test('sparse repo (a title-only README) -> "anchor needed", recommends ROLE-MAPPING over authoring a new file', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-direction-op-sparse-')));
    const recDir = track(mkdtempSync(join(tmpdir(), 'oa-direction-op-sparse-rec-')));
    gitInit(dir);
    writeFileSync(join(dir, 'README.md'), '# my-repo\n');
    commitAll(dir, 'init');
    const recordFile = writeRecord(recDir, 'simple-gh', dir);

    const result = run(['--record', recordFile, '--json'], PROFILES_ROOT);
    expect(result.ok).toBe(true);
    const record = result.record!;
    expect(record.action).toBe('anchor-needed-role-map');
    expect(record.invariant.satisfied).toBe(false);
    expect(record.positioning!.candidates.map((c) => c.path)).toEqual(['README.md']);
    expect(record.detail).toMatch(/PREFER role-mapping/);
    expect(record.detail).toMatch(/over authoring a new docs\/VISION\.md/);

    const status = git(dir, ['status', '--porcelain']).stdout;
    expect(status).toBe('');
    cleanupAll();
  });
});

// =========================================================================================================
// CLI-level error handling
// =========================================================================================================

describe('run() — CLI-level errors', () => {
  test('no --record -> usage', () => {
    const result = run([], PROFILES_ROOT);
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/^usage:/);
  });

  test('unknown profile in record -> loud error', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-direction-badprof-')));
    const f = join(dir, 'record.json');
    writeFileSync(f, JSON.stringify({ profile: 'not-a-real-profile', pack: { direction_spec: { mode: 'operator' } }, detect: { repoDir: dir } }));
    const result = run(['--record', f], PROFILES_ROOT);
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/not found under/);
    cleanupAll();
  });

  test('repoDir from record does not exist -> loud error', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-direction-badrepo-')));
    const f = join(dir, 'record.json');
    writeFileSync(f, JSON.stringify({ profile: 'simple-gh', pack: { direction_spec: { mode: 'operator' } }, detect: { repoDir: '/definitely/does/not/exist' } }));
    const result = run(['--record', f], PROFILES_ROOT);
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/does not exist/);
    cleanupAll();
  });

  test('--repo-dir overrides the record\'s detect.repoDir', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'oa-direction-override-')));
    const recordFile = writeRecord(dir, 'simple-gh', '/definitely/does/not/exist');
    const result = run(['--record', recordFile, '--repo-dir', REPO_ROOT, '--json'], PROFILES_ROOT);
    expect(result.ok).toBe(true);
    expect(result.record!.repoDirChecked).toBe(REPO_ROOT);
    cleanupAll();
  });
});
