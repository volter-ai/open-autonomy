// TA.2 — `hasDispatchableWork`: a deterministic, read-only maturity diagnostic ("does this profile's
// configured task service hold at least one actionable item right now?"). It is not imported by the
// scheduler and has no authority to gate job launches. Historical backing adapters remain here only so
// older compiled installs can still be assessed.
//
// The M4 "board readiness" rung asks whether there is at least one fresh, dispatchable item. This module
// therefore adds two diagnostic filters:
//
//   (a) the simple-sdlc `oa-approved` day-one allowlist fence (policy.box.dispatch.mode: allowlist,
//       profiles/simple-sdlc/ir.yml:80-83) — a `ready` item without the allowlist label is NOT actionable,
//       mirrored here from the SAME fence profiles/simple-sdlc/skills/pm/SKILL.md:18-23 documents and
//       packages/substrate-local/src/test-support/canned-pm-dispatch-fence.ts already proves mechanically;
//   (b) the "fresh work" filter (profiles/simple-sdlc/skills/pm/SKILL.md:79-80: "a `ready` issue with
//       **no** `agent/issue-<id>` branch yet (fresh work)") — a ready item that already has an
//       `agent/issue-<id>` branch/PR open is already dispatched, not awaiting dispatch, so it must not
//       count toward "the board holds an actionable item" even though eligibility.ts's own ready-issues
//       leg would still see it (by design — that leg is a "wake the reconciler" signal, not a "is there
//       untouched work" signal).
//
// BOARD-TYPE DERIVATION: task backing and code host are orthogonal. The portable default is the ztrack
// task service. A legacy setup-pack may still declare its historical maturity predicate explicitly so
// an older install can be diagnosed without teaching the scheduler about that backend.
//
// WHY THIS FILE DOES NOT IMPORT `@open-autonomy/core`'s `getSetupPack`: `@volter/oa` (this package) is
// designed to be an independently-publishable, dependency-light CLI (README.md's "Why this package
// exists") — `@open-autonomy/core` is a private, unpublished monorepo workspace package, and importing it
// here would tie a standalone `npm install @volter/oa` to a package that doesn't exist on the registry.
// This repo already has a precedent for exactly this situation: `packages/substrate-local/src/runner-
// frontend.ts` reimplements `HumanRunner`'s semantics INLINE rather than importing `@open-autonomy/core`,
// specifically so the file "ships verbatim into every install with no dependency on `@open-autonomy/core`"
// (CLAUDE.md, "Built vs designed"). `readMaturitySignals` below follows the same rule: it reads the two
// literal `maturity_signals.*` leaf keys straight off `<profileDir>/setup-pack.yml` with the `yaml`
// package (a real, tiny, independently-publishable dependency `@open-autonomy/core` itself already uses)
// — no IR parsing, no `provision.json` merge, no validation, none of `getSetupPack`'s VIEW-field derivation
// (the actual drift-prone thing TS.1's own header warns against duplicating). Reading two already-hand-
// authored leaf strings the exact way `getSetupPack` reads them cannot drift the way re-deriving a VIEW
// field would.
//
// TS.2 WIRING SEAM: once a consumer (e.g. the future `oa maturity`/TB.2, which per the task list also
// lives in `packages/local-runner-cli/`) has an in-process `SetupPack` already loaded via
// `@open-autonomy/core`, it should pass `{ variant, allowlistLabel }` straight through via this module's
// explicit override params instead of going through `profileDir`/`readMaturitySignals` at all — the
// override path exists for exactly that.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { PARKED_LABELS, type EligibilityVariant, type NoteFn } from './eligibility.ts';
import { defaultProc } from './proc.ts';
import { firstLine } from './proc.ts';
import type { ProcRunner } from './types.ts';

export type { EligibilityVariant } from './eligibility.ts';

// --- board-kind resolution ------------------------------------------------------------------------------

export type BoardKindSource = 'setup-pack' | 'task-service-default' | 'explicit';

export interface BoardKind {
  variant: EligibilityVariant;
  allowlistLabel?: string;
  source: BoardKindSource;
}

interface RawMaturitySignals {
  m4_predicate?: string;
  m4_allowlist_label?: string;
}

/** Read JUST the two hand-authored `maturity_signals` leaf fields off `<profileDir>/setup-pack.yml` —
 *  see the file header for why this is a direct, minimal YAML read rather than an `@open-autonomy/core`
 *  import. Returns `undefined` (never throws) when the file is missing, unparsable, or lacks a valid
 *  `m4_predicate` — every caller path has a defined fallback for that case. */
