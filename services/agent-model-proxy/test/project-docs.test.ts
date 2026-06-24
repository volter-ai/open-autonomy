import { describe, expect, test } from 'bun:test';
import { renderRoadmapPanel, parseRoadmap } from '../src/project-docs.js';

// Build a roadmap.yml with one item per status; item i gets phase i+1 and statuses[i].
function roadmapYml(statuses: string[]): string {
  return statuses
    .map((status, i) => `- id: item-${i}\n  title: Item ${i}\n  phase: ${i + 1}\n  status: ${status}`)
    .join('\n');
}

describe('roadmap: Now / Next / Later centers on current work', () => {
  test('leads with In progress, then Up next, and folds the Later backlog', () => {
    // 7 active (phases 1-7) + 9 planned (phases 8-16), like the testbed.
    const yml = roadmapYml([...Array(7).fill('active'), ...Array(9).fill('planned')]);
    const html = renderRoadmapPanel(yml, 'https://github.com/acme/widget');

    expect(html.includes('In progress')).toBe(true);
    expect(html.includes('Up next')).toBe(true);
    // 9 planned − 3 shown under "Up next" = 6 folded into "later".
    expect(html.includes('<details class="rm-fold"')).toBe(true);
    expect(html.includes('6 later')).toBe(true);

    // "In progress" leads the visible list; the folded backlog comes after the <details>.
    const ip = html.indexOf('In progress');
    const un = html.indexOf('Up next');
    const fold = html.indexOf('<details');
    expect(ip).toBeGreaterThan(-1);
    expect(ip).toBeLessThan(un); // In progress before Up next
    expect(un).toBeLessThan(fold); // both sections before the folded tail

    // An active item is visible; the last planned item is inside the fold.
    expect(html.indexOf('Item 0')).toBeLessThan(fold); // active → In progress
    expect(html.indexOf('Item 15')).toBeGreaterThan(fold); // far planned → later

    // Phase context is preserved as item meta.
    expect(html.includes('Phase 1')).toBe(true);
  });

  test('a not-yet-started roadmap (nothing in progress) surfaces the plan, not an empty panel', () => {
    const yml = roadmapYml(Array(10).fill('planned'));
    const html = renderRoadmapPanel(yml, undefined);
    expect(html.includes('In progress')).toBe(false); // nothing active
    expect(html.includes('Up next')).toBe(true);
    expect(html.includes('Item 0')).toBe(true); // plan is visible
    // 10 planned − 5 shown (the wider next window when idle) = 5 folded.
    expect(html.includes('5 later')).toBe(true);
  });

  test('shipped history folds behind a checked summary when work is in flight', () => {
    const yml = roadmapYml([...Array(2).fill('active'), ...Array(10).fill('done')]);
    const html = renderRoadmapPanel(yml, undefined);
    expect(html.includes('✓ 10 shipped')).toBe(true);
    const fold = html.indexOf('<details');
    expect(html.indexOf('Item 0')).toBeLessThan(fold); // active stays visible
  });

  test('an all-shipped roadmap shows the shipped set rather than hiding everything', () => {
    const yml = roadmapYml(Array(9).fill('done'));
    const html = renderRoadmapPanel(yml, undefined);
    expect(html.includes('Shipped')).toBe(true);
    expect(html.includes('Item 0')).toBe(true);
    expect(html.includes('<details')).toBe(false); // nothing to fold
  });

  test('a short roadmap renders inline with no folds', () => {
    const yml = roadmapYml(['active', 'planned', 'planned']);
    const html = renderRoadmapPanel(yml, undefined);
    expect(html.includes('In progress')).toBe(true);
    expect(html.includes('Up next')).toBe(true);
    expect(html.includes('<details')).toBe(false);
    expect(html.includes('Item 2')).toBe(true);
  });

  test('parseRoadmap still reads every item regardless of length', () => {
    expect(parseRoadmap(roadmapYml(Array(16).fill('planned'))).length).toBe(16);
  });
});
