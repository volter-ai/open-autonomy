import { describe, expect, test } from 'bun:test';
import { type HumanTask, type Job, blocks, counts, escalatable, jobMode } from './job';

describe('job lifecycle — completion (not start) decides verified vs notification', () => {
  test('a job WITH completion is verified: blocks, counts, escalatable', () => {
    const j: Job = { start: { notify: 'active' }, completion: { ac: 'merged', check: 'deterministic' } };
    expect(jobMode(j)).toBe('verified');
    expect(blocks(j)).toBe(true);
    expect(counts(j)).toBe(true);
    expect(escalatable(j)).toBe(true);
  });

  test('a job WITHOUT completion is a notification: non-blocking, uncounted, nothing to escalate', () => {
    for (const j of [{ start: { notify: 'passive' } } as Job, {} as Job]) {
      expect(jobMode(j)).toBe('notification');
      expect(blocks(j)).toBe(false);
      expect(counts(j)).toBe(false);
      expect(escalatable(j)).toBe(false);
    }
  });

  test('start does not determine mode — only completion does', () => {
    expect(jobMode({ start: { notify: 'active' } })).toBe('notification'); // notify, but no way to know it is done
    expect(jobMode({ completion: { ac: 'x', check: 'judge' } })).toBe('verified'); // no notify (pull/implicit), still verified
  });
});

describe('HumanTask — the documented, assignable unit', () => {
  test('a verified human task: documented (ask), assignable (assignTo), and blocking', () => {
    const review: HumanTask = {
      ask: 'Review the risky change and approve or reject.',
      assignTo: 'maintainers',
      start: { notify: 'active' },
      completion: { ac: 'an authorized approval bound to the reviewed SHA', check: 'both' },
    };
    expect(review.ask).toBeTruthy(); // documented "so we know"
    expect(review.assignTo).toBe('maintainers'); // a unit to assign
    expect(jobMode(review)).toBe('verified');
    expect(blocks(review)).toBe(true);
  });

  test('a notify-only human task is fire-and-forget — not counted, never blocks', () => {
    const fyi: HumanTask = { ask: 'FYI: the weekly report is ready.', start: { notify: 'passive' } };
    expect(jobMode(fyi)).toBe('notification');
    expect(blocks(fyi)).toBe(false);
    expect(counts(fyi)).toBe(false);
  });
});
