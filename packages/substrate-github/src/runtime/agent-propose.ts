#!/usr/bin/env bun
// The github-code-host PROPOSE effect — what a `code:propose` agent DOES after its skill runs: turn the
// working tree into an auto-merging PR. This is agent methodology, deterministic (mechanical wiring a model
// must not skip), and runner-INDEPENDENT: it uses git + gh, which behave identically whether the agent was
// launched by GitHub Actions or by a local termfleet window. The RUNNER only provides the credential + env;
// this script (agent-owned) performs the propose. It used to be inline shell in substrate-github's emitted
// workflow — that conflated agent methodology into the runner (docs/CODE_HOST_RESOURCES.md, the runner=launch
// principle). Now the runner just invokes it.
//
// Env (the runner supplies these; GITHUB_* are ambient on Actions, set explicitly by the local runner):
//   ISSUE_REF        work-item ref the trigger forwarded (empty for an autonomous/cron proposer)
//   AGENT_NAME       the agent's name (for the run-history folder + commit/PR title)
//   AGENT_BOT_NAME   / AGENT_BOT_EMAIL   git author identity for the agent-proposed commit
//   REVIEW_WORKFLOW  the reviewer's workflow to dispatch on github (empty if no review edge / non-github runner)
//   REVIEW_AGENT     the reviewer AGENT to launch via the runner seam (a local runner's review-edge realization)
//   AUTONOMY_TRUSTED_RUNNER absolute runner.ts from the accepted local control generation
//   GH_TOKEN, GITHUB_RUN_ID  (the repo is resolved from the remote via gh's {owner}/{repo} placeholders)
import { execFileSync } from 'node:child_process';

