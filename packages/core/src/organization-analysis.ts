import type { CapabilityGrant, OrganizationIR, ResourceSelector } from './organization-ir';

export type AnalysisStatus = 'proved' | 'violated' | 'unknown';
export interface AnalysisBounds { maximumStates: number; maximumDepth: number; horizon?: string; }
export interface AnalysisFinding { property: string; message: string; counterexample: string[]; }
export interface AnalysisCertificate {
  checker: 'oa-finite-analysis-v1'; modelDigest: string; resultDigest: string; exploredStates: number; checkedProperties: string[];
}
export interface OrganizationAnalysisResult {
  id: string; status: AnalysisStatus; assurance: 'model-checked' | 'statically-checked' | 'unknown';
  soundnessDomain: string; bounds: AnalysisBounds; assumptions: string[]; findings: AnalysisFinding[];
  certificate?: AnalysisCertificate;
}
export interface DelegationEdge { from: string; to: string; parent: CapabilityGrant; child: CapabilityGrant; }
export interface InformationFlowEdge { from: string; to: string; sourceLabel: number; targetClearance: number; sanitizer?: string; }
export interface ResourceDemand { budget: string; amount: number; unit: string; horizon?: string; arrivals?: number; serviceCapacity?: number; }
export interface AnalysisEnvironment {
  bounds: AnalysisBounds;
  fairnessAssumptions?: string[];
  delegations?: DelegationEdge[];
  informationFlows?: InformationFlowEdge[];
  resourceDemands?: ResourceDemand[];
  closedWorld?: Array<'delegation' | 'information-flow' | 'resource-demand'>;
}

export function analyzeOrganization(ir: OrganizationIR, environment: AnalysisEnvironment): OrganizationAnalysisResult[] {
  const results = [
    lifecycle(ir, environment), deadlock(ir, environment), attenuation(ir, environment), leastAuthority(ir, environment),
    separationOfDuty(ir, environment), protocolCompatibility(ir, environment), informationFlow(environment),
    budgetBounds(ir, environment), retryAmplification(ir, environment), controlLoopProgress(ir, environment),
  ];
  const modelDigest = digest(JSON.stringify({ ir, environment }));
  for (const item of results) if (item.certificate) {
    item.certificate.modelDigest = modelDigest;
    item.certificate.resultDigest = digest(resultCertificatePayload(item));
  }
  return results;
}

export function verifyAnalysisCertificate(result: OrganizationAnalysisResult, ir: OrganizationIR, environment: AnalysisEnvironment): boolean {
  return Boolean(result.certificate && result.certificate.checker === 'oa-finite-analysis-v1'
    && result.certificate.modelDigest === digest(JSON.stringify({ ir, environment }))
    && result.certificate.resultDigest === digest(resultCertificatePayload(result)));
}

function lifecycle(ir: OrganizationIR, env: AnalysisEnvironment): OrganizationAnalysisResult {
  const findings: AnalysisFinding[] = []; let explored = 0;
  for (const [type, work] of Object.entries(ir.workTypes ?? {})) {
    const reached = new Set([work.lifecycle.initial]); const paths = new Map([[work.lifecycle.initial, [work.lifecycle.initial]]]);
    let changed = true;
    while (changed && reached.size <= env.bounds.maximumStates) {
      changed = false;
      for (const transition of work.lifecycle.transitions) for (const from of array(transition.from)) if (reached.has(from) && !reached.has(transition.to)) {
        reached.add(transition.to); paths.set(transition.to, [...(paths.get(from) ?? [from]), transition.to]); changed = true;
      }
    }
    explored += reached.size;
    for (const state of Object.keys(work.lifecycle.states)) if (!reached.has(state)) findings.push({ property: 'state-reachability', message: `${type}.${state} is unreachable`, counterexample: [work.lifecycle.initial, `no path to ${state}`] });
    if (![...reached].some((state) => work.lifecycle.terminal.includes(state))) findings.push({ property: 'terminal-reachability', message: `${type} cannot reach a terminal state`, counterexample: [...reached] });
  }
  return result('lifecycle-reachability', findings, env, explored, 'finite explicit lifecycle graphs; guards are treated as potentially enabled');
}

function deadlock(ir: OrganizationIR, env: AnalysisEnvironment): OrganizationAnalysisResult {
  const findings: AnalysisFinding[] = []; let explored = 0;
  for (const [type, work] of Object.entries(ir.workTypes ?? {})) for (const state of Object.keys(work.lifecycle.states)) {
    explored++;
    if (!work.lifecycle.terminal.includes(state) && !work.lifecycle.transitions.some((transition) => array(transition.from).includes(state)))
      findings.push({ property: 'dead-state', message: `${type}.${state} is nonterminal with no outgoing transition`, counterexample: [state] });
  }
  return result('dead-state-and-deadlock', findings, env, explored, 'local lifecycle deadlock only; protocol composition is checked separately');
}

