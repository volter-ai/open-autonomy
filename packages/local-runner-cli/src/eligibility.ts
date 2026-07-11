// Eligibility probes (II.6.1 change 2): wait-aware, so a wave that ended on "wait for CI" doesn't
// spin-burn a respawn that just re-concludes "wait" — pending CI is explicitly NOT eligible. Ported
// verbatim from BOTH proven forks: S6's ztrack-board variant and T6's gh-issues variant, made pluggable
// via a config key (`eligibility: "ztrack" | "gh-issues"`) instead of the two forks' hardcoded shape — the
// PR-leg (openPrNeedsActionEligible, including the StatusContext arm) is IDENTICAL in both and shared.
import type { ProcRunner } from './types.ts';
import { firstLine } from './proc.ts';

export type EligibilityVariant = 'ztrack' | 'gh-issues';
export type NoteFn = (line: string) => void;

// --- ready-issues leg (variant-specific) ---------------------------------------------------------------

/** S6 variant: ztrack `issue list --state ready` — non-empty = eligible. */
function readyIssuesEligibleZtrack(cwd: string, proc: ProcRunner, note: NoteFn): boolean {
  const r = proc('npx', ['ztrack', 'issue', 'list', '--state', 'ready', '--json', 'identifier'], { cwd });
  if (r.status !== 0) {
    console.error(`[oa] eligibility: ready-issues = unknown (ztrack probe failed: ${firstLine(r.stderr)})`);
    return false;
  }
  let rows: unknown[] = [];
  try {
    rows = JSON.parse(r.stdout || '[]');
  } catch {
    rows = [];
  }
  const has = Array.isArray(rows) && rows.length > 0;
  note(`[oa] eligibility: ready-issues = ${has} (${Array.isArray(rows) ? rows.length : '?'} ready)`);
  return has;
}

/** T6 variant: gh open issues labeled `ready`, minus the two PARKED labels (`needs-info`,
 *  `human-required`) that must never read as dispatchable even if `ready` is also present (a human
 *  paused it). Deliberately does NOT also cross-check "no open PR yet" — the pm SKILL's own WIP=1 step
 *  already enforces that downstream every tick it actually runs; a redundant respawn while WIP is full
 *  costs at most one wasted no-op tick, never a WIP violation. */
function readyIssuesEligibleGhIssues(cwd: string, proc: ProcRunner, note: NoteFn): boolean {
  const r = proc('gh', ['issue', 'list', '--state', 'open', '--label', 'ready', '--json', 'number,labels', '--limit', '100'], { cwd });
  if (r.status !== 0) {
    console.error(`[oa] eligibility: ready-issues = unknown (gh probe failed: ${firstLine(r.stderr)})`);
    return false;
  }
  let rows: Array<{ labels?: Array<{ name: string }> }> = [];
  try {
    rows = JSON.parse(r.stdout || '[]');
  } catch {
    rows = [];
  }
  const parked = new Set(['needs-info', 'human-required']);
  const dispatchable = Array.isArray(rows) ? rows.filter((row) => !(Array.isArray(row.labels) && row.labels.some((l) => parked.has(l.name)))) : [];
  const has = dispatchable.length > 0;
  note(`[oa] eligibility: ready-issues = ${has} (${dispatchable.length}/${Array.isArray(rows) ? rows.length : '?'} ready, non-parked)`);
  return has;
}

// --- PR-concluded leg (SHARED across both variants) ----------------------------------------------------

/** A rollup NODE has "concluded" per its GraphQL type: a CheckRun carries `status`
 *  (QUEUED/IN_PROGRESS/COMPLETED — concluded iff COMPLETED); a StatusContext (a plain commit status — e.g.
 *  a required `agent-review` check realized as a commit status, not a Checks-API run) carries `state`
 *  instead (PENDING/EXPECTED/SUCCESS/FAILURE/ERROR — concluded iff neither PENDING nor EXPECTED). Without
 *  the StatusContext arm, a repo whose required check is a commit status reads as permanently pending
 *  here and PR-eligibility is permanently false on that repo — not hypothetical: this is exactly twin's
 *  own `agent-review` shape (T6's proving ground for this arm). */
export const rollupNodeConcluded = (c: { status?: string; state?: string }): boolean =>
  c.status === 'COMPLETED' || (!!c.state && c.state !== 'PENDING' && c.state !== 'EXPECTED');

