// Parse a profile written as `autonomy.ir.v1` YAML (the canonical profile format) into a validated
// IR. This is the substrate-agnostic entry point: a profile is an `ir.yml`; substrates compile it.
import { parse as parseYaml } from 'yaml';
import { validateIR } from './ir';
import type { AutonomyIR } from './ir';

// Use the `yaml` library (not bun's Bun.YAML) so parse/stringify behave identically under bun and
// node — the CLI ships as a node bundle, and a single serializer keeps compile output byte-stable
// across both runtimes.
export function parseIr(yamlText: string): AutonomyIR {
  const ir = parseYaml(yamlText) as AutonomyIR;
  const errors = validateIR(ir);
  if (errors.length) throw new Error(`invalid profile IR:\n  ${errors.join('\n  ')}`);
  return ir;
}
