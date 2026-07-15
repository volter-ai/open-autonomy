#!/usr/bin/env node
// Source entry for the compiled `oa` executable. The published/runtime bin is dist/oa.js: Node version
// does not prove that a distributor compiled in TypeScript stripping, so portability is established by
// an ordinary JavaScript bundle rather than a host-build assumption.
import { runCli } from '../index.ts';

const code = await runCli(process.argv.slice(2));
process.exit(code);
