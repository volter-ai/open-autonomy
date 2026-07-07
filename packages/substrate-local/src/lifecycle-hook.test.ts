// The local runner's post-session effect lifecycle hook — the mirror of github's post-skill job step, and
// the replacement for the old propose-sweep poller. Two halves are proven here, both through the SHIPPED
// code (architecture invariant `proof-demonstrated-not-asserted`):
//   1. RECORD  — runner.ts captures the launched session's terminalId from the real launch-output shape.
//   2. RUN     — the REAL emitted scheduler/run.mjs runs a recorded effect in its worktree once that session
//                is GONE from the runner's live list, and never while it is still live; then retires the marker.
import { afterEach, describe, expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileLocal } from './emit';
import { mergeInFlight, terminalIdFromLaunch } from './runner-frontend';
import { emitAutonomy } from '@open-autonomy/core';
import type { AutonomyIR } from '@open-autonomy/core';

const ghLocalIr: AutonomyIR = {
  schema: 'autonomy.ir.v1',
  targets: ['termfleet'],
  codeHost: 'github',
  agents: {
    pm: { behavior: 'pm', capabilities: ['agent:launch'], triggers: [{ cron: '*/15 * * * *' }] },
    develop: { behavior: 'develop', capabilities: ['code:propose'], triggers: [{ dispatch: true }] },
  },
  policy: { box: {} },
  resources: [],
};

describe('the post-session effect is gated on EXPLICIT signals, never a capability', () => {
  const rt = compileLocal(ghLocalIr).generated['scripts/runner.ts'];

  test('gated on an isolated worktree + a github code host — no code:propose anywhere in the runner', () => {
    expect(rt).toContain('recordPostSessionEffect'); // launch records a per-session effect
    expect(rt).toContain('const codeHost = manifestCodeHost();'); // read once per launch (OA-02: also gates the worktree base)
    // pin the FULL propose-gate line — a bare `codeHost === 'github'` also matches the worktree-base gate
    // in ensureWorktree (OA-02), so it alone would not catch a regression ungating the propose effect
    expect(rt).toContain("if (worktree && codeHost === 'github')"); // gated on worktree + the declared code-host signal
    expect(rt).toContain("'scripts/agent-propose.ts'"); // the github code host's publish effect (git + gh)
    // the capability is GONE from the runner's behavior gating (it was a fictional local permission):
    expect(rt).not.toContain('code:propose');
    expect(rt).not.toContain('holdsPropose');
    expect(rt).not.toContain('isolationBranch');
  });

  test('isolation is requested EXPLICITLY by the caller naming --branch (no auto-derivation from a ref)', () => {
    // a worktree is created only when params.branch is given; the runner derives no branch from the ref/capability
    expect(rt).toContain('params.branch'); // the explicit isolation signal
    expect(rt).not.toMatch(/agent\/issue-\$\{[^}]*ref/i); // no `agent/issue-${ref}` auto-derivation in the runner
  });

  test('the runner stays CODE-HOST-BLIND — it injects no GITHUB_REPOSITORY identity', () => {
    const out = compileLocal(ghLocalIr);
    // the agent/effect resolves its own repo (gh {owner}/{repo}); the runner never injects the repo identity
    expect(out.generated['scripts/runner.ts']).not.toContain('GITHUB_REPOSITORY');
    expect(out.generated['scripts/autonomy-runner.mjs']).not.toContain('GITHUB_REPOSITORY');
  });

  test('the uniform seam exposes cancel on both substrates (agent:cancel)', () => {
    expect(compileLocal(ghLocalIr).generated['scripts/runner.ts']).toContain("cmd === 'cancel'"); // local seam
  });

  test('cron agents are single-instance (AUTONOMY_SINGLETON) so PM ticks do not pile up', () => {
    const out = compileLocal(ghLocalIr);
    expect(out.generated['scripts/run-agent.mjs']).toContain('AUTONOMY_SINGLETON'); // the skip-if-busy guard
    const schedule = JSON.parse(out.generated['scheduler/schedule.json']) as { scripts: string[] };
    expect(schedule.scripts.some((s) => s.includes('AUTONOMY_SINGLETON=1'))).toBe(true); // the PM tick sets it
  });

  test('the old propose-sweep poller is GONE — no worktree-scanning reconciler is emitted or scheduled', () => {
    const out = compileLocal(ghLocalIr);
    expect(out.generated['scripts/propose-sweep.ts']).toBeUndefined(); // the leaky reconciler is not shipped
    const schedule = JSON.parse(out.generated['scheduler/schedule.json']) as { scripts: string[] };
    expect(schedule.scripts.some((s) => s.includes('propose-sweep'))).toBe(false); // nor scheduled
  });
});

