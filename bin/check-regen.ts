#!/usr/bin/env bun
// CI gate: templates/self-driving-repo MUST equal compile(profiles/repo-maintenance, github).
// This enforces "reuse == regenerate" — templates/ is a generated artifact whose single source is
// the profile (the recipe) + the github substrate (which injects the runtime). If they drift, the
// profile or the substrate changed without regenerating the template; fail loudly.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { parseIr } from '@open-autonomy/core';
import { compileGithub } from '@open-autonomy/substrate-github';

const P = 'profiles/repo-maintenance';
const T = 'templates/self-driving-repo';

const ir = parseIr(readFileSync(join(P, 'ir.yml'), 'utf8'));
const out = compileGithub(ir);

// the installation compile would produce: generated files + resolved copies (read from the profile)
const produced = new Map<string, string>();
for (const [p, c] of Object.entries(out.generated)) produced.set(p, c);
for (const { from, to } of out.copies) produced.set(to, readFileSync(join(P, from), 'utf8'));

const tracked = execSync(`cd ${T} && git ls-files`, { encoding: 'utf8' }).trim().split('\n');
const diffs: string[] = [];
for (const f of tracked) {
  const got = produced.get(f);
  if (got == null) diffs.push(`MISSING (template has, compile drops): ${f}`);
  else if (got !== readFileSync(join(T, f), 'utf8')) diffs.push(`DIFF: ${f}`);
}
for (const p of produced.keys()) if (!tracked.includes(p)) diffs.push(`EXTRA (compile adds, template lacks): ${p}`);

if (diffs.length) {
  console.error(`regen check FAILED — ${diffs.length} difference(s):\n  ${diffs.join('\n  ')}`);
  console.error(`\nfix: re-run the profile→template generator, or reconcile the profile/substrate.`);
  process.exit(1);
}
console.log(`regen OK: compile(${P}, github) == ${T} — ${tracked.length} files byte-identical`);