function attenuation(ir: OrganizationIR, env: AnalysisEnvironment): OrganizationAnalysisResult {
  if (!(env.closedWorld ?? []).includes('delegation')) return unknown('capability-attenuation', env, 'delegation relation is not closed', 'explicit delegation edges and finite selectors');
  const findings = (env.delegations ?? []).flatMap((edge) => grantContained(edge.child, edge.parent) ? [] : [{ property: 'monotone-attenuation', message: `${edge.from} delegates greater authority to ${edge.to}`, counterexample: [edge.from, edge.to] }]);
  return result('capability-attenuation', findings, env, env.delegations?.length ?? 0, 'declared capability, selector, expiry, budget, and delegation flags');
}

function leastAuthority(ir: OrganizationIR, env: AnalysisEnvironment): OrganizationAnalysisResult {
  const required = new Set(Object.values(ir.workTypes ?? {}).flatMap((work) => work.requiredCapabilities ?? []));
  const findings: AnalysisFinding[] = [];
  for (const [actor, declaration] of Object.entries(ir.actors)) for (const grant of declaration.capabilities ?? []) if (!required.has(grant.capability))
    findings.push({ property: 'least-authority', message: `${actor} holds unused capability ${grant.capability}`, counterexample: [actor, grant.capability] });
  return result('least-authority', findings, env, Object.keys(ir.actors).length, 'capabilities required by declared work types; external behavior needs are outside the proof');
}

function separationOfDuty(ir: OrganizationIR, env: AnalysisEnvironment): OrganizationAnalysisResult {
  const findings: AnalysisFinding[] = [];
  for (const [type, work] of Object.entries(ir.workTypes ?? {})) if (work.verification?.independent) {
    const candidates = new Set(work.assignment?.candidates ?? Object.keys(ir.actors)); const verifiers = new Set(work.verification.verifier ?? []);
    for (const identity of candidates) if (verifiers.has(identity)) findings.push({ property: 'independent-verification', message: `${identity} may both execute and verify ${type}`, counterexample: [identity, type, identity] });
    if (!verifiers.size) findings.push({ property: 'independent-verification', message: `${type} requires independence but names no verifier`, counterexample: [type] });
  }
  return result('separation-of-duty', findings, env, Object.keys(ir.workTypes ?? {}).length, 'explicit assignment candidates and verifier identities');
}

function protocolCompatibility(ir: OrganizationIR, env: AnalysisEnvironment): OrganizationAnalysisResult {
  const findings: AnalysisFinding[] = []; let explored = 0;
  for (const [id, protocol] of Object.entries(ir.protocols ?? {})) {
    for (const [message, declaration] of Object.entries(protocol.messages)) for (const role of [...array(declaration.from), ...array(declaration.to)]) if (!protocol.roles.includes(role))
      findings.push({ property: 'role-compatibility', message: `${id}.${message} references undeclared role ${role}`, counterexample: [id, message, role] });
    const session = protocol.sessions; if (!session) continue;
    const reached = new Set([session.initial]); let changed = true;
    while (changed) { changed = false; for (const state of [...reached]) for (const target of Object.values(session.states[state]?.on ?? {})) if (!reached.has(target)) { reached.add(target); changed = true; } }
    explored += reached.size;
    for (const state of reached) if (!session.terminal?.includes(state) && !Object.keys(session.states[state]?.on ?? {}).length)
      findings.push({ property: 'session-deadlock', message: `${id}.${state} is reachable and stuck`, counterexample: [...reached, state] });
  }
  return result('protocol-compatibility', findings, env, explored, 'declared roles, messages, and finite session automata');
}

function informationFlow(env: AnalysisEnvironment): OrganizationAnalysisResult {
  if (!(env.closedWorld ?? []).includes('information-flow')) return unknown('information-flow', env, 'flow graph is not closed', 'numeric security lattice and explicit flow edges');
  const findings = (env.informationFlows ?? []).flatMap((edge) => edge.sourceLabel <= edge.targetClearance || edge.sanitizer ? [] : [{ property: 'noninterference', message: `flow ${edge.from} -> ${edge.to} exceeds target clearance`, counterexample: [edge.from, edge.to] }]);
  const sanitizerAssumptions = (env.informationFlows ?? []).flatMap((edge) => edge.sanitizer ? [`sanitizer '${edge.sanitizer}' enforces the declared declassification`] : []);
  return result('information-flow', findings, { ...env, fairnessAssumptions: [...(env.fairnessAssumptions ?? []), ...sanitizerAssumptions] }, env.informationFlows?.length ?? 0, 'finite numeric label lattice; named sanitizers are assumed correct');
}