describe('the manifest carries codeHost — a first-class IR signal the runner reads (not a capability)', () => {
  test('emitAutonomy serializes ir.codeHost; the local runner reads it to gate the propose effect', () => {
    expect((emitAutonomy(ghLocalIr) as { codeHost?: string }).codeHost).toBe('github');
    const localGit: AutonomyIR = { ...ghLocalIr, codeHost: 'local-git' };
    expect((emitAutonomy(localGit) as { codeHost?: string }).codeHost).toBe('local-git');
  });
});

describe('the review edge is realized through the runner seam (Blocker 2)', () => {
  test('local runner.ts records REVIEW_AGENT in the marker; agent-propose launches it via the runner', () => {
    const out = compileLocal(ghLocalIr);
    expect(out.generated['scripts/runner.ts']).toContain('REVIEW_AGENT: review'); // the develop agent's review edge
    const propose = out.generated['scripts/agent-propose.ts'];
    expect(propose).toContain('REVIEW_AGENT'); // agent-propose reads the review agent
    expect(propose).toMatch(/runner\.ts['"],\s*['"]launch['"],\s*reviewAgent/); // and launches it via the runner seam
    expect(propose).toContain('if (reviewWorkflow)'); // github's workflow dispatch is preserved (proven path untouched)
  });
});

describe('mergeInFlight — a finished-but-unproposed session stays in-flight (no duplicate PR)', () => {
  const marker = (id: string, agent: string, ref = '') => ({ id, agent, ref, worktree: `/wt/${id}`, effect: 'scripts/agent-propose.ts', env: {} });

  test('a live session and its own pending marker count as ONE in-flight unit (deduped by id)', () => {
    const live = [{ id: 'dev-1', agent: 'develop', status: 'running' }];
    const inflight = mergeInFlight(live, [marker('dev-1', 'develop')], 'develop');
    expect(inflight).toHaveLength(1); // not double-counted
    expect(inflight[0]!.id).toBe('dev-1');
  });

  test('after reap (no live session) a pending marker keeps the work in-flight — the race window', () => {
    // the bug: between reap and propose, list() was empty -> PM relaunched develop -> a second PR.
    const inflight = mergeInFlight([], [marker('dev-1', 'develop')], 'develop');
    expect(inflight).toHaveLength(1); // WIP still sees develop in flight
    expect(inflight[0]!.status).toBe('proposing');
  });

  test('once proposed (marker gone) the agent is no longer in-flight (the PR dedups from here)', () => {
    expect(mergeInFlight([], [], 'develop')).toHaveLength(0);
  });

  test('another agent\'s pending marker does not count toward this agent', () => {
    expect(mergeInFlight([], [marker('rev-1', 'reviewer')], 'develop')).toHaveLength(0);
  });

  test('surfaces the per-issue ref (live or proposing) so a multi-developer PM dedups per issue', () => {
    const live = mergeInFlight([{ id: 'dev-1', agent: 'develop', status: 'running' }], [marker('dev-1', 'develop', '7')], 'develop');
    expect(live[0]!.ref).toBe('7'); // a live developer carries the issue it's isolated for
    const proposing = mergeInFlight([], [marker('dev-2', 'develop', '9')], 'develop');
    expect(proposing[0]!.ref).toBe('9'); // and so does a finished-but-unproposed one
  });
});

describe('terminalIdFromLaunch — the launch->reap join key', () => {
  test('reads the terminalId from autonomy-runner launch JSON, tolerant of leading provider noise', () => {
    const noisy = ['[provider] attached', '{"id":"local-iterm-2","agent":"develop","status":"running","ref":"claude:abc"}', ''].join('\n');
    expect(terminalIdFromLaunch(noisy)).toBe('local-iterm-2');
  });
  test('returns empty when no session JSON is present (recording is then skipped, not mis-keyed)', () => {
    expect(terminalIdFromLaunch('boom: launch failed\n')).toBe('');
  });
});

// --- the RUN half: drive the real emitted loop driver against a stub runner + a real marker + a real effect ---
const tmps: string[] = [];
afterEach(() => {
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true });
});

