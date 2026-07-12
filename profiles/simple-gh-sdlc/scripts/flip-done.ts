#!/usr/bin/env bun
// THE done-flip, reworked as a PR flow (replaces reconcile-merged-issues.ts's direct `git push origin main`,
// which `main` branch protection — enforce_admins, required ci+security+agent-review, no bypass — REJECTS for
// every identity including github-actions[bot] (GH006). Branch PUSHES are allowed; only `main` itself is
// protected. So the done-flip now lands through the SAME mechanism every other change lands through: open a
// PR, gate it, let native auto-merge merge it.
//
// For a merged `agent/issue-<id>` PR, this script:
//   1. Checks the CURRENT committed store (fetched fresh off origin/main) — if the issue is already `done`
//      with `PR:` already equal to the real merge sha, this is a no-op (idempotent; mirrors
//      reconcile-merged-issues.ts's `alreadyReconciled`).
//   2. Otherwise creates branch `flip/<id>` off latest `origin/main`, runs
//      `ztrack issue patch <id> --json '{"pr":{"url":"<mergeSha>"}}'` + `ztrack issue edit <id> --state done`,
//      commits ONLY `.volter/tracker/markdown/<id>.md`, pushes the branch, and opens a PR `flip/<id> -> main`.
//
// This is called by .github/workflows/flip-done.yml, once per merged agent PR (detected on `pull_request`
// closed+merged for an `agent/issue-*` head, with a schedule backstop for any merge that fired no event this
// substrate caught — mirrors merge.yml's own dispatch+schedule shape).
//
// NEVER trigger a flip for a `flip/*` head itself (no-recursive-flip guard) — enforced by the caller
// (flip-done.yml only fires this for `agent/issue-*` heads), not re-checked here, since this script only ever
// receives a `MergedPr` the caller already filtered.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AGENT_ISSUE_BRANCH, alreadyReconciled } from './reconcile-merged-issues.js';

const STORE_DIR = '.volter/tracker/markdown';

export interface MergedPr {
  number: number;
  headRefName: string;
  mergeCommit: { oid: string } | null;
}

export interface FlipShell {
  git: (args: string[], opts?: { allowFail?: boolean }) => string;
  gh: (args: string[], opts?: { allowFail?: boolean }) => string;
  ztrack: (args: string[]) => { ok: boolean; out: string };
  readStore: (storePath: string) => string | null;
}

export type FlipResult =
  | { action: 'already-done'; issueId: string }
  | { action: 'no-match'; issueId: string }
  | { action: 'no-sha'; issueId: string }
  | { action: 'no-store-file'; issueId: string }
  | { action: 'patch-failed' | 'edit-failed'; issueId: string; detail: string }
  | { action: 'unchanged'; issueId: string }
  | { action: 'flip-pr-opened'; issueId: string; branch: string; prNumber: number; prUrl: string }
  | { action: 'flip-pr-exists'; issueId: string; branch: string; prNumber: number };

// Pure-ish core: given the merged agent PR + a shell, decide + perform the flip. Exposed so a scratch proof
// (or a future unit test) can substitute a fake shell with no real git/gh/ztrack calls.
export function flipOne(pr: MergedPr, shell: FlipShell): FlipResult {
  const m = AGENT_ISSUE_BRANCH.exec(pr.headRefName || '');
  if (!m) return { action: 'no-match', issueId: '' };
  const issueId = m[1]!;
  const mergeSha = pr.mergeCommit?.oid || '';
  if (!mergeSha) return { action: 'no-sha', issueId };

  const storePath = join(STORE_DIR, `${issueId}.md`);

  // Read the CURRENT store off latest main (the caller is expected to have fetched/checked out main fresh;
  // this function itself does not fetch, so it stays testable with an in-memory shell).
  const current = shell.readStore(storePath);
  if (current == null) return { action: 'no-store-file', issueId };
  if (alreadyReconciled(current, mergeSha)) return { action: 'already-done', issueId };

  const flipBranch = `flip/${issueId}`;

  // Idempotent: an OPEN flip PR for this branch already exists — don't open a second one. (A closed/merged
  // flip PR for the OLD sha would already have flipped the store to done, so `alreadyReconciled` above would
  // have caught it; an open one for a DIFFERENT stale sha is a rare re-merge-of-same-branch edge case this
  // script doesn't attempt to reconcile — the human-required path handles anything that unusual.)
  const existingPrNumber = shell.gh(
    ['pr', 'list', '--head', flipBranch, '--state', 'open', '--json', 'number', '--jq', '.[0].number // empty'],
    { allowFail: true },
  );
  if (existingPrNumber) {
    return { action: 'flip-pr-exists', issueId, branch: flipBranch, prNumber: Number(existingPrNumber) };
  }

  // Branch off latest origin/main (never off whatever happens to be checked out).
  shell.git(['checkout', '-B', flipBranch, 'origin/main']);

  const patch = shell.ztrack(['issue', 'patch', issueId, '--json', JSON.stringify({ pr: { url: mergeSha } })]);
  if (!patch.ok) return { action: 'patch-failed', issueId, detail: patch.out };
  const edit = shell.ztrack(['issue', 'edit', issueId, '--state', 'done']);
  if (!edit.ok) return { action: 'edit-failed', issueId, detail: edit.out };

  const after = shell.readStore(storePath);
  if (after === current) return { action: 'unchanged', issueId };

  // Stage ONLY the one store file — the diff-gate (check-flip-diff.ts) re-verifies this server-side, but
  // staging narrowly here means a bug elsewhere (e.g. ztrack touching unrelated files) can never ride along
  // even before the gate runs.
  shell.git(['add', '--', storePath]);
  shell.git(['commit', '-m', `chore: ${issueId} done (merged ${mergeSha.slice(0, 7)}, PR #${pr.number})`]);
  shell.git(['push', '--force', 'origin', flipBranch]);

  const body = [
    `Bookkeeping flip: ${issueId} -> done, anchored to the merge commit of #${pr.number}.`,
    '',
    `PR: ${mergeSha}`,
    '',
    'This PR is MECHANICAL — it changes only `.volter/tracker/markdown/' + issueId + '.md`, and only the ' +
      '`state:` field + the `PR:` line. It is gated + auto-approved by .github/workflows/flip-done.yml\'s ' +
      'diff-scoped check (see scripts/check-flip-diff.ts), never by a blanket branch-name allow.',
  ].join('\n');
  const created = shell.gh([
    'pr', 'create', '--base', 'main', '--head', flipBranch,
    '--title', `flip: ${issueId} -> done (merged PR #${pr.number})`,
    '--body', body,
  ], { allowFail: true });
  if (!created) {
    // Might already exist from a racing run — resolve it rather than treating as fatal.
    const num = shell.gh(['pr', 'view', flipBranch, '--json', 'number', '--jq', '.number'], { allowFail: true });
    if (num) return { action: 'flip-pr-exists', issueId, branch: flipBranch, prNumber: Number(num) };
    throw new Error(`flip-done: failed to open flip PR for ${issueId} and none exists to recover`);
  }
  const prNumber = Number(shell.gh(['pr', 'view', flipBranch, '--json', 'number', '--jq', '.number']));
  const prUrl = shell.gh(['pr', 'view', flipBranch, '--json', 'url', '--jq', '.url']);
  return { action: 'flip-pr-opened', issueId, branch: flipBranch, prNumber, prUrl };
}

