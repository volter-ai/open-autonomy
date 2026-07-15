// OA-08 AC-7: the PM's "## Failed launches" doctrine (profiles/simple-sdlc/skills/pm/SKILL.md :103-132) was
// left "live-pending" — proven behaviorally, not committed as a durable test. This file closes it as a
// COMMITTED DETERMINISTIC demonstration with NO live model.
//
// What is proven here, and how:
//   1. A REAL compiled+committed simple-sdlc install (scaffold(), mirroring launch-verification.test.ts's
//      pattern but NOT importing/editing that file — duplicated here per this task's guardrails) with a REAL
//      ztrack board (`ztrack init --preset simple-sdlc`, the bundled preset this profile declares via
//      `policy.box.tracker.ztrackPreset` — see profiles/simple-sdlc/ir.yml).
//   2. A COMMITTED deletion of the develop skill (`git rm -r .claude/skills/develop && git commit`) — the
//      same real broken-develop state AC-1/AC-2 use, and the permanent-brokenness the spec's AC-7 demo
//      describes ("with a permanently broken develop skill").
//   3. Three ticks driven by a CANNED PM (packages/substrate-local/src/test-support/canned-pm-escalation.ts)
//      that replays the doctrine's exact ztrack commands over the REAL, already model-free runner-refusal
//      path (runner-frontend.ts's pre-check, proven by launch-verification.test.ts's AC-1/AC-3):
//        tick 1: dispatch -> refused (non-zero, no session, no effect marker, worktree torn down) -> label
//                `launch-failed` + comment (real ztrack writes, real board read confirms it stuck).
//        tick 2: board still carries `launch-failed` (read fresh, independent of tick 1's process) ->
//                dispatch AGAIN -> refused again -> label `human-required` + comment + the tick's
//                `OUTCOME: blocked launch-failure <id>` line.
//        tick 3: board carries `human-required` -> the canned PM dispatches NOTHING (no subprocess spawned
//                at all) -> label set unchanged.
//
// HONEST BOUNDARY (read before trusting this as "the PM is proven"): this suite proves the board-mechanics
// half — label -> one retry -> human-required -> stop — and the REAL model-free runner-refusal exit code,
// deterministically and durably (it survives a full repo wipe: nothing here depends on a live process or an
// external service). It does NOT prove that a real-model PM, handed only SKILL.md and the board each tick,
// independently READS the doctrine and DECIDES to take these exact actions — that judgment is canned in
// test-support/canned-pm-escalation.ts (its function body is a direct transcription of SKILL.md :103-132,
// not independently derived). Model judgment over doctrine is inherently live-only and is NOT re-proven here,
// consistent with the repo's existing PM-doctrine testing posture (spec AC-7's own text: "verified
// behaviorally, not unit-tested"; CLAUDE.md's "Built vs designed" already names the sibling case —
// escalate-on-SLA — as a live-proven `test.todo`, never a unit test). Named residual gap: a live/bench run of
// the ACTUAL `pm` skill (model-driven) reproducing this same 3-tick arc remains the only proof of the
// judgment layer; this file is deliberately NOT that proof and does not claim to be.
//
// Real termfleet is not available in this environment (and must never be paired with a real coding CLI here
// — see live-agent-test-safety); a minimal STUB `termfleet` + `@termfleet/core` pair is installed into the
// fixture (verbatim copy of launch-verification.test.ts's `installStubTermfleet`, duplicated per this task's
// "do not edit that file" guardrail), satisfying exactly backend.mjs's import surface with a fake
// createAgentWindow that writes a sentinel file only when actually invoked — the same tamper probe.
import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { AutonomyIR } from '@open-autonomy/core';
import { compileLocal } from './emit';
import { readComments, readLabels, resolveZtrackCli, runCannedPmTick, ztrackOk } from './test-support/canned-pm-escalation';

// --- fixture IR: same shape as launch-verification.test.ts (codeHost 'github' makes "no effect marker" a
// real discriminator of the pre-check, not vacuously true — an isolated launch that actually SUCCEEDED would
// record one on session completion). ---
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

// Verbatim duplicate of launch-verification.test.ts's installStubTermfleet — that file is owned by another
// builder and is NOT edited here; this is this file's own copy, per this task's explicit instruction to
// "replicate the setup in your own new test/helpers".
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

// Symlink the repo's own real `ztrack` package into the fixture's node_modules — NOT needed for
// `issue create/edit/comment/view` (the canned driver invokes ztrack's CLI by absolute path, which resolves
// its OWN deps from where it actually lives, regardless of the fixture's cwd), but the installed
// `.volter/tracker/validation/preset.mts` itself does `import ... from 'ztrack/preset-kit'` and that import
// resolves relative to the FIXTURE, so a real `ztrack check` (used once below, to prove the board is not just
// label-scribbled but genuinely preset-valid) needs `ztrack` resolvable as a project dependency there too.
function linkZtrackForCheck(dir: string): void {
  const cli = resolveZtrackCli(); // .../node_modules/.bun/ztrack@X/node_modules/ztrack/dist/cli.js
  const pkgDir = dirname(dirname(cli)); // .../node_modules/.bun/ztrack@X/node_modules/ztrack
  const link = join(dir, 'node_modules', 'ztrack');
  mkdirSync(dirname(link), { recursive: true });
  if (!existsSync(link)) symlinkSync(pkgDir, link, 'dir');
}

