import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deadKeys, leafParams } from './check-policy-consumers';

const profileWith = (irYml: string, skills: Record<string, string> = {}): string => {
  const dir = mkdtempSync(join(tmpdir(), 'policy-consumers-'));
  writeFileSync(join(dir, 'ir.yml'), irYml);
  for (const [name, body] of Object.entries(skills)) {
    mkdirSync(join(dir, 'skills', name), { recursive: true });
    writeFileSync(join(dir, 'skills', name, 'SKILL.md'), body);
  }
  return dir;
};

describe('leafParams — one parameter per section key', () => {
  test('depth-2 keys, map values are one parameter', () => {
    expect(
      leafParams({
        autonomy: { max_open_agent_prs: 5 },
        planner: { priority_labels: { high: 'priority:high' } },
      }),
    ).toEqual(['autonomy.max_open_agent_prs', 'planner.priority_labels']);
  });
});

describe('deadKeys — a declared key must have a read site', () => {
  test('the audited dead-keys state would have failed', () => {
    // The historical §2 state: keys nothing read — no engine reader, no skill instruction.
    const dir = profileWith(
      [
        'version: 1',
        'policy:',
        '  box:',
        '    autonomy:',
        '      max_ci_retries: 2',
        '      require_visible_pm_status: true',
        '    planner:',
        '      enabled: true',
        '',
      ].join('\n'),
      { pm: '# pm\nTriage issues and dispatch work.\n' },
    );
    expect(deadKeys(dir, 'engine corpus without those tokens')).toEqual([
      'autonomy.max_ci_retries',
      'autonomy.require_visible_pm_status',
      'planner.enabled',
    ]);
  });

  test('a skill read-instruction is a reader (agent-at-runtime channel)', () => {
    const dir = profileWith(
      'policy:\n  box:\n    autonomy:\n      max_develop_attempts: 2\n',
      { pm: 'Relaunch at most `max_develop_attempts` times (read .open-autonomy/autonomy.yml).\n' },
    );
    expect(deadKeys(dir, '')).toEqual([]);
  });

  test('engine/runtime code is a reader (deterministic channel)', () => {
    const dir = profileWith('policy:\n  box:\n    merge:\n      maintainer_block_labels: [do-not-merge]\n');
    expect(deadKeys(dir, "const labels = manifest.policy?.merge?.maintainer_block_labels;")).toEqual([]);
  });

  test('the declaration itself (ir.yml) is not a reader', () => {
    const dir = profileWith('policy:\n  box:\n    autonomy:\n      frobnicate_quux: 1\n');
    expect(deadKeys(dir, '')).toEqual(['autonomy.frobnicate_quux']);
  });

  test('an empty box passes trivially', () => {
    const dir = profileWith('policy:\n  box: {}\n');
    expect(deadKeys(dir, '')).toEqual([]);
  });
});