export function openPrNeedsActionEligible(cwd: string, proc: ProcRunner, note: NoteFn): boolean {
  const r = proc('gh', ['pr', 'list', '--state', 'open', '--json', 'headRefName,statusCheckRollup'], { cwd });
  if (r.status !== 0) {
    console.error(`[oa] eligibility: open-pr = unknown (gh probe failed: ${firstLine(r.stderr)})`);
    return false;
  }
  let prs: Array<{ statusCheckRollup?: Array<{ status?: string; state?: string }> }> = [];
  try {
    prs = JSON.parse(r.stdout || '[]');
  } catch {
    prs = [];
  }
  // "Concluded" = every reported rollup node has finished — a pending/queued/in-progress rollup, or an
  // EMPTY rollup (checks haven't reported in yet), is NOT eligible: pending CI must never spin-spawn a
  // session that just re-concludes "wait".
  const concluded = prs.filter((pr) => Array.isArray(pr.statusCheckRollup) && pr.statusCheckRollup.length > 0 && pr.statusCheckRollup.every(rollupNodeConcluded));
  const has = concluded.length > 0;
  note(`[oa] eligibility: open-pr-concluded = ${has} (${concluded.length}/${prs.length} open PRs have concluded checks)`);
  return has;
}

// --- in-progress-issues leg (ztrack variant ONLY — T6 drops this leg, see below) ------------------------

/** S6's third leg: ztrack issues in state `in-progress`. T6 (gh-issues) has NO equivalent board state to
 *  query — twin's workflow.md states plainly there is no GitHub label for "in progress" (it's inferred
 *  from `runner.ts list develop`, which would add a live termfleet dependency to an otherwise cheap
 *  gh-only probe) — so the gh-issues variant DROPS this leg rather than replace it (a spurious extra
 *  respawn while a worker is still building costs at most one wasted no-op tick, never a WIP violation,
 *  since WIP=1 is already enforced downstream + the outer singleton already prevents session-stacking). */
function inProgressIssuesEligibleZtrack(cwd: string, proc: ProcRunner, note: NoteFn): boolean {
  const r = proc('npx', ['ztrack', 'issue', 'list', '--state', 'in-progress', '--json', 'identifier'], { cwd });
  if (r.status !== 0) {
    console.error(`[oa] eligibility: in-progress-issues = unknown (ztrack probe failed: ${firstLine(r.stderr)})`);
    return false;
  }
  let rows: unknown[] = [];
  try {
    rows = JSON.parse(r.stdout || '[]');
  } catch {
    rows = [];
  }
  const has = Array.isArray(rows) && rows.length > 0;
  note(`[oa] eligibility: in-progress-issues = ${has} (${Array.isArray(rows) ? rows.length : '?'} in-progress)`);
  return has;
}

/** Build a stateful `eligible()` for one reconciled script — verdict lines are buffered and only flushed
 *  when the OVERALL verdict CHANGES since the last probe cycle (a long-idle board would otherwise print
 *  the same lines every min-gap forever); probe FAILURES stay loud on every probe (breakage must never go
 *  quiet). `variant` selects which board-probe legs run; the PR leg is always included (shared). */
export function makeEligibilityCheck(cwd: string, variant: EligibilityVariant, proc: ProcRunner): () => boolean {
  let lastVerdict: boolean | null = null; // null = never probed, so the FIRST probe cycle's lines always print
  const readyIssuesEligible = variant === 'gh-issues' ? readyIssuesEligibleGhIssues : readyIssuesEligibleZtrack;
  return function eligible(): boolean {
    const buffered: string[] = [];
    const note: NoteFn = (line) => buffered.push(line);
    // Short-circuit OR (cheapest/most-common leg first) — a leg skipped by short-circuit contributes no line.
    const verdict =
      readyIssuesEligible(cwd, proc, note) ||
      openPrNeedsActionEligible(cwd, proc, note) ||
      (variant === 'ztrack' && inProgressIssuesEligibleZtrack(cwd, proc, note));
    if (verdict !== lastVerdict) {
      for (const line of buffered) console.error(line);
      console.error(`[oa] eligibility: overall = ${verdict}`);
      lastVerdict = verdict;
    }
    return verdict;
  };
}
