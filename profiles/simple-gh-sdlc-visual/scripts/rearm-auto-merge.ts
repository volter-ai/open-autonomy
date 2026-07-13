#!/usr/bin/env bun
// Deterministic re-arm: ensure every open agent-proposed PR has native auto-merge ARMED. The proposer dispatches
// merge.yml right after `pr create` to arm it, but that dispatch (and the arm itself) can miss transiently
// (GitHub is still computing the PR's mergeability) — and nothing an agent runs re-arms it: no agent holds
// contents:write, and the PM is forbidden to merge. Without this backstop a PR's checks go green with auto-merge
// never armed and it sits unmerged forever, so issues never close and the roadmap never advances. This sweep
// re-arms any agent PR missing it. It is mechanical WIRING, not judgment — it CANNOT bypass review: branch
// protection still requires ci + agent-review server-side, so `--auto` only ever lands a PR once those checks
// are green. Run by the merge.yml code-host resource (dispatch + schedule); idempotent — re-arming an
// armed/merged PR is a no-op.
//
// MODE-SWITCHED merge method (runtime, on `.volter/tracker-config.json` presence — see
// scripts/reconcile-merged-issues.ts's `isCommittedStoreMode` for the same convention): a committed-store
// install's ztrack evidence lines cite a commit sha on the `agent/issue-<id>` branch itself
// (standards/issue-and-evidence.md). A squash merge rewrites that into a brand-new squashed sha on `main`
// and drops the original commit from history entirely — content lands (sha256-identical) but the CITED sha
// becomes unreachable, so `ztrack check` on a clean clone of `main` fails `evidence_commit_not_found` even
// though the work genuinely merged (confirmed live on the testbed: two squashed PRs both orphaned their
// evidence commits — `git merge-base --is-ancestor <cited-sha> origin/main` returned 1 for both). `--merge`
// keeps every branch commit (incl. the cited evidence commit) as an ancestor of `main`, so committed-store
// installs use it for BOTH `agent/*` and `flip/*` arming. A legacy (no-tracker) install has no evidence-
// ancestry model to protect, so it keeps the original `--squash` behavior unchanged.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const TRACKER_CONFIG_PATH = '.volter/tracker-config.json';

// Pure + testable without invoking real `gh`: which merge method `armWithRetry` should use for this
// install. Mirrors `reconcile-merged-issues.ts`'s `isCommittedStoreMode` runtime check (same file's
// existence, same reasoning) rather than re-deriving its own detection logic.
export function mergeMethodFor(root = '.'): '--merge' | '--squash' {
  return existsSync(join(root, TRACKER_CONFIG_PATH)) ? '--merge' : '--squash';
}

// An intentionally-held PR must not be re-armed. The label vocabulary is the PROFILE's, declared once at
// `policy.merge.maintainer_block_labels` in .open-autonomy/autonomy.yml — this sweep owns no labels of its
// own; it reads the org's declaration. Branch protection's red required check already blocks a held PR from
// merging, but skipping these avoids needless churn and respects an explicit pause/hold.
// DEFAULT_HOLD is the fallback for a mid-upgrade install whose manifest predates the key — it fails CLOSED
// (the widest set: skips more, never re-arms through a hold the org meant to declare).
export const DEFAULT_HOLD = ['do-not-merge', 'human-required', 'agent-blocked', 'agent-paused', 'agent-maintainer-hold'];
export function loadHoldLabels(root = '.'): Set<string> {
  try {
    const manifest = (Bun.YAML.parse(readFileSync(join(root, '.open-autonomy', 'autonomy.yml'), 'utf8')) ?? {}) as {
      policy?: { merge?: { maintainer_block_labels?: unknown } };
    };
    const labels = manifest.policy?.merge?.maintainer_block_labels;
    if (Array.isArray(labels) && labels.length > 0 && labels.every((l) => typeof l === 'string')) {
      return new Set(labels as string[]);
    }
  } catch {
    /* missing/unparseable manifest → the fail-closed default below */
  }
  return new Set(DEFAULT_HOLD);
}

// Only ever touch agent-proposed branches — never a human's PR. `agent/` is the ONE prefix the proposer
// (agent-propose.ts) creates for every agent, whatever its name — a seam-contract constant, not a roster.
export const AGENT_BRANCH = /^agent\//;

