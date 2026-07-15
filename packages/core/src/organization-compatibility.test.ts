import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { runCompatibility } from '../../../scripts/run-r4-compatibility';

describe('R4 independent compatibility', () => {
  test('locked corpus has no untriaged differential result', async () => {
    const report = await runCompatibility(false);
    expect(report.cases.length).toBeGreaterThanOrEqual(8);
    expect(report.untriaged).toEqual([]);
    expect(report.cases.every((item: any) => item.status === 'match')).toBe(true);
  });
  test('clean-room canonical edge vectors pass independently', () => {
    const run = spawnSync('python3', ['-m','unittest','discover','-s','independent/python','-p','test_*.py'], { encoding:'utf8', timeout:5_000 });
    expect(run.status).toBe(0);
  });
  test('records constrained clean-room exposure and author feedback', async () => {
    const exposure = await readFile('docs/compatibility/EXPOSURE-RECORD.md','utf8');
    expect(exposure).toContain('No TypeScript implementation');
    expect(await readFile('docs/compatibility/clean-room-author-feedback.md','utf8')).toContain('Specification feedback');
  });
});
