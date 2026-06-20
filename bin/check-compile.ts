#!/usr/bin/env bun
// Smoke-check that the open-autonomy profile compiles to a complete github installation:
//   - every copied file resolves to a real file in the profile (no dangling resource/skill),
//   - the agent runtime is injected from the @open-autonomy/agents package (no vendored mirror),
//   - the manifest is present.
// The profile (+ the agents package) is the single source of an installation; there is no hand-authored
// template to diff against. This guards against the profile/substrate drifting into a broken compile.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseIr } from '@open-autonomy/core';
import { compileGithub } from '@open-autonomy/substrate-github';

const P = 'profiles/self-driving';

const ir = parseIr(readFileSync(join(P, 'ir.yml'), 'utf8'));
const out = compileGithub(ir);

const errs: string[] = [];
for (const { from } of out.copies) if (!existsSync(join(P, from))) errs.push(`copy source missing: ${from}`);
const runtime = Object.keys(out.generated).filter((p) => p.startsWith('scripts/'));
if (runtime.length === 0) errs.push('no agent runtime injected from @open-autonomy/agents');
const paths = new Set([...Object.keys(out.generated), ...out.copies.map((c) => c.to)]);
if (!paths.has('.open-autonomy/autonomy.yml')) errs.push('manifest .open-autonomy/autonomy.yml not produced');

if (errs.length) {
  console.error(`compile check FAILED — ${errs.length}:\n  ${errs.join('\n  ')}`);
  process.exit(1);
}
console.log(`compile OK: ${P} -> github (${paths.size} files; ${out.copies.length} copies resolve; ${runtime.length} runtime files from @open-autonomy/agents)`);
