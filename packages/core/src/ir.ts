// autonomy.ir.v1 — the substrate-agnostic standard. See docs/SPEC.md#the-ir.
// One unit: an agent = behavior + capabilities + triggers(+params) (+ optional timeout/result/kind). There
// is NO per-agent config box. The core only validates spec-validity and WIRES; it never interprets what a
// capability does or where a trigger param is sourced — that is each substrate's (partial) implementation.

// A trigger fires an agent and forwards `params` to it (the Runner contract's opaque LaunchParams).
// `params` maps an opaque param NAME (the profile's choice; the core never interprets it) to a
// documented SOURCE the substrate resolves from its firing context (docs/SPEC.md#trigger-params — e.g.
// `subject.ref`, `subject.actor`, `trigger.kind`). The two PORTABLE trigger kinds are `cron` (time) and
// `dispatch` (on-demand via the Runner — docs/SPEC.md#the-runner); `event` is the substrate-native escape hatch,
// carried verbatim and fired where the substrate supports it.
export type Trigger =
  | { cron: string; params?: Record<string, string> }
  // `config` is the native event's own filter (e.g. github `types: [opened]`) — substrate-native data on
  // the `event` escape hatch, not an opaque IR box; the core carries it verbatim and never interprets it.
  | { event: string; config?: Record<string, unknown>; params?: Record<string, string> }
  // `dispatch` fires when another actor LAUNCHES this one through the Runner (the `agent:launch` axis —
  // docs/SPEC.md#the-runner). It is NOT autonomous: it carries no schedule/event, only the params the launcher
  // forwards. This is how a worker is invoked by the orchestrator (the PM) on demand. There is no `task:`
  // trigger — a task is a work ITEM whose lifecycle state is a property the orchestrator READS when
  // deciding what to dispatch, never a trigger the substrate must watch.
  | { dispatch: true; params?: Record<string, string> };

// An actor's kind: `agent` (machine) or `human` (person). The role is intrinsic and declared; how the
// role is *realized* (script / model / person / simulator-in-test) is the substrate's choice.
export type ActorKind = 'agent' | 'human';

// The one unit of the IR — an actor (kind: agent|human). There is no `workflow`/`launch`/`run`/`raw`; an
// actor carries its own triggers, and how it is realized + how its output is trusted are the substrate's
// realization, not IR fields. (The map key is still `agents` while the rename to `actors` is mid-migration.)
export interface IRAgent {
  behavior: string; // what it does — a SKILL folder (prose), relative to the profile root
  capabilities: string[]; // its authority (docs/SPEC.md#capabilities); pure authority, no trust
  triggers: Trigger[]; // when it fires + the params it forwards (≥1; only cron is interpreted)
  kind?: ActorKind; // the role; default `agent`. `human` → realized by routing to a person (or a simulator in test).
  timeout?: number; // a run-time bound (minutes); an agnostic resource limit the substrate realizes
  // The review edge of the merge boundary: a code:propose agent names the INDEPENDENT reviewer agent that
  // judges its proposals. Requesting that review is mechanical WIRING, not a judgment — so the substrate
  // triggers `review` deterministically when the proposal is opened (never an LLM remembering to route).
  // The reviewer still makes the judgment (posts agent-review). Required-ish for a proposer; absent ⇒ no
  // auto-review wiring (e.g. a profile that gates merges only on ci, or reviews out-of-band).
  review?: string; // the name of the reviewer agent (must hold code:review and not be this agent)
  // Optional formal result of a skill agent's run: a value that validates against `result.schema` (a JSON
  // Schema object). A declarative seam for a typed result; absent ⇒ the agent just runs and acts directly.
  result?: { schema: Record<string, unknown> };
}

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
  // Portable governance DATA (merge/risk/planner knobs) the substrate + skills read. Intentionally NOT a
  // core-typed schema — governance vocabulary is per-profile (standalone presets), so the core carries it
  // verbatim and never interprets it. Not an opaque per-agent config box; profile-level policy data.
  box: Record<string, unknown>;
}

