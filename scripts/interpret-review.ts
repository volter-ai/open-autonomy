#!/usr/bin/env bun
// Privileged INTERPRETER for the reviewer skill agent (config.interpreter). Acts on the skill's typed
// verdict (ReviewerVerdict — the bundle's result.json). The JUDGMENT (is this change good?) came from the
// skill; this is the privileged half: re-establish fresh facts (target, blockers, native reviews, CI, head
// SHA), run the DETERMINISTIC merge gate on that verdict, post the verdict, and — only for a low-risk,
// CI-green, head-stable, unblocked agent PR — squash-merge and delete the branch. The merge gate is the
// privileged step's own precondition (capability + correctness), NOT an agent guard. Faithful port of the
// merge half of the former deterministic reviewer; the verdict is read instead of computed here.
import { $ } from 'bun';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { decideMerge } from './public-agent-merge-gate.js';
import type { ReviewerVerdict } from './public-agent-review.js';
import type { CiDecision } from './public-agent-ci.js';
import type { AgentTarget } from './public-agent-target.js';

const env = (k: string, d = '') => process.env[k] || d;
const EVENT = env('GITHUB_EVENT_NAME', 'workflow_dispatch');
const PR = env('TARGET_REF');
const REPO = env('GITHUB_REPOSITORY') || (await $`gh repo view --json nameWithOwner --jq .nameWithOwner`.nothrow().text()).trim();
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const bundle = arg('--bundle') ?? '.agent-run/bundle';
const json = <T>(p: string, d: T): T => {
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as T;
  } catch {
    return d;
  }
};

if (!PR) {
  console.log('interpret-review: no TARGET_REF; nothing to do');
  process.exit(0);
}
mkdirSync('.agent-run', { recursive: true });

// The skill's typed verdict. Absent ⇒ the skill skipped (prepare short-circuited on an unauthorized
// trigger or a non-agent PR) or did not emit — there is nothing to act on.
const resultPath = (await $`find ${bundle} -name result.json`.nothrow().text())
  .trim()
  .split('\n')
  .filter(Boolean)[0];
if (!resultPath || !existsSync(resultPath)) {
  console.log('interpret-review: no verdict (result.json) in bundle; nothing to do');
  process.exit(0);
}
const review = json<ReviewerVerdict>(resultPath, {
  verdict: 'fail',
  risk: 'high',
  human_required: true,
  summary: 'reviewer produced no valid verdict',
  findings: [],
});

// Re-establish fresh facts — the publisher job is a clean runner that did not see prepare's outputs.
const blockers = JSON.parse(await $`gh issue view ${PR} --json labels,comments`.text()) as Record<string, unknown>;
const reviewsJson = REPO
  ? await $`gh api repos/${REPO}/pulls/${PR}/reviews --jq '[.[] | {state, author:{login:.user.login}, submittedAt:.submitted_at, commitId:.commit_id}]'`.nothrow().text()
  : '';
try { blockers.reviews = JSON.parse(reviewsJson); } catch { blockers.reviews = []; }
await Bun.write('.agent-run/merge-blockers.json', JSON.stringify(blockers));
await Bun.write('.agent-run/pr-comments.json', await $`gh issue view ${PR} --json comments --jq '.comments'`.text());

await Bun.write(
  '.agent-run/pr.json',
  await $`gh pr view ${PR} --json number,headRefName,headRepositoryOwner,headRepository,isCrossRepository,baseRefName`.text(),
);
await Bun.write('.agent-run/event.json', JSON.stringify({ pull_request: { number: Number(PR) } }));
await $`bun scripts/public-agent-target.ts --event .agent-run/event.json --pr .agent-run/pr.json --out .agent-run/target.json`.nothrow();
const headSha = (await $`gh pr view ${PR} --json headRefOid --jq .headRefOid`.text()).trim();
const target = { ...json<Record<string, unknown>>('.agent-run/target.json', {}), head_sha: headSha } as AgentTarget;

if (target.can_develop !== true) {
  if (EVENT === 'pull_request_target') {
    console.log('interpret-review: not an autonomous agent branch; skipping');
    process.exit(0);
  }
  const reason = ((target as { reason?: string }).reason) || 'This pull request is not an autonomous agent branch.';
  await $`gh issue comment ${PR} --body ${`Agent review requires human review: ${reason}`}`.nothrow();
  process.exit(0);
}

// Authoritative CI gate (wait up to ~4 min): this job has statuses:read, so it sees the bot PR's `ci`
// commit status that prepare's snapshot may have missed.
for (let attempt = 1; attempt <= 12; attempt++) {
  const checks = (await $`gh pr checks ${PR} --json name,state,bucket,completedAt`.nothrow().text()) || '[]';
  await Bun.write('.agent-run/checks.json', checks);
  const r = await $`bun scripts/public-agent-ci.ts --checks .agent-run/checks.json --out .agent-run/ci.json`.nothrow();
  if (json<unknown[]>('.agent-run/checks.json', []).length === 0) break;
  if (r.exitCode === 0) break;
  const d = json<{ decision: string; reason: string }>('.agent-run/ci.json', { decision: 'wait', reason: '' });
  if (d.decision !== 'wait' && !d.reason.includes('missing')) break;
  await Bun.sleep(20000);
}
const ci = json<CiDecision>('.agent-run/ci.json', { decision: 'wait', reason: 'no ci decision' } as CiDecision);

