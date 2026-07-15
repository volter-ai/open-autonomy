import type { OrganizationIR } from './organization-ir';
import type { DeploymentCandidateV2, AtomicObligation, AssurancePolicy } from './organization-solver';
import { deriveAtomicObligations, validateDeploymentCandidate } from './organization-solver';
import type { AdapterContract, ComponentManifestV2 } from './organization-component';
import type { AutonomyIR, IRAgent, Trigger } from './ir';
import { validateIR } from './ir';

export type LoweringLevel = 'organization' | 'control' | 'execution' | 'invocation' | 'native';

export interface SemanticContractIR {
  assumptions: string[];
  guarantees: string[];
  observations: Record<string, { schema: string; version: string }>;
}

export interface ControlActorPlan {
  actor: string;
  behaviors: string[];
  activation: string[];
  authority: string[];
  sourceObligations: string[];
}

export interface ControlWorkPlan {
  workType: string;
  states: string[];
  transitions: Array<{ from: string; to: string; event: string }>;
  authority?: string;
  sourceObligations: string[];
}

export interface ControlPlanIR {
  schema: 'autonomy.control.v1';
  organization: string;
  contract: SemanticContractIR;
  actors: Record<string, ControlActorPlan>;
  work: Record<string, ControlWorkPlan>;
  enforcements: Array<{ policy: string; provider?: string; sourceObligations: string[] }>;
}

export interface ExecutionStep {
  id: string;
  actor: string;
  behavior: string;
  provider: string;
  runtime: string;
  endpoint?: string;
  isolation: string;
  credentialRefs: string[];
  instructionRenderer?: string;
  sourceObligations: string[];
}

export interface ExecutionPlanIR {
  schema: 'autonomy.execution.v1';
  organization: string;
  contract: SemanticContractIR;
  steps: ExecutionStep[];
  stateAuthorities: Record<string, string>;
  providerConfiguration: Record<string, Record<string, unknown>>;
}

export interface NativePlanIR {
  schema: 'autonomy.native-plan.v1';
  organization: string;
  steps: ExecutionStep[];
  authorities: Record<string, string>;
}

export interface LoweringDisposition {
  obligation: string;
  disposition: 'preserved' | 'weakened' | 'rejected' | 'unresolved';
  targets: string[];
  witness?: string;
  explanation?: string;
}

export interface ObservationProjection {
  source: string;
  target: string;
  relation: 'equal' | 'refines' | 'abstracts';
}

export interface PreservationCertificate {
  pass: string;
  from: LoweringLevel;
  to: LoweringLevel;
  assumptions: string[];
  guarantees: string[];
  requiredProgress: string[];
  observationProjections: ObservationProjection[];
  dispositions: LoweringDisposition[];
  losses: string[];
}

export interface LoweringSourceRelation {
  output: string;
  sources: string[];
}

export interface LoweringResult<T> {
  output?: T;
  sourceMap: LoweringSourceRelation[];
  certificate?: PreservationCertificate;
  newObligations: AtomicObligation[];
  losses: string[];
  errors: string[];
}

export interface ExecutionLoweringOptions {
  runtimes: Record<string, { provider: string; runtime: string; endpoint?: string; isolation: string; credentialRefs?: string[]; instructionRenderer?: string; configuration?: Record<string, unknown> }>;
}

export interface FixedPointLoweringResult {
  candidate?: DeploymentCandidateV2;
  control?: ControlPlanIR;
  execution?: ExecutionPlanIR;
  certificates: PreservationCertificate[];
  obligations: AtomicObligation[];
  errors: string[];
}

export interface V1ExecutionLoweringOptions {
  targets: string[];
  codeHost?: 'github' | 'local-git';
  policy: { maxConcurrent?: number; box: Record<string, unknown> };
  resources?: string[];
}

export interface V1ExecutionLoweringResult {
  output?: AutonomyIR;
  sourceMap: LoweringSourceRelation[];
  certificate?: PreservationCertificate;
  losses: string[];
  errors: string[];
}

