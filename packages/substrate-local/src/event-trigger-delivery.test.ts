// OA2: an agent whose ONLY triggers are `event`-kind has no local delivery mechanism unless (a) it also
// carries a portable `dispatch` trigger, (b) some other agent's `review:` names it (reconcile-open-reviews.mjs
// delivers it), or (c) no agent in the profile holds `agent:launch` at all is FALSE i.e. some orchestrator
// exists that could, in principle, dispatch it. Compiling to `local` without any of the three must fail
// LOUD (never silently drop the trigger) — this is the gap docs/SPEC.md's conformance section names but
// BL-22 dev/04 left unimplemented (a per-feature target/substrate check), and BACKLOG.md records it as open.
import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AutonomyIR } from '@open-autonomy/core';
import { compileLocal, undeliverableEventAgents } from './emit';
import { reconcileOpenReviewsSrc } from './reconcilers';

// Load the PURE decision function from the actual generated source (not a hand-duplicated copy) — exercises
// exactly what ships, the same pattern reconciler-emit.test.ts uses for the OA3 scripts.
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

describe('undeliverableEventAgents', () => {
  test('an event-only agent named by another agent\'s review: is deliverable (reconcile-open-reviews.mjs covers it)', () => {
    const ir = baseIr({
      agents: {
        develop: {
          behavior: 'develop',
          capabilities: ['code:propose', 'tasks:converse'],
          review: 'reviewer',
          triggers: [{ dispatch: true }],
        },
        reviewer: {
          behavior: 'reviewer',
          capabilities: ['code:review', 'tasks:converse'],
          triggers: [{ event: 'issue_comment' }, { event: 'pull_request_target' }],
        },
        pm: { behavior: 'pm', capabilities: ['tasks:converse', 'agent:launch'], triggers: [{ cron: '*/15 * * * *' }] },
      },
    });
    expect(undeliverableEventAgents(ir)).toEqual([]);
  });

  test('an event-only agent that ALSO carries a dispatch trigger is deliverable (dispatch is portable)', () => {
    const ir = baseIr({
      agents: {
        develop: {
          behavior: 'develop',
          capabilities: ['code:propose', 'tasks:converse'],
          triggers: [{ dispatch: true }, { event: 'issue_comment' }],
        },
      },
    });
    expect(undeliverableEventAgents(ir)).toEqual([]);
  });

  test('an event-only agent is deliverable when SOME agent in the profile holds agent:launch (an orchestrator could reach it)', () => {
    const ir = baseIr({
      agents: {
        watcher: { behavior: 'watcher', capabilities: ['tasks:converse'], triggers: [{ event: 'push' }] },
        pm: { behavior: 'pm', capabilities: ['tasks:converse', 'agent:launch'], triggers: [{ cron: '*/15 * * * *' }] },
      },
    });
    expect(undeliverableEventAgents(ir)).toEqual([]);
  });

  test('an event-only agent with NO dispatch trigger, NOT a review target, and NO agent:launch anywhere is UNDELIVERABLE', () => {
    const ir = baseIr({
      agents: {
        watcher: { behavior: 'watcher', capabilities: ['tasks:converse'], triggers: [{ event: 'push' }] },
      },
    });
    expect(undeliverableEventAgents(ir)).toEqual(['watcher']);
  });

  test('a kind:human actor is never flagged (never executed on any substrate)', () => {
    const ir = baseIr({
      agents: {
        approver: { kind: 'human', behavior: 'approver', capabilities: ['tasks:converse'], triggers: [{ event: 'pull_request_review' }] },
      },
    });
    expect(undeliverableEventAgents(ir)).toEqual([]);
  });

  test('a cron-only or dispatch-only agent (no event trigger at all) is never flagged', () => {
    const ir = baseIr({
      agents: {
        pm: { behavior: 'pm', capabilities: ['tasks:converse'], triggers: [{ cron: '*/15 * * * *' }] },
        worker: { behavior: 'worker', capabilities: ['tasks:converse'], triggers: [{ dispatch: true }] },
      },
    });
    expect(undeliverableEventAgents(ir)).toEqual([]);
  });
});

describe('compileLocal — fails loud on an undeliverable event trigger (OA2, decision: delivery + fail-loud validator)', () => {
  test('throws an actionable error naming the agent, never silently drops the trigger', () => {
    const ir = baseIr({
      agents: {
        watcher: { behavior: 'watcher', capabilities: ['tasks:converse'], triggers: [{ event: 'push' }] },
      },
    });
    expect(() => compileLocal(ir)).toThrow(/watcher/);
    expect(() => compileLocal(ir)).toThrow(/event-kind/);
  });

  test('compiles clean when the event-triggered agent is a review: target', () => {
    const ir = baseIr({
      agents: {
        develop: {
          behavior: 'develop',
          capabilities: ['code:propose', 'tasks:converse'],
          review: 'reviewer',
          triggers: [{ dispatch: true }],
        },
        reviewer: {
          behavior: 'reviewer',
          capabilities: ['code:review', 'tasks:converse'],
          triggers: [{ event: 'issue_comment' }],
        },
      },
    });
    expect(() => compileLocal(ir)).not.toThrow();
  });
});

