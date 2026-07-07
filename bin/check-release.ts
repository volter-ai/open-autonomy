#!/usr/bin/env bun
// check:release-consistency (OA-15) — one version truth, machine-checked. `package.json`'s `.version`
// is the authority (it is what npm publishes); this asserts VERSION, `.open-autonomy/version.json`,
// CHANGELOG.md's top `## X.Y.Z` entry, and every stamped doc's "Documentation for **open-autonomy
// vX.Y**" marker all agree with it. Nothing arbitrated this before (`docs/OPERATIONS.md` said one
// thing, `RELEASING.md` said another, and the last two releases followed neither) — see
// docs/adoption-fixes/OA-15-version-doc-skew-release-process.md.
//
// Deliberately itemized, not "first failure wins": the mutation acceptance test (bump `package.json`
// to some other version, touch nothing else) must name EVERY drifted artifact in one run, so a
// maintainer fixing a real release-time skew sees the whole punch list instead of playing whack-a-mole
// one `bun run check:release-consistency` at a time.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Semver {
  major: number;
  minor: number;
  full: string;
}

export function parseSemver(v: string): Semver | null {
  // $-anchored (skeptic nit b): reject anything with trailing junk (e.g. a prerelease/build suffix a
  // release commit shouldn't carry) instead of silently capturing a leading X.Y.Z and ignoring the rest.
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), full: v.trim() };
}

// Docs that must carry the "written for" stamp (part 2 of the spec) — machine-checked here.
export const STAMPED_DOCS = ['README.md', 'docs/OPERATIONS.md', 'docs/INSTALL-AGENT.md'];
// The profile-carried version.json mirror that actually SHIPS bundled into every compiled install
// (profiles/self-driving/.open-autonomy/version.json → dist/profiles/… in the tarball). It must be
// gate-checked here too, not only by check:dogfood — dogfood is NOT in prepublishOnly, so without this
// a mirror-only skew would sail through `npm publish` and ship a lying version into installs (skeptic
// FIX 3). This IS the file OPERATIONS' "a stale artifact cannot ship" claim is about.
export const PROFILE_MIRROR_VERSION_JSON = 'profiles/self-driving/.open-autonomy/version.json';
const STAMP_RE = /Documentation for \*\*open-autonomy v(\d+)\.(\d+)\*\*/;
const CHANGELOG_HEADING_RE = /^## (\d+\.\d+\.\d+)\b/m;

