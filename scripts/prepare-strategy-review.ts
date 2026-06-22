#!/usr/bin/env bun
// Privileged READ phase for the strategy-reviewer skill agent (config.prepare). Gathers the skill's
// inputs — the roadmap diff + the proposal rationale — into .agent-run/strategy-review/. The skill then
// judges the proposal against the constitution + strategy rubric (both read straight from the checkout)
// and emits a StrategyVerdict. Pure read: the governance guard, promotion, and merge are the interpreter's
// privileged job. Skips (writes no diff, so the skill no-ops) when the trigger is not a strategy command,
// an unauthorized /agent ratify, or a PR that is not a strategist proposal.
import { $ } from 'bun';
import { mkdirSync, readFileSync } from 'node:fs';

const env = (k: string, d = '') => process.env[k] || d;
const EVENT = env('GITHUB_EVENT_NAME', 'workflow_dispatch');
const TEXT = env('SUBJECT_TEXT');
const ROLE = env('ACTOR_ROLE');
const PR = env('TARGET_REF');
const json = <T>(p: string, d: T): T => {
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as T;
  } catch {
    return d;
  }
};

// Authorization + command gate (mirrors the interpreter, which re-checks before any privileged action).
if (EVENT !== 'workflow_dispatch') {
  if (TEXT.startsWith('/agent ratify')) {
    if (!['OWNER', 'MEMBER', 'COLLABORATOR'].includes(ROLE)) {
      console.log('prepare-strategy-review: unauthorized /agent ratify; skipping');
      process.exit(0);
    }
  } else if (!TEXT.startsWith('/agent strategy-review')) {
    console.log('prepare-strategy-review: comment is not /agent strategy-review or /agent ratify; skipping');
    process.exit(0);
  }
}
if (!PR) {
  console.log('prepare-strategy-review: no TARGET_REF forwarded by the trigger; skipping');
  process.exit(0);
}

const D = '.agent-run/strategy-review';
mkdirSync(D, { recursive: true });

// Strategy review only applies to strategist-authored proposals.
await Bun.write(`${D}/pr.json`, await $`gh pr view ${PR} --json number,headRefName,headRefOid,labels,body`.text());
const prMeta = json<{ labels: Array<{ name: string }>; body: string }>(`${D}/pr.json`, { labels: [], body: '' });
if (!prMeta.labels.some((l) => l.name === 'origin:strategist')) {
  console.log(`prepare-strategy-review: PR #${PR} is not a strategist proposal; skipping`);
  process.exit(0);
}

// Gather the skill's inputs (the rubric + constitution are read by the skill straight from the checkout).
await Bun.write(`${D}/roadmap.diff`, await $`gh pr diff ${PR}`.text());
await Bun.write(`${D}/proposal.txt`, prMeta.body ?? '');
await Bun.write('.agent-run/issue.json', JSON.stringify({ number: Number(PR), title: 'Strategy review', body: prMeta.body ?? '' }));
console.log(`prepare-strategy-review: gathered inputs for PR #${PR}`);
