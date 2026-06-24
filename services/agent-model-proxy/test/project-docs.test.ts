import { describe, expect, test } from 'bun:test';
import { renderRoadmapPanel, parseRoadmap, parseRoadmapStatus, roadmapItemState } from '../src/project-docs.js';

// One YAML item from a flat spec object.
function item(o: Record<string, unknown>): string {
  return `- id: ${o.id}\n` + Object.entries(o).filter(([k]) => k !== 'id').map(([k, v]) => `  ${k}: ${v}`).join('\n');
}
function yml(items: Array<Record<string, unknown>>): string {
  return items.map(item).join('\n');
}
function status(map: Record<string, { total: number; done: number; issues?: Array<{ n: number; t: string; c: boolean }> }>): string {
  return JSON.stringify({ items: map });
}

describe('roadmapItemState: execution status is derived, two-layer', () => {
  test('v2: planned + child issues → in_progress until all closed, then done', () => {
    expect(roadmapItemState({ id: 'a', title: 'A', planned: true }, { total: 5, done: 2 })).toBe('in_progress');
    expect(roadmapItemState({ id: 'a', title: 'A', planned: true }, { total: 5, done: 5 })).toBe('done');
  });
  test('v2: not-yet-decomposed item is parked; a proposal is proposed', () => {
    expect(roadmapItemState({ id: 'a', title: 'A', planned: false })).toBe('parked');
    expect(roadmapItemState({ id: 'a', title: 'A' })).toBe('parked'); // no flags, no legacy status
    expect(roadmapItemState({ id: 'a', title: 'A', proposed: true })).toBe('proposed');
  });
  test('v2: planned but zero issues stays in_progress, never falsely done', () => {
    expect(roadmapItemState({ id: 'a', title: 'A', planned: true }, { total: 0, done: 0 })).toBe('in_progress');
  });
  test('adding an issue to a done item flips it back to in_progress (self-healing)', () => {
    const it = { id: 'a', title: 'A', planned: true };
    expect(roadmapItemState(it, { total: 3, done: 3 })).toBe('done');
    expect(roadmapItemState(it, { total: 4, done: 3 })).toBe('in_progress'); // a 4th issue appeared
  });
  test('legacy back-compat: old stored status renders without v2 flags', () => {
    expect(roadmapItemState({ id: 'a', title: 'A', status: 'active' })).toBe('in_progress');
    expect(roadmapItemState({ id: 'a', title: 'A', status: 'planned' })).toBe('parked');
    expect(roadmapItemState({ id: 'a', title: 'A', status: 'done' })).toBe('done');
    expect(roadmapItemState({ id: 'a', title: 'A', status: 'proposed' })).toBe('proposed');
  });
});

describe('parseRoadmap / parseRoadmapStatus', () => {
  test('parses v2 boolean flags', () => {
    const items = parseRoadmap(yml([{ id: 'a', title: 'A', planned: true }, { id: 'b', title: 'B', proposed: true }]));
    expect(items[0].planned).toBe(true);
    expect(items[1].proposed).toBe(true);
  });
  test('tolerates a missing/garbage status cache', () => {
    expect(parseRoadmapStatus(undefined).size).toBe(0);
    expect(parseRoadmapStatus('not json').size).toBe(0);
    const m = parseRoadmapStatus(status({ a: { total: 3, done: 1 } }));
    expect(m.get('a')?.total).toBe(3);
    expect(m.get('a')?.done).toBe(1);
  });
  test('parses the per-item child-issue list (number / title / closed)', () => {
    const m = parseRoadmapStatus(status({ a: { total: 2, done: 1, issues: [{ n: 12, t: 'Do thing', c: true }, { n: 13, t: 'Other', c: false }] } }));
    expect(m.get('a')?.issues).toEqual([{ n: 12, t: 'Do thing', c: true }, { n: 13, t: 'Other', c: false }]);
  });
});

