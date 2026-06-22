#!/usr/bin/env bun
// Enforce the "compiled default is the single source" invariant for MODEL/PROVIDER selection.
//
// A provision manifest (bench cell template + workload seeds) sets repo VARIABLES on a freshly-provisioned
// repo. The compiled profile already resolves the model/provider via `vars.X || 'deepseek/deepseek-v4-flash'`
// fallbacks, so a provision manifest must NOT also hardcode PUBLIC_AGENT_*_MODEL/_PROVIDER/MODELS — a set
// repo variable OVERRIDES the compiled fallback, duplicating the default in a second, drift-prone place.
// That is exactly how a stale `gpt-4o-mini`/`openai` copy survived a "stop seeding model vars" refactor
// (it cleaned the manifests it knew about, not a parallel copy) and broke every live PM/review run until a
// real bench surfaced it. This check makes the invariant a gate, not a convention.
//
// Budgets/limits (PUBLIC_AGENT_*_MAX_USD_CENTS, _LIMIT, _MAX_*) and proxy endpoint config (MODEL_PROXY_URL,
// MODEL_PROXY_OIDC_AUDIENCE) are legitimate operator knobs and stay.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// A model/provider SELECTION variable — the thing the compile owns. NOT MODEL_PROXY_* (endpoint config).
const isModelSelectionVar = (name: string): boolean =>
  /^PUBLIC_AGENT_([A-Z]+_)?(MODEL|MODELS|PROVIDER)$/.test(name);

function findProvisionManifests(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...findProvisionManifests(full));
    else if (/^provision.*\.json$/.test(entry)) out.push(full);
  }
  return out;
}

const manifests = findProvisionManifests('.');
const violations: string[] = [];
for (const path of manifests) {
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as { variables?: Array<{ name: string }> };
  const offending = (manifest.variables ?? []).map((v) => v.name).filter(isModelSelectionVar);
  if (offending.length) violations.push(`${path}: ${offending.join(', ')}`);
}

if (violations.length) {
  console.error(
    `provision manifests must not set model/provider selection vars (the compiled default is the single ` +
      `source) — ${violations.length}:\n  ${violations.join('\n  ')}\n` +
      `  fix: remove those entries; the workflow falls back to the compiled deepseek/anthropic default.`,
  );
  process.exit(1);
}
console.log(`provision OK: ${manifests.length} manifest(s) set no model/provider vars (single source = the compile)`);
