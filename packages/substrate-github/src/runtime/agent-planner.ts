#!/usr/bin/env bun
// Deterministic planner agent (autonomy.ir.v1 behavior). Reconciles roadmap.yml against the open
// roadmap-planner issues and, on a scheduled run, creates/updates those issues to match the roadmap.
// Self-contained: reads the world via gh, decides via public-agent-planner.ts, applies via gh. A
// faithful port of the former open-autonomy-planner.yml shell (the apply step ran on schedule or an
// explicit apply dispatch; here a manual dispatch is a dry run unless AGENT_APPLY=true).
import { $ } from 'bun';
import { mkdirSync, readFileSync } from 'node:fs';

const apply = process.env.GITHUB_EVENT_NAME === 'schedule' || process.env.AGENT_APPLY === 'true';
mkdirSync('.agent-run/planner', { recursive: true });

// Read the existing planner-owned roadmap issues.
const issues =
  await $`gh issue list --state open --search "is:issue is:open label:origin:roadmap-planner" --limit 200 --json number,title,body,labels,url,state`.text();
await Bun.write('.agent-run/planner/issues.json', issues);

// Reconcile the roadmap against them.
await $`bun scripts/public-agent-planner.ts --roadmap .open-autonomy/roadmap.yml --issues .agent-run/planner/issues.json --out .agent-run/planner/plan.json`;

if (!apply) {
  console.log('planner: dry run (manual dispatch); plan written, not applied');
  process.exit(0);
}

const plan = JSON.parse(readFileSync('.agent-run/planner/plan.json', 'utf8')) as {
  actions: Array<{ action: string; issue_number?: number; title: string; body: string; labels?: string[] }>;
};

const colorFor = (label: string): string => {
  if (label.startsWith('roadmap:')) return '1D76DB';
  if (label.startsWith('proof:')) return '5319E7';
  if (label.startsWith('origin:')) return '0E8A16';
  return { 'priority:high': 'B60205', 'priority:medium': 'FBCA04', 'priority:low': 'C2E0C6' }[label] ?? 'CFD3D7';
};

// Ensure the base labels, then every label any action references (best-effort, one at a time).
await $`gh label create origin:roadmap-planner --description "Issue created or managed by the Open Autonomy planner" --color 0E8A16`.nothrow().quiet();
for (const l of ['priority:high', 'priority:medium', 'priority:low']) {
  await $`gh label create ${l} --description "Roadmap priority" --color FBCA04`.nothrow().quiet();
}
for (const l of [...new Set(plan.actions.flatMap((a) => a.labels ?? []))]) {
  await $`gh label create ${l} --description "Open Autonomy planner label" --color ${colorFor(l)}`.nothrow().quiet();
}

for (const a of plan.actions) {
  if (a.action !== 'create' && a.action !== 'update') continue;
  let number = a.issue_number;
  if (a.action === 'create') {
    const url = (await $`gh issue create --title ${a.title} --body ${a.body}`.text()).trim();
    number = Number(url.match(/(\d+)$/)?.[1]) || undefined;
  } else if (number != null) {
    await $`gh issue edit ${String(number)} --title ${a.title} --body ${a.body}`.nothrow();
  }
  // A single bad label (e.g. one that exceeds GitHub's 50-char limit) must never block the issue.
  if (number != null) {
    for (const lbl of a.labels ?? []) if (lbl) await $`gh issue edit ${String(number)} --add-label ${lbl}`.nothrow();
  }
}
console.log(`planner: applied ${plan.actions.length} action(s)`);
