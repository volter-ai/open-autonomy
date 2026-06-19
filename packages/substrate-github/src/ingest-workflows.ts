// Decompile a hand-authored GitHub workflow file into a carried IR workflow. The IR doesn't model
// the job body, so it carries the file VERBATIM (raw) and emits it byte-identical — the symmetric
// twin of ztrack copying a `run:` script. Triggers are parsed from `on:` for IR awareness only; the
// raw text stays authoritative on emit.
import type { AutonomyIR, IRWorkflow, Trigger } from '@open-autonomy/core';
import { ingestAutonomy, type OAManifest } from './ingest-manifest';

// Full decompile of an open-autonomy checkout: the manifest supplies agents/skills/policy/resources,
// and the hand-authored workflow files are carried verbatim (raw) so a recompile restores them
// byte-identical. Interpret the declarative manifest; carry the executable workflows.
export function ingestGithub(manifest: OAManifest, workflows: Record<string, string>): AutonomyIR {
  const ir = ingestAutonomy(manifest);
  ir.workflows = Object.entries(workflows).map(([name, raw]) => ingestGithubWorkflow(name, raw));
  return ir;
}

export function ingestGithubWorkflow(name: string, raw: string): IRWorkflow {
  let triggers: Trigger[] = [];
  try {
    const doc = Bun.YAML.parse(raw) as Record<string, unknown>;
    // YAML's "Norway problem": a bare `on:` key can parse as the boolean true.
    triggers = triggersFromOn(doc.on ?? (doc as Record<string, unknown>)[String(true)]);
  } catch {
    /* unparseable — still carried verbatim, just without parsed triggers */
  }
  return { name, triggers, raw, config: {} };
}

function triggersFromOn(on: unknown): Trigger[] {
  const out: Trigger[] = [];
  if (!on || typeof on !== 'object') return out;
  for (const [key, val] of Object.entries(on as Record<string, unknown>)) {
    if (key === 'schedule') {
      for (const e of Array.isArray(val) ? val : []) {
        const cron = (e as { cron?: unknown })?.cron;
        if (typeof cron === 'string') out.push({ cron });
      }
    } else {
      const hasConfig = val && typeof val === 'object' && Object.keys(val as object).length > 0;
      out.push({ event: key, ...(hasConfig ? { config: val as Record<string, unknown> } : {}) });
    }
  }
  return out;
}
