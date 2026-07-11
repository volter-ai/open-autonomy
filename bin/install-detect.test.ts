// TE.1 — unit tests for bin/install-detect.ts's fact-detectors.
//
// Convention (mirrors bin/doctor-checks.test.ts, this repo's own precedent for testing a side-effect-free
// bin/*.ts module by importing it directly): git-only detectors (`detectGitFacts`) always exercise the
// REAL `git` binary against real tmp fixtures — offline, deterministic, no auth needed. `gh`-dependent
// detectors (`detectGhFacts`/the admin probe) use the injectable `ProcFn` seam with a stub, per the task
// brief ("stubbed proc where external; REAL shapes for gh/node/tmux probes — run them first" — the real
// shapes this file's stubs mirror were captured live against volter-ai/open-autonomy before writing them,
// see bin/install-detect.ts's own header comment for the transcript). `checkAuth`/`checkEnv`/
// `checkProvider` themselves are already unit-tested in bin/doctor-checks.test.ts — this file only proves
// they are WIRED IN correctly (the report embeds their real CheckResult), not their own internals.
import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { materialize, parseIr } from '@open-autonomy/core';
import { compileLocal } from '@open-autonomy/substrate-local';
import {
  buildHumanGates,
  detect,
  detectExistingInstall,
  detectGhFacts,
  detectGitFacts,
  detectLanguageAndBuild,
  parseArgs,
  renderHuman,
  type ProcFn,
} from './install-detect.ts';
import type { CheckResult } from './doctor-checks.ts';

const REPO_ROOT = join(import.meta.dir, '..');
const SIMPLE_SDLC_DIR = join(REPO_ROOT, 'profiles', 'simple-sdlc');

function git(dir: string, args: string[]) {
  return spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
}
function gitInit(dir: string) {
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 'te1-test@example.com']);
  git(dir, ['config', 'user.name', 'TE1 test']);
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

// =========================================================================================================
// detectLanguageAndBuild
// =========================================================================================================
describe('detectLanguageAndBuild', () => {
  test('node project: package.json + bun.lock -> language node, packageManager bun', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'te1-lang-')));
    writeFileSync(join(dir, 'package.json'), '{"name":"x"}');
    writeFileSync(join(dir, 'bun.lock'), '');
    const r = detectLanguageAndBuild(dir);
    expect(r.hasPackageJson).toBe(true);
    expect(r.language).toBe('node');
    expect(r.packageManager).toBe('bun');
    expect(r.buildFiles).toContain('package.json');
    expect(r.buildFiles).toContain('bun.lock');
  });

  test('node project with package-lock.json -> packageManager npm', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'te1-lang-')));
    writeFileSync(join(dir, 'package.json'), '{}');
    writeFileSync(join(dir, 'package-lock.json'), '{}');
    const r = detectLanguageAndBuild(dir);
    expect(r.packageManager).toBe('npm');
  });

  test('go project: go.mod -> language go, no packageManager', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'te1-lang-')));
    writeFileSync(join(dir, 'go.mod'), 'module x\n');
    const r = detectLanguageAndBuild(dir);
    expect(r.hasPackageJson).toBe(false);
    expect(r.language).toBe('go');
    expect(r.packageManager).toBeUndefined();
  });

  test('empty dir -> language unknown, no build files, no crash', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'te1-lang-')));
    const r = detectLanguageAndBuild(dir);
    expect(r.language).toBe('unknown');
    expect(r.buildFiles).toEqual([]);
    expect(r.hasPackageJson).toBe(false);
  });
});