describe('renderRoadmapPanel: roadmap-above-issues tree', () => {
  test('a decomposed item expands into its actual child issues; in-progress leads, shipped folds', () => {
    const items = [
      { id: 'now1', title: 'Now One', phase: '1', planned: true },
      { id: 'park1', title: 'Park One', phase: '2', planned: false },
      { id: 'shipped1', title: 'Shipped One', phase: '6', planned: true },
    ];
    const counts = status({
      now1: { total: 9, done: 2, issues: [{ n: 128, t: 'Gate merges on verdict', c: true }, { n: 140, t: 'Reviewer requests changes', c: false }] },
      shipped1: { total: 3, done: 3 },
    });
    const html = renderRoadmapPanel(yml(items), 'https://github.com/acme/widget', counts);

    // The item carries its derived rollup tally...
    expect(html.includes('2/9')).toBe(true);
    // ...and expands into its real child issues, each linking to itself on GitHub.
    expect(html.includes('Gate merges on verdict')).toBe(true);
    expect(html.includes('/issues/128')).toBe(true);
    expect(html.includes('#140')).toBe(true);
    // 9 total but only 2 issues in the synced slice → "+7 more on GitHub" link to the label-filtered list.
    expect(html.includes('+7 more on GitHub')).toBe(true);
    expect(html.includes('/issues?q=label%3Aroadmap%3Anow1')).toBe(true);
    // Grouped: In progress leads, shipped is the archival fold below.
    expect(html.includes('In progress')).toBe(true);
    expect(html.includes('✓ 1 shipped')).toBe(true);
    expect(html.indexOf('Now One')).toBeLessThan(html.indexOf('✓ 1 shipped'));
  });

  test('an in-flight item with no synced issue slice still links out to GitHub', () => {
    const items = [{ id: 'a', title: 'Epic A', planned: true }];
    const html = renderRoadmapPanel(yml(items), 'https://github.com/acme/widget', status({ a: { total: 4, done: 1 } }));
    expect(html.includes('1/4')).toBe(true);
    expect(html.includes('View 4 issues on GitHub')).toBe(true);
  });

  test('a not-yet-decomposed item is a flat, unexpandable row (no <details>)', () => {
    const items = [{ id: 'q', title: 'Queued Q', planned: false }];
    const html = renderRoadmapPanel(yml(items), 'https://github.com/acme/widget');
    expect(html.includes('Queued Q')).toBe(true);
    expect(html.includes('rm-epic flat')).toBe(true);
    expect(html.includes('queued')).toBe(true);
    expect(html.includes('<details')).toBe(false);
  });

  test('only proposals (nothing committed) → shown as a Proposed group, not folded away', () => {
    const items = [
      { id: 'p1', title: 'Prop One', proposed: true },
      { id: 'p2', title: 'Prop Two', proposed: true },
    ];
    const html = renderRoadmapPanel(yml(items), undefined);
    expect(html.includes('Proposed')).toBe(true);
    expect(html.includes('Prop One')).toBe(true);
  });

  test('momentum counts in-progress / queued / shipped (proposals excluded)', () => {
    const items = [
      { id: 'a', title: 'A', planned: true },
      { id: 'b', title: 'B', planned: false },
      { id: 'c', title: 'C', planned: true },
      { id: 'd', title: 'D', proposed: true },
    ];
    const html = renderRoadmapPanel(yml(items), undefined, status({ a: { total: 2, done: 1 }, c: { total: 2, done: 2 } }));
    expect(html.includes('<b>1</b> in progress')).toBe(true);
    expect(html.includes('<b>1</b> queued')).toBe(true);
    expect(html.includes('<b>1</b> shipped')).toBe(true);
  });

  test('legacy roadmap (stored status, no counts) still renders sensibly', () => {
    const items = [
      { id: 'a', title: 'Active A', status: 'active' },
      { id: 'b', title: 'Planned B', status: 'planned' },
      { id: 'c', title: 'Done C', status: 'done' },
    ];
    const html = renderRoadmapPanel(yml(items), undefined);
    expect(html.includes('In progress')).toBe(true);
    expect(html.includes('Active A')).toBe(true);
    expect(html.includes('✓ 1 shipped')).toBe(true);
  });
});
