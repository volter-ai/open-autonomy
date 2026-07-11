// TD.1 — the profile RECOMMENDER (DESIGN §Phase 1 "RECOMMEND / CONFIRM PROFILE", G1). A pure function:
// given the mechanically-readable facts about a repo, pick the bundled profile + substrate that fits,
// and say why. Lives in packages/core because the decision logic is substrate-neutral — it never touches
// a substrate emitter, only reads `ir.yml`/`provision.json` off disk (the same inputs a human maintainer
// would read).
//
// Data-driven, not name-driven: the FACTS side (targets, codeHost, provision.json presence, whether a
// profile is a whole-repo SCAFFOLD, whether it carries a funded-proxy fallback host) is loaded by reading
// the real `profiles/*/ir.yml` files (`loadProfileFacts`/`loadAllProfileFacts`) — only the MAPPING from
// those facts + the repo's own shape to a recommendation is hand-written (the tree itself, per the task).
// This is what keeps the scaffold-clobber guard honest: it is evaluated against the loaded
// `isWholeRepoScaffold` flag, not a hardcoded `name === 'self-driving'` check, so it also protects
// soc2-baseline (the other whole-repo scaffold) without special-casing it.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseIr } from './ir-yaml';

/** The runtime this repo's automation should execute on. Mirrors `AutonomyIR['targets'][number]`. */
export type Substrate = 'local' | 'gh-actions';

// Mirrors bin/autonomy-compile.ts's `REPO_SHELL_FILES` (bin/autonomy-compile.ts:42) — the set of
// resource paths that mark a profile as a whole-repo SCAFFOLD (it ships its own README/package.json/etc,
// so compiling it onto an existing repo would try to overwrite the adopter's own copies). That set is
// the source of truth for the compiler's clobber guard (bin/autonomy-compile.ts:239-257); this is a
// deliberate prose-mirror (the two-layer pattern this codebase already uses for hand-authored facts that
// track code elsewhere — see OA-INSTALL-IMPLEMENTATION-TASKS.md TS.1's DRIFT GUARD note) — kept in sync
// by recommend.test.ts's drift-guard test, which reads bin/autonomy-compile.ts's own source and fails if
// the two sets diverge.
export const REPO_SHELL_FILES = new Set(['README.md', 'package.json', '.gitignore', 'CHANGELOG.md']);

/** The mechanically-readable facts about one bundled profile, extracted from its `ir.yml` (+ the
 *  presence of a sibling `provision.json`). Nothing here is judgment — every field is a direct read. */
export interface ProfileFacts {
  /** The profile's directory name (e.g. "simple-gh-sdlc"). */
  name: string;
  /** `ir.yml`'s `targets:` — which substrate(s) this profile can compile onto. */
  targets: string[];
  /** `ir.yml`'s `codeHost:` — `github` if the profile expects a GitHub-hosted repo, `local-git` (or
   *  unset) if it doesn't require one. */
  codeHost?: 'github' | 'local-git';
  /** Whether a sibling `provision.json` exists (branch-protection/required-checks manifest for the
   *  deterministic `provision-target-repo` helper). */
  hasProvisionJson: boolean;
  /** Whether `ir.yml`'s `resources:` list carries any of `REPO_SHELL_FILES` — i.e. this profile ships
   *  its own README/package.json/etc, so it is a whole-repo SCAFFOLD, not an overlay onto an existing
   *  repo (bin/autonomy-compile.ts:239-257). A scaffold profile is new-repo-only. */
  isWholeRepoScaffold: boolean;
  /** Whether `policy.box['gh-actions'].proxy_host` is declared — this profile ships (or expects) a
   *  model-proxy fallback host, i.e. it needs a funded, allowlisted proxy to run hosted. */
  hasProxyHost: boolean;
}

/** Facts about the repo the operator is installing OA into — everything an install agent can read
 *  mechanically at Phase 0 DETECT, plus the handful of Phase-1/Phase-3 preferences the recommender
 *  needs (DESIGN §Phase 1). */