export function lowerOrganizationToControl(organization: OrganizationIR, candidate: DeploymentCandidateV2): LoweringResult<ControlPlanIR> {
  const obligations = deriveAtomicObligations(organization);
  const errors = candidate.ledger.unresolved.length ? ['deployment candidate is not provisionally compatible'] : ledgerCoverage(obligations, candidate);
  if (errors.length) return { sourceMap: [], newObligations: [], losses: [], errors };
  const actors = Object.fromEntries(Object.entries(organization.actors).map(([actor, declaration]) => {
    const sourceObligations = obligations.filter((item) => item.path.startsWith(`actors.${actor}`) || declaration.behaviors.some((behavior) => item.path.startsWith(`behaviors.${behavior}`))).map((item) => item.id);
    return [actor, { actor, behaviors: [...declaration.behaviors], activation: (declaration.activation ?? []).map((item) => item.kind), authority: (declaration.capabilities ?? []).map((item) => item.capability), sourceObligations } satisfies ControlActorPlan];
  }));
  const work = Object.fromEntries(Object.entries(organization.workTypes ?? {}).map(([workType, declaration]) => {
    const sourceObligations = obligations.filter((item) => item.path.startsWith(`workTypes.${workType}`)).map((item) => item.id);
    return [workType, { workType, states: Object.keys(declaration.lifecycle.states), transitions: declaration.lifecycle.transitions.flatMap(({ from, to, event }) => (Array.isArray(from) ? from : [from]).map((source) => ({ from: source, to, event }))), authority: candidate.composition.authorities.work, sourceObligations } satisfies ControlWorkPlan];
  }));
  const enforcements = Object.keys(organization.policies ?? {}).map((policy) => ({ policy, provider: witnessProvider(candidate, `policies.${policy}`), sourceObligations: obligations.filter((item) => item.path.startsWith(`policies.${policy}`)).map((item) => item.id) }));
  const output: ControlPlanIR = { schema: 'autonomy.control.v1', organization: organization.name, contract: contract(obligations), actors, work, enforcements };
  const dispositions = obligations.map((obligation): LoweringDisposition => ({ obligation: obligation.id, disposition: 'preserved', targets: targetPaths(obligation, output), witness: candidate.ledger.witnesses.find((item) => item.obligation === obligation.id)?.provider }));
  const unaccounted = dispositions.filter((item) => !item.targets.length);
  if (unaccounted.length) return { sourceMap: [], newObligations: [], losses: [], errors: unaccounted.map((item) => `unaccounted source obligation '${item.obligation}'`) };
  const sourceMap = dispositions.flatMap((item) => item.targets.map((target) => ({ output: target, sources: [obligations.find((obligation) => obligation.id === item.obligation)!.path] })));
  return { output, sourceMap, certificate: certificate('organization-to-control', 'organization', 'control', obligations, dispositions), newObligations: [], losses: [], errors: [] };
}

