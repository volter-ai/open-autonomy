// Unit tests for TD.2's recommender CLI wrapper (bin/recommend-profile.ts). Two groups:
//  1. fact-detection — onGitHub/populated/ghAdmin against REAL throwaway git repos (git-only, offline,
//     deterministic — no gh, no network, mirroring imm-signals.test.ts's a6/a8 pattern); ghAdmin is
//     exercised with a STUBBED `gh` proc (mirroring imm-signals.test.ts's a13 pattern) since a real `gh`
//     probe needs network + auth this test suite must not depend on.
//  2. the validate-a-pre-pick paths — the clobber blocker (the spec's own acceptance case) and an OK
//     pre-pick — against a small fixture profile catalog (same shape as packages/core/src/recommend.test.ts's
//     fixtureCatalog, kept independent so this suite is meaningful even if that catalog changes shape).
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { ProfileFacts, RepoFacts } from '@open-autonomy/core';
import { detectRepoFacts, formatValidation, parseArgs, run, validatePrePick, type ProcFn } from './recommend-profile';

function git(dir: string, args: string[]): void {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${dir}: ${r.stderr}`);
}

function initRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'test']);
}

function commitAll(dir: string, message: string): void {
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', message]);
}

let tmpRoot: string;
beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'oa-recommend-cli-'));
});
afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------------------------------
// Part 1 — fact detection
// ---------------------------------------------------------------------------------------------------

describe('detectRepoFacts — onGitHub', () => {
  test('no .git directory at all -> onGitHub=false', () => {
    const dir = join(tmpRoot, 'no-git');
    mkdirSync(dir, { recursive: true });
    const { repoFacts, notes } = detectRepoFacts(dir);
    expect(repoFacts.onGitHub).toBe(false);
    expect(notes.join(' ')).toMatch(/no \.git directory/);
  });

  test('git repo with no remotes -> onGitHub=false', () => {
    const dir = join(tmpRoot, 'git-no-remote');
    initRepo(dir);
    const { repoFacts, notes } = detectRepoFacts(dir);
    expect(repoFacts.onGitHub).toBe(false);
    expect(notes.join(' ')).toMatch(/no remotes configured/);
  });

  test('git repo with a non-github remote -> onGitHub=false', () => {
    const dir = join(tmpRoot, 'git-gitlab-remote');
    initRepo(dir);
    git(dir, ['remote', 'add', 'origin', 'https://gitlab.com/example/example.git']);
    const { repoFacts } = detectRepoFacts(dir);
    expect(repoFacts.onGitHub).toBe(false);
  });

  test('git repo with a github.com remote -> onGitHub=true', () => {
    const dir = join(tmpRoot, 'git-github-remote');
    initRepo(dir);
    git(dir, ['remote', 'add', 'origin', 'https://github.com/example-org/example-repo.git']);
    // stub gh so this test stays offline — onGitHub detection itself never calls gh, but detectRepoFacts
    // will attempt a ghAdmin probe once onGitHub=true, so supply a stub that fails cleanly (unauth-like).
    const stubProc: ProcFn = () => ({ status: 1, stdout: '', stderr: 'gh: not authenticated' });
    const { repoFacts } = detectRepoFacts(dir, {}, stubProc);
    expect(repoFacts.onGitHub).toBe(true);
  });
});

describe('detectRepoFacts — populated', () => {
  test('fresh git-init with nothing committed -> populated=false', () => {
    const dir = join(tmpRoot, 'empty-git');
    initRepo(dir);
    const { repoFacts, notes } = detectRepoFacts(dir);
    expect(repoFacts.populated).toBe(false);
    expect(notes.join(' ')).toMatch(/0 tracked file/);
  });

  test('only scaffold files tracked (README/package.json) -> populated=false', () => {
    const dir = join(tmpRoot, 'scaffold-only');
    initRepo(dir);
    writeFileSync(join(dir, 'README.md'), '# scaffold\n');
    writeFileSync(join(dir, 'package.json'), '{}\n');
    commitAll(dir, 'scaffold only');
    const { repoFacts } = detectRepoFacts(dir);
    expect(repoFacts.populated).toBe(false);
  });

  test('real content beyond the scaffold set tracked -> populated=true', () => {
    const dir = join(tmpRoot, 'real-content');
    initRepo(dir);
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'index.js'), "console.log('hi')\n");
    writeFileSync(join(dir, 'README.md'), '# real project\n');
    commitAll(dir, 'real project content');
    const { repoFacts, notes } = detectRepoFacts(dir);
    expect(repoFacts.populated).toBe(true);
    expect(notes.join(' ')).toMatch(/1 beyond the scaffold set/);
  });

  test('directory that was never git-init-ed falls back to a directory listing', () => {
    const dir = join(tmpRoot, 'plain-dir');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'notes.txt'), 'stuff\n');
    const { repoFacts, notes } = detectRepoFacts(dir);
    expect(repoFacts.populated).toBe(true);
    expect(notes.join(' ')).toMatch(/fell back to a top-level directory listing/);
  });
});

describe('detectRepoFacts — ghAdmin (stubbed gh, never real network)', () => {
  function repoWithGithubRemote(name: string): string {
    const dir = join(tmpRoot, name);
    initRepo(dir);
    git(dir, ['remote', 'add', 'origin', 'https://github.com/example-org/example-repo.git']);
    return dir;
  }

  test('gh api repos/<r> --jq .permissions.admin -> "true" is a confirmed admin', () => {
    const dir = repoWithGithubRemote('gh-admin-true');
    const stub: ProcFn = (cmd, args) => {
      if (cmd === 'gh' && args[0] === 'repo' && args[1] === 'view') return { status: 0, stdout: 'example-org/example-repo\n', stderr: '' };
      if (cmd === 'gh' && args[0] === 'api') return { status: 0, stdout: 'true\n', stderr: '' };
      return { status: 1, stdout: '', stderr: 'unexpected call' };
    };
    const { repoFacts, notes } = detectRepoFacts(dir, {}, stub);
    expect(repoFacts.ghAdmin).toBe(true);
    expect(notes.join(' ')).toMatch(/confirmed admin/);
  });

  test('gh api repos/<r> --jq .permissions.admin -> "false" (clean exit 0) is a CONFIRMED negative, not "unknown"', () => {
    const dir = repoWithGithubRemote('gh-admin-false');
    const stub: ProcFn = (cmd, args) => {
      if (cmd === 'gh' && args[0] === 'repo' && args[1] === 'view') return { status: 0, stdout: 'example-org/example-repo\n', stderr: '' };
      if (cmd === 'gh' && args[0] === 'api') return { status: 0, stdout: 'false\n', stderr: '' };
      return { status: 1, stdout: '', stderr: 'unexpected call' };
    };
    const { repoFacts, notes } = detectRepoFacts(dir, {}, stub);
    expect(repoFacts.ghAdmin).toBe(false);
    expect(notes.join(' ')).toMatch(/CONFIRMED negative|confirmed negative/i);
  });

  test('gh not authenticated (non-zero exit) -> ghAdmin=undefined ("unknown"), never a false-negative', () => {
    const dir = repoWithGithubRemote('gh-unauth');
    const stub: ProcFn = () => ({ status: 1, stdout: '', stderr: 'gh: To use GitHub CLI in a non-interactive environment, set GH_TOKEN' });
    const { repoFacts, notes } = detectRepoFacts(dir, {}, stub);
    expect(repoFacts.ghAdmin).toBeUndefined();
    expect(notes.join(' ')).toMatch(/ghAdmin=unknown/);
  });

  test('gh api succeeds but returns an unparseable value -> ghAdmin=undefined, not false', () => {
    const dir = repoWithGithubRemote('gh-weird-output');
    const stub: ProcFn = (cmd, args) => {
      if (cmd === 'gh' && args[0] === 'repo' && args[1] === 'view') return { status: 0, stdout: 'example-org/example-repo\n', stderr: '' };
      if (cmd === 'gh' && args[0] === 'api') return { status: 0, stdout: '\n', stderr: '' }; // empty/null-like
      return { status: 1, stdout: '', stderr: 'unexpected call' };
    };
    const { repoFacts, notes } = detectRepoFacts(dir, {}, stub);
    expect(repoFacts.ghAdmin).toBeUndefined();
    expect(notes.join(' ')).toMatch(/unparseable/);
  });

  test('repo not on GitHub -> ghAdmin is not-applicable, no gh probe attempted', () => {
    const dir = join(tmpRoot, 'no-github');
    initRepo(dir);
    let called = false;
    const stub: ProcFn = () => {
      called = true;
      return { status: 0, stdout: 'true\n', stderr: '' };
    };
    const { repoFacts, notes } = detectRepoFacts(dir, {}, stub);
    expect(repoFacts.ghAdmin).toBeUndefined();
    expect(called).toBe(false);
    expect(notes.join(' ')).toMatch(/not-applicable/);
  });
});

describe('detectRepoFacts — canFundProxy (never mechanically detected)', () => {
  test('no override -> undefined, with an explanatory note', () => {
    const dir = join(tmpRoot, 'proxy-unset');
    mkdirSync(dir, { recursive: true });
    const { repoFacts, notes } = detectRepoFacts(dir);
    expect(repoFacts.canFundProxy).toBeUndefined();
    expect(notes.join(' ')).toMatch(/NOT mechanically detectable/);
  });

  test('operator-declared true is carried through untouched', () => {
    const dir = join(tmpRoot, 'proxy-true');
    mkdirSync(dir, { recursive: true });
    const { repoFacts } = detectRepoFacts(dir, { canFundProxy: true });
    expect(repoFacts.canFundProxy).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------
// Part 2 — validate-a-pre-pick (the clobber blocker + an OK pre-pick), against a small fixture catalog
// ---------------------------------------------------------------------------------------------------

function fixtureCatalog(): ProfileFacts[] {
  return [
    { name: 'simple-sdlc', targets: ['local'], codeHost: 'local-git', hasProvisionJson: false, isWholeRepoScaffold: false, hasProxyHost: false },
    { name: 'simple-gh', targets: ['local'], codeHost: 'github', hasProvisionJson: true, isWholeRepoScaffold: false, hasProxyHost: false },
    { name: 'simple-gh-sdlc', targets: ['gh-actions', 'local'], codeHost: 'github', hasProvisionJson: true, isWholeRepoScaffold: false, hasProxyHost: false },
    { name: 'self-driving', targets: ['gh-actions', 'local'], codeHost: 'github', hasProvisionJson: true, isWholeRepoScaffold: true, hasProxyHost: true },
  ];
}

function baseRepoFacts(over: Partial<RepoFacts> = {}): RepoFacts {
  return { onGitHub: true, populated: true, ...over };
}

describe('validatePrePick — the clobber blocker (spec acceptance case)', () => {
  test('populated repo + pre-picked self-driving -> BLOCKED, citing the real clobber-guard line range', () => {
    const result = validatePrePick('self-driving', undefined, baseRepoFacts({ populated: true }), fixtureCatalog());
    expect(result.ok).toBe(false);
    expect(result.blocker).toBeDefined();
    expect(result.blocker).toMatch(/whole-repo scaffold/);
    expect(result.blocker).toMatch(/bin\/autonomy-compile\.ts:233-257/);
    expect(result.blocker).toMatch(/new-repo-only/);
    // the actionable alternative — the ordinary recommender's pick for this same repoFacts.
    expect(result.blocker).toMatch(/pick simple-gh-sdlc/);
  });

  test('the formatted output surfaces BLOCKED and the citation for a human/agent to read directly', () => {
    const repoFacts = baseRepoFacts({ populated: true });
    const result = validatePrePick('self-driving', undefined, repoFacts, fixtureCatalog());
    const { notes } = { notes: [] as string[] }; // detection notes not needed for this assertion
    const text = formatValidation(result, { repoFacts, notes });
    expect(text).toMatch(/^BLOCKED: "self-driving"/);
    expect(text).toMatch(/bin\/autonomy-compile\.ts:233-257/);
  });

  test('empty/unpopulated repo + pre-picked self-driving -> OK (no clobber risk)', () => {
    const result = validatePrePick('self-driving', undefined, baseRepoFacts({ populated: false, canFundProxy: true }), fixtureCatalog());
    expect(result.ok).toBe(true);
    expect(result.blocker).toBeUndefined();
  });
});

describe('validatePrePick — an OK pre-pick', () => {
  test('populated GitHub repo + pre-picked simple-gh-sdlc -> OK (additive profile, no scaffold risk)', () => {
    const result = validatePrePick('simple-gh-sdlc', undefined, baseRepoFacts({ populated: true }), fixtureCatalog());
    expect(result.ok).toBe(true);
    expect(result.blocker).toBeUndefined();
    expect(result.notes.join(' ')).toMatch(/is eligible/);
  });

  test('an explicit --substrate is honored over inference', () => {
    const result = validatePrePick('simple-gh-sdlc', 'gh-actions', baseRepoFacts({ populated: true }), fixtureCatalog());
    expect(result.ok).toBe(true);
    expect(result.substrate).toBe('gh-actions');
  });

  test('a substrate the profile does not target -> BLOCKED with the targets-mismatch reason', () => {
    const result = validatePrePick('simple-gh', 'gh-actions', baseRepoFacts({ populated: true }), fixtureCatalog());
    expect(result.ok).toBe(false);
    expect(result.blocker).toMatch(/does not support the "gh-actions" target/);
  });

  test('an unknown profile name -> BLOCKED with a not-found reason', () => {
    const result = validatePrePick('not-a-real-profile', 'local', baseRepoFacts(), fixtureCatalog());
    expect(result.ok).toBe(false);
    expect(result.blocker).toMatch(/was not found in the loaded catalog/);
  });
});

// ---------------------------------------------------------------------------------------------------
// Part 3 — CLI arg parsing + run() wiring (exit codes / json mode), against the REAL bundled profiles
// ---------------------------------------------------------------------------------------------------

describe('parseArgs', () => {
  test('parses the repoDir positional plus flags', () => {
    const opts = parseArgs(['/tmp/some-repo', '--json', '--pick', 'self-driving', '--substrate', 'gh-actions', '--hosted-runner', '--can-fund-proxy']);
    expect(opts.repoDir).toBe('/tmp/some-repo');
    expect(opts.json).toBe(true);
    expect(opts.pick).toBe('self-driving');
    expect(opts.substrate).toBe('gh-actions');
    expect(opts.hostedRunner).toBe(true);
    expect(opts.canFundProxy).toBe(true);
  });

  test('--cannot-fund-proxy sets canFundProxy=false (distinct from unset/undefined)', () => {
    const opts = parseArgs(['/tmp/x', '--cannot-fund-proxy']);
    expect(opts.canFundProxy).toBe(false);
  });
});

describe('run() — end-to-end against real fixture repos + the real bundled profiles catalog', () => {
  const realProfilesRoot = join(import.meta.dir, '..', 'profiles');

  test('no repoDir -> usage, not ok', () => {
    const result = run([], realProfilesRoot);
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/usage:/);
  });

  test('invalid --substrate -> error, not ok', () => {
    const dir = join(tmpRoot, 'bad-substrate');
    mkdirSync(dir, { recursive: true });
    const result = run([dir, '--substrate', 'nonsense'], realProfilesRoot);
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/--substrate must be/);
  });

  test('empty local repo, no pre-pick -> recommends simple-sdlc, ok=true', () => {
    const dir = join(tmpRoot, 'run-empty');
    initRepo(dir);
    const result = run([dir, '--json'], realProfilesRoot);
    expect(result.ok).toBe(true);
    const parsed = JSON.parse(result.output);
    expect(parsed.recommendation.profile).toBe('simple-sdlc');
    expect(parsed.recommendation.substrate).toBe('local');
  });

  test('populated repo + --pick self-driving -> blocked, ok=false, exit-worthy', () => {
    const dir = join(tmpRoot, 'run-populated-self-driving');
    initRepo(dir);
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'app.js'), 'module.exports = {}\n');
    commitAll(dir, 'real app content');
    const result = run([dir, '--pick', 'self-driving', '--json'], realProfilesRoot);
    expect(result.ok).toBe(false);
    const parsed = JSON.parse(result.output);
    expect(parsed.result.ok).toBe(false);
    expect(parsed.result.blocker).toMatch(/bin\/autonomy-compile\.ts:233-257/);
  });
});