// CI not passing: retry develop (within budget) or stop. No merge happens.
if (ci.decision !== 'pass') {
  if (ci.decision === 'develop_retry') {
    await $`bun scripts/public-agent-loop-budget.ts --kind ci --reason ${ci.reason} --max-attempts ${env('PUBLIC_AGENT_MAX_CI_RETRIES', '2')} --issue-comments .agent-run/pr-comments.json --pr-comments .agent-run/pr-comments.json --out .agent-run/loop-budget.json`.nothrow();
    const lb = json<{ decision: string; reason: string; comment: string }>('.agent-run/loop-budget.json', { decision: 'stop', reason: '', comment: '' });
    if (lb.decision === 'retry') {
      await Bun.write('/tmp/interpret-ci-retry.md', `/agent develop\n\n${lb.comment}`);
      await $`gh issue comment ${PR} --body-file /tmp/interpret-ci-retry.md`.nothrow();
    } else {
      await $`gh issue comment ${PR} --body ${`Agent review blocked: ${lb.reason}. ${ci.reason}`}`.nothrow();
    }
  } else {
    const msg = ci.decision === 'human_required' ? `Agent review requires human review: CI gate is ${ci.decision}. ${ci.reason}` : `Agent review blocked: CI gate is ${ci.decision}. ${ci.reason}`;
    await $`gh issue comment ${PR} --body ${msg}`.nothrow();
  }
  process.exit(0);
}

// CI passing: run the deterministic merge gate on the skill's verdict.
const currentHead = (await $`gh pr view ${PR} --json headRefOid --jq .headRefOid`.text()).trim();
const gate = decideMerge(target, ci, review, {
  reviewedHeadSha: headSha,
  currentHeadSha: currentHead,
  blockers: json('.agent-run/merge-blockers.json', {}),
});

// Publish the verdict.
const body = `Agent review: ${review.verdict}\nRisk: ${review.risk}\nMerge gate: ${gate.decision}\n\n${review.summary}\n\n${gate.reason}`;
await Bun.write('/tmp/interpret-review.md', body);
await $`gh issue comment ${PR} --body-file /tmp/interpret-review.md`.nothrow();

// Retry a safe review failure within budget.
if (gate.decision === 'develop_retry') {
  await $`bun scripts/public-agent-loop-budget.ts --kind review --reason ${gate.reason} --max-attempts ${env('PUBLIC_AGENT_MAX_REVIEW_RETRIES', '2')} --issue-comments .agent-run/pr-comments.json --pr-comments .agent-run/pr-comments.json --out .agent-run/loop-budget.json`.nothrow();
  const lb = json<{ decision: string; reason: string; comment: string }>('.agent-run/loop-budget.json', { decision: 'stop', reason: '', comment: '' });
  if (lb.decision === 'retry') {
    await Bun.write('/tmp/interpret-review-retry.md', `/agent develop\n\n${lb.comment}`);
    await $`gh issue comment ${PR} --body-file /tmp/interpret-review-retry.md`.nothrow();
  } else {
    await $`gh issue comment ${PR} --body ${`Agent review blocked: ${lb.reason}. ${gate.reason}`}`.nothrow();
  }
  process.exit(0);
}

// Auto-merge a low-risk, CI-green PR — but only if its head has not moved since review.
if (gate.decision === 'merge') {
  const expected = headSha;
  const now = (await $`gh pr view ${PR} --json headRefOid --jq .headRefOid`.text()).trim();
  if (!expected || now !== expected) {
    await $`gh issue comment ${PR} --body ${`Agent auto-merge skipped: PR head changed after review. Expected ${expected || 'unknown'}; current ${now || 'unknown'}.`}`.nothrow();
    process.exit(1);
  }
  let ready = false;
  for (let attempt = 1; attempt <= 20; attempt++) {
    const mergeable = (await $`gh pr view ${PR} --json mergeable --jq .mergeable`.text()).trim();
    const state = (await $`gh pr view ${PR} --json mergeStateStatus --jq .mergeStateStatus`.text()).trim();
    if (mergeable === 'MERGEABLE' && state !== 'UNKNOWN' && state !== 'DIRTY' && state !== 'BLOCKED') {
      ready = true;
      break;
    }
    if (attempt === 20) {
      await $`gh issue comment ${PR} --body ${`Agent auto-merge skipped: GitHub mergeability did not become ready after waiting. mergeable=${mergeable}; state=${state}.`}`.nothrow();
      process.exit(1);
    }
    await Bun.sleep(3000);
  }
  if (!ready) process.exit(1);
  const headRef = (await $`gh pr view ${PR} --json headRefName --jq .headRefName`.text()).trim();
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await $`gh api --method PUT repos/${REPO}/pulls/${PR}/merge -f merge_method=squash -f sha=${expected} -f commit_title=${`agent: merge PR #${PR}`} -f commit_message=${'Merged by deterministic public-agent merge gate after low-risk reviewer pass and required CI pass.'}`.nothrow();
    if (res.exitCode === 0) {
      await $`gh api --method DELETE repos/${REPO}/git/refs/heads/${headRef}`.nothrow();
      process.exit(0);
    }
    const errText = res.stderr.toString();
    if (/(Base branch was modified|Head branch was modified)/.test(errText) && attempt !== 5) {
      await Bun.sleep(5000);
      continue;
    }
    console.error(errText);
    process.exit(1);
  }
}
