// OA-07 AC-7/AC-8 test-support: a CANNED PM driver for the day-one backlog-fence PM doctrine
// (profiles/simple-sdlc/skills/pm/SKILL.md:18-23,79-80,85-93 — the allowlist gate and the body-read /
// deferral clause). See packages/substrate-local/src/pm-dispatch-fence.test.ts for the doctrine quoted in
// full and the honest-boundary statement this file's own header repeats below.
//
// Every MECHANISM this driver touches is REAL:
//   - `.open-autonomy/autonomy.yml`'s `policy.dispatch` box is read straight off disk — the exact channel
//     the doctrine itself names ("Also consult `policy.dispatch` in `.open-autonomy/autonomy.yml`",
//     pm/SKILL.md:18);
//   - the board read is the REAL `ztrack issue list --state open --limit 100 --json
//     identifier,title,state,labels,assignee` (pm/SKILL.md:58's own tick-step-1 command);
//   - the per-candidate body read is the REAL `ztrack issue view <id> --json` (pm/SKILL.md:85's own
//     "Before launching, `ztrack issue view <id>` and read the body" instruction);
//   - a dispatch is the REAL `bun scripts/runner.ts launch develop --ref <id> --branch agent/issue-<id>`
//     (pm/SKILL.md:95-97's own dispatch command), run against the SHARED model-free stub termfleet
//     provider (test-support/stub-termfleet.ts) — no live model, no billed agent, ever (see
//     docs memory "live-agent-test-safety" / OA-09 incident this rail exists to prevent).
//
// The ONLY thing "canned" here is WHICH action to take each tick — the eligibility judgment a real
// model-driven PM would make by reading SKILL.md + the board fresh every tick. That judgment is scripted
// 1:1 off the doctrine's literal rules, transcribed in the jsdoc on `runDispatchFenceTick` below. This
// driver proves board/policy/body-read MECHANICS + the real launch dispatch; it does NOT prove a model's
// reading comprehension of prose deferral markers — see pm-dispatch-fence.test.ts's header comment for
// the full honest-boundary statement (mirrors OA-08's canned-pm-escalation.ts posture for the sibling
// PM-doctrine gap).
//
// NOT imported from OA-08's test-support/canned-pm-escalation.ts (that file is another fix's committed
// unit, and this task's guardrails say not to modify any OA-08 file) — this module owns a small private
// duplicate of the generic ztrack-CLI helpers it needs, mirroring OA-08's OWN precedent of duplicating
// launch-verification.test.ts's installStubTermfleet rather than reaching across a sibling builder's file.
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

const require = createRequire(import.meta.url);

/** Absolute path to the real installed ztrack CLI entry point, resolved from THIS package's own
 *  node_modules (a bun workspace hoists `ztrack` to the repo root — the repo's own pinned devDependency).
 *  Invoked by absolute path (never `bunx`/`npx`), exactly as OA-08's equivalent helper does. */
export function resolveZtrackCli(): string {
  return require.resolve('ztrack/package.json').replace(/package\.json$/, 'dist/cli.js');
}

export function ztrack(dir: string, args: string[], ztrackCli: string = resolveZtrackCli()): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [ztrackCli, ...args], { cwd: dir, encoding: 'utf8' });
}

export function ztrackOk(dir: string, args: string[], ztrackCli: string = resolveZtrackCli()): string {
  const r = ztrack(dir, args, ztrackCli);
  if (r.status !== 0) throw new Error(`ztrack ${args.join(' ')} failed in ${dir}: ${r.stderr || r.stdout}`);
  return r.stdout;
}

interface ZtrackListRow {
  identifier: string;
  title: string;
  state: string;
  labels: string[];
  assignee: string | null;
}

interface ZtrackViewResult {
  identifier: string;
  body: string;
  state: { name: string; type: string };
  labels: { nodes: Array<{ name: string }> };
}

/** Real board read — pm/SKILL.md:58's own tick-step-1 command, verbatim field list. NOTE: ztrack's own
 *  list order is NOT a doctrine-defined "priority" (observed empirically to reorder on label/body edits —
 *  e.g. most-recently-touched first); the driver only relies on list order for the body-read pass (pass 2
 *  in runDispatchFenceTick), which is explicitly sequential per the doctrine's own "move on to the
 *  next-eligible candidate" phrasing. The allowlist gate (pass 1) is evaluated over the WHOLE ready set
 *  regardless of order — see that function's jsdoc. */
