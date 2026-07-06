#!/usr/bin/env bun
// Lint a profile of your own: parse, compile to every substrate it DECLARES (its `targets:`), and run the
// same pre-materialize checks the compile CLI runs before writing a byte — without writing anything.
//   bun bin/lint-profile.ts <profileDir>
// This is BL-22 dev/04's answer to "no `open-autonomy lint`": bin/check-profiles.ts already runs this
// exact battery (plus a same-repo-only drift guard) for the profiles/ this package ships; an external
// profile author had no way to run it themselves. `lint` is that battery, minus the in-repo-only parts
// (the cross-profile byte-identity guard and the scripts/*.ts import-closure check, both meaningless for
// a single arbitrary profile dir), exposed through the published CLI.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseIr, missingCopySourcesIn, validateSkillFrontmatterIn } from '@open-autonomy/core';
import { compileGithub } from '@open-autonomy/substrate-github';
import { compileLocal } from '@open-autonomy/substrate-local';

const [profileDir] = process.argv.slice(2);
if (!profileDir) {
  console.error('usage: open-autonomy lint <profileDir>');
  process.exit(2);
}
if (!existsSync(join(profileDir, 'ir.yml'))) {
  console.error(`open-autonomy lint: no ir.yml at "${profileDir}"`);
  process.exit(2);
}

const errs: string[] = [];
let ir;
try {
  ir = parseIr(readFileSync(join(profileDir, 'ir.yml'), 'utf8'));
} catch (e) {
  console.error(`open-autonomy lint: ${(e as Error).message}`);
  process.exit(1);
}

if (!ir.targets.length) errs.push('targets: [] — a profile must declare at least one substrate it compiles to');

for (const target of ir.targets) {
  const out = target === 'gh-actions' ? compileGithub(ir) : target === 'local' ? compileLocal(ir) : undefined;
  if (!out) {
    errs.push(`unknown target "${target}" (known: gh-actions, local)`);
    continue;
  }
  const missing = missingCopySourcesIn(out, profileDir);
  for (const m of missing) errs.push(`${target}: missing copy source: ${m}`);
  if (!Object.keys(out.generated).length) errs.push(`${target}: compile produced no files`);
  console.log(`lint OK: ${target} (${Object.keys(out.generated).length} generated, ${out.copies.length} copies resolve)`);
}

for (const e of validateSkillFrontmatterIn(ir, profileDir)) errs.push(e);

if (errs.length) {
  console.error(`\nlint FAILED — ${errs.length}:\n  ${errs.join('\n  ')}`);
  process.exit(1);
}
console.log(`\nlint OK: "${profileDir}" compiles clean on [${ir.targets.join(', ')}]`);
