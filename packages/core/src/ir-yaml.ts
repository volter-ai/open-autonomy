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

export function parseIr(yamlText: string): AutonomyIR {
  const ir = parseYaml(yamlText) as AutonomyIR;
  normalizeRunnerAliases(ir);
  const errors = validateIR(ir);
  if (errors.length) throw new Error(`invalid profile IR:\n  ${errors.join('\n  ')}`);
  return ir;
}
