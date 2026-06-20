// autonomy.ir.v1 — the substrate-agnostic standard. See docs/AUTONOMY-IR.md.
// One unit: an agent = behavior + capabilities + triggers(+params) + config. The core only validates
// spec-validity and WIRES; it never interprets what a capability does, where a trigger param is
// sourced, or what a config key means — that is each substrate's (partial) implementation.
export type Box = Record<string, unknown>;

// A trigger fires an agent and forwards `params` to it (the Runner contract's opaque LaunchParams).
// `params` maps an opaque param NAME (the profile's choice; the core never interprets it) to a
// documented SOURCE the substrate resolves from its firing context (docs/TRIGGER-PARAMS.md — e.g.
// `subject.ref`, `subject.actor`, `trigger.kind`). Only `cron` is portable; events are carried and
// fired where the substrate supports them.
export type Trigger =
  | { cron: string; params?: Record<string, string> }
  | { event: string; config?: Box; params?: Record<string, string> };

// The one unit of the IR. There is no `workflow`/`launch`/`run`/`raw` — an agent carries its own
// triggers, and how it executes (deterministic vs model-interpreted) + how its output is trusted are
// the substrate's realization, not IR fields.
export interface IRAgent {
  behavior: string; // what it does — instructions/spec folder, relative to the profile root
  capabilities: string[]; // its authority (docs/CAPABILITIES.md); pure authority, no trust
  triggers: Trigger[]; // when it fires + the params it forwards (≥1; only cron is interpreted)
  config: Box; // opaque misc the substrate interprets: timeout, concurrency, env, maxConcurrent, model bounds, …
}

/** The first cron trigger across an agent's triggers, if any — the only trigger the IR interprets. */
export function cronOf(a: IRAgent): string | undefined {
  for (const t of a.triggers ?? []) if ('cron' in t) return t.cron;
  return undefined;
}

export interface IRPolicy {
  maxConcurrent?: number; // global fleet cap
  box: Box; // opaque governance (merge/risk/…); substrate + agents read what they understand
}

export interface AutonomyIR {
  schema: 'autonomy.ir.v1';
  targets: string[];
  agents: Record<string, IRAgent>;
  policy: IRPolicy;
  resources: string[];
}

/** The output of a full compile: files the compiler writes, plus profile files copied verbatim. */
export interface CompileOutput {
  generated: Record<string, string>; // path → content (manifests, generated workflows, injected runtime)
  copies: Array<{ from: string; to: string }>; // profile files copied as-is (behavior folders, resources)
}

/** The complete installed path set (generated + copy destinations), sorted. */
export function compiledPaths(out: CompileOutput): string[] {
  return [...Object.keys(out.generated), ...out.copies.map((c) => c.to)].sort();
}

/** Returns a list of validation errors; empty array means valid. The core checks spec-validity only. */
export function validateIR(ir: AutonomyIR): string[] {
  const errors: string[] = [];
  if (ir.schema !== 'autonomy.ir.v1') errors.push(`bad schema: ${ir.schema}`);
  if (!ir.agents || Object.keys(ir.agents).length === 0) errors.push('no agents');
  for (const [name, a] of Object.entries(ir.agents ?? {})) {
    if (!a.behavior) errors.push(`agent ${name}: missing behavior`);
    if (!Array.isArray(a.capabilities)) errors.push(`agent ${name}: capabilities must be an array`);
    if (!a.triggers || a.triggers.length === 0) errors.push(`agent ${name}: needs at least one trigger`);
    for (const t of a.triggers ?? []) {
      if (!('cron' in t) && !('event' in t)) errors.push(`agent ${name}: trigger must be a cron or an event`);
    }
  }
  return errors;
}

/** A compact structural fingerprint for comparing two IRs (the universality smoke test). */
export function irShape(ir: AutonomyIR) {
  return {
    agents: Object.keys(ir.agents).sort(),
    capabilities: unionStrs(Object.values(ir.agents).map((a) => a.capabilities ?? [])),
    triggers: Object.entries(ir.agents)
      .map(([name, a]) => ({
        agent: name,
        triggers: (a.triggers ?? []).map((t) => ('cron' in t ? `cron:${t.cron}` : `event:${t.event}`)).sort(),
      }))
      .sort((x, y) => x.agent.localeCompare(y.agent)),
    resourceCount: ir.resources.length,
    policyMaxConcurrent: ir.policy.maxConcurrent ?? null,
    policyBoxKeys: Object.keys(ir.policy.box).sort(),
  };
}

function unionStrs(lists: string[][]): string[] {
  const s = new Set<string>();
  for (const l of lists) for (const x of l) s.add(x);
  return [...s].sort();
}