function realShell(): FlipShell {
  const git = (args: string[], opts: { allowFail?: boolean } = {}): string => {
    try {
      return execFileSync('git', args, { encoding: 'utf8' }).trim();
    } catch (e) {
      if (opts.allowFail) return '';
      throw e;
    }
  };
  const gh = (args: string[], opts: { allowFail?: boolean } = {}): string => {
    try {
      return execFileSync('gh', args, { encoding: 'utf8' }).trim();
    } catch (e) {
      if (opts.allowFail) return '';
      throw e;
    }
  };
  const ztrack = (args: string[]): { ok: boolean; out: string } => {
    try {
      return { ok: true, out: execFileSync('bunx', ['ztrack', ...args], { encoding: 'utf8' }).trim() };
    } catch (e) {
      return { ok: false, out: e instanceof Error ? e.message : String(e) };
    }
  };
  return {
    git, gh, ztrack,
    readStore: (storePath) => (existsSync(storePath) ? readFileSync(storePath, 'utf8') : null),
  };
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) {
    process.stderr.write('flip-done: no GITHUB_REPOSITORY\n');
    process.exit(1);
  }
  const shell = realShell();

  // Fetch main fresh so `readStore`/`git checkout -B flip/<id> origin/main` see the LATEST committed store —
  // never a possibly-stale local `main` a prior step left behind.
  shell.git(['fetch', 'origin', 'main']);

  let mergedPrs: MergedPr[] = [];
  try {
    mergedPrs = JSON.parse(
      shell.gh(['pr', 'list', '-R', repo, '--state', 'merged', '--limit', '100', '--json', 'number,headRefName,mergeCommit']) || '[]',
    );
  } catch {
    mergedPrs = [];
  }

  let loud = false; // becomes true on any failure that must surface (never silently swallowed)
  let opened = 0;
  let alreadyDone = 0;
  let exists = 0;

  for (const pr of mergedPrs) {
    // Never flip a `flip/*` head — no-recursive-flip guard, belt-and-suspenders alongside the caller's own
    // filter (this loop itself only matches AGENT_ISSUE_BRANCH, which `flip/*` never does — see flipOne).
    const result = flipOne(pr, shell);
    switch (result.action) {
      case 'no-match':
      case 'no-sha':
      case 'no-store-file':
        continue; // not this script's concern — same as reconcile-merged-issues.ts's classification
      case 'already-done':
        alreadyDone++;
        continue;
      case 'flip-pr-exists':
        exists++;
        process.stdout.write(`flip-done: ${result.issueId} already has an open flip PR #${result.prNumber} (${result.branch})\n`);
        continue;
      case 'flip-pr-opened':
        opened++;
        process.stdout.write(`flip-done: opened flip PR #${result.prNumber} for ${result.issueId} (${result.branch}) -> ${result.prUrl}\n`);
        continue;
      case 'patch-failed':
      case 'edit-failed':
        loud = true;
        process.stderr.write(`::error::flip-done: ${result.action} for ${result.issueId}: ${result.detail}\n`);
        continue;
      case 'unchanged':
        loud = true;
        process.stderr.write(`::error::flip-done: ${result.issueId} — ztrack commands ran but the store file is unchanged; refusing to open an empty flip PR\n`);
        continue;
    }
  }

  process.stdout.write(
    `flip-done: ${opened} flip PR(s) opened, ${exists} already open, ${alreadyDone} already done (${mergedPrs.length} merged PRs scanned)\n`,
  );

  if (loud) {
    process.stderr.write('::error::flip-done: one or more issues failed to flip — surfaced above, NOT silently swallowed\n');
    process.exit(1);
  }
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(`::error::flip-done: fatal — ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
