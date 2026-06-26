// Ingest an open-autonomy manifest (autonomy.yml) → autonomy.ir.v1 agents.
import type { AutonomyIR, OAManifest, Trigger } from '@open-autonomy/core';

export type { OAManifest };

export function ingestAutonomy(m: OAManifest): AutonomyIR {
  const agents: AutonomyIR['agents'] = {};
  for (const [name, a] of Object.entries(m.agents ?? {})) {
    // Behavior identity is the folder basename (portable); the .codex/skills prefix is harness convention.
    const skillRef = m.skills?.[name] ?? a.skill ?? '';
    const triggers: Trigger[] = [];
    for (const [key, val] of Object.entries(a.triggers ?? {})) {
      if (val === false || val == null) continue;
      if (key === 'schedule' && typeof val === 'string') triggers.push({ cron: val });
      else if (key === 'dispatch' && val === true) triggers.push({ dispatch: true });
      else triggers.push({ event: key, ...(val && typeof val === 'object' ? { config: val as Record<string, unknown> } : {}) });
    }
    agents[name] = {
      ...(a.kind === 'human' ? { kind: 'human' as const } : {}),
      behavior: skillRef.split('/').pop() ?? skillRef,
      capabilities: a.capabilities ?? [],
      triggers,
      ...(typeof a.timeout === 'number' ? { timeout: a.timeout } : {}),
      ...(a.review ? { review: a.review } : {}),
    };
  }

  const autonomy = m.policy?.autonomy as Record<string, unknown> | undefined;
  const maxConcurrent =
    typeof autonomy?.max_open_agent_prs === 'number' ? (autonomy.max_open_agent_prs as number) : undefined;
  // Carry the policy governance data verbatim; see emitAutonomy. An unknown knob round-trips.
  const policyBox: Record<string, unknown> = { ...(m.policy ?? {}) };

  return {
    schema: 'autonomy.ir.v1',
    targets: ['gh-actions'],
    agents,
    resources: collectDocPaths(m.documents),
    policy: { maxConcurrent, box: policyBox },
  };
}

/** Flatten the (possibly nested) documents map into a sorted, deduped list of file paths. */
function collectDocPaths(documents?: Record<string, unknown>): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'string') out.push(v);
    else if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x);
  };
  walk(documents);
  return [...new Set(out)].sort();
}