const sh = (cmd: string, args: string[], opts: { allowFail?: boolean } = {}): string => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8' }).trim();
  } catch (e) {
    if (opts.allowFail) return '';
    throw e;
  }
};
const ok = (cmd: string, args: string[]): boolean => {
  try {
    execFileSync(cmd, args, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
};
const sleep = (s: number) => { try { execFileSync('sleep', [String(s)]); } catch { /* pacing */ } };
// Dispatch a code-host workflow with retry — a bot-opened PR fires no pull_request event (GITHUB_TOKEN
// anti-recursion), so ci/agent-review/merge are kicked here; a swallowed dispatch leaves a required check
// unposted and the PR permanently unmergeable, so retry until it lands.
const dispatch = (label: string, args: string[]): void => {
  for (let i = 0; i < 6; i++) { if (ok('gh', ['workflow', 'run', ...args])) return; sleep(4); }
  process.stdout.write(`${label} dispatch failed after retries (non-fatal)\n`);
};

// Resolve the PR's base branch — the repo's default branch, whatever it's actually called (main, master,
// dev, trunk, …). A real adopter hit this: a transient `gh api` hiccup during a propose run fell straight
// through to the hardcoded 'main' literal on a repo whose default branch is `dev` (no `main` branch exists
// there AT ALL) — so `gh pr create --base main` failed opaquely ("No commits between main and
// agent/issue-LOCAL-1") and the propose effect ran silently to a dead end: no PR opened, no clear diagnosis.
// Fixed priority chain, each stage only reached if the one before it is exhausted:
//   1. `gh api repos/{owner}/{repo} --jq .default_branch` — the authoritative source — retried 3x (same
//      bounded-retry/sleep idiom as `dispatch()` above), because ONE network hiccup shouldn't be treated the
//      same as "this call can never work".
//   2. The LOCAL git remote's own record of the default branch (`git symbolic-ref refs/remotes/origin/HEAD`),
//      the standard git mechanism for this — populated by a fresh clone or `git remote set-head origin -a`.
//      This is exactly right for any repo with ANY trunk name, and needs no network call at all.
//   3. The hardcoded 'main' literal — now the LAST resort, not the first.
export interface ResolveBaseBranchDeps {
  ghApiDefaultBranch: () => string; // '' on failure
  gitSymbolicRefOriginHead: () => string; // '' on failure/unset
  sleep: (s: number) => void;
  attempts?: number; // retries for stage 1; defaults to 3
}

const realDeps: ResolveBaseBranchDeps = {
  ghApiDefaultBranch: () => sh('gh', ['api', 'repos/{owner}/{repo}', '--jq', '.default_branch'], { allowFail: true }),
  gitSymbolicRefOriginHead: () => {
    // Typical value: "refs/remotes/origin/main" — the branch name is everything after the last slash.
    const ref = sh('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], { allowFail: true });
    return ref ? ref.replace(/^refs\/remotes\/origin\//, '') : '';
  },
  sleep,
};

export function resolveBaseBranch(deps: ResolveBaseBranchDeps = realDeps): string {
  const attempts = deps.attempts ?? 3;
  for (let i = 0; i < attempts; i++) {
    const base = deps.ghApiDefaultBranch();
    if (base) return base;
    if (i < attempts - 1) deps.sleep(4);
  }
  const local = deps.gitSymbolicRefOriginHead();
  if (local) return local;
  return 'main';
}

if (import.meta.main) {
  const env = process.env;
  const ref = (env.ISSUE_REF ?? '').trim();
  const agentName = env.AGENT_NAME || 'agent';
  const runId = env.GITHUB_RUN_ID || '0';
  const rid = `ir-${agentName}-${runId}`;
  const reviewWorkflow = (env.REVIEW_WORKFLOW ?? '').trim();
  const reviewAgent = (env.REVIEW_AGENT ?? '').trim();
  const trustedRunner = (env.AUTONOMY_TRUSTED_RUNNER ?? 'scripts/runner.ts').trim();
  const isNumericRef = /^[0-9]+$/.test(ref);
  const branch = ref ? `agent/issue-${ref}` : `agent/${rid}`;

  // Deterministic dedup backstop: if this branch ALREADY has a merged PR, the work has landed — never open a
  // duplicate. (A proposer can be relaunched in the lag between a PR merging and its `Closes #<n>` auto-closing
  // the issue; this guard stops the second run from opening a redundant PR for already-merged work.)
  if (isNumericRef && sh('gh', ['pr', 'list', '--head', branch, '--state', 'merged', '--json', 'number', '--jq', '.[0].number // empty'], { allowFail: true })) {
    process.stdout.write(`branch ${branch} already has a merged PR; nothing to propose\n`);
    process.exit(0);
  }

  // Propose only if the skill left changes OR already committed onto its own agent branch (the ztrack SDLC
  // cites the commit SHA as evidence). Bail when the tree is clean AND no such branch exists.
  const dirty = sh('git', ['status', '--porcelain'], { allowFail: true }).length > 0;
  const branchExists = ok('git', ['rev-parse', '--verify', branch]);
  if (!dirty && !branchExists) {
    process.stdout.write('no changes and no agent branch; nothing to propose\n');
    process.exit(0);
  }

  sh('git', ['config', 'user.name', env.AGENT_BOT_NAME || 'open-autonomy-agent']);
  sh('git', ['config', 'user.email', env.AGENT_BOT_EMAIL || 'open-autonomy-agent@users.noreply.github.com']);
  sh('git', ['config', 'core.filemode', 'false']);
  ok('git', ['checkout', branch]) || sh('git', ['checkout', '-b', branch]);

  // Persist this run's transcript + visual evidence INTO the proposal so they ride into the PR and become
  // permanent history only if it merges (each run its own folder; Actions artifacts expire in 30 days).
  const refSlug = (ref.replace(/[^0-9A-Za-z._-]/g, '').slice(0, 40)) || (ref ? 'item' : 'autonomous');
  const runDir = `.open-autonomy/history/${agentName}/${refSlug}-run-${runId}`;
  sh('mkdir', ['-p', runDir]);
  sh('bash', ['-c', `cp -f .agent-run/artifacts/transcript.md "${runDir}/transcript.md" 2>/dev/null || true`]);
  sh('bash', ['-c', `cp -f .agent-run/artifacts/screenshot-* "${runDir}/" 2>/dev/null || true`]);
  sh('git', ['add', '-A']);
  // The tracker's `.volter/` sync-state (world twin, event log, cursors) churns on every run but is NEVER a
  // code deliverable — and an agent edit to it would be a human-required path anyway. Drop it from the
  // proposal so it can't ride into the PR (the run transcript/evidence under `.open-autonomy/history/` stays).
  sh('git', ['reset', '-q', '--', '.volter'], { allowFail: true });

  // Closing keyword in the COMMIT (squash-merge carries it reliably; a PR-body keyword alone is dropped when
  // the repo squashes from the commit message) — only when the subject is an issue number.
  const commitArgs = ['commit', '--allow-empty', '-m', `agent: ${rid}`];
  if (isNumericRef) commitArgs.push('-m', `Closes #${ref}`);
  sh('git', commitArgs);
  sh('git', ['push', '--force', 'origin', branch]);

  // C6 — GitHub-VERIFIED signed commits (opt-in via COMMIT_SIGNING=verified-api; a profile like soc2-baseline
  // sets it). A commit CREATED through GitHub's git/commits API by the job's GITHUB_TOKEN (github-actions[bot],
  // a GitHub App identity) is signed by GitHub and shows "Verified" — keyless, nothing to register; a plain
  // `git commit` + push is unsigned. So we re-create the just-pushed commit through the API (same tree, parents,
  // author + message — only the COMMITTER becomes the signing bot) and move the branch ref to the signed copy;
  // the unsigned local commit is orphaned. This lets branch protection require signed commits without wedging.
  // Best-effort: any hiccup leaves the already-pushed (unsigned) commit in place rather than failing the propose.
  if ((env.COMMIT_SIGNING ?? '').trim() === 'verified-api') {
    const tree = sh('git', ['rev-parse', 'HEAD^{tree}'], { allowFail: true }).trim();
    // CRITICAL: do NOT pass an `author` (or `committer`) on the API commit. GitHub signs a git/commits API
    // commit ONLY when the committer defaults to the authenticated identity (github-actions[bot]); the moment a
    // custom author is given, the committer mirrors it (not the app) and GitHub leaves the commit UNSIGNED —
    // which, under required_signatures, wedges every merge. So we let author+committer both be the signing bot
    // and keep the agent's attribution in the commit MESSAGE (which already carries `agent: <id>` + `Closes #`).
    const message = sh('git', ['log', '-1', '--format=%B'], { allowFail: true }).replace(/\n+$/, '');
    const parents = sh('git', ['rev-list', '--parents', '-n', '1', 'HEAD'], { allowFail: true }).trim().split(/\s+/).slice(1);
    const args = ['api', '-X', 'POST', 'repos/{owner}/{repo}/git/commits',
      '-f', `message=${message}`, '-f', `tree=${tree}`, '--jq', '.sha'];
    for (const p of parents) if (p) args.push('-f', `parents[]=${p}`);
    const signed = tree && message ? sh('gh', args, { allowFail: true }).trim() : '';
    if (/^[0-9a-f]{40}$/.test(signed)
        && ok('gh', ['api', '-X', 'PATCH', `repos/{owner}/{repo}/git/refs/heads/${branch}`, '-f', `sha=${signed}`, '-F', 'force=true'])) {
      sh('git', ['fetch', 'origin', branch], { allowFail: true });
      sh('git', ['reset', '--hard', 'FETCH_HEAD'], { allowFail: true });
      process.stdout.write(`commit re-created via API as GitHub-verified ${signed.slice(0, 7)}\n`);
    } else {
      process.stdout.write('verified-api signing skipped (API create/ref-update failed); kept the unsigned pushed commit (non-fatal)\n');
    }
  }

  // Resolve the repo through gh's `{owner}/{repo}` placeholders (filled from the remote) — works ambiently on
  // GitHub Actions AND a local runner, so this effect needs no injected GITHUB_REPOSITORY. See
  // resolveBaseBranch() above for the retry + local-git-fallback chain (api retries -> origin/HEAD -> 'main').
  const base = resolveBaseBranch();
  let body = sh('bash', ['-c', 'cat .agent-run/artifacts/pr.md 2>/dev/null || true'], { allowFail: true }) || `Automated agent change (${rid}).`;
  if (isNumericRef) body = `Closes #${ref}\n\n${body}`;
  if (!ok('gh', ['pr', 'create', '--base', base, '--head', branch, '--title', `Agent: ${rid}`, '--body', body])) {
    ok('gh', ['pr', 'view', branch]); // already exists — fine
  }

  // Arm native auto-merge via the merge.yml code-host resource (it holds the merge mechanics; the proposer
  // only kicks it, exactly as it kicks ci/agent-review). merge.yml's schedule is the backstop.
  dispatch('merge', ['merge.yml']);

  const headSha = sh('git', ['rev-parse', 'HEAD'], { allowFail: true });
  const prNumber = sh('gh', ['pr', 'view', branch, '--json', 'number', '--jq', '.number'], { allowFail: true });
  dispatch('ci', ['ci.yml', '--ref', branch, '-f', `sha=${headSha}`, '-f', `pr=${prNumber}`]);
  // Trigger the review edge. A bot-opened PR fires no pull_request event, so the proposer KICKS the reviewer
  // itself. Either form resolves to "launch the reviewer for this PR" through the Runner seam, the
  // substrate-correct realization of develop's `review:` edge: github carries REVIEW_WORKFLOW and dispatches
  // it as a workflow; a local runner carries REVIEW_AGENT and launches a termfleet reviewer session via the
  // same `runner.ts launch` the PM uses. (`runner.ts launch <reviewer> --ref <pr>` on github would itself
  // `gh workflow run reviewer.yml -f issue_number=<pr>`, so the two are equivalent; we keep both env forms so
  // the proven github path dispatches exactly as before.)
  if (reviewWorkflow) dispatch('review', [reviewWorkflow, '-f', `issue_number=${prNumber}`]);
  else if (reviewAgent && prNumber) {
    for (let i = 0; i < 6; i++) {
      // Local review is authority-bearing: invoke the runner selected by the accepted control generation,
      // and give the reviewer a fresh workspace based on that generation. The candidate worktree remains
      // this effect's proposal data/cwd, but cannot substitute its runner, reviewer skill, manifest, or
      // finalizer before those changes themselves merge.
      if (ok('bun', [trustedRunner, 'launch', reviewAgent, '--ref', prNumber, '--workspace', 'isolated'])) break;
      sleep(4);
    }
  }
  dispatch('human-approval', ['human-approval.yml', '-f', `pr=${prNumber}`]);

  // Profile-declared EXTRA required-check workflows (e.g. soc2-baseline's `supply-chain` + `codeql` gates).
  // Exactly like ci/agent-review/human-approval: a bot-opened PR fires no pull_request event, so a required
  // check only posts on the head SHA if the proposer KICKS it here — otherwise that required check stays
  // unposted and native auto-merge never fires (the PR wedges). The list is empty for profiles that don't set
  // policy.box.gh-actions.propose_dispatch_checks, so this is a no-op everywhere except where it's declared.
  // Each gate workflow takes `sha` + `pr` inputs and posts a commit status named after its own check context.
  const extraChecks = (env.EXTRA_CHECK_WORKFLOWS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const wf of extraChecks) dispatch(wf, [wf, '-f', `sha=${headSha}`, '-f', `pr=${prNumber}`]);

  // EXTRA agent-reviewers (e.g. the advisory compliance-verifier): a bot PR fires no pull_request_target, so the
  // proposer kicks each with the agent-reviewer `issue_number=<pr>` shape (NOT the gate sha/pr shape), exactly
  // as it kicks the main `review:` edge above. Empty unless policy.box.gh-actions.propose_dispatch_reviews set.
  const extraReviews = (env.EXTRA_REVIEW_WORKFLOWS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const wf of extraReviews) dispatch(wf, [wf, '-f', `issue_number=${prNumber}`]);
}
