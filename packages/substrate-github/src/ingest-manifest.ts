// Ingest an open-autonomy manifest (autonomy.yml) → autonomy.ir.v1 agents.
import type { AutonomyIR, DocumentRoles, OAManifest, Trigger } from '@open-autonomy/core';

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
      ...(a.execution ? { execution: a.execution } : {}),
    };
  }

  const autonomy = m.policy?.autonomy as Record<string, unknown> | undefined;
  const maxConcurrent =
    typeof m.policy?.maxConcurrent === 'number'
      ? m.policy.maxConcurrent
      : typeof autonomy?.max_open_agent_prs === 'number'
        ? (autonomy.max_open_agent_prs as number)
        : undefined;
  // Carry the policy governance data verbatim; see emitAutonomy. An unknown knob round-trips.
  const policyBox: Record<string, unknown> = { ...(m.policy ?? {}) };
  delete policyBox.maxConcurrent; // typed above; never duplicate the standard field into the opaque box
  // The manifest's role LABELS, if present and well-formed (`vision` required, matching validateIR) — full
  // fidelity for a decompile → recompile round-trip (U2, supercode study §II.9.1). A manifest with no roles
  // (or a malformed one, e.g. missing vision) yields no `documents` field, same as before U2 existed.
  const roles = documentRoles(m.documents);

  return {
    schema: 'autonomy.ir.v1',
    targets: ['gh-actions'],
    agents,
    // Every doc path — resources AND (if present) role paths — round-trips as a plain resource here: this
    // flattener predates U2's `documents.roles` and knows nothing of it, which is exactly the point (U2,
    // supercode study §II.9.1) — an additive manifest key stays ingestible by code that never heard of it;
    // the files still get carried, just without the role LABEL (reconstructed separately below).
    resources: collectDocPaths(m.documents),
    ...(roles ? { documents: { roles } } : {}),
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

/** The manifest's `documents.roles`, if present and well-formed (a `vision` string) — else undefined. */
function documentRoles(documents?: Record<string, unknown>): DocumentRoles | undefined {
  const roles = (documents as { roles?: unknown } | undefined)?.roles;
  if (!roles || typeof roles !== 'object') return undefined;
  const vision = (roles as { vision?: unknown }).vision;
  return typeof vision === 'string' && vision.length > 0 ? (roles as DocumentRoles) : undefined;
}
