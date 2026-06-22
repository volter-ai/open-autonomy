import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { HumanRunner, type Runner, type Session } from './runner';

const statePath = () => join(mkdtempSync(join(tmpdir(), 'human-runner-')), 'sessions.json');

describe('HumanRunner — the human realization of the Runner contract', () => {
  test('it is a Runner (same interface as the agent realizations)', () => {
    const r: Runner = new HumanRunner(statePath()); // type-level: conforms to the unified contract
    expect(typeof r.launch).toBe('function');
    expect(typeof r.list).toBe('function');
    expect(typeof r.cancel).toBe('function');
  });

  test('launch engages + parks the action; it never auto-completes', () => {
    const r = new HumanRunner(statePath());
    const s = r.launch('maintainer', { ask: 'approve the change', completion: '/agent approve' });
    expect(s.agent).toBe('maintainer');
    expect(s.status).toBe('running'); // parked, not done
    expect(s.params).toEqual({ ask: 'approve the change', completion: '/agent approve' }); // opaque ask rides through
    // re-reading keeps it running — a no-op human runner can never confirm completion on its own
    expect(r.list().map((x) => x.id)).toContain(s.id);
    expect(r.get(s.id)?.status).toBe('running');
  });

  test('the only path to done is an external authorized resolution (update), never the runner itself', () => {
    const path = statePath();
    const r = new HumanRunner(path);
    const s = r.launch('maintainer', {});
    expect(r.update(s.id, { status: 'done' })).toBe(true); // the verified act, applied by the orchestrator
    expect(r.get(s.id)?.status).toBe('done');
    expect(r.list()).toHaveLength(0); // no longer in flight
  });

  test('cancel retracts the ask; an engage backend is invoked (black box)', () => {
    const engaged: Session[] = [];
    const r = new HumanRunner(statePath(), (s) => engaged.push(s)); // a black-box backend (e.g. Slack)
    const s = r.launch('requester', { ask: 'need a repro' });
    expect(engaged).toHaveLength(1); // the backend was handed the action
    expect(r.cancel(s.id)).toBe(true);
    expect(r.get(s.id)?.status).toBe('cancelled');
  });
});
