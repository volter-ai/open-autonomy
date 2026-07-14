import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkDepIntegrity, checkTermfleetInstalled, checkUncommittedHarness, needsRunner } from './guards.ts';
import { defaultProc } from './proc.ts';

function tmpRepo(): string {
  return mkdtempSync(join(tmpdir(), 'oa-guards-'));
}

describe('needsRunner', () => {
  test('true when any command touches run-agent.mjs', () => {
    expect(needsRunner(['bun scripts/sweep.ts', 'AUTONOMY_AGENT=manager node scripts/run-agent.mjs'])).toBe(true);
  });
  test('true when isolation routes a scheduled launch through runner.ts', () => {
    expect(needsRunner(['AUTONOMY_SINGLETON=1 bun scripts/runner.ts launch planner --workspace isolated'])).toBe(true);
  });
  test('false for a script-only schedule', () => {
    expect(needsRunner(['bun scripts/sweep.ts', 'bun scripts/other.ts'])).toBe(false);
  });
});

describe('checkTermfleetInstalled', () => {
  test('fails naming the fix when node_modules/termfleet is absent', () => {
    const dir = tmpRepo();
    try {
      const r = checkTermfleetInstalled(dir);
      expect(r.ok).toBe(false);
      expect(r.message).toContain('npm install termfleet');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test('passes when node_modules/termfleet exists', () => {
    const dir = tmpRepo();
    try {
      mkdirSync(join(dir, 'node_modules', 'termfleet'), { recursive: true });
      expect(checkTermfleetInstalled(dir).ok).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// OA-04 dep-integrity — real subprocess (spawns a real `node` to resolve import.meta.resolve, exactly
// like the production probe does) against real files on disk, matching the house pattern the original
// run.mjs tests used (scheduler-termfleet-guard.test.ts). No termfleet/gh network calls are made — this
// probes LOCAL FILE resolution only.
describe('checkDepIntegrity (OA-04) — real node subprocess against scaffolded node_modules', () => {
  function installPkg(dir: string, name: string, exportsMap: Record<string, string>, files: Record<string, string>): void {
    const pkgDir = join(dir, 'node_modules', name);
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name, version: '0.0.0-test', type: 'module', exports: exportsMap }));
    for (const [rel, content] of Object.entries(files)) writeFileSync(join(pkgDir, rel), content);
  }

  test('ok when no runner deps are installed at all (nothing to collide with)', () => {
    const dir = tmpRepo();
    try {
      expect(checkDepIntegrity(dir, defaultProc).ok).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('ok when termfleet is installed cleanly (resolves inside node_modules/termfleet)', () => {
    const dir = tmpRepo();
    try {
      installPkg(dir, 'termfleet', { '.': './index.js' }, { 'index.js': 'export default 1;\n' });
      expect(checkDepIntegrity(dir, defaultProc).ok).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('COLLISION: a workspace member symlinked to escape node_modules is refused, naming the package', () => {
    const dir = tmpRepo();
    const externalTarget = mkdtempSync(join(tmpdir(), 'oa-guards-external-'));
    try {
      writeFileSync(join(externalTarget, 'package.json'), JSON.stringify({ name: 'termfleet', version: '0.0.0-dev', type: 'module', exports: { '.': './index.js' } }));
      writeFileSync(join(externalTarget, 'index.js'), 'export default 1;\n');
      mkdirSync(join(dir, 'node_modules'), { recursive: true });
      symlinkSync(externalTarget, join(dir, 'node_modules', 'termfleet'));
      const r = checkDepIntegrity(dir, defaultProc);
      expect(r.ok).toBe(false);
      expect(r.message).toContain('COLLISION');
      expect(r.message).toContain('termfleet');
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(externalTarget, { recursive: true, force: true });
    }
  });
});

describe('checkUncommittedHarness (OA-03)', () => {
  function gitRepo(dir: string): void {
    Bun.spawnSync(['git', 'init', '-q'], { cwd: dir });
    Bun.spawnSync(['git', 'config', 'user.email', 'test@test.dev'], { cwd: dir });
    Bun.spawnSync(['git', 'config', 'user.name', 'test'], { cwd: dir });
  }

  test('no generated.json manifest -> ok (nothing to check yet, e.g. before first compile)', () => {
    const dir = tmpRepo();
    try {
      gitRepo(dir);
      expect(checkUncommittedHarness(dir, defaultProc).ok).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a manifest file that is uncommitted (untracked, present on disk) fails, naming the fix', () => {
    const dir = tmpRepo();
    try {
      gitRepo(dir);
      mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
      writeFileSync(join(dir, '.open-autonomy', 'generated.json'), JSON.stringify({ files: ['scheduler/run.mjs'] }));
      mkdirSync(join(dir, 'scheduler'), { recursive: true });
      writeFileSync(join(dir, 'scheduler', 'run.mjs'), '// stub\n');
      const r = checkUncommittedHarness(dir, defaultProc);
      expect(r.ok).toBe(false);
      expect(r.message).toContain('git add');
      expect(r.message).toContain('scheduler/run.mjs');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a manifest file that IS committed passes', () => {
    const dir = tmpRepo();
    try {
      gitRepo(dir);
      mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
      writeFileSync(join(dir, '.open-autonomy', 'generated.json'), JSON.stringify({ files: ['scheduler/run.mjs'] }));
      mkdirSync(join(dir, 'scheduler'), { recursive: true });
      writeFileSync(join(dir, 'scheduler', 'run.mjs'), '// stub\n');
      Bun.spawnSync(['git', 'add', '-A'], { cwd: dir });
      Bun.spawnSync(['git', 'commit', '-q', '-m', 'init'], { cwd: dir });
      expect(checkUncommittedHarness(dir, defaultProc).ok).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('AUTONOMY_ALLOW_UNCOMMITTED_HARNESS=1 downgrades a failure to a loud warning that still passes', () => {
    const dir = tmpRepo();
    try {
      gitRepo(dir);
      mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
      writeFileSync(join(dir, '.open-autonomy', 'generated.json'), JSON.stringify({ files: ['scheduler/run.mjs'] }));
      mkdirSync(join(dir, 'scheduler'), { recursive: true });
      writeFileSync(join(dir, 'scheduler', 'run.mjs'), '// stub\n');
      const r = checkUncommittedHarness(dir, defaultProc, { ...process.env, AUTONOMY_ALLOW_UNCOMMITTED_HARNESS: '1' });
      expect(r.ok).toBe(true);
      expect(r.message).toContain('WARNING');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