// Stand up a temp install that has ONLY what the loop driver's reconcile path touches: the real emitted
// scheduler/run.mjs, a stub runner backend whose `list()` liveness we control via STUB_LIVE_IDS, an empty
// schedule, a worktree, a real effect script, and one pending-effect marker. Returns the dir + key paths.
function scaffold(): { dir: string; worktree: string; markerPath: string; sentinel: string } {
  const dir = mkdtempSync(join(tmpdir(), 'oa-lifecycle-'));
  tmps.push(dir);
  const loop = compileLocal(ghLocalIr).generated['scheduler/run.mjs'];
  mkdirSync(join(dir, 'scheduler'), { recursive: true });
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  const effectsDir = join(dir, '.open-autonomy', 'runner-state', 'effects');
  mkdirSync(effectsDir, { recursive: true });
  const worktree = join(dir, '.worktrees', 'agent-issue-7');
  mkdirSync(worktree, { recursive: true });
  writeFileSync(join(dir, 'scheduler', 'run.mjs'), loop);
  writeFileSync(join(dir, 'scheduler', 'schedule.json'), JSON.stringify({ intervalSeconds: 1, env: {}, scripts: [] }));
  // Stub runner backend: reapIdle is a no-op; list() reports as LIVE only the ids in STUB_LIVE_IDS.
  writeFileSync(
    join(dir, 'scripts', 'autonomy-runner.mjs'),
    `export class TermfleetRunner {
       async reapIdle() { return []; }
       async list() {
         const ids = (process.env.STUB_LIVE_IDS || '').split(',').filter(Boolean);
         return ids.map((id) => ({ id, agent: 'develop', status: 'running' }));
       }
     }`,
  );
  // Real effect script: writes a sentinel into its CWD (proving it ran IN the worktree) carrying marker.env.
  const sentinel = join(worktree, 'effect-ran.txt');
  writeFileSync(join(dir, 'scripts', 'effect.mjs'), `import { writeFileSync } from 'node:fs';\nwriteFileSync('effect-ran.txt', process.env.FOO || '');\n`);
  const markerPath = join(effectsDir, 'local-iterm-7.json');
  writeFileSync(
    markerPath,
    JSON.stringify({ id: 'local-iterm-7', agent: 'develop', worktree, effect: join(dir, 'scripts', 'effect.mjs'), env: { FOO: 'bar' } }),
  );
  return { dir, worktree, markerPath, sentinel };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Run the real loop driver; resolve as soon as `done()` holds (or at capMs), then stop it. The loop
// reconciles before its first sleep, so a finished-session effect fires within a few hundred ms.
async function runLoopUntil(dir: string, env: Record<string, string>, done: () => boolean, capMs: number): Promise<void> {
  const child = spawn('node', ['scheduler/run.mjs'], {
    cwd: dir,
    stdio: 'ignore',
    env: { ...process.env, AUTONOMY_REAP_POLL_MS: '300', ...env },
  });
  try {
    const start = Date.now();
    while (Date.now() - start < capMs && !done()) await sleep(100);
  } finally {
    child.kill('SIGKILL');
    await sleep(100);
  }
}

describe('reconcilePendingEffects (real emitted scheduler/run.mjs) — the completion gate', () => {
  test(
    'runs the recorded effect in its worktree once the session is GONE, then deletes the marker',
    async () => {
      const { dir, sentinel, markerPath } = scaffold();
      await runLoopUntil(dir, { STUB_LIVE_IDS: '' }, () => existsSync(sentinel), 8000); // no live sessions -> finished
      expect(existsSync(sentinel)).toBe(true); // effect ran...
      expect(readFileSync(sentinel, 'utf8')).toBe('bar'); // ...in the worktree, with marker.env
      expect(existsSync(markerPath)).toBe(false); // ...and the marker was retired
    },
    15000,
  );

  test(
    'does NOT run the effect while the session is still live (mid-flight work is never proposed)',
    async () => {
      const { dir, sentinel, markerPath } = scaffold();
      // the session is still running for the whole window -> never satisfied; we assert the effect stayed put
      await runLoopUntil(dir, { STUB_LIVE_IDS: 'local-iterm-7' }, () => false, 2500);
      expect(existsSync(sentinel)).toBe(false); // effect did NOT run
      expect(existsSync(markerPath)).toBe(true); // the marker waits for the session to finish
    },
    15000,
  );
});
