import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SEAM_CONTRACT_LABELS, expectedLabels } from './open-autonomy-preflight';

const installWith = (manifestYml?: string): string => {
  const dir = mkdtempSync(join(tmpdir(), 'preflight-labels-'));
  if (manifestYml !== undefined) {
    mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
    writeFileSync(join(dir, '.open-autonomy', 'autonomy.yml'), manifestYml);
  }
  return dir;
};

describe('expectedLabels — contract constants + the declared policy, never a hand-kept list', () => {
  test('the manifest is the tunable half: block labels + planner origin/priority labels join the contract set', () => {
    const dir = installWith(
      [
        'policy:',
        '  merge:',
        '    maintainer_block_labels: [do-not-merge, my-org-hold]',
        '  planner:',
        '    issue_origin_label_prefix: "src:"',
        '    priority_labels: { high: prio:high }',
        '',
      ].join('\n'),
    );
    const labels = expectedLabels(dir);
    for (const l of SEAM_CONTRACT_LABELS) expect(labels).toContain(l);
    for (const l of ['do-not-merge', 'my-org-hold', 'src:roadmap-planner', 'prio:high']) expect(labels).toContain(l);
  });

  test('no manifest → the contract constants alone (the missing manifest has its own check)', () => {
    expect(expectedLabels(installWith())).toEqual(SEAM_CONTRACT_LABELS);
  });

  test('duplicates collapse: a contract label also declared as a block label appears once', () => {
    const dir = installWith('policy:\n  merge:\n    maintainer_block_labels: [human-required, agent-paused]\n');
    const labels = expectedLabels(dir);
    expect(labels.filter((l) => l === 'human-required')).toHaveLength(1);
  });

  test('the REAL dogfood install: the seeded set covers the declared hold vocabulary and planner labels', () => {
    // Not a fixture — this reads the repo's compiled .open-autonomy/autonomy.yml, so the preflight seed
    // list can never again drift from the declared policy (it used to be a fifth hand-kept copy).
    const labels = expectedLabels('.');
    for (const l of [
      ...SEAM_CONTRACT_LABELS,
      'do-not-merge',
      'agent-maintainer-hold',
      'origin:roadmap-planner',
      'priority:high',
    ]) {
      expect(labels).toContain(l);
    }
  });
});
