// BL-27 dev/01: running the emitted scheduler before `npm install termfleet` used to die with a raw,
// buried ERR_MODULE_NOT_FOUND (several process-hops deep: run.mjs -> run-agent.mjs -> autonomy-runner.mjs
// -> `import 'termfleet'`). The loop driver now checks up front — but ONLY when the schedule actually
// needs the runner — and prints a friendly "npm install termfleet" fix instead.
import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileLocal } from './emit';
import type { AutonomyIR } from '@open-autonomy/core';

const skillAgentIr: AutonomyIR = {
  schema: 'autonomy.ir.v1',
  targets: ['local'],
  agents: { pm: { behavior: 'pm', capabilities: ['tasks:converse'], triggers: [{ cron: '*/15 * * * *' }] } },
  policy: { box: {} },
  resources: [],
};

const scriptOnlyIr: AutonomyIR = {
  schema: 'autonomy.ir.v1',
  targets: ['local'],
  agents: { sweep: { behavior: 'scripts/sweep.ts', capabilities: ['tasks:converse'], triggers: [{ cron: '*/15 * * * *' }] } },
  policy: { box: {} },
  resources: [],
};

function scaffold(ir: AutonomyIR): string {
  const out = compileLocal(ir);
  const dir = mkdtempSync(join(tmpdir(), 'oa-termfleet-guard-'));
  mkdirSync(join(dir, 'scheduler'), { recursive: true });
  writeFileSync(join(dir, 'scheduler', 'run.mjs'), out.generated['scheduler/run.mjs']);
  writeFileSync(join(dir, 'scheduler', 'schedule.json'), out.generated['scheduler/schedule.json']);
  // A script-only schedule's script (scripts/sweep.ts) must exist for `bun scripts/sweep.ts` to at least
  // ATTEMPT to run (its own success/failure is irrelevant — this test only cares whether the termfleet
  // guard fires, not whether the script itself does anything).
  if (out.generated['scheduler/schedule.json'].includes('scripts/sweep.ts')) {
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    writeFileSync(join(dir, 'scripts', 'sweep.ts'), 'console.log("swept");\n');
  }
  return dir;
}

