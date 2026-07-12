#!/usr/bin/env bun
// MODE-SWITCHED at runtime on the presence of `.volter/tracker-config.json` at repo root — the existing
// convention this repo already points adopters at to verify their ztrack preset (bin/autonomy-compile.ts's
// local-runner "next steps" print). This file must stay ONE canonical, byte-identical resource across every
// profile that carries it (check:profiles' drift guard) and byte-identical to what compile(profiles/
// self-driving) produces (check:dogfood) — so a committed-store install and a legacy (no-tracker) install
// share this one file rather than forking it, with the mode decided at RUNTIME (existsSync), never at
// profile-compile time.
//
// LEGACY MODE (no .volter/tracker-config.json — the ORIGINAL, UNCHANGED behavior): close every open GitHub
// issue whose linked PR has MERGED. GitHub's `Closes #n` keyword does not auto-close on bot-enabled
// auto-merge, and the bot merge fires no event to hook, so the close must happen on a periodic sweep — but
// it is mechanical WIRING, not a judgment, so it runs as a deterministic step (not in the PM model skill,
// which a model can skip). Run by the merge.yml code-host resource (dispatch + schedule), decoupled from any
// agent run; idempotent, so running it on every sweep is safe. Needs issues:write + GH_TOKEN, which the
// merge.yml job holds.
//
// COMMITTED-STORE MODE (.volter/tracker-config.json exists): the committed ztrack store
// (`.volter/tracker/markdown/`) is the single source of truth — there is no separate GitHub-issue-body state
// to keep in sync, so "reconcile" here is no longer "close the GitHub issue whose linked PR merged"; it's
// "make the store agree that the work landed". BUT a direct push to flip the store to `done` is exactly the
// failure this file used to ship silently: `main` branch protection (`enforce_admins`, required checks, no
// bypass) REJECTS a direct push for EVERY identity including github-actions[bot] (GH006) — so that push
// failed on every run, silently, behind merge.yml's own `|| true`, and every merged issue's store stayed
// stuck at `in-review` forever. THE FIX lives in scripts/flip-done.ts + .github/workflows/flip-done.yml: the
// flip now lands through a gated bookkeeping PR (`flip/<id> -> main`), which CAN land (branch pushes are
// allowed; only `main` itself is protected) and is auto-approved only after scripts/check-flip-diff.ts
// mechanically verifies the diff is exactly a done-flip. This file's store-aware helpers below
// (`AGENT_ISSUE_BRANCH`, `parseStoreState`, `alreadyReconciled`, `reconcileOne`) are kept and exported —
// flip-done.ts imports them directly — but this file's own CLI entrypoint, in store mode, is a loud,
// immediate failure (NOT a silent no-op), redirecting to flip-done.ts/flip-done.yml, since `merge.yml`
// should no longer call this script's CLI to perform the flip itself in store mode — it relies on
// flip-done.yml being dispatched instead (merge.yml still calls this file with `|| true` unconditionally,
// which is harmless: the loud error is swallowed by that `|| true` exactly like the old silent push failure
// was, but flip-done.yml is the reliable path now, dispatched independently right after merge.yml runs).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const STORE_DIR = '.volter/tracker/markdown';
const TRACKER_CONFIG_PATH = '.volter/tracker-config.json';

// The mode-switch: committed-store installs carry `.volter/tracker-config.json` (written by `ztrack init`);
// a legacy (no-tracker) install carries no such file. Runtime existsSync check, not a profile-compile-time
// branch — the SAME file/resource serves both install shapes, deciding which behavior to run when it
// actually executes, not when it's compiled/copied.
export function isCommittedStoreMode(root = '.'): boolean {
  return existsSync(join(root, TRACKER_CONFIG_PATH));
}

// ---------------------------------------------------------------------------------------------------------
// Store-aware helpers (COMMITTED-STORE MODE) — exported for scripts/flip-done.ts to import directly. Unused
// in legacy mode, but kept unconditionally exported (a mode-switched file, not two files) so nothing about
// import wiring differs between install shapes.
// ---------------------------------------------------------------------------------------------------------

// Go from MERGED PRs to their store issue. Our own convention: a developer PR is on branch
// `agent/issue-<id>`, so the store id IS the branch's own suffix — a ztrack STORE id (e.g. `COMBO-9`), not
// necessarily a bare number. Widened from digit-only (legacy mode's `/^agent\/issue-(\d+)$/`) so a
// store-id branch resolves correctly — a missed file here silently breaks the done-flip.
export const AGENT_ISSUE_BRANCH = /^agent\/issue-([A-Za-z0-9._-]+)$/;

export interface MergedPr {
  number: number;
  headRefName: string;
  mergeCommit: { oid: string } | null;
}