// =========================================================================================================
// detectGitFacts — REAL git, no stubbing (per task brief)
// =========================================================================================================
describe('detectGitFacts', () => {
  test('non-git dir -> isGitRepo=false, onGitHub=false, populated=false, no crash', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'te1-git-')));
    const r = detectGitFacts(dir);
    expect(r.isGitRepo).toBe(false);
    expect(r.onGitHub).toBe(false);
    expect(r.populated).toBe(false);
    expect(r.trackedFileCount).toBe(0);
  });

  test('git repo, no remote -> onGitHub=false', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'te1-git-')));
    gitInit(dir);
    writeFileSync(join(dir, 'a.txt'), 'x');
    commitAll(dir, 'init');
    const r = detectGitFacts(dir);
    expect(r.isGitRepo).toBe(true);
    expect(r.onGitHub).toBe(false);
    expect(r.populated).toBe(true); // a.txt is beyond the shell-file set
  });

  test('git repo + github remote + only shell files -> populated=false', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'te1-git-')));
    gitInit(dir);
    writeFileSync(join(dir, 'README.md'), '# x');
    writeFileSync(join(dir, 'package.json'), '{}');
    commitAll(dir, 'init');
    git(dir, ['remote', 'add', 'origin', 'https://github.com/acme/widget.git']);
    const r = detectGitFacts(dir);
    expect(r.onGitHub).toBe(true);
    expect(r.remoteUrl).toContain('github.com/acme/widget');
    expect(r.populated).toBe(false);
    expect(r.trackedFileCount).toBe(2);
  });

  test('git repo + github remote + real content -> populated=true', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'te1-git-')));
    gitInit(dir);
    writeFileSync(join(dir, 'README.md'), '# x');
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'index.js'), 'x');
    commitAll(dir, 'init');
    git(dir, ['remote', 'add', 'origin', 'git@github.com:acme/widget.git']);
    const r = detectGitFacts(dir);
    expect(r.onGitHub).toBe(true);
    expect(r.populated).toBe(true);
  });

  test('git repo + non-github remote -> onGitHub=false', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'te1-git-')));
    gitInit(dir);
    writeFileSync(join(dir, 'a.txt'), 'x');
    commitAll(dir, 'init');
    git(dir, ['remote', 'add', 'origin', 'https://gitlab.com/acme/widget.git']);
    const r = detectGitFacts(dir);
    expect(r.onGitHub).toBe(false);
  });

  test('never writes to the probed repo (git status clean before/after)', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'te1-git-')));
    gitInit(dir);
    writeFileSync(join(dir, 'a.txt'), 'x');
    commitAll(dir, 'init');
    detectGitFacts(dir);
    const status = git(dir, ['status', '--short']).stdout.trim();
    expect(status).toBe('');
  });
});

