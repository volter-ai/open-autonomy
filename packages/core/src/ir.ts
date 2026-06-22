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
  | { event: string; config?: Box; params?: Record<string, string> }
  // `task` fires when a task enters a portable lifecycle state (docs/TASK-LIFECYCLE.md) — the portable
  // handoff form. The substrate maps the state to its own events; `event` stays as the native escape hatch.
  | { task: string; params?: Record<string, string> };

// An actor's kind: `agent` (machine) or `human` (person). The role is intrinsic and declared; how the
// role is *realized* (script / model / person / simulator-in-test) is the substrate's choice.
export type ActorKind = 'agent' | 'human';

// The one unit of the IR — an actor (kind: agent|human). There is no `workflow`/`launch`/`run`/`raw`; an
// actor carries its own triggers, and how it is realized + how its output is trusted are the substrate's
// realization, not IR fields. (The map key is still `agents` while the rename to `actors` is mid-migration.)
export interface IRAgent {
  behavior: string; // what it does — a SKILL folder (prose), relative to the profile root
  capabilities: string[]; // its authority (docs/CAPABILITIES.md); pure authority, no trust
  triggers: Trigger[]; // when it fires + the params it forwards (≥1; only cron is interpreted)
  kind?: ActorKind; // the role; default `agent`. `human` → realized by routing to a person (or a simulator in test).
  timeout?: number; // a run-time bound (minutes); an agnostic resource limit the substrate realizes
  // Optional formal result of a skill agent's run: a value that validates against `result.schema` (JSON
  // Schema). A declarative seam for a typed result; absent ⇒ the agent just runs and acts directly.
  result?: { schema: Box };
}

/** Forward-compat alias: the unit is an actor (kinds agent|human). */
export type IRActor = IRAgent;

/** The first cron trigger across an agent's triggers, if any — the only trigger the IR interprets. */
export function cronOf(a: IRAgent): string | undefined {
  for (const t of a.triggers ?? []) if ('cron' in t) return t.cron;
  return undefined;
}

/** Execution heuristic shared by substrates: a `scripts/*.{ts,mjs,js}` behavior is a deterministic
 *  implementation; anything else (a prose skill folder) is model-interpreted. Not an IR field — it's the
 *  substrate's realization choice — but the same rule everywhere, so it lives with the standard. */
export function isScript(behavior: string): boolean {
  return /\.(ts|mjs|js)$/.test(behavior);
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
    // code:merge is gate-only: merge is the one irreversible, default-branch act, never granted to an
    // agent (docs/CAPABILITIES.md — the merge boundary). The base (before any @scope) must not be code:merge.
    for (const cap of a.capabilities ?? [])
      if (typeof cap === 'string' && cap.split('@')[0] === 'code:merge')
        errors.push(`agent ${name}: code:merge is gate-only — no agent may merge`);
    if (!a.triggers || a.triggers.length === 0) errors.push(`agent ${name}: needs at least one trigger`);
    if (a.kind !== undefined && a.kind !== 'agent' && a.kind !== 'human')
      errors.push(`agent ${name}: kind must be 'agent' or 'human'`);
    if (a.result !== undefined) {
      if (!a.result.schema || typeof a.result.schema !== 'object')
        errors.push(`agent ${name}: result must be { schema: <object> }`);
      else if (a.behavior && isScript(a.behavior))
        errors.push(`agent ${name}: result is for skill agents only — a script behavior returns its result directly`);
    }
    for (const t of a.triggers ?? []) {
      if (!('cron' in t) && !('event' in t) && !('task' in t))
        errors.push(`agent ${name}: trigger must be a cron, an event, or a task`);
      else if ('task' in t && (typeof t.task !== 'string' || t.task.length === 0))
        errors.push(`agent ${name}: task trigger needs a lifecycle state`);
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
        triggers: (a.triggers ?? [])
          .map((t) => ('cron' in t ? `cron:${t.cron}` : 'task' in t ? `task:${t.task}` : `event:${t.event}`))
          .sort(),
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