export function readBoard(dir: string, ztrackCli: string = resolveZtrackCli()): ZtrackListRow[] {
  const out = ztrackOk(dir, ['issue', 'list', '--state', 'open', '--limit', '100', '--json', 'identifier,title,state,labels,assignee'], ztrackCli);
  return JSON.parse(out) as ZtrackListRow[];
}

/** Real per-issue body read — pm/SKILL.md:85's own "Before launching, `ztrack issue view <id>`" step. */
export function readIssueBody(dir: string, issueId: string, ztrackCli: string = resolveZtrackCli()): string {
  const out = ztrackOk(dir, ['issue', 'view', issueId, '--json'], ztrackCli);
  return (JSON.parse(out) as ZtrackViewResult).body ?? '';
}

export interface DispatchPolicy {
  mode?: string;
  allow_label?: string;
}

/** Real read of `policy.dispatch` off the compiled `.open-autonomy/autonomy.yml` manifest — the exact
 *  channel pm/SKILL.md:18 names. Returns `{}` (the `mode: open`-equivalent, "every ready issue is eligible
 *  on this axis") if the manifest has no dispatch box at all — pm/SKILL.md:22-23's documented fallback. */
export function readDispatchPolicy(dir: string): DispatchPolicy {
  const manifestPath = join(dir, '.open-autonomy', 'autonomy.yml');
  if (!existsSync(manifestPath)) return {};
  const manifest = parseYaml(readFileSync(manifestPath, 'utf8')) as { policy?: { dispatch?: DispatchPolicy } };
  return manifest.policy?.dispatch ?? {};
}

/** A prose marker that makes an issue ineligible "regardless of its `ready` state" per pm/SKILL.md:85-93 —
 *  "An explicit do-not-dispatch / deferred / blocked-by / on-hold marker in the body (or a citation of a
 *  decision record deferring it)". Matched case-insensitively; several synonyms, since the doctrine's own
 *  wording is prose, not a fixed token. */
const DEFERRAL_MARKER = /do[- ]not[- ]dispatch|deferred|blocked[- ]by|on[- ]hold|decision record/i;

export interface FencedEntry {
  id: string;
  note: string;
}
export interface BlockedEntry {
  id: string;
  note: string;
}

export interface TickOutput {
  dispatched: string[];
  fenced: FencedEntry[];
  blockedForHuman: BlockedEntry[];
  launch: SpawnSyncReturns<string> | null;
}

export interface DispatchFenceTickArgs {
  dir: string;
  env: NodeJS.ProcessEnv;
  ztrackCli?: string;
}