export interface RepoFacts {
  /** Is the repo's code hosted on GitHub? `false` = pure local git, no code host at all. */
  onGitHub: boolean;
  /** Is the repo already populated with real content, or is it new/empty (a fresh, dedicated repo)?
   *  Drives the scaffold-clobber guard: a whole-repo-scaffold profile is only eligible when this is
   *  `false` (bin/autonomy-compile.ts:239-257). */
  populated: boolean;
  /** Does the operator hold GitHub repo-admin rights (needed to provision branch protection)? Left
   *  `undefined` means "unknown, assume yes" — TE.4's AUTHORIZE gate is where this is actually confirmed
   *  (DESIGN §Phase 3, G3); the recommender only uses an explicit `false` to steer away from a hosted
   *  runner it already knows can't be provisioned. */
  ghAdmin?: boolean;
  /** Does the operator want the agent fleet to actually RUN on GitHub Actions ("hosted") rather than
   *  their own machine ("local runner")? Only meaningful when `onGitHub` is true — this is a substrate
   *  choice, independent of whether the *code* lives on GitHub. */
  hostedRunner?: boolean;
  /** Operator preference for a manual-after-review merge (a deputy/human merges after green checks) over
   *  native auto-merge. Distinguishes simple-gh (`landing_mode: manual-after-review`) from simple-gh-sdlc
   *  (`landing_mode: auto-merge`) when both are otherwise eligible. */
  preferNoAutoMerge?: boolean;
  /** Can the operator deploy + fund an OIDC-allowlisted model proxy (self-driving's proxy prerequisite,
   *  DESIGN §Phase 3(d) / build-plan hardening #1)? */
  canFundProxy?: boolean;
  /** Explicit override: the operator just wants to see OA run, not adopt a full delivery profile. */
  wantsDemo?: boolean;
  /** Explicit override: the operator needs the SOC 2 deterministic control-baseline profile. */
  wantsSOC2?: boolean;
}

/** The recommender's output (DESIGN §Phase 1): a profile + substrate + why. */
export interface Recommendation {
  profile: string;
  substrate: Substrate;
  reasons: string[];
}

// Deliberately NO `import.meta.url`-relative default for `profilesRoot` here (unlike
// bin/bundled-profiles.ts's `profilesRoot`, OA-15): that idiom only resolves correctly when the reading
// module ends up the SAME number of directory levels below the package root in both the dev checkout and
// the bundled CLI (bin/*.ts does — one level below root either way). packages/core/src/ is three levels
// deep in the dev checkout but gets bundled straight into dist/cli.js (one level deep) — no single
// relative literal resolves in both, and `bun scripts/build-cli.ts`'s static sibling-read scan (which
// resolves every such literal against the built `dist/` to catch exactly this class of bug before it
// ships) rejects a dev-only guess it can't prove out. So `profilesRoot` is a required, explicit input —
// callers (tests here; a future `bin/`-side consumer) supply it, the same way `bin/bundled-profiles.ts`
// already does for its own callers. This also keeps the loader a plain, side-effect-free function of its
// arguments, in keeping with `recommendProfile` being a pure function.

/** Read one profile's `ir.yml` (+ sibling `provision.json`) into its `ProfileFacts`. */
export function loadProfileFacts(profileDir: string, name: string = basename(profileDir)): ProfileFacts {
  const irText = readFileSync(join(profileDir, 'ir.yml'), 'utf8');
  const ir = parseIr(irText);
  const isWholeRepoScaffold = ir.resources.some((r) => REPO_SHELL_FILES.has(r));
  const hasProvisionJson = existsSync(join(profileDir, 'provision.json'));
  const box = ir.policy.box as Record<string, unknown>;
  const ghActionsBox = box['gh-actions'] as Record<string, unknown> | undefined;
  const proxyHost = ghActionsBox?.proxy_host;
  const hasProxyHost = typeof proxyHost === 'string' && proxyHost.length > 0;
  return {
    name,
    targets: [...ir.targets],
    codeHost: ir.codeHost,
    hasProvisionJson,
    isWholeRepoScaffold,
    hasProxyHost,
  };
}

/** Read every bundled profile under `profilesRoot` (pass the real repo's `profiles/` directory to drive
 *  this against the actual install) into its `ProfileFacts`. This is the "live-proof leg" input —
 *  `recommendProfile` run with this catalog is driven against the actual `profiles/*\/ir.yml` files, not
 *  a synthetic fixture. */
export function loadAllProfileFacts(profilesRoot: string): ProfileFacts[] {
  const names = readdirSync(profilesRoot).filter((n) => existsSync(join(profilesRoot, n, 'ir.yml')));
  return names.map((n) => loadProfileFacts(join(profilesRoot, n), n)).sort((a, b) => a.name.localeCompare(b.name));
}

/** One eligibility check result: either the profile's facts (usable), or a reason it is not. */
type Eligibility = { ok: true; facts: ProfileFacts } | { ok: false; why: string };

