#!/usr/bin/env bun
// Compile a profile (an `autonomy.ir.v1` ir.yml) onto a substrate, producing an installation.
//   bun bin/autonomy-compile.ts <profileDir> <local|github> [outDir]
// With no outDir, prints the installation's file list (a dry run). With outDir, materializes it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseIr, compiledPaths, materialize } from '@open-autonomy/core';
import { compileLocal } from '@open-autonomy/substrate-local';
import { compileGithub } from '@open-autonomy/substrate-github';

const [profileDir, substrate, outDir] = process.argv.slice(2);
if (!profileDir || (substrate !== 'local' && substrate !== 'github')) {
  console.error('usage: autonomy-compile <profileDir> <local|github> [outDir]');
  process.exit(2);
}

const ir = parseIr(readFileSync(join(profileDir, 'ir.yml'), 'utf8'));
const out = substrate === 'local' ? compileLocal(ir) : compileGithub(ir);

if (outDir) {
  const written = materialize(out, outDir, (from) => readFileSync(join(profileDir, from), 'utf8'));
  console.log(`installed ${written.length} files into ${outDir}`);
} else {
  console.log(compiledPaths(out).join('\n'));
}
