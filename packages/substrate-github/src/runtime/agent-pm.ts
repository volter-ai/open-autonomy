#!/usr/bin/env bun
// Deterministic PM agent (autonomy.ir.v1 behavior). Sweeps open issues, asks the model for a triage
// decision (bounded by a per-issue minted token), records a decision record, then dispatches the next
// action (develop/review) or posts a visible PM comment. Self-contained; a faithful port of the former
// public-agent-pm.yml shell. The PM proposes and routes; it never writes code.
import { $ } from 'bun';
import { mkdirSync, readFileSync } from 'node:fs';
import { launch, list } from './runner.js';

const env = (k: string, d = '') => process.env[k] || d;
const ACTOR = env('GITHUB_ACTOR', 'open-autonomy-pm');
const PM_COMMENT_TOKEN = env('PM_COMMENT_TOKEN', env('GH_TOKEN'));
const LIMIT = env('PUBLIC_AGENT_PM_LIMIT', '20');
const MODEL = env('PUBLIC_AGENT_PM_MODEL', 'gpt-4o-mini');
const PROVIDER = env('PUBLIC_AGENT_PM_PROVIDER', 'openai');

mkdirSync('.agent-run/pm', { recursive: true });

// Repo-level pause: a maintainer label or var halts the whole sweep.
await $`gh label create agent-repo-paused --description "Repo-level autonomous public-agent work is paused" --color FBCA04`.nothrow().quiet();
const pausedCount = (await $`gh issue list --state open --label agent-repo-paused --limit 1 --json number --jq 'length'`.nothrow().text()).trim() || '0';
if (env('PUBLIC_AGENT_REPO_PAUSED') === 'true' || pausedCount !== '0') {
  console.log('public agent repo pause is enabled; PM sweep skipped');
  process.exit(0);
}

// Intake order is newest-created first: a cap (LIMIT) must never starve NEW work. With the old
// `sort:updated-asc`, the sweep spent its whole budget re-examining the OLDEST issues (which it then
// skips as "prior status, no new input") and newly-filed issues sorted to the back fell off the cap —
// so freshly-filed work was never triaged, never labeled, never developed (the silent-intake bug).
const numbers = (
  await $`gh issue list --state open --search "is:issue is:open -label:agent-paused -label:agent-repo-paused -label:agent-blocked -label:human-required -label:agent-maintainer-hold -label:needs-info -label:security sort:created-desc" --limit ${LIMIT} --json number --jq '.[].number'`.text()
)
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean);

// Ensure the triage labels exist.
const labels: Array<[string, string, string]> = [
  ['needs-info', 'Needs more information before autonomous work', 'D4C5F9'],
  ['human-required', 'Requires maintainer attention before autonomous work', 'B60205'],
  ['duplicate', 'Potential duplicate issue', 'CFD3D7'],
  ['spam', 'Likely spam or abuse', '000000'],
  ['agent-blocked', 'Blocks autonomous public-agent development', 'B60205'],
  ['agent-paused', 'Autonomous public-agent work is paused', 'FBCA04'],
  ['agent-maintainer-hold', 'Maintainer hold; autonomous development should not start', '5319E7'],
];
for (const [n, d, c] of labels) await $`gh label create ${n} --description ${d} --color ${c}`.nothrow().quiet();

const decision = (args: string[]) => $`bun scripts/public-agent-decision.ts ${args}`.nothrow();

