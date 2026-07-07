#!/usr/bin/env bun
// Compile a profile (an `autonomy.ir.v1` ir.yml) onto a substrate, producing an installation.
//   bun bin/autonomy-compile.ts <profileName|profileDir> <local|gh-actions> [outDir] [--force] [--provider-url <url>]
//   ("github" accepted as alias for gh-actions)
// The first arg is either a BUNDLED profile name (e.g. `self-driving`, resolved to the profiles/ shipped
// with this package) or a path to a profile dir of your own. With no outDir, prints the installation's file
// list (a dry run). With outDir, materializes it — refusing if that would overwrite an existing file with
// DIFFERENT bytes (BL-14, see findClobbers below), or re-create a file the operator deliberately deleted
// (OA-10, see findResurrections below); --force overrides both. `.claude/settings.json` gets a structured
// MERGE instead of a refusal (settings-merge.ts). These guards are fresh-compile only — `autonomy-upgrade.ts`
// legitimately overwrites derived files in place (and applies the same settings.json merge strategy there).
// --provider-url <url> (local substrate only, OA-09): emits a DURABLE TERMFLEET_PROVIDER_URL pin into
// scheduler/schedule.json's env, so it survives new shells/supervisors/re-runs instead of depending on the
// operator remembering to export it (docs/adoption-fixes/OA-09-termfleet-coexistence-provider-pinning.md).
// An ambient TERMFLEET_PROVIDER_URL still overrides this compiled default at runtime (unchanged doctrine).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundledProfileNames, profilesRoot } from './bundled-profiles.ts';
import {
  parseIr,
  compiledPaths,
  materialize,
  missingCopySourcesIn,
  findClobbers,
  findMerges,
  findResurrections,
  readGeneratedManifest,
  GENERATED_MANIFEST_PATH,
  validateSkillFrontmatterIn,
} from '@open-autonomy/core';
import type { CompileOutput } from '@open-autonomy/core';
import { resolveZtrackPreset } from './ztrack-preset.ts';
import { checkNamespaceCollisions } from './collision-check.ts';
import { settingsMergeStrategies, CLAUDE_SETTINGS_PATH } from './settings-merge.ts';

// Repo-shell files ONLY a whole-repo SCAFFOLD profile (self-driving) carries as resources. The clobber
// guard's message adds scaffold-specific advice iff a collision actually names one of THESE — never keyed
// to the profile's own name (an additive profile like simple-sdlc can trip the guard on, say,
// `.claude/settings.json` or `scripts/agent.ts`, and telling the adopter "this is a whole-repo scaffold,
// compile simple-sdlc instead" while they're compiling simple-sdlc is exactly the false claim this fixes).
const REPO_SHELL_FILES = new Set(['README.md', 'package.json', '.gitignore', 'CHANGELOG.md']);

