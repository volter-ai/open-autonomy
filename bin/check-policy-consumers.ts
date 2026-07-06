#!/usr/bin/env bun
// Every `policy.box` key is a PARAMETER WITH A READER — or it doesn't exist. A key nobody reads is worse
// than prose: it *looks* enforced (an operator trusts it; an agent cites it) while nothing consumes it —
// the exact failure PROFILE-CONFIG-AUDIT.md §2 documented (nine dead keys, one of which let a labeled PR
// auto-merge through a "declared" block). This gate makes that state unrepresentable going forward.
//
// A parameter is each key directly under a box section (`autonomy.max_open_agent_prs`); its value shape is
// irrelevant (a map like planner.priority_labels is ONE parameter). It has a reader when its NAME appears
// (whole-word) in either legitimate channel:
//   (a) deterministic — engine/runtime code (packages/*/src, scripts/, bin/), or
//   (b) agent-at-runtime — the DECLARING profile's own files (a skill instructing "read the key from
//       .open-autonomy/autonomy.yml").
// Tests never count (a fixture is not a reader), the profile's ir.yml never counts (the declaration is not
// a read), and neither does a compiled autonomy.yml (a re-declaration). This is a grep-level check: a
// comment merely naming a key can satisfy it — the gate catches dead keys, not dishonest comments.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

export function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (entry === 'node_modules' || entry === '.git' || entry === 'runtime') continue; // runtime/ mirrors scripts/
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const TEXT_EXT = /\.(ts|mts|mjs|js|md|yml|yaml|json|sh)$/;
const isReaderFile = (p: string): boolean =>
  TEXT_EXT.test(p) && !/\.test\.(ts|mts|mjs|js)$/.test(p) && basename(p) !== 'ir.yml' && basename(p) !== 'autonomy.yml';

// One parameter per key directly under a box section; a scalar-valued section is itself one parameter.
export function leafParams(box: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [section, v] of Object.entries(box ?? {})) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const param of Object.keys(v as Record<string, unknown>)) out.push(`${section}.${param}`);
    } else {
      out.push(section);
    }
  }
  return out;
}

export function deadKeys(profileDir: string, engineCorpus: string): string[] {
  const ir = Bun.YAML.parse(readFileSync(join(profileDir, 'ir.yml'), 'utf8')) as {
    policy?: { box?: Record<string, unknown> };
  };
  const params = leafParams(ir?.policy?.box ?? {});
  if (!params.length) return [];
  const profileCorpus = walk(profileDir)
    .filter(isReaderFile)
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');
  const corpus = `${engineCorpus}\n${profileCorpus}`;
  return params.filter((p) => {
    const token = p.split('.').pop() as string;
    return !new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(corpus);
  });
}

export function engineCorpusText(root = '.'): string {
  const dirs = ['packages/core/src', 'packages/substrate-github/src', 'packages/substrate-local/src', 'scripts', 'bin'];
  const files: string[] = [];
  for (const d of dirs) {
    try {
      walk(join(root, d), files);
    } catch {
      /* a missing dir (e.g. in a fixture) is simply not corpus */
    }
  }
  return files
    .filter(isReaderFile)
    .filter((f) => basename(f) !== basename(import.meta.path)) // this gate is not a reader
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');
}

if (import.meta.main) {
  const engine = engineCorpusText('.');
  const failures: string[] = [];
  for (const entry of readdirSync('profiles')) {
    const dir = join('profiles', entry);
    try {
      if (!statSync(join(dir, 'ir.yml')).isFile()) continue;
    } catch {
      continue;
    }
    for (const key of deadKeys(dir, engine)) failures.push(`${dir}: policy.box.${key}`);
  }
  if (failures.length) {
    process.stderr.write(
      `policy-consumers FAIL — ${failures.length} declared key(s) with NO read site (wire a reader, or move the norm to the owning skill/doc and delete the key):\n` +
        failures.map((f) => `  ${f}\n`).join(''),
    );
    process.exit(1);
  }
  process.stdout.write('policy-consumers OK: every declared policy.box key has a read site (engine/runtime or the profile\'s own files)\n');
}