export function lowerControlToExecution(control: ControlPlanIR, candidate: DeploymentCandidateV2, options: ExecutionLoweringOptions): LoweringResult<ExecutionPlanIR> {
  const errors: string[] = [];
  const steps: ExecutionStep[] = [];
  const newObligations: AtomicObligation[] = [];
  for (const actor of Object.values(control.actors)) for (const behavior of actor.behaviors) {
    const selected = options.runtimes[actor.actor];
    if (!selected) { errors.push(`actor '${actor.actor}' has no runtime lowering`); continue; }
    if (!candidate.composition.instances[selected.provider]) { errors.push(`actor '${actor.actor}' runtime names unselected provider '${selected.provider}'`); continue; }
    const id = `${actor.actor}:${behavior}`;
    steps.push({ id, actor: actor.actor, behavior, provider: selected.provider, runtime: selected.runtime, endpoint: selected.endpoint, isolation: selected.isolation, credentialRefs: [...(selected.credentialRefs ?? [])], instructionRenderer: selected.instructionRenderer, sourceObligations: actor.sourceObligations });
    newObligations.push({ id: `obl:execution.${id}.isolation`, path: `execution.steps.${id}.isolation`, claim: `enforce declared isolation '${selected.isolation}'`, facet: 'execution', operation: 'launch', risk: 'critical', required: true });
    for (const credential of selected.credentialRefs ?? []) newObligations.push({ id: `obl:execution.${id}.credential.${credential}`, path: `execution.steps.${id}.credentialRefs`, claim: `scope credential reference '${credential}' to step '${id}'`, facet: 'authority', operation: 'enforce', risk: 'critical', required: true });
  }
  if (errors.length) return { sourceMap: [], newObligations, losses: [], errors };
  const output: ExecutionPlanIR = { schema: 'autonomy.execution.v1', organization: control.organization, contract: { ...control.contract, assumptions: [...control.contract.assumptions, ...newObligations.map((item) => item.id)] }, steps, stateAuthorities: structuredClone(candidate.composition.authorities), providerConfiguration: Object.fromEntries(Object.entries(candidate.composition.instances).map(([id, value]) => [id, structuredClone(value.configuration ?? {})])) };
  const dispositions = control.contract.guarantees.map((obligation): LoweringDisposition => ({ obligation, disposition: 'preserved', targets: steps.filter((step) => step.sourceObligations.includes(obligation)).map((step) => `steps.${step.id}`) }));
  for (const work of Object.values(control.work)) for (const obligation of work.sourceObligations) dispositions.find((item) => item.obligation === obligation)?.targets.push(`stateAuthorities.work`);
  for (const enforcement of control.enforcements) for (const obligation of enforcement.sourceObligations) dispositions.find((item) => item.obligation === obligation)?.targets.push(`stateAuthorities.policy:${enforcement.policy}`);
  for (const disposition of dispositions) if (!disposition.targets.length && control.contract.guarantees.includes(disposition.obligation)) disposition.targets.push(`contract.guarantees.${disposition.obligation}`);
  const unaccounted = dispositions.filter((item) => !item.targets.length);
  if (unaccounted.length) return { sourceMap: [], newObligations, losses: [], errors: unaccounted.map((item) => `unaccounted source obligation '${item.obligation}'`) };
  const sourceMap = dispositions.flatMap((item) => item.targets.map((target) => ({ output: target, sources: [item.obligation] })));
  return { output, sourceMap, certificate: certificate('control-to-execution', 'control', 'execution', control.contract.guarantees.map(obligationFromId), dispositions, newObligations.map((item) => item.id)), newObligations, losses: [], errors: [] };
}

export function lowerToExecutionFixedPoint(
  organization: OrganizationIR, candidates: DeploymentCandidateV2[], manifests: Record<string, ComponentManifestV2>, adapters: Record<string, AdapterContract>, policy: AssurancePolicy,
  options: (candidate: DeploymentCandidateV2) => ExecutionLoweringOptions,
): FixedPointLoweringResult {
  const errors: string[] = [];
  for (const candidate of candidates) {
    const control = lowerOrganizationToControl(organization, candidate);
    if (!control.output || !control.certificate) { errors.push(...control.errors); continue; }
    const execution = lowerControlToExecution(control.output, candidate, options(candidate));
    if (!execution.output || !execution.certificate) { errors.push(...execution.errors); continue; }
    const all = [...deriveAtomicObligations(organization), ...execution.newObligations];
    const revalidated = validateDeploymentCandidate(all, candidate.composition, manifests, adapters, policy);
    if (revalidated.ledger.unresolved.length) { errors.push(`candidate '${candidate.objective.key}' failed lowering obligations: ${revalidated.ledger.unresolved.join(', ')}`); continue; }
    const composition = composePreservationCertificates(control.certificate, execution.certificate);
    if (composition.errors.length) { errors.push(...composition.errors); continue; }
    return { candidate: revalidated, control: control.output, execution: execution.output, certificates: [control.certificate, execution.certificate, composition.certificate!], obligations: all, errors: [] };
  }
  return { certificates: [], obligations: deriveAtomicObligations(organization), errors: errors.length ? errors : ['no deployment candidate supplied'] };
}