// OA-15: the CLI's OWN version, read from its sibling package.json — the exact dual-resolution pattern
// already used for `profilesRoot` (bundled-profiles.ts): `join(dirname(import.meta.url's path), '..',
// 'package.json')` resolves both in the dev checkout (`bin/../package.json`) and the packed install
// (`dist/../package.json`). Used to pin the emitted next-steps' doc link + prefix to THIS CLI's version,
// so an old install's printed guide points at the docs snapshot that matches its own behavior instead of
// silently drifting with whatever `main` says later (F-14, docs/adoption-fixes/OA-15-…).
const CLI_VERSION: string = (() => {
  try {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
    return (JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

// profilesRoot + bundledProfileNames() moved to ./bundled-profiles.ts (OA-11) so bin/open-autonomy.ts's
// --help can derive the same list — see that file for the resolution-in-both-dev-and-packed-install note
// and the substrate-free import constraint.
function resolveProfile(arg: string): string | undefined {
  if (existsSync(join(arg, 'ir.yml'))) return arg; // an explicit path to a profile dir
  const bundled = join(profilesRoot, arg); // a bare bundled-profile name
  if (existsSync(join(bundled, 'ir.yml'))) return bundled;
  return undefined;
}
// The printed receipt's grouped-by-directory summary (OA-10, F-9's "nothing prints what was written"):
// top-level directory (or bare filename, for a root-level path like `.gitignore`) -> file count, sorted.
// Deliberately generic (no per-profile hardcoded labels) so it never drifts from whatever a profile
// actually emits — the authoritative per-path list is always `.open-autonomy/generated.json` itself.
function summarizeByDir(paths: string[]): Array<{ dir: string; count: number }> {
  const counts = new Map<string, number>();
  for (const p of paths) {
    const dir = p.includes('/') ? `${p.split('/')[0]}/` : p;
    counts.set(dir, (counts.get(dir) ?? 0) + 1);
  }
  return [...counts.entries()].map(([dir, count]) => ({ dir, count })).sort((a, b) => a.dir.localeCompare(b.dir));
}
// Does the profile's agents reference a tool (e.g. `ztrack`)? Scans the profile's source files so the
// next-steps print can name the right project deps without the core/substrate ever hardcoding a tool.
function profileMentions(dir: string, token: string): boolean {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (profileMentions(p, token)) return true; }
    else if (e.isFile()) { try { if (readFileSync(p, 'utf8').includes(token)) return true; } catch { /* skip unreadable */ } }
  }
  return false;
}

// `--force` and `--provider-url <url>` are flags, not positional — filter both (and the url's own token)
// out before reading the three positional args.
const rawArgs = process.argv.slice(2);
const force = rawArgs.includes('--force');
const providerUrlFlagIdx = rawArgs.indexOf('--provider-url');
const providerUrl = providerUrlFlagIdx >= 0 ? rawArgs[providerUrlFlagIdx + 1] : undefined;
if (providerUrlFlagIdx >= 0) {
  const usage =
    'usage: autonomy-compile <profileName|profileDir> <local|gh-actions> [outDir] [--force] [--provider-url <url>]';
  // A missing value, OR the next token being ANOTHER flag (`--provider-url --force` would silently swallow
  // `--force` as the URL), OR an unparseable URL — all reject rather than emit a garbage pin into
  // scheduler/schedule.json's env.
  if (!providerUrl || providerUrl.startsWith('-')) {
    console.error(`${usage}\n  --provider-url requires a <url> value (e.g. http://127.0.0.1:7602)`);
    process.exit(2);
  }
  try {
    // eslint-disable-next-line no-new
    new URL(providerUrl);
  } catch {
    console.error(`${usage}\n  --provider-url value "${providerUrl}" is not a valid URL (expected e.g. http://127.0.0.1:7602)`);
    process.exit(2);
  }
}
const [profileArg, substrateArg, outDir] = rawArgs.filter(
  (a, i) => a !== '--force' && (providerUrlFlagIdx < 0 || (i !== providerUrlFlagIdx && i !== providerUrlFlagIdx + 1)),
);
// `gh-actions` is the runner-substrate; accept `github` as a back-compat alias. `local` unchanged.
const substrate = substrateArg === 'github' ? 'gh-actions' : substrateArg;
if (!profileArg || (substrate !== 'local' && substrate !== 'gh-actions')) {
  console.error(`usage: autonomy-compile <profileName|profileDir> <local|gh-actions> [outDir] [--force] [--provider-url <url>]\n  bundled profiles: ${bundledProfileNames().join(', ') || '(none found)'}`);
  process.exit(2);
}
if (providerUrl && substrate !== 'local') {
  console.error(`open-autonomy: WARNING — --provider-url only applies to the "local" substrate's scheduler/schedule.json; ignored for "${substrate}".`);
}

const profileDir = resolveProfile(profileArg);
if (!profileDir) {
  console.error(`open-autonomy: no profile "${profileArg}" — not a path with an ir.yml, and not a bundled profile.\n  bundled profiles: ${bundledProfileNames().join(', ') || '(none found)'}`);
  process.exit(2);
}

const ir = parseIr(readFileSync(join(profileDir, 'ir.yml'), 'utf8'));

// docs/SPEC.md#the-ir (conformance): a profile declares which substrates it supports via `targets:`.
// Compiling onto one it doesn't list still WORKS (a substrate is a partial implementation of one shared
// standard, so an undeclared target often just means "never tried", not "incompatible") — but it's
// unproven, so warn instead of silently proceeding as if it were as supported as a declared target.
if (!ir.targets.includes(substrate)) {
  console.error(`open-autonomy: WARNING — profile "${profileArg}" declares targets: [${ir.targets.join(', ')}]; "${substrate}" is not among them (proceeding — an undeclared target may still work, just unproven for this profile).`);
}

// Substrate-selected DYNAMIC import (OA-01): only the chosen substrate's module is ever loaded, and only
// after arg parsing. This is defense-in-depth over the substrates' own lazy sibling-data reads — even a
// non-data-file init-time defect in the OTHER substrate (a syntax-level regression, a future top-level
// await) can no longer take down a `compile <profile> local` (or vice versa). Matches the house pattern
// bin/open-autonomy.ts already uses for verb-level delegation.
let out: CompileOutput;
try {
  out =
    substrate === 'local'
      ? (await import('@open-autonomy/substrate-local')).compileLocal(ir, { destDir: outDir, providerUrl })
      : (await import('@open-autonomy/substrate-github')).compileGithub(ir);
} catch (e) {
  // A lazy sibling-data read (emit.ts) throws an actionable packaging-bug Error naming the missing file —
  // surface just that message, not a raw Node stack trace, so a corrupted/partial install fails LOUDLY but
  // legibly. ONLY that known, self-describing error class gets the message-only treatment: anything else
  // (a TypeError inside a compiler, an empty-message Error) is a genuine bug whose stack must survive for
  // diagnosis — rethrow it unchanged.
  if (e instanceof Error && e.message.startsWith('open-autonomy: packaging bug')) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}

// Pre-materialize validation: every skill dir + resource file the compile will copy must exist BEFORE any
// file is written — a missing source used to surface as ENOENT after N files were already on disk, and
// --dry-run (no outDir, below) never even looked, so it reported success on a profile that couldn't
// actually compile. Runs for BOTH paths so they never disagree.
const missing = missingCopySourcesIn(out, profileDir);
if (missing.length) {
  console.error(
    `open-autonomy: profile "${profileArg}" is missing ${missing.length} source file(s) it would copy — nothing written:\n  ${missing.join('\n  ')}`,
  );
  process.exit(1);
}

// The SKILL.md name==folder contract (docs/SPEC.md#the-ir): a mismatch compiles clean today and then the
// launch trigger (`/name` / `$name`) never resolves — previously enforced only for this repo's OWN
// profiles/ (bin/check-profiles.ts), so an external profile author got no signal at all.
const badSkills = validateSkillFrontmatterIn(ir, profileDir);
if (badSkills.length) {
  console.error(`open-autonomy: profile "${profileArg}" has ${badSkills.length} skill/folder name mismatch(es) — nothing written:\n  ${badSkills.join('\n  ')}`);
  process.exit(1);
}

if (outDir) {
  // OA-04 namespace-collision gate: when the target already has a package.json, run the SAME check
  // preflight runs (bin/collision-check.ts) against it BEFORE writing anything. At compile time termfleet
  // typically isn't installed yet, so this mainly exercises checks A/B (the host root or a workspace
  // member is itself named termfleet/@termfleet/core/ztrack/open-autonomy) — exactly the case that
  // matters most (an operator who skips `preflight` still gets stopped before the time bomb is written).
  // Mirrors the clobber guard's --force escape hatch just below.
  //
  // SCOPED TO `local` ONLY: the collision hazard is entirely about the LOCAL termfleet runner's bare
  // imports (termfleet/@termfleet/core/ztrack). A `gh-actions` compile emits GitHub workflows and never
  // runs that runner, so gating it is pure false-alarm surface — and it would break this repo's OWN
  // dogfood regen (`compile profiles/self-driving github .`, per CLAUDE.md), which runs in a repo whose
  // root package is legitimately named "open-autonomy".
  if (substrate === 'local' && !force && existsSync(join(outDir, 'package.json'))) {
    const collisions = checkNamespaceCollisions(outDir);
    if (collisions.warns.length) {
      console.error(
        `open-autonomy: refusing to compile "${profileArg}" into "${outDir}" — namespace collision(s) between ` +
          `this repo and the runner's dependency namespace (see docs/adoption-fixes/OA-04-workspace-name-collision-detection.md):\n\n` +
          collisions.warns.map((w) => `  - ${w}`).join('\n\n') +
          `\n\nRe-run with --force to compile anyway (not recommended until the collision above is resolved).`,
      );
      process.exit(1);
    }
  }
  const readSource = (from: string) => readFileSync(join(profileDir, from), 'utf8');

  // The deletion-resurrection guard (OA-10, F-9): before writing anything, check whether this compile
  // would re-create a file the operator deliberately deleted since the prior install (listed in
  // `.open-autonomy/generated.json`, absent on disk, produced again by this compile). Runs BEFORE the
  // clobber guard so an operator sees "you deleted this" rather than a misleading "would overwrite" for a
  // path that doesn't even exist right now. `findResurrections` itself exempts install-owned/state paths
  // (OA-07's `.open-autonomy/paused`) — see packages/core/src/materialize.ts.
  const priorManifest = readGeneratedManifest(outDir);
  const resurrections = findResurrections(out, outDir, priorManifest);
  if (resurrections.length && !force) {
    console.error(
      `open-autonomy: compiling "${profileArg}" into "${outDir}" would re-create ${resurrections.length} file(s) you deleted:\n  ${resurrections.join('\n  ')}\n` +
        `These paths are listed in ${GENERATED_MANIFEST_PATH} from a prior install but no longer exist on disk — re-compiling would silently undo that deletion.\n` +
        `Nothing was written. Re-run with --force to re-create them (reported as resurrected below), or leave this compile out of your workflow until you've reconciled the deletion.`,
    );
    process.exit(1);
  }

  // The fresh-compile clobber guard (BL-14): refuse if this would silently overwrite existing files that
  // differ. NOT scoped to scaffold profiles only — an additive profile (simple-sdlc/simple-gh-sdlc) carries
  // `.claude/settings.json`, the single most likely path to pre-exist in a Claude-using repo, and any
  // same-named file under scripts/, standards/, scheduler/, .claude/skills/ also trips it. `.claude/
  // settings.json` gets a structured MERGE instead (settingsMergeStrategies, ./settings-merge.ts) whenever
  // the existing file parses as JSON — this only refuses for it when the existing file is NOT valid JSON.
  const clobbers = findClobbers(out, outDir, readSource, settingsMergeStrategies);
  if (clobbers.length && !force) {
    const disposition = (path: string) =>
      settingsMergeStrategies[path]
        ? '(exists but is not valid JSON — a structured merge needs parseable JSON; fix it or move it aside, then re-run — see docs/OPERATIONS.md#claude-settings)'
        : '(a file of yours with the same name)';
    const isScaffoldCollision = clobbers.some((p) => REPO_SHELL_FILES.has(p));
    let message =
      `open-autonomy: compiling "${profileArg}" into "${outDir}" would overwrite ${clobbers.length} existing file(s) that differ:\n` +
      clobbers.map((p) => `  ${p}   ${disposition(p)}`).join('\n') +
      `\nNothing was written. Re-run with --force to overwrite anyway, or move/rename your conflicting files first.`;
    if (isScaffoldCollision) {
      message +=
        `\n("${profileArg}" carries these as resources — it is a whole-repo SCAFFOLD, not an overlay onto an ` +
        `existing repo; for an existing repo, use an additive profile instead: simple-gh-sdlc, simple-sdlc, hello.)`;
    }
    console.error(message);
    process.exit(1);
  }

  // The printed receipt (OA-10): computed BEFORE materialize (merges/overwritten/resurrected all need the
  // PRE-write "existing" bytes, which materialize is about to replace).
  const merges = findMerges(out, outDir, readSource, settingsMergeStrategies);
  const overwritten = force ? clobbers : [];
  const resurrected = force ? resurrections : [];

  const written = materialize(out, outDir, readSource, settingsMergeStrategies);
  console.log(`installed ${written.length} files into ${outDir} — full list: ${GENERATED_MANIFEST_PATH}`);
  for (const { dir, count } of summarizeByDir(written)) {
    console.log(`  ${dir.padEnd(20)}${count} file${count === 1 ? '' : 's'}`);
  }
  for (const m of merges) console.log(`  merged: ${m.path} (${m.note})`);
  if (overwritten.length) console.log(`  overwritten (--force): ${overwritten.join(', ')}`);
  if (resurrected.length) console.log(`  resurrected (--force): ${resurrected.join(', ')}`);
  if (written.includes(CLAUDE_SETTINGS_PATH)) {
    console.log(
      `NOTE: ${CLAUDE_SETTINGS_PATH} wires a Claude Code Stop hook that runs at the end of EVERY Claude Code\n` +
        `session in this repo, including your OWN interactive ones (it no-ops unless\n` +
        `node_modules/ztrack/... exists). Details: docs/OPERATIONS.md#claude-settings`,
    );
  }
  if (substrate === 'local') {
    // A local install isn't runnable until termfleet + a logged-in agent CLI are up, and the start
    // command lives only here — print it so the user never has to read source to run the loop.
    const cd = outDir === '.' ? '' : `cd ${outDir} && `;
    // The local runner drives termfleet through its SDK (a node_modules dep), so termfleet is installed
    // IN the repo and run via `npx termfleet`, not a global PATH binary.
    const usesZtrack = profileMentions(profileDir, 'ztrack');
    let tracker = '';
    if (usesZtrack) {
      // The ztrack preset name (BL-29 — see bin/ztrack-preset.ts): an explicit
      // policy.box.tracker.ztrackPreset if the profile declares one, else the directory basename, which
      // degrades LOUDLY (not silently) when it doesn't match a known bundled preset.
      const { presetName, warning } = resolveZtrackPreset(ir, basename(profileDir), bundledProfileNames());
      if (warning) console.error(warning);
      // The init form depends on the code host (a GitHub code host syncs to GitHub Issues, a local-git one
      // is a board on disk). Show the RIGHT init — never a bare `ztrack init`, which is a silent no-op once
      // `.volter/` exists and never applies `--sync`.
      const trackerInit =
        ir.codeHost === 'github'
          ? `npx ztrack init --preset ${presetName} --sync github --repo <owner>/<repo>   (then: \`npx ztrack sync github\`)`
          : `npx ztrack init --preset ${presetName}   (then add work: \`npx ztrack issue create\`)`;
      tracker =
        `  4. Tracker: this profile's agents use ztrack — install it as a project dep (the validation\n` +
        `     preset \`import\`s it; a global install is NOT enough) and init it:\n` +
        `       ${cd}npm install -D ztrack  &&  ${trackerInit}\n`;
    }
    // The commit-the-harness step (OA-03): agents run in git worktrees, which only see COMMITTED files —
    // an uncommitted harness produces workers that die at launch with `Unknown command: /develop`. This is
    // the message every adopter sees at the moment the files land, so it can't be doc-only (docs/OPERATIONS.md
    // carries the same step in the quickstart). No push required: on the local-git code host, worktrees base
    // on the LOCAL trunk (OA-02); GitHub code host installs push as part of their normal PR flow anyway.
    // The staging list is DERIVED from what THIS compile actually wrote (`written`, reduced to top-level
    // dirs/files) — never hardcoded: a hardcoded list included `standards/`, which `hello` never emits, so
    // hello's exact printed command died with `fatal: pathspec 'standards/' did not match any files` and the
    // &&-chained commit never ran (nothing committed). Deriving per-profile keeps the printed command
    // correct for every profile, including future ones with a different footprint.
    const commitStepNum = tracker ? 5 : 4;
    const runStepNum = tracker ? 6 : 5;
    const stagePaths = [...new Set(written.map((p) => (p.includes('/') ? `${p.split('/')[0]}/` : p)))].sort();
    const commitStep =
      `  ${commitStepNum}. Commit the harness — agents run in git worktrees, which only see committed files\n` +
      `     (an uncommitted harness produces workers that die at launch with \`Unknown command: /develop\`):\n` +
      `       ${cd}git add ${stagePaths.join(' ')}  &&  git commit -m "Install the open-autonomy harness"\n` +
      `     (no push required on local-git; see docs/OPERATIONS.md#local-runner-quickstart, step 4)\n`;
    console.log(
      `\nNext steps (local loop — open-autonomy v${CLI_VERSION}):\n` +
        `  1. Prereqs: Node 22.18+ (the ztrack preset is .mts), tmux. Add termfleet to this repo (the runner uses its SDK),\n` +
        `     then run preflight (verifies termfleet's PTY native module loads, rebuilding only if needed; checks the doc-default\n` +
        `     ports for a foreign termfleet/other occupant + your CI's lockfile compat):\n` +
        `       ${cd}npm install termfleet  &&  npx --yes open-autonomy preflight\n` +
        `  2. Sign in to your agent CLI: run \`claude\` then \`/login\`  (or \`codex login\`)\n` +
        `  3. Start termfleet (console + a local provider) — a REPO-UNIQUE prefix/port pair, not the box defaults\n` +
        `     7373/7402 (a pre-existing termfleet on this box may already hold those):\n` +
        `       TF_PREFIX=$(basename "$PWD")-oa; TF_CONSOLE=7573; TF_PROVIDER=7602\n` +
        `       npx termfleet console serve --name "$TF_PREFIX" --port $TF_CONSOLE &\n` +
        `       npx termfleet provider serve --kind virtual-tmux --prefix "$TF_PREFIX" --count 1 --port $TF_PROVIDER &\n` +
        `       export TERMFLEET_PROVIDER_URL=http://127.0.0.1:$TF_PROVIDER   # PIN — required on a shared/lived-in box.\n` +
        `     Make the pin DURABLE (survives new shells/supervisors/re-runs) by recompiling with it:\n` +
        `       ${cd}npx open-autonomy compile ${profileArg} local . --provider-url "$TERMFLEET_PROVIDER_URL"\n` +
        tracker +
        commitStep +
        `  ${runStepNum}. Run the loop:  ${cd}node scheduler/run.mjs --once   (one tick)  |  node scheduler/run.mjs   (continuous)\n` +
        `  ${runStepNum + 1}. This install starts PAUSED (fresh installs start paused so a pre-existing backlog is\n` +
        `     never dispatched before you review it) — step ${runStepNum}'s first tick exits naming this.\n` +
        `     Review your tracker board (especially a pre-existing backlog), then unpause:  rm .open-autonomy/paused\n` +
        `  Full guide: https://github.com/volter-ai/open-autonomy/blob/v${CLI_VERSION}/docs/OPERATIONS.md#local-runner-quickstart`,
    );
  }
} else {
  console.log(compiledPaths(out).join('\n'));
}
