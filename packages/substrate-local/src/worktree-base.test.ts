// F-2/OA-02: the base ref for a NEW agent worktree branch is a function of the DECLARED code host, never
// of repo shape (never "does a remote exist", never "did the fetch succeed"). Two layers proven here:
//   1. the truth table over `worktreeBase`, the extracted pure decision (mirrors the `mergeInFlight`
//      pattern) — testable without a live termfleet stack or a real git repo;
//   2. an INTEGRATION case that drives the real emitted runner (scripts/runner.ts — runner-frontend.ts
//      verbatim) end-to-end against a scratch git fixture, discriminating ensureWorktree's RUNTIME gate
//      itself: the helper carries its own codeHost check, so the truth table alone would stay green if
//      the gate at the call site were reverted to repo-shape sniffing (the panel's tamper probe).
// See docs/adoption-fixes/OA-02-*.md for the full spec.
import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { AutonomyIR } from '@open-autonomy/core';
import { compileLocal } from './emit';
import { worktreeBase } from './runner-frontend';

describe('worktreeBase — truth table (spec AC-3)', () => {
  test('local-git + resolvable origin/<trunk> -> HEAD (never the remote, even when it resolves)', () => {
    expect(worktreeBase('local-git', true, 'main')).toBe('HEAD');
  });

  test('undeclared codeHost (\'\', e.g. the hello profile) + resolvable origin/<trunk> -> HEAD', () => {
    expect(worktreeBase('', true, 'main')).toBe('HEAD');
  });

  test('github + resolvable origin/<trunk> -> origin/<trunk>', () => {
    expect(worktreeBase('github', true, 'main')).toBe('origin/main');
  });

  test('github + unresolved origin/<trunk> (no remote / fetch failed) -> HEAD', () => {
    expect(worktreeBase('github', false, 'main')).toBe('HEAD');
  });
});

// --- integration: the REAL ensureWorktree path in the REAL emitted runner, against a real git repo ---------

const localGitIr: AutonomyIR = {
  schema: 'autonomy.ir.v1',
  targets: ['termfleet'],
  codeHost: 'local-git',
  agents: {
    pm: { behavior: 'pm', capabilities: ['agent:launch'], triggers: [{ cron: '*/15 * * * *' }] },
    develop: { behavior: 'develop', capabilities: [], triggers: [{ dispatch: true }] },
  },
  policy: { box: {} },
  resources: [],
};

const tmps: string[] = [];
afterEach(() => {
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true }); // mkdtemp paths only — never a bare variable
});

const sh = (cmd: string, args: string[], cwd: string, env?: Record<string, string>) =>
  spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: 60_000, ...(env ? { env: { ...process.env, ...env } } : {}) });
const gitIn = (cwd: string, ...args: string[]) => {
  const r = sh('git', args, cwd);
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
};

/** A repo the audit's defect fired on: a remote EXISTS and its origin/main REF resolves — to a stale
 *  commit that predates the harness — but the declared codeHost is local-git. The remote URL points at a
 *  closed local port (fail-fast, never network), which is all the defect needed: the old code based the
 *  worktree on the resolvable stale REF whether or not the fetch succeeded (the AC-2 finding). */
