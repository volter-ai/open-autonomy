// Parse a profile written as `autonomy.ir.v1` YAML (the canonical profile format) into a validated
// IR. This is the substrate-agnostic entry point: a profile is an `ir.yml`; substrates compile it.
import { validateIR } from './ir';
import type { AutonomyIR } from './ir';

export function parseIr(yamlText: string): AutonomyIR {
  const ir = Bun.YAML.parse(yamlText) as AutonomyIR;
  const errors = validateIR(ir);
  if (errors.length) throw new Error(`invalid profile IR:\n  ${errors.join('\n  ')}`);
  return ir;
}
