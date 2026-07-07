import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkReleaseConsistency, checkReleaseConsistencyText, parseSemver } from './check-release';

const STAMP = (v: string) =>
  `> Documentation for **open-autonomy v${v}** (\`npm install open-autonomy@^${v}.0\`).\n`;

function goodFiles(version = '0.4.1'): {
  packageJson: string;
  versionFile: string;
  versionJson: string;
  changelog: string;
  docs: Record<string, string | undefined>;
} {
  return {
    packageJson: JSON.stringify({ name: 'open-autonomy', version }),
    versionFile: `${version}\n`,
    versionJson: JSON.stringify({ schema: 'open-autonomy.version.v1', version }),
    changelog: `# Changelog\n\n## ${version}\n\nsome notes\n\n## 0.4.0\n\nolder notes\n`,
    docs: {
      'README.md': STAMP('0.4'),
      'docs/OPERATIONS.md': STAMP('0.4'),
      'docs/INSTALL-AGENT.md': STAMP('0.4'),
    },
  };
}

describe('parseSemver', () => {
  test('parses a plain X.Y.Z', () => {
    expect(parseSemver('0.4.1')).toEqual({ major: 0, minor: 4, full: '0.4.1' });
  });
  test('tolerates surrounding whitespace/newline (VERSION file style)', () => {
    expect(parseSemver('0.4.1\n')).toEqual({ major: 0, minor: 4, full: '0.4.1' });
  });
  test('rejects a non-semver string', () => {
    expect(parseSemver('not-a-version')).toBeNull();
  });
});

describe('checkReleaseConsistencyText — the no-filesystem core', () => {
  test('all-agree fixture passes with zero failures', () => {
    expect(checkReleaseConsistencyText(goodFiles())).toEqual([]);
  });

  test('VERSION drift is named', () => {
    const files = goodFiles();
    files.versionFile = '0.1.0\n';
    const failures = checkReleaseConsistencyText(files);
    expect(failures.some((f) => f.includes('VERSION') && f.includes('0.1.0'))).toBe(true);
  });

  test('.open-autonomy/version.json drift is named', () => {
    const files = goodFiles();
    files.versionJson = JSON.stringify({ version: '0.1.0' });
    const failures = checkReleaseConsistencyText(files);
    expect(failures.some((f) => f.includes('version.json') && f.includes('0.1.0'))).toBe(true);
  });

  test('a CHANGELOG top heading that does not match package.json is named', () => {
    const files = goodFiles();
    files.changelog = '# Changelog\n\n## 0.4.0\n\nold\n';
    const failures = checkReleaseConsistencyText(files);
    expect(failures.some((f) => f.includes('CHANGELOG.md') && f.includes('0.4.0'))).toBe(true);
  });

  test('a missing CHANGELOG heading (no ## X.Y.Z at all) is named', () => {
    const files = goodFiles();
    files.changelog = '# Changelog\n\n## Unreleased\n\nno versioned heading yet\n';
    const failures = checkReleaseConsistencyText(files);
    expect(failures.some((f) => f.includes('CHANGELOG.md') && f.includes('no "## X.Y.Z"'))).toBe(true);
  });

  test('a stale doc stamp (wrong major.minor) is named per-doc', () => {
    const files = goodFiles();
    files.docs['README.md'] = STAMP('0.3');
    const failures = checkReleaseConsistencyText(files);
    expect(failures.some((f) => f.includes('README.md') && f.includes('v0.3'))).toBe(true);
  });

  test('a missing doc stamp is named', () => {
    const files = goodFiles();
    files.docs['docs/OPERATIONS.md'] = '# Operating Open Autonomy\n\nno stamp here\n';
    const failures = checkReleaseConsistencyText(files);
    expect(failures.some((f) => f.includes('docs/OPERATIONS.md') && f.includes('missing'))).toBe(true);
  });

  test('a missing stamped doc file is named', () => {
    const files = goodFiles();
    delete files.docs['docs/INSTALL-AGENT.md'];
    const failures = checkReleaseConsistencyText(files);
    expect(failures.some((f) => f.includes('docs/INSTALL-AGENT.md') && f.includes('not found'))).toBe(true);
  });

  test('mutation AC-3: bumping ONLY package.json version names every other artifact as stale', () => {
    const files = goodFiles();
    files.packageJson = JSON.stringify({ name: 'open-autonomy', version: '9.9.9' });
    const failures = checkReleaseConsistencyText(files);
    expect(failures.some((f) => f.includes('VERSION'))).toBe(true);
    expect(failures.some((f) => f.includes('version.json'))).toBe(true);
    expect(failures.some((f) => f.includes('CHANGELOG.md'))).toBe(true);
    expect(failures.some((f) => f.includes('README.md'))).toBe(true);
    expect(failures.some((f) => f.includes('docs/OPERATIONS.md'))).toBe(true);
    expect(failures.some((f) => f.includes('docs/INSTALL-AGENT.md'))).toBe(true);
  });
});

describe('checkReleaseConsistency — filesystem wrapper against a real fixture tree', () => {
  test('reads a fixture directory end to end and passes when consistent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa15-check-release-'));
    try {
      mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
      mkdirSync(join(dir, 'docs'), { recursive: true });
      const files = goodFiles();
      writeFileSync(join(dir, 'package.json'), files.packageJson);
      writeFileSync(join(dir, 'VERSION'), files.versionFile);
      writeFileSync(join(dir, '.open-autonomy', 'version.json'), files.versionJson);
      writeFileSync(join(dir, 'CHANGELOG.md'), files.changelog);
      writeFileSync(join(dir, 'README.md'), files.docs['README.md'] as string);
      writeFileSync(join(dir, 'docs', 'OPERATIONS.md'), files.docs['docs/OPERATIONS.md'] as string);
      writeFileSync(join(dir, 'docs', 'INSTALL-AGENT.md'), files.docs['docs/INSTALL-AGENT.md'] as string);
      expect(checkReleaseConsistency(dir)).toEqual([]);
    } finally {
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  test('this repo, as it stands right now, is consistent (the live regression guard)', () => {
    expect(checkReleaseConsistency(process.cwd())).toEqual([]);
  });
});
