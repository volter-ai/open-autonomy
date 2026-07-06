#!/usr/bin/env node
// Operator control plane — the GitHub surface of the Runner contract. On GitHub an operator can't run
// the runner CLI against an Actions run, so the same operations are driven by `/agent <verb>` issue
// comments and mapped to gh here:
//   cancel -> gh run cancel              (Runner.cancel)
//   status -> gh run list + comment      (Runner.get)
//   retry  -> gh workflow run            (Runner.launch)
//   pause  -> add the agent-paused label (Runner.update status=paused; the agent job honors it)
//   resume -> remove the agent-paused label (Runner.update status=running)
// pause/resume are per-ISSUE. The repo-wide kill-switch is NOT a control verb: it is the
// PUBLIC_AGENT_REPO_PAUSED repository variable (every agent job's `if:` gates on it) — decided
// variable-only (BACKLOG BL-20) so pausing the fleet never depends on the fleet's own control
// plane still running. `/agent pause repo` replies with that command instead of mislabeling.
//   decide -> record a maintainer DECISION + clear the human block (the human seam's `out`; Runner.update done)
//   answer -> record a maintainer ANSWER to a needs-info ask + clear the block (same seam, answer flavor)
// On local this isn't emitted at all — the runner CLI (`autonomy cancel|update|get|list`) IS the
// control surface, so the operator already has it directly.
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const ev = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const body = (ev.comment?.body || '').trim();
const issue = ev.issue?.number;
const m = /^\/agent\s+(cancel|pause|resume|status|retry|decide|answer)\b/.exec(body);
if (!m || !issue) {
  console.log('no /agent control command in this event');
  process.exit(0);
}

const verb = m[1];
const repo = process.env.GITHUB_REPOSITORY;
const wf = process.env.CONTROL_WORKFLOW;
const out = (c) => execSync(c, { encoding: 'utf8' });
const sh = (c) => execSync(c, { stdio: 'inherit' });
const q = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;

if (verb === 'cancel') {
  const ids = out(
    `gh run list --repo ${repo} --workflow ${wf} --json databaseId,status --jq '.[]|select(.status=="in_progress" or .status=="queued").databaseId'`,
  )
    .trim()
    .split('\n')
    .filter(Boolean);
  for (const id of ids) sh(`gh run cancel ${id} --repo ${repo} || true`);
  sh(`gh issue comment ${issue} --repo ${repo} --body ${q('Agent run cancelled (/agent cancel).')}`);
} else if (verb === 'pause' || verb === 'resume') {
  // `/agent pause repo` used to fall through to the per-issue path and silently label ONE issue —
  // the operator believed the fleet was stopped when it wasn't (the audit's BL-20). Repo scope is
  // not this script's job: point at the real kill-switch instead of doing the wrong thing quietly.
  if (/^\/agent\s+(?:pause|resume)\s+repo\b/i.test(body)) {
    const setting = verb === 'pause' ? 'true' : 'false';
    sh(
      `gh issue comment ${issue} --repo ${repo} --body ${q(`\`/agent ${verb} repo\` is not a control verb — the repo-wide kill-switch is the repository variable, so it works even when the control plane itself is down:\n\n\`\`\`\ngh variable set PUBLIC_AGENT_REPO_PAUSED --repo ${repo} --body ${setting}\n\`\`\`\n\nNothing was ${verb}d. (\`/agent ${verb}\` without \`repo\` ${verb === 'pause' ? 'pauses' : 'resumes'} just this issue.)`)}`,
    );
  } else if (verb === 'pause') {
    sh(`gh issue edit ${issue} --repo ${repo} --add-label agent-paused`);
  } else {
    sh(`gh issue edit ${issue} --repo ${repo} --remove-label agent-paused`);
  }
} else if (verb === 'status') {
  const s = out(`gh run list --repo ${repo} --workflow ${wf} --limit 5 --json databaseId,status,conclusion,createdAt`);
  sh(`gh issue comment ${issue} --repo ${repo} --body ${q(`Recent agent runs:\n${s}`)}`);
} else if (verb === 'retry') {
  // Retry is per-ISSUE and relaunches ONLY when THIS issue's work actually failed; otherwise it says so
  // (don't silently relaunch — that hides whether anything failed; and don't count unrelated failures from
  // other issues). The per-issue signal is a failed check on this issue's agent PR (agent/issue-<n>); no PR
  // → nothing failed. Bounded: a maintainer command, one launch.
  let failed = '0';
  try {
    failed = out(
      `gh pr view agent/issue-${issue} --repo ${repo} --json statusCheckRollup --jq '[.statusCheckRollup[]?|select((.conclusion//.state)=="FAILURE")]|length'`,
    ).trim();
  } catch {
    failed = '0'; // no agent PR for this issue → no failed run
  }
  if (Number(failed) > 0) {
    sh(`gh workflow run ${wf} --repo ${repo} -f issue_number=${issue}`);
    sh(`gh issue comment ${issue} --repo ${repo} --body ${q('Retrying: relaunched after a failed run (/agent retry).')}`);
  } else {
    sh(`gh issue comment ${issue} --repo ${repo} --body ${q('No failed infrastructure run was found to retry (/agent retry).')}`);
  }
} else if (verb === 'decide' || verb === 'answer') {
  // Issue-level resolution must happen ONCE, but every agent workflow runs a control job — so only the
  // designated primary control job acts; the rest no-op. (Eliminates the duplicate-comment race.)
  if (process.env.ISSUE_CONTROL_PRIMARY !== '1') {
    console.log(`/agent ${verb}: not the primary control job — skipping (handled once by the primary)`);
    process.exit(0);
  }
  // The human seam's `out` (docs/SPEC.md#handoffs): a maintainer RESOLVES a parked human-required/needs-info
  // item — records the typed decision/answer (receiver confirmation, on the record) and CLEARS the human
  // block so the PM re-triages it as resumable. This is the authorized act that drives Runner.update→done for
  // the human realization; the workflow gates it to maintainers (author_association), so it cannot be spoofed.
  const text = body.replace(/^\/agent\s+(?:decide|answer)\s*/i, '').trim();
  const decider = ev.comment?.user?.login || 'maintainer';
  // Each agent workflow runs its own control job, so this fires N times for one comment — dedup the recorded
  // note via a marker keyed on the SOURCE comment id so only one is posted. (Label removal is idempotent.)
  const marker = `<!-- agent-${verb}:${ev.comment?.id ?? 'x'} -->`;
  let already = '';
  try {
    already = out(`gh issue view ${issue} --repo ${repo} --json comments --jq '.comments[].body'`);
  } catch {
    already = '';
  }
  if (!already.includes(marker)) {
    const word = verb === 'decide' ? 'decision' : 'answer';
    sh(
      `gh issue comment ${issue} --repo ${repo} --body ${q(`${marker}\n✅ **Maintainer ${word}** by @${decider} (\`/agent ${verb}\`):\n\n${text || '(see the command comment above)'}\n\n_Recorded — clearing the human block so the PM re-triages and resumes._`)}`,
    );
  }
  // Clear the human-blocking labels — the authorized resolution lifts the block. Idempotent (|| true).
  for (const label of ['human-required', 'needs-info', 'agent-blocked']) {
    sh(`gh issue edit ${issue} --repo ${repo} --remove-label ${label} 2>/dev/null || true`);
  }
}
console.log(`handled /agent ${verb}`);
