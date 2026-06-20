#!/usr/bin/env bun
// Deterministic reviewer agent (autonomy.ir.v1 behavior). Reviews an agent-authored PR: confirms the
// target is an autonomous branch, waits on required CI, runs the model reviewer (bounded token), then
// applies the deterministic merge gate — auto-merging only a low-risk, CI-green, head-stable PR.
// Self-contained; a faithful port of the former public-agent-review.yml. The work item (the PR number)
// arrives via the declared TARGET_REF trigger param, not implicit event magic.
import { $ } from 'bun';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';

const env = (k: string, d = '') => process.env[k] || d;
const EVENT = env('GITHUB_EVENT_NAME', 'workflow_dispatch');
const TEXT = env('SUBJECT_TEXT');
const ROLE = env('ACTOR_ROLE');
const PR = env('TARGET_REF');
// Substrate-neutral: github sets GITHUB_REPOSITORY; off-github we derive it from gh (universal).
const REPO = env('GITHUB_REPOSITORY') || (await $`gh repo view --json nameWithOwner --jq .nameWithOwner`.nothrow().text()).trim();
const json = <T>(p: string, d: T): T => {
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as T;
  } catch {
    return d;
  }
};

// Self-guard (the former job-level `if:` + actor authorization). A comment must be an authorized
// maintainer's "/agent review"; other triggers (the agent branch's pull_request_target, manual
// dispatch) proceed and are validated by the target check below.
if (EVENT === 'issue_comment') {
  if (!TEXT.startsWith('/agent review')) {
    console.log('reviewer: comment is not /agent review; skipping');
    process.exit(0);
  }
  if (!['OWNER', 'MEMBER', 'COLLABORATOR'].includes(ROLE)) {
    console.error(`Unauthorized review actor association: ${ROLE || 'unknown'}`);
    process.exit(1);
  }
}

mkdirSync('.agent-run', { recursive: true });
const pr = PR;

// Prepare the review target.
await Bun.write(
  '.agent-run/issue.json',
  await $`gh issue view ${pr} --json number,title,body,author --jq '{number,title,body,user:{login:.author.login}}'`.text(),
);
await Bun.write('.agent-run/merge-blockers.json', await $`gh issue view ${pr} --json labels,comments`.text());
await Bun.write('.agent-run/pr-comments.json', await $`gh issue view ${pr} --json comments --jq '.comments'`.text());
// Build the review target from the declared TARGET_REF + the PR metadata (gh) — NOT from the github
// event file ($GITHUB_EVENT_PATH), which is a github-runner artifact absent on other substrates. The
// cross-repo/branch facts come from `gh pr view`; we synthesize the minimal event payload target.ts
// needs (the PR number) so the same code path works on every substrate.
await Bun.write(
  '.agent-run/pr.json',
  await $`gh pr view ${pr} --json number,headRefName,headRepositoryOwner,headRepository,isCrossRepository,baseRefName`.text(),
);
await Bun.write('.agent-run/event.json', JSON.stringify({ pull_request: { number: Number(pr) } }));
await $`bun scripts/public-agent-target.ts --event .agent-run/event.json --pr .agent-run/pr.json --out .agent-run/target.json`.nothrow();
const headSha = (await $`gh pr view ${pr} --json headRefOid --jq .headRefOid`.text()).trim();
const target: Record<string, unknown> = { ...json<Record<string, unknown>>('.agent-run/target.json', {}), head_sha: headSha };
await Bun.write('.agent-run/target.json', JSON.stringify(target, null, 2));

if (target.can_develop !== true) {
  // A pull_request_target fires on every PR; the former job-level `if` only ran this on agent branches.
  // Preserve that: stay silent on a non-agent PR; only an explicit comment/dispatch ask gets a reply.
  if (EVENT === 'pull_request_target') {
    console.log('reviewer: not an autonomous agent branch; skipping');
    process.exit(0);
  }
  const reason = (target.reason as string) || 'This pull request is not an autonomous agent branch.';
  await $`gh issue comment ${pr} --body ${`Agent review requires human review: ${reason}`}`.nothrow();
  process.exit(1);
}

