#!/usr/bin/env node
// Operator control plane — the GitHub surface of the Runner contract. On GitHub an operator can't run
// the runner CLI against an Actions run, so the same operations are driven by `/agent <verb>` issue
// comments and mapped to gh here:
//   cancel -> gh run cancel              (Runner.cancel)
//   status -> gh run list + comment      (Runner.get)
//   retry  -> gh workflow run            (Runner.launch)
//   pause  -> add the agent-paused label (Runner.update status=paused; the agent job honors it)
//   resume -> remove the agent-paused label (Runner.update status=running)
// On local this isn't emitted at all — the runner CLI (`autonomy cancel|update|get|list`) IS the
// control surface, so the operator already has it directly.
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const ev = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const body = (ev.comment?.body || '').trim();
const issue = ev.issue?.number;
const m = /^\/agent\s+(cancel|pause|resume|status|retry)\b/.exec(body);
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
} else if (verb === 'pause') {
  sh(`gh issue edit ${issue} --repo ${repo} --add-label agent-paused`);
} else if (verb === 'resume') {
  sh(`gh issue edit ${issue} --repo ${repo} --remove-label agent-paused`);
} else if (verb === 'status') {
  const s = out(`gh run list --repo ${repo} --workflow ${wf} --limit 5 --json databaseId,status,conclusion,createdAt`);
  sh(`gh issue comment ${issue} --repo ${repo} --body ${q(`Recent agent runs:\n${s}`)}`);
} else if (verb === 'retry') {
  sh(`gh workflow run ${wf} --repo ${repo} -f issue_number=${issue}`);
}
console.log(`handled /agent ${verb}`);
