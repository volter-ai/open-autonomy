#!/usr/bin/env bun
// open-autonomy — the unified CLI. One command, subcommands that delegate to the
// focused entrypoints. This is the idiomatic single front door (the Prisma/Nx
// shape: `open-autonomy <verb> …`) so adoption is one command, not "clone the
// repo and learn three scripts".
//
//   open-autonomy compile <profileName|profileDir> <local|gh-actions> [outDir]
//   open-autonomy lint <profileDir>
//   open-autonomy conformance <exec|termfleet|gh-actions> [probeAgent]
//   open-autonomy upgrade --profile <dir> --target <dir> --substrate <local|gh-actions> [--apply]
//
// Each subcommand reads process.argv.slice(2); we re-frame argv so the delegated
// entrypoint sees only its own arguments, then import it (its top-level runs).
// Static import of the shared bundled-profiles helper is safe here ONLY because that helper imports
// nothing but node:fs/node:path (see bin/bundled-profiles.ts) — never a substrate package. Every substrate
// package stays behind the per-verb dynamic `import()`s below, so `--help` keeps working even when
// packaging is broken (OA-01) — this import must never regress that property.
import { bundledProfileNames } from './bundled-profiles.ts';
// node: builtins only (never @open-autonomy/*) — see open-autonomy-help.test.ts's "lazy-import guard",
// which statically forbids exactly that on this file. Used only inside the 'install' case below.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

export {}; // make this a module so top-level await is allowed (delegation uses dynamic import)

const HELP = `open-autonomy <command> [args]

  compile <profileName|profileDir> <local|gh-actions> [outDir]  compile a profile (local supports --provider-url, --managed-provider-name, --provider-runtime-dir)
  lint <profileDir>                                             validate a profile of your own: parses + compiles to every declared target + checks skill/folder names, writes nothing
  preflight                                                     make an adopter repo install-ready (verifies termfleet's PTY module loads + lockfile vs CI Node); run after installing the runner deps
  doctor [--live] [--json] [--branch-prefix oa-doctor]          prove a compiled local-runner install end-to-end (self/env/provider/auth/harness/skills[/live]); run after preflight + before leaving the loop unattended
  harness-push [--repo o/r --branch b]                          push an OA harness/skill update past the enforce_admins gate (relax -> push -> restore)
  conformance <exec|termfleet|gh-actions> [probeAgent]          run the substrate conformance battery
  upgrade --profile <dir> --target <dir> --substrate <target>   re-compile an installation in place (dry run without --apply)
  install [args]                                                (TE.8) the one-shot install agent — SOURCE-CHECKOUT ONLY (see below)

Adopt into the CURRENT repo (existing repo — additive overlays, write no README.md/package.json/.gitignore):
  npx open-autonomy compile simple-gh-sdlc gh-actions .   # GitHub Actions runner, auto-merging PRs
  npx open-autonomy compile simple-gh-sdlc local .        # agents on your machine, PRs on GitHub
  npx open-autonomy compile simple-sdlc local .           # fully local, PR-free (ztrack board)
Start a NEW/dedicated repo (whole-repo SCAFFOLD — carries README.md/package.json/.gitignore as resources):
  npx open-autonomy compile self-driving gh-actions .
("github" still accepted as an alias for gh-actions)
Bundled profiles: ${bundledProfileNames().join(', ')}

Run a subcommand with no/invalid arguments to see its specific usage.`;

const [sub, ...rest] = process.argv.slice(2);

if (!sub || sub === 'help' || sub === '--help' || sub === '-h') {
  console.log(HELP);
  process.exit(sub ? 0 : 2);
}

// Re-frame: delegated entrypoints parse process.argv.slice(2), so present them
// only their own args (drop the subcommand token).
process.argv = [process.argv[0]!, process.argv[1]!, ...rest];

