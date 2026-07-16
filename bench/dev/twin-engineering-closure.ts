import type { ComponentManifestV2 } from '@open-autonomy/core';
import { validateBenchWorld, type BenchWorld } from './bench-world';

export interface TwinEngineeringClosureBundle {
  schema: 'open-autonomy.twin-engineering-closure.v1';
  profile: 'twin-conformant-engineering';
  checkpoints: string[];
  worlds: Array<{
    id: string;
    world: BenchWorld;
    serviceRealizations: Array<{
      service: string;
      mode: 'digital-twin' | 'live-service';
      evidence: string[];
    }>;
    substrateEvidence: string[];
  }>;
  excludedExternalClaims: string[];
  residuals: string[];
}

const REQUIRED_EXCLUSIONS = [
  'real-human-usability-and-accessibility',
  'unfamiliar-operator-performance',
  'live-provider-billing-and-custody',
  'population-transfer-validity',
  'wall-clock-production-duration',
];

/**
 * Validates only engineering closure. It deliberately cannot issue human,
 * population, or production-duration claims.
 */
export function validateTwinEngineeringClosure(
  bundle: TwinEngineeringClosureBundle,
  manifests: Record<string, ComponentManifestV2>,
): string[] {
  const errors: string[] = [];
  if (bundle.schema !== 'open-autonomy.twin-engineering-closure.v1' || bundle.profile !== 'twin-conformant-engineering')
    errors.push('unsupported engineering closure profile');
  if (!bundle.checkpoints.length || new Set(bundle.checkpoints).size !== bundle.checkpoints.length)
    errors.push('closure checkpoints must be nonempty and unique');
  if (!bundle.worlds.length || new Set(bundle.worlds.map((item) => item.id)).size !== bundle.worlds.length)
    errors.push('closure worlds must be nonempty and uniquely identified');
  for (const claim of REQUIRED_EXCLUSIONS)
    if (!bundle.excludedExternalClaims.includes(claim)) errors.push(`external claim must remain excluded: ${claim}`);
  if (bundle.residuals.length) errors.push('engineering closure has untriaged residuals');

  for (const entry of bundle.worlds) {
    errors.push(...validateBenchWorld(entry.world, manifests).errors.map((error) => `${entry.id}: ${error}`));
    if (!entry.substrateEvidence.length) errors.push(`${entry.id}: real substrate execution evidence is required`);
    const required = entry.world.services.filter((service) => service.required);
    for (const service of required) {
      const realization = entry.serviceRealizations.filter((item) => item.service === service.id);
      if (realization.length !== 1) {
        errors.push(`${entry.id}: required service '${service.id}' needs exactly one realization`);
        continue;
      }
      const selected = realization[0]!;
      if (!selected.evidence.length) errors.push(`${entry.id}: service '${service.id}' realization needs evidence`);
      const twins = entry.world.twins.filter((twin) => twin.service === service.id);
      if (selected.mode === 'digital-twin' && twins.length !== 1)
        errors.push(`${entry.id}: service '${service.id}' declares twin mode without exactly one pinned twin`);
      if (selected.mode === 'live-service' && twins.length)
        errors.push(`${entry.id}: service '${service.id}' cannot be both live and twinned`);
    }
  }

  if (bundle.checkpoints.includes('R24')) {
    const cells = bundle.worlds.map((entry) => ({
      organization: entry.world.target.organizationDigest,
      manifests: Object.values(entry.world.target.composition.instances).map((instance) => instance.manifest),
    }));
    if (!cells.some((cell) => cell.manifests.includes('hermes-agent')) || !cells.some((cell) => cell.manifests.includes('paperclip')))
      errors.push('R24 requires actual Hermes and Paperclip compiled-substrate cells');
    if (new Set(cells.map((cell) => cell.organization)).size !== 1)
      errors.push('R24 substrate cells must execute the unchanged organization digest');
  }
  return [...new Set(errors)];
}

export const twinEngineeringExternalClaims = () => [...REQUIRED_EXCLUSIONS];
