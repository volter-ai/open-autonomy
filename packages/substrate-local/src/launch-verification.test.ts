// OA-08: the runner used to launch blind and report success unconditionally — a skill agent whose
// invocation cannot resolve in its session's cwd died silently inside the model session ("Unknown command:
// /develop") with no signal anywhere upstream (audit F-7). Three layers proven here, each against a REAL
// emitted artifact driven as a real subprocess (the house pattern — pause-gate.test.ts /
// scheduler-uncommitted-harness-guard.test.ts):
//   A. `skillPathFor` — the pure, exported truth table (claude/codex x trunk/worktree cwd), no process/git.
//   B. the REAL emitted `scripts/runner.ts`'s launch() pre-check (runner-frontend.ts verbatim) — refuses
//      BEFORE any termfleet spend, with and without `--branch` (AC-1, AC-2), and propagates the launch's real
//      exit code once past the check (AC-3, AC-5).
//   C. the REAL emitted `scripts/autonomy-runner.mjs`'s backend guard (backend.mjs verbatim) — the scheduler
//      launches a skill agent straight through this backend, bypassing the frontend's pre-check entirely, so
//      this is proven as its OWN discriminating layer (AC-4), including the "no prompt file -> skip" case
//      (AC-6).
//
// Discriminating a REVERT of either guard requires that an UNGUARDED launch would otherwise actually
// SUCCEED (create a session) — real termfleet is not available in this environment, so a minimal STUB
// `termfleet` + `@termfleet/core` pair is installed into each fixture's node_modules, satisfying exactly the
// import surface backend.mjs uses (ProviderClient, providerRefFromUrl, resolveDefaultProvider) with a fake
// createAgentWindow that writes a sentinel file when (and only when) it is actually invoked. That sentinel,
// not just an exit code, is what proves "no session was created" — reverting either guard makes the
// corresponding test's sentinel appear (and the exit code flip to 0), the tamper probe this suite is
// designed to catch.
import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { AutonomyIR } from '@open-autonomy/core';
import { compileLocal } from './emit';
import { skillPathFor } from './runner-frontend';
import { installStubTermfleet } from './test-support/stub-termfleet';

// --- A. skillPathFor — the pure truth table (AC-6) -----------------------------------------------------

describe('skillPathFor — truth table (claude/codex x trunk/worktree cwd)', () => {
  test('claude (default), trunk cwd -> .claude/skills/<behavior>/SKILL.md under cwd', () => {
    expect(skillPathFor('claude', 'develop', '/repo')).toBe(join('/repo', '.claude', 'skills', 'develop', 'SKILL.md'));
  });
  test('codex, trunk cwd -> .codex/skills/<behavior>/SKILL.md under cwd', () => {
    expect(skillPathFor('codex', 'develop', '/repo')).toBe(join('/repo', '.codex', 'skills', 'develop', 'SKILL.md'));
  });
  test('claude, WORKTREE cwd (a --branch launch) -> rooted at the worktree, not the repo', () => {
    expect(skillPathFor('claude', 'develop', '/repo/.worktrees/agent-issue-7')).toBe(
      join('/repo/.worktrees/agent-issue-7', '.claude', 'skills', 'develop', 'SKILL.md'),
    );
  });
  test('codex, WORKTREE cwd -> rooted at the worktree', () => {
    expect(skillPathFor('codex', 'develop', '/repo/.worktrees/agent-issue-7')).toBe(
      join('/repo/.worktrees/agent-issue-7', '.codex', 'skills', 'develop', 'SKILL.md'),
    );
  });
  test('an unrecognized harness falls back to the claude root (emit.ts: codex is the only special case)', () => {
    expect(skillPathFor('gemini', 'develop', '/repo')).toBe(join('/repo', '.claude', 'skills', 'develop', 'SKILL.md'));
  });
});

// --- fixture scaffolding: a real compiled+committed install, with a REAL (stub) termfleet ---------------

const ir: AutonomyIR = {
  schema: 'autonomy.ir.v1',
  targets: ['local'],
  codeHost: 'github', // an isolated (--branch) launch on a github code host records a post-session effect
  // marker on success — making "no effect marker" a REAL discriminator of the pre-check (not vacuously true).
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

// installStubTermfleet is now shared (packages/substrate-local/src/test-support/stub-termfleet.ts, imported
// above) — OA-18's doctor --live tests need the identical stub with extra knobs (dead-vs-survives,
// captureTerminal content), so it was extracted rather than re-hand-rolled. Calling it with no extra env
// vars set (as every test in this file does) reproduces the ORIGINAL always-survives, empty-capture
// behavior exactly — every test below is unchanged.

const tmps: string[] = [];
afterEach(() => {
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true }); // mkdtemp paths only
});