export function composePreservationCertificates(first: PreservationCertificate, second: PreservationCertificate): { certificate?: PreservationCertificate; errors: string[] } {
  const errors: string[] = [];
  if (first.to !== second.from) errors.push(`certificate level mismatch: ${first.to} != ${second.from}`);
  for (const assumption of second.assumptions) if (!first.guarantees.includes(assumption) && !second.requiredProgress.includes(assumption)) errors.push(`undischarged intermediate assumption '${assumption}'`);
  for (const projection of first.observationProjections) if (!second.observationProjections.some((next) => next.source === projection.target)) errors.push(`observation projection '${projection.target}' is not composed`);
  if (errors.length) return { errors };
  return { certificate: { pass: `${first.pass}+${second.pass}`, from: first.from, to: second.to, assumptions: [...first.assumptions], guarantees: [...second.guarantees], requiredProgress: [...new Set([...first.requiredProgress, ...second.requiredProgress])], observationProjections: first.observationProjections.map((projection) => ({ source: projection.source, target: second.observationProjections.find((next) => next.source === projection.target)!.target, relation: projection.relation })), dispositions: [...first.dispositions, ...second.dispositions], losses: [...first.losses, ...second.losses] }, errors: [] };
}

export function emitExecutableArtifact(result: FixedPointLoweringResult): { artifact?: NativePlanIR; errors: string[] } {
  if (!result.execution || !result.candidate || result.errors.length) return { errors: ['lowering fixed point is not closed'] };
  if (result.candidate.ledger.unresolved.length) return { errors: ['final deployment ledger has unresolved obligations'] };
  return { artifact: { schema: 'autonomy.native-plan.v1', organization: result.execution.organization, steps: structuredClone(result.execution.steps), authorities: structuredClone(result.execution.stateAuthorities) }, errors: [] };
}

export function lowerExecutionToV1(organization: OrganizationIR, execution: ExecutionPlanIR, options: V1ExecutionLoweringOptions): V1ExecutionLoweringResult {
  const errors: string[] = [];
  const agents: Record<string, IRAgent> = {};
  const sourceMap: LoweringSourceRelation[] = [];
  for (const [actorId, actor] of Object.entries(organization.actors)) {
    const steps = execution.steps.filter((step) => step.actor === actorId);
    if (actor.kind !== 'human' && steps.length !== 1) { errors.push(`v1 requires exactly one execution step for actor '${actorId}'`); continue; }
    if (actor.behaviors.length !== 1) { errors.push(`v1 cannot represent actor '${actorId}' with ${actor.behaviors.length} behaviors`); continue; }
    const behavior = organization.behaviors?.[actor.behaviors[0]];
    if (!behavior) { errors.push(`actor '${actorId}' names unknown behavior '${actor.behaviors[0]}'`); continue; }
    const behaviorTarget = behavior.source?.uri ?? (typeof behavior.inline === 'string' ? behavior.inline : undefined);
    if (!behaviorTarget) { errors.push(`v1 behavior '${actor.behaviors[0]}' requires a source URI or inline string`); continue; }
    const triggers = (actor.activation ?? []).flatMap((activation): Trigger[] => {
      if (activation.kind === 'schedule') {
        if (typeof activation.expression !== 'string') { errors.push(`v1 cron activation for '${actorId}' must use an opaque cron string`); return []; }
        return [{ cron: activation.expression }];
      }
      if ((activation.kind === 'event' || activation.kind === 'message') && activation.eventType) return [{ event: activation.eventType }];
      if (activation.kind === 'manual' || activation.kind === 'work-available') return [{ dispatch: true }];
      errors.push(`v1 cannot represent ${activation.kind} activation for '${actorId}'`); return [];
    });
    if (!triggers.length) errors.push(`v1 actor '${actorId}' requires at least one representable activation`);
    agents[actorId] = { behavior: behaviorTarget, capabilities: (actor.capabilities ?? []).map((grant) => grant.capability), triggers, kind: actor.kind === 'human' ? 'human' : 'agent' };
    sourceMap.push({ output: `agents.${actorId}`, sources: [`actors.${actorId}`, `behaviors.${actor.behaviors[0]}`, ...steps.flatMap((step) => step.sourceObligations) ] });
  }
  if (errors.length) return { sourceMap, losses: [], errors };
  const output: AutonomyIR = { schema: 'autonomy.ir.v1', targets: [...options.targets], codeHost: options.codeHost, agents, policy: structuredClone(options.policy), resources: [...(options.resources ?? [])] };
  errors.push(...validateIR(output));
  if (errors.length) return { sourceMap, losses: [], errors };
  const dispositions = execution.contract.guarantees.map((obligation): LoweringDisposition => {
    const targets = sourceMap.filter((relation) => relation.sources.includes(obligation)).map((relation) => relation.output);
    return { obligation, disposition: targets.length ? 'preserved' : 'unresolved', targets, explanation: targets.length ? undefined : 'v1 has no mapped target' };
  });
  const unresolved = dispositions.filter((item) => item.disposition === 'unresolved');
  if (unresolved.length) return { sourceMap, losses: [], errors: unresolved.map((item) => `v1 lowering leaves '${item.obligation}' unaccounted`) };
  const certificate: PreservationCertificate = { pass: 'execution-to-v1', from: 'execution', to: 'native', assumptions: [...execution.contract.assumptions], guarantees: [...execution.contract.guarantees], requiredProgress: [], observationProjections: [{ source: 'execution.event', target: 'v1.runner-result', relation: 'abstracts' }], dispositions, losses: [] };
  return { output, sourceMap, certificate, losses: [], errors: [] };
}

