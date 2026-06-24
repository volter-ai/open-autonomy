import { expect, test } from 'bun:test';
import { rollupRoadmapStatus, type RawRoadmapIssue } from '../src/github-sync.js';

function rollup(issues: RawRoadmapIssue[]) {
  return JSON.parse(rollupRoadmapStatus(issues)).items as Record<string, { total: number; done: number; issues: Array<{ n: number; t: string; c: boolean }> }>;
}

test('buckets issues by their roadmap:<id> label with open/closed counts', () => {
  const items = rollup([
    { number: 1, title: 'A', state: 'open', labels: [{ name: 'roadmap:alpha' }] },
    { number: 2, title: 'B', state: 'closed', labels: [{ name: 'roadmap:alpha' }] },
    { number: 3, title: 'C', state: 'open', labels: [{ name: 'roadmap:beta' }] },
  ]);
  expect(items.alpha).toEqual({ total: 2, done: 1, issues: [
    { n: 1, t: 'A', c: false }, // open sorts before closed
    { n: 2, t: 'B', c: true },
  ] });
  expect(items.beta).toEqual({ total: 1, done: 0, issues: [{ n: 3, t: 'C', c: false }] });
});

test('skips legacy roadmap:phase-N labels — no phantom bucket strands an item', () => {
  // An issue carrying BOTH its item label and a legacy phase label must count only under the item.
  const items = rollup([
    { number: 4, title: 'has both', state: 'open', labels: [{ name: 'roadmap:phase-1' }, { name: 'roadmap:durable-decision-memory' }] },
    // An issue carrying ONLY a phase label contributes to NOTHING (it can't be displayed against any item).
    { number: 5, title: 'phase only', state: 'open', labels: [{ name: 'roadmap:phase-10' }] },
  ]);
  expect(items['phase-1'] === undefined).toBe(true);
  expect(items['phase-10'] === undefined).toBe(true);
  expect(items['durable-decision-memory']).toEqual({ total: 1, done: 0, issues: [{ n: 4, t: 'has both', c: false }] });
});

test('skips pull requests returned by the issues endpoint', () => {
  const items = rollup([
    { number: 6, title: 'a PR', state: 'open', pull_request: {}, labels: [{ name: 'roadmap:alpha' }] },
    { number: 7, title: 'real issue', state: 'open', labels: [{ name: 'roadmap:alpha' }] },
  ]);
  expect(items.alpha.total).toBe(1);
  expect(items.alpha.issues).toEqual([{ n: 7, t: 'real issue', c: false }]);
});

test('a non-phase id that merely starts with "phase" is NOT skipped', () => {
  // The guard is anchored (`^phase-\\d+$`), so a real item id like "phased-rollout" must survive.
  const items = rollup([{ number: 8, title: 'X', state: 'open', labels: [{ name: 'roadmap:phased-rollout' }] }]);
  expect(items['phased-rollout']?.total).toBe(1);
});

test('bounds the per-item issue slice but keeps full total/done counts', () => {
  const many: RawRoadmapIssue[] = Array.from({ length: 12 }, (_, i) => ({
    number: i + 1, title: `i${i}`, state: i < 5 ? 'closed' : 'open', labels: [{ name: 'roadmap:big' }],
  }));
  const items = rollup(many);
  expect(items.big.total).toBe(12); // full count preserved
  expect(items.big.done).toBe(5);
  expect(items.big.issues.length).toBe(8); // ROADMAP_ISSUES_PER_ITEM cap
});
