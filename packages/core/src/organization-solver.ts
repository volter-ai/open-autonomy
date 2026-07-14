import type { OrganizationIR } from './organization-ir';
import type { AdapterContract, ClaimAssurance, ComponentComposition, ComponentManifestV2, FacetKind, ManifestEvidence } from './organization-component';
import { validateAdapterContract, validateComponentComposition } from './organization-component';

export type ObligationRisk = 'low' | 'medium' | 'high' | 'critical';
export type ObligationDisposition = 'preserved' | 'adapter-realized' | 'approximated' | 'rejected' | 'unresolved';

export interface AtomicObligation {
  id: string;
  path: string;
  claim: string;
  facet: FacetKind;
  operation: string;
  risk: ObligationRisk;
  required: boolean;
  state?: string;
}

export interface AssumptionAcceptance {
  assumption: string;
  acceptedBy: string;
  scope: string;
  expires?: string;
  untilVersion?: string;
}

export interface AssurancePolicy {
  minimum: Record<ObligationRisk, ClaimAssurance>;
  allowApproximation: boolean;
  acceptedAssumptions: AssumptionAcceptance[];
  asOf?: string;
}

export interface ObligationWitness {
  obligation: string;
  disposition: ObligationDisposition;
  provider?: string;
  facet?: string;
  evidence?: ManifestEvidence;
  adapter?: string;
  assumptions: string[];
  losses: string[];
  errors: string[];
}

export interface CompatibilityLedger {
  obligations: AtomicObligation[];
  witnesses: ObligationWitness[];
  unresolved: string[];
}

export interface DeploymentCandidateV2 {
  composition: ComponentComposition;
  ledger: CompatibilityLedger;
  objective: { approximations: number; assumptions: number; preferencePenalty: number; unknownEconomics: number; estimatedCost: number; estimatedLatency: number; negativeCapacity: number; providerCount: number; key: string };
}

export interface SearchDomain {
  completeness: 'finite-exhaustive' | 'bounded-heuristic';
  maxCandidates: number;
  preferredManifests?: string[];
}

export interface DeploymentSearchResult {
  status: 'compatible' | 'incompatible' | 'exhausted' | 'undetermined';
  candidates: DeploymentCandidateV2[];
  explored: number;
  complete: boolean;
  unsatisfiedCore: string[];
  coreMinimality: 'atomic-witness' | 'subset-minimal' | 'none';
  errors: string[];
}

const rootFacet: Record<string, [FacetKind, string, ObligationRisk]> = {
  types: ['storage', 'represent', 'low'], behaviors: ['behavior', 'invoke', 'high'], tools: ['tool', 'call', 'high'], memories: ['memory', 'store', 'medium'],
  capabilities: ['authority', 'enforce', 'critical'], actors: ['actor', 'run', 'high'], units: ['storage', 'represent', 'low'], relations: ['storage', 'represent', 'medium'],
  goals: ['storage', 'represent', 'medium'], workTypes: ['work', 'transition', 'high'], initialWork: ['work', 'create', 'high'], protocols: ['interaction', 'exchange', 'high'],
  policies: ['authority', 'enforce', 'critical'], budgets: ['authority', 'account', 'high'], decisions: ['authority', 'decide', 'high'], artifacts: ['artifact', 'store', 'medium'],
};

export function deriveAtomicObligations(ir: OrganizationIR): AtomicObligation[] {
  const obligations: AtomicObligation[] = [];
  for (const [root, [facet, operation, risk]] of Object.entries(rootFacet)) {
    const value = (ir as unknown as Record<string, unknown>)[root];
    if (value === undefined) continue;
    for (const path of semanticLeaves(value, root)) obligations.push({
      id: `obl:${path}`, path, claim: `preserve semantic value at ${path}`, facet, operation, risk, required: true,
      state: root === 'workTypes' || root === 'initialWork' ? 'work' : root === 'artifacts' ? 'artifact' : undefined,
    });
  }
  for (const actor of Object.keys(ir.actors)) obligations.push({ id: `obl:actors.${actor}.identity`, path: `actors.${actor}`, claim: `preserve durable actor identity '${actor}'`, facet: 'actor', operation: 'identity', risk: 'high', required: true });
  return dedupe(obligations).sort((a, b) => compare(a.id, b.id));
}

