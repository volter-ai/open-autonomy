// OA-07: a fresh local install lands PAUSED so an existing backlog is never dispatched before the
// operator reviews it. Three layers proven here, each against the REAL emitted artifact (not a hand test
// double), matching the house pattern (scheduler-termfleet-guard.test.ts / human-seam.test.ts):
//   A. compileLocal's seed-once marker semantics (fresh vs re-compile; never enters generated.json).
//   B. the emitted scheduler/run.mjs's pause gate, in BOTH --once and continuous mode (real subprocess).
//   C. the emitted scripts/runner.ts's launch() defense-in-depth refusal (real subprocess), and the
//      human-route exemption.
import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { AutonomyIR, CompileOutput } from '@open-autonomy/core';
import { compileLocal } from './emit';

// All IRs in this file are script-only with no resources, so `out.copies` is always empty — only
// `out.generated` needs materializing.
function materializeAll(dir: string, out: CompileOutput): void {
  for (const [path, content] of Object.entries(out.generated)) {
    mkdirSync(join(dir, dirname(path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
}

async function waitUntil(pred: () => boolean, timeoutMs: number, stepMs = 100): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error(`waitUntil: timed out after ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, stepMs));
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- A. compileLocal's marker semantics --------------------------------------------------------------

describe('compileLocal — the pause marker (seed-once)', () => {
  const scriptIr: AutonomyIR = {
    schema: 'autonomy.ir.v1',
    targets: ['local'],
    agents: { sweep: { behavior: 'scripts/sweep.ts', capabilities: ['tasks:converse'], triggers: [{ cron: '*/15 * * * *' }] } },
    policy: { box: {} },
    resources: [],
  };

  test('a fresh compile (no destDir given) emits a self-describing marker naming the reason and the exact unpause command', () => {
    const out = compileLocal(scriptIr);
    const marker = out.generated['.open-autonomy/paused'];
    expect(marker).toBeDefined();
    expect(marker).toContain('PAUSED');
    expect(marker).toContain('backlog');
    expect(marker).toContain('rm .open-autonomy/paused'); // the EXACT unpause command, verbatim
  });

  test('a fresh compile (destDir given, but no .open-autonomy/generated.json there yet) also seeds the marker', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa07-fresh-'));
    try {
      const out = compileLocal(scriptIr, { destDir: dir });
      expect(out.generated['.open-autonomy/paused']).toBeDefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('the marker is NEVER recorded in .open-autonomy/generated.json — prune can never treat it as an orphan', () => {
    const out = compileLocal(scriptIr);
    expect(out.generated['.open-autonomy/paused']).toBeDefined(); // it IS emitted...
    const manifest = JSON.parse(out.generated['.open-autonomy/generated.json']) as { files: string[] };
    expect(manifest.files).not.toContain('.open-autonomy/paused'); // ...but never LISTED as generated
  });

  test('a re-compile into an EXISTING install (destDir already has generated.json) never re-adds the marker', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa07-recompile-'));
    try {
      const first = compileLocal(scriptIr, { destDir: dir });
      materializeAll(dir, first);
      expect(existsSync(join(dir, '.open-autonomy', 'paused'))).toBe(true); // fresh install: seeded

      // Simulate the operator unpausing (the intended interaction):
      rmSync(join(dir, '.open-autonomy', 'paused'));

      // Re-compile against the SAME (now-installed) dir: freshInstall must be false (generated.json exists).
      const second = compileLocal(scriptIr, { destDir: dir });
      expect(second.generated['.open-autonomy/paused']).toBeUndefined(); // not in this compile's output at all
      materializeAll(dir, second); // a real re-compile only writes what's in `.generated`
      expect(existsSync(join(dir, '.open-autonomy', 'paused'))).toBe(false); // NOT resurrected
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('an unchanged custom fence stays removed, while a newly introduced fence is seeded once', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa07-custom-recompile-'));
    const custom = (fence: string) => ({
      schema: 'open-autonomy.local-schedule-config.v1' as const,
      defaults: { fence },
    });
    try {
      const first = compileLocal(scriptIr, { destDir: dir, scheduleConfig: custom('.open-autonomy/analysis-paused') });
      materializeAll(dir, first);
      rmSync(join(dir, '.open-autonomy', 'analysis-paused'));

      const unchanged = compileLocal(scriptIr, { destDir: dir, scheduleConfig: custom('.open-autonomy/analysis-paused') });
      expect(unchanged.generated['.open-autonomy/analysis-paused']).toBeUndefined();
      materializeAll(dir, unchanged);
      expect(existsSync(join(dir, '.open-autonomy', 'analysis-paused'))).toBe(false);

      const changed = compileLocal(scriptIr, { destDir: dir, scheduleConfig: custom('.open-autonomy/new-analysis-paused') });
      expect(changed.generated['.open-autonomy/new-analysis-paused']).toContain('rm .open-autonomy/new-analysis-paused');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// --- B. the emitted scheduler/run.mjs — the pause gate (real subprocess) ------------------------------

const cronScriptIr: AutonomyIR = {
  schema: 'autonomy.ir.v1',
  targets: ['local'],
  agents: { sweep: { behavior: 'scripts/sweep.ts', capabilities: ['tasks:converse'], triggers: [{ cron: '*/15 * * * *' }] } },
  policy: { box: {} },
  resources: [],
};

// A script-only schedule (see scheduler-termfleet-guard.test.ts) never touches the runner/termfleet, so
// this scaffold needs no node_modules at all — the gate itself is what's under test.
function scaffoldScheduler(opts: { paused: boolean; intervalSeconds?: number } = { paused: true }): { dir: string; sentinel: string } {
  const out = compileLocal(cronScriptIr);
  if (opts.intervalSeconds) {
    const schedule = JSON.parse(out.generated['scheduler/schedule.json']) as Record<string, unknown>;
    schedule.intervalSeconds = opts.intervalSeconds;
    out.generated['scheduler/schedule.json'] = `${JSON.stringify(schedule, null, 2)}\n`;
  }
  if (!opts.paused) delete out.generated['.open-autonomy/paused'];
  const dir = mkdtempSync(join(tmpdir(), 'oa07-scheduler-'));
  materializeAll(dir, out);
  const sentinel = join(dir, 'sentinel.log');
  writeFileSync(
    join(dir, 'scripts', 'sweep.ts'),
    `import { appendFileSync } from 'node:fs';\nappendFileSync(${JSON.stringify(sentinel)}, 'tick\\n');\n`,
  );
  return { dir, sentinel };
}

describe('the emitted scheduler/run.mjs — the pause gate (AC-1, AC-2, AC-3)', () => {
  test('--once while paused: exits nonzero, prints the PAUSED message naming the unpause command, fires NO tick', () => {
    const { dir, sentinel } = scaffoldScheduler({ paused: true });
    try {
      const marker = readFileSync(join(dir, '.open-autonomy', 'paused'), 'utf8');
      expect(marker).toContain('rm .open-autonomy/paused'); // AC-2: self-describing on disk

      const r = spawnSync('node', ['scheduler/run.mjs', '--once'], { cwd: dir, encoding: 'utf8' });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('PAUSED');
      expect(r.stderr).toContain('rm .open-autonomy/paused');
      expect(existsSync(sentinel)).toBe(false); // AC-1: no tick fired — the schedule's script never ran
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('unpause is one command and is durable across a re-compile', () => {
    const { dir, sentinel } = scaffoldScheduler({ paused: true });
    try {
      rmSync(join(dir, '.open-autonomy', 'paused')); // `rm .open-autonomy/paused`
      const r1 = spawnSync('node', ['scheduler/run.mjs', '--once'], { cwd: dir, encoding: 'utf8' });
      expect(r1.status).toBe(0);
      expect(existsSync(sentinel)).toBe(true); // the tick fired

      // Re-compile into the SAME (now-installed) dir — the marker must not resurrect (F-9-class regression guard).
      const recompiled = compileLocal(cronScriptIr, { destDir: dir });
      expect(recompiled.generated['.open-autonomy/paused']).toBeUndefined();
      materializeAll(dir, recompiled);
      expect(existsSync(join(dir, '.open-autonomy', 'paused'))).toBe(false);

      const r2 = spawnSync('node', ['scheduler/run.mjs', '--once'], { cwd: dir, encoding: 'utf8' });
      expect(r2.status).toBe(0); // still fires — not re-paused by the recompile
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('continuous mode: a marker created mid-run halts further ticks; PAUSED is logged at most once per state change (AC-5)', async () => {
    const { dir, sentinel } = scaffoldScheduler({ paused: false, intervalSeconds: 1 });
    // AUTONOMY_REAP_POLL_MS is floored at 1000ms by the driver itself; set it explicitly so the heartbeat
    // (default 20s — fine for production, far too slow for a test) checks the marker every ~1s instead.
    const proc = Bun.spawn(['node', 'scheduler/run.mjs'], {
      cwd: dir,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, AUTONOMY_REAP_POLL_MS: '300' },
    });
    try {
      await waitUntil(() => existsSync(sentinel), 5000); // the first (unpaused) tick fires
      const countAfterFirst = readFileSync(sentinel, 'utf8').split('\n').filter(Boolean).length;

      writeFileSync(join(dir, '.open-autonomy', 'paused'), 'test: touch .open-autonomy/paused mid-run\n');
      await sleep(3500); // >= 2x intervalSeconds(1s), generous slack for CI scheduling jitter

      const countAfterPause = readFileSync(sentinel, 'utf8').split('\n').filter(Boolean).length;
      expect(countAfterPause).toBe(countAfterFirst); // no further tick fired

      proc.kill();
      await proc.exited;
      const stderrText = await new Response(proc.stderr).text();
      const pausedLines = stderrText.split('\n').filter((l) => l.includes('PAUSED')).length;
      expect(pausedLines).toBe(1); // logged once for the ONE state change (unpaused -> paused)
    } finally {
      if (!proc.killed) proc.kill();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 15_000);

  test('independent job fences allow one group to run while another remains paused', () => {
    const ir: AutonomyIR = {
      schema: 'autonomy.ir.v1',
      targets: ['local'],
      agents: {
        execute: { behavior: 'scripts/execute.ts', capabilities: [], triggers: [{ cron: '*/15 * * * *' }] },
        analyze: { behavior: 'scripts/analyze.ts', capabilities: [], triggers: [{ cron: '*/15 * * * *' }] },
      },
      policy: { box: {} },
      resources: [],
    };
    const out = compileLocal(ir, {
      scheduleConfig: {
        schema: 'open-autonomy.local-schedule-config.v1',
        defaults: { fence: '.open-autonomy/paused' },
        agents: { analyze: { fence: '.open-autonomy/audits-paused' } },
      },
    });
    const dir = mkdtempSync(join(tmpdir(), 'oa07-independent-'));
    const executeSentinel = join(dir, 'execute.log');
    const analyzeSentinel = join(dir, 'analyze.log');
    try {
      materializeAll(dir, out);
      writeFileSync(join(dir, 'scripts', 'execute.ts'), `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(executeSentinel)}, 'ran\\n');\n`);
      writeFileSync(join(dir, 'scripts', 'analyze.ts'), `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(analyzeSentinel)}, 'ran\\n');\n`);

      expect(existsSync(join(dir, '.open-autonomy', 'paused'))).toBe(true);
      expect(existsSync(join(dir, '.open-autonomy', 'audits-paused'))).toBe(true);
      rmSync(join(dir, '.open-autonomy', 'audits-paused'));
      const analysisOnly = spawnSync('node', ['scheduler/run.mjs', '--once'], { cwd: dir, encoding: 'utf8' });
      expect(analysisOnly.status).toBe(0);
      expect(existsSync(analyzeSentinel)).toBe(true);
      expect(existsSync(executeSentinel)).toBe(false);

      rmSync(analyzeSentinel);
      writeFileSync(join(dir, '.open-autonomy', 'audits-paused'), 'paused\n');
      rmSync(join(dir, '.open-autonomy', 'paused'));
      const executionOnly = spawnSync('node', ['scheduler/run.mjs', '--once'], { cwd: dir, encoding: 'utf8' });
      expect(executionOnly.status).toBe(0);
      expect(existsSync(executeSentinel)).toBe(true);
      expect(existsSync(analyzeSentinel)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// --- C. the emitted scripts/runner.ts — launch() defense in depth (real subprocess) --------------------

const dispatchScriptIr: AutonomyIR = {
  schema: 'autonomy.ir.v1',
  targets: ['local'],
  codeHost: 'local-git',
  agents: { develop: { behavior: 'scripts/develop.ts', capabilities: [], triggers: [{ dispatch: true }] } },
  policy: { box: {} },
  resources: [],
};

function scaffoldRunner(opts: { paused: boolean } = { paused: true }): { dir: string; sentinel: string } {
  const out = compileLocal(dispatchScriptIr);
  if (!opts.paused) delete out.generated['.open-autonomy/paused'];
  const dir = mkdtempSync(join(tmpdir(), 'oa07-runner-'));
  materializeAll(dir, out);
  const sentinel = join(dir, 'ran.txt');
  writeFileSync(
    join(dir, 'scripts', 'develop.ts'),
    `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(sentinel)}, 'ran\\n');\n`,
  );
  return { dir, sentinel };
}

describe('the emitted scripts/runner.ts — launch() refuses while paused (AC-4)', () => {
  test('launch while paused: exits nonzero, prints the PAUSED message, spawns NOTHING', () => {
    const { dir, sentinel } = scaffoldRunner({ paused: true });
    try {
      const r = spawnSync('bun', ['scripts/runner.ts', 'launch', 'develop', '--ref', 'X', '--branch', 'agent/issue-X'], {
        cwd: dir,
        encoding: 'utf8',
      });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('PAUSED');
      expect(r.stderr).toContain('rm .open-autonomy/paused');
      expect(existsSync(sentinel)).toBe(false); // the script agent never ran
      expect(existsSync(join(dir, '.worktrees'))).toBe(false); // never even got to worktree isolation
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('launch once unpaused: succeeds and actually runs the worker', () => {
    const { dir, sentinel } = scaffoldRunner({ paused: false });
    try {
      const r = spawnSync('bun', ['scripts/runner.ts', 'launch', 'develop'], { cwd: dir, encoding: 'utf8' });
      expect(r.status).toBe(0);
      expect(existsSync(sentinel)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('an explicit job fence is honored independently of the legacy global fence', () => {
    const { dir, sentinel } = scaffoldRunner({ paused: true }); // global .open-autonomy/paused exists
    try {
      const custom = '.open-autonomy/audits-paused';
      const allowed = spawnSync('bun', ['scripts/runner.ts', 'launch', 'develop', '--fence', custom], {
        cwd: dir,
        encoding: 'utf8',
      });
      expect(allowed.status).toBe(0); // the absent declared fence wins; the unrelated global marker does not
      expect(existsSync(sentinel)).toBe(true);

      rmSync(sentinel);
      writeFileSync(join(dir, custom), 'paused\n');
      const blocked = spawnSync('bun', ['scripts/runner.ts', 'launch', 'develop', '--fence', custom], {
        cwd: dir,
        encoding: 'utf8',
      });
      expect(blocked.status).not.toBe(0);
      expect(blocked.stderr).toContain(`rm ${custom}`);
      expect(existsSync(sentinel)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the emitted scripts/runner.ts — the human route is EXEMPT from the pause gate', () => {
  const humanIr: AutonomyIR = {
    schema: 'autonomy.ir.v1',
    targets: ['local'],
    agents: {
      approver: { kind: 'human', behavior: 'approver', capabilities: ['tasks:converse', 'code:review'], triggers: [{ dispatch: true }] },
    },
    policy: { box: {} },
    resources: [],
  };

  test('launching a kind:human actor still parks a session while paused — parking an ask spends nothing', () => {
    const out = compileLocal(humanIr);
    const dir = mkdtempSync(join(tmpdir(), 'oa07-human-exempt-'));
    try {
      mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
      mkdirSync(join(dir, 'scripts'), { recursive: true });
      writeFileSync(join(dir, '.open-autonomy', 'autonomy.yml'), out.generated['.open-autonomy/autonomy.yml']);
      writeFileSync(join(dir, '.open-autonomy', 'autonomy.json'), out.generated['.open-autonomy/autonomy.json']);
      writeFileSync(join(dir, 'scripts', 'runner.ts'), out.generated['scripts/runner.ts']);
      // The marker is present (paused) — the human route must not consult it at all.
      writeFileSync(join(dir, '.open-autonomy', 'paused'), out.generated['.open-autonomy/paused'] ?? 'PAUSED\n');

      const r = spawnSync('bun', ['scripts/runner.ts', 'launch', 'approver', '--ask', 'approve while paused'], {
        cwd: dir,
        encoding: 'utf8',
      });
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('HUMAN ENGAGE: approver');
      expect(r.stderr).not.toContain('PAUSED');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