// =========================================================================================================
// detectGhFacts — stubbed ProcFn (real shapes captured live first — see install-detect.ts header)
// =========================================================================================================
describe('detectGhFacts', () => {
  function stub(handlers: Record<string, (args: string[]) => { status: number; stdout: string; stderr: string }>): ProcFn {
    return (cmd, args) => {
      const key = `${cmd} ${args[0] ?? ''}`.trim();
      const h = handlers[key];
      if (!h) return { status: 1, stdout: '', stderr: `unstubbed: ${cmd} ${args.join(' ')}` };
      return h(args);
    };
  }

  // detectGhFacts delegates the ghAdmin probe to TD.2's own `detectRepoFacts()` (bin/recommend-
  // profile.ts) — its onGitHub check ALWAYS runs the real `git` binary against the literal repoDir (per
  // that module's own "git-only detection always uses the real subprocess runner" doctrine, never
  // stubbable), independent of the `onGitHub` boolean this test passes into `detectGhFacts` itself. So any
  // test that needs the admin probe to actually fire must use a REAL git repo with a REAL github.com
  // remote — a bare string path like '/tmp/whatever' reads as onGitHub=false internally and short-
  // circuits the probe regardless of what's stubbed.
  function realGithubRepoDir(): string {
    const dir = track(mkdtempSync(join(tmpdir(), 'te1-ghadmin-')));
    gitInit(dir);
    writeFileSync(join(dir, 'a.txt'), 'x');
    commitAll(dir, 'init');
    git(dir, ['remote', 'add', 'origin', 'https://github.com/acme/widget.git']);
    return dir;
  }

  test('gh not installed -> gh-not-installed, no further probes', () => {
    const proc = stub({ 'gh --version': () => ({ status: 1, stdout: '', stderr: 'command not found' }) });
    const r = detectGhFacts('/tmp/whatever', true, proc);
    expect(r.ghInstalled).toBe(false);
    expect(r.authStatus).toBe('gh-not-installed');
  });

  test('gh installed, not authenticated', () => {
    const proc = stub({
      'gh --version': () => ({ status: 0, stdout: 'gh version 2.95.0', stderr: '' }),
      'gh auth': () => ({ status: 1, stdout: '', stderr: 'not logged in' }),
    });
    const r = detectGhFacts('/tmp/whatever', true, proc);
    expect(r.ghInstalled).toBe(true);
    expect(r.authStatus).toBe('not-authenticated');
    expect(r.admin).toBeUndefined();
  });

  test('authenticated, repo not on GitHub -> admin not-applicable, no admin probe attempted', () => {
    const proc = stub({
      'gh --version': () => ({ status: 0, stdout: 'gh version 2.95.0', stderr: '' }),
      'gh auth': () => ({ status: 0, stdout: 'github.com\n  Logged in', stderr: '' }),
      'gh api': () => ({ status: 0, stdout: 'otto', stderr: '' }),
    });
    const r = detectGhFacts('/tmp/whatever', false, proc);
    expect(r.authStatus).toBe('authenticated');
    expect(r.admin).toBeUndefined();
    expect(r.adminBasis).toContain('not-applicable');
  });

  test('authenticated + onGitHub, admin CONFIRMED true (live shape: repos/<x> --jq .permissions.admin -> "true")', () => {
    const proc = stub({
      'gh --version': () => ({ status: 0, stdout: 'gh version 2.95.0', stderr: '' }),
      'gh auth': () => ({ status: 0, stdout: 'github.com\n  Logged in', stderr: '' }),
      'gh api': (args) => {
        if (args.includes('user')) return { status: 0, stdout: 'otto-runhuman', stderr: '' };
        if (args.some((a) => a.includes('.permissions.admin'))) return { status: 0, stdout: 'true', stderr: '' };
        return { status: 1, stdout: '', stderr: 'unstubbed gh api' };
      },
      'gh repo': (args) => {
        if (args.includes('view') && args.includes('nameWithOwner')) return { status: 0, stdout: 'acme/widget', stderr: '' };
        if (args.includes('visibility')) return { status: 0, stdout: 'PRIVATE', stderr: '' };
        return { status: 1, stdout: '', stderr: 'unstubbed gh repo' };
      },
    });
    const r = detectGhFacts(realGithubRepoDir(), true, proc);
    expect(r.admin).toBe(true);
    expect(r.visibility).toBe('PRIVATE');
  });

  test('authenticated + onGitHub, admin CONFIRMED false (live shape: exit 0, "false", NOT a 404) — never coerced to unknown', () => {
    const proc = stub({
      'gh --version': () => ({ status: 0, stdout: 'gh version 2.95.0', stderr: '' }),
      'gh auth': () => ({ status: 0, stdout: 'github.com\n  Logged in', stderr: '' }),
      'gh api': (args) => {
        if (args.includes('user')) return { status: 0, stdout: 'otto-runhuman', stderr: '' };
        if (args.some((a) => a.includes('.permissions.admin'))) return { status: 0, stdout: 'false', stderr: '' };
        return { status: 1, stdout: '', stderr: 'unstubbed gh api' };
      },
      'gh repo': (args) => {
        if (args.includes('view') && args.includes('nameWithOwner')) return { status: 0, stdout: 'volter-ai/open-autonomy', stderr: '' };
        if (args.includes('visibility')) return { status: 0, stdout: 'PUBLIC', stderr: '' };
        return { status: 1, stdout: '', stderr: 'unstubbed gh repo' };
      },
    });
    const r = detectGhFacts(realGithubRepoDir(), true, proc);
    expect(r.admin).toBe(false); // a confirmed negative, per the STANDING RULE — not "unknown"
  });

  test('admin probe errors (e.g. 404) -> unknown, NEVER coerced to false (the STANDING RULE)', () => {
    const proc = stub({
      'gh --version': () => ({ status: 0, stdout: 'gh version 2.95.0', stderr: '' }),
      'gh auth': () => ({ status: 0, stdout: 'github.com\n  Logged in', stderr: '' }),
      'gh api': (args) => {
        if (args.includes('user')) return { status: 0, stdout: 'otto-runhuman', stderr: '' };
        if (args.some((a) => a.includes('.permissions.admin'))) return { status: 1, stdout: '', stderr: 'HTTP 404: Not Found' };
        return { status: 1, stdout: '', stderr: 'unstubbed gh api' };
      },
      'gh repo': (args) => {
        if (args.includes('view') && args.includes('nameWithOwner')) return { status: 0, stdout: 'acme/widget', stderr: '' };
        if (args.includes('visibility')) return { status: 1, stdout: '', stderr: 'boom' };
        return { status: 1, stdout: '', stderr: 'unstubbed gh repo' };
      },
    });
    const r = detectGhFacts(realGithubRepoDir(), true, proc);
    expect(r.admin).toBeUndefined();
    expect(r.adminBasis).toContain('unknown');
    expect(r.adminBasis).not.toContain('false');
  });

  test('admin probe returns unparseable output -> unknown', () => {
    const proc = stub({
      'gh --version': () => ({ status: 0, stdout: 'gh version 2.95.0', stderr: '' }),
      'gh auth': () => ({ status: 0, stdout: 'github.com\n  Logged in', stderr: '' }),
      'gh api': (args) => {
        if (args.includes('user')) return { status: 0, stdout: 'otto-runhuman', stderr: '' };
        if (args.some((a) => a.includes('.permissions.admin'))) return { status: 0, stdout: 'null', stderr: '' };
        return { status: 1, stdout: '', stderr: 'unstubbed gh api' };
      },
      'gh repo': (args) => {
        if (args.includes('view') && args.includes('nameWithOwner')) return { status: 0, stdout: 'acme/widget', stderr: '' };
        return { status: 1, stdout: '', stderr: 'boom' };
      },
    });
    const r = detectGhFacts(realGithubRepoDir(), true, proc);
    expect(r.admin).toBeUndefined();
  });
});

