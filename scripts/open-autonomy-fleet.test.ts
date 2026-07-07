import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { buildPreflightReport } from './open-autonomy-preflight.js';

describe('open autonomy fleet and audit surfaces', () => {
  test('preflight passes when required files exist and reports unknown config as warnings', () => {
    const report = buildPreflightReport({ root: '.', env: {}, labels: [] });
    expect(report.ready).toBe(true);
    expect(report.checks.some((check) => check.id === 'file:AGENTS.md' && check.status === 'pass')).toBe(true);
    expect(report.checks.some((check) => check.id === 'env:MODEL_PROXY_URL' && check.status === 'warn')).toBe(true);
  });

  test('version metadata exists for run evidence and agrees with package.json (OA-15: one version truth)', () => {
    const version = readFileSync('VERSION', 'utf8').trim();
    const metadata = JSON.parse(readFileSync('.open-autonomy/version.json', 'utf8'));
    const pkgVersion = JSON.parse(readFileSync('package.json', 'utf8')).version;
    expect(version).toBe(pkgVersion);
    expect(metadata.version).toBe(version);
    expect(metadata.profile).toBe('default');
  });

  test('preflight blocks when required files are missing', () => {
    const report = buildPreflightReport({ root: '/tmp/open-autonomy-missing-root', env: {}, labels: [] });
    expect(report.ready).toBe(false);
    expect(report.missing).toContain('file:AGENTS.md');
  });
});
