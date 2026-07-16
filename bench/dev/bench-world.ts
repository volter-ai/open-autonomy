import {
  validateComponentComposition,
  type AdapterContract,
  type ComponentComposition,
  type ComponentManifestV2,
} from '@open-autonomy/core';

/** A real compilation target assembled from one or more substrate components. */
export interface BenchCompiledTarget {
  kind: 'compiled-substrate';
  id: string;
  organizationDigest: string;
  deploymentDigest: string;
  composition: ComponentComposition;
  /** Native artifacts emitted by lowering, keyed by their portable role. */
  artifacts: Array<{ role: string; uri: string; digest: string }>;
}

/** An independently observable dependency used by the target while it executes. */
export interface BenchServiceDependency {
  kind: 'service';
  id: string;
  contract: { id: string; version: string };
  required: boolean;
  endpoint: string;
}

/** Which compiled provider consumes which external service contract. */
export interface BenchServiceBinding {
  provider: string;
  service: string;
  interface: string;
}

/**
 * A digital twin substitutes for one declared service dependency. Fidelity is
 * bounded by an explicit contract and operation set; it never substitutes for
 * the compiled substrate or claims to reproduce generative intelligence.
 */
export interface BenchServiceTwin {
  kind: 'digital-twin';
  id: string;
  service: string;
  contract: { id: string; version: string };
  implementation: { package: string; version: string; revision: string };
  scenario: { id: string; digest: string };
  coveredOperations: string[];
  knownGaps: string[];
  conformanceEvidence: string[];
}

/** A controlled actor/environment model; useful evidence, but never a service replica. */
export interface BenchBehaviorSimulator {
  kind: 'behavioral-simulator';
  id: string;
  role: 'worker' | 'human' | 'workload' | 'environment';
  version: string;
  contract: string;
  calibrationEvidence?: string[];
}

export interface BenchWorld {
  schema: 'open-autonomy.bench-world.v1';
  target: BenchCompiledTarget;
  services: BenchServiceDependency[];
  serviceBindings: BenchServiceBinding[];
  twins: BenchServiceTwin[];
  simulators: BenchBehaviorSimulator[];
}

export interface BenchWorldValidation {
  errors: string[];
  warnings: string[];
}

export function validateBenchWorld(
  world: BenchWorld,
  manifests: Record<string, ComponentManifestV2>,
  adapters: Record<string, AdapterContract> = {},
): BenchWorldValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (world.schema !== 'open-autonomy.bench-world.v1') errors.push('unsupported bench world schema');
  if (world.target.kind !== 'compiled-substrate') errors.push('execution target must be a compiled substrate');
  if (!world.target.organizationDigest || !world.target.deploymentDigest) errors.push('compiled target requires organization and deployment digests');
  if (!world.target.artifacts.length) errors.push('compiled target must identify at least one native artifact');
  for (const [index, artifact] of world.target.artifacts.entries())
    if (!artifact.role || !artifact.uri || !artifact.digest) errors.push(`target.artifacts.${index}: role, uri, and digest are required`);

  const composition = validateComponentComposition(world.target.composition, manifests, adapters);
  errors.push(...composition.errors.map((error) => `target.composition: ${error}`));
  warnings.push(...composition.warnings.map((warning) => `target.composition: ${warning}`));

  duplicateIds('services', world.services.map((item) => item.id), errors);
  duplicateIds('twins', world.twins.map((item) => item.id), errors);
  duplicateIds('simulators', world.simulators.map((item) => item.id), errors);
  const services = new Map(world.services.map((service) => [service.id, service]));
  const providers = world.target.composition.instances;

  for (const [index, service] of world.services.entries()) {
    if (service.kind !== 'service') errors.push(`services.${index}: kind must be service`);
    if (!service.id || !service.contract.id || !service.contract.version || !service.endpoint)
      errors.push(`services.${index}: id, versioned contract, and endpoint are required`);
  }
  for (const [index, binding] of world.serviceBindings.entries()) {
    const configured = providers[binding.provider];
    const manifest = configured ? manifests[configured.manifest] : undefined;
    if (!configured) errors.push(`serviceBindings.${index}: unknown compiled provider '${binding.provider}'`);
    if (!services.has(binding.service)) errors.push(`serviceBindings.${index}: unknown service '${binding.service}'`);
    if (!binding.interface) errors.push(`serviceBindings.${index}: interface is required`);
    else if (manifest && !manifest.interfaces[binding.interface])
      warnings.push(`serviceBindings.${index}: interface '${binding.interface}' is not declared by provider '${binding.provider}'`);
  }
  for (const service of world.services.filter((item) => item.required))
    if (!world.serviceBindings.some((binding) => binding.service === service.id))
      errors.push(`required service '${service.id}' is not bound to a compiled provider`);

  const substituted = new Set<string>();
  for (const [index, twin] of world.twins.entries()) {
    if (twin.kind !== 'digital-twin') errors.push(`twins.${index}: kind must be digital-twin`);
    const service = services.get(twin.service);
    if (!service) {
      errors.push(`twins.${index}: digital twin may only substitute a declared service, not a substrate component ('${twin.service}')`);
      continue;
    }
    if (substituted.has(twin.service)) errors.push(`service '${twin.service}' has more than one digital twin substitution`);
    substituted.add(twin.service);
    if (twin.contract.id !== service.contract.id || twin.contract.version !== service.contract.version)
      errors.push(`twins.${index}: twin contract does not match service '${service.id}'`);
    if (!twin.implementation.package || !twin.implementation.version || !twin.implementation.revision)
      errors.push(`twins.${index}: implementation package, version, and revision are required`);
    if (!twin.scenario.id || !/^sha256:[a-f0-9]{64}$/.test(twin.scenario.digest))
      errors.push(`twins.${index}: content-addressed scenario id and sha256 digest are required`);
    if (!twin.coveredOperations.length) errors.push(`twins.${index}: covered operations must be explicit`);
    if (!twin.conformanceEvidence.length) warnings.push(`twins.${index}: no conformance evidence; fidelity is unproven`);
  }

  for (const [index, simulator] of world.simulators.entries()) {
    if (simulator.kind !== 'behavioral-simulator') errors.push(`simulators.${index}: kind must be behavioral-simulator`);
    if (!simulator.id || !simulator.version || !simulator.contract) errors.push(`simulators.${index}: id, version, and behavioral contract are required`);
    if ((simulator.role === 'human' || simulator.role === 'worker') && !simulator.calibrationEvidence?.length)
      warnings.push(`simulators.${index}: ${simulator.role} simulator has no calibration evidence`);
  }
  return { errors: unique(errors), warnings: unique(warnings) };
}

function duplicateIds(kind: string, ids: string[], errors: string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id) errors.push(`${kind}: empty id`);
    else if (seen.has(id)) errors.push(`${kind}: duplicate id '${id}'`);
    seen.add(id);
  }
}

function unique(values: string[]): string[] { return [...new Set(values)]; }
