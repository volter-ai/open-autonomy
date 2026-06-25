#!/usr/bin/env bun
// The `human-approval` gate — a DETERMINISTIC, ADDITIONAL required check (alongside ci + agent-review). It is
// the github realization of the actor model's human REVIEW task: a maintainer Approve on the CURRENT head SHA,
// required ONLY for PRs that touch human-required scope (sensitive paths, or the `human-required` label).
//
// Why deterministic/script (vs an agent): it IS a security boundary — "did a maintainer approve this exact
// head?" must not be a model judgment. AI review stays required separately (agent-review); this only adds the
// human sign-off for sensitive changes. Routine agent PRs auto-pass so the autonomous loop is never blocked.
//
// The status flipping to `success` completes `completion: 'maintainer Approve on current SHA'`. Re-earned per
// SHA: an Approve counts only if its commit_id == the current head, so a new push re-opens the gate.
import { execFileSync } from 'node:child_process';

const repo = process.env.GITHUB_REPOSITORY;
const pr = process.env.PR_NUMBER;
if (!repo || !pr) {
  process.stderr.write('human-approval: missing GITHUB_REPOSITORY/PR_NUMBER — skipping\n');
  process.exit(0);
}
const gh = (args: string[]): string => {
  try {
    return execFileSync('gh', args, { encoding: 'utf8' }).trim();
  } catch (e) {
    process.stderr.write(`human-approval: gh ${args.join(' ')} failed: ${e instanceof Error ? e.message : String(e)}\n`);
    return '';
  }
};

// Maintainer roles whose Approve counts (same trust set the control plane uses).
const MAINTAINER = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

// human-required scope — MIRRORS `.open-autonomy/autonomy.yml` risk.human_required_paths (keep in sync). A PR
// in scope needs a maintainer Approve; everything else auto-passes. `.open-autonomy/history/**` (proposer
// transcripts) is informational and never counts as scope.
function isSensitivePath(f: string): boolean {
  if (f.startsWith('.open-autonomy/history/')) return false;
  return (
    f.startsWith('.github/workflows/') ||
    f === '.open-autonomy/autonomy.yml' ||
    f === 'docs/CONSTITUTION.md' ||
    f.startsWith('.codex/skills/') ||
    f.startsWith('.claude/skills/') ||
    f.startsWith('profiles/self-driving/skills/') ||
    f.endsWith('wrangler.toml')
  );
}

const view = JSON.parse(gh(['pr', 'view', pr, '-R', repo, '--json', 'headRefOid,labels,files']) || '{}') as {
  headRefOid?: string;
  labels?: { name: string }[];
  files?: { path: string }[];
};
const headSha = view.headRefOid;
if (!headSha) {
  process.stderr.write('human-approval: could not resolve head SHA — skipping (no status posted)\n');
  process.exit(0);
}
const labels = (view.labels ?? []).map((l) => l.name);
const files = (view.files ?? []).map((f) => f.path);
const scoped = labels.includes('human-required') || files.some(isSensitivePath);

// For a scoped PR, look for a maintainer Approve on the CURRENT head (per-SHA re-earn via commit_id).
let approved = false;
if (scoped) {
  const reviews = JSON.parse(gh(['api', `repos/${repo}/pulls/${pr}/reviews`, '--paginate']) || '[]') as {
    state?: string;
    author_association?: string;
    commit_id?: string;
  }[];
  approved = reviews.some((r) => r.state === 'APPROVED' && MAINTAINER.has(r.author_association ?? '') && r.commit_id === headSha);
}

const state = !scoped || approved ? 'success' : 'pending';
const description = !scoped
  ? 'no human-required scope — auto-passed'
  : approved
    ? 'maintainer approved the current head'
    : 'awaiting a maintainer Approve on the current commit (human-required scope)';

gh(['api', '-X', 'POST', `repos/${repo}/statuses/${headSha}`, '-f', `state=${state}`, '-f', 'context=human-approval', '-f', `description=${description}`]);
process.stdout.write(`human-approval: #${pr} scoped=${scoped} approved=${approved} → ${state} (${headSha.slice(0, 7)})\n`);

// Engage (in-band): on a scoped PR awaiting approval, leave ONE visible note so it isn't silent. Idempotent via
// a hidden marker so re-runs (each push/review) don't spam. (Out-of-band notify is the separate health monitor.)
if (scoped && !approved) {
  const marker = '<!-- human-approval-gate -->';
  const existing = gh(['pr', 'view', pr, '-R', repo, '--json', 'comments']) || '{}';
  if (!existing.includes(marker)) {
    gh(['pr', 'comment', pr, '-R', repo, '--body', `${marker}\n⏳ **Maintainer approval required.** This PR touches human-required scope, so beyond \`ci\` + \`agent-review\` it needs a maintainer **Approve** on the current commit before it can merge. Re-approve after any new push (the gate is per-commit).`]);
  }
}
