#!/usr/bin/env node
// open-autonomy harness-push — land an OA harness/skill update on a gated default branch.
//
// After the merge gate is wired (`enforce_admins:true`), even an admin's direct `git push` to the default
// branch is (correctly) rejected — "GH006: N of N required status checks are expected" — because the gate
// binds admins too. The gate is for *agent* changes; updating the committed OA harness (skills, runner,
// scheduler) is the one legitimate operator out-of-band push. This relaxes `enforce_admins`, pushes, and
// ALWAYS restores it (even if the push fails), so the gate is never left open.
//
//   usage: open-autonomy harness-push [--repo <owner>/<repo>] [--branch <default-branch>] [--remote <origin>]
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const gh = (a: string[]) => spawnSync('gh', a, { encoding: 'utf8' });
const ghOut = (a: string[]) => gh(a).stdout?.trim() ?? '';

const repo = flag('--repo') || ghOut(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']);
const branch = flag('--branch') || ghOut(['repo', 'view', '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name']);
const remote = flag('--remote') || 'origin';
if (!repo || !branch) {
  console.error('harness-push: could not resolve repo/branch — run inside the repo, or pass --repo <o/r> --branch <b>.');
  process.exit(2);
}

const protPath = `repos/${repo}/branches/${branch}/protection/enforce_admins`;
const enforceWasOn = ghOut(['api', protPath, '--jq', '.enabled']) === 'true';

function restore(): void {
  if (!enforceWasOn) return;
  process.stdout.write('harness-push: restoring enforce_admins…\n');
  const r = gh(['api', '-X', 'POST', protPath]);
  if (r.status !== 0) console.error(`harness-push: ! FAILED to restore enforce_admins on ${repo}@${branch} — re-enable it manually (\`gh api -X POST ${protPath}\`).`);
  else console.log('harness-push: gate restored (enforce_admins:true) ✓');
}

let pushStatus = 1;
try {
  if (enforceWasOn) {
    console.log(`harness-push: temporarily relaxing enforce_admins on ${repo}@${branch} (the gate binds admins; harness maintenance is the one legit operator push)…`);
    if (gh(['api', '-X', 'DELETE', protPath]).status !== 0) { console.error('harness-push: failed to relax enforce_admins (need admin?) — aborting.'); process.exit(1); }
  } else {
    console.log(`harness-push: enforce_admins not set on ${repo}@${branch} — pushing directly.`);
  }
  console.log(`harness-push: pushing ${branch} -> ${remote}…`);
  pushStatus = spawnSync('git', ['push', remote, branch], { stdio: 'inherit' }).status ?? 1;
} finally {
  restore();
}

if (pushStatus !== 0) { console.error('harness-push: git push failed (gate restored).'); process.exit(pushStatus); }
console.log('harness-push: done ✓');