const tmps: string[] = [];
afterEach(() => {
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true }); // mkdtemp paths only
});

function effectsCount(dir: string): number {
  try {
    return readdirSync(join(dir, '.open-autonomy', 'runner-state', 'effects')).filter((f) => f.endsWith('.json')).length;
  } catch {
    return 0;
  }
}

// PIN the harness (see launch-verification.test.ts's identical comment: a CI box exporting a different
// TERMFLEET_AGENT would make the develop-skill deletion below spuriously not match what the pre-check checks).
function env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { ...process.env, TERMFLEET_AGENT: 'claude', ...extra };
}

// A real compiled install + a real committed ztrack board (simple-sdlc preset), stub-termfleet-equipped,
// committed to a real git repo. `git rm -r .claude/skills/develop && git commit` (this file's own recipe,
// AC-1/AC-2's literal pattern) works exactly as it would on a real adopter's install.
function scaffold(): { dir: string; issueId: string } {
  const out = compileLocal(ir);
  const dir = mkdtempSync(join(tmpdir(), 'oa08-pm-'));
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
  linkZtrackForCheck(dir);

  gitOk(dir, ['init', '-q', '-b', 'main']);
  gitOk(dir, ['config', 'user.email', 'oa08-pm-test@example.invalid']);
  gitOk(dir, ['config', 'user.name', 'oa08-pm-test']);

  // REAL ztrack board: the bundled preset this profile declares (policy.box.tracker.ztrackPreset: simple-sdlc
  // in profiles/simple-sdlc/ir.yml) — installs .volter/tracker-config.json + validation/preset.mts + a
  // markdown issue store at .volter/tracker/markdown/, which IS committed (not gitignored — verified: ztrack
  // init's generated .gitignore only excludes tracker.sqlite/local-store.json/etc, never the markdown store).
  // That committed markdown front-matter is the durable, cross-tick memory this AC is about.
  const ztrackCli = resolveZtrackCli();
  const initR = spawnSync(process.execPath, [ztrackCli, 'init', '--preset', 'simple-sdlc'], { cwd: dir, encoding: 'utf8' });
  if (initR.status !== 0) throw new Error(`ztrack init failed: ${initR.stderr || initR.stdout}`);

  const createR = spawnSync(
    process.execPath,
    [
      ztrackCli,
      'issue',
      'create',
      '--title',
      'OA-08 AC-7 escalation demo',
      '--state',
      'ready',
      '--body',
      '# OA-08 AC-7 escalation demo\n\nA fixture issue for the launch-failed escalation doctrine.\n\n' +
        '## Acceptance Criteria\n\n- [ ] dev/01 v1 Demonstrate the develop skill resolving and completing.\n  - status: pending\n',
    ],
    { cwd: dir, encoding: 'utf8' },
  );
  if (createR.status !== 0) throw new Error(`ztrack issue create failed: ${createR.stderr || createR.stdout}`);
  const issueId = (JSON.parse(createR.stdout) as { identifier: string }).identifier;

  gitOk(dir, ['add', '-A']);
  gitOk(dir, ['commit', '-q', '-m', 'install harness + ztrack board (simple-sdlc preset), issue ' + issueId]);
  gitOk(dir, ['remote', 'add', 'origin', '.']);
  gitOk(dir, ['fetch', '-q', 'origin', 'main']);
  gitOk(dir, ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main']);
  return { dir, issueId };
}

describe('OA-08 AC-7: canned PM escalation over the REAL model-free runner-refusal path', () => {
  // Generous timeout: this test drives MANY real subprocesses (git init/rm/commit, a real `ztrack init` +
  // `issue create`, two REAL `bun scripts/runner.ts launch` invocations — each of which creates AND tears
  // down a git worktree — several `ztrack issue edit`/`comment` calls, and a final real `ztrack check`).
  // That is the whole point (no mocked mechanism), but it is measurably slower than bun test's 5s default
  // under load; 30s leaves ample headroom without masking a genuine hang.
  test('3-tick arc: launch-failed (tick 1) -> human-required + OUTCOME (tick 2) -> hands off (tick 3)', () => {
    const { dir, issueId } = scaffold();
    const branch = `agent/issue-${issueId}`;
    const worktree = join(dir, '.worktrees', branch.replace(/[^0-9A-Za-z._-]/g, '-'));
    const sentinel = join(dir, 'sentinel.log');
    const runEnv = env({ OA08_SESSION_SENTINEL: sentinel });

    // Real, COMMITTED breakage: the exact recipe AC-1/AC-2 use, and AC-7's "permanently broken develop
    // skill" scenario (the cause is never fixed across these 3 ticks — the escalation must fire on its own).
    gitOk(dir, ['rm', '-r', '.claude/skills/develop']);
    gitOk(dir, ['commit', '-q', '-m', 'break develop (permanently, for this AC-7 demo)']);

    // Sanity: the board starts clean.
    expect(readLabels(dir, issueId)).toEqual([]);

    // ---- Tick 1 -------------------------------------------------------------------------------------
    const tick1 = runCannedPmTick({ dir, issueId, branch, env: runEnv });

    expect(tick1.action).toBe('first-failure');
    expect(tick1.dispatched).toBe(true);
    expect(tick1.launch).not.toBeNull();
    expect(tick1.launch!.status).not.toBe(0); // the REAL runner refused
    expect(tick1.launch!.stderr).toContain('launch refused');
    expect(existsSync(sentinel)).toBe(false); // createAgentWindow was NEVER called — no session
    expect(effectsCount(dir)).toBe(0); // no post-session effect marker either
    expect(existsSync(worktree)).toBe(false); // the just-created worktree was torn down
    expect(git(dir, ['rev-parse', '--verify', '--quiet', branch]).status).not.toBe(0); // branch gone too

    expect(tick1.labelsAfter).toEqual(['launch-failed']); // the REAL board now carries the marker
    // independent re-read (not tick1's own cached value) — proves it's durable, not just an in-memory fact
    expect(readLabels(dir, issueId)).toEqual(['launch-failed']);
    expect(readComments(dir, issueId).some((c) => c.includes('launch refused'))).toBe(true);

    // ---- Tick 2 --------------------------------------------------------------------------------------
    // A fresh, independent read at the top of tick 2 — this is the ONLY memory across ticks (the board),
    // exactly as the doctrine states ("a tick is a fresh session — the board is the only memory").
    expect(readLabels(dir, issueId)).toContain('launch-failed');

    const tick2 = runCannedPmTick({ dir, issueId, branch, env: runEnv });

    expect(tick2.action).toBe('second-failure-escalate');
    expect(tick2.dispatched).toBe(true);
    expect(tick2.launch).not.toBeNull();
    expect(tick2.launch!.status).not.toBe(0); // refused again — the skill is still (permanently) missing
    expect(existsSync(sentinel)).toBe(false); // still no session, ever
    expect(effectsCount(dir)).toBe(0);
    expect(existsSync(worktree)).toBe(false);
    expect(git(dir, ['rev-parse', '--verify', '--quiet', branch]).status).not.toBe(0);

    expect(tick2.outcomeLine).toBe(`OUTCOME: blocked launch-failure ${issueId}`);
    expect(new Set(tick2.labelsAfter)).toEqual(new Set(['launch-failed', 'human-required']));
    expect(new Set(readLabels(dir, issueId))).toEqual(new Set(['launch-failed', 'human-required']));
    expect(readComments(dir, issueId).filter((c) => c.includes('launch refused')).length).toBe(2); // one per failed tick

    // ---- Tick 3 ---------------------------------------------------------------------------------------
    expect(readLabels(dir, issueId)).toContain('human-required');
    const labelsBeforeTick3 = readLabels(dir, issueId);

    const tick3 = runCannedPmTick({ dir, issueId, branch, env: runEnv });

    expect(tick3.action).toBe('skip-human-required');
    expect(tick3.dispatched).toBe(false);
    expect(tick3.launch).toBeNull(); // NO subprocess was even spawned — no 3rd `launch develop` invocation
    expect(new Set(tick3.labelsAfter)).toEqual(new Set(labelsBeforeTick3)); // label set unchanged
    expect(existsSync(sentinel)).toBe(false); // still, and forever in this arc, no session

    // Belt-and-suspenders on "no 3rd invocation": re-read comments — exactly 2 error comments exist (one per
    // tick that actually dispatched), never a 3rd.
    expect(readComments(dir, issueId).filter((c) => c.includes('launch refused')).length).toBe(2);

    // The board is a REAL, preset-valid ztrack board throughout (not just label-scribbled markdown) — a
    // genuine `ztrack check` on this exact issue runs clean apart from the still-open dev AC (which is
    // correct: the work was never actually done — every attempt to dispatch it was refused before any model
    // spend). This is the "not silently faked" proof for the whole fixture.
    const checkR = ztrackOk(dir, ['check', issueId, '--json']);
    const checkResult = JSON.parse(checkR) as { findings: Array<{ code: string }> };
    // no finding OTHER than the expected "still a pending dev AC" — i.e. the label/comment writes themselves
    // introduced no validation errors.
    expect(checkResult.findings.every((f) => f.code === 'ready_requires_dev_ac' || f.code === 'dev_ac_incomplete')).toBe(true);
  }, 30_000);
});
