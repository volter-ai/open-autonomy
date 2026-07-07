import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkReleaseConsistency,
  checkReleaseConsistencyText,
  parseSemver,
  PROFILE_MIRROR_VERSION_JSON,
} from './check-release';

const STAMP = (v: string) =>
  `> Documentation for **open-autonomy v${v}** — the doc-version marker.\n`;

function goodFiles(version = '0.4.1'): {
  packageJson: string;
  versionFile: string;
  versionJson: string;
  profileMirrorVersionJson: string;
  changelog: string;
  docs: Record<string, string | undefined>;
} {
  const stampMajorMinor = version.split('.').slice(0, 2).join('.');
  return {
    packageJson: JSON.stringify({ name: 'open-autonomy', version }),
    versionFile: `${version}\n`,
    versionJson: JSON.stringify({ schema: 'open-autonomy.version.v1', version }),
    profileMirrorVersionJson: JSON.stringify({ schema: 'open-autonomy.version.v1', version, profile: 'default' }),
    changelog: `# Changelog\n\n## ${version}\n\nsome notes\n\n## 0.4.0\n\nolder notes\n`,
    docs: {
      'README.md': STAMP(stampMajorMinor),
      'docs/OPERATIONS.md': STAMP(stampMajorMinor),
      'docs/INSTALL-AGENT.md': STAMP(stampMajorMinor),
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
  test('$-anchored: rejects trailing junk / a prerelease suffix (nit b)', () => {
    expect(parseSemver('0.4.1-rc.1')).toBeNull();
    expect(parseSemver('0.4.1.2')).toBeNull();
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

  test('FIX 3 — the SHIPPED profile-mirror version.json drift is named (a publish-gate hole otherwise)', () => {
    const files = goodFiles();
    files.profileMirrorVersionJson = JSON.stringify({ version: '0.1.0', profile: 'default' });
    const failures = checkReleaseConsistencyText(files);
    expect(
      failures.some((f) => f.includes(PROFILE_MIRROR_VERSION_JSON) && f.includes('0.1.0')),
    ).toBe(true);
  });

  test('FIX 3 — a missing profile-mirror version.json is named', () => {
    const files = goodFiles();
    delete (files as { profileMirrorVersionJson?: string }).profileMirrorVersionJson;
    const failures = checkReleaseConsistencyText(files);
    expect(
      failures.some((f) => f.includes(PROFILE_MIRROR_VERSION_JSON) && f.includes('not found')),
    ).toBe(true);
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
    expect(failures.some((f) => f.includes('.open-autonomy/version.json'))).toBe(true);
    expect(failures.some((f) => f.includes(PROFILE_MIRROR_VERSION_JSON))).toBe(true);
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
      mkdirSync(join(dir, 'profiles', 'self-driving', '.open-autonomy'), { recursive: true });
      const files = goodFiles();
      writeFileSync(join(dir, 'package.json'), files.packageJson);
      writeFileSync(join(dir, 'VERSION'), files.versionFile);
      writeFileSync(join(dir, '.open-autonomy', 'version.json'), files.versionJson);
      writeFileSync(join(dir, PROFILE_MIRROR_VERSION_JSON), files.profileMirrorVersionJson);
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

describe('FIX 4 — the gate is self-pinning: this checker asserts its OWN wiring', () => {
  // OA-15's root cause is a release commit that silently abandoned the written process. If someone
  // deletes `check:release-consistency` from the `check` chain or `prepublishOnly`, EVERY other test
  // still passes — nothing pins the wiring. Because check:release-consistency runs THIS test file, an
  // assertion here that reads package.json's scripts makes removing the wiring turn its own gate red.
  const scripts = (JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  }).scripts;

  test('the `check` chain includes check:release-consistency', () => {
    expect(scripts.check).toContain('check:release-consistency');
  });

  test('prepublishOnly includes check:release-consistency (so npm publish cannot bypass it)', () => {
    expect(scripts.prepublishOnly).toContain('check:release-consistency');
  });
});
