import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { ExecRunner, HumanRunner, type Runner, type Session } from './runner';

const statePath = () => join(mkdtempSync(join(tmpdir(), 'human-runner-')), 'sessions.json');

describe('HumanRunner — the human realization of the Runner contract', () => {
  test('it is a Runner (same interface as the agent realizations)', () => {
    const r: Runner = new HumanRunner(statePath()); // type-level: conforms to the unified contract
    expect(typeof r.launch).toBe('function');
    expect(typeof r.list).toBe('function');
    expect(typeof r.cancel).toBe('function');
  });

  test('launch engages + parks the action; it never auto-completes', async () => {
    const r = new HumanRunner(statePath());
    const s = await r.launch('maintainer', { ask: 'approve the change', completion: '/agent approve' });
    expect(s.agent).toBe('maintainer');
    expect(s.status).toBe('running'); // parked, not done
    expect(s.params).toEqual({ ask: 'approve the change', completion: '/agent approve' }); // opaque ask rides through
    // the note tells the PM the status is bookkeeping and echoes the completion condition to verify
    expect(s.note).toContain('bookkeeping only');
    expect(s.note).toContain('/agent approve');
    // re-reading keeps it running — a no-op human runner can never confirm completion on its own
    expect((await r.list()).map((x) => x.id)).toContain(s.id);
    expect((await r.get(s.id))?.status).toBe('running');
  });

  test('the only path to done is an external authorized resolution (update), never the runner itself', async () => {
    const path = statePath();
    const r = new HumanRunner(path);
    const s = await r.launch('maintainer', {});
    expect(await r.update(s.id, { status: 'done' })).toBe(true); // the verified act, applied by the orchestrator
    expect((await r.get(s.id))?.status).toBe('done');
    expect(await r.list()).toHaveLength(0); // no longer in flight
  });

  test('cancel retracts the ask; an engage backend is invoked (black box)', async () => {
    const engaged: Session[] = [];
    const r = new HumanRunner(statePath(), (s) => engaged.push(s)); // a black-box backend (e.g. Slack)
    const s = await r.launch('requester', { ask: 'need a repro' });
    expect(engaged).toHaveLength(1); // the backend was handed the action
    expect(await r.cancel(s.id)).toBe(true);
    expect((await r.get(s.id))?.status).toBe('cancelled');
  });
});

describe('the PM manages both kinds through the one Runner interface', () => {
  test('dispatch by kind; agents self-complete, humans the PM marks done after verifying the condition', async () => {
    // The orchestrator holds one runner per kind — same interface — and routes by the actor's kind.
    const runners: Record<'agent' | 'human', Runner> = {
      agent: new ExecRunner(statePath()), // a stand-in for Termfleet/Github
      human: new HumanRunner(statePath()),
    };
    const dispatch = (kind: 'agent' | 'human', actor: string, params: Record<string, string>) =>
      runners[kind].launch(actor, params);

    // PM dispatches an agent worker and a human approval — identical call shape.
    const dev = await dispatch('agent', 'developer', { issue_number: '5' });
    const appr = await dispatch('human', 'maintainer', { issue_number: '5', completion: 'an authorized /agent approve' });

    // The agent run reports done through its own runner (a real one would on session end).
    await runners.agent.update(dev.id, { status: 'done' });
    expect((await runners.agent.get(dev.id))?.status).toBe('done');

    // The PM checks the human run via list(): status is `running`, and the note tells it WHAT to verify.
    const parked = await runners.human.list();
    expect(parked).toHaveLength(1);
    expect(parked[0].note).toContain('an authorized /agent approve'); // the PM learns the condition from the note
    expect(parked[0].status).toBe('running'); // never auto-done

    // The PM verifies the condition itself (here: simulated) and only THEN marks it done — no presumed-done.
    const conditionMet = true; // e.g. it observed the authorized /agent approve
    if (conditionMet) await runners.human.update(appr.id, { status: 'done' });
    expect((await runners.human.get(appr.id))?.status).toBe('done');
    expect(await runners.human.list()).toHaveLength(0); // both flows resolved; nothing left parked
  });
});