describe('scheduler/run.mjs --once — the termfleet pre-flight guard', () => {
  test('a schedule that launches a skill agent (needs the runner) fails FAST with npm-install guidance, no termfleet installed', () => {
    const dir = scaffold(skillAgentIr);
    try {
      const r = spawnSync('node', ['scheduler/run.mjs', '--once'], { cwd: dir, encoding: 'utf8' });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('npm install termfleet');
      expect(r.stderr).not.toContain('ERR_MODULE_NOT_FOUND'); // the friendly message replaces the raw crash
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a healthy pnpm virtual-store install is accepted (real resolution lands in node_modules/.pnpm)', () => {
    const dir = scaffold(skillAgentIr);
    try {
      const termfleetReal = join(dir, 'node_modules', '.pnpm', 'termfleet@0.2.0', 'node_modules', 'termfleet');
      mkdirSync(termfleetReal, { recursive: true });
      writeFileSync(
        join(termfleetReal, 'package.json'),
        JSON.stringify({ name: 'termfleet', version: '0.2.0', type: 'module', exports: { '.': './index.js' } }),
      );
      writeFileSync(join(termfleetReal, 'index.js'), 'export const x = 1;\n');
      symlinkSync(termfleetReal, join(dir, 'node_modules', 'termfleet'), 'dir');

      const coreReal = join(dir, 'node_modules', '.pnpm', '@termfleet+core@0.2.1', 'node_modules', '@termfleet', 'core');
      mkdirSync(coreReal, { recursive: true });
      writeFileSync(
        join(coreReal, 'package.json'),
        JSON.stringify({ name: '@termfleet/core', version: '0.2.1', type: 'module', exports: { './local-providers.js': './local-providers.js' } }),
      );
      writeFileSync(
        join(coreReal, 'local-providers.js'),
        `export async function resolveDefaultProvider() { throw new Error('none'); }\n`,
      );
      mkdirSync(join(dir, 'node_modules', '@termfleet'), { recursive: true });
      symlinkSync(coreReal, join(dir, 'node_modules', '@termfleet', 'core'), 'dir');

      const r = spawnSync('node', ['scheduler/run.mjs', '--once'], { cwd: dir, encoding: 'utf8' });
      expect(r.stderr).not.toContain('COLLISION');
      expect(r.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a script-only schedule (no skill agent) never needs the runner — no termfleet warning at all', () => {
    const dir = scaffold(scriptOnlyIr);
    try {
      const r = spawnSync('node', ['scheduler/run.mjs', '--once'], { cwd: dir, encoding: 'utf8' });
      expect(r.stderr).not.toContain('npm install termfleet');
      expect(r.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // OA-04 (docs/adoption-fixes/OA-04-workspace-name-collision-detection.md): node_modules/termfleet
  // EXISTING is not enough to prove the guard above safe — an npm workspace can symlink that exact path
  // to the HOST's own in-development source (the audit's "termfleet" repro: a workspace `packages/core`
  // published as "termfleet" itself). The OLD existsSync guard passes here (the path exists!) and the
  // process would go on to crash several hops deep with a raw ERR_MODULE_NOT_FOUND (or, worse, silently
  // run the wrong code). This is the tamper probe for the emit.ts change: reverting the guard back to a
  // bare existsSync makes this test fail (status stays 0 — `fireTick` always exits 0 on --once regardless
  // of what its spawned commands do — and no COLLISION text is ever printed).
  test('a workspace-shadowed termfleet (node_modules/termfleet is a symlink into the repo tree) is refused with the named collision error, before any tick', () => {
    const dir = scaffold(skillAgentIr);
    try {
      // The exact shape npm workspaces produces: the "real" package lives at a repo-tracked path (as if it
      // were a workspace member happening to be named "termfleet"), and node_modules/termfleet is a
      // symlink to it — never a registry copy.
      mkdirSync(join(dir, 'packages', 'core'), { recursive: true });
      writeFileSync(
        join(dir, 'packages', 'core', 'package.json'),
        JSON.stringify({ name: 'termfleet', version: '0.0.0-dev', main: 'index.js' }),
      );
      writeFileSync(join(dir, 'packages', 'core', 'index.js'), 'export const x = 1;\n');
      mkdirSync(join(dir, 'node_modules'), { recursive: true });
      symlinkSync(join(dir, 'packages', 'core'), join(dir, 'node_modules', 'termfleet'), 'dir');
      const r = spawnSync('node', ['scheduler/run.mjs', '--once'], { cwd: dir, encoding: 'utf8' });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('COLLISION');
      expect(r.stderr).toContain('termfleet');
      expect(r.stderr).not.toContain('ERR_MODULE_NOT_FOUND'); // the named collision error replaces the raw crash
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // A minimal HEALTHY node_modules/termfleet (real dir, resolves to itself) — so the `termfleet` probe
  // passes and a LATER specifier's collision is what trips the guard, not termfleet's.
  const installHealthyTermfleet = (dir: string) => {
    mkdirSync(join(dir, 'node_modules', 'termfleet'), { recursive: true });
    writeFileSync(
      join(dir, 'node_modules', 'termfleet', 'package.json'),
      JSON.stringify({ name: 'termfleet', version: '0.2.0', main: 'index.js', exports: { '.': './index.js' } }),
    );
    writeFileSync(join(dir, 'node_modules', 'termfleet', 'index.js'), 'export const x = 1;\n');
  };

  // OA-04 concern-3: the drift the guard exists to catch is a workspace member named `@termfleet/core`
  // added AFTER install — `termfleet` still resolves fine, so a termfleet-only probe passes and the run
  // dies hops-deep with ERR_PACKAGE_PATH_NOT_EXPORTED (audit mode (a)). The guard must probe
  // `@termfleet/core/local-providers.js` too. Tamper probe for the multi-specifier loop: dropping
  // @termfleet/core from the emitted RUNNER_SPECS makes this go green-when-it-should-be-red.
  test('a workspace-shadowed @termfleet/core (termfleet itself resolves fine) is refused before any tick, naming @termfleet/core', () => {
    const dir = scaffold(skillAgentIr);
    try {
      installHealthyTermfleet(dir);
      mkdirSync(join(dir, 'packages', 'core'), { recursive: true });
      writeFileSync(join(dir, 'packages', 'core', 'package.json'), JSON.stringify({ name: '@termfleet/core', version: '0.0.0-dev' }));
      writeFileSync(join(dir, 'packages', 'core', 'local-providers.js'), 'export const p = 1;\n');
      mkdirSync(join(dir, 'node_modules', '@termfleet'), { recursive: true });
      symlinkSync(join(dir, 'packages', 'core'), join(dir, 'node_modules', '@termfleet', 'core'), 'dir');
      const r = spawnSync('node', ['scheduler/run.mjs', '--once'], { cwd: dir, encoding: 'utf8' });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('COLLISION');
      expect(r.stderr).toContain('@termfleet/core');
      expect(r.stderr).not.toContain('ERR_PACKAGE_PATH_NOT_EXPORTED'); // named error replaces the deep crash
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Exercises the emitted guard's realpathSync-ESCAPE sub-branch specifically. Under Node's default
  // realpath-on resolution, a symlinked node_modules/termfleet resolves straight to its repo target, so the
  // earlier "resolved OUTSIDE node_modules" branch fires. Under NODE_OPTIONS=--preserve-symlinks, resolution
  // keeps the symlink path (string-wise inside node_modules/termfleet/), so ONLY the realpath check reveals
  // the escape — this is the one condition that reaches that sub-branch.
  test('under --preserve-symlinks, a symlinked node_modules/termfleet is caught by the realpath-escape branch', () => {
    const dir = scaffold(skillAgentIr);
    try {
      mkdirSync(join(dir, 'packages', 'tf'), { recursive: true });
      writeFileSync(
        join(dir, 'packages', 'tf', 'package.json'),
        JSON.stringify({ name: 'termfleet', version: '0.2.0', main: 'index.js', exports: { '.': './index.js' } }),
      );
      writeFileSync(join(dir, 'packages', 'tf', 'index.js'), 'export const x = 1;\n');
      mkdirSync(join(dir, 'node_modules'), { recursive: true });
      symlinkSync(join(dir, 'packages', 'tf'), join(dir, 'node_modules', 'termfleet'), 'dir');
      const r = spawnSync('node', ['scheduler/run.mjs', '--once'], {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, NODE_OPTIONS: '--preserve-symlinks' },
      });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('COLLISION');
      expect(r.stderr).toContain('escapes node_modules into this repo'); // the realpath-escape branch's wording
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
