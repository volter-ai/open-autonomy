import { describe, expect, test } from 'bun:test';
import { parseStrategyVerdict, renderStrategyReviewPrompt } from './public-agent-strategy-review.js';
import { assertOnlyRoadmapProposal, promoteProposedToPlanned } from './public-agent-strategy-ratify.js';

describe('strategy review verdict', () => {
  test('parses a valid pass verdict', () => {
    const verdict = parseStrategyVerdict('{"verdict":"pass","human_required":false,"summary":"ok","findings":[]}');
    expect(verdict.verdict).toBe('pass');
    expect(verdict.human_required).toBe(false);
  });

  test('strips fences and parses fail', () => {
    const verdict = parseStrategyVerdict('```json\n{"verdict":"fail","human_required":true,"summary":"no","findings":["x"]}\n```');
    expect(verdict.verdict).toBe('fail');
    expect(verdict.human_required).toBe(true);
  });

  test('rejects an invalid verdict', () => {
    expect(() => parseStrategyVerdict('{"verdict":"maybe","human_required":false,"summary":"s","findings":[]}')).toThrow('invalid verdict');
  });

  test('prompt demands governance is human-required and treats proposal as untrusted', () => {
    const prompt = renderStrategyReviewPrompt('diff', 'proposal', 'rubric', 'constitution');
    expect(prompt).toContain('human_required true if the proposal edits any governance file');
    expect(prompt).toContain('untrusted');
  });
});

describe('strategy ratify guard', () => {
  test('allows a roadmap-and-archive-only proposal', () => {
    expect(() => assertOnlyRoadmapProposal(['.open-autonomy/roadmap.yml', '.open-autonomy/strategist-archive.json'])).not.toThrow();
  });

  test('blocks a proposal that edits the constitution', () => {
    expect(() => assertOnlyRoadmapProposal(['.open-autonomy/roadmap.yml', 'docs/CONSTITUTION.md'])).toThrow('governance file');
  });

  test('blocks a proposal that edits a workflow', () => {
    expect(() => assertOnlyRoadmapProposal(['.github/workflows/public-agent.yml'])).toThrow('governance file');
  });

  test('blocks a proposal that edits unrelated code', () => {
    expect(() => assertOnlyRoadmapProposal(['.open-autonomy/roadmap.yml', 'scripts/public-agent-pm.ts'])).toThrow('only edit the roadmap');
  });
});

describe('strategy ratify promotion', () => {
  test('promotes proposed items to planned on ratification', () => {
    const roadmap = [
      'items:',
      '  - id: a',
      '    status: active',
      '  - id: b',
      '    status: proposed',
      '  - id: c',
      '    status: proposed',
    ].join('\n');
    const { text, promoted } = promoteProposedToPlanned(roadmap);
    expect(promoted).toBe(2);
    expect(text).toContain('  - id: b\n    status: planned');
    expect(text).not.toContain('status: proposed');
    expect(text).toContain('  - id: a\n    status: active');
  });
});
