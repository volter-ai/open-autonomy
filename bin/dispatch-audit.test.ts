// Unit tests for TC.3's end-of-install dispatch hook wrapper (bin/dispatch-audit.ts). Exercised against a
// REAL compiled scratch install (via the real `bin/autonomy-compile.ts` CLI, mirroring
// bin/autonomy-compile.test.ts's own pattern) — never a hand-rolled fixture — so "resolves the report path
// correctly" is proven against genuine compiled output, not an assumption about its shape.
//
// STANDING RULE for this unit: no agent launches. Every test here runs in the default --dry-run mode (or
// asserts on `dispatchAudit({ live: false, ... })` directly) — --live's spawn path is implemented (for
// TE.5's eventual real use) but deliberately never exercised by this suite.
import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildInvocation, dispatchAudit, parseArgs, validateRoot } from './dispatch-audit.ts';

const REPO_ROOT = join(import.meta.dir, '..');

function compile(profile: string, substrate: string, outDir: string): { exitCode: number; stdout: string; stderr: string } {
  const r = Bun.spawnSync(['bun', join(REPO_ROOT, 'bin', 'autonomy-compile.ts'), profile, substrate, outDir], {
    cwd: REPO_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return { exitCode: r.exitCode, stdout: r.stdout.toString('utf8'), stderr: r.stderr.toString('utf8') };
}

function tmpDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

describe('buildInvocation — the TC.2-documented paused-safe primitive, unchanged', () => {
  test('setup mode', () => {
    const { command, env } = buildInvocation('setup');
    expect(command).toBe('node scripts/run-agent.mjs');
    expect(env).toEqual({ MODE: 'setup', AUTONOMY_FORWARD: 'MODE', AUTONOMY_AGENT: 'audit' });
  });
  test('drift mode', () => {
    expect(buildInvocation('drift').env.MODE).toBe('drift');
  });
});

describe('validateRoot — named, fail-fast reasons (never a bare crash downstream)', () => {
  test('a nonexistent root', () => {
    const problems = validateRoot(join(tmpdir(), 'oa-dispatch-audit-does-not-exist-xyz'));
    expect(problems.some((p) => p.includes('does not exist'))).toBe(true);
  });

  test('an empty directory (not a compiled install at all)', () => {
    const dir = tmpDir('oa-dispatch-audit-empty-');
    try {
      const problems = validateRoot(dir);
      expect(problems.some((p) => p.includes('.open-autonomy/autonomy.yml'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a REAL compiled install that carries no audit actor (hello has none) is named as such', () => {
    const dir = tmpDir('oa-dispatch-audit-hello-');
    try {
      const out = compile('hello', 'local', dir);
      expect(out.exitCode).toBe(0);
      const problems = validateRoot(dir);
      expect(problems.some((p) => p.includes("declares no 'audit' actor"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a REAL compiled install WITH an audit actor (simple-sdlc) validates clean', () => {
    const dir = tmpDir('oa-dispatch-audit-simple-sdlc-');
    try {
      const out = compile('simple-sdlc', 'local', dir);
      expect(out.exitCode).toBe(0);
      expect(validateRoot(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('dispatchAudit — dry-run mode (the only mode this unit ever exercises live)', () => {
  test('resolves the deterministic setup-mode report path against a real compiled scratch install', () => {
    const dir = tmpDir('oa-dispatch-audit-scratch-');
    try {
      const out = compile('simple-gh-sdlc', 'local', dir);
      expect(out.exitCode).toBe(0);
      const result = dispatchAudit({ root: dir, mode: 'setup', live: false, today: '2026-07-11' });
      expect(result.ok).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.launched).toBe(false); // NO agent launched, per standing rule
      expect(result.expectedReportPath).toBe(join('docs', 'audits', 'oa-audit-setup-2026-07-11.md'));
      expect(result.command).toBe('MODE=setup AUTONOMY_FORWARD=MODE AUTONOMY_AGENT=audit node scripts/run-agent.mjs');
      expect(result.existingReportForToday).toBe(false);
      expect(result.priorReports).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('resolves the deterministic DRIFT-mode report path (distinct filename from setup mode)', () => {
    const dir = tmpDir('oa-dispatch-audit-drift-');
    try {
      compile('simple-gh', 'local', dir);
      const result = dispatchAudit({ root: dir, mode: 'drift', live: false, today: '2026-07-11' });
      expect(result.expectedReportPath).toBe(join('docs', 'audits', 'oa-audit-2026-07-11.md'));
      expect(result.command).toContain('MODE=drift');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('detects an already-existing report for today (idempotency signal) without launching anything', () => {
    const dir = tmpDir('oa-dispatch-audit-existing-');
    try {
      compile('self-driving', 'local', dir);
      mkdirSync(join(dir, 'docs', 'audits'), { recursive: true });
      writeFileSync(join(dir, 'docs', 'audits', 'oa-audit-setup-2026-07-11.md'), '# stub report\n');
      const result = dispatchAudit({ root: dir, mode: 'setup', live: false, today: '2026-07-11' });
      expect(result.existingReportForToday).toBe(true);
      expect(result.priorReports).toEqual(['oa-audit-setup-2026-07-11.md']);
      expect(result.notes.some((n) => n.includes('already exists'))).toBe(true);
      expect(result.launched).toBe(false); // still dry-run: detecting an existing report never launches
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a DRIFT-mode dispatch never mistakes an existing SETUP report for "already ran today"', () => {
    const dir = tmpDir('oa-dispatch-audit-cross-mode-');
    try {
      compile('simple-sdlc', 'local', dir);
      mkdirSync(join(dir, 'docs', 'audits'), { recursive: true });
      writeFileSync(join(dir, 'docs', 'audits', 'oa-audit-setup-2026-07-11.md'), '# a setup report, not a drift one\n');
      const result = dispatchAudit({ root: dir, mode: 'drift', live: false, today: '2026-07-11' });
      expect(result.existingReportForToday).toBe(false);
      expect(result.priorReports).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('validation failure surfaces as ok:false with the named problem, still dry-run (never launches)', () => {
    const dir = tmpDir('oa-dispatch-audit-invalid-');
    try {
      const result = dispatchAudit({ root: dir, mode: 'setup', live: false });
      expect(result.ok).toBe(false);
      expect(result.launched).toBe(false);
      expect(result.notes.some((n) => n.includes('.open-autonomy/autonomy.yml'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('parseArgs', () => {
  test('defaults to setup mode, dry-run, non-json', () => {
    const opts = parseArgs(['/some/root']);
    expect(opts).toEqual({ root: '/some/root', mode: 'setup', live: false, json: false });
  });
  test('--mode drift --live --json', () => {
    const opts = parseArgs(['/r', '--mode', 'drift', '--live', '--json']);
    expect(opts.mode).toBe('drift');
    expect(opts.live).toBe(true);
    expect(opts.json).toBe(true);
  });
  test('--dry-run explicitly overrides a preceding --live', () => {
    const opts = parseArgs(['/r', '--live', '--dry-run']);
    expect(opts.live).toBe(false);
  });
});

describe('the CLI itself, invoked as a real process — still dry-run only (no agent launch)', () => {
  test('no root arg -> usage + exit 1', () => {
    const r = Bun.spawnSync(['bun', join(REPO_ROOT, 'bin', 'dispatch-audit.ts')], { cwd: REPO_ROOT, stdout: 'pipe', stderr: 'pipe' });
    expect(r.exitCode).toBe(1);
    expect(r.stdout.toString('utf8')).toContain('usage:');
  });

  test('a bad --mode value -> exit 1, never silently falls back', () => {
    const r = Bun.spawnSync(['bun', join(REPO_ROOT, 'bin', 'dispatch-audit.ts'), '/tmp', '--mode', 'bogus'], {
      cwd: REPO_ROOT,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(r.exitCode).toBe(1);
    expect(r.stderr.toString('utf8')).toContain("must be 'setup' or 'drift'");
  });

  test('--json against a real compiled scratch install prints a machine-parseable dry-run result', () => {
    const dir = tmpDir('oa-dispatch-audit-cli-');
    try {
      const out = compile('simple-gh-sdlc', 'local', dir);
      expect(out.exitCode).toBe(0);
      const r = Bun.spawnSync(['bun', join(REPO_ROOT, 'bin', 'dispatch-audit.ts'), dir, '--mode', 'setup', '--json'], {
        cwd: REPO_ROOT,
        stdout: 'pipe',
        stderr: 'pipe',
      });
      expect(r.exitCode).toBe(0);
      const parsed = JSON.parse(r.stdout.toString('utf8'));
      expect(parsed.dryRun).toBe(true);
      expect(parsed.launched).toBe(false);
      expect(parsed.expectedReportPath).toContain('oa-audit-setup-');
      expect(existsSync(join(dir, 'docs', 'audits'))).toBe(false); // nothing was written by the dry run
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