await Bun.write('.agent-run/diff.patch', await $`gh pr diff ${pr}`.text());
await $`bun scripts/public-agent-control-files.ts --out .agent-run/control-files.json`;

// Wait on required CI (up to ~4 min): re-read checks until the gate is decided.
for (let attempt = 1; attempt <= 12; attempt++) {
  const checks = (await $`gh pr checks ${pr} --json name,state,bucket,completedAt`.nothrow().text()) || '[]';
  await Bun.write('.agent-run/checks.json', checks);
  const ci = await $`bun scripts/public-agent-ci.ts --checks .agent-run/checks.json --out .agent-run/ci.json`.nothrow();
  if ((json<unknown[]>('.agent-run/checks.json', [])).length === 0) break; // no checks yet → ci.json written, stop
  if (ci.exitCode === 0) break; // pass
  const d = json<{ decision: string; reason: string }>('.agent-run/ci.json', { decision: 'wait', reason: '' });
  if (d.decision !== 'wait' && !d.reason.includes('missing')) break; // terminal non-pass
  await Bun.sleep(20000);
}
const ci = json<{ decision: string; reason: string }>('.agent-run/ci.json', { decision: 'wait', reason: 'no ci decision' });

// CI not passing: retry develop (within budget) or stop. No review/merge happens.
if (ci.decision !== 'pass') {
  if (ci.decision === 'develop_retry') {
    await $`bun scripts/public-agent-loop-budget.ts --kind ci --reason ${ci.reason} --max-attempts ${env('PUBLIC_AGENT_MAX_CI_RETRIES', '2')} --issue-comments .agent-run/pr-comments.json --pr-comments .agent-run/pr-comments.json --out .agent-run/loop-budget.json`.nothrow();
    const lb = json<{ decision: string; reason: string; comment: string }>('.agent-run/loop-budget.json', { decision: 'stop', reason: '', comment: '' });
    if (lb.decision === 'retry') {
      await Bun.write('/tmp/public-agent-ci-retry.md', `/agent develop\n\n${lb.comment}`);
      await $`gh issue comment ${pr} --body-file /tmp/public-agent-ci-retry.md`.nothrow();
    } else {
      await $`gh issue comment ${pr} --body ${`Agent review blocked: ${lb.reason}. ${ci.reason}`}`.nothrow();
    }
  } else {
    const msg = ci.decision === 'human_required' ? `Agent review requires human review: CI gate is ${ci.decision}. ${ci.reason}` : `Agent review blocked: CI gate is ${ci.decision}. ${ci.reason}`;
    await $`gh issue comment ${pr} --body ${msg}`.nothrow();
  }
  process.exit(0);
}

// CI passing: run the model review (the box's model endpoint is provisioned by the runner's setup step),
// then the merge gate.
let reviewed = false;
try {
  await $`bun scripts/public-agent-review.ts --diff .agent-run/diff.patch --ci .agent-run/ci.json --control-files .agent-run/control-files.json --provider ${env('PUBLIC_AGENT_REVIEW_PROVIDER', 'openai')} --model ${env('PUBLIC_AGENT_REVIEW_MODEL', 'gpt-4o-mini')} --out .agent-run/review.json`;
  reviewed = true;
} catch {
  reviewed = false; // continue-on-error: a failed review still records a verdict below
}

const currentHead = (await $`gh pr view ${pr} --json headRefOid --jq .headRefOid`.text()).trim();
await $`bun scripts/public-agent-merge-gate.ts --target .agent-run/target.json --ci .agent-run/ci.json --review .agent-run/review.json --blockers .agent-run/merge-blockers.json --reviewed-head-sha ${headSha} --current-head-sha ${currentHead} --out .agent-run/merge-gate.json`.nothrow();
const gate = json<{ decision: string; reason: string }>('.agent-run/merge-gate.json', { decision: 'human_required', reason: 'Merge gate did not pass.' });

