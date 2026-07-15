#!/usr/bin/env node
// The `oa` executable. Deliberately plain, portable TS (erasable syntax only — no enums/namespaces/
// parameter-property shorthand) so Node's built-in type-stripping (unflagged since Node 22.6, and this
// package's own engines floor is 22.18+, matching the root open-autonomy package) can run this file
// directly via `node`; the package remains straightforward to execute from a source checkout. No
// bundler/build step is required to use this package from within the OA monorepo or a bun-based
// adopter repo (bun also runs .ts directly); a real npm publish would additionally ship a built dist/ —
// out of scope here (this PR does not publish).
import { runCli } from '../index.ts';

const code = await runCli(process.argv.slice(2));
process.exit(code);
