#!/usr/bin/env bun
// Deterministic reconcile: close every open issue whose linked PR has MERGED. GitHub's `Closes #n` keyword
// does not auto-close on bot-enabled auto-merge (see docs), and the bot merge fires no event to hook, so the
// close must happen on a periodic sweep — but it is mechanical WIRING, not a judgment, so it runs as a
// deterministic step (not in the PM model skill, which a model can skip). Emitted for tasks:author agents
// (the periodic issue-managers); idempotent, so running it on every sweep is safe. Needs issues:write +
// GH_TOKEN, which a tasks:author agent's job already holds.
import { execFileSync } from 'node:child_process';

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

// Open issues, then for each ask whether a MERGED PR closes it (the GitHub-tracked closing link).
const openRaw = gh(['issue', 'list', '-R', repo, '--state', 'open', '--limit', '100', '--json', 'number']);
let open: { number: number }[] = [];
try {
  open = JSON.parse(openRaw || '[]');
} catch {
  open = [];
}

let closed = 0;
for (const { number } of open) {
  const linkedRaw = gh(['issue', 'view', String(number), '-R', repo, '--json', 'closedByPullRequestsReferences']);
  let refs: { number: number; state: string }[] = [];
  try {
    refs = (JSON.parse(linkedRaw || '{}').closedByPullRequestsReferences ?? []) as { number: number; state: string }[];
  } catch {
    refs = [];
  }
  const mergedPr = refs.find((r) => (r.state || '').toUpperCase() === 'MERGED');
  if (!mergedPr) continue;
  if (gh(['issue', 'close', String(number), '-R', repo, '-c', `Resolved by #${mergedPr.number} (merged). Closed by the deterministic reconcile.`]) !== undefined) {
    process.stdout.write(`reconcile: closed #${number} (resolved by merged #${mergedPr.number})\n`);
    closed++;
  }
}
process.stdout.write(`reconcile: ${closed} issue(s) closed across ${open.length} open\n`);