export function readMaturitySignals(profileDir: string): { m4Predicate: EligibilityVariant; m4AllowlistLabel?: string } | undefined {
  const p = join(profileDir, 'setup-pack.yml');
  if (!existsSync(p)) return undefined;
  let parsed: { maturity_signals?: RawMaturitySignals };
  try {
    parsed = parseYaml(readFileSync(p, 'utf8')) as { maturity_signals?: RawMaturitySignals };
  } catch {
    return undefined;
  }
  const signals = parsed?.maturity_signals;
  if (!signals || (signals.m4_predicate !== 'ztrack' && signals.m4_predicate !== 'gh-issues')) return undefined;
  const out: { m4Predicate: EligibilityVariant; m4AllowlistLabel?: string } = { m4Predicate: signals.m4_predicate };
  if (signals.m4_allowlist_label) out.m4AllowlistLabel = signals.m4_allowlist_label;
  return out;
}

/** Resolve the task service used for maturity diagnostics. A profile may declare a legacy setup-pack
 *  predicate explicitly; otherwise the portable task-service default is ztrack. Agent identity and code
 *  host never select a task backend. */
export function resolveBoardKind(opts: { profileDir?: string; actor?: string }): BoardKind {
  if (opts.profileDir) {
    const signals = readMaturitySignals(opts.profileDir);
    if (signals) {
      const kind: BoardKind = { variant: signals.m4Predicate, source: 'setup-pack' };
      if (signals.m4AllowlistLabel) kind.allowlistLabel = signals.m4AllowlistLabel;
      return kind;
    }
  }
  return { variant: 'ztrack', source: 'task-service-default' };
}

// --- ready-item listing (variant-specific; carries labels, unlike eligibility.ts's boolean-only legs) --

interface ReadyItem {
  id: string;
  labels: string[];
}

function readyItemsZtrack(cwd: string, proc: ProcRunner, note: NoteFn): ReadyItem[] {
  const r = proc('npx', ['ztrack', 'issue', 'list', '--state', 'ready', '--json', 'identifier,labels'], { cwd });
  if (r.status !== 0) {
    note(`[oa] hasDispatchableWork: ready-issues probe unknown (ztrack probe failed: ${firstLine(r.stderr)})`);
    return [];
  }
  let rows: Array<{ identifier?: string; labels?: string[] }> = [];
  try {
    rows = JSON.parse(r.stdout || '[]');
  } catch {
    rows = [];
  }
  return Array.isArray(rows) ? rows.filter((row): row is { identifier: string; labels?: string[] } => !!row.identifier).map((row) => ({ id: row.identifier, labels: row.labels ?? [] })) : [];
}

function readyItemsGhIssues(cwd: string, proc: ProcRunner, note: NoteFn): ReadyItem[] {
  const r = proc('gh', ['issue', 'list', '--state', 'open', '--label', 'ready', '--json', 'number,labels', '--limit', '100'], { cwd });
  if (r.status !== 0) {
    note(`[oa] hasDispatchableWork: ready-issues probe unknown (gh probe failed: ${firstLine(r.stderr)})`);
    return [];
  }
  let rows: Array<{ number?: number; labels?: Array<{ name: string }> }> = [];
  try {
    rows = JSON.parse(r.stdout || '[]');
  } catch {
    rows = [];
  }
  const nonParked = Array.isArray(rows) ? rows.filter((row) => row.number !== undefined && !(row.labels ?? []).some((l) => PARKED_LABELS.has(l.name))) : [];
  return nonParked.map((row) => ({ id: String(row.number), labels: (row.labels ?? []).map((l) => l.name) }));
}

// --- allowlist filter (simple-sdlc's oa-approved day-one fence) -----------------------------------------

function filterAllowlist(items: ReadyItem[], allowlistLabel: string | undefined, note: NoteFn): ReadyItem[] {
  if (!allowlistLabel) return items;
  const kept = items.filter((it) => it.labels.includes(allowlistLabel));
  const fenced = items.length - kept.length;
  if (fenced > 0) note(`[oa] hasDispatchableWork: ${fenced} ready item(s) fenced (missing '${allowlistLabel}' allowlist label)`);
  return kept;
}

// --- fresh-work filter (excludes items that already have an `agent/issue-<id>` branch/PR in flight) ----

/** ztrack-board profiles (simple-gh's manager, simple-sdlc's pm) dispatch onto a LOCAL git branch/worktree
 *  named `agent/issue-<id>` (profiles/simple-sdlc/skills/pm/SKILL.md:32,79-80) — a local branch check. */
function branchExistsLocally(cwd: string, id: string, proc: ProcRunner): boolean {
  const r = proc('git', ['rev-parse', '--verify', '--quiet', `agent/issue-${id}`], { cwd });
  return r.status === 0;
}

/** gh-issues-board profiles (simple-gh-sdlc, self-driving) dispatch onto a PR branch of the same name that
 *  lands on GitHub — an open PR is the in-flight signal (profiles/self-driving/skills/pm/SKILL.md:98-99:
 *  "confirm `agent/issue-<n>` has **no** PR yet in ANY state"). One list call for every ready item, not
 *  one probe per item — cheaper and avoids N+1 `gh` calls on a busy board. */
