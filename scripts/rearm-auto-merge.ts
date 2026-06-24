#!/usr/bin/env bun
// Deterministic re-arm: ensure every open agent-proposed PR has native auto-merge ARMED. The proposer's effect
// step arms it once right after `pr create`, but that call can fail transiently (GitHub is still computing the
// PR's mergeability, so the arm errors) — and nothing else re-arms it: no agent holds contents:write, and the
// PM is forbidden to merge. Without this backstop a PR's checks go green with auto-merge never armed and it sits
// unmerged forever, so issues never close and the roadmap never advances. This periodic sweep re-arms any agent
// PR missing it. It is mechanical WIRING, not judgment — it CANNOT bypass review: branch protection still
// requires ci + agent-review server-side, so `--auto` only ever lands a PR once those checks are green. Emitted
// for tasks:author agents (the periodic issue-managers); idempotent — re-arming an armed/merged PR is a no-op.
import { execFileSync } from 'node:child_process';

const repo = process.env.GITHUB_REPOSITORY;
if (!repo) {
  process.stderr.write('rearm: no GITHUB_REPOSITORY — skipping\n');
  process.exit(0);
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
    return false; // transient (mergeability still computing, conflict, …) → retried next sweep
  }
};

// An intentionally-held PR must not be re-armed. Branch protection's red required check already blocks a held
// PR from merging, but skipping these avoids needless churn and respects an explicit pause/hold.
const HOLD = new Set(['agent-paused', 'agent-maintainer-hold', 'human-required', 'do-not-merge']);
// Only ever touch agent-proposed branches — never a human's PR.
const AGENT_BRANCH = /^(agent|strategist)\//;

interface PR {
  number: number;
  headRefName: string;
  isDraft: boolean;
  autoMergeRequest: unknown | null;
  labels: { name: string }[];
}

let prs: PR[] = [];
try {
  prs = JSON.parse(gh(['pr', 'list', '-R', repo, '--state', 'open', '--limit', '100', '--json', 'number,headRefName,isDraft,autoMergeRequest,labels']) || '[]');
} catch {
  prs = [];
}

let armed = 0;
let skipped = 0;
for (const pr of prs) {
  if (pr.isDraft) { continue; }
  if (pr.autoMergeRequest) { continue; } // already armed
  if (!AGENT_BRANCH.test(pr.headRefName || '')) { continue; } // not an agent-proposed PR — leave human PRs alone
  if ((pr.labels || []).some((l) => HOLD.has(l.name))) { skipped++; continue; } // intentionally held
  if (ghOk(['pr', 'merge', String(pr.number), '-R', repo, '--squash', '--auto'])) {
    process.stdout.write(`rearm: armed auto-merge on #${pr.number} (${pr.headRefName})\n`);
    armed++;
  } else {
    process.stdout.write(`rearm: could not arm #${pr.number} yet (${pr.headRefName}) — will retry next sweep\n`);
  }
}
process.stdout.write(`rearm: ${armed} PR(s) re-armed, ${skipped} held (${prs.length} open)\n`);
