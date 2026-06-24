#!/usr/bin/env bun
// open-autonomy — the unified CLI. One command, subcommands that delegate to the
// focused entrypoints. This is the idiomatic single front door (the Prisma/Nx
// shape: `open-autonomy <verb> …`) so adoption is one command, not "clone the
// repo and learn three scripts".
//
//   open-autonomy compile <profileName|profileDir> <local|github> [outDir]
//   open-autonomy conformance <exec|termfleet|github> [probeAgent]
//   open-autonomy upgrade --profile <dir> --target <dir> [--apply]
//
// Each subcommand reads process.argv.slice(2); we re-frame argv so the delegated
// entrypoint sees only its own arguments, then import it (its top-level runs).
export {}; // make this a module so top-level await is allowed (delegation uses dynamic import)

const HELP = `open-autonomy <command> [args]

  compile <profileName|profileDir> <local|github> [outDir]  compile a profile onto a substrate (dry run without outDir)
  conformance <exec|termfleet|github> [probeAgent]          run the substrate conformance battery
  upgrade --profile <dir> --target <dir> [--apply]          re-compile an installation in place (dry run without --apply)

Adopt into the current repo:  npx open-autonomy compile self-driving github .  (bundled profiles: self-driving, simple-sdlc, hello)

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
  case 'conformance':
    await import('./autonomy-conformance.ts');
    break;
  case 'upgrade':
    await import('./autonomy-upgrade.ts');
    break;
  default:
    console.error(`open-autonomy: unknown command "${sub}"\n\n${HELP}`);
    process.exit(2);
}
