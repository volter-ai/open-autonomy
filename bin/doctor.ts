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
import { parseDoctorArgs, printHuman, runDoctor } from './doctor-checks.ts';

async function main(): Promise<void> {
  const parsed = parseDoctorArgs(process.argv.slice(2));
  if ('usageError' in parsed) {
    console.error(parsed.usageError);
    process.exit(2); // explicit exit -- see the note below on why this verb never merely sets exitCode
  }
  const report = await runDoctor(process.cwd(), { live: parsed.live, branchPrefix: parsed.branchPrefix });
  if (parsed.json) {
    // Ordering (AC-15) is preserved: runDoctor's push order IS the audit's failure-chain order -- no
    // re-sort here, so a future accidental reorder in runDoctor is caught by the ordering test, not masked.
    console.log(JSON.stringify({ checks: report.checks, verdict: report.verdict }, null, 2));
  } else {
    printHuman(report);
  }
  // An EXPLICIT process.exit(), not `process.exitCode = …` (which merely lets the process exit naturally
  // once the event loop drains): check 3/7's termfleet SDK client can leave a socket.io connection retrying
  // in the background against a non-cooperating occupant even after `client.disconnect()` — that dangling
  // handle would otherwise keep this CLI running long after its own verdict is already printed, turning a
  // foreign-occupant FAIL (the exact case check 3 exists to catch) into a hang instead of a clean exit.
  process.exit(report.verdict === 'FAIL' ? 1 : 0);
}

await main();
