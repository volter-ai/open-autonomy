import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AGENT_BRANCH, DEFAULT_HOLD, disposition, loadHoldLabels, type PR } from './rearm-auto-merge';

const pr = (over: Partial<PR>): PR => ({
  number: 1,
  headRefName: 'agent/issue-5',
  isDraft: false,
  autoMergeRequest: null,
  labels: [],
  ...over,
});

const installWith = (autonomyYml?: string): string => {
  const root = mkdtempSync(join(tmpdir(), 'rearm-'));
  if (autonomyYml !== undefined) {
    mkdirSync(join(root, '.open-autonomy'), { recursive: true });
    writeFileSync(join(root, '.open-autonomy', 'autonomy.yml'), autonomyYml);
  }
  return root;
};

describe('loadHoldLabels — the profile declares the vocabulary', () => {
  test('reads policy.merge.maintainer_block_labels from autonomy.yml', () => {
    const root = installWith(
      'schema: open-autonomy.autonomy.v1\npolicy:\n  merge:\n    maintainer_block_labels:\n      - do-not-merge\n      - agent-blocked\n',
    );
    expect(loadHoldLabels(root)).toEqual(new Set(['do-not-merge', 'agent-blocked']));
  });

  test('missing manifest falls back to the fail-closed default', () => {
    expect(loadHoldLabels(installWith())).toEqual(new Set(DEFAULT_HOLD));
  });

  test('manifest without the key falls back to the fail-closed default', () => {
    const root = installWith('schema: open-autonomy.autonomy.v1\npolicy:\n  autonomy:\n    max_open_agent_prs: 5\n');
    expect(loadHoldLabels(root)).toEqual(new Set(DEFAULT_HOLD));
  });

  test('malformed key (not a string list) falls back rather than failing open', () => {
    const root = installWith('policy:\n  merge:\n    maintainer_block_labels: nope\n');
    expect(loadHoldLabels(root)).toEqual(new Set(DEFAULT_HOLD));
  });
});

describe('disposition — a declared block label holds the PR', () => {
  test('a green agent PR carrying a policy-declared label is held, not re-armed', () => {
    const root = installWith('policy:\n  merge:\n    maintainer_block_labels: [agent-blocked]\n');
    const hold = loadHoldLabels(root);
    expect(disposition(pr({ labels: [{ name: 'agent-blocked' }] }), hold)).toBe('held');
  });

  test('an unlabelled agent PR is armed', () => {
    expect(disposition(pr({}), new Set(DEFAULT_HOLD))).toBe('arm');
  });

  test('drafts and already-armed PRs are ignored', () => {
    expect(disposition(pr({ isDraft: true }), new Set(DEFAULT_HOLD))).toBe('ignore');
    expect(disposition(pr({ autoMergeRequest: {} }), new Set(DEFAULT_HOLD))).toBe('ignore');
  });
});

describe('AGENT_BRANCH — the seam-contract prefix, not a roster', () => {
  test('only agent/ branches are eligible', () => {
    expect(disposition(pr({ headRefName: 'agent/issue-12' }), new Set())).toBe('arm');
    expect(disposition(pr({ headRefName: 'agent/ir-strategist-abc' }), new Set())).toBe('arm');
    expect(disposition(pr({ headRefName: 'feature/x' }), new Set())).toBe('ignore');
  });

  test('the legacy strategist/ prefix is NOT matched (no profile-agent names in the substrate)', () => {
    expect(AGENT_BRANCH.test('strategist/roadmap-123')).toBe(false);
    expect(disposition(pr({ headRefName: 'strategist/roadmap-123' }), new Set())).toBe('ignore');
  });
});
