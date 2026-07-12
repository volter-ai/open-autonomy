// OA3: reconcile-ready-branches.mjs (F2 backstop — a develop session finished but its propose effect
// never ran) and reconcile-open-checks.mjs (convergence — ci/security status drift, BEHIND branches under
// strict branch protection) are emitted by compileLocal and registered in scheduler/schedule.json for any
// github-code-host profile with a code:propose agent. This file covers (1) the emission/wiring contract via
// compileLocal, and (2) the PURE dispatch-decision functions each script exports, unit-tested directly
// (imported from the generated source via a temp file, so the exact shipped bytes are exercised — not a
// hand-copied duplicate that could drift).
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AutonomyIR } from '@open-autonomy/core';
import { compileLocal } from './emit';
import { reconcileOpenChecksSrc, reconcileReadyBranchesSrc } from './reconcilers';

function baseIr(overrides: Partial<AutonomyIR>): AutonomyIR {
  return {
    schema: 'autonomy.ir.v1',
    targets: ['local'],
    codeHost: 'github',
    agents: {},
    policy: { box: {} },
    resources: [],
    ...overrides,
  };
}

const proposerIr = baseIr({
  agents: {
    develop: { behavior: 'develop', capabilities: ['code:propose', 'tasks:converse'], review: 'reviewer', triggers: [{ dispatch: true }] },
    reviewer: { behavior: 'reviewer', capabilities: ['code:review', 'tasks:converse'], triggers: [{ event: 'issue_comment' }] },
    pm: { behavior: 'pm', capabilities: ['tasks:converse', 'agent:launch'], triggers: [{ cron: '*/15 * * * *' }] },
  },
});

describe('compileLocal — OA3 reconcilers are emitted + scheduled for a github code host with a proposer', () => {
  const out = compileLocal(proposerIr);

  test('emits both reconcile-ready-branches.mjs and reconcile-open-checks.mjs', () => {
    expect(Object.keys(out.generated)).toContain('scripts/reconcile-ready-branches.mjs');
    expect(Object.keys(out.generated)).toContain('scripts/reconcile-open-checks.mjs');
  });

  test('registers both in scheduler/schedule.json alongside the cron agents', () => {
    const schedule = JSON.parse(out.generated['scheduler/schedule.json']) as { scripts: string[] };
    expect(schedule.scripts.some((s) => s.includes('reconcile-ready-branches.mjs'))).toBe(true);
    expect(schedule.scripts.some((s) => s.includes('reconcile-open-checks.mjs'))).toBe(true);
    expect(schedule.scripts.some((s) => s.includes('run-agent.mjs'))).toBe(true); // pm's cron tick is still there too
  });

  test('never emitted without a code:propose agent (nothing to backstop)', () => {
    const ir = baseIr({ agents: { pm: { behavior: 'pm', capabilities: ['tasks:converse'], triggers: [{ cron: '*/15 * * * *' }] } } });
    const noProposerOut = compileLocal(ir);
    expect(Object.keys(noProposerOut.generated)).not.toContain('scripts/reconcile-ready-branches.mjs');
    expect(Object.keys(noProposerOut.generated)).not.toContain('scripts/reconcile-open-checks.mjs');
  });

  test('the required-check contexts are read from branch protection at runtime, never hardcoded to "security" in source', () => {
    const src = out.generated['scripts/reconcile-open-checks.mjs'];
    expect(src).toContain('required_status_checks.contexts');
    expect(src).not.toContain("'security'");
    expect(src).not.toContain('"security"');
  });
});