function openAgentIssueBranchIds(cwd: string, proc: ProcRunner, note: NoteFn): Set<string> {
  const r = proc('gh', ['pr', 'list', '--state', 'open', '--json', 'headRefName', '--limit', '100'], { cwd });
  if (r.status !== 0) {
    note(`[oa] hasDispatchableWork: in-flight branch probe unknown (gh probe failed: ${firstLine(r.stderr)}) — treating as none in flight`);
    return new Set();
  }
  let rows: Array<{ headRefName?: string }> = [];
  try {
    rows = JSON.parse(r.stdout || '[]');
  } catch {
    rows = [];
  }
  const ids = new Set<string>();
  for (const row of Array.isArray(rows) ? rows : []) {
    const m = /^agent\/issue-(.+)$/.exec(row.headRefName ?? '');
    if (m) ids.add(m[1]!);
  }
  return ids;
}

function filterFreshWork(items: ReadyItem[], variant: EligibilityVariant, cwd: string, proc: ProcRunner, note: NoteFn): ReadyItem[] {
  const inFlightIds = variant === 'gh-issues' ? openAgentIssueBranchIds(cwd, proc, note) : new Set(items.filter((it) => branchExistsLocally(cwd, it.id, proc)).map((it) => it.id));
  const kept = items.filter((it) => !inFlightIds.has(it.id));
  const inFlight = items.length - kept.length;
  if (inFlight > 0) note(`[oa] hasDispatchableWork: ${inFlight} ready item(s) already in flight (agent/issue-<id> branch exists) — not fresh work`);
  return kept;
}

// --- the predicate ----------------------------------------------------------------------------------

export interface DispatchableWorkOptions {
  /** cwd of the compiled/installed board to probe (a ztrack root or a `gh`-authenticated repo checkout) —
   *  same convention as eligibility.ts's `cwd`. */
  cwd: string;
  /** the SOURCE profile directory (e.g. `profiles/simple-sdlc`), used to derive `variant`/`allowlistLabel`
   *  via its `setup-pack.yml`. Optional when `variant` is passed explicitly. */
  profileDir?: string;
  /** identity fallback (e.g. `manager`/`pm`) — consulted only when `profileDir` is absent or its pack
   *  doesn't resolve; never overrides a resolved setup-pack value. */
  actor?: string;
  /** explicit override — skips resolution entirely (the TS.2 wiring seam; see file header). */
  variant?: EligibilityVariant;
  /** explicit override — skips resolution entirely; pass `''`/omit for "no allowlist fence". */
  allowlistLabel?: string;
  proc?: ProcRunner;
}

export interface DispatchableWorkVerdict {
  actionable: boolean;
  variant: EligibilityVariant;
  allowlistLabel?: string;
  source: BoardKindSource;
  readyCount: number;
  actionableCount: number;
  reason: string;
}

/** TA.2 — "does this profile's task service hold >=1 actionable item?" This deterministic, read-only
 *  diagnostic never launches or gates a job. */
export function hasDispatchableWork(opts: DispatchableWorkOptions): DispatchableWorkVerdict {
  const proc = opts.proc ?? defaultProc;
  const notes: string[] = [];
  const note: NoteFn = (line) => notes.push(line);

  const kind: BoardKind =
    opts.variant !== undefined
      ? { variant: opts.variant, source: 'explicit', ...(opts.allowlistLabel ? { allowlistLabel: opts.allowlistLabel } : {}) }
      : resolveBoardKind({ profileDir: opts.profileDir, actor: opts.actor });
  const variant = kind.variant;
  const allowlistLabel = opts.allowlistLabel ?? kind.allowlistLabel;

  const ready = variant === 'gh-issues' ? readyItemsGhIssues(opts.cwd, proc, note) : readyItemsZtrack(opts.cwd, proc, note);
  const allowlisted = filterAllowlist(ready, allowlistLabel, note);
  const actionable = filterFreshWork(allowlisted, variant, opts.cwd, proc, note);

  const verdict = actionable.length > 0;
  let reason: string;
  if (ready.length === 0) reason = 'board empty (no ready items)';
  else if (allowlisted.length === 0) reason = `ready items exist but none pass the '${allowlistLabel}' allowlist`;
  else if (actionable.length === 0) reason = 'ready items exist but all are already in flight (agent/issue-<id> branch open)';
  else reason = `${actionable.length} actionable item(s)`;

  for (const line of notes) console.error(line);
  console.error(
    `[oa] hasDispatchableWork: overall = ${verdict} (${actionable.length} actionable / ${ready.length} ready, variant=${variant}${allowlistLabel ? `, allowlist=${allowlistLabel}` : ''}, source=${kind.source})`,
  );

  const result: DispatchableWorkVerdict = { actionable: verdict, variant, source: kind.source, readyCount: ready.length, actionableCount: actionable.length, reason };
  if (allowlistLabel) result.allowlistLabel = allowlistLabel;
  return result;
}