// Publish the review decision (only when the model review actually ran).
if (reviewed) {
  const review = json<{ verdict?: string; risk?: string; summary?: string }>('.agent-run/review.json', {});
  const body = `Agent review: ${review.verdict ?? 'failed'}\nRisk: ${review.risk ?? 'unknown'}\nMerge gate: ${gate.decision}\n\n${review.summary ?? 'Reviewer did not produce a valid verdict.'}\n\n${gate.reason}`;
  await Bun.write('/tmp/public-agent-review.md', body);
  await $`gh issue comment ${pr} --body-file /tmp/public-agent-review.md`.nothrow();
}

// Retry a safe review failure within budget.
if (gate.decision === 'develop_retry') {
  await $`bun scripts/public-agent-loop-budget.ts --kind review --reason ${gate.reason} --max-attempts ${env('PUBLIC_AGENT_MAX_REVIEW_RETRIES', '2')} --issue-comments .agent-run/pr-comments.json --pr-comments .agent-run/pr-comments.json --out .agent-run/loop-budget.json`.nothrow();
  const lb = json<{ decision: string; reason: string; comment: string }>('.agent-run/loop-budget.json', { decision: 'stop', reason: '', comment: '' });
  if (lb.decision === 'retry') {
    await Bun.write('/tmp/public-agent-review-retry.md', `/agent develop\n\n${lb.comment}`);
    await $`gh issue comment ${pr} --body-file /tmp/public-agent-review-retry.md`.nothrow();
  } else {
    await $`gh issue comment ${pr} --body ${`Agent review blocked: ${lb.reason}. ${gate.reason}`}`.nothrow();
  }
  process.exit(0);
}

// Auto-merge a low-risk, CI-green PR — but only if its head has not moved since review.
if (gate.decision === 'merge') {
  const expected = headSha;
  const now = (await $`gh pr view ${pr} --json headRefOid --jq .headRefOid`.text()).trim();
  if (!expected || now !== expected) {
    await $`gh issue comment ${pr} --body ${`Agent auto-merge skipped: PR head changed after review. Expected ${expected || 'unknown'}; current ${now || 'unknown'}.`}`.nothrow();
    process.exit(1);
  }
  let ready = false;
  for (let attempt = 1; attempt <= 20; attempt++) {
    const mergeable = (await $`gh pr view ${pr} --json mergeable --jq .mergeable`.text()).trim();
    const state = (await $`gh pr view ${pr} --json mergeStateStatus --jq .mergeStateStatus`.text()).trim();
    if (mergeable === 'MERGEABLE' && state !== 'UNKNOWN' && state !== 'DIRTY' && state !== 'BLOCKED') {
      ready = true;
      break;
    }
    if (attempt === 20) {
      await $`gh issue comment ${pr} --body ${`Agent auto-merge skipped: GitHub mergeability did not become ready after waiting. mergeable=${mergeable}; state=${state}.`}`.nothrow();
      process.exit(1);
    }
    await Bun.sleep(3000);
  }
  if (!ready) process.exit(1);
  const headRef = (await $`gh pr view ${pr} --json headRefName --jq .headRefName`.text()).trim();
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await $`gh api --method PUT repos/${REPO}/pulls/${pr}/merge -f merge_method=squash -f sha=${expected} -f commit_title=${`agent: merge PR #${pr}`} -f commit_message=${'Merged by deterministic public-agent merge gate after low-risk reviewer pass and required CI pass.'}`.nothrow();
    if (res.exitCode === 0) {
      await $`gh api --method DELETE repos/${REPO}/git/refs/heads/${headRef}`.nothrow();
      process.exit(0);
    }
    const err = res.stderr.toString();
    if (/(Base branch was modified|Head branch was modified)/.test(err) && attempt !== 5) {
      await Bun.sleep(5000);
      continue;
    }
    console.error(err);
    process.exit(1);
  }
}