function budgetBounds(ir: OrganizationIR, env: AnalysisEnvironment): OrganizationAnalysisResult {
  if (!(env.closedWorld ?? []).includes('resource-demand')) return unknown('budget-bounds', env, 'resource demand is not closed', 'declared budgets and horizon-aligned demand');
  const findings: AnalysisFinding[] = [];
  for (const demand of env.resourceDemands ?? []) {
    const budget = ir.budgets?.[demand.budget];
    if (!budget || budget.unit !== demand.unit || (budget.period ?? undefined) !== (demand.horizon ?? undefined)) findings.push({ property: 'typed-budget', message: `${demand.budget} has incomparable unit or horizon`, counterexample: [demand.budget, demand.unit, demand.horizon ?? 'unbounded'] });
    else if (demand.amount > budget.limit) findings.push({ property: 'budget-feasibility', message: `${demand.budget} demand exceeds limit`, counterexample: [`${demand.amount}`, `${budget.limit}`] });
    if (demand.arrivals !== undefined && demand.serviceCapacity !== undefined && demand.arrivals > demand.serviceCapacity) findings.push({ property: 'capacity-feasibility', message: `${demand.budget} arrivals exceed service capacity`, counterexample: [`arrivals=${demand.arrivals}`, `service=${demand.serviceCapacity}`] });
  }
  return result('budget-bounds', findings, env, env.resourceDemands?.length ?? 0, 'finite typed demand horizon and explicit arrival/service bounds');
}

function retryAmplification(ir: OrganizationIR, env: AnalysisEnvironment): OrganizationAnalysisResult {
  const findings: AnalysisFinding[] = [];
  for (const [type, work] of Object.entries(ir.workTypes ?? {})) if (work.retry && work.retry.maxAttempts === undefined)
    findings.push({ property: 'retry-amplification', message: `${type} retry has no finite attempt bound`, counterexample: [type, 'retry', work.retry.exhaustion ?? 'unspecified'] });
  return result('retry-amplification', findings, env, Object.keys(ir.workTypes ?? {}).length, 'per-work retry declarations; downstream retry layers require composition summaries');
}

function controlLoopProgress(ir: OrganizationIR, env: AnalysisEnvironment): OrganizationAnalysisResult {
  const findings: AnalysisFinding[] = [];
  for (const [type, work] of Object.entries(ir.workTypes ?? {})) {
    if (work.retry?.exhaustion === 'replan' && work.retry.maxAttempts === undefined && work.retry.maxElapsed === undefined)
      findings.push({ property: 'ranking-function', message: `${type} can replan without a decreasing finite bound`, counterexample: [type, 'attempt', 'replan', 'attempt'] });
    if (!work.lifecycle.terminal.length) findings.push({ property: 'progress-target', message: `${type} has no declared terminal progress target`, counterexample: [type] });
  }
  const assumptions = [...(env.fairnessAssumptions ?? []), 'environment eventually supplies enabled external responses'];
  return result('control-loop-progress', findings, { ...env, fairnessAssumptions: assumptions }, Object.keys(ir.workTypes ?? {}).length, 'bounded retry/replan loops and declared terminal lifecycle targets');
}

function result(id: string, findings: AnalysisFinding[], env: AnalysisEnvironment, exploredStates: number, soundnessDomain: string): OrganizationAnalysisResult {
  const boundedOut = exploredStates > env.bounds.maximumStates;
  if (boundedOut) return unknown(id, env, `state bound ${env.bounds.maximumStates} exhausted`, soundnessDomain);
  return { id, status: findings.length ? 'violated' : 'proved', assurance: 'model-checked', soundnessDomain, bounds: { ...env.bounds }, assumptions: [...(env.fairnessAssumptions ?? [])], findings, certificate: { checker: 'oa-finite-analysis-v1', modelDigest: '', resultDigest: '', exploredStates, checkedProperties: [...new Set([id, ...findings.map((item) => item.property)])].sort() } };
}
function unknown(id: string, env: AnalysisEnvironment, message: string, domain: string): OrganizationAnalysisResult { return { id, status: 'unknown', assurance: 'unknown', soundnessDomain: domain, bounds: { ...env.bounds }, assumptions: [...(env.fairnessAssumptions ?? [])], findings: [{ property: 'analysis-boundary', message, counterexample: [] }] }; }
function array<T>(value: T | T[]): T[] { return Array.isArray(value) ? value : [value]; }
function grantContained(child: CapabilityGrant, parent: CapabilityGrant): boolean {
  return child.capability === parent.capability && selectorContained(child.scope, parent.scope) && (!parent.budget || child.budget === parent.budget) && (!parent.expires || Boolean(child.expires && child.expires <= parent.expires)) && parent.delegable !== false;
}
function selectorContained(child?: ResourceSelector, parent?: ResourceSelector): boolean {
  if (!parent) return true; if (!child || child.expression || parent.expression) return false;
  if (parent.kind && child.kind !== parent.kind) return false;
  if (parent.ids && (!child.ids || child.ids.some((id) => !parent.ids!.includes(id)))) return false;
  return Object.entries(parent.labels ?? {}).every(([key, value]) => child.labels?.[key] === value);
}
function digest(value: string): string { let hash = 2166136261; for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`; }
function resultCertificatePayload(result: OrganizationAnalysisResult): string {
  return JSON.stringify({ id: result.id, status: result.status, assurance: result.assurance, soundnessDomain: result.soundnessDomain, bounds: result.bounds, assumptions: result.assumptions, findings: result.findings, exploredStates: result.certificate?.exploredStates, checkedProperties: result.certificate?.checkedProperties });
}