// Pure — takes already-read file contents so it's unit-testable against in-memory fixtures without
// touching the filesystem (mirrors the check-doc-vars.ts pattern in this repo).
export function checkReleaseConsistencyText(files: {
  packageJson: string;
  versionFile: string;
  versionJson: string;
  profileMirrorVersionJson?: string;
  changelog: string;
  docs: Record<string, string | undefined>;
}): string[] {
  const failures: string[] = [];

  let pkg: { version?: string };
  try {
    pkg = JSON.parse(files.packageJson);
  } catch {
    return ['package.json: not valid JSON'];
  }
  const pkgVersion = pkg.version;
  if (typeof pkgVersion !== 'string') return ['package.json: missing "version" field'];
  const pkgSemver = parseSemver(pkgVersion);
  if (!pkgSemver) return [`package.json: "${pkgVersion}" is not a valid semver (expected X.Y.Z)`];

  const versionFileTrimmed = files.versionFile.trim();
  if (versionFileTrimmed !== pkgVersion) {
    failures.push(`VERSION ("${versionFileTrimmed}") != package.json version ("${pkgVersion}") — bump VERSION to match`);
  }

  let versionJson: { version?: string };
  try {
    versionJson = JSON.parse(files.versionJson);
  } catch {
    failures.push('.open-autonomy/version.json: not valid JSON');
    versionJson = {};
  }
  if (versionJson.version !== pkgVersion) {
    failures.push(
      `.open-autonomy/version.json ("${versionJson.version ?? '<missing>'}") != package.json version ("${pkgVersion}") — bump it (and its dogfood mirror, ${PROFILE_MIRROR_VERSION_JSON}) to match`,
    );
  }

  // The profile mirror — the file that actually ships. Checked here so prepublishOnly (which does NOT
  // run check:dogfood) still catches a mirror-only skew before the tarball is built.
  if (files.profileMirrorVersionJson !== undefined) {
    let mirror: { version?: string };
    try {
      mirror = JSON.parse(files.profileMirrorVersionJson);
    } catch {
      failures.push(`${PROFILE_MIRROR_VERSION_JSON}: not valid JSON`);
      mirror = {};
    }
    if (mirror.version !== pkgVersion) {
      failures.push(
        `${PROFILE_MIRROR_VERSION_JSON} ("${mirror.version ?? '<missing>'}") != package.json version ("${pkgVersion}") — bump the SHIPPED profile mirror to match`,
      );
    }
  } else {
    failures.push(`${PROFILE_MIRROR_VERSION_JSON}: file not found (the shipped version mirror)`);
  }

  const headingMatch = CHANGELOG_HEADING_RE.exec(files.changelog);
  if (!headingMatch) {
    failures.push('CHANGELOG.md: no "## X.Y.Z" heading found');
  } else if (headingMatch[1] !== pkgVersion) {
    failures.push(
      `CHANGELOG.md's top version heading ("## ${headingMatch[1]}") != package.json version ("${pkgVersion}") — write a "## ${pkgVersion}" entry before releasing`,
    );
  }

  for (const doc of STAMPED_DOCS) {
    const text = files.docs[doc];
    if (text === undefined) {
      failures.push(`${doc}: file not found`);
      continue;
    }
    const stampMatch = STAMP_RE.exec(text);
    if (!stampMatch) {
      failures.push(`${doc}: missing the "Documentation for **open-autonomy vX.Y**" stamp near the top`);
      continue;
    }
    const major = Number(stampMatch[1]);
    const minor = Number(stampMatch[2]);
    if (major !== pkgSemver.major || minor !== pkgSemver.minor) {
      failures.push(
        `${doc}: stamp says v${major}.${minor}, package.json is v${pkgSemver.major}.${pkgSemver.minor} — restamp`,
      );
    }
  }

  return failures;
}

// Filesystem-reading wrapper for the CLI entry point and for callers that want the real repo state.
export function checkReleaseConsistency(root: string = process.cwd()): string[] {
  const read = (p: string): string => readFileSync(join(root, p), 'utf8');
  const readMaybe = (p: string): string | undefined => {
    try {
      return read(p);
    } catch {
      return undefined;
    }
  };
  let packageJson: string;
  let versionFile: string;
  let versionJson: string;
  let changelog: string;
  try {
    packageJson = read('package.json');
  } catch {
    return ['package.json: not found'];
  }
  try {
    versionFile = read('VERSION');
  } catch {
    return ['VERSION: file not found'];
  }
  try {
    versionJson = read('.open-autonomy/version.json');
  } catch {
    return ['.open-autonomy/version.json: file not found'];
  }
  try {
    changelog = read('CHANGELOG.md');
  } catch {
    return ['CHANGELOG.md: file not found'];
  }
  const docs: Record<string, string | undefined> = {};
  for (const doc of STAMPED_DOCS) docs[doc] = readMaybe(doc);
  const profileMirrorVersionJson = readMaybe(PROFILE_MIRROR_VERSION_JSON);
  return checkReleaseConsistencyText({
    packageJson,
    versionFile,
    versionJson,
    profileMirrorVersionJson,
    changelog,
    docs,
  });
}

if (import.meta.main) {
  const failures = checkReleaseConsistency();
  if (failures.length) {
    console.error(
      `check:release-consistency FAIL — version/doc skew (${failures.length} issue(s)):\n` +
        failures.map((f) => `  - ${f}\n`).join('') +
        `  Fix: bring VERSION, .open-autonomy/version.json, CHANGELOG.md's top entry, and every stamped\n` +
        `  doc's vX.Y stamp in line with package.json's version. See docs/OPERATIONS.md#release-process.\n`,
    );
    process.exit(1);
  }
  console.log(
    'check:release-consistency OK: VERSION, .open-autonomy/version.json, CHANGELOG.md, and all stamped docs agree with package.json',
  );
}
