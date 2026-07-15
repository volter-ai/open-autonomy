// End-to-end: spawn the REAL compiled `oa` executable as a real `node` child process — proves the
// package artifact is consumable even by a Node build without TypeScript stripping, and exercises argv wiring `runCli` alone can't catch (process.exit
// codes, --help formatting, unknown-command handling).
import { beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'oa.js');

beforeAll(() => {
  const built = spawnSync('bun', ['scripts/build-local-runner-cli.ts'], { cwd: ROOT, encoding: 'utf8' });
  if (built.status !== 0) throw new Error(`local CLI build failed:\n${built.stdout}\n${built.stderr}`);
});

function tmpRepo(schedule: object): string {
  const dir = mkdtempSync(join(tmpdir(), 'oa-cli-'));
  mkdirSync(join(dir, 'scheduler'), { recursive: true });
  writeFileSync(join(dir, 'scheduler', 'schedule.json'), JSON.stringify(schedule));
  return dir;
}

describe('oa (real node subprocess)', () => {
  test('--help prints the verb table and exits 0', () => {
    const r = spawnSync('node', [BIN, '--help'], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('oa start');
    expect(r.stdout).toContain('oa once');
    expect(r.stdout).toContain('oa pause');
    expect(r.stdout).toContain('oa resume');
    expect(r.stdout).toContain('oa status');
    expect(r.stdout).toContain('oa dispatch');
    expect(r.stdout).toContain('oa doctor');
  });

  test('an unknown command exits nonzero and names itself', () => {
    const r = spawnSync('node', [BIN, 'bogus'], { encoding: 'utf8' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('unknown command "bogus"');
  });

  test('pause then resume round-trips the real marker file on disk', () => {
    const dir = tmpRepo({ intervalSeconds: 900, scripts: ['bun scripts/sweep.ts'] });
    try {
      const p1 = spawnSync('node', [BIN, 'pause', 'cli e2e test'], { cwd: dir, encoding: 'utf8' });
      expect(p1.status).toBe(0);
      const st1 = spawnSync('node', [BIN, 'status'], { cwd: dir, encoding: 'utf8' });
      expect(st1.stdout).toContain('PAUSED');

      const p2 = spawnSync('node', [BIN, 'resume'], { cwd: dir, encoding: 'utf8' });
      expect(p2.status).toBe(0);
      const st2 = spawnSync('node', [BIN, 'status'], { cwd: dir, encoding: 'utf8' });
      expect(st2.stdout).toContain('unpaused');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('--once while paused exits nonzero naming PAUSED (argv-compatible with the legacy scheduler/run.mjs --once contract)', () => {
    const dir = tmpRepo({ intervalSeconds: 900, scripts: ['bun scripts/sweep.ts'] });
    try {
      spawnSync('node', [BIN, 'pause'], { cwd: dir, encoding: 'utf8' });
      const r = spawnSync('node', [BIN, '--once'], { cwd: dir, encoding: 'utf8' });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('PAUSED');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('once (unpaused, script-only schedule) actually runs the scheduled command', () => {
    const dir = tmpRepo({ intervalSeconds: 900, scripts: [`node -e "require('fs').writeFileSync('ran.txt','yes')"`] });
    try {
      const r = spawnSync('node', [BIN, 'once'], { cwd: dir, encoding: 'utf8' });
      expect(r.status).toBe(0);
      const ranPath = join(dir, 'ran.txt');
      expect(Bun.file(ranPath).size).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('doctor on a script-only schedule passes and prints OK lines', () => {
    const dir = tmpRepo({ intervalSeconds: 900, scripts: ['bun scripts/sweep.ts'] });
    try {
      const r = spawnSync('node', [BIN, 'doctor'], { cwd: dir, encoding: 'utf8' });
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('all checks passed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('doctor --json emits parseable JSON', () => {
    const dir = tmpRepo({ intervalSeconds: 900, scripts: ['bun scripts/sweep.ts'] });
    try {
      const r = spawnSync('node', [BIN, 'doctor', '--json'], { cwd: dir, encoding: 'utf8' });
      expect(r.status).toBe(0);
      const parsed = JSON.parse(r.stdout);
      expect(parsed.ok).toBe(true);
      expect(Array.isArray(parsed.checks)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('dispatch with no agent name fails with a usage message', () => {
    const dir = tmpRepo({ intervalSeconds: 900, scripts: ['bun scripts/sweep.ts'] });
    try {
      const r = spawnSync('node', [BIN, 'dispatch'], { cwd: dir, encoding: 'utf8' });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('requires an agent name');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