// =========================================================================================================
// detectExistingInstall
// =========================================================================================================
describe('detectExistingInstall', () => {
  test('no .open-autonomy/ -> reinstall=false, fresh-install note', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'te1-install-')));
    const r = detectExistingInstall(dir);
    expect(r.dirPresent).toBe(false);
    expect(r.reinstall).toBe(false);
  });

  test('.open-autonomy/ with generated.json -> manifestPresent, reinstall=true', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'te1-install-')));
    mkdirSync(join(dir, '.open-autonomy'));
    writeFileSync(join(dir, '.open-autonomy', 'generated.json'), JSON.stringify({ schema: 'open-autonomy.generated.v1', files: ['a', 'b', 'c'] }));
    const r = detectExistingInstall(dir);
    expect(r.dirPresent).toBe(true);
    expect(r.manifestPresent).toBe(true);
    expect(r.manifestFileCount).toBe(3);
    expect(r.reinstall).toBe(true);
  });

  test('.open-autonomy/ with only autonomy.yml (legacy, no manifest) -> still reinstall=true', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'te1-install-')));
    mkdirSync(join(dir, '.open-autonomy'));
    writeFileSync(join(dir, '.open-autonomy', 'autonomy.yml'), 'roster: {}\n');
    const r = detectExistingInstall(dir);
    expect(r.manifestPresent).toBe(false);
    expect(r.autonomyYmlPresent).toBe(true);
    expect(r.reinstall).toBe(true);
  });

  test('.open-autonomy/ with install.json (TB.2 record) -> installJsonPresent=true', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'te1-install-')));
    mkdirSync(join(dir, '.open-autonomy'));
    writeFileSync(join(dir, '.open-autonomy', 'install.json'), JSON.stringify({ stage: 'M4' }));
    const r = detectExistingInstall(dir);
    expect(r.installJsonPresent).toBe(true);
  });

  test('stale .open-autonomy/ dir with neither manifest nor config -> reinstall=false', () => {
    const dir = track(mkdtempSync(join(tmpdir(), 'te1-install-')));
    mkdirSync(join(dir, '.open-autonomy'));
    writeFileSync(join(dir, '.open-autonomy', 'random.txt'), 'leftover');
    const r = detectExistingInstall(dir);
    expect(r.dirPresent).toBe(true);
    expect(r.reinstall).toBe(false);
  });

  test('a REAL compiled install (compileLocal + materialize, simple-sdlc) is detected as a fresh install (no manifest read needed pre-write) then as a re-install once materialized', () => {
    const ir = parseIr(readFileSync(join(SIMPLE_SDLC_DIR, 'ir.yml'), 'utf8'));
    const out = compileLocal(ir);
    const dir = track(mkdtempSync(join(tmpdir(), 'te1-install-')));
    const before = detectExistingInstall(dir);
    expect(before.reinstall).toBe(false);
    materialize(out, dir, (from) => readFileSync(join(SIMPLE_SDLC_DIR, from), 'utf8'));
    const after = detectExistingInstall(dir);
    expect(after.reinstall).toBe(true);
    expect(after.manifestPresent).toBe(true);
    expect(after.pausedPresent).toBe(true); // fresh compiles start paused
  });
});

