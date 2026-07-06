#!/usr/bin/env bun
// Every `PUBLIC_AGENT_*`/`MODEL_PROXY_*` variable documented in docs/OPERATIONS.md's rollout table is a
// variable something actually reads — or it doesn't belong in the table. A dead row is worse than no row:
// an adopter sets it and nothing happens (docs rot — the exact BL-17 audit finding: 11 of 18 rows were
// dead). Symmetrically, a `PUBLIC_AGENT_*` variable an emitted workflow reads but the table omits is an
// adopter-invisible knob. This gate makes both states unrepresentable going forward — mirrors the
// check-policy-consumers pattern (a declared thing must have a read site) for this repo's *doc* table
// instead of the profile's policy box.
//
// A "read" is a real read site: `vars.NAME` in an emitted GitHub Actions workflow
// (.github/workflows/*.yml), or `process.env.NAME` / `process.env['NAME']` in the runtime
// (.github/*.mjs, scripts/*.ts — the repo root IS the compiled installation, so scanning root scans
// exactly what's emitted). `*.test.ts` files never count — a fixture naming a variable is not a
// production read. This is deliberately narrower than a bare substring grep: workflows also carry local
// env aliases (e.g. `PUBLIC_AGENT_CITED_VERSION` is a step-local rename of
// `vars.PUBLIC_AGENT_CLAUDE_CODE_VERSION`) that are not themselves reads of a repo variable and would be
// false-positive "undocumented" hits under a naive scan.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DOC_VAR = /^\|\s*`((?:PUBLIC_AGENT|MODEL_PROXY)_[A-Z0-9_]+)`\s*\|/gm;
const VARS_READ = /\bvars\.([A-Za-z0-9_]+)/g;
const ENV_READ = /\bprocess\.env(?:\.([A-Za-z0-9_]+)|\[\s*['"]([A-Za-z0-9_]+)['"]\s*\])/g;

export function parseDocVars(opsText: string): string[] {
  const out: string[] = [];
  for (const m of opsText.matchAll(DOC_VAR)) out.push(m[1] as string);
  return [...new Set(out)];
}

export function extractReadSites(corpusText: string): Set<string> {
  const out = new Set<string>();
  for (const m of corpusText.matchAll(VARS_READ)) out.add(m[1] as string);
  for (const m of corpusText.matchAll(ENV_READ)) out.add((m[1] ?? m[2]) as string);
  return out;
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const p = join(dir, entry);
    if (entry === 'node_modules' || entry === '.git') continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// The read-site corpus: exactly the files the emitted install can actually execute.
export function readerCorpusText(root = '.'): string {
  const files: string[] = [];
  for (const f of walk(join(root, '.github', 'workflows'))) {
    if (f.endsWith('.yml') || f.endsWith('.yaml')) files.push(f);
  }
  for (const entry of (() => {
    try {
      return readdirSync(join(root, '.github'));
    } catch {
      return [];
    }
  })()) {
    if (entry.endsWith('.mjs')) files.push(join(root, '.github', entry));
  }
  for (const f of walk(join(root, 'scripts'))) {
    if (f.endsWith('.ts') && !f.endsWith('.test.ts')) files.push(f);
  }
  return files.map((f) => readFileSync(f, 'utf8')).join('\n');
}

// docs rot: a documented var with no read site anywhere in the corpus.
export function noReadSite(docVars: string[], corpusText: string): string[] {
  const reads = extractReadSites(corpusText);
  return docVars.filter((v) => !reads.has(v));
}

// undocumented: a PUBLIC_AGENT_* var the corpus reads but the table never lists.
export function undocumentedPublicAgentVars(docVars: string[], corpusText: string): string[] {
  const reads = extractReadSites(corpusText);
  const docSet = new Set(docVars);
  return [...reads].filter((v) => v.startsWith('PUBLIC_AGENT_') && !docSet.has(v)).sort();
}

if (import.meta.main) {
  const opsText = readFileSync('docs/OPERATIONS.md', 'utf8');
  const docVars = parseDocVars(opsText);
  const corpus = readerCorpusText('.');
  const dead = noReadSite(docVars, corpus);
  const undocumented = undocumentedPublicAgentVars(docVars, corpus);
  const failures: string[] = [];
  if (dead.length) {
    failures.push(`documented with NO read site (docs rot — fix the table row or wire a reader): ${dead.join(', ')}`);
  }
  if (undocumented.length) {
    failures.push(`read by the emitted install but missing from the table (undocumented var): ${undocumented.join(', ')}`);
  }
  if (failures.length) {
    process.stderr.write(`doc-vars FAIL — docs/OPERATIONS.md's rollout table is out of sync with the emitted install:\n` + failures.map((f) => `  ${f}\n`).join(''));
    process.exit(1);
  }
  process.stdout.write(
    `doc-vars OK: all ${docVars.length} documented var(s) have a read site; no undocumented PUBLIC_AGENT_* var\n`,
  );
}