/** A profile is eligible for a repo+substrate iff (a) it exists in the loaded catalog, (b) it declares
 *  the requested substrate in `targets`, and (c) — the scaffold clobber guard — it is not a whole-repo
 *  SCAFFOLD being aimed at a populated repo. (c) is evaluated from the LOADED `isWholeRepoScaffold` flag,
 *  never a hardcoded profile name, so it protects every current and future scaffold profile alike
 *  (today: self-driving and soc2-baseline) — see bin/autonomy-compile.ts:239-257.
 */
function eligible(profiles: ReadonlyMap<string, ProfileFacts>, repoFacts: RepoFacts, name: string, substrate: Substrate): Eligibility {
  const facts = profiles.get(name);
  if (!facts) return { ok: false, why: `profile "${name}" was not found in the loaded catalog` };
  if (!facts.targets.includes(substrate)) {
    return { ok: false, why: `"${name}" does not support the "${substrate}" target (targets: ${facts.targets.join(', ')})` };
  }
  if (facts.isWholeRepoScaffold && repoFacts.populated) {
    return {
      ok: false,
      why:
        `"${name}" is a whole-repo scaffold (its resources carry repo-shell files: ${[...REPO_SHELL_FILES].join(', ')}) ` +
        `— it is new-repo-only; the compile-time clobber guard will refuse it on a populated repo (bin/autonomy-compile.ts:239-257)`,
    };
  }
  return { ok: true, facts };
}

/**
 * DESIGN §Phase 1's decision tree, as a pure function. Given the repo's mechanically-readable facts (and
 * a handful of Phase-1/3 operator preferences) plus a loaded profile-facts catalog (`loadAllProfileFacts`
 * against the real `profiles/`, or a fixture catalog in tests), recommend a bundled profile + substrate,
 * citing the facts that drove the choice. Never mutates anything and never touches the filesystem itself
 * — the catalog is an argument, not a hidden default, so this stays a pure function of its inputs.
 *
 * Branch order mirrors DESIGN §Phase 1 / OA-INSTALL-IMPLEMENTATION-TASKS.md TD.1:
 *   1. Explicit overrides (demo -> hello, SOC2 -> soc2-baseline) — but never past the clobber guard.
 *   2. No GitHub code host at all -> simple-sdlc (fully local).
 *   3. A new/empty dedicated repo with a fundable proxy -> self-driving (the whole-repo scaffold).
 *   4. An existing (populated) GitHub repo:
 *        - operator wants the fleet hosted on GitHub Actions -> simple-gh-sdlc@gh-actions
 *        - operator wants their own machine + prefers manual-after-review over auto-merge -> simple-gh@local
 *        - otherwise -> simple-gh-sdlc@local (the default additive GitHub profile)
 */
