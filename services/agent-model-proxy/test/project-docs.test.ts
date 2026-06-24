import { describe, expect, test } from 'bun:test';
import { renderRoadmapPanel, parseRoadmap, parseRoadmapStatus, roadmapItemState } from '../src/project-docs.js';

// One YAML item from a flat spec object.
function item(o: Record<string, unknown>): string {
  return `- id: ${o.id}\n` + Object.entries(o).filter(([k]) => k !== 'id').map(([k, v]) => `  ${k}: ${v}`).join('\n');
}
function yml(items: Array<Record<string, unknown>>): string {
  return items.map(item).join('\n');
}
function status(map: Record<string, { total: number; done: number }>): string {
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
    expect(m.get('a')).toEqual({ total: 3, done: 1 });
  });
});

describe('renderRoadmapPanel: Now / Next / Later from derived state', () => {
  test('in-progress leads with a per-item issue tally; queue and shipped fold', () => {
    const items = [
      { id: 'now1', title: 'Now One', phase: '1', planned: true },
      { id: 'park1', title: 'Park One', phase: '2', planned: false },
      { id: 'park2', title: 'Park Two', phase: '3', planned: false },
      { id: 'park3', title: 'Park Three', phase: '4', planned: false },
      { id: 'park4', title: 'Park Four', phase: '5', planned: false },
      { id: 'shipped1', title: 'Shipped One', phase: '6', planned: true },
    ];
    const counts = status({ now1: { total: 5, done: 2 }, shipped1: { total: 3, done: 3 } });
    const html = renderRoadmapPanel(yml(items), 'https://github.com/acme/widget', counts);

    expect(html.includes('In progress')).toBe(true);
    expect(html.includes('2/5 issues')).toBe(true); // derived progress
    expect(html.includes('Up next')).toBe(true);
    expect(html.includes('✓ 1 shipped')).toBe(true);
    // 4 parked, 3 shown under Up next → 1 folds as "more queued"
    expect(html.includes('1 more queued')).toBe(true);
    // An item with linked issues gets a "pop into GitHub" link to its label-filtered issue list.
    expect(html.includes('/issues?q=label%3Aroadmap%3Anow1')).toBe(true);

    // In progress leads; shipped is folded after.
    expect(html.indexOf('In progress')).toBeLessThan(html.indexOf('<details'));
    expect(html.indexOf('Now One')).toBeLessThan(html.indexOf('<details'));
    expect(html.indexOf('Shipped One')).toBeGreaterThan(html.indexOf('<details'));
  });

  test('only proposals (nothing committed) → show Proposed rather than an empty panel', () => {
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