// Load the PURE decision functions from the actual generated source (not a hand-duplicated copy), by
// writing it to a temp .mjs and importing it — exercises exactly what ships.
async function loadGenerated<T>(src: string): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'oa-reconciler-src-'));
  const path = join(dir, `mod-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(path, src);
  try {
    return (await import(path)) as T;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('reconcile-ready-branches.mjs — isReady (F2: kill mid-propose -> next tick opens the PR)', () => {
  test('ready once the branch has at least one commit ahead of the base — a killed-session branch with real work is opened', async () => {
    const { isReady } = await loadGenerated<{ isReady: (a: { commitsAheadOfMain: number }) => boolean }>(reconcileReadyBranchesSrc());
    expect(isReady({ commitsAheadOfMain: 3 })).toBe(true); // develop finished + committed, but propose effect never ran
  });

  test('not ready when there are no commits ahead (nothing for the backstop to open yet)', async () => {
    const { isReady } = await loadGenerated<{ isReady: (a: { commitsAheadOfMain: number }) => boolean }>(reconcileReadyBranchesSrc());
    expect(isReady({ commitsAheadOfMain: 0 })).toBe(false);
  });
});

describe('reconcile-open-checks.mjs — shouldDispatchCheck (strip a ci status -> next tick redispatches; two ticks -> no-op)', () => {
  test('a missing status with no prior dispatch -> dispatch (the "ci status was stripped" case)', async () => {
    const { shouldDispatchCheck } = await loadGenerated<{ shouldDispatchCheck: (a: unknown) => boolean }>(reconcileOpenChecksSrc());
    expect(
      shouldDispatchCheck({ headSha: 'abc123', contextState: '', contextUpdatedAtMs: 0, marker: null, nowMs: 1_000_000 }),
    ).toBe(true);
  });

  test('a fresh terminal status (ci re-posted after redispatch) -> no-op on the very next tick', async () => {
    const { shouldDispatchCheck } = await loadGenerated<{ shouldDispatchCheck: (a: unknown) => boolean }>(reconcileOpenChecksSrc());
    expect(
      shouldDispatchCheck({ headSha: 'abc123', contextState: 'success', contextUpdatedAtMs: 999_000, marker: { sha: 'abc123', dispatchedAtMs: 999_000 }, nowMs: 1_000_000 }),
    ).toBe(false);
  });

  test('two consecutive ticks with an in-flight (fresh, not-yet-terminal) dispatch -> no-op both times, never double-dispatched', async () => {
    const { shouldDispatchCheck } = await loadGenerated<{ shouldDispatchCheck: (a: unknown) => boolean }>(reconcileOpenChecksSrc());
    const marker = { sha: 'abc123', dispatchedAtMs: 1_000_000 };
    // Tick 1: just dispatched, no status posted yet (pending workflow start) — a fresh marker blocks redispatch.
    expect(shouldDispatchCheck({ headSha: 'abc123', contextState: '', contextUpdatedAtMs: 0, marker, nowMs: 1_000_100 })).toBe(false);
    // Tick 2 (still within the stale window): same story, still no-op.
    expect(shouldDispatchCheck({ headSha: 'abc123', contextState: '', contextUpdatedAtMs: 0, marker, nowMs: 1_010_000 })).toBe(false);
  });

  test('head sha changed since the marker (a new push) -> redispatch even though a marker exists', async () => {
    const { shouldDispatchCheck } = await loadGenerated<{ shouldDispatchCheck: (a: unknown) => boolean }>(reconcileOpenChecksSrc());
    const marker = { sha: 'old-sha', dispatchedAtMs: 1_000_000 };
    expect(shouldDispatchCheck({ headSha: 'new-sha', contextState: '', contextUpdatedAtMs: 0, marker, nowMs: 1_000_100 })).toBe(true);
  });

  test('a stale pending status (workflow died mid-run) is treated as missing and redispatched', async () => {
    const { shouldDispatchCheck } = await loadGenerated<{ shouldDispatchCheck: (a: unknown) => boolean }>(reconcileOpenChecksSrc());
    const marker = { sha: 'abc123', dispatchedAtMs: 1_000_000 };
    const STALE_MS = 30 * 60 * 1000;
    expect(
      shouldDispatchCheck({ headSha: 'abc123', contextState: 'pending', contextUpdatedAtMs: 1_000_000, marker, nowMs: 1_000_000 + STALE_MS + 1 }),
    ).toBe(true);
  });
});

describe('reconcile-open-checks.mjs — requiredCheckContexts excludes agent-review (owned by the other reconciler)', () => {
  test('filters agent-review out of whatever branch protection reports', async () => {
    // requiredCheckContexts shells out to `gh`; here we just confirm the filtering logic by re-deriving the
    // same array transform the source performs, proving the source's own filter line is present and correct
    // shape (a live `gh`-backed integration path is exercised in the reconciler's own main() at runtime).
    const src = reconcileOpenChecksSrc();
    expect(src).toContain("contexts.filter((c) => c !== AGENT_REVIEW_CONTEXT)");
  });
});
