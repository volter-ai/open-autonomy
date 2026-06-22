#!/usr/bin/env bun
// Privileged INTERPRETER for the strategy-reviewer skill agent (config.interpreter). Acts on the skill's
// typed StrategyVerdict (the bundle's result.json). The JUDGMENT (is this proposal meritorious?) came from
// the skill; this is the privileged half: re-establish the proposal, run the DETERMINISTIC governance guard
// (a strategist PR may only add roadmap items — anything touching governance is hard-blocked regardless of
// the verdict), then on a clean pass promote proposed→planned, run the repo check, post the ci status, and
// squash-merge. A maintainer "/agent ratify" overrides the model verdict (human-in-the-loop) but NOT the
// guard. Faithful port of the merge half of the former deterministic strategy reviewer.
import { $ } from 'bun';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import type { StrategyVerdict } from './public-agent-strategy-review.js';

const env = (k: string, d = '') => process.env[k] || d;
const EVENT = env('GITHUB_EVENT_NAME', 'workflow_dispatch');
const TEXT = env('SUBJECT_TEXT');
const ROLE = env('ACTOR_ROLE');
const PR = env('TARGET_REF');
const ACTOR = env('GITHUB_ACTOR', 'open-autonomy-strategy-reviewer');
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
  console.log('interpret-strategy-review: no TARGET_REF; nothing to do');
  process.exit(0);
}

// Mode + authorization (re-checked here — the privileged side never trusts that prepare gated correctly).
let mode: 'review' | 'ratify' = 'review';
if (EVENT !== 'workflow_dispatch') {
  if (TEXT.startsWith('/agent ratify')) {
    if (!['OWNER', 'MEMBER', 'COLLABORATOR'].includes(ROLE)) {
      console.log('interpret-strategy-review: unauthorized /agent ratify; nothing to do');
      process.exit(0);
    }
    mode = 'ratify';
  } else if (TEXT.startsWith('/agent strategy-review')) {
    mode = 'review';
  } else {
    console.log('interpret-strategy-review: not a strategy command; nothing to do');
    process.exit(0);
  }
}

const D = '.agent-run/strategy-review';
mkdirSync(D, { recursive: true });

await Bun.write(`${D}/pr.json`, await $`gh pr view ${PR} --json number,headRefName,headRefOid,labels,body`.text());
const prMeta = json<{ headRefName: string; labels: Array<{ name: string }>; body: string }>(`${D}/pr.json`, { headRefName: '', labels: [], body: '' });
if (!prMeta.labels.some((l) => l.name === 'origin:strategist')) {
  console.log(`interpret-strategy-review: PR #${PR} is not a strategist proposal; nothing to do`);
  process.exit(0);
}
const branch = prMeta.headRefName;

// Deterministic governance guard — a strategist PR may only add roadmap items. Hard-block on violation,
// overriding any verdict (and any ratify).
await Bun.write(`${D}/changed.txt`, await $`gh pr diff ${PR} --name-only`.text());
const guard = await $`bun scripts/public-agent-strategy-ratify.ts --roadmap .open-autonomy/roadmap.yml --changed-files ${D}/changed.txt`.nothrow();
if (guard.exitCode !== 0) {
  await $`gh pr edit ${PR} --add-label human-required`.nothrow();
  await $`gh pr comment ${PR} --body ${'Strategy review blocked: a strategist proposal may only add roadmap items, not edit governance files. Human review required.'}`.nothrow();
  process.exit(0);
}

// Verdict: the skill's typed result (review) or the maintainer's override (ratify).
let verdict = 'pass';
let humanRequired = 'false';
let summary = `Ratified by maintainer ${ACTOR} (human-in-the-loop).`;
let decisionActor = 'human-operator';
if (mode === 'review') {
  const resultPath = (await $`find ${bundle} -name result.json`.nothrow().text()).trim().split('\n').filter(Boolean)[0];
  const v = resultPath && existsSync(resultPath)
    ? json<StrategyVerdict>(resultPath, { verdict: 'fail', human_required: true, summary: 'no verdict', findings: [] })
    : { verdict: 'fail' as const, human_required: true, summary: 'strategy reviewer produced no verdict', findings: [] };
  verdict = v.verdict;
  humanRequired = String(v.human_required);
  summary = v.summary;
  decisionActor = 'open-autonomy-strategy-reviewer';
}

// Record the decision, comment, and (on a clean pass) promote → check → merge.
const next = verdict === 'pass' && humanRequired !== 'true' ? 'merge' : 'human_required';
await $`bun scripts/public-agent-decision.ts --stage strategy_review --issue 0 --pr ${PR} --actor ${decisionActor} --decision ${verdict} --reason ${summary} --next-action ${next} --out-dir ${D}/decisions`.nothrow();
await $`gh pr comment ${PR} --body ${`Strategy review (${decisionActor}): **${verdict}** (human_required: ${humanRequired}). ${summary}`}`.nothrow();

if (verdict !== 'pass' || humanRequired === 'true') {
  await $`gh pr edit ${PR} --add-label human-required`.nothrow();
  process.exit(0);
}

await $`gh pr edit ${PR} --remove-label human-required`.nothrow();
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
  const merged = await $`gh pr merge ${PR} --squash --delete-branch --subject ${`strategy: ratify roadmap proposal #${PR}`}`.nothrow();
  if (merged.exitCode !== 0) await $`gh pr comment ${PR} --body ${'Strategy review passed and CI is green, but auto-merge could not complete; human merge required.'}`.nothrow();
} else {
  await $`gh pr edit ${PR} --add-label human-required`.nothrow();
  await $`gh pr comment ${PR} --body ${'Strategy review passed but the repository check failed on the proposal branch; human review required.'}`.nothrow();
}
