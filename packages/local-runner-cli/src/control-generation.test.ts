import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { acceptControlGeneration, controlGenerationPath, verifyControlGeneration, verifyControlPaths } from './control-generation.ts';
import { recoverEffect } from './effect-recovery.ts';
import { activateAcceptedGeneration, configureActivation, type ActivationOps } from './activation.ts';

function git(cwd: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function fixture(): { dir: string; remote: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'oa-control-generation-'));
  const remote = join(root, 'remote.git');
  const dir = join(root, 'repo');
  mkdirSync(dir);
  git(root, ['init', '--bare', '-q', remote]);
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 'control@example.invalid']);
  git(dir, ['config', 'user.name', 'control-test']);
  mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
  writeFileSync(join(dir, '.open-autonomy', 'autonomy.json'), JSON.stringify({ codeHost: 'github' }));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  writeFileSync(join(dir, 'scripts', 'runner.ts'), 'export const accepted = true;\n');
  writeFileSync(join(dir, 'README.md'), 'accepted\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'accepted generation']);
  git(dir, ['remote', 'add', 'origin', remote]);
  git(dir, ['push', '-q', '-u', 'origin', 'main']);
  git(remote, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
  git(dir, ['fetch', '-q', 'origin']);
  git(dir, ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main']);
  return { dir, remote, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

describe('accepted control generation', () => {
  test('records the exact accepted remote default-branch SHA and verifies it later', () => {
    const f = fixture();
    try {
      const generation = acceptControlGeneration(f.dir)!;
      expect(generation.sha).toBe(git(f.dir, ['rev-parse', 'HEAD']));
      expect(generation.defaultBranch).toBe('main');
      expect(JSON.parse(readFileSync(controlGenerationPath(f.dir), 'utf8')).sha).toBe(generation.sha);
      expect(verifyControlGeneration(f.dir, generation.sha).sha).toBe(generation.sha);
    } finally { f.cleanup(); }
  });

  test('fails closed after the accepted remote advances, retaining the old receipt for diagnosis', () => {
    const f = fixture();
    try {
      const accepted = acceptControlGeneration(f.dir)!;
      const other = join(dirname(f.dir), 'other');
      git(dirname(f.dir), ['clone', '-q', f.remote, other]);
      git(other, ['config', 'user.email', 'other@example.invalid']);
      git(other, ['config', 'user.name', 'other']);
      writeFileSync(join(other, 'next.txt'), 'next\n');
      git(other, ['add', '-A']);
      git(other, ['commit', '-q', '-m', 'next accepted generation']);
      git(other, ['push', '-q', 'origin', 'main']);
      expect(() => verifyControlGeneration(f.dir, accepted.sha)).toThrow('accepted remote generation changed');
      expect(JSON.parse(readFileSync(controlGenerationPath(f.dir), 'utf8')).sha).toBe(accepted.sha);
    } finally { f.cleanup(); }
  });

  test('a remote-advanced SHA remains valid only while the atomic activation record retains it for drain/rollback', async () => {
    const f = fixture();
    try {
      const accepted = acceptControlGeneration(f.dir)!;
      configureActivation({ profile: 'profiles/test', pollMs: 1000 }, { cwd: f.dir });
      const ops: ActivationOps = {
        async detectAccepted() { return { sha: accepted.sha, acceptedAt: new Date().toISOString() }; },
        async stage() { return f.dir; },
        async validate() {},
        async health() {},
      };
      await activateAcceptedGeneration({ cwd: f.dir, ops });
      const other = join(dirname(f.dir), 'retained-other');
      git(dirname(f.dir), ['clone', '-q', f.remote, other]);
      git(other, ['config', 'user.email', 'other@example.invalid']);
      git(other, ['config', 'user.name', 'other']);
      writeFileSync(join(other, 'next.txt'), 'next\n');
      git(other, ['add', '-A']);
      git(other, ['commit', '-q', '-m', 'next accepted generation']);
      git(other, ['push', '-q', 'origin', 'main']);
      expect(verifyControlGeneration(f.dir, accepted.sha).sha).toBe(accepted.sha);
    } finally { f.cleanup(); }
  });

  test('fails closed when authority-bearing working-copy bytes differ from the accepted SHA', () => {
    const f = fixture();
    try {
      const accepted = acceptControlGeneration(f.dir)!;
      verifyControlPaths(f.dir, accepted.sha, ['scripts/runner.ts']);
      writeFileSync(join(f.dir, 'scripts', 'runner.ts'), 'throw new Error("candidate control");\n');
      expect(() => verifyControlPaths(f.dir, accepted.sha, ['scripts/runner.ts'])).toThrow('changed outside review');
    } finally { f.cleanup(); }
  });

  test('a legacy effect is recovered only by explicit binding to the still-active SHA', () => {
    const f = fixture();
    try {
      const accepted = acceptControlGeneration(f.dir)!;
      const quarantine = join(f.dir, '.open-autonomy', 'runner-state', 'effect-quarantine');
      mkdirSync(quarantine, { recursive: true });
      const legacy = join(quarantine, 'legacy.json');
      writeFileSync(legacy, JSON.stringify({ id: 'legacy', agent: 'develop', effect: 'scripts/agent-propose.ts', worktree: '/candidate', env: {} }));
      const wrong = recoverEffect(legacy, 'b'.repeat(40), { cwd: f.dir });
      expect(wrong.ok).toBe(false);
      expect(existsSync(legacy)).toBe(true);
      const recovered = recoverEffect(legacy, accepted.sha, { cwd: f.dir });
      expect(recovered.ok).toBe(true);
      const marker = JSON.parse(readFileSync(recovered.path!, 'utf8'));
      expect(marker.schema).toBe('open-autonomy.effect-marker.v2');
      expect(marker.controlSha).toBe(accepted.sha);
      expect(marker.controlRoot).toBe(f.dir);
    } finally { f.cleanup(); }
  });
});