export interface AutonomyIR {
  schema: 'autonomy.ir.v1';
  targets: string[];
  // The code host: WHERE code/work/integration lives (PRs+auto-merge vs worktree+PM-merge). ORTHOGONAL to
  // `targets` (the agent runner) — a `local` runner can drive a `github` code host. It's a profile methodology
  // choice (simple-gh-sdlc = github; simple-sdlc = local-git), realized by the agent's own tools (gh/git), not
  // the runner. Default `local-git` when omitted. See docs/CODE_HOST_RESOURCES.md.
  codeHost?: 'github' | 'local-git';
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
  if (!ir.agents || Object.keys(ir.agents).length === 0) {
    // The IR's top-level actor map is (still) keyed `agents:` — the rename to `actors:` described in
    // docs/SPEC.md#the-ir is mid-migration and not yet accepted here. A docs-first author who copies the
    // SPEC's prose ("the one unit is an actor") into `actors:` gets an empty agent set and a bare "no
    // agents" — name the mistake so they can self-correct without reading this file.
    const sawActorsKey = (ir as unknown as { actors?: unknown }).actors !== undefined;
    errors.push(sawActorsKey ? 'no agents (found "actors:" — the key is "agents:")' : 'no agents (the top-level key is "agents:")');
  }
  for (const [name, a] of Object.entries(ir.agents ?? {})) {
    if (!a.behavior) errors.push(`agent ${name}: missing behavior`);
    if (!Array.isArray(a.capabilities)) errors.push(`agent ${name}: capabilities must be an array`);
    // code:merge is gate-only: merge is the one irreversible, default-branch act, never granted to an
    // agent (docs/SPEC.md#capabilities — the merge boundary). The base (before any @scope) must not be code:merge.
    const capBases = (a.capabilities ?? []).filter((c): c is string => typeof c === 'string').map((c) => c.split('@')[0]);
    for (const cap of capBases)
      if (cap === 'code:merge')
        errors.push(`agent ${name}: code:merge is gate-only — no agent may merge`);
    // The merge boundary itself: bless (code:review = statuses:write) and propose (code:propose =
    // contents:write) are deliberately split so no single agent can write code AND certify it. Enforce it
    // here, not by convention (docs/SPEC.md#capabilities — the merge boundary).
    if (capBases.includes('code:review') && capBases.includes('code:propose'))
      errors.push(`agent ${name}: merge boundary — no agent may hold both code:review and code:propose`);
    if (!a.triggers || a.triggers.length === 0) errors.push(`agent ${name}: needs at least one trigger`);
    if (a.kind !== undefined && a.kind !== 'agent' && a.kind !== 'human')
      errors.push(`agent ${name}: kind must be 'agent' or 'human'`);
    // The review edge must name an INDEPENDENT reviewer (the merge boundary): it must exist, hold
    // code:review, and not be the proposer itself — otherwise the auto-review wiring would point at a
    // non-reviewer or let an agent route its own proposal to itself.
    if (a.review !== undefined) {
      if (typeof a.review !== 'string' || a.review.length === 0) errors.push(`agent ${name}: review must be a reviewer agent name`);
      else if (a.review === name) errors.push(`agent ${name}: review must name an INDEPENDENT reviewer, not itself`);
      else {
        const reviewer = ir.agents?.[a.review];
        if (!reviewer) errors.push(`agent ${name}: review names unknown agent '${a.review}'`);
        else if (!(reviewer.capabilities ?? []).some((c) => typeof c === 'string' && c.split('@')[0] === 'code:review'))
          errors.push(`agent ${name}: review target '${a.review}' must hold code:review`);
      }
    }
    if (a.result !== undefined) {
      if (!a.result.schema || typeof a.result.schema !== 'object')
        errors.push(`agent ${name}: result must be { schema: <object> }`);
      else if (a.behavior && isScript(a.behavior))
        errors.push(`agent ${name}: result is for skill agents only — a script behavior returns its result directly`);
    }
    for (const t of a.triggers ?? []) {
      if (!('cron' in t) && !('event' in t) && !('dispatch' in t))
        errors.push(`agent ${name}: trigger must be a cron, an event, or a dispatch`);
      else if ('dispatch' in t && t.dispatch !== true)
        errors.push(`agent ${name}: dispatch trigger must be { dispatch: true }`);
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
          .map((t) => ('cron' in t ? `cron:${t.cron}` : 'dispatch' in t ? 'dispatch' : `event:${t.event}`))
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