export function validateDeploymentCandidate(
  obligations: AtomicObligation[], composition: ComponentComposition, manifests: Record<string, ComponentManifestV2>,
  adapters: Record<string, AdapterContract>, policy: AssurancePolicy, preferences: string[] = [],
): DeploymentCandidateV2 {
  const compositionResult = validateComponentComposition(composition, manifests, adapters);
  const witnesses = obligations.map((obligation) => witnessObligation(obligation, composition, manifests, adapters, policy));
  if (compositionResult.errors.length) witnesses.push({ obligation: 'global:composition', disposition: 'rejected', assumptions: [], losses: [], errors: compositionResult.errors });
  const unresolved = witnesses.filter((witness) => witness.disposition === 'unresolved' || witness.disposition === 'rejected').map((witness) => witness.obligation).sort();
  const estimatedCost = Object.values(composition.instances).reduce((sum, instance) => sum + (manifests[instance.manifest]?.cost ?? []).reduce((inner, cost) => inner + (cost.value ?? 0), 0), 0);
  const estimatedLatency = Object.values(composition.instances).reduce((sum, instance) => sum + (manifests[instance.manifest]?.capacity ?? []).filter((value) => value.unit === 'latency-ms').reduce((inner, value) => inner + (value.value ?? 0), 0), 0);
  const capacity = Object.values(composition.instances).reduce((sum, instance) => sum + (manifests[instance.manifest]?.capacity ?? []).filter((value) => value.unit === 'concurrent-invocations').reduce((inner, value) => inner + (value.value ?? 0), 0), 0);
  const unknownEconomics = Object.values(composition.instances).reduce((sum, instance) => sum + [...(manifests[instance.manifest]?.cost ?? []), ...(manifests[instance.manifest]?.capacity ?? [])].filter((value) => value.value === undefined).length, 0);
  const preferencePenalty = Object.values(composition.instances).reduce((sum, instance) => { const rank = preferences.indexOf(instance.manifest); return sum + (rank < 0 ? preferences.length : rank); }, 0);
  const assumptions = witnesses.reduce((sum, witness) => sum + witness.assumptions.length, 0);
  const approximations = witnesses.filter((witness) => witness.disposition === 'approximated').length;
  const key = Object.entries(composition.instances).sort().map(([id, value]) => `${id}=${value.manifest}`).join(',');
  return { composition: structuredClone(composition), ledger: { obligations: structuredClone(obligations), witnesses, unresolved }, objective: { approximations, assumptions, preferencePenalty, unknownEconomics, estimatedCost, estimatedLatency, negativeCapacity: -capacity, providerCount: Object.keys(composition.instances).length, key } };
}

export function solveDeploymentV2(
  organization: OrganizationIR, manifests: Record<string, ComponentManifestV2>, adapters: Record<string, AdapterContract>,
  policy: AssurancePolicy, domain: SearchDomain,
): DeploymentSearchResult {
  const obligations = deriveAtomicObligations(organization);
  const facets = [...new Set(obligations.map((obligation) => obligation.facet))].sort();
  const choices = facets.map((facet) => Object.values(manifests).filter((manifest) => Object.values(manifest.facets).some((provision) => provision.facet === facet)).map((manifest) => manifest.id).sort());
  const immediatelyMissing = facets.filter((_, index) => choices[index].length === 0);
  if (immediatelyMissing.length) return { status: 'incompatible', candidates: [], explored: 0, complete: true, unsatisfiedCore: [obligations.find((item) => immediatelyMissing.includes(item.facet))!.id], coreMinimality: 'atomic-witness', errors: immediatelyMissing.map((facet) => `no provider for facet '${facet}'`) };
  const candidates: DeploymentCandidateV2[] = [];
  let explored = 0; let exhausted = false;
  const visit = (index: number, selected: string[]) => {
    if (explored >= domain.maxCandidates) { exhausted = true; return; }
    if (index < facets.length) { for (const choice of choices[index]) { visit(index + 1, [...selected, choice]); if (exhausted) return; } return; }
    explored++;
    const ids = [...new Set(selected)];
    const instances = Object.fromEntries(ids.map((id) => [id, { manifest: id }]));
    const authorities: Record<string, string> = {};
    for (const state of [...new Set(ids.flatMap((id) => manifests[id].state.filter((contract) => contract.authority === 'authoritative').map((contract) => contract.state)))]) {
      const owners = ids.filter((id) => manifests[id].state.some((contract) => contract.state === state && contract.authority === 'authoritative'));
      if (owners.length === 1) authorities[state] = owners[0];
    }
    const candidate = validateDeploymentCandidate(obligations, { instances, authorities }, manifests, adapters, policy, domain.preferredManifests ?? []);
    if (!candidate.ledger.unresolved.length) candidates.push(candidate);
  };
  visit(0, []);
  candidates.sort((a, b) => compareObjective(a.objective, b.objective));
  const complete = !exhausted && domain.completeness === 'finite-exhaustive';
  if (candidates.length) return { status: 'compatible', candidates, explored, complete, unsatisfiedCore: [], coreMinimality: 'none', errors: [] };
  if (!complete) return { status: 'exhausted', candidates: [], explored, complete: false, unsatisfiedCore: [], coreMinimality: 'none', errors: ['search bound exhausted; incompatibility is not established'] };
  const core = minimalUnsatisfiedCore(obligations, manifests, adapters, policy);
  if (!core.length) return { status: 'undetermined', candidates: [], explored, complete: true, unsatisfiedCore: [], coreMinimality: 'none', errors: ['finite search found no composition but no valid minimal core was derived'] };
  return { status: 'incompatible', candidates: [], explored, complete: true, unsatisfiedCore: core, coreMinimality: 'atomic-witness', errors: ['finite search found no compatible composition'] };
}

