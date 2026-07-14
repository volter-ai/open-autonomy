import type { OrganizationIR, SemanticConstraint } from './organization-ir';

export type Realization = 'native' | 'adapter' | 'approximated';
export type CompatibilityStatus =
  | 'compatible'
  | 'compatible-with-adapters'
  | 'compatible-with-approximation'
  | 'configurable'
  | 'incompatible'
  | 'undetermined';

export interface FeatureProvision {
  realization: Realization;
  interface?: string;
  mechanism?: string;
  properties?: Record<string, unknown>;
}

/** One product may provide many overlapping facets. */
export interface SubstrateComponentManifest {
  id: string;
  version?: string;
  provides: Record<string, FeatureProvision>;
  requires?: string[];
  conflictsWith?: string[];
  configuration?: Record<string, unknown>;
}

export interface ProviderInstance {
  component: string;
  configuration?: Record<string, unknown>;
}

export interface DeploymentBinding {
  feature: string;
  provider: string;
  through?: string;
  interface?: string;
}

export interface DeploymentIR {
  schema: 'autonomy.deployment.v1';
  name: string;
  providers: Record<string, ProviderInstance>;
  bindings?: DeploymentBinding[];
  /** State class -> one authoritative provider instance. */
  authorities?: Record<string, string>;
}

export interface SemanticRequirement {
  feature: string;
  paths: string[];
  required: boolean;
  acceptable: Realization[];
  constraints: SemanticConstraint[];
  authoritativeState?: string;
}

export interface CompatibilityDiagnostic {
  feature: string;
  status: 'satisfied' | 'adapter' | 'approximated' | 'configurable' | 'incompatible' | 'undetermined';
  provider?: string;
  message: string;
}

export interface CompatibilityResult {
  status: CompatibilityStatus;
  requirements: SemanticRequirement[];
  selections: Record<string, string>;
  diagnostics: CompatibilityDiagnostic[];
}

interface FeatureUse { feature: string; path: string; }

export function usedOrganizationFeatures(ir: OrganizationIR): FeatureUse[] {
  const used: FeatureUse[] = [
    { feature: 'actors.identity', path: 'actors' },
    { feature: 'actors.behavior', path: 'actors.*.behaviors' },
  ];
  if (Object.values(ir.actors).some((x) => x.activation?.length)) used.push({ feature: 'actors.activation', path: 'actors.*.activation' });
  if (Object.values(ir.actors).some((x) => x.capacity)) used.push({ feature: 'actors.capacity', path: 'actors.*.capacity' });
  if (Object.values(ir.actors).some((x) => x.capabilities?.length)) used.push({ feature: 'authority.capabilities', path: 'actors.*.capabilities' });
  if (Object.keys(ir.units ?? {}).length) used.push({ feature: 'organization.units', path: 'units' });
  if (Object.keys(ir.relations ?? {}).length) used.push({ feature: 'organization.relations', path: 'relations' });
  if (Object.keys(ir.goals ?? {}).length) used.push({ feature: 'purpose.goals', path: 'goals' });
  if (Object.keys(ir.workTypes ?? {}).length) used.push({ feature: 'work.types', path: 'workTypes' });
  if (Object.keys(ir.initialWork ?? {}).length) used.push({ feature: 'work.initial', path: 'initialWork' });
  if (Object.keys(ir.protocols ?? {}).length) used.push({ feature: 'interaction.protocols', path: 'protocols' });
  if (Object.keys(ir.policies ?? {}).length) used.push({ feature: 'governance.policies', path: 'policies' });
  if (Object.keys(ir.budgets ?? {}).length) used.push({ feature: 'governance.budgets', path: 'budgets' });
  if (Object.keys(ir.decisions ?? {}).length) used.push({ feature: 'governance.decisions', path: 'decisions' });
  if (Object.keys(ir.tools ?? {}).length) used.push({ feature: 'behavior.tools', path: 'tools' });
  if (Object.keys(ir.memories ?? {}).length) used.push({ feature: 'behavior.memories', path: 'memories' });
  if (Object.keys(ir.artifacts ?? {}).length) used.push({ feature: 'evidence.artifacts', path: 'artifacts' });
  return used;
}

export function deriveRequirements(ir: OrganizationIR): SemanticRequirement[] {
  const byFeature = new Map<string, SemanticRequirement>();
  for (const use of usedOrganizationFeatures(ir)) {
    const existing = byFeature.get(use.feature) ?? {
      feature: use.feature,
      paths: [],
      required: true,
      acceptable: ['native', 'adapter'] as Realization[],
      constraints: [],
    };
    existing.paths.push(use.path);
    byFeature.set(use.feature, existing);
  }
  for (const guarantee of ir.compiler?.guarantees ?? []) {
    const existing = byFeature.get(guarantee) ?? {
      feature: guarantee, paths: ['compiler.guarantees'], required: true,
      acceptable: ['native', 'adapter'] as Realization[], constraints: [],
    };
    existing.required = true;
    byFeature.set(guarantee, existing);
  }
  for (const [feature, declared] of Object.entries(ir.compiler?.requirements ?? {})) {
    const existing = byFeature.get(feature) ?? {
      feature, paths: [`compiler.requirements.${feature}`], required: declared.required ?? true,
      acceptable: ['native', 'adapter'] as Realization[], constraints: [],
    };
    existing.required = declared.required ?? existing.required;
    existing.acceptable = declared.acceptable ?? existing.acceptable;
    existing.constraints.push(...(declared.constraints ?? []));
    existing.authoritativeState = declared.authoritativeState;
    byFeature.set(feature, existing);
  }
  return [...byFeature.values()].sort((a, b) => a.feature.localeCompare(b.feature));
}