/**
 * One canned PM tick over the WHOLE `ready` backlog, replaying:
 *   - pm/SKILL.md:18-23 (the allowlist gate) + the Develop rule's fresh-work clause :79-80 ("carrying
 *     `allow_label`");
 *   - pm/SKILL.md:85-93 (the body-read / deferral clause).
 *
 * Runs in TWO passes over the `ready` set, deliberately, because the doctrine's two gates are different
 * IN KIND:
 *
 *   Pass 1 — the allowlist gate (pm/SKILL.md:18-23,79-80) is a BLANKET statement about board state alone
 *   ("a `ready` issue without `allow_label` is ineligible … regardless of its `ready` state"), true of an
 *   issue independent of scan position — so every `ready` issue lacking `allow_label` (under `mode:
 *   allowlist`) is recorded `fenced (no <allow_label>)` (pm/SKILL.md:21's exact token shape) UNCONDITIONALLY,
 *   never dispatched, and never treated as blocked-for-human (pm/SKILL.md:21-22: "it's not a decision, it's
 *   simply not yet opted in"). This pass costs no subprocess (board data already carries labels), so
 *   evaluating the whole ready set up front is free and avoids the tick output silently omitting a fenced
 *   issue purely because of where the board happened to rank it (ztrack's own list order is NOT
 *   doctrine-defined "priority" — see readBoard's own comment).
 *
 *   Pass 2 — the body-read / deferral clause (pm/SKILL.md:85-93) applies only to candidates that already
 *   cleared pass 1, IN BOARD-LIST ORDER, exactly as SKILL.md phrases it ("move on to the next-eligible
 *   candidate this same tick"): for each such candidate, the REAL `ztrack issue view <id>` is read and its
 *   body scanned for a deferral marker. A hit is recorded blocked-for-human and the scan continues to the
 *   next candidate; the FIRST candidate that clears the body-read is DISPATCHED — the REAL `bun
 *   scripts/runner.ts launch develop --ref <id> --branch agent/issue-<id>` fires (pm/SKILL.md:95-97) — and
 *   the tick ends there (pm/SKILL.md:134, "Launch … exactly one issue per tick"): any pass-1-eligible
 *   candidates after the dispatched one are simply never body-read this tick, exactly as a real tick would
 *   stop after its one action.
 *
 * If pass 2 exhausts every eligible candidate without finding one that clears the body-read, `dispatched`
 * is `[]` and `launch` is `null` — no subprocess is spawned at all in that case (this is what AC-8
 * exercises: the single ready, allowlist-eligible candidate is blocked-for-human, so nothing is ever
 * launched).
 *
 * Deliberately NOT implemented (this driver is the two-gate SLICE of the Develop rule the OA-07 ACs
 * exercise, NOT the full tick — so "1:1 off the doctrine" is scoped to the fence/defer clauses, not the
 * whole Tick step):
 *   - the rework path (pm/SKILL.md:81-83, an in-progress issue whose `agent/issue-<id>` branch already
 *     exists — "already dispatched once, so the allowlist gate doesn't re-apply"); AC-7/AC-8 only exercise
 *     fresh `ready` work;
 *   - the fresh-work "no `agent/issue-<id>` branch yet" precondition (pm/SKILL.md:79) — the fixtures never
 *     seed a pre-existing branch, so every `ready` candidate here is fresh work by construction;
 *   - the higher-priority actions and WIP preconditions the real Tick applies BEFORE Develop (integrate a
 *     `done` issue, review an `in-review` one, the "no develop already running" check, WIP ceilings —
 *     pm/SKILL.md:60-77); the fixtures contain only fresh `ready` issues, so Develop is always the tick's
 *     action. This driver models the fence/defer eligibility gates, not the whole priority ladder.
 */
export function runDispatchFenceTick({ dir, env, ztrackCli = resolveZtrackCli() }: DispatchFenceTickArgs): TickOutput {
  const policy = readDispatchPolicy(dir);
  const board = readBoard(dir, ztrackCli);
  const ready = board.filter((r) => r.state === 'ready');

  // Pass 1 — the allowlist gate, unconditional over the whole ready set (see jsdoc above).
  const fenced: FencedEntry[] = [];
  const eligibleForBodyRead: ZtrackListRow[] = [];
  for (const issue of ready) {
    if (policy.mode === 'allowlist') {
      const allowLabel = policy.allow_label ?? '';
      if (!allowLabel || !issue.labels.includes(allowLabel)) {
        fenced.push({ id: issue.identifier, note: `fenced (no ${allowLabel || '<allow_label>'})` });
        continue;
      }
    }
    eligibleForBodyRead.push(issue);
  }

  // Pass 2 — the body-read / deferral clause, sequential over the allowlist-cleared candidates only.
  const blockedForHuman: BlockedEntry[] = [];
  for (const issue of eligibleForBodyRead) {
    const body = readIssueBody(dir, issue.identifier, ztrackCli);
    if (DEFERRAL_MARKER.test(body)) {
      blockedForHuman.push({ id: issue.identifier, note: 'blocked-for-human (body: explicit deferral marker)' });
      continue;
    }

    const branch = `agent/issue-${issue.identifier}`;
    const launch = spawnSync('bun', ['scripts/runner.ts', 'launch', 'develop', '--ref', issue.identifier, '--branch', branch], {
      cwd: dir,
      encoding: 'utf8',
      env,
    });
    return { dispatched: [issue.identifier], fenced, blockedForHuman, launch };
  }

  return { dispatched: [], fenced, blockedForHuman, launch: null };
}
