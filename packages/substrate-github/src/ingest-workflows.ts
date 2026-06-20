// github ingest: a manifest → agents (docs/AUTONOMY-IR.md). There is no `raw` — the IR is a standard,
// not an escape hatch. Hand-authored workflow files that correspond to an agent are regenerated; any
// that don't (repo CI, substrate infra) are repo-owned files, recorded as resources, never carried IR.
import type { AutonomyIR } from '@open-autonomy/core';
import { ingestAutonomy, type OAManifest } from './ingest-manifest';

/** Full decompile of an open-autonomy checkout: the manifest supplies the agents/policy/resources. A
 * workflow file is repo-owned (a resource) unless it is the generated workflow of an ingested agent. */
export function ingestGithub(manifest: OAManifest, workflows: Record<string, string> = {}): AutonomyIR {
  const ir = ingestAutonomy(manifest);
  const agentNames = new Set(Object.keys(ir.agents));
  const extra = Object.keys(workflows)
    .map((name) => `.github/workflows/${name}.yml`)
    .filter((path) => !agentNames.has(path.replace('.github/workflows/', '').replace('.yml', '')));
  if (extra.length) ir.resources = [...new Set([...ir.resources, ...extra])].sort();
  return ir;
}
