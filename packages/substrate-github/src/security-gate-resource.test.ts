import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

const ROOT = '.github/workflows/security-gate.yml';
const PROFILE_COPIES = [
  'profiles/simple-gh-sdlc/.github/workflows/security-gate.yml',
  'profiles/self-driving/.github/workflows/security-gate.yml',
];
const DISPATCHED_CHECKS = [
  { path: ROOT, event: 'open-autonomy-security-gate' },
  { path: 'profiles/soc2-baseline/.github/workflows/supply-chain.yml', event: 'open-autonomy-supply-chain' },
  { path: 'profiles/soc2-baseline/.github/workflows/code-scan.yml', event: 'open-autonomy-code-scan' },
  { path: 'profiles/soc2-baseline/.github/workflows/secret-scan.yml', event: 'open-autonomy-secret-scan' },
  { path: 'profiles/soc2-baseline/.github/workflows/codeql-gate.yml', event: 'open-autonomy-codeql-gate' },
];

type Workflow = {
  on?: { repository_dispatch?: { types?: string[] }; workflow_dispatch?: unknown };
  permissions?: Record<string, string>;
  jobs: Record<string, { permissions?: Record<string, string>; steps?: unknown[] }>;
};

const source = readFileSync(ROOT, 'utf8');
const workflow = parseYaml(source) as Workflow;
const jobText = (name: string) => JSON.stringify(workflow.jobs[name]);

describe('dispatched security gate trust boundary', () => {
  test('the installed and profile-owned resources are byte-identical', () => {
    for (const path of PROFILE_COPIES) expect(readFileSync(path, 'utf8')).toBe(source);
  });

  test('candidate analysis has no status credential and retains no checkout credential', () => {
    expect(workflow.on?.repository_dispatch?.types).toEqual(['open-autonomy-security-gate']);
    expect(workflow.on?.workflow_dispatch).toBeUndefined();
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(workflow.jobs.scan?.permissions).toEqual({ contents: 'read' });

    const scan = jobText('scan');
    expect(scan).not.toContain('statuses');
    expect(scan).not.toContain('github.token');
    expect(scan).not.toContain('GH_TOKEN');
    expect(scan).not.toContain('gh api');
    expect(scan).toContain('"path":"candidate"');
    expect(scan).toContain('"path":"trusted"');
    expect(scan.match(/"persist-credentials":false/g)).toHaveLength(2);
  });

  test('every profile-declared status gate is pinned to a default-branch repository_dispatch handler', () => {
    for (const { path, event } of DISPATCHED_CHECKS) {
      const parsed = parseYaml(readFileSync(path, 'utf8')) as Workflow;
      expect(parsed.on?.repository_dispatch?.types).toEqual([event]);
      expect(parsed.on?.workflow_dispatch).toBeUndefined();

      for (const [name, job] of Object.entries(parsed.jobs)) {
        const text = JSON.stringify(job);
        if (job.permissions?.statuses === 'write') {
          expect(name).toMatch(/^publish-/);
          expect(text).not.toContain('actions/checkout');
          expect(text).not.toContain('candidate');
          expect(text).toContain('pulls/$PR');
          expect(text).toContain('test \\"$actual\\" = \\"$SHA\\"');
          expect(text.indexOf('pulls/$PR')).toBeLessThan(text.indexOf('statuses/$SHA'));
          expect(text.indexOf('test \\"$actual\\" = \\"$SHA\\"')).toBeLessThan(text.indexOf('statuses/$SHA'));
          if (name === 'publish-result') {
            expect(text).toMatch(/"[A-Z_]+_RESULT":"\$\{\{ needs\.[a-z-]+\.result \}\}"/);
            expect(text.includes('state=failure') || text.includes('-f state=failure')).toBe(true);
          }
        }
        if (text.includes('github.event.client_payload.sha') && text.includes('actions/checkout')) {
          expect(job.permissions?.statuses).not.toBe('write');
          expect(text).toContain('"persist-credentials":false');
        }
      }
    }
  });

  test('candidate lifecycle hooks and candidate analyzer code cannot run', () => {
    const scan = jobText('scan');
    expect(scan).not.toContain('bun install');
    expect(scan).not.toContain('candidate/scripts/check-supply-chain.ts');
    expect(scan).toContain('bun ../trusted/scripts/check-supply-chain.ts');
    expect(scan).toContain('--config ../trusted/.github/zizmor.yml .github/workflows/');
    expect(source).not.toContain('bun install');
  });

  test('only non-candidate publisher jobs can write status, bound before and after scanning', () => {
    for (const name of ['publish-pending', 'publish-result']) {
      expect(workflow.jobs[name]?.permissions?.statuses).toBe('write');
      const publisher = jobText(name);
      expect(publisher).not.toContain('actions/checkout');
      expect(publisher).not.toContain('candidate');
      expect(publisher).not.toContain('check-supply-chain');
      expect(publisher).toContain('pulls/$PR');
      expect(publisher).toContain('test \\"$actual\\" = \\"$SHA\\"');
      expect(publisher.indexOf('pulls/$PR')).toBeLessThan(publisher.indexOf('statuses/$SHA'));
      expect(publisher.indexOf('test \"$actual\" = \"$SHA\"')).toBeLessThan(publisher.indexOf('statuses/$SHA'));
    }

    const finalizer = jobText('publish-result');
    expect(finalizer).toContain('"SCAN_RESULT":"${{ needs.scan.result }}"');
    expect(finalizer).not.toContain('steps.scan.outputs');
    expect(source).not.toContain('github.event.inputs');
  });
});
