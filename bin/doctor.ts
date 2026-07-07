#!/usr/bin/env node
// open-autonomy doctor — the CLI entry (OA-18). The check implementations + all shared types live in
// bin/doctor-checks.ts, which is side-effect-free on import (so bin/doctor-checks.test.ts can unit-test
// each check directly); THIS file is the thin wrapper that parses argv, runs the checks, prints/exits —
// matching every other bin/*.ts verb module's convention of executing unconditionally at the top level
// (bin/open-autonomy.ts's switch reaches this via `await import('./doctor.ts')`; there is no
// `import.meta.main` guard here, deliberately, for the same reason autonomy-compile.ts/preflight.ts/etc.
// have none — `import.meta.main` is only true for the process ENTRY module, which is always
// bin/open-autonomy.ts, so a guard here would make this file's CLI body never run in real use).
//
//   npx open-autonomy doctor [--live] [--json] [--branch-prefix oa-doctor]
import { parseDoctorArgs, renderHuman, runDoctor, USAGE } from './doctor-checks.ts';

// Write `text` to a stream, then exit with `code` ONLY after the write has flushed — a bare
// `console.log(...); process.exit()` can truncate a long payload (a big FAIL detail, or --json for a
// failing install) because stdout to a pipe is asynchronous. The explicit exit (rather than just setting
// process.exitCode) is still needed: check 3/7's termfleet SDK client can leave a socket.io handle
// retrying in the background even after disconnect(), which would keep the process alive past its verdict.
function writeThenExit(stream: NodeJS.WriteStream, text: string, code: number): void {
  stream.write(`${text}\n`, () => process.exit(code));
}

async function main(): Promise<void> {
  const parsed = parseDoctorArgs(process.argv.slice(2));
  if ('help' in parsed) {
    writeThenExit(process.stdout, USAGE, 0); // --help is NOT a usage error: stdout, exit 0
    return;
  }
  if ('usageError' in parsed) {
    writeThenExit(process.stderr, parsed.usageError, 2); // a bad/missing argument: stderr, exit 2
    return;
  }
  const report = await runDoctor(process.cwd(), { live: parsed.live, branchPrefix: parsed.branchPrefix });
  const code = report.verdict === 'FAIL' ? 1 : 0;
  if (parsed.json) {
    // Ordering (AC-15) is preserved: runDoctor's push order IS the audit's failure-chain order -- no
    // re-sort here, so a future accidental reorder in runDoctor is caught by the ordering test, not masked.
    writeThenExit(process.stdout, JSON.stringify({ checks: report.checks, verdict: report.verdict }, null, 2), code);
  } else {
    writeThenExit(process.stdout, renderHuman(report), code);
  }
}

await main();