function scaffoldLocalGitRepoWithStaleOrigin(): { dir: string; staleSha: string; headSha: string; spyLog: string; spyPath: string } {
  const dir = mkdtempSync(join(tmpdir(), 'oa02-worktree-'));
  tmps.push(dir);

  gitIn(dir, 'init', '-q', '-b', 'main');
  gitIn(dir, 'config', 'user.email', 'test@example.invalid');
  gitIn(dir, 'config', 'user.name', 'oa02-test');
  writeFileSync(join(dir, 'stale.txt'), 'the pre-harness state the remote knows about\n');
  gitIn(dir, 'add', '-A');
  gitIn(dir, 'commit', '-q', '-m', 'stale: what origin/main points at');
  const staleSha = gitIn(dir, 'rev-parse', 'HEAD');
  gitIn(dir, 'remote', 'add', 'origin', 'https://127.0.0.1:1/nope.git'); // remote exists; unreachable by design
  gitIn(dir, 'update-ref', 'refs/remotes/origin/main', staleSha); // origin/main RESOLVES (the defect's trigger)

  // The committed-but-unpushed harness: the real emitted install (runner.ts IS runner-frontend.ts verbatim)
  // plus a marker file standing in for the profile-copied skills. run-agent.mjs is stubbed AFTER the
  // worktree seam under test — the real one imports termfleet, absent in this hermetic fixture.
  const compiled = compileLocal(localGitIr);
  for (const [path, content] of Object.entries(compiled.generated)) {
    mkdirSync(join(dir, dirname(path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  // `develop`'s skill file must actually exist for OA-08's launch pre-check to let this launch through — this
  // fixture is about the worktree-BASE decision, not the skill check, so a real (stub) SKILL.md at every
  // copy path compileLocal declares is enough; it is not itself under test here (see launch-verification.test.ts).
  for (const copy of compiled.copies) {
    mkdirSync(join(dir, dirname(copy.to)), { recursive: true });
    writeFileSync(join(dir, copy.to), `# stub SKILL.md for ${copy.to}\n`);
  }
  // This fixture proves the worktree-base decision (OA-02), not the day-one pause fence (OA-07) — a fresh
  // compileLocal() lands paused by default, which would refuse the launch below for an unrelated reason.
  // Unpause here, exactly like an operator's `rm .open-autonomy/paused` would.
  rmSync(join(dir, '.open-autonomy', 'paused'), { force: true });
  writeFileSync(join(dir, 'scripts', 'run-agent.mjs'), 'process.exit(0);\n');
  writeFileSync(join(dir, 'harness-marker.txt'), 'committed locally, never pushed\n');
  gitIn(dir, 'add', '-A');
  gitIn(dir, 'commit', '-q', '-m', 'install harness (committed, NOT pushed)');
  const headSha = gitIn(dir, 'rev-parse', 'HEAD');

  // A PATH-shim git spy: logs every git argv the runner invokes, then execs the real git.
  const realGit = Bun.which('git');
  if (!realGit) throw new Error('git not found on PATH');
  const spyDir = join(dir, '.gitspy');
  mkdirSync(spyDir);
  const spyLog = join(spyDir, 'invocations.log');
  const spyPath = join(spyDir, 'git');
  writeFileSync(spyPath, `#!/bin/sh\necho "$*" >> "${spyLog}"\nexec "${realGit}" "$@"\n`);
  chmodSync(spyPath, 0o755);
  return { dir, staleSha, headSha, spyLog, spyPath };
}

describe('ensureWorktree (integration) — the emitted runner bases a local-git worktree on local HEAD, no fetch', () => {
  test('launch on a repo with a resolvable stale origin/main: harness visible, HEAD-based, zero remote git calls', () => {
    const { dir, staleSha, headSha, spyLog, spyPath } = scaffoldLocalGitRepoWithStaleOrigin();

    const r = sh('bun', ['scripts/runner.ts', 'launch', 'develop', '--ref', '1', '--branch', 'agent/issue-1'], dir, {
      PATH: `${dirname(spyPath)}:${process.env.PATH ?? ''}`,
      GITSPY_LOG: spyLog, // unused by the shim (path is baked in) but handy when debugging
    });
    expect(r.status).toBe(0);

    const worktree = join(dir, '.worktrees', 'agent-issue-1');
    // (a) the committed-but-unpushed harness is VISIBLE in the worktree (the audit's failing assertion)
    expect(existsSync(join(worktree, 'harness-marker.txt'))).toBe(true);
    // (b) the worktree is based on local HEAD (the harness commit), not the stale-but-resolvable origin/main
    expect(gitIn(worktree, 'rev-parse', 'HEAD')).toBe(headSha);
    expect(gitIn(worktree, 'rev-parse', 'HEAD')).not.toBe(staleSha);
    // (c) the runner never touched the remote: no fetch, no origin/<trunk> lookup, in ANY git invocation
    const invocations = readFileSync(spyLog, 'utf8');
    expect(invocations).toContain('worktree add'); // the spy did observe the runner's git traffic
    expect(invocations).not.toContain('fetch');
    expect(invocations).not.toContain('origin/');
  });
});
