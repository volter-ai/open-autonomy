import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadAllProfileFacts,
  loadProfileFacts,
  recommendProfile,
  REPO_SHELL_FILES,
  type ProfileFacts,
  type RepoFacts,
} from './recommend';

// ---------------------------------------------------------------------------------------------------
// Part 1 — repo-shape FIXTURES reproduce the whole decision tree, against a small hand-built catalog
// that mirrors the real profiles' facts (targets/codeHost/scaffold-ness/proxy) without touching disk.
// This isolates the TREE LOGIC from the loader, so these tests stay meaningful even if a profile's
// ir.yml changes shape later.
// ---------------------------------------------------------------------------------------------------

function fixtureCatalog(): ProfileFacts[] {
  return [
    { name: 'hello', targets: ['local', 'gh-actions'], codeHost: undefined, hasProvisionJson: false, isWholeRepoScaffold: false, hasProxyHost: false },
    { name: 'hello-human', targets: ['local'], codeHost: undefined, hasProvisionJson: false, isWholeRepoScaffold: false, hasProxyHost: false },
    { name: 'simple-sdlc', targets: ['local'], codeHost: 'local-git', hasProvisionJson: false, isWholeRepoScaffold: false, hasProxyHost: false },
    { name: 'simple-gh', targets: ['local'], codeHost: 'github', hasProvisionJson: true, isWholeRepoScaffold: false, hasProxyHost: false },
    { name: 'simple-gh-sdlc', targets: ['gh-actions', 'local'], codeHost: 'github', hasProvisionJson: true, isWholeRepoScaffold: false, hasProxyHost: false },
    { name: 'self-driving', targets: ['gh-actions', 'local'], codeHost: 'github', hasProvisionJson: true, isWholeRepoScaffold: true, hasProxyHost: true },
    { name: 'soc2-baseline', targets: ['gh-actions', 'local'], codeHost: 'github', hasProvisionJson: true, isWholeRepoScaffold: true, hasProxyHost: false },
  ];
}

function baseFacts(over: Partial<RepoFacts> = {}): RepoFacts {
  return { onGitHub: true, populated: true, ...over };
}

