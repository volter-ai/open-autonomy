// OA-07 AC-7/AC-8: the day-one backlog-fence PM doctrine (profiles/simple-sdlc/skills/pm/SKILL.md:18-23,
// 79-80,85-93) was landed as PRODUCT CODE + doctrine prose but left "live-pending" on its own two
// acceptance criteria — proven behaviorally (per the spec), not committed as a durable test. This file
// closes both as COMMITTED DETERMINISTIC demonstrations with NO live model, modeled directly on OA-08's
// pm-escalation.test.ts (same fixture shape, same stub-termfleet safety rail, same honest-boundary
// posture for the sibling PM-doctrine gap).
//
// The doctrine under test, quoted verbatim from profiles/simple-sdlc/skills/pm/SKILL.md (read on
// `adoption-fixes-backlog`):
//
//   :18-23  "Also consult `policy.dispatch` in `.open-autonomy/autonomy.yml`. Under `mode: allowlist`, a
//           `ready` issue **without** the label named in `allow_label` (e.g. `oa-approved`) is a day-one
//           fence against a pre-existing backlog nobody has opted in yet — it is **ineligible for develop
//           regardless of its `ready` state**: never dispatch it, and report it as `fenced (no
//           <allow_label>)` in your tick output (do not treat it as blocked-for-human — it's not a
//           decision, it's simply not yet opted in). Under `mode: open` (or no `policy.dispatch` box at
//           all), every `ready` issue is eligible on this axis."
//   :79-80  the Develop rule's fresh-work clause: "a `ready` issue with **no** `agent/issue-<id>` branch
//           yet (fresh work) **and**, under `policy.dispatch.mode: allowlist`, carrying `allow_label`".
//   :85-93  "Before launching, `ztrack issue view <id>` and read the body. State (`ready`) says the issue
//           *can* be implemented; it says nothing about whether it *should be* right now. An explicit
//           do-not-dispatch / deferred / blocked-by / on-hold marker in the body (or a citation of a
//           decision record deferring it) makes the issue **ineligible regardless of its `ready` state —
//           prose wins over state**. Treat it exactly like the human-required case above: do not dispatch;
//           report it as blocked-for-human in tick output, and move on to the next-eligible candidate this
//           same tick (don't just stop). Re-reading the body every tick means a deferred issue is refused
//           every tick, not just the first time — there is no separate 'already saw this' memory to
//           maintain."
//
// What is proven here, and how (mirrors OA-08's own posture exactly):
//   1. A REAL compiled+committed simple-sdlc-shaped install (compileLocal(ir), same fixture pattern as
//      pm-escalation.test.ts — NOT importing/editing that file, a private duplicate per this task's
//      guardrails) with a REAL ztrack board (`ztrack init --preset simple-sdlc`), and a REAL
//      `.open-autonomy/autonomy.yml` carrying `policy.dispatch.mode: allowlist` /
//      `policy.dispatch.allow_label: oa-approved` (the exact channel the doctrine names).
//   2. The develop skill is left INTACT (unlike OA-08's AC-7, which deletes it to force refusal) — this
//      suite is about WHICH issues get dispatched, not whether a dispatch itself can succeed, so a
//      successful dispatch must be observable: the SHARED model-free stub termfleet provider
//      (test-support/stub-termfleet.ts) records every real `createAgentWindow` call it receives to
//      `OA_STUB_TF_SESSIONS_FILE` — proving exactly which issue (and only which issue) got a session.
//   3. A CANNED PM driver (test-support/canned-pm-dispatch-fence.ts) that replays the doctrine's exact
//      `policy.dispatch` read, `ztrack issue view` body read, and `bun scripts/runner.ts launch develop`
//      dispatch over the REAL mechanisms — the tick output it returns is asserted against directly.
//
// HONEST BOUNDARY (read before trusting this as "the PM is proven" — read pm-dispatch-fence.test.ts's own
// section 4 in docs/adoption-fixes/proofs/oa-07.md for the full statement): this suite proves the
// MECHANISM half — policy read, board read, per-issue body read, and the REAL launch dispatch landing a
// session for exactly the eligible issue — deterministically and durably. It does NOT prove that a
// real-model PM, handed only SKILL.md and the board each fresh tick, independently READS the doctrine and
// DECIDES to take these exact actions: that judgment is canned in
// test-support/canned-pm-dispatch-fence.ts's `runDispatchFenceTick`, a direct transcription of SKILL.md's
// rules, not independently derived. Model judgment over doctrine (in particular, a model's own reading
// comprehension of an arbitrary prose deferral marker) is inherently live-only and is NOT re-proven here —
// consistent with the repo's existing PM-doctrine testing posture (OA-08's own AC-7 honest boundary;
// CLAUDE.md's "Built vs designed" names the sibling escalate-on-SLA case as a live-proven `test.todo`,
// never a unit test). Named residual gap: a live/bench run of the ACTUAL `pm` skill (model-driven)
// reproducing this same fence-and-defer arc remains the only proof of the judgment layer; this file is
// deliberately NOT that proof and does not claim to be.
//
// Real termfleet is not available in this environment (and must never be paired with a real coding CLI
// here — see the live-agent-test-safety rail, OA-09 incident); the SHARED stub `termfleet` +
// `@termfleet/core` pair (test-support/stub-termfleet.ts) satisfies backend.mjs's exact import surface
// with a fake createAgentWindow that only ever writes a sentinel record — no model call, no billed agent,
// ever.
import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { AutonomyIR } from '@open-autonomy/core';
import { compileLocal } from './emit';
import { installStubTermfleet } from './test-support/stub-termfleet';
import { runDispatchFenceTick } from './test-support/canned-pm-dispatch-fence';