// =========================================================================================================
// buildHumanGates
// =========================================================================================================
describe('buildHumanGates', () => {
  const cli = (status: CheckResult['status'], detail = 'x'): CheckResult => ({ id: 'auth', status, detail, finding: ['F-13'] });
  const gh = (over: Partial<Parameters<typeof buildHumanGates>[0]> = {}) => ({
    ghInstalled: true,
    authStatus: 'authenticated' as const,
    adminBasis: 'basis',
    notes: [],
    ...over,
  });

  test('cli-sign-in: PASS -> clear, WARN -> unverifiable, FAIL -> blocked, SKIP -> blocked', () => {
    expect(buildHumanGates(gh(), true, cli('PASS')).find((g) => g.id === 'cli-sign-in')!.status).toBe('clear');
    expect(buildHumanGates(gh(), true, cli('WARN')).find((g) => g.id === 'cli-sign-in')!.status).toBe('unverifiable');
    expect(buildHumanGates(gh(), true, cli('FAIL')).find((g) => g.id === 'cli-sign-in')!.status).toBe('blocked');
    expect(buildHumanGates(gh(), true, cli('SKIP')).find((g) => g.id === 'cli-sign-in')!.status).toBe('blocked');
  });

  test('gh-admin: not on GitHub -> not-applicable', () => {
    const gate = buildHumanGates(gh(), false, cli('PASS')).find((g) => g.id === 'gh-admin')!;
    expect(gate.status).toBe('not-applicable');
  });

  test('gh-admin: not authenticated -> blocked', () => {
    const gate = buildHumanGates(gh({ authStatus: 'not-authenticated' }), true, cli('PASS')).find((g) => g.id === 'gh-admin')!;
    expect(gate.status).toBe('blocked');
  });

  test('gh-admin: admin=true -> clear', () => {
    const gate = buildHumanGates(gh({ admin: true }), true, cli('PASS')).find((g) => g.id === 'gh-admin')!;
    expect(gate.status).toBe('clear');
  });

  test('gh-admin: admin=false (confirmed negative) -> blocked, names the provisioning consequence', () => {
    const gate = buildHumanGates(gh({ admin: false }), true, cli('PASS')).find((g) => g.id === 'gh-admin')!;
    expect(gate.status).toBe('blocked');
    expect(gate.detail).toContain('provision-target-repo.ts:305');
  });

  test('gh-admin: admin=undefined (unknown) -> unverifiable, never assumed clear', () => {
    const gate = buildHumanGates(gh({ admin: undefined }), true, cli('PASS')).find((g) => g.id === 'gh-admin')!;
    expect(gate.status).toBe('unverifiable');
  });
});

// =========================================================================================================
// parseArgs / renderHuman
// =========================================================================================================
describe('parseArgs', () => {
  test('repoDir positional + --json', () => {
    expect(parseArgs(['/tmp/x', '--json'])).toEqual({ repoDir: '/tmp/x', json: true });
  });
  test('no args -> repoDir undefined', () => {
    expect(parseArgs([])).toEqual({ repoDir: undefined, json: false });
  });
});

