// The `prelaunch` seam (IRAgent.prelaunch, packages/core/src/ir.ts): an opaque shell command a profile
// declares on ONE agent's manifest entry that the LOCAL runner executes in the session's own cwd (the
// worktree it is about to be launched into, or the trunk checkout with no `--branch`) — BEFORE the session
// spawns, with the same env the session itself will see. Proven here against a REAL compiled+committed
// install driven as a real `bun scripts/runner.ts launch` subprocess (the house pattern —
// launch-verification.test.ts), with the SAME stub termfleet so a session-creation sentinel proves the
// spawn order (prelaunch's file write happens before the stub records the session).
import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { AutonomyIR } from '@open-autonomy/core';
import { emitAutonomy } from '@open-autonomy/core';
import { compileLocal } from './emit';
import { installStubTermfleet } from './test-support/stub-termfleet';

function git(dir: string, args: string[]) {
  return spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
}
function gitOk(dir: string, args: string[]): string {
  const r = git(dir, args);
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${dir}: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
}

const tmps: string[] = [];
afterEach(() => {
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true });
});

// A real compiled install (generated files + stub SKILL.md for every skill agent), unpaused, stub-termfleet
// equipped, and committed to a real git repo — mirrors launch-verification.test.ts's scaffold() exactly.
function scaffold(ir: AutonomyIR): { dir: string } {
  const out = compileLocal(ir);
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'oa-prelaunch-')));
  tmps.push(dir);
  for (const [path, content] of Object.entries(out.generated)) {
    mkdirSync(join(dir, dirname(path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  for (const copy of out.copies) {
    mkdirSync(join(dir, dirname(copy.to)), { recursive: true });
    const name = copy.to.split('/').slice(-2, -1)[0];
    writeFileSync(join(dir, copy.to), `---\nname: ${name}\ndescription: test fixture for "${name}"\n---\n\n# ${name}\n`);
  }
  rmSync(join(dir, '.open-autonomy', 'paused'), { force: true }); // OA-07 is not this suite's concern
  installStubTermfleet(dir);
  gitOk(dir, ['init', '-q', '-b', 'main']);
  gitOk(dir, ['config', 'user.email', 'oa-prelaunch-test@example.invalid']);
  gitOk(dir, ['config', 'user.name', 'oa-prelaunch-test']);
  gitOk(dir, ['add', '-A']);
  gitOk(dir, ['commit', '-q', '-m', 'install harness']);
  return { dir };
}

function env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { ...process.env, TERMFLEET_AGENT: 'claude', ...extra };
}

describe('IRAgent.prelaunch — carried through emitAutonomy into autonomy.yml', () => {
  test('present on the declaring agent, absent on one that has none', () => {
    const ir: AutonomyIR = {
      schema: 'autonomy.ir.v1',
      targets: ['local'],
      agents: {
        develop: {
          behavior: 'develop',
          capabilities: ['code:propose'],
          triggers: [{ dispatch: true }],
          prelaunch: 'echo armed > .marker',
        },
        pm: { behavior: 'pm', capabilities: ['agent:launch'], triggers: [{ cron: '*/15 * * * *' }] },
      },
      policy: { box: {} },
      resources: [],
    };
    const manifest = emitAutonomy(ir);
    expect(manifest.agents?.develop?.prelaunch).toBe('echo armed > .marker');
    expect(manifest.agents?.pm?.prelaunch).toBeUndefined();
  });
});

describe('scripts/runner.ts launch — the declared prelaunch runs in the worktree before the session spawns', () => {
  const markerRelPath = 'PRELAUNCH_MARKER.json';

  // Writes a small JSON record (agent name + cwd + a monotonic counter file) so the test can assert BOTH
  // "the file exists in the right cwd" and "it ran before the session" (the counter file the stub sentinel
  // also writes to lets us compare mtimes/ordering by content, not just presence).
  function irWithPrelaunch(command: string): AutonomyIR {
    return {
      schema: 'autonomy.ir.v1',
      targets: ['local'],
      codeHost: 'local-git', // no propose-effect branch involved — keep this suite's concern isolated
      agents: {
        develop: {
          behavior: 'develop',
          capabilities: ['code:propose'],
          triggers: [{ dispatch: true }],
          prelaunch: command,
        },
        pm: { behavior: 'pm', capabilities: ['agent:launch'], triggers: [{ cron: '*/15 * * * *' }] },
      },
      policy: { box: {} },
      resources: [],
    };
  }

  test('an agent WITH prelaunch: runs it in the worktree cwd before the session spawns', () => {
    const { dir } = scaffold(irWithPrelaunch(`node -e "require('fs').writeFileSync('${markerRelPath}', JSON.stringify({cwd: process.cwd()}))"`));
    const sentinel = join(dir, 'sentinel.log');

    const r = spawnSync('bun', ['scripts/runner.ts', 'launch', 'develop', '--ref', '7', '--branch', 'agent/issue-7'], {
      cwd: dir,
      encoding: 'utf8',
      env: env({ OA08_SESSION_SENTINEL: sentinel }),
    });

    expect(r.status).toBe(0);
    const worktree = join(dir, '.worktrees', 'agent-issue-7');
    const markerPath = join(worktree, markerRelPath);
    expect(existsSync(markerPath)).toBe(true); // ran, and in the WORKTREE cwd, not the main checkout
    expect(existsSync(join(dir, markerRelPath))).toBe(false); // never in the main checkout's cwd

    const marker = JSON.parse(readFileSync(markerPath, 'utf8')) as { cwd: string };
    expect(marker.cwd).toBe(worktree);

    // The session itself was still created (best-effort: prelaunch never blocks the launch).
    expect(existsSync(sentinel)).toBe(true);
  });

  test('nonzero prelaunch exit is logged but does NOT fail the launch (best-effort arm)', () => {
    const { dir } = scaffold(irWithPrelaunch('exit 3'));
    const sentinel = join(dir, 'sentinel.log');

    const r = spawnSync('bun', ['scripts/runner.ts', 'launch', 'develop', '--ref', '9', '--branch', 'agent/issue-9'], {
      cwd: dir,
      encoding: 'utf8',
      env: env({ OA08_SESSION_SENTINEL: sentinel }),
    });

    expect(r.status).toBe(0); // the launch itself still succeeds
    expect(r.stderr).toContain('prelaunch');
    expect(r.stderr).toContain('exited 3');
    expect(r.stderr).toContain('continuing anyway');
    expect(existsSync(sentinel)).toBe(true); // the session still got created despite the nonzero prelaunch
  });

  test('an agent with NO prelaunch declared is entirely unaffected (no-op, no stray marker, no log line)', () => {
    const ir: AutonomyIR = {
      schema: 'autonomy.ir.v1',
      targets: ['local'],
      codeHost: 'local-git',
      agents: {
        develop: { behavior: 'develop', capabilities: ['code:propose'], triggers: [{ dispatch: true }] }, // no prelaunch
        pm: { behavior: 'pm', capabilities: ['agent:launch'], triggers: [{ cron: '*/15 * * * *' }] },
      },
      policy: { box: {} },
      resources: [],
    };
    const { dir } = scaffold(ir);
    const sentinel = join(dir, 'sentinel.log');

    const r = spawnSync('bun', ['scripts/runner.ts', 'launch', 'develop', '--ref', '11', '--branch', 'agent/issue-11'], {
      cwd: dir,
      encoding: 'utf8',
      env: env({ OA08_SESSION_SENTINEL: sentinel }),
    });

    expect(r.status).toBe(0);
    expect(r.stderr).not.toContain('prelaunch');
    expect(existsSync(join(dir, '.worktrees', 'agent-issue-11', markerRelPath))).toBe(false);
    expect(existsSync(sentinel)).toBe(true); // the session ran exactly as before
  });

  test('with no --branch (trunk launch), prelaunch runs in process.cwd(), not a worktree', () => {
    const { dir } = scaffold(irWithPrelaunch(`node -e "require('fs').writeFileSync('${markerRelPath}', JSON.stringify({cwd: process.cwd()}))"`));
    const sentinel = join(dir, 'sentinel.log');

    const r = spawnSync('bun', ['scripts/runner.ts', 'launch', 'develop', '--ref', '13'], {
      cwd: dir,
      encoding: 'utf8',
      env: env({ OA08_SESSION_SENTINEL: sentinel }),
    });

    expect(r.status).toBe(0);
    expect(existsSync(join(dir, markerRelPath))).toBe(true); // ran in the trunk checkout's cwd
    const marker = JSON.parse(readFileSync(join(dir, markerRelPath), 'utf8')) as { cwd: string };
    expect(marker.cwd).toBe(dir);
  });
});
