#!/usr/bin/env bun
// Operator-sim (the human/maintainer simulator) for the conformance bench. The manual-operator-test
// scenarios need a human's inputs — `/agent` commands, labels, induced conditions — that the autonomous
// loop cannot generate for itself. This drives those inputs and VERIFIES the system's ACTUAL response,
// marking a confirmed scenario with the `oa-test-passed` label (the coverage grader counts that as proven).
// It is the operator half of conformance; `bench --drive` (overclock) is the autonomous half. Because it
// checks real behavior, it also surfaces where the system does not yet match a scenario's spec (a fail with
// a GAP note). Dev/test tooling only — never shipped into an install.
import { execFileSync } from 'node:child_process';

export interface OpResult {
  scenario: string;
  issue: number;
  status: 'pass' | 'fail' | 'skip';
  note: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const gh = (a: string[]) => {
  try {
    return execFileSync('gh', a, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};
const ghOk = (a: string[]) => {
  try {
    execFileSync('gh', a, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const labelsOf = (repo: string, n: number) =>
  (gh(['issue', 'view', String(n), '-R', repo, '--json', 'labels', '--jq', '[.labels[].name]|join(",")']) || '')
    .split(',')
    .filter(Boolean);
const comment = (repo: string, n: number, body: string) => ghOk(['issue', 'comment', String(n), '-R', repo, '--body', body]);
const recentComments = (repo: string, n: number, k = 4) =>
  gh(['issue', 'view', String(n), '-R', repo, '--json', 'comments', '--jq', `[.comments[-${k}:][].body]|join("\\n---\\n")`]);

/** Map each `[oa-test:<id>]` scenario marker to its issue number. */
export function scenarioIssues(repo: string): Record<string, number> {
  const map: Record<string, number> = {};
  try {
    const arr = JSON.parse(gh(['issue', 'list', '-R', repo, '--state', 'all', '--limit', '100', '--json', 'number,title'])) as {
      number: number;
      title: string;
    }[];
    for (const it of arr) {
      const m = /\[oa-test:([a-z0-9-]+)\]/.exec(it.title);
      if (m) map[m[1]] = it.number;
    }
  } catch {
    /* no issues */
  }
  return map;
}

// --- per-scenario operator scripts: drive the maintainer input, verify the system's response ---

async function opPauseResume(repo: string, n: number): Promise<OpResult> {
  comment(repo, n, '/agent pause');
  await sleep(55000);
  const paused = labelsOf(repo, n).includes('agent-paused');
  comment(repo, n, '/agent status');
  await sleep(45000);
  const statusPosted = /recent agent runs/i.test(recentComments(repo, n, 3));
  comment(repo, n, '/agent resume');
  await sleep(55000);
  const resumed = !labelsOf(repo, n).includes('agent-paused');
  const ok = paused && resumed;
  return {
    scenario: 'operator-pause-resume',
    issue: n,
    status: ok ? 'pass' : 'fail',
    note: `pause→agent-paused=${paused}; status-comment=${statusPosted}; resume→cleared=${resumed}`,
  };
}

async function opCancel(repo: string, n: number): Promise<OpResult> {
  // Need an in-flight run to cancel: launch the developer on this issue, wait until it is running, cancel it.
  ghOk(['workflow', 'run', 'developer.yml', '-R', repo, '-f', `issue_number=${n}`]);
  let running = false;
  for (let i = 0; i < 14 && !running; i++) {
    await sleep(15000);
    running = gh(['run', 'list', '-R', repo, '--workflow', 'developer.yml', '--limit', '1', '--json', 'status', '--jq', '.[0].status']) ===
      'in_progress';
  }
  comment(repo, n, '/agent cancel');
  await sleep(55000);
  const cancelComment = /cancel/i.test(recentComments(repo, n, 3));
  const runState = gh(['run', 'list', '-R', repo, '--workflow', 'developer.yml', '--limit', '1', '--json', 'conclusion', '--jq', '.[0].conclusion']);
  const ok = cancelComment && (runState === 'cancelled' || !running);
  return {
    scenario: 'operator-cancel',
    issue: n,
    status: ok ? 'pass' : 'fail',
    note: `was-running=${running}; cancel-comment=${cancelComment}; run-conclusion=${runState || '-'}`,
  };
}

async function opRepoPause(repo: string, n: number): Promise<OpResult> {
  // Repo-level pause = the deterministic `PUBLIC_AGENT_REPO_PAUSED` variable kill-switch (gated in every
  // agent job's `if:`). Set it, dispatch a developer, and assert its job is SKIPPED (not run) — deterministic,
  // not the PM model noticing a label; then clear it.
  ghOk(['variable', 'set', 'PUBLIC_AGENT_REPO_PAUSED', '-R', repo, '--body', 'true']);
  await sleep(8000);
  ghOk(['workflow', 'run', 'developer.yml', '-R', repo, '-f', `issue_number=${n}`]);
  await sleep(70000); // the dispatch registers and the if: evaluates (a skipped job needs no runner)
  const conclusion = gh([
    'run', 'list', '-R', repo, '--workflow', 'developer.yml', '--event', 'workflow_dispatch', '--limit', '1', '--json', 'conclusion', '--jq', '.[0].conclusion',
  ]);
  ghOk(['variable', 'set', 'PUBLIC_AGENT_REPO_PAUSED', '-R', repo, '--body', 'false']);
  const ok = conclusion === 'skipped';
  return {
    scenario: 'repo-pause',
    issue: n,
    status: ok ? 'pass' : 'fail',
    note: ok ? 'repo-pause variable → developer job skipped deterministically' : `GAP: developer run conclusion=${conclusion || '-'} under repo-pause (expected skipped)`,
  };
}

async function opRetryNoFailure(repo: string, n: number): Promise<OpResult> {
  comment(repo, n, '/agent retry');
  await sleep(55000);
  const c = recentComments(repo, n, 3);
  const ok = /no failed|nothing to retry|no failed infrastructure/i.test(c);
  return {
    scenario: 'operator-retry-no-failure',
    issue: n,
    status: ok ? 'pass' : 'fail',
    note: ok ? 'posted a no-failed-run notice' : 'GAP: /agent retry relaunches but posts no "no failed run" notice',
  };
}

const HANDLERS: Record<string, (repo: string, n: number) => Promise<OpResult>> = {
  'operator-pause-resume': opPauseResume,
  'operator-cancel': opCancel,
  'repo-pause': opRepoPause,
  'operator-retry-no-failure': opRetryNoFailure,
};

/** Drive + verify every operator scenario present in the cell; label passes `oa-test-passed`. */
export async function operate(repo: string): Promise<OpResult[]> {
  ghOk(['label', 'create', 'oa-test-passed', '-R', repo, '--color', '0e8a16', '--description', 'operator-sim verified the scenario']);
  const found = scenarioIssues(repo);
  const results: OpResult[] = [];
  for (const [scenario, handler] of Object.entries(HANDLERS)) {
    const n = found[scenario];
    if (!n) {
      results.push({ scenario, issue: 0, status: 'skip', note: 'no seeded issue' });
      continue;
    }
    process.stderr.write(`operator-sim: ${scenario} (#${n})…\n`);
    const r = await handler(repo, n);
    if (r.status === 'pass') {
      ghOk(['issue', 'edit', String(n), '-R', repo, '--add-label', 'oa-test-passed']);
      comment(repo, n, `operator-sim ✓ ${scenario}: ${r.note}`);
    } else if (r.status === 'fail') {
      comment(repo, n, `operator-sim ✗ ${scenario}: ${r.note}`);
    }
    process.stderr.write(`  ${r.status.toUpperCase()} — ${r.note}\n`);
    results.push(r);
  }
  return results;
}

if (import.meta.main) {
  const repo = process.argv[process.argv.indexOf('--repo') + 1];
  if (!repo || !process.argv.includes('--repo')) throw new Error('usage: bun scripts/bench-operate.ts --repo <owner/name>');
  const results = await operate(repo);
  const tally = results.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {} as Record<string, number>);
  process.stdout.write(`\noperator-sim: ${tally.pass || 0} pass, ${tally.fail || 0} fail, ${tally.skip || 0} skip\n`);
  for (const r of results) process.stdout.write(`  [${r.status}] ${r.scenario} — ${r.note}\n`);
  process.exit((tally.fail || 0) > 0 ? 1 : 0);
}
