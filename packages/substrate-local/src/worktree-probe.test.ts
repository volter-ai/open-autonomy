// OA-18's seam on top of OA-02: doctor's harness check (check 5) must prove a real worktree through the
// RUNNER'S OWN code path, never a doctor-side reimplementation of the base-ref decision (worktreeBase /
// ensureWorktree — see worktree-base.test.ts, which owns that decision's own truth table + integration
// proof). This file tests the NEW seam OA-18 adds on top: the exported `worktreeProbe` function and the
// `worktree-probe` CLI verb (runner-frontend.ts's runCli) that make ensureWorktree callable and
// base-reporting from OUTSIDE the runner — a small, behavior-neutral addition (it changes nothing about
// which base ensureWorktree picks; it only lets a caller ask "which one, and what SHA").
import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AutonomyIR } from '@open-autonomy/core';
import { compileLocal } from './emit';
import { worktreeProbe } from './runner-frontend';

const localGitIr: AutonomyIR = {
  schema: 'autonomy.ir.v1',
  targets: ['local'],
  codeHost: 'local-git',
  agents: {
    pm: { behavior: 'pm', capabilities: ['agent:launch'], triggers: [{ cron: '*/15 * * * *' }] },
  },
  policy: { box: {} },
  resources: [],
};

const tmps: string[] = [];
afterEach(() => {
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true });
});

function sh(cmd: string, args: string[], cwd: string) {
  return spawnSync(cmd, args, { cwd, encoding: 'utf8' });
}
function gitIn(cwd: string, ...args: string[]): string {
  const r = sh('git', args, cwd);
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
}

function scaffoldLocalGitRepo(): { dir: string; headSha: string } {
  const dir = mkdtempSync(join(tmpdir(), 'oa18-worktree-probe-'));
  tmps.push(dir);
  gitIn(dir, 'init', '-q', '-b', 'main');
  gitIn(dir, 'config', 'user.email', 'oa18-test@example.invalid');
  gitIn(dir, 'config', 'user.name', 'oa18-test');
  for (const [path, content] of Object.entries(compileLocal(localGitIr).generated)) {
    const full = join(dir, path);
    spawnSync('mkdir', ['-p', join(dir, path.split('/').slice(0, -1).join('/') || '.')]);
    writeFileSync(full, content);
  }
  rmSync(join(dir, '.open-autonomy', 'paused'), { force: true }); // OA-07's fence isn't this test's concern
  gitIn(dir, 'add', '-A');
  gitIn(dir, 'commit', '-q', '-m', 'install harness');
  const headSha = gitIn(dir, 'rev-parse', 'HEAD');
  return { dir, headSha };
}

describe('worktreeProbe (in-process export)', () => {
  test('creates a real worktree via ensureWorktree and reports the base + sha it chose', () => {
    const { dir, headSha } = scaffoldLocalGitRepo();
    const cwd = process.cwd();
    process.chdir(dir); // ensureWorktree/manifestCodeHost read '.open-autonomy/autonomy.yml' relative to cwd
    try {
      const branch = `oa-doctor/probe-${Date.now()}`;
      const result = worktreeProbe(branch);
      expect(result.branch).toBe(branch);
      expect(result.codeHost).toBe('local-git');
      expect(result.base).toBe('HEAD'); // local-git -> HEAD, never a reimplementation of OA-02's decision
      expect(result.sha).toBe(headSha);
      expect(existsSync(result.worktree)).toBe(true);
      // Cleanup mirrors what doctor itself does (never this function's own job).
      sh('git', ['worktree', 'remove', '--force', result.worktree], dir);
      sh('git', ['branch', '-D', branch], dir);
    } finally {
      process.chdir(cwd);
    }
  });

  test('idempotent: re-probing an EXISTING branch reports base "existing", never re-deriving one', () => {
    const { dir } = scaffoldLocalGitRepo();
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const branch = `oa-doctor/probe-${Date.now()}`;
      const first = worktreeProbe(branch);
      const second = worktreeProbe(branch);
      expect(second.worktree).toBe(first.worktree);
      expect(second.base).toBe('existing');
      sh('git', ['worktree', 'remove', '--force', first.worktree], dir);
      sh('git', ['branch', '-D', branch], dir);
    } finally {
      process.chdir(cwd);
    }
  });
});

describe('the `worktree-probe` CLI verb (scripts/runner.ts — runner-frontend.ts verbatim)', () => {
  test('bun scripts/runner.ts worktree-probe <branch> prints {branch,worktree,base,sha,codeHost} JSON on the last line', () => {
    const { dir, headSha } = scaffoldLocalGitRepo();
    const branch = `oa-doctor/probe-cli-${Date.now()}`;
    const r = sh('bun', ['scripts/runner.ts', 'worktree-probe', branch], dir);
    expect(r.status).toBe(0);
    const lastLine = r.stdout.trim().split('\n').filter(Boolean).pop()!;
    const parsed = JSON.parse(lastLine);
    expect(parsed.branch).toBe(branch);
    expect(parsed.base).toBe('HEAD');
    expect(parsed.sha).toBe(headSha);
    expect(existsSync(parsed.worktree)).toBe(true); // worktreePathFor resolves to an ABSOLUTE path already
    sh('git', ['worktree', 'remove', '--force', parsed.worktree], dir);
    sh('git', ['branch', '-D', branch], dir);
  });

  test('a git failure (e.g. the worktree PARENT path is blocked by a regular file) surfaces as a controlled exit 1, never a crash', () => {
    const { dir } = scaffoldLocalGitRepo();
    const branch = 'oa-doctor/probe-conflict';
    // `.worktrees` as a plain FILE (not a directory) makes `git worktree add` fail outright when it tries
    // to create the branch's subdirectory under it -- a real, reproducible git-level failure.
    writeFileSync(join(dir, '.worktrees'), 'not a directory\n');
    const r = sh('bun', ['scripts/runner.ts', 'worktree-probe', branch], dir);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('worktree-probe failed');
  });
});
