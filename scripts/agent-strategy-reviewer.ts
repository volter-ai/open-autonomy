#!/usr/bin/env bun
// Deterministic strategy-reviewer agent (autonomy.ir.v1 behavior). Ratifies a strategist roadmap
// proposal against the merit rubric, behind a deterministic governance guard (a strategist PR may only
// ADD roadmap items — anything touching the constitution, rubric, proof gates, workflows or skills is
// hard-blocked). A maintainer "/agent ratify" is human-in-the-loop approval that overrides the model
// verdict but NOT the guard. Self-contained; a faithful port of public-agent-strategy-review.yml.
import { $ } from 'bun';
import { mkdirSync, readFileSync } from 'node:fs';

const env = (k: string, d = '') => process.env[k] || d;
const EVENT = env('GITHUB_EVENT_NAME', 'workflow_dispatch');
const TEXT = env('SUBJECT_TEXT');
const ROLE = env('ACTOR_ROLE');
const PR = env('TARGET_REF');
const ACTOR = env('GITHUB_ACTOR', 'open-autonomy-strategy-reviewer');
const REPO = env('GITHUB_REPOSITORY');
const model = env('PUBLIC_AGENT_STRATEGY_REVIEW_MODEL', env('PUBLIC_AGENT_REVIEW_MODEL', env('PUBLIC_AGENT_PM_MODEL', 'gpt-4o-mini')));
const json = <T>(p: string, d: T): T => {
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as T;
  } catch {
    return d;
  }
};

// Self-guard + mode (the former job `if:` + Determine-mode step). Dispatch is a model review. A comment
// must be "/agent strategy-review" (model review) or a maintainer's "/agent ratify" (human approval).
let mode: 'review' | 'ratify' = 'review';
if (EVENT !== 'workflow_dispatch') {
  if (TEXT.startsWith('/agent ratify')) {
    if (!['OWNER', 'MEMBER', 'COLLABORATOR'].includes(ROLE)) {
      console.error('only a maintainer (OWNER/MEMBER/COLLABORATOR) may /agent ratify');
      process.exit(1);
    }
    mode = 'ratify';
  } else if (TEXT.startsWith('/agent strategy-review')) {
    mode = 'review';
  } else {
    console.log('strategy-reviewer: comment is not /agent strategy-review or /agent ratify; skipping');
    process.exit(0);
  }
}

const pr = PR;
const D = '.agent-run/strategy-review';
mkdirSync(D, { recursive: true });

// Load the PR; strategy review only applies to strategist-authored proposals.
await Bun.write(`${D}/pr.json`, await $`gh pr view ${pr} --json number,headRefName,headRefOid,labels,body`.text());
const prMeta = json<{ headRefName: string; headRefOid: string; labels: Array<{ name: string }>; body: string }>(`${D}/pr.json`, { headRefName: '', headRefOid: '', labels: [], body: '' });
if (!prMeta.labels.some((l) => l.name === 'origin:strategist')) {
  console.log(`PR #${pr} is not a strategist proposal; skipping.`);
  process.exit(0);
}
await Bun.write(`${D}/changed.txt`, await $`gh pr diff ${pr} --name-only`.text());
await Bun.write(`${D}/roadmap.diff`, await $`gh pr diff ${pr}`.text());
await Bun.write(`${D}/proposal.txt`, prMeta.body ?? '');
const branch = prMeta.headRefName;

// Deterministic governance guard — a strategist PR may only add roadmap items.
const guard = await $`bun scripts/public-agent-strategy-ratify.ts --roadmap .open-autonomy/roadmap.yml --changed-files ${D}/changed.txt`.nothrow();
if (guard.exitCode !== 0) {
  await $`gh pr edit ${pr} --add-label human-required`.nothrow();
  await $`gh pr comment ${pr} --body ${'Strategy review blocked: a strategist proposal may only add roadmap items, not edit governance files. Human review required.'}`.nothrow();
  process.exit(1);
}