const require = createRequire(import.meta.url);

// --- fixture IR: same shape as OA-08's pm-escalation.test.ts, PLUS the OA-07 `policy.dispatch` box this
// suite is about. `codeHost: 'github'` mirrors that fixture (keeps a successful isolated launch's
// post-session effect path exercised, same as OA-08 — not itself asserted on here, but keeping the same
// shape avoids a fixture drift between the two suites). ---
const ir: AutonomyIR = {
  schema: 'autonomy.ir.v1',
  targets: ['local'],
  codeHost: 'github',
  agents: {
    pm: { behavior: 'pm', capabilities: ['agent:launch'], triggers: [{ cron: '*/15 * * * *' }] },
    develop: { behavior: 'develop', capabilities: ['code:propose'], triggers: [{ dispatch: true }], review: 'develop' },
  },
  policy: {
    box: {
      dispatch: { mode: 'allowlist', allow_label: 'oa-approved' },
    },
  },
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

// Resolves the repo's pinned ztrack CLI, for this test file's OWN scaffold/fixture calls (`ztrack init` /
// `issue create` / `issue edit`) — a private duplicate of the driver's identical helper (mirrors OA-08's
// test file, which duplicates its own copy rather than importing the driver's internals for setup).
function resolveZtrackCli(): string {
  return require.resolve('ztrack/package.json').replace(/package\.json$/, 'dist/cli.js');
}

const tmps: string[] = [];
afterEach(() => {
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true }); // mkdtemp paths only
});

// PIN the harness (see launch-verification.test.ts's identical comment: a CI box exporting a different
// TERMFLEET_AGENT would make develop-skill resolution below spuriously not match).
function env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { ...process.env, TERMFLEET_AGENT: 'claude', ...extra };
}

function sessionRecords(sentinel: string): Array<{ id: string; agent: string; cwd: string }> {
  if (!existsSync(sentinel)) return [];
  return readFileSync(sentinel, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { id: string; agent: string; cwd: string });
}