// A real compiled install (generated files + copied SKILL.md stubs for every skill agent), unpaused,
// stub-termfleet-equipped, and committed to a real git repo — so `git rm -r <skill dir> && git commit`
// (AC-1's literal recipe) works exactly as it would on a real adopter's install.
function scaffold(): { dir: string } {
  const out = compileLocal(ir);
  const dir = mkdtempSync(join(tmpdir(), 'oa08-'));
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
  gitOk(dir, ['config', 'user.email', 'oa08-test@example.invalid']);
  gitOk(dir, ['config', 'user.name', 'oa08-test']);
  gitOk(dir, ['add', '-A']);
  gitOk(dir, ['commit', '-q', '-m', 'install harness']);
  // github-target isolation must follow the remote default branch. Point origin back at this hermetic
  // repo so each launch's fetch sees the fixture's latest committed main without network access.
  gitOk(dir, ['remote', 'add', 'origin', '.']);
  gitOk(dir, ['fetch', '-q', 'origin', 'main']);
  gitOk(dir, ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main']);
  return { dir };
}

function effectsCount(dir: string): number {
  try {
    return readdirSync(join(dir, '.open-autonomy', 'runner-state', 'effects')).filter((f) => f.endsWith('.json')).length;
  } catch {
    return 0; // no effects dir at all -> zero
  }
}

// PIN the harness in every launch's env. Tests inherit the OUTER process.env — a CI box exporting
// TERMFLEET_AGENT=codex would make AC-1 (which deletes only `.claude/skills/develop`, leaving the codex copy
// intact) spuriously PASS the pre-check and fail the assertion. Pinning 'claude' makes the fixtures
// deterministic against the paths they actually delete. (AC-6 needs AUTONOMY_PROMPT_DIR *absent* — it builds
// its env separately.)
function env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { ...process.env, TERMFLEET_AGENT: 'claude', ...extra };
}

// --- B. the REAL emitted scripts/runner.ts — launch()'s pre-check (AC-1, AC-2, AC-3, AC-5) --------------