describe('recommendProfile — decision tree over repo-shape fixtures', () => {
  test('fully-local repo (no GitHub) -> simple-sdlc@local', () => {
    const rec = recommendProfile(baseFacts({ onGitHub: false, populated: false }), fixtureCatalog());
    expect(rec.profile).toBe('simple-sdlc');
    expect(rec.substrate).toBe('local');
    expect(rec.reasons.length).toBeGreaterThan(0);
    expect(rec.reasons.join(' ')).toMatch(/local-git|fully local/);
  });

  test('existing repo + hosted -> simple-gh-sdlc@gh-actions', () => {
    const rec = recommendProfile(baseFacts({ onGitHub: true, populated: true, hostedRunner: true }), fixtureCatalog());
    expect(rec.profile).toBe('simple-gh-sdlc');
    expect(rec.substrate).toBe('gh-actions');
    expect(rec.reasons.join(' ')).toMatch(/hosted/);
  });

  test('existing repo + own machine + no-auto-merge preference -> simple-gh@local', () => {
    const rec = recommendProfile(
      baseFacts({ onGitHub: true, populated: true, hostedRunner: false, preferNoAutoMerge: true }),
      fixtureCatalog(),
    );
    expect(rec.profile).toBe('simple-gh');
    expect(rec.substrate).toBe('local');
    expect(rec.reasons.join(' ')).toMatch(/manual-after-review/);
  });

  test('new dedicated repo + fundable proxy -> self-driving', () => {
    const rec = recommendProfile(baseFacts({ onGitHub: true, populated: false, canFundProxy: true }), fixtureCatalog());
    expect(rec.profile).toBe('self-driving');
    expect(rec.substrate).toBe('gh-actions');
    expect(rec.reasons.join(' ')).toMatch(/scaffold/);
  });

  test('override: demo -> hello, regardless of repo shape', () => {
    const rec = recommendProfile(baseFacts({ onGitHub: true, populated: true, wantsDemo: true }), fixtureCatalog());
    expect(rec.profile).toBe('hello');
    expect(rec.reasons.join(' ')).toMatch(/demo/);
  });

  test('override: SOC2 -> soc2-baseline, on a new dedicated repo', () => {
    const rec = recommendProfile(baseFacts({ onGitHub: true, populated: false, wantsSOC2: true }), fixtureCatalog());
    expect(rec.profile).toBe('soc2-baseline');
    expect(rec.substrate).toBe('gh-actions');
    expect(rec.reasons.join(' ')).toMatch(/SOC 2/);
  });

  test('default existing GitHub repo, no hosted/no-auto-merge preference -> simple-gh-sdlc@local', () => {
    const rec = recommendProfile(baseFacts({ onGitHub: true, populated: true }), fixtureCatalog());
    expect(rec.profile).toBe('simple-gh-sdlc');
    expect(rec.substrate).toBe('local');
  });

  test('new/empty GitHub repo with NO fundable proxy falls back off self-driving to an additive profile', () => {
    const rec = recommendProfile(baseFacts({ onGitHub: true, populated: false, canFundProxy: false }), fixtureCatalog());
    expect(rec.profile).not.toBe('self-driving');
    expect(['simple-gh-sdlc', 'simple-gh']).toContain(rec.profile);
  });

  test('hosted requested but ghAdmin explicitly false -> steered off gh-actions to the local runner', () => {
    const rec = recommendProfile(
      baseFacts({ onGitHub: true, populated: true, hostedRunner: true, ghAdmin: false }),
      fixtureCatalog(),
    );
    expect(rec.substrate).toBe('local');
    expect(rec.reasons.join(' ')).toMatch(/gh-admin/);
  });

  // --- The scaffold clobber guard (bin/autonomy-compile.ts:~233-257): a whole-repo-scaffold profile
  // (self-driving, soc2-baseline) must NEVER be recommended for a populated repo — not by the mechanical
  // tree, and not even via an explicit override. This is the acceptance-critical guard TD.1 must honor. ---
  describe('scaffold clobber guard — never recommend a whole-repo scaffold onto a populated repo', () => {
    test('self-driving is never recommended when populated=true, even with a fundable proxy', () => {
      const rec = recommendProfile(baseFacts({ onGitHub: true, populated: true, canFundProxy: true }), fixtureCatalog());
      expect(rec.profile).not.toBe('self-driving');
    });

    test('the SOC2 override does not return soc2-baseline on a populated repo; it falls back to the mechanical tree', () => {
      const rec = recommendProfile(baseFacts({ onGitHub: true, populated: true, wantsSOC2: true }), fixtureCatalog());
      expect(rec.profile).not.toBe('soc2-baseline');
      // still lands on SOME eligible additive GitHub profile, not an exception
      expect(['simple-gh-sdlc', 'simple-gh']).toContain(rec.profile);
    });

    test('sweeping the whole fixture catalog: no combination of populated=true repoFacts ever yields a scaffold profile', () => {
      const scaffoldNames = new Set(fixtureCatalog().filter((p) => p.isWholeRepoScaffold).map((p) => p.name));
      const bools = [true, false, undefined] as const;
      for (const hostedRunner of bools) {
        for (const preferNoAutoMerge of bools) {
          for (const canFundProxy of bools) {
            for (const wantsSOC2 of [true, false]) {
              const rec = recommendProfile(
                baseFacts({ onGitHub: true, populated: true, hostedRunner, preferNoAutoMerge, canFundProxy, wantsSOC2 }),
                fixtureCatalog(),
              );
              expect(scaffoldNames.has(rec.profile)).toBe(false);
            }
          }
        }
      }
    });
  });

  test('reasons always cite at least one concrete fact (non-empty, human-readable)', () => {
    const rec = recommendProfile(baseFacts({ onGitHub: true, populated: true, hostedRunner: true }), fixtureCatalog());
    for (const reason of rec.reasons) {
      expect(typeof reason).toBe('string');
      expect(reason.length).toBeGreaterThan(10);
    }
  });
});

// ---------------------------------------------------------------------------------------------------
// Part 2 — the LOADER against the REAL profiles/*/ir.yml (the live-proof leg): loadProfileFacts /
// loadAllProfileFacts read this checkout's actual profile directories, not fixtures.
// ---------------------------------------------------------------------------------------------------

describe('loadProfileFacts / loadAllProfileFacts — live read of the real profiles/*/ir.yml', () => {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const realProfiles = loadAllProfileFacts(join(repoRoot, 'profiles'));

  test('discovers every bundled profile directory', () => {
    const names = realProfiles.map((p) => p.name).sort();
    expect(names).toEqual(
      [
        'hello',
        'hello-human',
        'self-driving',
        'simple-gh',
        'simple-gh-sdlc',
        'simple-gh-sdlc-visual',
        'simple-sdlc',
        'soc2-baseline',
      ].sort(),
    );
  });

  test('self-driving: whole-repo scaffold, gh-actions+local targets, has a proxy host, has provision.json', () => {
    const p = realProfiles.find((p) => p.name === 'self-driving')!;
    expect(p.isWholeRepoScaffold).toBe(true);
    expect(p.targets).toEqual(expect.arrayContaining(['gh-actions', 'local']));
    expect(p.codeHost).toBe('github');
    expect(p.hasProxyHost).toBe(true);
    expect(p.hasProvisionJson).toBe(true);
  });

  test('soc2-baseline: also a whole-repo scaffold (shares the guard with self-driving)', () => {
    const p = realProfiles.find((p) => p.name === 'soc2-baseline')!;
    expect(p.isWholeRepoScaffold).toBe(true);
    expect(p.hasProvisionJson).toBe(true);
  });

  test('simple-gh: local-only target, github code host, provision.json present, NOT a scaffold', () => {
    const p = realProfiles.find((p) => p.name === 'simple-gh')!;
    expect(p.targets).toEqual(['local']);
    expect(p.codeHost).toBe('github');
    expect(p.hasProvisionJson).toBe(true);
    expect(p.isWholeRepoScaffold).toBe(false);
  });

  test('simple-gh-sdlc: gh-actions+local targets, github code host, NOT a scaffold', () => {
    const p = realProfiles.find((p) => p.name === 'simple-gh-sdlc')!;
    expect(p.targets).toEqual(expect.arrayContaining(['gh-actions', 'local']));
    expect(p.codeHost).toBe('github');
    expect(p.isWholeRepoScaffold).toBe(false);
  });

  test('simple-sdlc: local-only, local-git code host, no provision.json, not a scaffold', () => {
    const p = realProfiles.find((p) => p.name === 'simple-sdlc')!;
    expect(p.targets).toEqual(['local']);
    expect(p.codeHost).toBe('local-git');
    expect(p.hasProvisionJson).toBe(false);
    expect(p.isWholeRepoScaffold).toBe(false);
  });

  test('loadProfileFacts on a single directory matches the entry loadAllProfileFacts produces', () => {
    const direct = loadProfileFacts(join(repoRoot, 'profiles', 'self-driving'));
    const viaAll = realProfiles.find((p) => p.name === 'self-driving')!;
    expect(direct).toEqual(viaAll);
  });
});