// A real compiled install + a real committed ztrack board (simple-sdlc-shaped preset), stub-termfleet
// equipped, committed to a real git repo — mirrors OA-08's scaffold() exactly, minus the develop-skill
// deletion (this suite needs a develop dispatch to be able to SUCCEED for the eligible issue).
function scaffold(): { dir: string } {
  const out = compileLocal(ir);
  const dir = mkdtempSync(join(tmpdir(), 'oa07-pm-'));
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
  rmSync(join(dir, '.open-autonomy', 'paused'), { force: true }); // OA-07's pause fence is not this suite's concern
  installStubTermfleet(dir);

  gitOk(dir, ['init', '-q', '-b', 'main']);
  gitOk(dir, ['config', 'user.email', 'oa07-pm-test@example.invalid']);
  gitOk(dir, ['config', 'user.name', 'oa07-pm-test']);

  const ztrackCli = resolveZtrackCli();
  const initR = spawnSync(process.execPath, [ztrackCli, 'init', '--preset', 'simple-sdlc'], { cwd: dir, encoding: 'utf8' });
  if (initR.status !== 0) throw new Error(`ztrack init failed: ${initR.stderr || initR.stdout}`);

  gitOk(dir, ['add', '-A']);
  gitOk(dir, ['commit', '-q', '-m', 'install harness + ztrack board (simple-sdlc preset)']);
  return { dir };
}

function createIssue(dir: string, title: string, body: string): string {
  const ztrackCli = resolveZtrackCli();
  const createR = spawnSync(process.execPath, [ztrackCli, 'issue', 'create', '--title', title, '--state', 'ready', '--body', body], {
    cwd: dir,
    encoding: 'utf8',
  });
  if (createR.status !== 0) throw new Error(`ztrack issue create failed: ${createR.stderr || createR.stdout}`);
  return (JSON.parse(createR.stdout) as { identifier: string }).identifier;
}

