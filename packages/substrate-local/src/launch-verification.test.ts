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
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { AutonomyIR } from '@open-autonomy/core';
import { compileLocal } from './emit';
import { skillPathFor } from './runner-frontend';

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

// A minimal but functionally REAL `termfleet` + `@termfleet/core` pair — satisfies backend.mjs's exact
// import surface. createAgentWindow only succeeds (and only writes the OA08_SESSION_SENTINEL sentinel) when
// actually called; OA08_STUB_PROVIDER_DOWN simulates AC-3's "termfleet's provider down" scenario.
function installStubTermfleet(dir: string): void {
  const nm = join(dir, 'node_modules');
  mkdirSync(join(nm, 'termfleet'), { recursive: true });
  writeFileSync(
    join(nm, 'termfleet', 'package.json'),
    JSON.stringify({ name: 'termfleet', version: '0.0.0-stub', type: 'module', main: './index.js', exports: { '.': './index.js' } }),
  );
  writeFileSync(
    join(nm, 'termfleet', 'index.js'),
    `import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
export function providerRefFromUrl(url) { return { url }; }
let counter = 0;
export class ProviderClient {
  constructor(ref) { this.ref = ref; }
  async createAgentWindow(opts) {
    if (process.env.OA08_STUB_PROVIDER_DOWN === '1') throw new Error('OA08 stub: termfleet provider unreachable (simulated)');
    const id = 'stub-terminal-' + (++counter) + '-' + Date.now();
    const sentinel = process.env.OA08_SESSION_SENTINEL;
    if (sentinel) {
      mkdirSync(dirname(sentinel), { recursive: true });
      appendFileSync(sentinel, JSON.stringify({ id, agent: opts.name, cwd: opts.cwd }) + '\\n');
    }
    return { result: { terminalId: id } };
  }
  async lifecycle() { return { sessions: [] }; }
  async snapshot() {
    const sentinel = process.env.OA08_SESSION_SENTINEL;
    let windows = [];
    if (sentinel && existsSync(sentinel)) {
      windows = readFileSync(sentinel, 'utf8').trim().split('\\n').filter(Boolean).map((l) => {
        const rec = JSON.parse(l);
        return { id: 0, name: rec.agent, terminalId: rec.id, lifecycle: {} };
      });
    }
    return { windows };
  }
  async closeWindow() { return { ok: true }; }
}
`,
  );
  mkdirSync(join(nm, '@termfleet', 'core'), { recursive: true });
  writeFileSync(
    join(nm, '@termfleet', 'core', 'package.json'),
    JSON.stringify({ name: '@termfleet/core', version: '0.0.0-stub', type: 'module', exports: { './local-providers.js': './local-providers.js' } }),
  );
  writeFileSync(
    join(nm, '@termfleet', 'core', 'local-providers.js'),
    `export async function resolveDefaultProvider() { return { baseUrl: 'http://127.0.0.1:0' }; }\n`,
  );
}

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
  return { dir };
}

function effectsCount(dir: string): number {
  try {
    return readdirSync(join(dir, '.open-autonomy', 'runner-state', 'effects')).filter((f) => f.endsWith('.json')).length;
  } catch {
    return 0; // no effects dir at all -> zero
  }
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
      env: { ...process.env, OA08_SESSION_SENTINEL: sentinel },
    });

    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('launch refused');
    expect(r.stderr).toContain('develop'); // the agent
    expect(r.stderr).toContain('.worktrees/agent-issue-7/.claude/skills/develop/SKILL.md'); // the EXACT missing path
    expect(r.stderr).toContain('Commit the harness'); // remediation
    expect(r.stderr).toContain('docs/OPERATIONS.md#local-runner-quickstart');
    expect(r.stderr).toContain('agent/issue-7'); // the branch, named

    expect(existsSync(sentinel)).toBe(false); // createAgentWindow was NEVER called — no session

    const list = spawnSync('bun', ['scripts/runner.ts', 'list', 'develop'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, OA08_SESSION_SENTINEL: sentinel },
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
      env: { ...process.env, OA08_SESSION_SENTINEL: sentinel },
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
      env: { ...process.env, OA08_SESSION_SENTINEL: sentinel, OA08_STUB_PROVIDER_DOWN: '1' },
    });

    expect(r.status).not.toBe(0); // the thrown createAgentWindow error must reach the CLI's own exit code
    expect(r.stderr).not.toContain('launch refused'); // this is NOT the skill pre-check — the skill exists
    expect(existsSync(sentinel)).toBe(false); // the provider never got far enough to create a session
  });

  test('AC-5 (regression): skill intact -> launch still succeeds and creates a session exactly as before', () => {
    const { dir } = scaffold();
    const sentinel = join(dir, 'sentinel.log');

    const r = spawnSync('bun', ['scripts/runner.ts', 'launch', 'develop', '--ref', '9', '--branch', 'agent/issue-9'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, OA08_SESSION_SENTINEL: sentinel },
    });

    expect(r.status).toBe(0);
    expect(r.stderr).not.toContain('launch refused');
    expect(existsSync(sentinel)).toBe(true); // a real session got created (through the REAL backend)

    const list = spawnSync('bun', ['scripts/runner.ts', 'list', 'develop'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, OA08_SESSION_SENTINEL: sentinel },
    });
    const sessions = JSON.parse(list.stdout || '[]') as Array<{ status: string }>;
    expect(sessions.some((s) => s.status === 'running')).toBe(true); // `list` shows it running, as today
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
      env: { ...process.env, OA08_SESSION_SENTINEL: sentinel, AUTONOMY_PROMPT_DIR: promptDir },
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
      env: { ...process.env, OA08_SESSION_SENTINEL: sentinel },
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
      env: { ...process.env, OA08_SESSION_SENTINEL: sentinel },
    });

    expect(r.stderr).toContain('launch refused');
    expect(r.stderr).toContain(join(dir, '.claude', 'skills', 'pm', 'SKILL.md'));
    expect(existsSync(sentinel)).toBe(false);

    const list = spawnSync('node', ['scripts/autonomy-runner.mjs', 'list'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, OA08_SESSION_SENTINEL: sentinel },
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
      env: { ...process.env, OA08_SESSION_SENTINEL: sentinel, AUTONOMY_PROMPT_DIR: promptDir },
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
    const env = { ...envWithoutPromptDir, OA08_SESSION_SENTINEL: sentinel };

    const r = spawnSync('node', ['scripts/autonomy-runner.mjs', 'launch', 'develop'], { cwd: dir, encoding: 'utf8', env });

    expect(r.status).toBe(0); // proceeds straight through — the skip branch, not a false negative
    expect(r.stderr).not.toContain('launch refused');
    expect(existsSync(sentinel)).toBe(true);
  });
});