// Model review (skipped for a human ratify).
let verdict = 'pass';
let humanRequired = 'false';
let summary = `Ratified by maintainer ${ACTOR} (human-in-the-loop).`;
let decisionActor = 'human-operator';
if (mode === 'review') {
  await Bun.write(`${D}/issue.json`, JSON.stringify({ number: Number(pr), title: 'Strategy review', body: '', user: { login: ACTOR } }));
  const mint = await $`bun scripts/model-proxy-mint.ts --issue ${D}/issue.json --models ${model} --max-usd-cents ${env('PUBLIC_AGENT_STRATEGY_REVIEW_MAX_USD_CENTS', '50')} --max-requests 2 --purpose review`.nothrow().text();
  const runId = mint.match(/^run_id=(.*)$/m)?.[1] ?? '';
  const token = mint.match(/^token=(.*)$/m)?.[1] ?? '';
  await $`bun scripts/public-agent-strategy-review.ts --diff ${D}/roadmap.diff --proposal ${D}/proposal.txt --rubric .open-autonomy/strategy-rubric.yml --constitution docs/CONSTITUTION.md --provider ${env('PUBLIC_AGENT_STRATEGY_REVIEW_PROVIDER', 'openai')} --model ${model} --out ${D}/verdict.json`
    .env({ ...process.env, MODEL_PROXY_TOKEN: token })
    .nothrow();
  if (runId) await $`bun scripts/model-proxy-revoke.ts --run-id ${runId}`.nothrow();
  const v = json<{ verdict: string; human_required: boolean | string; summary: string }>(`${D}/verdict.json`, { verdict: 'failed', human_required: true, summary: 'Reviewer did not produce a verdict.' });
  verdict = v.verdict;
  humanRequired = String(v.human_required);
  summary = v.summary;
  decisionActor = 'open-autonomy-strategy-reviewer';
}

// Record the decision, comment, and (on a clean pass) promote → check → merge.
const next = verdict === 'pass' && humanRequired !== 'true' ? 'merge' : 'human_required';
await $`bun scripts/public-agent-decision.ts --stage strategy_review --issue 0 --pr ${pr} --actor ${decisionActor} --decision ${verdict} --reason ${summary} --next-action ${next} --out-dir ${D}/decisions`.nothrow();
await $`gh pr comment ${pr} --body ${`Strategy review (${decisionActor}): **${verdict}** (human_required: ${humanRequired}). ${summary}`}`.nothrow();

if (verdict !== 'pass' || humanRequired === 'true') {
  await $`gh pr edit ${pr} --add-label human-required`.nothrow();
  process.exit(0);
}

await $`gh pr edit ${pr} --remove-label human-required`.nothrow();
await $`git config user.name "open-autonomy-strategy-reviewer"`;
await $`git config user.email "open-autonomy-strategy-reviewer@users.noreply.github.com"`;
await $`git fetch origin ${branch}`;
await $`git checkout ${branch}`;
await $`bun scripts/public-agent-strategy-ratify.ts --roadmap .open-autonomy/roadmap.yml --promote`;
if ((await $`git diff --quiet -- .open-autonomy/roadmap.yml`.nothrow()).exitCode !== 0) {
  await $`git add .open-autonomy/roadmap.yml`;
  await $`git commit -m "strategy-review: ratify and promote proposed items to planned"`;
  await $`git push origin ${branch}`;
}
// The strategist PR was opened with GITHUB_TOKEN, so ci.yml never fired and the required "ci" status
// never reported. Run the check here and post the status to the head, as the develop flow does.
const headSha = (await $`git rev-parse HEAD`.text()).trim();
const ciState = (await $`bun run check`.nothrow()).exitCode === 0 ? 'success' : 'failure';
await $`gh api -X POST repos/${REPO}/statuses/${headSha} -f state=${ciState} -f context=ci -f description=${'strategy roadmap PR check'}`.nothrow();
if (ciState === 'success') {
  const merged = await $`gh pr merge ${pr} --squash --delete-branch --subject ${`strategy: ratify roadmap proposal #${pr}`}`.nothrow();
  if (merged.exitCode !== 0) await $`gh pr comment ${pr} --body ${'Strategy review passed and CI is green, but auto-merge could not complete; human merge required.'}`.nothrow();
} else {
  await $`gh pr edit ${pr} --add-label human-required`.nothrow();
  await $`gh pr comment ${pr} --body ${'Strategy review passed but the repository check failed on the proposal branch; human review required.'}`.nothrow();
}
