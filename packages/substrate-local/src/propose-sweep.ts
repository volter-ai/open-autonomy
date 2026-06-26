#!/usr/bin/env bun
// The LOCAL runner's realization of "run a finished code:propose agent's effect" — the counterpart of the
// github runner's post-skill job step. It is DOMAIN-FREE (architecture invariant `substrate-is-runner-only`):
// it gates on the code:propose CAPABILITY (read from the manifest — never a hardcoded agent name) and on the
// agent's session LIFECYCLE (no live proposer session = it finished — never a parsed tracker/SDLC state), then
// invokes the agent-owned effect (scripts/agent-propose.ts). It does NOT judge "done-ness" by reading ztrack
// ACs — quality is the reviewer's job downstream; this proposes whatever the finished proposer left, exactly as
// the github job proposes whatever its skill step produced. Emitted only for a github code host. Idempotent.
import { execFileSync } from 'node:child_process';
import { readdirSync, existsSync, readFileSync } from 'node:fs';

const sh = (c: string, a: string[], o: Record<string, unknown> = {}): string => {
  try { return execFileSync(c, a, { encoding: 'utf8', ...o }).trim(); } catch { return ''; }
};
const ok = (c: string, a: string[], o: Record<string, unknown> = {}): boolean => {
  try { execFileSync(c, a, { stdio: 'pipe', ...o }); return true; } catch { return false; }
};

const repo = process.env.GITHUB_REPOSITORY || sh('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']);
if (!repo || !existsSync('.worktrees')) process.exit(0);

// The proposer is whichever agent holds the code:propose capability — read from the manifest, NEVER hardcoded.
// (This is the IR's generic capability vocabulary, exactly what the github runner reads to compute permissions.)
let proposer = '';
try {
  const m = Bun.YAML.parse(readFileSync('.open-autonomy/autonomy.yml', 'utf8')) as { agents?: Record<string, { capabilities?: string[] }> };
  proposer = Object.entries(m.agents ?? {}).find(
    ([, a]) => (a.capabilities ?? []).some((c) => String(c).split('@')[0] === 'code:propose'),
  )?.[0] ?? '';
} catch { /* no manifest */ }
if (!proposer) process.exit(0);

// "Done" = the proposer has no LIVE session (lifecycle), not a parsed tracker state. While one is running, the
// work is mid-flight; once it ends, propose what it left. `runner.ts list` is the runner's own session ledger.
let liveProposerSessions = 1;
try { liveProposerSessions = (JSON.parse(sh('bun', ['scripts/runner.ts', 'list', proposer]) || '[]') as unknown[]).length; } catch { /* treat as live → skip */ }
if (liveProposerSessions > 0) process.exit(0);

for (const d of readdirSync('.worktrees')) {
  const m = /^agent-issue-(\d+)$/.exec(d); // the runner's own per-issue isolation dir (its own convention)
  if (!m) continue;
  const num = m[1];
  const wt = `.worktrees/${d}`;
  const branch = `agent/issue-${num}`;
  // already proposed (open OR merged) → never re-propose; a still-open PR is updated by the agent pushing.
  if (sh('gh', ['pr', 'list', '-R', repo, '--head', branch, '--state', 'all', '--json', 'number', '--jq', '.[0].number // empty'])) continue;
  const ahead = sh('git', ['-C', wt, 'rev-list', '--count', `origin/HEAD..${branch}`]) || sh('git', ['-C', wt, 'rev-list', '--count', `origin/main..${branch}`]);
  if (!ahead || ahead === '0') continue; // the agent left no committed work
  process.stdout.write(`sweep: proposing #${num} (proposer '${proposer}' finished its session)\n`);
  const env = {
    ...process.env,
    ISSUE_REF: num,
    AGENT_NAME: proposer,
    AGENT_BOT_NAME: process.env.AGENT_BOT_NAME || 'open-autonomy-agent',
    AGENT_BOT_EMAIL: process.env.AGENT_BOT_EMAIL || 'open-autonomy-agent@users.noreply.github.com',
    REVIEW_WORKFLOW: process.env.PROPOSE_REVIEW_WORKFLOW || '',
    GITHUB_REPOSITORY: repo,
  };
  ok('bun', ['scripts/agent-propose.ts'], { cwd: wt, env, stdio: 'inherit' });
}
