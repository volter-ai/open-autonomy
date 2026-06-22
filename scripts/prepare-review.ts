#!/usr/bin/env bun
// Privileged READ phase for the reviewer skill agent (config.prepare). Gathers the skill's inputs — the PR
// diff + control files (constitution/standards/rubric) + a best-effort CI snapshot — into .agent-run/, then
// the skill reviews them and emits a ReviewerVerdict. Pure read: no comments, no merge (the interpreter
// does every privileged write). Skips (writes no diff, so the skill no-ops) when the trigger is an
// unauthorized comment or the PR is not an autonomous agent branch — the same preconditions the former
// deterministic reviewer enforced before spending any model budget.
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

mkdirSync('.agent-run', { recursive: true });

// Authorization: a comment must be an authorized maintainer's "/agent review"; the agent branch's
// pull_request_target and a manual dispatch proceed and are validated by the target check below.
if (EVENT === 'issue_comment') {
  if (!TEXT.startsWith('/agent review')) {
    console.log('prepare-review: comment is not /agent review; skipping');
    process.exit(0);
  }
  if (!['OWNER', 'MEMBER', 'COLLABORATOR'].includes(ROLE)) {
    console.log(`prepare-review: unauthorized review actor association: ${ROLE || 'unknown'}; skipping`);
    process.exit(0);
  }
}
if (!PR) {
  console.log('prepare-review: no TARGET_REF forwarded by the trigger; skipping');
  process.exit(0);
}

// Validate the target is an autonomous agent branch (read-only) — synthesize the minimal event payload
// target.ts needs from the PR number so the same path works on any substrate. Skip the review otherwise.
await Bun.write(
  '.agent-run/pr.json',
  await $`gh pr view ${PR} --json number,headRefName,headRepositoryOwner,headRepository,isCrossRepository,baseRefName`.text(),
);
await Bun.write('.agent-run/event.json', JSON.stringify({ pull_request: { number: Number(PR) } }));
await $`bun scripts/public-agent-target.ts --event .agent-run/event.json --pr .agent-run/pr.json --out .agent-run/target.json`.nothrow();
const target = json<Record<string, unknown>>('.agent-run/target.json', {});
if (target.can_develop !== true) {
  console.log(`prepare-review: not an autonomous agent branch; skipping (${(target.reason as string) ?? 'no reason'})`);
  process.exit(0);
}

// Gather the skill's inputs.
await Bun.write(
  '.agent-run/issue.json',
  await $`gh issue view ${PR} --json number,title,body,author --jq '{number,title,body,user:{login:.author.login}}'`.text(),
);
await Bun.write('.agent-run/diff.patch', await $`gh pr diff ${PR}`.text());
await $`bun scripts/public-agent-control-files.ts --out .agent-run/control-files.json`.nothrow();
// Best-effort CI snapshot for the reviewer's context only (the interpreter re-runs the authoritative,
// statuses-visible CI gate before merging). Degrades silently if this job cannot see the commit status.
const checks = (await $`gh pr checks ${PR} --json name,state,bucket,completedAt`.nothrow().text()) || '[]';
await Bun.write('.agent-run/checks.json', checks);
await $`bun scripts/public-agent-ci.ts --checks .agent-run/checks.json --out .agent-run/ci.json`.nothrow();
console.log(`prepare-review: gathered inputs for PR #${PR}`);
