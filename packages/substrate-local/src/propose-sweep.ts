#!/usr/bin/env bun
// The LOCAL runner's realization of "run a code:propose agent's effect when it's DONE" — the counterpart of
// the github runner's post-skill job step. A termfleet window has no post-skill step and a claude Stop hook
// fires on EVERY turn (so it proposes prematurely, before develop is done), so the local runner instead runs
// this deterministic sweep each scheduler tick: for every develop worktree that is genuinely DONE, run the
// agent's own propose effect (scripts/agent-propose.ts). Emitted only for a github code host (a local-git
// code host has no PRs — the PM merges). Idempotent: skips a branch that already has an open PR.
//
// "Done" is the issue's ACs all `passed` (with evidence) — NOT `ztrack check` green, which is green for a
// `ready`+`pending` issue too (the loop only bites at in-review), so a green check does NOT mean develop
// finished. We read the github issue body (develop pushes its evidence there) and require >=1 AC and 0 pending.
import { execFileSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';

const sh = (c: string, a: string[], o: Record<string, unknown> = {}): string => {
  try { return execFileSync(c, a, { encoding: 'utf8', ...o }).trim(); } catch { return ''; }
};
const ok = (c: string, a: string[], o: Record<string, unknown> = {}): boolean => {
  try { execFileSync(c, a, { stdio: 'pipe', ...o }); return true; } catch { return false; }
};

const repo = process.env.GITHUB_REPOSITORY || sh('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']);
if (!repo || !existsSync('.worktrees')) process.exit(0);

for (const d of readdirSync('.worktrees')) {
  const m = /^agent-issue-(\d+)$/.exec(d);
  if (!m) continue;
  const num = m[1];
  const wt = `.worktrees/${d}`;
  const branch = `agent/issue-${num}`;
  // already proposed? — check ALL states, not just open: once a branch has a PR (open OR already merged), never
  // re-propose. (A merged PR closes, so an "open-only" check would re-propose a landed branch — the duplicate
  // bug a sustained autonomous run surfaced.) A still-open PR is updated by develop pushing, not a new propose.
  if (sh('gh', ['pr', 'list', '-R', repo, '--head', branch, '--state', 'all', '--json', 'number', '--jq', '.[0].number // empty'])) continue;
  // develop committed real work?
  const ahead = sh('git', ['-C', wt, 'rev-list', '--count', `origin/HEAD..${branch}`]) || sh('git', ['-C', wt, 'rev-list', '--count', `origin/main..${branch}`]);
  if (!ahead || ahead === '0') continue;
  // develop DONE? — the issue's ACs are all passed (develop pushes evidence to the issue body).
  const body = sh('gh', ['issue', 'view', num, '-R', repo, '--json', 'body', '--jq', '.body']);
  const passed = (body.match(/status:\s*passed/gi) || []).length;
  const pending = (body.match(/status:\s*pending/gi) || []).length;
  if (passed === 0 || pending > 0) { process.stdout.write(`sweep: #${num} not done yet (passed=${passed} pending=${pending}) — skip\n`); continue; }
  process.stdout.write(`sweep: proposing #${num} (develop done)\n`);
  const env = {
    ...process.env,
    ISSUE_REF: num,
    AGENT_NAME: 'develop',
    AGENT_BOT_NAME: process.env.AGENT_BOT_NAME || 'open-autonomy-agent',
    AGENT_BOT_EMAIL: process.env.AGENT_BOT_EMAIL || 'open-autonomy-agent@users.noreply.github.com',
    REVIEW_WORKFLOW: process.env.PROPOSE_REVIEW_WORKFLOW || '',
    GITHUB_REPOSITORY: repo,
  };
  ok('bun', ['scripts/agent-propose.ts'], { cwd: wt, env, stdio: 'inherit' });
}