describe('recommendProfile — driven against the REAL profiles/*/ir.yml (live-proof leg)', () => {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const realProfiles = loadAllProfileFacts(join(repoRoot, 'profiles'));

  test('fully-local -> simple-sdlc, using the real catalog', () => {
    const rec = recommendProfile({ onGitHub: false, populated: false }, realProfiles);
    expect(rec).toMatchObject({ profile: 'simple-sdlc', substrate: 'local' });
  });

  test('existing repo + hosted -> simple-gh-sdlc@gh-actions, using the real catalog', () => {
    const rec = recommendProfile({ onGitHub: true, populated: true, hostedRunner: true }, realProfiles);
    expect(rec).toMatchObject({ profile: 'simple-gh-sdlc', substrate: 'gh-actions' });
  });

  test('existing repo + own machine + no-auto-merge -> simple-gh@local, using the real catalog', () => {
    const rec = recommendProfile(
      { onGitHub: true, populated: true, hostedRunner: false, preferNoAutoMerge: true },
      realProfiles,
    );
    expect(rec).toMatchObject({ profile: 'simple-gh', substrate: 'local' });
  });

  test('new dedicated repo + fundable proxy -> self-driving, using the real catalog', () => {
    const rec = recommendProfile({ onGitHub: true, populated: false, canFundProxy: true }, realProfiles);
    expect(rec).toMatchObject({ profile: 'self-driving', substrate: 'gh-actions' });
  });

  test('override demo -> hello, using the real catalog', () => {
    const rec = recommendProfile({ onGitHub: true, populated: true, wantsDemo: true }, realProfiles);
    expect(rec.profile).toBe('hello');
  });

  test('override SOC2 -> soc2-baseline on a fresh repo, using the real catalog', () => {
    const rec = recommendProfile({ onGitHub: true, populated: false, wantsSOC2: true }, realProfiles);
    expect(rec).toMatchObject({ profile: 'soc2-baseline', substrate: 'gh-actions' });
  });

  test('never recommends self-driving or soc2-baseline (real, loaded scaffold profiles) on a populated repo', () => {
    const rec1 = recommendProfile({ onGitHub: true, populated: true, canFundProxy: true }, realProfiles);
    expect(rec1.profile).not.toBe('self-driving');
    const rec2 = recommendProfile({ onGitHub: true, populated: true, wantsSOC2: true }, realProfiles);
    expect(rec2.profile).not.toBe('soc2-baseline');
  });
});

// ---------------------------------------------------------------------------------------------------
// Part 3 — drift guard: REPO_SHELL_FILES must stay byte-identical to bin/autonomy-compile.ts's own
// set, the actual clobber guard's source of truth. If that set ever changes, this test goes red until
// recommend.ts's mirror is updated — the same "extend check:policy-consumers" pattern
// OA-INSTALL-IMPLEMENTATION-TASKS.md's TS.1 documents for other hand-authored, prose-mirrored facts.
// ---------------------------------------------------------------------------------------------------

describe('REPO_SHELL_FILES drift guard', () => {
  test('matches bin/autonomy-compile.ts\'s REPO_SHELL_FILES set exactly', () => {
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
    const compileSrc = readFileSync(join(repoRoot, 'bin', 'autonomy-compile.ts'), 'utf8');
    const m = compileSrc.match(/const REPO_SHELL_FILES = new Set\(\[([^\]]*)\]\)/);
    expect(m).not.toBeNull();
    const literal = m![1];
    const entries = [...literal.matchAll(/'([^']*)'/g)].map((mm) => mm[1]);
    expect(new Set(entries)).toEqual(REPO_SHELL_FILES);
  });
});