function witnessObligation(obligation: AtomicObligation, composition: ComponentComposition, manifests: Record<string, ComponentManifestV2>, adapters: Record<string, AdapterContract>, policy: AssurancePolicy): ObligationWitness {
  const candidates = Object.entries(composition.instances).flatMap(([instance, configured]) => Object.entries(manifests[configured.manifest]?.facets ?? {}).filter(([, provision]) => provision.facet === obligation.facet && (provision.operations.includes(obligation.operation) || provision.operations.includes('*'))).map(([facet, provision]) => ({ instance, facet, provision })));
  if (!candidates.length) return { obligation: obligation.id, disposition: 'unresolved', assumptions: [], losses: [], errors: [`no selected provider realizes ${obligation.facet}`] };
  for (const candidate of candidates) {
    const minimum = policy.minimum[obligation.risk];
    if (assuranceRank(candidate.provision.evidence.assurance) < assuranceRank(minimum)) continue;
    if (obligation.state) {
      const authority = composition.authorities[obligation.state];
      if (authority !== candidate.instance) continue;
      const state = manifests[composition.instances[candidate.instance].manifest].state.find((contract) => contract.state === obligation.state && contract.authority === 'authoritative');
      if (!state || [state.consistency, state.ordering, state.recovery, state.identity].includes('unknown')) continue;
    }
    if (obligation.risk === 'high' || obligation.risk === 'critical') {
      const trust = manifests[composition.instances[candidate.instance].manifest].trust.find((contract) => contract.principal && contract.zone && contract.enforcedBy);
      if (!trust || assuranceRank(trust.evidence.assurance) < assuranceRank(minimum)) continue;
    }
    const assumption = candidate.provision.evidence.assurance === 'asserted' ? `trust:${manifests[composition.instances[candidate.instance].manifest].id}:${candidate.facet}:asserted` : undefined;
    if (assumption && !accepted(assumption, obligation.id, policy)) continue;
    return { obligation: obligation.id, disposition: 'preserved', provider: candidate.instance, facet: candidate.facet, evidence: candidate.provision.evidence, assumptions: assumption ? [assumption] : [], losses: [], errors: [] };
  }
  const adapter = Object.entries(adapters).find(([, value]) => (composition.adapters ?? []).includes(value.id) && !validateAdapterContract(value, adapters).errors.length);
  if (adapter && policy.allowApproximation) return { obligation: obligation.id, disposition: adapter[1].losses.length ? 'approximated' : 'adapter-realized', adapter: adapter[0], evidence: adapter[1].evidence, assumptions: [], losses: adapter[1].losses, errors: [] };
  return { obligation: obligation.id, disposition: 'unresolved', assumptions: [], losses: [], errors: [`available ${obligation.facet} claims do not meet ${obligation.risk} assurance policy`] };
}

function minimalUnsatisfiedCore(obligations: AtomicObligation[], manifests: Record<string, ComponentManifestV2>, adapters: Record<string, AdapterContract>, policy: AssurancePolicy): string[] {
  return obligations.filter((obligation) => !Object.values(manifests).some((manifest) => Object.values(manifest.facets).some((facet) => facet.facet === obligation.facet && (facet.operations.includes(obligation.operation) || facet.operations.includes('*')) && assuranceRank(facet.evidence.assurance) >= assuranceRank(policy.minimum[obligation.risk])))).map((obligation) => obligation.id).slice(0, 1);
}
function semanticLeaves(value: unknown, path: string): string[] {
  if (value === null || typeof value !== 'object') return [path];
  if (Array.isArray(value)) return value.length ? value.flatMap((child, index) => semanticLeaves(child, `${path}.${index}`)) : [path];
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length ? entries.flatMap(([key, child]) => semanticLeaves(child, `${path}.${key}`)) : [path];
}
function assuranceRank(value: ClaimAssurance): number { return { unknown: 0, asserted: 1, 'conformance-tested': 2, 'live-observed': 3 }[value]; }
function accepted(assumption: string, obligation: string, policy: AssurancePolicy): boolean {
  return policy.acceptedAssumptions.some((item) => item.assumption === assumption && (item.scope === '*' || item.scope === obligation)
    && (!item.expires || !policy.asOf || item.expires >= policy.asOf));
}
function dedupe(values: AtomicObligation[]): AtomicObligation[] { return [...new Map(values.map((value) => [value.id, value])).values()]; }
function compare(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function compareObjective(left: DeploymentCandidateV2['objective'], right: DeploymentCandidateV2['objective']): number {
  return left.approximations - right.approximations || left.assumptions - right.assumptions || left.preferencePenalty - right.preferencePenalty
    || left.unknownEconomics - right.unknownEconomics || left.estimatedCost - right.estimatedCost || left.estimatedLatency - right.estimatedLatency
    || left.negativeCapacity - right.negativeCapacity || left.providerCount - right.providerCount || compare(left.key, right.key);
}
