// autonomy.ir.v1 — substrate-agnostic intermediate representation.
// See docs/AUTONOMY-IR.md. Dependency-free by design (matches repo convention; no zod).

export type Box = Record<string, unknown>;

export interface IRAgent {
  skill: string; // skill folder, relative to the bundle root
  maxConcurrent: number; // per-agent concurrency; the runner enforces min(per-agent, global)
  config: Box; // opaque; consumers (adapter at compile time, runner at runtime) read what they understand
}

export interface IRWorkflow {
  name: string;
  cron: string; // the one default trigger
  launch?: string; // an agent name (must exist in agents)
  run?: string; // a script path
  config: Box;
}

export interface IRPolicy {
  maxConcurrent?: number; // global fleet cap
  box: Box;
}

export interface AutonomyIR {
  schema: 'autonomy.ir.v1';
  targets: string[];
  agents: Record<string, IRAgent>;
  workflows: IRWorkflow[];
  resources: string[];
  policy: IRPolicy;
}

/** The output of a full compile: files the compiler writes, plus bundle files copied verbatim. */
export interface CompileOutput {
  generated: Record<string, string>; // path → content (manifests, driver/launcher files, workflow yml)
  copies: Array<{ from: string; to: string }>; // bundle files copied as-is (skills, standards, scripts)
}

/** The complete installed path set (generated + copy destinations), sorted. */
export function compiledPaths(out: CompileOutput): string[] {
  return [...Object.keys(out.generated), ...out.copies.map((c) => c.to)].sort();
}

/** Returns a list of validation errors; empty array means valid. */
export function validateIR(ir: AutonomyIR): string[] {
  const errors: string[] = [];
  if (ir.schema !== 'autonomy.ir.v1') errors.push(`bad schema: ${ir.schema}`);
  if (!ir.agents || Object.keys(ir.agents).length === 0) errors.push('no agents');
  for (const [name, a] of Object.entries(ir.agents ?? {})) {
    if (!a.skill) errors.push(`agent ${name}: missing skill`);
    if (!(a.maxConcurrent > 0)) errors.push(`agent ${name}: maxConcurrent must be > 0`);
  }
  for (const w of ir.workflows ?? []) {
    const n = (w.launch ? 1 : 0) + (w.run ? 1 : 0);
    if (n !== 1) errors.push(`workflow ${w.name}: exactly one of launch|run (got ${n})`);
    if (!w.cron) errors.push(`workflow ${w.name}: missing cron`);
    if (w.launch && !ir.agents[w.launch]) {
      errors.push(`workflow ${w.name}: launch references unknown agent "${w.launch}"`);
    }
  }
  return errors;
}

/** A compact structural fingerprint for comparing two IRs (the universality smoke test). */
export function irShape(ir: AutonomyIR) {
  return {
    agents: Object.keys(ir.agents).sort(),
    agentConfigKeys: unionKeys(Object.values(ir.agents).map((a) => a.config)),
    workflows: ir.workflows
      .map((w) => ({ name: w.name, kind: w.launch ? 'launch' : 'run', target: w.launch ?? w.run, cron: w.cron }))
      .sort((x, y) => x.name.localeCompare(y.name)),
    resourceCount: ir.resources.length,
    policyMaxConcurrent: ir.policy.maxConcurrent ?? null,
    policyBoxKeys: Object.keys(ir.policy.box).sort(),
  };
}

function unionKeys(boxes: Box[]): string[] {
  const s = new Set<string>();
  for (const b of boxes) for (const k of Object.keys(b)) s.add(k);
  return [...s].sort();
}