switch (sub) {
  case 'compile':
    await import('./autonomy-compile.ts');
    break;
  case 'lint':
    await import('./lint-profile.ts');
    break;
  case 'preflight': {
    // preflight.ts wraps its driver in an exported runPreflightCli() (never auto-run on import) so
    // bin/preflight.test.ts can import its extracted check functions directly without triggering a
    // top-level `process.exit()` as a side effect of loading the module.
    const { runPreflightCli } = await import('./preflight.ts');
    await runPreflightCli();
    break;
  }
  case 'doctor':
    await import('./doctor.ts');
    break;
  case 'harness-push':
    await import('./harness-push.ts');
    break;
  case 'conformance':
    await import('./autonomy-conformance.ts');
    break;
  case 'upgrade':
    await import('./autonomy-upgrade.ts');
    break;
  case 'install': {
    // TE.8: delegate (spawn, NEVER a dynamic `import('./install.ts')`) to the sibling bin/install.ts
    // orchestrator. Two reasons this is a spawn, unlike every other case above: (1) bin/install.ts —
    // like every TE.1-TE.7 file it chains — is dev-time-only monorepo tooling that is NEVER bundled into
    // dist/cli.js (no scripts/bundle-data-files.ts entry; see install-execute.ts's own header), so a
    // dynamic import here would work in this source checkout but 404 in a real published tarball with no
    // honest fallback message; (2) bin/install.ts keeps the same `if (import.meta.main)` CLI-entry guard
    // every TE.1-TE.7 sibling uses (so it's independently runnable as `bun bin/install.ts ...`) — that
    // guard is FALSE for a dynamically-imported non-entry module, so its CLI body would silently never run
    // if imported instead of spawned. Mirrors packages/local-runner-cli/src/install-delegate.ts's own
    // spawn-never-import rule for `oa install` exactly (see that file's header for the fuller rationale).
    //
    // DEVIATION NOTE (architecture decision, task brief said "packages/core/src/cli.ts"): that file is a
    // small, unrelated library CLI (`runCli(runner, argv)`: launch|get|list|update|cancel over the Runner
    // contract) — it has nothing to do with npm publishing. THIS file, bin/open-autonomy.ts, is the actual
    // npm-publish target: scripts/build-cli.ts bundles it (`bun build bin/open-autonomy.ts --target=node
    // --outfile dist/cli.js`), and package.json's own `bin` field points `open-autonomy`/`oa` at
    // dist/cli.js. So the "install subcommand stub on the npm-publish target" lives here instead.
    //
    // A PLAIN repo-root-relative literal (never `dirname(fileURLToPath(import.meta.url))`) — exactly
    // install-execute.ts's own AUTONOMY_COMPILE_SCRIPT precedent (see that file's header comment verbatim):
    // this file is always invoked as `bun bin/open-autonomy.ts ...` (or `bun run autonomy ...`) from the
    // repo root, so a bare 'bin/install.ts' resolves correctly without import.meta.url. Using the
    // import.meta.url idiom here instead would make scripts/build-cli.ts's own static sibling-read scanner
    // (SIBLING_IDIOM) flag it as an unresolvable dist/cli.js path — correctly, since install.ts is
    // deliberately NEVER bundled (same reasoning as every TE.1-TE.7 file above) — so a computed reference
    // would be a permanent, unfixable false positive, not a bug to paper over with a DATA_FILES entry this
    // bundle has no business carrying.
    const scriptPath = 'bin/install.ts';
    if (!existsSync(scriptPath)) {
      console.error(
        `open-autonomy install: bin/install.ts not found next to this CLI (looked at ${scriptPath}) — ` +
          "expected when running from a published npm package (dist/cli.js never bundles it; it is dev-" +
          'time-only monorepo tooling, same as every TE.1-TE.7 file it chains). The one-shot install agent ' +
          "is SOURCE-CHECKOUT-ONLY today (T0.1's frozen decision: this covers neither open-autonomy 0.4.2 " +
          "nor @volter/oa once either is published). Clone volter-ai/open-autonomy and run " +
          '`bun bin/install.ts <targetRepoDir> --help` from within that checkout instead.',
      );
      process.exit(1);
    }
    const r = spawnSync('bun', [scriptPath, ...rest], { stdio: 'inherit' });
    process.exit(r.status ?? 1);
    break;
  }
  default:
    console.error(`open-autonomy: unknown command "${sub}"\n\n${HELP}`);
    process.exit(2);
}