function addLabel(dir: string, issueId: string, label: string): void {
  const ztrackCli = resolveZtrackCli();
  const r = spawnSync(process.execPath, [ztrackCli, 'issue', 'edit', issueId, '--add-label', label], { cwd: dir, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ztrack issue edit --add-label failed: ${r.stderr || r.stdout}`);
}

const DEV_AC_BODY = '\n\n## Acceptance Criteria\n\n- [ ] dev/01 v1 Demonstrate the feature.\n  - status: pending\n';

describe('OA-07 AC-7: allowlist fence enforced over the REAL board + REAL launch dispatch', () => {
  // Generous timeout: this test drives real subprocesses (git init/commit, `ztrack init` + two `issue
  // create` + one `issue edit --add-label`, one REAL `bun scripts/runner.ts launch` — creates a git
  // worktree and a real (stub-provider) termfleet session) — same rationale/pin as OA-08's 30s.
  test('one unlabeled ready issue is fenced; the oa-approved one is dispatched, and ONLY it gets a session', () => {
    const { dir } = scaffold();

    // DETERMINISTIC ACROSS ANY BOARD ORDERING — this fixture used to also assert
    // `readBoard(dir)[0] === unlabeledId`, reasoning that ztrack lists most-recently-touched first and so
    // the un-opted-in issue would be the board's "top candidate" if the fence didn't exist. That assumption
    // was FALSE (root-caused after a governed-CI failure: for the markdown issue-per-file backend, `ztrack
    // issue list` returns issues in raw, unsorted `readdirSync` order — filesystem/environment-dependent,
    // with no guaranteed relationship to touch recency — see canned-pm-dispatch-fence.ts's `readBoard`
    // jsdoc). A clean-checkout CI runner returned the two issues in the OPPOSITE order from a local dev box,
    // failing that assertion, even though the fence itself was never broken.
    //
    // The real invariant does NOT need board order at all: pass 1 (the allowlist gate) is evaluated over the
    // WHOLE `ready` set unconditionally (canned-pm-dispatch-fence.ts's own pass-1 jsdoc) — every ready issue
    // lacking `oa-approved` is fenced, regardless of where it happens to land in the board scan. So
    // `tick.fenced`/`tick.dispatched` below, and the independent sessions-file/worktree assertions, hold no
    // matter which of the two issues the board lists first (verified directly: `readBoard` was temporarily
    // patched to return this fixture's two-issue board in REVERSED order and this test still passed
    // unchanged — see docs/adoption-fixes/proofs/oa-07.md §4 for the reproduction).
    //
    // Non-tautology (this fixture genuinely exercises the gate, not a no-op) is now carried by the separate,
    // ORDER-INDEPENDENT "CONTRAST" test below (a single-issue board — no relative ordering to depend on):
    // it shows this exact unlabeled-shaped issue, given the label, DOES get dispatched — so its exclusion
    // here is caused by the fence, not by some other property of the fixture.
    const approvedId = createIssue(dir, 'OA-07 AC-7: opted-in item', '# Opted-in item\n\nThe operator has reviewed and approved this one.' + DEV_AC_BODY);
    addLabel(dir, approvedId, 'oa-approved');
    const unlabeledId = createIssue(dir, 'OA-07 AC-7: pre-existing backlog item (not opted in)', '# Backlog item\n\nOrdinary pre-existing work.' + DEV_AC_BODY);
    gitOk(dir, ['add', '-A']);
    gitOk(dir, ['commit', '-q', '-m', 'seed board: one oa-approved + one unlabeled ready issue']);

    const sentinel = join(dir, 'sentinel.log');
    const runEnv = env({ OA_STUB_TF_SESSIONS_FILE: sentinel });

    const tick = runDispatchFenceTick({ dir, env: runEnv });

    // --- tick-output assertions (the structured result the test asserts on) ---
    expect(tick.fenced).toEqual([{ id: unlabeledId, note: 'fenced (no oa-approved)' }]);
    expect(tick.blockedForHuman).toEqual([]);
    expect(tick.dispatched).toEqual([approvedId]);
    expect(tick.launch).not.toBeNull();
    expect(tick.launch!.status).toBe(0); // the REAL runner accepted this dispatch (develop skill intact)

    // --- stub-provider session-file assertions (independent proof, not just the driver's own return value) ---
    const sessions = sessionRecords(sentinel);
    expect(sessions.length).toBe(1); // exactly one develop session ever created this tick
    expect(sessions[0].agent).toBe('develop');
    // attribution: the one session landed in the APPROVED issue's worktree, never the fenced one's.
    expect(sessions[0].cwd).toContain(`agent-issue-${approvedId}`);
    expect(sessions[0].cwd).not.toContain(`agent-issue-${unlabeledId}`);

    // The fenced issue never got a worktree/branch at all — it was never launched.
    const fencedWorktree = join(dir, '.worktrees', `agent-issue-${unlabeledId}`);
    expect(existsSync(fencedWorktree)).toBe(false);
    expect(git(dir, ['rev-parse', '--verify', '--quiet', `agent/issue-${unlabeledId}`]).status).not.toBe(0);
  }, 30_000);
});

describe('OA-07 AC-7 CONTRAST (order-independent non-tautology positive control)', () => {
  // AC-7's main test above proves the fence is deterministic REGARDLESS of board scan order (pass 1 is
  // unconditional over the whole `ready` set). What that determinism does NOT by itself rule out: maybe
  // the "unlabeled" issue was never a genuine dispatch candidate to begin with — some other property of its
  // fixture shape (title, body, absence of a branch) could in principle be quietly disqualifying it,
  // making its exclusion vacuous no matter what the fence does. This test closes that gap WITHOUT depending
  // on the relative order of two simultaneously-ready issues: a SINGLE-issue board has no ordering to
  // depend on. It takes the exact same issue shape as AC-7's fenced issue, changes only the one axis the
  // doctrine says should matter (adds the `oa-approved` label), and shows it gets dispatched — proving the
  // exclusion in the main test above is caused BY the fence, not by anything else about the issue. Mirrors
  // the OA-09 "CONTRAST (proves the decoy is real, not vacuous)" pattern (provider-landing.test.ts).
  test('the SAME unlabeled-shaped backlog item, given oa-approved on its own single-issue board, gets dispatched', () => {
    const { dir } = scaffold();

    const id = createIssue(
      dir,
      'OA-07 AC-7: pre-existing backlog item (not opted in)',
      '# Backlog item\n\nOrdinary pre-existing work.' + DEV_AC_BODY,
    );
    addLabel(dir, id, 'oa-approved'); // the ONLY change from the fenced issue in the main AC-7 test above
    gitOk(dir, ['add', '-A']);
    gitOk(dir, ['commit', '-q', '-m', 'seed board: single ready, oa-approved issue (positive control)']);

    const sentinel = join(dir, 'sentinel.log');
    const runEnv = env({ OA_STUB_TF_SESSIONS_FILE: sentinel });

    const tick = runDispatchFenceTick({ dir, env: runEnv });

    expect(tick.fenced).toEqual([]); // has the label — never a fence hit
    expect(tick.blockedForHuman).toEqual([]);
    expect(tick.dispatched).toEqual([id]);
    expect(tick.launch).not.toBeNull();
    expect(tick.launch!.status).toBe(0);

    const sessions = sessionRecords(sentinel);
    expect(sessions.length).toBe(1);
    expect(sessions[0].agent).toBe('develop');
    expect(sessions[0].cwd).toContain(`agent-issue-${id}`);
  }, 30_000);
});

describe('OA-07 AC-7 NEGATIVE CONTROL (order-independent fence-removal detection on independent evidence)', () => {
  // The exact mirror of the CONTRAST positive control above, and the piece that makes fence-removal
  // catchable by INDEPENDENT PHYSICAL EVIDENCE in EVERY board order. The main two-issue AC-7 test's
  // independent (sessions-file/worktree) assertions only catch a fence-disable mutant when the board happens
  // to scan the unlabeled issue FIRST: under approved-first scan order (the order the governed-CI runner
  // actually produced), one-dispatch-per-tick means the approved issue lands the sole session with OR
  // without the fence — the observable world is identical, so only the driver-reported `tick.fenced` note
  // would catch the mutant, and driver-reported evidence is explicitly not accepted as proof here.
  //
  // A SINGLE-issue board removes that order-dependence entirely: with ONE unlabeled `ready` issue under
  // mode:allowlist, the fence is the ONLY thing standing between it and dispatch. Fence ON → zero sessions,
  // no worktree, no branch (asserted below on independent evidence). Fence OFF → that lone issue WOULD be
  // dispatched, a session/worktree/branch WOULD appear, and these "no session" assertions FAIL — in ANY
  // board order, because there is no second issue and no ordering to hide behind. That is deterministic,
  // order-independent, independent-evidence mutation-catching (verified in docs/adoption-fixes/proofs/oa-07.md
  // §4 by applying the fence-disable mutant under both forced board orders and watching THIS test fail on
  // the session/worktree assertions both ways).
  test('a lone unlabeled ready issue under mode:allowlist gets NO session/worktree/branch — on any board order', () => {
    const { dir } = scaffold();

    const id = createIssue(
      dir,
      'OA-07 AC-7: pre-existing backlog item (not opted in)',
      '# Backlog item\n\nOrdinary pre-existing work.' + DEV_AC_BODY,
    ); // NO addLabel — the single differentiator from the CONTRAST positive control above
    gitOk(dir, ['add', '-A']);
    gitOk(dir, ['commit', '-q', '-m', 'seed board: single ready, UNLABELED issue (negative control)']);

    const sentinel = join(dir, 'sentinel.log');
    const runEnv = env({ OA_STUB_TF_SESSIONS_FILE: sentinel });

    const tick = runDispatchFenceTick({ dir, env: runEnv });

    // LOAD-BEARING — INDEPENDENT PHYSICAL EVIDENCE, ASSERTED FIRST (so a fence-disable mutant is caught HERE,
    // on physical evidence, not merely on the driver-reported note below): with the fence removed this lone
    // issue WOULD be dispatched and each of these would flip, in ANY board order (single issue → no ordering
    // to hide behind).
    expect(sessionRecords(sentinel).length).toBe(0); // zero develop sessions ever created
    expect(existsSync(join(dir, '.worktrees', `agent-issue-${id}`))).toBe(false); // no worktree
    expect(git(dir, ['rev-parse', '--verify', '--quiet', `agent/issue-${id}`]).status).not.toBe(0); // no branch

    // Driver-reported (doctrine-mandated `fenced (no <allow_label>)` note — a corroborating, NOT load-bearing,
    // check; the physical assertions above already carry the proof).
    expect(tick.fenced).toEqual([{ id, note: 'fenced (no oa-approved)' }]);
    expect(tick.blockedForHuman).toEqual([]);
    expect(tick.dispatched).toEqual([]);
    expect(tick.launch).toBeNull(); // no subprocess spawned at all — never even attempted
  }, 30_000);
});

describe('OA-07 AC-8: body-read defers dispatch, and the doctrine re-reads the body every tick', () => {
  test('a ready+oa-approved issue whose body says "do not dispatch" gets NO session, on tick 1 AND tick 2', () => {
    const { dir } = scaffold();

    // The single ready candidate: labeled oa-approved (clears the allowlist gate cleanly) and otherwise
    // the top (only) candidate — i.e. NON-TAUTOLOGICAL: with the body-read removed, this issue WOULD be
    // dispatched (fresh `ready`, no branch, allowlist-eligible). Only the explicit prose marker makes it
    // ineligible.
    const deferredId = createIssue(
      dir,
      'OA-07 AC-8: deferred backlog item',
      '# Deferred item\n\nDo not dispatch — deferred per decision record OA-DR-12.\n\nThe owners parked this pending a follow-up decision.' + DEV_AC_BODY,
    );
    addLabel(dir, deferredId, 'oa-approved');
    gitOk(dir, ['add', '-A']);
    gitOk(dir, ['commit', '-q', '-m', 'seed board: one ready, oa-approved, body-deferred issue']);

    const sentinel = join(dir, 'sentinel.log');
    const runEnv = env({ OA_STUB_TF_SESSIONS_FILE: sentinel });

    // ---- Tick 1 -------------------------------------------------------------------------------------
    const tick1 = runDispatchFenceTick({ dir, env: runEnv });
    expect(tick1.fenced).toEqual([]); // it HAS the allow_label — never a fence hit
    expect(tick1.blockedForHuman).toEqual([{ id: deferredId, note: 'blocked-for-human (body: explicit deferral marker)' }]);
    expect(tick1.dispatched).toEqual([]);
    expect(tick1.launch).toBeNull(); // no subprocess spawned at all — never even attempted
    expect(sessionRecords(sentinel).length).toBe(0);
    expect(existsSync(join(dir, '.worktrees', `agent-issue-${deferredId}`))).toBe(false);
    expect(git(dir, ['rev-parse', '--verify', '--quiet', `agent/issue-${deferredId}`]).status).not.toBe(0);

    // ---- Tick 2 (fresh re-read; the doctrine keeps NO "already saw this" memory) ----------------------
    const tick2 = runDispatchFenceTick({ dir, env: runEnv });
    expect(tick2.fenced).toEqual([]);
    expect(tick2.blockedForHuman).toEqual([{ id: deferredId, note: 'blocked-for-human (body: explicit deferral marker)' }]);
    expect(tick2.dispatched).toEqual([]);
    expect(tick2.launch).toBeNull();
    expect(sessionRecords(sentinel).length).toBe(0); // still zero sessions, across both ticks
    expect(existsSync(join(dir, '.worktrees', `agent-issue-${deferredId}`))).toBe(false);
    expect(git(dir, ['rev-parse', '--verify', '--quiet', `agent/issue-${deferredId}`]).status).not.toBe(0);
  }, 30_000);
});