for (const number of numbers) {
  const decisionDir = `.agent-run/pm/decisions/issue-${number}`;
  const issuePath = `.agent-run/pm/issue-${number}.json`;
  const pmPath = `.agent-run/pm/pm-${number}.json`;
  const dispatchPath = `.agent-run/pm/dispatch-${number}.json`;
  mkdirSync(decisionDir, { recursive: true });

  // Gather the full context the PM model reasons over.
  const branch = `agent/issue-${number}`;
  const openPrRaw = (await $`gh pr list --head ${branch} --state open --json number,title,state,url,headRefName,updatedAt --jq '.[0] // null'`.nothrow().text()).trim();
  let openPr: Record<string, unknown> | null = null;
  try {
    openPr = JSON.parse(openPrRaw || 'null');
  } catch {
    openPr = null;
  }
  let prComments: unknown[] = [];
  if (openPr && typeof openPr.number === 'number') {
    try {
      prComments = JSON.parse((await $`gh pr view ${String(openPr.number)} --json comments --jq '.comments'`.nothrow().text()) || '[]');
    } catch {
      prComments = [];
    }
  }
  let runs: unknown[] = [];
  try {
    // The developer agent's recent runs (agent:list), filtered to this issue — substrate-neutral.
    runs = (await list('developer', 50)).filter((r) => (r.title ?? '').includes(`#${number}`));
  } catch {
    runs = [];
  }
  let previousDecisions: unknown[] = [];
  try {
    const found = (await $`find agent-sessions -path "*/decisions/*.json" -type f`.nothrow().text()).split('\n').filter(Boolean);
    const all = found
      .map((f) => {
        try {
          return JSON.parse(readFileSync(f, 'utf8'));
        } catch {
          return null;
        }
      })
      .filter((d): d is { issue?: number; created_at?: string } => d != null && d.issue === Number(number));
    previousDecisions = all.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 20);
  } catch {
    previousDecisions = [];
  }
  const raw = JSON.parse(
    await $`gh issue view ${number} --json number,title,body,author,labels,comments,createdAt,updatedAt`.text(),
  ) as Record<string, unknown> & { author?: { login?: string } };
  await Bun.write(
    issuePath,
    JSON.stringify({
      number: raw.number,
      title: raw.title,
      body: raw.body,
      user: { login: raw.author?.login },
      labels: raw.labels,
      comments: raw.comments,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      open_agent_pr: openPr ? { ...openPr, comments: prComments } : null,
      agent_runs: runs,
      previous_decisions: previousDecisions,
    }),
  );

  // The model endpoint (OPENAI_API_KEY/OPENAI_BASE_URL) is provisioned into the box by the runner's setup
  // step — the PM just makes the transparent call, it never mints. A budget-exhausted run is paused at
  // provisioning (before this script runs), so there is no per-issue mint failure to handle here.
  await $`bun scripts/public-agent-pm.ts --issue ${issuePath} --provider ${PROVIDER} --model ${MODEL} --out ${pmPath}`;
  const pm = JSON.parse(readFileSync(pmPath, 'utf8')) as { action: string; risk?: string; reason?: string };
  await decision(['--stage', 'pm_triage', '--issue', number, '--actor', ACTOR, '--decision', pm.action, '--risk', pm.risk ?? '', '--reason', pm.reason ?? '', '--subject-json', `{"type":"issue","number":${number}}`, '--evidence', `issue:${number},pm:${pmPath}`, '--next-action', pm.action, '--out-dir', decisionDir]);

  await $`bun scripts/public-agent-dispatcher.ts --issue ${issuePath} --pm ${pmPath} --out ${dispatchPath}`;
  const d = JSON.parse(readFileSync(dispatchPath, 'utf8')) as {
    action: string;
    comment?: string;
    target?: string;
    target_number?: number;
    command?: string;
    reason: string;
  };

  const dispatchArgs = ['--stage', 'dispatch', '--issue', number, '--actor', ACTOR, '--decision', d.action, '--reason', d.reason, '--evidence', `decision:pm_triage,dispatch:${dispatchPath}`, '--next-action', d.command || d.action, '--out-dir', decisionDir];
  if (d.target === 'pull_request' && d.target_number) {
    dispatchArgs.push('--pr', String(d.target_number), '--subject-json', `{"type":"pr","number":${d.target_number}}`);
  } else {
    dispatchArgs.push('--subject-json', `{"type":"issue","number":${number}}`);
  }
  await decision(dispatchArgs);

  if (d.action !== 'comment') {
    console.log(`skip issue #${number}: ${d.reason}`);
    continue;
  }
  if (!d.comment) {
    console.log(`skip issue #${number}: dispatcher selected comment action without comment body`);
    continue;
  }
  const target = String(d.target_number || number);
  const posted = await $`gh issue comment ${target} --body ${d.comment}`.env({ ...process.env, GH_TOKEN: PM_COMMENT_TOKEN }).nothrow();
  if (posted.exitCode !== 0) {
    console.log(`::warning::skip issue #${number}: failed to write visible command comment for target ${target}`);
    continue;
  }
  // Reflect the triage outcome in labels.
  const lbl = {
    develop: () => $`gh issue edit ${number} --remove-label needs-info`.nothrow(),
    review: () => $`gh issue edit ${number} --remove-label needs-info`.nothrow(),
    needs_info: () => $`gh issue edit ${number} --add-label needs-info`.nothrow(),
    human_required: () => $`gh issue edit ${number} --add-label human-required --add-label agent-blocked`.nothrow(),
    duplicate: () => $`gh issue edit ${number} --add-label duplicate`.nothrow(),
    spam: () => $`gh issue edit ${number} --add-label spam --add-label agent-blocked`.nothrow(),
  }[pm.action];
  if (lbl) await lbl();
  // Route the next action through the runner (agent:launch) — substrate-neutral intent, not raw gh.
  if (d.command === '/agent develop') {
    await launch('developer', { issue_number: number });
  } else if (d.command === '/agent review') {
    await launch('reviewer', { issue_number: String(d.target_number) });
  }
}
