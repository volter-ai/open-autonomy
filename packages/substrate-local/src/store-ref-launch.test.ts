// The LOCAL counterpart of the store-ref propose change (scripts/agent-propose.ts's dual mode): the local
// runner recovers the work-item ref from the `agent/issue-<ref>` worktree branch to hand agent-propose its
// ISSUE_REF (and to key the pending post-session effect marker). That extraction alphabet MUST match the ref
// alphabet agent-propose constructs the branch from (`[A-Za-z0-9._-]+`, widened for store ids like
// `COMBO-9`) — a digit-only capture would yield an EMPTY ref for a store-id branch, so agent-propose would
// see no ref and its `Tracker: <ref>` trailer would never emit: store mode would be unreachable from the
// local propose path. Proven here against a REAL compiled+committed install driven as a real `bun
// scripts/runner.ts launch` subprocess (the house pattern — launch-verification.test.ts), asserting the
// recorded effect marker (its `ref` AND its `env.ISSUE_REF`) carries the store id verbatim, and that a
// numeric branch still yields the bare number.
import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { AutonomyIR } from '@open-autonomy/core';
import { compileLocal } from './emit';
import { installStubTermfleet } from './test-support/stub-termfleet';

// codeHost: 'github' — the ONLY launch path that records a post-session effect marker (with ISSUE_REF); a
// local-git host has the PM merge worktrees, no propose effect, so there would be no marker to assert on.
const ir: AutonomyIR = {
  schema: 'autonomy.ir.v1',
  targets: ['local'],
  codeHost: 'github',
  agents: {
    pm: { behavior: 'pm', capabilities: ['agent:launch'], triggers: [{ cron: '*/15 * * * *' }] },
    develop: { behavior: 'develop', capabilities: ['code:propose'], triggers: [{ dispatch: true }], review: 'develop' },
  },
  policy: { box: {} },
  resources: [],
};

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

function scaffold(): { dir: string } {
  const out = compileLocal(ir);
  const dir = mkdtempSync(join(tmpdir(), 'oa-store-ref-'));
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
  rmSync(join(dir, '.open-autonomy', 'paused'), { force: true });
  installStubTermfleet(dir);
  gitOk(dir, ['init', '-q', '-b', 'main']);
  gitOk(dir, ['config', 'user.email', 'oa-store-ref-test@example.invalid']);
  gitOk(dir, ['config', 'user.name', 'oa-store-ref-test']);
  gitOk(dir, ['add', '-A']);
  gitOk(dir, ['commit', '-q', '-m', 'install harness']);
  return { dir };
}

function env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { ...process.env, TERMFLEET_AGENT: 'claude', ...extra };
}

// The one recorded effect marker (the propose effect the reaper will run when the session finishes).
function readEffectMarker(dir: string): { ref: string; env: { ISSUE_REF?: string } } {
  const effDir = join(dir, '.open-autonomy', 'runner-state', 'effects');
  const files = readdirSync(effDir).filter((f) => f.endsWith('.json'));
  expect(files.length).toBe(1);
  return JSON.parse(readFileSync(join(effDir, files[0]), 'utf8')) as { ref: string; env: { ISSUE_REF?: string } };
}

describe('local runner ISSUE_REF derivation — the store-ref counterpart of agent-propose dual mode', () => {
  test('a STORE-id branch (agent/issue-COMBO-9) yields ISSUE_REF=COMBO-9 (not empty)', () => {
    const { dir } = scaffold();
    const sentinel = join(dir, 'sentinel.log');

    const r = spawnSync('bun', ['scripts/runner.ts', 'launch', 'develop', '--ref', 'COMBO-9', '--branch', 'agent/issue-COMBO-9'], {
      cwd: dir,
      encoding: 'utf8',
      env: env({ OA08_SESSION_SENTINEL: sentinel }),
    });

    expect(r.status).toBe(0);
    const marker = readEffectMarker(dir);
    expect(marker.ref).toBe('COMBO-9'); // recovered whole — a digit-only capture would give ''
    expect(marker.env.ISSUE_REF).toBe('COMBO-9'); // and handed to agent-propose, which emits `Tracker: COMBO-9`
  });

  test('a NUMERIC branch (agent/issue-7) still yields ISSUE_REF=7 (unchanged)', () => {
    const { dir } = scaffold();
    const sentinel = join(dir, 'sentinel.log');

    const r = spawnSync('bun', ['scripts/runner.ts', 'launch', 'develop', '--ref', '7', '--branch', 'agent/issue-7'], {
      cwd: dir,
      encoding: 'utf8',
      env: env({ OA08_SESSION_SENTINEL: sentinel }),
    });

    expect(r.status).toBe(0);
    const marker = readEffectMarker(dir);
    expect(marker.ref).toBe('7');
    expect(marker.env.ISSUE_REF).toBe('7'); // agent-propose emits `Closes #7`, exactly as before
  });

  test('a dotted store id (agent/issue-proj.42) is recovered verbatim', () => {
    const { dir } = scaffold();
    const sentinel = join(dir, 'sentinel.log');

    const r = spawnSync('bun', ['scripts/runner.ts', 'launch', 'develop', '--ref', 'proj.42', '--branch', 'agent/issue-proj.42'], {
      cwd: dir,
      encoding: 'utf8',
      env: env({ OA08_SESSION_SENTINEL: sentinel }),
    });

    expect(r.status).toBe(0);
    const marker = readEffectMarker(dir);
    expect(marker.ref).toBe('proj.42');
    expect(marker.env.ISSUE_REF).toBe('proj.42');
  });
});