export function recommendProfile(repoFacts: RepoFacts, profiles: ProfileFacts[]): Recommendation {
  const byName = new Map(profiles.map((p) => [p.name, p] as const));
  const carriedReasons: string[] = [];

  // --- Overrides: an explicit operator ask beats the mechanical tree, but is still run through the same
  // eligibility check — an override can never smuggle a scaffold profile onto a populated repo. ---
  if (repoFacts.wantsDemo) {
    const substrate: Substrate = repoFacts.onGitHub && repoFacts.hostedRunner ? 'gh-actions' : 'local';
    const check = eligible(byName, repoFacts, 'hello', substrate);
    if (check.ok) {
      return {
        profile: 'hello',
        substrate,
        reasons: [
          ...carriedReasons,
          'override: operator asked for a demo — "hello" is OA\'s minimal demo profile (one greeter agent, no board, no merge boundary to configure)',
        ],
      };
    }
    carriedReasons.push(`demo override requested but not eligible (${check.why}) — continuing the mechanical tree`);
  }

  if (repoFacts.wantsSOC2) {
    const substrate: Substrate = 'gh-actions';
    const check = eligible(byName, repoFacts, 'soc2-baseline', substrate);
    if (check.ok) {
      return {
        profile: 'soc2-baseline',
        substrate,
        reasons: [
          ...carriedReasons,
          'override: operator asked for SOC 2 controls — "soc2-baseline" is simple-gh-sdlc plus the deterministic SOC 2 control layer',
          'repo is new/dedicated (unpopulated), satisfying soc2-baseline\'s whole-repo-scaffold new-repo-only requirement',
        ],
      };
    }
    carriedReasons.push(`SOC 2 override requested but "soc2-baseline" not eligible (${check.why}) — continuing the mechanical tree`);
  }

  // --- Rule: no GitHub code host at all -> the pure-local profile. Takes priority over everything below,
  // since none of gh-actions/hosted/auto-merge questions are even meaningful without a code host. ---
  if (!repoFacts.onGitHub) {
    const check = eligible(byName, repoFacts, 'simple-sdlc', 'local');
    if (check.ok) {
      return {
        profile: 'simple-sdlc',
        substrate: 'local',
        reasons: [
          ...carriedReasons,
          'repo has no GitHub code host (fully local) — simple-sdlc is the only bundled profile with codeHost: local-git / a PR-free landing mode',
        ],
      };
    }
    throw new Error(`no eligible profile for a fully-local repo: ${check.why}`);
  }

  // From here, onGitHub is true.

  // --- Rule: a new/empty dedicated repo with a fundable model proxy -> self-driving (the most autonomous
  // bundled profile, but a whole-repo scaffold, so it is only even attempted when the repo is unpopulated
  // — the eligibility check below enforces that from the loaded facts, not a hardcoded name). ---
  if (!repoFacts.populated && repoFacts.canFundProxy) {
    const check = eligible(byName, repoFacts, 'self-driving', 'gh-actions');
    if (check.ok) {
      return {
        profile: 'self-driving',
        substrate: 'gh-actions',
        reasons: [
          ...carriedReasons,
          'repo is new/dedicated (unpopulated) and the operator can fund an allowlisted model proxy — self-driving is viable and is the most autonomous bundled profile',
          'self-driving is a whole-repo scaffold (carries its own README/package.json/CHANGELOG.md as resources), so it needs a dedicated, unpopulated repo (bin/autonomy-compile.ts:239-257)',
        ],
      };
    }
    carriedReasons.push(`self-driving not eligible (${check.why}) — falling back to an additive GitHub profile`);
  }

  // --- Rule: an existing (or proxy-less) GitHub repo -> pick between the additive GitHub profiles. ---
  if (repoFacts.hostedRunner && repoFacts.ghAdmin !== false) {
    const check = eligible(byName, repoFacts, 'simple-gh-sdlc', 'gh-actions');
    if (check.ok) {
      return {
        profile: 'simple-gh-sdlc',
        substrate: 'gh-actions',
        reasons: [
          ...carriedReasons,
          'existing repo + operator wants the fleet to run on GitHub Actions (hosted) — simple-gh-sdlc targets gh-actions and is additive (no repo-shell resources, so no scaffold-clobber risk on a populated repo)',
        ],
      };
    }
    carriedReasons.push(`simple-gh-sdlc@gh-actions not eligible (${check.why}) — falling back to the local runner`);
  } else if (repoFacts.hostedRunner && repoFacts.ghAdmin === false) {
    carriedReasons.push(
      'operator asked for a hosted runner but does not hold gh-admin — branch protection cannot be provisioned on gh-actions without repo-admin (DESIGN §Phase 0 hardening #8); recommending the local runner instead',
    );
  }

  if (repoFacts.preferNoAutoMerge) {
    const check = eligible(byName, repoFacts, 'simple-gh', 'local');
    if (check.ok) {
      return {
        profile: 'simple-gh',
        substrate: 'local',
        reasons: [
          ...carriedReasons,
          'existing repo + operator\'s own machine + prefers manual-after-review over native auto-merge — simple-gh is local-only and ships no agent-review status at all (landing_mode: manual-after-review, README.md:63-79)',
        ],
      };
    }
    carriedReasons.push(`simple-gh@local not eligible (${check.why}) — falling back to the default additive profile`);
  }

  // Default for an existing GitHub repo when neither "hosted" nor "no-auto-merge" was explicitly asked:
  // simple-gh-sdlc on the local runner — the default additive GitHub profile (auto-merge, no repo-shell
  // resources, so it never trips the clobber guard regardless of populated/unpopulated).
  const fallback = eligible(byName, repoFacts, 'simple-gh-sdlc', 'local');
  if (fallback.ok) {
    return {
      profile: 'simple-gh-sdlc',
      substrate: 'local',
      reasons: [
        ...carriedReasons,
        'existing GitHub repo, no hosted-runner or no-auto-merge preference stated — simple-gh-sdlc on the local runner is the default additive GitHub profile',
      ],
    };
  }

  throw new Error(`no eligible profile found for repoFacts=${JSON.stringify(repoFacts)}: ${fallback.why}`);
}