describe('renderHuman', () => {
  test('surfaces both human gates near the top, never buried', () => {
    const report = {
      repoDir: '/tmp/x',
      build: { hasPackageJson: false, language: 'unknown', buildFiles: [], notes: [] },
      git: { isGitRepo: false, onGitHub: false, populated: false, trackedFileCount: 0, notes: [] },
      gh: { ghInstalled: false, authStatus: 'gh-not-installed' as const, adminBasis: 'x', notes: [] },
      existingInstall: { dirPresent: false, manifestPresent: false, manifestFileCount: 0, autonomyYmlPresent: false, installJsonPresent: false, roadmapYmlPresent: false, pausedPresent: false, reinstall: false, notes: [] },
      tools: {
        node: { version: '22.18.0', floor: '>=22.18', meetsFloor: true },
        git: { present: true, version: 'git 2.40' },
        tmux: { present: true, version: 'tmux 3.3' },
        bun: { present: true, version: '1.3.0' },
        ztrack: { vendored: false, global: false, note: 'n' },
        termfleet: { installed: false, reachable: 'not-running' as const, note: 'n' },
        codingCli: { id: 'auth', status: 'PASS', detail: 'signed in', finding: [] } as CheckResult,
        notes: [],
      },
      humanGates: [
        { id: 'cli-sign-in', name: 'Coding CLI sign-in', status: 'clear' as const, detail: 'ok' },
        { id: 'gh-admin', name: 'GitHub repo-admin', status: 'blocked' as const, detail: 'no admin' },
      ],
      doctorChecks: {
        env: { id: 'env', status: 'PASS', detail: 'ok', finding: [] } as CheckResult,
        auth: { id: 'auth', status: 'PASS', detail: 'ok', finding: [] } as CheckResult,
        provider: { id: 'provider', status: 'SKIP', detail: 'not installed', finding: [] } as CheckResult,
      },
    };
    const rendered = renderHuman(report as any);
    const gatesIdx = rendered.indexOf('HUMAN GATES');
    const repoIdx = rendered.indexOf('REPO:');
    expect(gatesIdx).toBeGreaterThanOrEqual(0);
    expect(gatesIdx).toBeLessThan(repoIdx);
    expect(rendered).toContain('cli-sign-in');
    expect(rendered).toContain('gh-admin');
    expect(rendered).toContain('[BLOCKED]');
  });
});

// =========================================================================================================
// detect() — end-to-end smoke against a REAL compiled install (real env, tolerant of ambient box state)
// =========================================================================================================
describe('detect (integration smoke)', () => {
  // Generous timeout (default bun:test budget is 5000ms): `detect()` embeds doctor's REAL `checkProvider`,
  // which races a live socket.io probe against a `withTimeout(..., 5000)` internally (bin/doctor-
  // checks.ts) — under load (this box's tmpfs/CPU is shared across concurrent sessions) a single `detect()`
  // call can legitimately approach that budget on its own, and this test calls it twice.
  test(
    'runs end-to-end against a real compiled simple-sdlc install without throwing, detects the reinstall',
    async () => {
      const ir = parseIr(readFileSync(join(SIMPLE_SDLC_DIR, 'ir.yml'), 'utf8'));
      const out = compileLocal(ir);
      const dir = track(mkdtempSync(join(tmpdir(), 'te1-e2e-')));
      materialize(out, dir, (from) => readFileSync(join(SIMPLE_SDLC_DIR, from), 'utf8'));
      const report = await detect(dir);
      expect(report.repoDir).toBe(dir);
      expect(report.existingInstall.reinstall).toBe(true);
      expect(report.humanGates.length).toBe(2);
      expect(report.humanGates.map((g) => g.id).sort()).toEqual(['cli-sign-in', 'gh-admin']);
      // read-only guarantee: detect() must never write into the probed dir.
      const before = JSON.stringify(readdirSync(dir).sort());
      await detect(dir);
      const after = JSON.stringify(readdirSync(dir).sort());
      expect(after).toBe(before);
    },
    30000,
  );

  test(
    'empty non-git dir -> no crash, honest empty report',
    async () => {
      const dir = track(mkdtempSync(join(tmpdir(), 'te1-e2e-empty-')));
      const report = await detect(dir);
      expect(report.git.isGitRepo).toBe(false);
      expect(report.git.onGitHub).toBe(false);
      expect(report.existingInstall.reinstall).toBe(false);
      expect(report.build.language).toBe('unknown');
    },
    15000,
  );
});

test('cleanup', () => {
  cleanupAll();
  expect(true).toBe(true);
});
