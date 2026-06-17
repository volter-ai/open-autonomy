import { describe, expect, test } from 'bun:test';
import {
  formatReport,
  missingSecrets,
  parseManifest,
  planLabels,
  planVariables,
} from './provision-target-repo.js';

const MANIFEST = JSON.stringify({
  private: true,
  required_secrets: ['MODEL_PROXY_ADMIN_TOKEN'],
  variables: [
    { name: 'MODEL_PROXY_URL', value: 'https://proxy.example' },
    { name: 'PUBLIC_AGENT_REPO_PAUSED', value: 'false' },
  ],
  labels: [{ name: 'needs-info' }, { name: 'human-required' }],
  branch_protection: { branch: 'main', required_checks: ['ci'] },
});

describe('provision-target-repo manifest', () => {
  test('parses a valid manifest and rejects malformed variables', () => {
    const manifest = parseManifest(MANIFEST);
    expect(manifest.variables).toHaveLength(2);
    expect(manifest.required_secrets).toContain('MODEL_PROXY_ADMIN_TOKEN');
    expect(() => parseManifest(JSON.stringify({ variables: [{ name: 'X' }], labels: [] }))).toThrow();
  });
});

describe('provision-target-repo planning', () => {
  test('plans variable create/update/unchanged from existing state', () => {
    const desired = parseManifest(MANIFEST).variables;
    const plan = planVariables(desired, { MODEL_PROXY_URL: 'https://proxy.example' });
    expect(plan.find((v) => v.name === 'MODEL_PROXY_URL')?.action).toBe('unchanged');
    expect(plan.find((v) => v.name === 'PUBLIC_AGENT_REPO_PAUSED')?.action).toBe('create');
    const updated = planVariables(desired, { MODEL_PROXY_URL: 'https://old.example', PUBLIC_AGENT_REPO_PAUSED: 'false' });
    expect(updated.find((v) => v.name === 'MODEL_PROXY_URL')?.action).toBe('update');
  });

  test('plans only missing labels for creation', () => {
    const desired = parseManifest(MANIFEST).labels;
    const plan = planLabels(desired, ['needs-info']);
    expect(plan.find((l) => l.name === 'needs-info')?.action).toBe('exists');
    expect(plan.find((l) => l.name === 'human-required')?.action).toBe('create');
  });

  test('reports only secrets that are absent', () => {
    expect(missingSecrets(['MODEL_PROXY_ADMIN_TOKEN'], [])).toEqual(['MODEL_PROXY_ADMIN_TOKEN']);
    expect(missingSecrets(['MODEL_PROXY_ADMIN_TOKEN'], ['MODEL_PROXY_ADMIN_TOKEN'])).toEqual([]);
  });

  test('report surfaces manual secret follow-up and applied changes', () => {
    const report = formatReport({
      repo: 'owner/name',
      created: true,
      pushed: true,
      variables: planVariables(parseManifest(MANIFEST).variables, {}),
      labels: planLabels(parseManifest(MANIFEST).labels, []),
      branchProtection: 'configured',
      missingSecrets: ['MODEL_PROXY_ADMIN_TOKEN'],
      dryRun: false,
    });
    expect(report).toContain('repo owner/name: created');
    expect(report).toContain('create MODEL_PROXY_URL');
    expect(report).toContain('MANUAL: set these secrets');
    expect(report).toContain('MODEL_PROXY_ADMIN_TOKEN');
  });
});