// The store file's OWN frontmatter `state:` + body `PR:` line — read directly off disk (never through
// `ztrack issue view`'s JSON shape, which doesn't expose `pr` as a stable top-level key) so this idempotency
// check is exact and dependency-free.
export function parseStoreState(text: string): { state: string; prUrl: string } {
  const state = /^state:\s*"?([^"\n]+?)"?\s*$/m.exec(text)?.[1]?.trim() ?? '';
  const prUrl = /^PR:\s*(\S+)/m.exec(text)?.[1]?.trim() ?? '';
  return { state, prUrl };
}

// Idempotency predicate — pure so it's testable without touching disk/git. Already-reconciled means: the
// store is ALREADY `done` AND its `PR:` value already IS this merge commit's sha (not merely present — a
// stale `agent/issue-<id>` branch value from before merge must still get patched to the real sha once).
export function alreadyReconciled(storeText: string, mergeSha: string): boolean {
  const { state, prUrl } = parseStoreState(storeText);
  return state === 'done' && prUrl === mergeSha;
}

export interface ReconcileShell {
  gh: (args: string[]) => string;
  ghAllowFail: (args: string[]) => string;
  git: (args: string[]) => string;
  ztrack: (args: string[]) => { ok: boolean; out: string };
  readStore: (storePath: string) => string | null; // null = file doesn't exist
  commit: (storePath: string, message: string) => boolean; // `git add` + `git commit`; false = nothing to commit / failed
}

export interface ReconcileResult {
  issueId: string;
  action: 'flipped' | 'already-reconciled' | 'no-match' | 'no-sha' | 'no-store-file' | 'patch-failed' | 'edit-failed' | 'unchanged' | 'commit-failed';
  intakeClosed: boolean;
}

// The core, PURELY-INJECTED-SHELL reconcile logic for ONE merged PR — kept for flip-done.ts / tests to call
// directly against a constructed scenario (a fake `gh`/`git`/`ztrack`/filesystem) with no real network/
// process calls. Every side effect goes through `shell`.
export function reconcileOne(pr: MergedPr, repo: string, shell: ReconcileShell): ReconcileResult {
  const m = AGENT_ISSUE_BRANCH.exec(pr.headRefName || '');
  if (!m) return { issueId: '', action: 'no-match', intakeClosed: false }; // not an issue-bound PR
  const issueId = m[1]!;
  const mergeSha = pr.mergeCommit?.oid || '';
  if (!mergeSha) return { issueId, action: 'no-sha', intakeClosed: false };

  const storePath = join(STORE_DIR, `${issueId}.md`);
  const before = shell.readStore(storePath);
  if (before == null) return { issueId, action: 'no-store-file', intakeClosed: false };
  if (alreadyReconciled(before, mergeSha)) return { issueId, action: 'already-reconciled', intakeClosed: false };

  // Patch the PR evidence FIRST (the merge-commit sha, not the PR url — done_requires_merged_pr's
  // evidence-ancestry check resolves `PR:` as a git ref via `git rev-parse --verify <value>^{commit}` +
  // `merge-base --is-ancestor <sha> main`; only a real commit sha reachable from `main` satisfies that in a
  // fresh clone), THEN flip the state to done — so a crash between the two steps leaves the sha recorded
  // (harmless — `done_requires_merged_pr` only fires for `state: done`) rather than a `done` issue with no
  // evidence of what merged.
  const patch = shell.ztrack(['issue', 'patch', issueId, '--json', JSON.stringify({ pr: { url: mergeSha } })]);
  if (!patch.ok) return { issueId, action: 'patch-failed', intakeClosed: false };
  const edit = shell.ztrack(['issue', 'edit', issueId, '--state', 'done']);
  if (!edit.ok) return { issueId, action: 'edit-failed', intakeClosed: false };

  const after = shell.readStore(storePath);
  if (after === before) return { issueId, action: 'unchanged', intakeClosed: false };

  const message = `chore: ${issueId} done (merged ${mergeSha.slice(0, 7)}, PR #${pr.number})`;
  if (!shell.commit(storePath, message)) return { issueId, action: 'commit-failed', intakeClosed: false };

  // Optional, non-fatal courtesy close of a GitHub intake issue (the human-filed request `draft` shaped
  // into this store issue) — only when one still exists and is still open; a missing/already-closed intake
  // issue is NOT an error.
  let intakeClosed = false;
  const intakeNum = /^\d+$/.test(issueId) ? issueId : '';
  if (intakeNum) {
    const openIntake = shell.ghAllowFail(['issue', 'view', intakeNum, '-R', repo, '--json', 'state', '--jq', '.state']);
    if (openIntake === 'OPEN') {
      shell.gh(['issue', 'close', intakeNum, '-R', repo, '-c', `Resolved by merged PR #${pr.number} — tracked as ${issueId} in the committed store (done).`]);
      intakeClosed = true;
    }
  }

  return { issueId, action: 'flipped', intakeClosed };
}