// The ONE other machine-authored prefix in this repo: the done-flip bookkeeping PR
// (.github/workflows/flip-done.yml, scripts/flip-done.ts, committed-store mode only) also needs auto-merge
// armed by this same backstop — flip-done.yml itself arms it inline right after the diff-gate passes, but
// that inline arm can miss transiently exactly like agent-propose.ts's (mergeability still UNKNOWN), so this
// sweep must cover it too, or a green-but-unarmed flip PR sits stuck forever with nothing else re-arming it.
// Matching is unconditional (harmless in legacy mode: no `flip/*` branch is ever created there, so this
// regex simply never matches anything on a legacy install).
export const FLIP_BRANCH = /^flip\//;

export interface PR {
  number: number;
  headRefName: string;
  isDraft: boolean;
  autoMergeRequest: unknown | null;
  labels: { name: string }[];
}

export type Disposition = 'arm' | 'held' | 'ignore';
export function disposition(pr: PR, hold: Set<string>): Disposition {
  if (pr.isDraft) return 'ignore';
  if (pr.autoMergeRequest) return 'ignore'; // already armed
  const headRef = pr.headRefName || '';
  // Machine-authored branches only — `agent/*` (a developer's proposal) or `flip/*` (the done-flip
  // bookkeeping PR, committed-store mode). Leave every human PR alone.
  if (!AGENT_BRANCH.test(headRef) && !FLIP_BRANCH.test(headRef)) return 'ignore';
  if ((pr.labels || []).some((l) => hold.has(l.name))) return 'held'; // intentionally held
  return 'arm';
}

const gh = (args: string[]): string => {
  try {
    return execFileSync('gh', args, { encoding: 'utf8' }).trim();
  } catch (e) {
    process.stderr.write(`rearm: gh ${args.join(' ')} failed: ${e instanceof Error ? e.message : String(e)}\n`);
    return '';
  }
};
const ghOk = (args: string[]): boolean => {
  try {
    execFileSync('gh', args, { encoding: 'utf8', stdio: 'pipe' });
    return true;
  } catch {
    return false; // transient (mergeability still computing, conflict, …) → retried below / next sweep
  }
};
const sleep = (s: number): void => {
  try { execFileSync('sleep', [String(s)]); } catch { /* best-effort pacing */ }
};

if (import.meta.main) {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) {
    process.stderr.write('rearm: no GITHUB_REPOSITORY — skipping\n');
    process.exit(0);
  }

  // Arm with a bounded RETRY. Right after `pr create` GitHub reports mergeable=UNKNOWN for a few seconds, so a
  // single `--auto` loses that race and the PR sits green-but-unarmed until the next scheduled sweep (~15 min).
  // The proposer dispatches merge.yml on the hot path, so this sweep must ride out the UNKNOWN window itself —
  // the same 6×retry the old inline arm had. Bounded + idempotent: a genuinely-stuck PR (conflict) just exhausts
  // the retries and is caught next sweep; arming an already-armed/merged PR is a no-op.
  const mergeMethod = mergeMethodFor();
  const armWithRetry = (number: number): boolean => {
    for (let i = 0; i < 6; i++) {
      if (ghOk(['pr', 'merge', String(number), '-R', repo, mergeMethod, '--auto'])) return true;
      if (i < 5) sleep(4);
    }
    return false;
  };

  const hold = loadHoldLabels();
  let prs: PR[] = [];
  try {
    prs = JSON.parse(gh(['pr', 'list', '-R', repo, '--state', 'open', '--limit', '100', '--json', 'number,headRefName,isDraft,autoMergeRequest,labels']) || '[]');
  } catch {
    prs = [];
  }

  let armed = 0;
  let skipped = 0;
  for (const pr of prs) {
    const d = disposition(pr, hold);
    if (d === 'ignore') continue;
    if (d === 'held') { skipped++; continue; }
    if (armWithRetry(pr.number)) {
      process.stdout.write(`rearm: armed auto-merge on #${pr.number} (${pr.headRefName})\n`);
      armed++;
    } else {
      process.stdout.write(`rearm: could not arm #${pr.number} yet (${pr.headRefName}) — will retry next sweep\n`);
    }
  }
  process.stdout.write(`rearm: ${armed} PR(s) re-armed, ${skipped} held (${prs.length} open)\n`);
}