function contract(obligations: AtomicObligation[]): SemanticContractIR { return { assumptions: [], guarantees: obligations.map((item) => item.id), observations: { event: { schema: 'autonomy.event', version: '1' } } }; }
function certificate(pass: string, from: LoweringLevel, to: LoweringLevel, obligations: AtomicObligation[], dispositions: LoweringDisposition[], requiredProgress: string[] = []): PreservationCertificate { return { pass, from, to, assumptions: from === 'organization' ? [] : obligations.map((item) => item.id), guarantees: obligations.map((item) => item.id), requiredProgress, observationProjections: [{ source: `${from}.event`, target: `${to}.event`, relation: 'refines' }], dispositions, losses: [] }; }
function obligationFromId(id: string): AtomicObligation { return { id, path: id.slice(4), claim: id, facet: 'storage', operation: 'represent', risk: 'low', required: true }; }
function witnessProvider(candidate: DeploymentCandidateV2, path: string): string | undefined { return candidate.ledger.witnesses.find((item) => candidate.ledger.obligations.find((obligation) => obligation.id === item.obligation)?.path.startsWith(path))?.provider; }
function ledgerCoverage(obligations: AtomicObligation[], candidate: DeploymentCandidateV2): string[] { const recorded = new Set(candidate.ledger.obligations.map((item) => item.id)); return obligations.filter((item) => !recorded.has(item.id)).map((item) => `deployment ledger omits '${item.id}'`); }
function targetPaths(obligation: AtomicObligation, output: ControlPlanIR): string[] {
  const [root, id] = obligation.path.split('.');
  if (root === 'actors' && output.actors[id]) return [`actors.${id}`];
  if (root === 'behaviors') return Object.values(output.actors).filter((actor) => actor.behaviors.includes(id)).map((actor) => `actors.${actor.actor}.behaviors`);
  if ((root === 'workTypes' || root === 'initialWork') && output.work[id]) return [`work.${id}`];
  if (root === 'policies') return [`enforcements.${id}`];
  return [`contract.guarantees.${obligation.id}`];
}