export function solveDeployment(
  organization: OrganizationIR,
  deployment: DeploymentIR,
  components: Record<string, SubstrateComponentManifest>,
): CompatibilityResult {
  const requirements = deriveRequirements(organization);
  const diagnostics: CompatibilityDiagnostic[] = [];
  const selections: Record<string, string> = {};
  const instances = Object.entries(deployment.providers);

  for (const [instance, configured] of instances) {
    const component = components[configured.component];
    if (!component) {
      diagnostics.push({ feature: 'deployment.provider', status: 'undetermined', provider: instance, message: `unknown component '${configured.component}'` });
      continue;
    }
    for (const conflict of component.conflictsWith ?? [])
      if (instances.some(([, x]) => x.component === conflict))
        diagnostics.push({ feature: 'deployment.composition', status: 'incompatible', provider: instance, message: `${component.id} conflicts with ${conflict}` });
    for (const required of component.requires ?? [])
      if (!instances.some(([, x]) => components[x.component]?.provides[required]))
        diagnostics.push({ feature: required, status: 'configurable', provider: instance, message: `${component.id} requires a provider for ${required}` });
  }

  for (const requirement of requirements) {
    const explicit = deployment.bindings?.find((x) => x.feature === requirement.feature);
    const candidates = instances.filter(([instance, configured]) => {
      if (explicit && explicit.provider !== instance) return false;
      return !!components[configured.component]?.provides[requirement.feature];
    });
    if (explicit && !deployment.providers[explicit.provider]) {
      diagnostics.push({ feature: requirement.feature, status: 'incompatible', message: `binding names unknown provider '${explicit.provider}'` });
      continue;
    }
    if (candidates.length === 0) {
      diagnostics.push({ feature: requirement.feature, status: requirement.required ? 'incompatible' : 'undetermined', message: `no provider supplies ${requirement.feature}` });
      continue;
    }
    if (candidates.length > 1 && !explicit) {
      diagnostics.push({ feature: requirement.feature, status: 'configurable', message: `multiple providers supply ${requirement.feature}; add a binding` });
      continue;
    }
    const [provider, configured] = candidates[0];
    const provision = components[configured.component].provides[requirement.feature];
    const failed = requirement.constraints.filter((x) => !satisfiesConstraint(provision.properties ?? {}, x));
    if (failed.length) {
      diagnostics.push({ feature: requirement.feature, status: 'incompatible', provider, message: `provider violates constraints: ${failed.map(formatConstraint).join(', ')}` });
      continue;
    }
    if (!requirement.acceptable.includes(provision.realization)) {
      diagnostics.push({ feature: requirement.feature, status: 'incompatible', provider, message: `${provision.realization} realization is not acceptable` });
      continue;
    }
    if (requirement.authoritativeState && deployment.authorities?.[requirement.authoritativeState] !== provider) {
      diagnostics.push({ feature: requirement.feature, status: 'configurable', provider, message: `authority for '${requirement.authoritativeState}' must be bound to ${provider}` });
      continue;
    }
    selections[requirement.feature] = provider;
    diagnostics.push({
      feature: requirement.feature,
      status: provision.realization === 'native' ? 'satisfied' : provision.realization,
      provider,
      message: `${provider} provides ${requirement.feature} as ${provision.realization}${provision.mechanism ? ` via ${provision.mechanism}` : ''}`,
    });
  }

  return { status: overallStatus(diagnostics), requirements, selections, diagnostics };
}

function overallStatus(diagnostics: CompatibilityDiagnostic[]): CompatibilityStatus {
  if (diagnostics.some((x) => x.status === 'incompatible')) return 'incompatible';
  if (diagnostics.some((x) => x.status === 'undetermined')) return 'undetermined';
  if (diagnostics.some((x) => x.status === 'configurable')) return 'configurable';
  if (diagnostics.some((x) => x.status === 'approximated')) return 'compatible-with-approximation';
  if (diagnostics.some((x) => x.status === 'adapter')) return 'compatible-with-adapters';
  return 'compatible';
}

function satisfiesConstraint(properties: Record<string, unknown>, constraint: SemanticConstraint): boolean {
  const actual = constraint.property.split('.').reduce<unknown>((value, key) =>
    value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, properties);
  switch (constraint.operator) {
    case 'eq': return Object.is(actual, constraint.value);
    case 'neq': return !Object.is(actual, constraint.value);
    case 'in': return Array.isArray(constraint.value) && constraint.value.some((x) => Object.is(x, actual));
    case 'gte': return typeof actual === 'number' && typeof constraint.value === 'number' && actual >= constraint.value;
    case 'lte': return typeof actual === 'number' && typeof constraint.value === 'number' && actual <= constraint.value;
    case 'includes': return Array.isArray(actual) && actual.some((x) => Object.is(x, constraint.value));
  }
}

function formatConstraint(x: SemanticConstraint): string {
  return `${x.property} ${x.operator} ${JSON.stringify(x.value)}`;
}