describe('compileLocal — emits the review-delivery reconciler (OA2b) only when it has real work to do', () => {
  const irWithReviewEdge = baseIr({
    agents: {
      develop: {
        behavior: 'develop',
        capabilities: ['code:propose', 'tasks:converse'],
        review: 'reviewer',
        triggers: [{ dispatch: true }],
      },
      reviewer: {
        behavior: 'reviewer',
        capabilities: ['code:review', 'tasks:converse'],
        triggers: [{ event: 'issue_comment' }, { event: 'pull_request_target' }],
      },
    },
  });

  test('emits scripts/reconcile-open-reviews.mjs and registers it in scheduler/schedule.json', () => {
    const out = compileLocal(irWithReviewEdge);
    expect(Object.keys(out.generated)).toContain('scripts/reconcile-open-reviews.mjs');
    const schedule = JSON.parse(out.generated['scheduler/schedule.json']) as { jobs: Array<{ command: string }> };
    expect(schedule.jobs.some((job) => job.command.includes('reconcile-open-reviews.mjs'))).toBe(true);
  });

  test('the emitted script is parameterized off the manifest — no hardcoded "reviewer"/"agent-review" agent name literal in the SOURCE beyond the seam-contract status context', () => {
    const out = compileLocal(irWithReviewEdge);
    const src = out.generated['scripts/reconcile-open-reviews.mjs'];
    // The status context IS a seam-contract constant (docs/SPEC.md) and is expected verbatim.
    expect(src).toContain("AGENT_REVIEW_CONTEXT = 'agent-review'");
    // The reviewer AGENT NAME must be resolved at runtime from the manifest, never baked in as a literal.
    expect(src).not.toMatch(/'reviewer'/);
    expect(src).toContain('reviewerFor(manifest, proposerRole)');
  });

  test('the emitted reconciler recovers the real review edge without Bun.YAML', async () => {
    const out = compileLocal(irWithReviewEdge);
    const dir = mkdtempSync(join(tmpdir(), 'oa-json-manifest-'));
    const prior = process.cwd();
    try {
      mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
      writeFileSync(join(dir, '.open-autonomy', 'autonomy.json'), out.generated['.open-autonomy/autonomy.json']);
      const modulePath = join(dir, 'reconcile-open-reviews.mjs');
      writeFileSync(modulePath, out.generated['scripts/reconcile-open-reviews.mjs']);
      process.chdir(dir);
      const mod = await import(`${modulePath}?${Date.now()}`) as {
        readManifest: () => { agents?: Record<string, { review?: string }> };
      };
      expect(mod.readManifest().agents?.develop?.review).toBe('reviewer');
      expect(out.generated['scripts/reconcile-open-reviews.mjs']).not.toContain('Bun.YAML');
    } finally {
      process.chdir(prior);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('NOT emitted when no proposer declares a review: edge (nothing to deliver)', () => {
    const ir = baseIr({
      agents: {
        develop: { behavior: 'develop', capabilities: ['code:propose', 'tasks:converse'], triggers: [{ dispatch: true }] },
      },
    });
    const out = compileLocal(ir);
    expect(Object.keys(out.generated)).not.toContain('scripts/reconcile-open-reviews.mjs');
  });

  test('NOT emitted for a local-git code host (no PRs to poll)', () => {
    const ir = { ...irWithReviewEdge, codeHost: 'local-git' as const };
    const out = compileLocal(ir);
    expect(Object.keys(out.generated)).not.toContain('scripts/reconcile-open-reviews.mjs');
    expect(Object.keys(out.generated)).not.toContain('scripts/reconcile-ready-branches.mjs');
    expect(Object.keys(out.generated)).not.toContain('scripts/reconcile-open-checks.mjs');
  });
});

describe('reconcile-open-reviews.mjs — shouldDispatch (a bot PR fires no pull_request event; delivers the review edge every tick)', () => {
  test('no agent-review status and no prior dispatch marker -> dispatch', async () => {
    const { shouldDispatch } = await loadGenerated<{ shouldDispatch: (a: unknown) => boolean }>(reconcileOpenReviewsSrc());
    expect(shouldDispatch({ headSha: 'abc123', agentReviewState: '', marker: null, nowMs: 1_000_000 })).toBe(true);
  });

  test('agent-review already posted for the current head -> never redispatch (handled before shouldDispatch is even reached, but the pure function itself also refuses)', async () => {
    const { shouldDispatch } = await loadGenerated<{ shouldDispatch: (a: unknown) => boolean }>(reconcileOpenReviewsSrc());
    expect(shouldDispatch({ headSha: 'abc123', agentReviewState: 'success', marker: null, nowMs: 1_000_000 })).toBe(false);
  });

  test('two consecutive ticks with a fresh in-flight dispatch marker -> no-op both times (never double-dispatched)', async () => {
    const { shouldDispatch } = await loadGenerated<{ shouldDispatch: (a: unknown) => boolean }>(reconcileOpenReviewsSrc());
    const marker = { sha: 'abc123', dispatchedAtMs: 1_000_000 };
    expect(shouldDispatch({ headSha: 'abc123', agentReviewState: '', marker, nowMs: 1_000_100 })).toBe(false);
    expect(shouldDispatch({ headSha: 'abc123', agentReviewState: '', marker, nowMs: 1_010_000 })).toBe(false);
  });

  test('head sha changed since the marker\'s dispatch (a synchronize) -> redispatch', async () => {
    const { shouldDispatch } = await loadGenerated<{ shouldDispatch: (a: unknown) => boolean }>(reconcileOpenReviewsSrc());
    const marker = { sha: 'old-sha', dispatchedAtMs: 1_000_000 };
    expect(shouldDispatch({ headSha: 'new-sha', agentReviewState: '', marker, nowMs: 1_000_100 })).toBe(true);
  });

  test('a stale marker (dispatched long ago, reviewer session presumably died) -> redispatch', async () => {
    const { shouldDispatch } = await loadGenerated<{ shouldDispatch: (a: unknown) => boolean }>(reconcileOpenReviewsSrc());
    const marker = { sha: 'abc123', dispatchedAtMs: 1_000_000 };
    const STALE_MS = 30 * 60 * 1000;
    expect(shouldDispatch({ headSha: 'abc123', agentReviewState: '', marker, nowMs: 1_000_000 + STALE_MS + 1 })).toBe(true);
  });
});
