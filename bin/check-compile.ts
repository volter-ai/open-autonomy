#!/usr/bin/env bun
// Smoke-check that the open-autonomy profile compiles to a complete github installation:
//   - every copied file resolves to a real file in the profile (no dangling resource/skill),
//   - every injected runtime file equals the vendored mirror (which check:runtime-sync ties to scripts/),
//   - the manifest is present.
// The profile (+ injected runtime) is the single source of an installation; there is no hand-authored
// template to diff against. This guards against the profile/substrate drifting into a broken compile.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseIr } from '@open-autonomy/core';
import { compileGithub } from '@open-autonomy/substrate-github';

const P = 'profiles/self-driving';
const MIRROR = 'packages/substrate-github/src/runtime';

const ir = parseIr(readFileSync(join(P, 'ir.yml'), 'utf8'));
const out = compileGithub(ir);

const errs: string[] = [];
for (const { from } of out.copies) if (!existsSync(join(P, from))) errs.push(`copy source missing: ${from}`);
for (const [p, c] of Object.entries(out.generated)) {
  if (!p.startsWith('scripts/')) continue;
  const mirror = join(MIRROR, p.slice('scripts/'.length));
  if (!existsSync(mirror) || readFileSync(mirror, 'utf8') !== c) errs.push(`injected runtime != mirror: ${p}`);
}
const paths = new Set([...Object.keys(out.generated), ...out.copies.map((c) => c.to)]);
if (!paths.has('.open-autonomy/autonomy.yml')) errs.push('manifest .open-autonomy/autonomy.yml not produced');

if (errs.length) {
  console.error(`compile check FAILED — ${errs.length}:\n  ${errs.join('\n  ')}`);
  process.exit(1);
}
console.log(`compile OK: ${P} -> github (${paths.size} files; ${out.copies.length} copies resolve; runtime injected == mirror)`);
