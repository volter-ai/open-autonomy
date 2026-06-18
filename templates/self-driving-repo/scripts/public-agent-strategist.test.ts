import { describe, expect, test } from 'bun:test';
import { parseRoadmapItems } from './public-agent-planner.js';
import {
  dedupeProposedItems,
  mergeIdeaArchive,
  parseStrategistProposal,
  renderRoadmapWithProposals,
  renderStrategistPrompt,
  seenRoadmapIds,
  type ProposedItem,
} from './public-agent-strategist.js';

const validJson = JSON.stringify({
  summary: 'Two candidates from research.',
  items: [
    {
      title: 'Streaming session logs',
      priority: 'high',
      acceptance: ['Operators can tail a running agent session.'],
      rationale: 'Users repeatedly ask to watch runs live.',
      sources: ['https://github.com/example/repo/issues/12'],
      falsified_if: 'No user has requested live logs in 90 days.',
      direction: 'customer-demand',
    },
  ],
});

function item(overrides: Partial<ProposedItem> = {}): ProposedItem {
  return {
    id: 'streaming-session-logs',
    title: 'Streaming session logs',
    priority: 'high',
    proof_gate: 'streaming-session-logs-proof',
    acceptance: ['Operators can tail a running agent session.'],
    rationale: 'r',
    sources: ['s'],
    falsified_if: 'f',
    direction: 'customer-demand',
    ...overrides,
  };
}

describe('strategist proposal parsing', () => {
  test('parses a valid proposal and derives id + proof gate', () => {
    const proposal = parseStrategistProposal(validJson);
    expect(proposal.items).toHaveLength(1);
    expect(proposal.items[0]?.id).toBe('streaming-session-logs');
    expect(proposal.items[0]?.proof_gate).toBe('streaming-session-logs-proof');
    expect(proposal.items[0]?.priority).toBe('high');
  });

  test('strips code fences', () => {
    expect(() => parseStrategistProposal('```json\n' + validJson + '\n```')).not.toThrow();
  });

  test('greenfield-tolerant: defaults a missing source to north-star decomposition', () => {
    const greenfield = JSON.parse(validJson);
    greenfield.items[0].sources = [];
    delete greenfield.items[0].falsified_if;
    greenfield.items[0].direction = 'vibes';
    const proposal = parseStrategistProposal(JSON.stringify(greenfield));
    expect(proposal.items[0]?.sources).toEqual(['constitution: north-star decomposition']);
    expect(proposal.items[0]?.falsified_if).toContain('No user need');
    expect(proposal.items[0]?.direction).toBe('customer-demand');
  });

  test('skips items missing the essentials (title or acceptance) but keeps the rest', () => {
    const mixed = {
      summary: 's',
      items: [
        { title: 'no acceptance' },
        { acceptance: ['has no title'] },
        { title: 'good', acceptance: ['does a thing'], sources: ['x'], falsified_if: 'y', direction: 'competitor-gap' },
      ],
    };
    const proposal = parseStrategistProposal(JSON.stringify(mixed));
    expect(proposal.items).toHaveLength(1);
    expect(proposal.items[0]?.title).toBe('good');
  });
});

describe('strategist dedup and recall', () => {
  test('drops items already seen and caps at maxItems', () => {
    const items = [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })];
    const kept = dedupeProposedItems(items, new Set(['b']), 1);
    expect(kept.map((i) => i.id)).toEqual(['a']);
  });

  test('seenRoadmapIds gathers roadmap, prior-proposal, and archive ids', () => {
    const roadmap = 'items:\n  - id: existing-item\n    phase: 1\n    priority: high\n    status: active\n    title: X\n    proof_gate: g\n    acceptance:\n      - a\n';
    const prior = 'This PR adds roadmap:prior-item for review.';
    const archive = JSON.stringify({ candidates: [{ id: 'archived-item' }] });
    const ids = seenRoadmapIds(roadmap, prior, archive);
    expect(ids.has('existing-item')).toBe(true);
    expect(ids.has('prior-item')).toBe(true);
    expect(ids.has('archived-item')).toBe(true);
  });
});

describe('strategist roadmap rendering', () => {
  test('appends proposed items that parse back as roadmap items with status proposed', () => {
    const roadmap = 'schema: open-autonomy.roadmap.v1\nitems:\n  - id: existing\n    phase: 1\n    priority: high\n    status: active\n    title: Existing\n    proof_gate: g\n    acceptance:\n      - a\n';
    const out = renderRoadmapWithProposals(roadmap, [item({ id: 'new-thing', title: 'New Thing' })]);
    const parsed = parseRoadmapItems(out);
    const added = parsed.find((p) => p.id === 'new-thing');
    expect(added?.status).toBe('proposed');
    expect(added?.phase).toBe(2);
    expect(parsed).toHaveLength(2);
  });

  test('no items leaves roadmap unchanged', () => {
    const roadmap = 'items:\n  - id: x\n    phase: 1\n    priority: low\n    status: active\n    title: X\n    proof_gate: g\n    acceptance:\n      - a\n';
    expect(renderRoadmapWithProposals(roadmap, [])).toBe(roadmap);
  });
});

describe('idea archive', () => {
  test('accrues signals and marks proposed candidates', () => {
    const archive = JSON.stringify({ schema: 'open-autonomy.strategist-archive.v1', candidates: [{ id: 'old', title: 'Old', status: 'open' }] });
    const merged = mergeIdeaArchive(
      archive,
      [{ id: 'signal-1', title: 'Signal One', direction: 'competitor-gap', source: 'url' }],
      [item({ id: 'new-thing' })],
    );
    const ids = merged.candidates.map((c) => c.id);
    expect(ids).toContain('old');
    expect(ids).toContain('signal-1');
    expect(merged.candidates.find((c) => c.id === 'new-thing')?.status).toBe('proposed');
  });
});

describe('strategist prompt', () => {
  test('forbids editing governance and demands recall + citations', () => {
    const prompt = renderStrategistPrompt('roadmap', 'constitution', '', 'signals', 3);
    expect(prompt).toContain('recall over precision');
    expect(prompt).toContain('Do NOT propose changes to the constitution');
    expect(prompt).toContain('untrusted');
  });
});
