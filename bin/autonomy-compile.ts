#!/usr/bin/env bun
// Compile a profile (an `autonomy.ir.v1` ir.yml) onto a substrate, producing an installation.
//   bun bin/autonomy-compile.ts <profileName|profileDir> <local|gh-actions> [outDir] [--force]  ("github" accepted as alias)
// The first arg is either a BUNDLED profile name (e.g. `self-driving`, resolved to the profiles/ shipped
// with this package) or a path to a profile dir of your own. With no outDir, prints the installation's file
// list (a dry run). With outDir, materializes it — refusing if that would overwrite an existing file with
// DIFFERENT bytes (a scaffold-class profile like self-driving carries README.md/package.json/.gitignore
// as resources, so compiling it into an adopter's existing repo used to silently clobber them); --force
// overrides. This guard is fresh-compile only — `autonomy-upgrade.ts` legitimately overwrites in place.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIr, compiledPaths, materialize, missingCopySourcesIn, findClobbers, validateSkillFrontmatterIn } from '@open-autonomy/core';
import type { CompileOutput } from '@open-autonomy/core';
import { resolveZtrackPreset } from './ztrack-preset.ts';

// The bundled profiles ship next to this module's package root: at dist/cli.js when installed from npm
// (import.meta.url → dist/, profiles/ is its sibling), and at bin/ in the dev checkout (../profiles/). So
// `../profiles` resolves correctly in both. A bare name picks a bundled profile; an existing path wins first.
const profilesRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'profiles');
function resolveProfile(arg: string): string | undefined {
  if (existsSync(join(arg, 'ir.yml'))) return arg; // an explicit path to a profile dir
  const bundled = join(profilesRoot, arg); // a bare bundled-profile name
  if (existsSync(join(bundled, 'ir.yml'))) return bundled;
  return undefined;
}
function bundledProfileNames(): string[] {
  try { return readdirSync(profilesRoot).filter((n) => existsSync(join(profilesRoot, n, 'ir.yml'))).sort(); } catch { return []; }
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

// `--force` is a flag, not positional — filter it out before reading the three positional args.
const rawArgs = process.argv.slice(2);
const force = rawArgs.includes('--force');
const [profileArg, substrateArg, outDir] = rawArgs.filter((a) => a !== '--force');
// `gh-actions` is the runner-substrate; accept `github` as a back-compat alias. `local` unchanged.
const substrate = substrateArg === 'github' ? 'gh-actions' : substrateArg;
if (!profileArg || (substrate !== 'local' && substrate !== 'gh-actions')) {
  console.error(`usage: autonomy-compile <profileName|profileDir> <local|gh-actions> [outDir] [--force]\n  bundled profiles: ${bundledProfileNames().join(', ') || '(none found)'}`);
  process.exit(2);
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
      ? (await import('@open-autonomy/substrate-local')).compileLocal(ir)
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
  // The fresh-compile clobber guard (BL-14): refuse if this would silently overwrite existing files that
  // differ. An additive profile (simple-*, hello) carries none of the files that could collide, so this
  // is a no-op for them — only a whole-repo scaffold (self-driving) can trip it.
  if (!force) {
    const clobbers = findClobbers(out, outDir, (from) => readFileSync(join(profileDir, from), 'utf8'));
    if (clobbers.length) {
      console.error(
        `open-autonomy: compiling "${profileArg}" into "${outDir}" would overwrite ${clobbers.length} existing file(s) that differ:\n  ${clobbers.join('\n  ')}\n` +
          `"${profileArg}" is a whole-repo SCAFFOLD (it carries these as resources), not an overlay onto an existing repo — see README.md's "Run it on your repo" for the additive alternatives.\n` +
          `Re-run with --force to overwrite anyway, or compile an additive profile (simple-gh-sdlc, simple-sdlc, hello) into this repo instead.`,
      );
      process.exit(1);
    }
  }
  const written = materialize(out, outDir, (from) => readFileSync(join(profileDir, from), 'utf8'));
  console.log(`installed ${written.length} files into ${outDir}`);
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
    console.log(
      `\nNext steps (local loop):\n` +
        `  1. Prereqs: Node 22.18+ (the ztrack preset is .mts), tmux. Add termfleet to this repo (the runner uses its SDK),\n` +
        `     then run preflight (rebuilds node-pty for this Node + verifies the lockfile against your CI's Node):\n` +
        `       ${cd}npm install termfleet  &&  npx --yes open-autonomy preflight\n` +
        `  2. Sign in to your agent CLI: run \`claude\` then \`/login\`  (or \`codex login\`)\n` +
        `  3. Start termfleet (console + a local provider):\n` +
        `       npx termfleet console serve --name dev --port 7373 &\n` +
        `       npx termfleet provider serve --kind virtual-tmux --prefix dev --count 1 --port 7402 &\n` +
        tracker +
        `  ${tracker ? 5 : 4}. Run the loop:  ${cd}node scheduler/run.mjs --once   (one tick)  |  node scheduler/run.mjs   (continuous)\n` +
        `  Full guide: https://github.com/volter-ai/open-autonomy/blob/main/docs/OPERATIONS.md#local-runner-quickstart`,
    );
  }
} else {
  console.log(compiledPaths(out).join('\n'));
}