describe('scripts/runner.ts launch — the skill pre-check (runner-frontend.ts verbatim)', () => {
  test('AC-1: committed skill deletion, --branch -> refuses fast, no session, no effect marker', () => {
    const { dir } = scaffold();
    gitOk(dir, ['rm', '-r', '.claude/skills/develop']);
    gitOk(dir, ['commit', '-q', '-m', 'break develop']);
    const sentinel = join(dir, 'sentinel.log');

    const r = spawnSync('bun', ['scripts/runner.ts', 'launch', 'develop', '--ref', '7', '--branch', 'agent/issue-7'], {
      cwd: dir,
      encoding: 'utf8',
      env: env({ OA08_SESSION_SENTINEL: sentinel }),
    });

    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('launch refused');
    expect(r.stderr).toContain('develop'); // the agent
    expect(r.stderr).toContain('.worktrees/agent-issue-7/.claude/skills/develop/SKILL.md'); // the EXACT missing path
    expect(r.stderr).toContain('Commit the harness'); // remediation
    expect(r.stderr).toContain('docs/OPERATIONS.md#local-runner-quickstart');
    expect(r.stderr).toContain('agent/issue-7'); // the branch, named
    // Pin a FRONTEND-specific part of the message shape (`base <sha>`) — the backend guard's message has no
    // base sha, so this assertion can only be satisfied by the frontend pre-check, keeping it under test even
    // if the `toContain('agent/issue-7')` above were weakened (the panel's isolation concern).
    expect(r.stderr).toMatch(/base [0-9a-f]{7,40}\)/); // `... base <full-or-short sha>)`

    expect(existsSync(sentinel)).toBe(false); // createAgentWindow was NEVER called — no session

    const list = spawnSync('bun', ['scripts/runner.ts', 'list', 'develop'], {
      cwd: dir,
      encoding: 'utf8',
      env: env({ OA08_SESSION_SENTINEL: sentinel }),
    });
    expect(JSON.parse(list.stdout || '[]')).toEqual([]); // no new session

    expect(effectsCount(dir)).toBe(0); // no post-session effect marker recorded either
  });

  test('AC-2: trunk-checkout launch (no --branch), skill missing on trunk -> refuses the same way', () => {
    const { dir } = scaffold();
    gitOk(dir, ['rm', '-r', '.claude/skills/develop']);
    gitOk(dir, ['commit', '-q', '-m', 'break develop']);
    const sentinel = join(dir, 'sentinel.log');

    const r = spawnSync('bun', ['scripts/runner.ts', 'launch', 'develop', '--ref', '7'], {
      cwd: dir,
      encoding: 'utf8',
      env: env({ OA08_SESSION_SENTINEL: sentinel }),
    });

    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('launch refused');
    expect(r.stderr).toContain('.claude/skills/develop/SKILL.md'); // no .worktrees/ segment this time
    expect(r.stderr).not.toContain('.worktrees/'); // this is the TRUNK checkout, not a worktree
    expect(existsSync(sentinel)).toBe(false); // no session
  });

  test('AC-3: exit-status propagation — skill present, termfleet provider down -> exits non-zero', () => {
    const { dir } = scaffold(); // develop's skill is intact
    const sentinel = join(dir, 'sentinel.log');

    const r = spawnSync('bun', ['scripts/runner.ts', 'launch', 'develop', '--ref', '7', '--branch', 'agent/issue-7'], {
      cwd: dir,
      encoding: 'utf8',
      env: env({ OA08_SESSION_SENTINEL: sentinel, OA08_STUB_PROVIDER_DOWN: '1' }),
    });

    expect(r.status).not.toBe(0); // the thrown createAgentWindow error must reach the CLI's own exit code
    expect(r.stderr).not.toContain('launch refused'); // this is NOT the skill pre-check — the skill exists
    expect(existsSync(sentinel)).toBe(false); // the provider never got far enough to create a session
  });

  test('F1 (recoverability): refuse -> operator commits the skill on trunk -> relaunch SAME branch now SUCCEEDS', () => {
    // The blocker: launch() runs ensureWorktree BEFORE the pre-check, and ensureWorktree early-returns on an
    // existing worktree — so a refused --branch launch that LEFT its just-created worktree behind would
    // re-check that same frozen (skill-less) copy on every retry, refusing forever even AFTER the operator
    // does exactly what the message says. The fix tears down a worktree THIS launch created, so the retry
    // rebuilds a fresh one off the fixed trunk. This test drives the full refuse -> fix -> recover arc.
    const { dir } = scaffold();
    const wt = join(dir, '.worktrees', 'agent-issue-7');
    // Break develop, then attempt the launch: it must refuse AND leave NO worktree/branch behind.
    gitOk(dir, ['rm', '-r', '.claude/skills/develop']);
    gitOk(dir, ['commit', '-q', '-m', 'break develop']);
    const sentinel = join(dir, 'sentinel.log');
    const first = spawnSync('bun', ['scripts/runner.ts', 'launch', 'develop', '--ref', '7', '--branch', 'agent/issue-7'], {
      cwd: dir,
      encoding: 'utf8',
      env: env({ OA08_SESSION_SENTINEL: sentinel }),
    });
    expect(first.status).not.toBe(0);
    expect(first.stderr).toContain('launch refused');
    expect(existsSync(wt)).toBe(false); // the just-created worktree was TORN DOWN (not left frozen)
    // the branch is gone too, so `git worktree add -b` can recreate it cleanly on retry
    expect(git(dir, ['rev-parse', '--verify', '--quiet', 'agent/issue-7']).status).not.toBe(0);

    // The operator does exactly what the message says: commit the harness (skill) back onto trunk.
    mkdirSync(join(dir, '.claude', 'skills', 'develop'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'skills', 'develop', 'SKILL.md'), `---\nname: develop\n---\n\n# develop\n`);
    gitOk(dir, ['add', '-A']);
    gitOk(dir, ['commit', '-q', '-m', 'restore develop skill on trunk']);

    // Retry the SAME branch: a FRESH worktree is built off the now-fixed trunk HEAD, the skill resolves, and
    // the launch SUCCEEDS — the whole point of the N=2 retry (spec :163-165) actually works now.
    const retry = spawnSync('bun', ['scripts/runner.ts', 'launch', 'develop', '--ref', '7', '--branch', 'agent/issue-7'], {
      cwd: dir,
      encoding: 'utf8',
      env: env({ OA08_SESSION_SENTINEL: sentinel }),
    });
    expect(retry.status).toBe(0);
    expect(retry.stderr).not.toContain('launch refused');
    expect(existsSync(join(wt, '.claude', 'skills', 'develop', 'SKILL.md'))).toBe(true); // fresh worktree sees the fix
    expect(existsSync(sentinel)).toBe(true); // and a real session got created
  });

  test('F1 (scoping): a refusal never tears down a PRE-EXISTING worktree it did not create', () => {
    // Only a worktree THIS launch created may be removed — a pre-existing one could be a legit in-progress
    // rework worktree. Pre-create the worktree at a base WITHOUT the skill, then launch: it must still refuse,
    // but must leave that pre-existing worktree in place (ensureWorktree returned 'existing').
    const { dir } = scaffold();
    gitOk(dir, ['rm', '-r', '.claude/skills/develop']);
    gitOk(dir, ['commit', '-q', '-m', 'break develop']);
    const wt = join(dir, '.worktrees', 'agent-issue-7');
    gitOk(dir, ['worktree', 'add', '-b', 'agent/issue-7', wt, 'HEAD']); // pre-existing worktree, skill-less base
    expect(existsSync(wt)).toBe(true);
    const sentinel = join(dir, 'sentinel.log');

    const r = spawnSync('bun', ['scripts/runner.ts', 'launch', 'develop', '--ref', '7', '--branch', 'agent/issue-7'], {
      cwd: dir,
      encoding: 'utf8',
      env: env({ OA08_SESSION_SENTINEL: sentinel }),
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('launch refused');
    expect(existsSync(wt)).toBe(true); // the PRE-EXISTING worktree is untouched (not this launch's to remove)
    expect(git(dir, ['rev-parse', '--verify', '--quiet', 'agent/issue-7']).status).toBe(0); // branch kept too
  });

  test('AC-5 (regression): skill intact -> launch still succeeds and creates a session exactly as before', () => {
    const { dir } = scaffold();
    const sentinel = join(dir, 'sentinel.log');

    const r = spawnSync('bun', ['scripts/runner.ts', 'launch', 'develop', '--ref', '9', '--branch', 'agent/issue-9'], {
      cwd: dir,
      encoding: 'utf8',
      env: env({ OA08_SESSION_SENTINEL: sentinel }),
    });

    expect(r.status).toBe(0);
    expect(r.stderr).not.toContain('launch refused');
    expect(existsSync(sentinel)).toBe(true); // a real session got created (through the REAL backend)

    const list = spawnSync('bun', ['scripts/runner.ts', 'list', 'develop'], {
      cwd: dir,
      encoding: 'utf8',
      env: env({ OA08_SESSION_SENTINEL: sentinel }),
    });
    const sessions = JSON.parse(list.stdout || '[]') as Array<{ status: string }>;
    expect(sessions.some((s) => s.status === 'running')).toBe(true); // `list` shows it running, as today
  });

  test('workspace-only isolation creates a fresh real worktree and never records a proposal effect', () => {
    const { dir } = scaffold();
    const sentinel = join(dir, 'sentinel.log');

    const first = spawnSync('bun', ['scripts/runner.ts', 'launch', 'develop', '--workspace', 'isolated'], {
      cwd: dir,
      encoding: 'utf8',
      env: env({ OA08_SESSION_SENTINEL: sentinel }),
    });
    expect(first.status).toBe(0);
    const firstSession = JSON.parse(readFileSync(sentinel, 'utf8').trim().split('\n')[0]!) as { cwd: string };
    expect(firstSession.cwd).toMatch(/\/\.worktrees\/autonomy-run-develop-\d+-\d+-\d+$/);
    expect(existsSync(firstSession.cwd)).toBe(true);
    expect(effectsCount(dir)).toBe(0); // github code host notwithstanding: no explicit --branch, no PR lifecycle

    const second = spawnSync('bun', ['scripts/runner.ts', 'launch', 'develop', '--workspace', 'isolated'], {
      cwd: dir,
      encoding: 'utf8',
      env: env({ OA08_SESSION_SENTINEL: sentinel }),
    });
    expect(second.status).toBe(0);
    const sessions = readFileSync(sentinel, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as { cwd: string });
    expect(sessions).toHaveLength(2);
    expect(sessions[1]!.cwd).not.toBe(sessions[0]!.cwd); // every isolated launch is fresh, even across processes
    expect(effectsCount(dir)).toBe(0);
  });

  test('workspace-only isolation refuses a stale same-named skill before termfleet spend', () => {
    const { dir } = scaffold();
    gitOk(dir, ['checkout', '-q', '-b', 'feature/new-doctrine']);
    writeFileSync(
      join(dir, '.claude', 'skills', 'develop', 'SKILL.md'),
      '---\nname: develop\ndescription: reviewed replacement doctrine\n---\n\n# develop v2\n',
    );
    gitOk(dir, ['add', '.claude/skills/develop/SKILL.md']);
    gitOk(dir, ['commit', '-q', '-m', 'replace develop doctrine']);
    const sentinel = join(dir, 'sentinel.log');

    const r = spawnSync('bun', ['scripts/runner.ts', 'launch', 'develop', '--workspace', 'isolated'], {
      cwd: dir,
      encoding: 'utf8',
      env: env({ OA08_SESSION_SENTINEL: sentinel }),
    });

    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('skill "develop" is stale');
    expect(r.stderr).toContain('content differs from the control checkout');
    expect(r.stderr).toContain('remote default branch');
    expect(existsSync(sentinel)).toBe(false);
    expect(readdirSync(join(dir, '.worktrees'))).toEqual([]); // refused launch cleaned its fresh worktree
    expect(gitOk(dir, ['branch', '--list', 'autonomy/run-develop-*'])).toBe('');
  });
});

// --- C. the REAL emitted scripts/autonomy-runner.mjs — the backend guard (AC-4, AC-6) -------------------

describe('scripts/autonomy-runner.mjs launch — the backend guard (backend.mjs verbatim, TermfleetRunner)', () => {
  test('AC-4: committed skill deletion (pm) -> the tick-launched PM is refused with a named error, no session', () => {
    const { dir } = scaffold();
    gitOk(dir, ['rm', '-r', '.claude/skills/pm']);
    gitOk(dir, ['commit', '-q', '-m', 'break pm']);
    const sentinel = join(dir, 'sentinel.log');
    const promptDir = join(dir, 'scripts', 'prompts', 'claude'); // what run-agent.mjs would have set (emit.ts:395)

    const r = spawnSync('node', ['scripts/autonomy-runner.mjs', 'launch', 'pm'], {
      cwd: dir,
      encoding: 'utf8',
      env: env({ OA08_SESSION_SENTINEL: sentinel, AUTONOMY_PROMPT_DIR: promptDir }),
    });

    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('launch refused');
    expect(r.stderr).toContain('pm'); // the agent + behavior
    expect(r.stderr).toContain(join(dir, '.claude', 'skills', 'pm', 'SKILL.md')); // the exact missing path
    expect(r.stderr).toContain('Commit the harness');
    expect(existsSync(sentinel)).toBe(false); // createAgentWindow was never reached

    const list = spawnSync('node', ['scripts/autonomy-runner.mjs', 'list'], {
      cwd: dir,
      encoding: 'utf8',
      env: env({ OA08_SESSION_SENTINEL: sentinel }),
    });
    expect(JSON.parse(list.stdout || '[]')).toEqual([]); // no session anywhere
  });

  test('AC-4 (full scheduler tick): node scheduler/run.mjs --once surfaces the same named error for pm, no session', () => {
    const { dir } = scaffold();
    gitOk(dir, ['rm', '-r', '.claude/skills/pm']);
    gitOk(dir, ['commit', '-q', '-m', 'break pm']);
    // OA-03's own tick guard (scheduler/run.mjs, the "uncommitted harness" check) ALSO fires on a committed
    // deletion of a manifest-listed path (a git-rm'd-and-committed file is untracked, absent from `git
    // status`, AND absent from disk — its own "never even written" bucket) — it would beat OA-08's backend
    // guard to the punch here, which is correct layering (OA-03 answers "did you commit what compile wrote"
    // at the loop's front door) but would prove OA-03, not THIS guard. Drop `.open-autonomy/generated.json`
    // from disk (no re-commit needed — that guard only ever checks disk presence) to isolate the scenario
    // OA-08's backend guard uniquely covers: a legacy/manifest-less install where OA-03 no-ops entirely
    // (AC-4b in scheduler-uncommitted-harness-guard.test.ts) but the skill is still genuinely missing.
    rmSync(join(dir, '.open-autonomy', 'generated.json'), { force: true });
    const sentinel = join(dir, 'sentinel.log');

    const r = spawnSync('node', ['scheduler/run.mjs', '--once'], {
      cwd: dir,
      encoding: 'utf8',
      env: env({ OA08_SESSION_SENTINEL: sentinel }),
    });

    expect(r.stderr).toContain('launch refused');
    expect(r.stderr).toContain(join(dir, '.claude', 'skills', 'pm', 'SKILL.md'));
    expect(existsSync(sentinel)).toBe(false);

    const list = spawnSync('node', ['scripts/autonomy-runner.mjs', 'list'], {
      cwd: dir,
      encoding: 'utf8',
      env: env({ OA08_SESSION_SENTINEL: sentinel }),
    });
    expect(JSON.parse(list.stdout || '[]')).toEqual([]);
  });

  test('regression: pm intact -> the backend launches it exactly as before (no refusal, session created)', () => {
    const { dir } = scaffold();
    const sentinel = join(dir, 'sentinel.log');
    const promptDir = join(dir, 'scripts', 'prompts', 'claude');

    const r = spawnSync('node', ['scripts/autonomy-runner.mjs', 'launch', 'pm'], {
      cwd: dir,
      encoding: 'utf8',
      env: env({ OA08_SESSION_SENTINEL: sentinel, AUTONOMY_PROMPT_DIR: promptDir }),
    });

    expect(r.status).toBe(0);
    expect(r.stdout).toContain('"status":"running"');
    expect(existsSync(sentinel)).toBe(true);
  });

  test('AC-6: no prompt file at all -> the invocation check is SKIPPED (even with the skill missing)', () => {
    const { dir } = scaffold();
    gitOk(dir, ['rm', '-r', '.claude/skills/develop', '.codex/skills/develop']);
    gitOk(dir, ['commit', '-q', '-m', 'break develop']);
    const sentinel = join(dir, 'sentinel.log');
    // no prompt dir at all -> promptFile resolves to '' -> nothing to check (built via destructuring, not
    // `delete`, so a spread-of-process.env object keeps its inferred type under strict mode).
    const { AUTONOMY_PROMPT_DIR: _unset, ...envWithoutPromptDir } = process.env;
    const noPromptEnv = { ...envWithoutPromptDir, TERMFLEET_AGENT: 'claude', OA08_SESSION_SENTINEL: sentinel };

    const r = spawnSync('node', ['scripts/autonomy-runner.mjs', 'launch', 'develop'], { cwd: dir, encoding: 'utf8', env: noPromptEnv });

    expect(r.status).toBe(0); // proceeds straight through — the skip branch, not a false negative
    expect(r.stderr).not.toContain('launch refused');
    expect(existsSync(sentinel)).toBe(true);
  });

  test('a custom prompt whose text merely STARTS with a path-like token is NOT misread as an invocation', () => {
    // Hardening: the invocation match is anchored to the exact emitted shape (`/name` or `$name`, a lone
    // skill-name token). A hand-authored AUTONOMY_PROMPT_DIR prompt like "/tmp/notes.md summarize" starts
    // with a `/`-token but is NOT a skill invocation — the old greedy `/^[/$](\S+)/` would have read behavior
    // "tmp/notes.md" and false-refused. It must skip the check and launch normally.
    const { dir } = scaffold();
    const customPromptDir = join(dir, 'custom-prompts');
    mkdirSync(customPromptDir, { recursive: true });
    writeFileSync(join(customPromptDir, 'develop.txt'), '/tmp/notes.md summarize the notes\n');
    const sentinel = join(dir, 'sentinel.log');

    const r = spawnSync('node', ['scripts/autonomy-runner.mjs', 'launch', 'develop'], {
      cwd: dir,
      encoding: 'utf8',
      env: env({ OA08_SESSION_SENTINEL: sentinel, AUTONOMY_PROMPT_DIR: customPromptDir }),
    });

    expect(r.status).toBe(0); // no false refusal — the anchored match rejected the path-like token
    expect(r.stderr).not.toContain('launch refused');
    expect(existsSync(sentinel)).toBe(true);
  });
});
