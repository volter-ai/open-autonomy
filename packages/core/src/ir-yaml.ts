// Parse a profile written as `autonomy.ir.v1` YAML (the canonical profile format) into a validated
// IR. This is the substrate-agnostic entry point: a profile is an `ir.yml`; substrates compile it.
import { parse as parseYaml } from 'yaml';
import { validateIR } from './ir';
import type { AutonomyIR } from './ir';

// Use the `yaml` library (not bun's Bun.YAML) so parse/stringify behave identically under bun and
// node — the CLI ships as a node bundle, and a single serializer keeps compile output byte-stable
// across both runtimes.
// The github-Actions runner-substrate is named `gh-actions` — distinct from the github CODE HOST (repo, PRs,
// merge). `github` was the old name and conflated the two (docs/CODE_HOST_RESOURCES.md); accept it as a
// back-compat alias and normalize to the canonical `gh-actions` on parse, so the rest of the engine only ever
// sees the unambiguous runner name. This is a RUNNER rename only — code-host `github` references are untouched.
function normalizeRunnerAliases(ir: AutonomyIR): void {
  if (Array.isArray(ir.targets)) ir.targets = ir.targets.map((t) => (t === 'github' ? 'gh-actions' : t));
  const box = ir.policy?.box as Record<string, unknown> | undefined;
  if (box && box.github !== undefined && box['gh-actions'] === undefined) {
    box['gh-actions'] = box.github;
    delete box.github;
  }
}

// U2 (supercode study §II.9.1) — the auto-gating keystone: a declared `vision` or `constitution` role is
// added to `policy.box.risk.human_required_paths` if not already present. `roadmap` is deliberately NEVER
// auto-gated — it's the strategist's medium (an agent proposes roadmap edits under `code:propose@roadmap`
// and they land through the ordinary review path, docs/SPEC.md#capabilities); gating it would block the
// very mechanism that keeps it current. The rationale for the two that ARE gated: declaring a document as
// the measuring stick IS what gates it — a `vision`/`constitution` role names the doc every agent's
// proposal is judged against, so an agent silently rewriting its own yardstick would defeat the merge
// boundary's whole purpose. This runs at parse (every real compile path goes through parseIr — see
// bin/autonomy-compile.ts, bin/autonomy-upgrade.ts, bin/check-compile.ts, and both substrates' emit.ts),
// so both consumers of the same field — emitAutonomy's `policy` (manifest.ts) and substrate-github's
// `.open-autonomy/human-required-paths.json` (emit.ts) — see the gated set identically; neither augments
// policy.box on its own (it stays a verbatim carry at the substrate layer, per its own contract comment
// in emit.ts). Mutates `ir` in place (parseIr's caller already treats the parsed IR as owned/fresh).
export function applyDocumentAutoGate(ir: AutonomyIR): void {
  const roles = ir.documents?.roles;
  if (!roles) return;
  const gate = [roles.vision, roles.constitution].filter((p): p is string => typeof p === 'string' && p.length > 0);
  if (gate.length === 0) return;
  const box = (ir.policy.box ?? (ir.policy.box = {})) as Record<string, unknown>;
  const risk = (box.risk ?? (box.risk = {})) as { human_required_paths?: string[] };
  const existing = new Set(risk.human_required_paths ?? []);
  for (const path of gate) existing.add(path);
  risk.human_required_paths = [...existing];
}

export function parseIr(yamlText: string): AutonomyIR {
  const ir = parseYaml(yamlText) as AutonomyIR;
  normalizeRunnerAliases(ir);
  const errors = validateIR(ir);
  if (errors.length) throw new Error(`invalid profile IR:\n  ${errors.join('\n  ')}`);
  applyDocumentAutoGate(ir);
  return ir;
}