// ---------------------------------------------------------------------------------------------------------
// LEGACY MODE runtime — the ORIGINAL, unchanged direct-close behavior. Extracted into a function (rather
// than top-level statements) so `isCommittedStoreMode()` can gate which mode's `main` actually runs; the
// legacy logic itself is byte-for-byte identical to before this mode-switch existed.
// ---------------------------------------------------------------------------------------------------------
function runLegacyReconcile(): void {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) {
    process.stderr.write('reconcile: no GITHUB_REPOSITORY — skipping\n');
    process.exit(0);
  }
  const gh = (args: string[]) => {
    try {
      return execFileSync('gh', args, { encoding: 'utf8' }).trim();
    } catch (e) {
      process.stderr.write(`reconcile: gh ${args.join(' ')} failed: ${e instanceof Error ? e.message : String(e)}\n`);
      return '';
    }
  };

  // Go from MERGED PRs to their issue. GitHub's `closedByPullRequestsReferences` does NOT reliably include a
  // MERGED PR (it drops/relists it without a MERGED state once merged), so issue->link doesn't work. Instead
  // use our own convention: a developer PR is on branch `agent/issue-<N>`, so the issue number is the
  // branch. (Robust + independent of GitHub's flaky closing-keyword link tracking.) Idempotent: closing an
  // already-closed issue is a no-op we skip.
  const openSet = new Set<number>();
  try {
    for (const it of JSON.parse(gh(['issue', 'list', '-R', repo, '--state', 'open', '--limit', '200', '--json', 'number']) || '[]') as { number: number }[]) {
      openSet.add(it.number);
    }
  } catch {
    /* none */
  }

  let mergedPrs: { number: number; headRefName: string }[] = [];
  try {
    mergedPrs = JSON.parse(gh(['pr', 'list', '-R', repo, '--state', 'merged', '--limit', '100', '--json', 'number,headRefName']) || '[]');
  } catch {
    mergedPrs = [];
  }

  let closed = 0;
  for (const pr of mergedPrs) {
    const m = /^agent\/issue-(\d+)$/.exec(pr.headRefName || '');
    if (!m) continue; // not an issue-bound PR (e.g. an `agent/<rid>` proposal with no linked issue)
    const issue = Number(m[1]);
    if (!openSet.has(issue)) continue; // already closed (or no such open issue)
    gh(['issue', 'close', String(issue), '-R', repo, '-c', `Resolved by #${pr.number} (merged). Closed by the deterministic reconcile.`]);
    process.stdout.write(`reconcile: closed #${issue} (resolved by merged #${pr.number})\n`);
    closed++;
  }
  process.stdout.write(`reconcile: ${closed} issue(s) closed (${mergedPrs.length} merged PRs, ${openSet.size} open issues)\n`);
}

// COMMITTED-STORE MODE CLI entrypoint — RETIRED, same as the testbed. This file's `main()` used to
// `git push origin HEAD:main` directly after flipping an issue to `done` — but `main` branch protection
// (`enforce_admins`, required ci+security+agent-review, no bypass) REJECTS every direct push, including
// github-actions[bot]'s (GH006). That push failed on EVERY run, silently, because merge.yml called this
// script with `|| true`. THE FIX lives in scripts/flip-done.ts + .github/workflows/flip-done.yml: the same
// flip now goes through a gated bookkeeping PR (`flip/<id> -> main`), auto-approved only after
// scripts/check-flip-diff.ts mechanically verifies the diff is exactly a done-flip.
// `reconcileOne`/`alreadyReconciled`/`parseStoreState`/`AGENT_ISSUE_BRANCH` above are kept and exported —
// flip-done.ts imports them directly. This mode's CLI entrypoint is intentionally left as a loud, immediate
// failure — NOT a silent no-op — so nothing (a stale cron, a copy-pasted workflow, a profile resync gone
// wrong) can resurrect the direct-push path without erroring loudly the first time it runs.
function runCommittedStoreRetirement(): void {
  console.error(
    '::error::reconcile-merged-issues.ts: RETIRED as a direct CLI entrypoint for committed-store installs ' +
      '(.volter/tracker-config.json present) — its `main()` used to `git push origin HEAD:main`, which main ' +
      'branch protection always rejects (THE BLOCKER this repo shipped a fix for). Use scripts/flip-done.ts ' +
      '(invoked by .github/workflows/flip-done.yml) instead — it lands the same done-flip through a gated ' +
      '`flip/<id>` PR rather than a doomed direct push.',
  );
  process.exit(1);
}

if (import.meta.main) {
  if (isCommittedStoreMode()) {
    runCommittedStoreRetirement();
  } else {
    runLegacyReconcile();
  }
}
