import { describe, expect, test } from 'bun:test';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { REVIEW_RESULT_SCHEMA, type ReviewResult } from './finalize-agent-review';

const SHA = 'c'.repeat(40);

function runFinalizer(
  jobResult: string,
  result: ReviewResult,
  humanApprovalWorkflow = '',
  staleOnHeadCheck = 0,
): { status: number | null; log: string } {
  const dir = mkdtempSync(join(tmpdir(), 'oa-finalize-live-'));
  const gh = join(dir, 'gh');
  const artifact = join(dir, 'review.json');
  const log = join(dir, 'gh.log');
  const count = join(dir, 'head-check-count');
  writeFileSync(artifact, JSON.stringify(result));
  writeFileSync(gh, `#!/usr/bin/env bash
set -eu
printf '%s\\n' "$*" >> "$GH_LOG"
case "$*" in
  *"--json headRefOid,state"*)
    n=0; test ! -f "$GH_COUNT" || n="$(cat "$GH_COUNT")"; n=$((n + 1)); printf '%s' "$n" > "$GH_COUNT"
    if test "$STALE_ON_HEAD_CHECK" -gt 0 && test "$n" -ge "$STALE_ON_HEAD_CHECK"; then
      printf '{"headRefOid":"dddddddddddddddddddddddddddddddddddddddd","state":"OPEN"}\\n'
    else
      printf '{"headRefOid":"${SHA}","state":"OPEN"}\\n'
    fi ;;
  *"--json comments"*) printf '[]\\n' ;;
  *"--json labels"*) printf '[]\\n' ;;
  *"--json closingIssuesReferences"*) printf '[7]\\n' ;;
  *) printf '\\n' ;;
esac
`);
  chmodSync(gh, 0o755);
  try {
    const run = spawnSync(process.execPath, ['scripts/finalize-agent-review.ts'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        GH_LOG: log,
        GH_COUNT: count,
        STALE_ON_HEAD_CHECK: String(staleOnHeadCheck),
        GITHUB_REPOSITORY: 'acme/repo',
        EXPECTED_PR: '42',
        EXPECTED_SHA: SHA,
        REVIEWER_JOB_RESULT: jobResult,
        REVIEW_RESULT_PATH: artifact,
        HUMAN_APPROVAL_WORKFLOW: humanApprovalWorkflow,
      },
    });
    return { status: run.status, log: readFileSync(log, 'utf8') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const success: ReviewResult = {
  schema: REVIEW_RESULT_SCHEMA,
  pr: 42,
  headSha: SHA,
  verdict: 'success',
  outcome: 'approved',
  summary: 'review passed',
  findings: [],
  humanApprovalRequired: false,
};
const humanTask = {
  ask: 'Decide whether this architecture amendment is intended. Reply with /agent decide <decision>.',
  assignTo: 'maintainer',
  completion: {
    ac: 'An authorized maintainer records the architecture decision on the issue.',
    via: 'command' as const,
    check: 'deterministic' as const,
  },
};

describe('finalize-agent-review effects', () => {
  test('an oversized valid summary is normalized before the exact-head green effect', () => {
    const run = runFinalizer('success', { ...success, summary: 'x'.repeat(1001) });
    expect(run.status).toBe(0);
    expect(run.log).toContain(`statuses/${SHA} -f state=success`);
    expect(run.log).toContain('pr comment 42');
  });

  test('an early success artifact followed by model-job failure publishes failure first and never success', () => {
    const run = runFinalizer('failure', success);
    expect(run.status).toBe(1);
    expect(run.log).toContain(`statuses/${SHA} -f state=failure`);
    expect(run.log).not.toContain('state=success');
    expect(run.log.indexOf('state=failure')).toBeLessThan(run.log.indexOf('pr comment 42'));
  });

  test('a successful human-routed review applies routing and comment before green', () => {
    const run = runFinalizer('success', { ...success, humanApprovalRequired: true }, 'human-approval.yml');
    expect(run.status).toBe(0);
    const label = run.log.indexOf('pr edit 42');
    const gate = run.log.indexOf('workflow run human-approval.yml');
    const comment = run.log.indexOf('pr comment 42');
    const green = run.log.indexOf('state=success');
    expect(label).toBeGreaterThan(-1);
    expect(label).toBeLessThan(gate);
    expect(gate).toBeLessThan(comment);
    expect(comment).toBeLessThan(green);
  });

  test('a head change after durable routing never publishes green for the stale review', () => {
    const run = runFinalizer('success', { ...success, humanApprovalRequired: true }, 'human-approval.yml', 3);
    expect(run.status).toBe(0);
    expect(run.log).toContain('pr comment 42');
    expect(run.log).not.toContain('state=success');
  });

  test('a head change after failure status prevents stale PR-scoped routing', () => {
    const run = runFinalizer('failure', { ...success, verdict: 'failure', outcome: 'human-required', humanTask }, '', 2);
    expect(run.status).toBe(1);
    expect(run.log).toContain('state=failure');
    expect(run.log).not.toContain('pr comment 42');
    expect(run.log).not.toContain('issue edit');
  });

  test('a valid human escalation persists its typed ask before parking the issue', () => {
    const run = runFinalizer('success', { ...success, verdict: 'failure', outcome: 'human-required', humanTask });
    expect(run.status).toBe(1);
    expect(run.log).toContain('pr comment 42');
    expect(run.log).toContain('Assigned to');
    expect(run.log).toContain('issue comment 7');
    expect(run.log).toContain('open-autonomy-human-task');
    expect(run.log).toContain('issue edit 7');
    expect(run.log.indexOf('issue comment 7')).toBeLessThan(run.log.indexOf('issue edit 7'));
  });
});
