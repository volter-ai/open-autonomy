import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { installRoot } from './runner-frontend';

const tmps: string[] = [];
afterEach(() => {
  for (const dir of tmps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}

describe('installRoot — one control plane across linked worktrees', () => {
  test('a nested runner resolves state and fences to the primary checkout', () => {
    const root = mkdtempSync(join(tmpdir(), 'oa-control-root-'));
    tmps.push(root);
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'test@example.invalid');
    git(root, 'config', 'user.name', 'control-root-test');
    writeFileSync(join(root, 'tracked.txt'), 'root\n');
    git(root, 'add', 'tracked.txt');
    git(root, 'commit', '-q', '-m', 'root');
    const worktree = join(root, '.worktrees', 'nested');
    git(root, 'worktree', 'add', '-q', '-b', 'agent/nested', worktree, 'HEAD');
    expect(installRoot(worktree, {})).toBe(realpathSync(root));
  });

  test('an explicit control root is honored for non-git runners too', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'oa-control-root-env-'));
    tmps.push(cwd);
    expect(installRoot(cwd, { AUTONOMY_CONTROL_ROOT: '../control' })).toBe(resolve(cwd, '../control'));
  });
});
