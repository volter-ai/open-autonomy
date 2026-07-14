import type { OrganizationIR, OrganizationStateIR } from './organization-ir';
import { semanticDigest } from './organization-canonical';
import { materializeOrganizationState, type StateEvent } from './organization-state';

export type EpistemicStatus = 'assertion' | 'report' | 'observation' | 'inference' | 'attestation' | 'verification';
export type ConflictResolution = 'commute' | 'reject' | 'id-order' | 'authority-order';

export interface PortableEventV2 {
  schema: 'autonomy.event.v2';
  reducer: string;
  id: string;
  type: string;
  at: string;
  issuer: string;
  actor?: string;
  subject?: { kind: string; id: string };
  parents: string[];
  correlation?: string;
  epistemic: EpistemicStatus;
  provenance: Array<{ uri: string; digest?: string }>;
  evidence?: Array<{ kind: string; uri: string; digest?: string; status: EpistemicStatus }>;
  payload?: Record<string, unknown>;
  corrects?: string;
  retracts?: string;
  integrity: { algorithm: 'sha256'; digest: string; authenticated: boolean };
}

export interface EventAccessContract {
  type: string;
  reads: string[];
  writes: string[];
  resolution: ConflictResolution;
  authorityOrder?: string[];
}

export interface EventIssuerPolicy {
  issuer: string;
  eventTypes: string[];
  subjects?: string[];
  requireAuthenticated: boolean;
}

export interface CausalAcceptancePolicy {
  eventSchema: 'autonomy.event.v2';
  reducer: string;
  issuers: EventIssuerPolicy[];
  contracts: Record<string, EventAccessContract>;
  maximumEvents: number;
}

export interface AcceptedCausalHistory {
  schema: 'autonomy.history.v1';
  eventSchema: 'autonomy.event.v2';
  reducer: string;
  events: Record<string, PortableEventV2>;
  order: string[];
  active: string[];
  corrections: Record<string, string>;
  retractions: string[];
  gaps: string[];
}

export interface CausalAcceptanceResult {
  history?: AcceptedCausalHistory;
  pending: string[];
  duplicates: string[];
  errors: string[];
}

export interface NativeObservation {
  provider: string;
  schema: string;
  version: string;
  id: string;
  at: string;
  data: Record<string, unknown>;
  provenance: { uri: string; digest?: string };
  authenticated: boolean;
}

export interface NativeLiftAdapter {
  id: string;
  provider: string;
  nativeSchema: string;
  nativeVersion: string;
  portableTypes: string[];
  lift: (observation: NativeObservation) => Omit<PortableEventV2, 'integrity'> | undefined;
}

export interface LiftResult {
  event?: PortableEventV2;
  gap?: string;
  errors: string[];
}

export interface CausalMaterializationResult {
  state?: OrganizationStateIR;
  history?: AcceptedCausalHistory;
  errors: string[];
}

export interface TraceConformanceReport {
  status: 'conformant' | 'nonconformant' | 'undetermined';
  lifecycle: string[];
  authority: string[];
  evidence: string[];
  budget: string[];
  protocol: string[];
  safety: string[];
  observabilityGaps: string[];
  livenessAssumptions: string[];
}

export interface TemporalMonitor {
  id: string;
  kind: 'safety' | 'bounded-response';
  triggerType?: string;
  responseType: string;
  bound: number;
  clock: 'logical-events' | 'observed-milliseconds';
  fairnessAssumptions: string[];
}

export interface TemporalFinding {
  monitor: string;
  status: 'satisfied' | 'violated' | 'unknown';
  counterexample: string[];
  assumptions: string[];
}

export function sealPortableEvent(event: Omit<PortableEventV2, 'integrity'>, authenticated: boolean): PortableEventV2 {
  return { ...structuredClone(event), integrity: { algorithm: 'sha256', digest: semanticDigest(event, 'portable-event-v2').value, authenticated } };
}

export function acceptCausalHistory(events: PortableEventV2[], policy: CausalAcceptancePolicy, prior?: AcceptedCausalHistory): CausalAcceptanceResult {
  const accepted = structuredClone(prior?.events ?? {}); const duplicates: string[] = []; const errors: string[] = [];
  if (events.length + Object.keys(accepted).length > policy.maximumEvents) return { pending: [], duplicates, errors: ['event resource bound exceeded'] };
  for (const event of events) {
    if (event.schema !== policy.eventSchema || event.reducer !== policy.reducer) { errors.push(`event '${event.id}' version does not match acceptance policy`); continue; }
    const expected = sealPortableEvent(stripIntegrity(event), event.integrity.authenticated).integrity.digest;
    if (expected !== event.integrity.digest) { errors.push(`event '${event.id}' integrity digest mismatch`); continue; }
    const existing = accepted[event.id];
    if (existing) { if (JSON.stringify(existing) === JSON.stringify(event)) duplicates.push(event.id); else errors.push(`event id '${event.id}' has conflicting content`); continue; }
    const issuer = policy.issuers.find((candidate) => candidate.issuer === event.issuer && candidate.eventTypes.includes(event.type));
    if (!issuer) { errors.push(`issuer '${event.issuer}' is not authorized for '${event.type}'`); continue; }
    if (issuer.requireAuthenticated && !event.integrity.authenticated) { errors.push(`event '${event.id}' is not authenticated`); continue; }
    if (issuer.subjects?.length && (!event.subject || !issuer.subjects.includes(event.subject.kind))) { errors.push(`issuer '${event.issuer}' cannot bind subject '${event.subject?.kind}'`); continue; }
    if (!event.provenance.length) { errors.push(`event '${event.id}' lacks provenance`); continue; }
    accepted[event.id] = structuredClone(event);
  }
  if (errors.length) return { pending: [], duplicates, errors };
  const missing = [...new Set(Object.values(accepted).flatMap((event) => event.parents.filter((parent) => !accepted[parent])))].sort();
  if (missing.length) return { pending: Object.values(accepted).filter((event) => event.parents.some((parent) => missing.includes(parent))).map((event) => event.id).sort(), duplicates, errors: [] };
  const ordered = causalOrder(accepted, policy, errors);
  if (errors.length) return { pending: [], duplicates, errors };
  const corrections: Record<string, string> = {}; const retractions = new Set<string>();
  for (const id of ordered) {
    const event = accepted[id];
    if (event.corrects) {
      if (!accepted[event.corrects] || !isAncestor(event.corrects, event.id, accepted)) errors.push(`correction '${event.id}' does not causally follow '${event.corrects}'`);
      else corrections[event.corrects] = event.id;
    }
    if (event.retracts) {
      if (!accepted[event.retracts] || !isAncestor(event.retracts, event.id, accepted)) errors.push(`retraction '${event.id}' does not causally follow '${event.retracts}'`);
      else retractions.add(event.retracts);
    }
  }
  if (errors.length) return { pending: [], duplicates, errors };
  const active = ordered.filter((id) => !retractions.has(id) && !corrections[id] && !accepted[id].retracts);
  return { history: { schema: 'autonomy.history.v1', eventSchema: policy.eventSchema, reducer: policy.reducer, events: accepted, order: ordered, active, corrections, retractions: [...retractions].sort(), gaps: [] }, pending: [], duplicates, errors: [] };
}

export function liftNativeObservation(observation: NativeObservation, adapter: NativeLiftAdapter): LiftResult {
  if (adapter.provider !== observation.provider || adapter.nativeSchema !== observation.schema || adapter.nativeVersion !== observation.version)
    return { gap: `no exact adapter for ${observation.provider}:${observation.schema}@${observation.version}`, errors: [] };
  const lifted = adapter.lift(structuredClone(observation));
  if (!lifted) return { gap: `adapter '${adapter.id}' cannot assign portable meaning to observation '${observation.id}'`, errors: [] };
  if (!adapter.portableTypes.includes(lifted.type)) return { errors: [`adapter '${adapter.id}' emitted undeclared portable type '${lifted.type}'`] };
  if (!lifted.provenance.some((item) => item.uri === observation.provenance.uri)) return { errors: [`adapter '${adapter.id}' discarded native provenance`] };
  return { event: sealPortableEvent(lifted, observation.authenticated), errors: [] };
}

export function materializeCausalHistory(definition: OrganizationIR, history: AcceptedCausalHistory): CausalMaterializationResult {
  const effective = history.active.map((id) => history.events[id]).filter((event) => !event.type.startsWith('history.'));
  const active = new Set(history.active);
  const stateEvents: StateEvent[] = effective.map((event) => ({ id: event.id, type: event.type, at: event.at, actor: event.actor, subject: event.subject, causation: event.parents.find((parent) => active.has(parent)), correlation: event.correlation, data: structuredClone(event.payload ?? {}) }));
  const reduced = materializeOrganizationState(definition, stateEvents, undefined, { order: 'causal' });
  return reduced.state ? { state: reduced.state, history: structuredClone(history), errors: [] } : { errors: reduced.errors };
}

export function checkTraceConformance(definition: OrganizationIR, history: AcceptedCausalHistory): TraceConformanceReport {
  const materialized = materializeCausalHistory(definition, history);
  const report: TraceConformanceReport = { status: 'conformant', lifecycle: [], authority: [], evidence: [], budget: [], protocol: [], safety: [], observabilityGaps: [...history.gaps], livenessAssumptions: ['event delivery eventually resumes after partitions', 'enabled work eventually receives service under declared fairness'] };
  if (materialized.errors.length) { report.lifecycle.push(...materialized.errors); report.status = 'nonconformant'; return report; }
  for (const id of history.active) {
    const event = history.events[id];
    if (['attempt.status', 'work.transitioned'].includes(event.type) && !event.actor) report.authority.push(`${id}: actor identity is absent`);
    if (event.type === 'attempt.status' && event.payload?.status === 'succeeded' && !event.evidence?.some((item) => item.status === 'verification')) report.evidence.push(`${id}: success lacks verified evidence`);
    if (event.type === 'budget.consumed' && !(Number(event.payload?.amount) >= 0)) report.budget.push(`${id}: invalid budget amount`);
  }
  if (Object.keys(definition.protocols ?? {}).length && !history.active.some((id) => history.events[id].type.startsWith('conversation.'))) report.observabilityGaps.push('protocol activity is not observed');
  if (!history.active.some((id) => history.events[id].type === 'attempt.status')) report.observabilityGaps.push('attempt outcomes are not observed');
  if (report.authority.length || report.evidence.length || report.budget.length || report.protocol.length || report.safety.length) report.status = 'nonconformant';
  else if (report.observabilityGaps.length) report.status = 'undetermined';
  return report;
}

export function monitorTemporalProperties(history: AcceptedCausalHistory, monitors: TemporalMonitor[], observationClosed: boolean): TemporalFinding[] {
  return monitors.map((monitor) => {
    const active = history.active.map((id) => history.events[id]);
    if (monitor.kind === 'safety') {
      const violation = active.find((event) => event.type === monitor.responseType);
      return { monitor: monitor.id, status: violation ? 'violated' : observationClosed ? 'satisfied' : 'unknown', counterexample: violation ? [violation.id] : [], assumptions: [...monitor.fairnessAssumptions] };
    }
    const triggers = active.map((event, index) => ({ event, index })).filter(({ event }) => event.type === monitor.triggerType);
    for (const trigger of triggers) {
      const response = active.slice(trigger.index + 1).find((event) => event.type === monitor.responseType && (!trigger.event.correlation || event.correlation === trigger.event.correlation));
      if (response) {
        const distance = monitor.clock === 'logical-events' ? active.indexOf(response) - trigger.index : Date.parse(response.at) - Date.parse(trigger.event.at);
        if (distance > monitor.bound) return { monitor: monitor.id, status: 'violated', counterexample: [trigger.event.id, response.id], assumptions: [...monitor.fairnessAssumptions] };
      } else if (observationClosed) return { monitor: monitor.id, status: 'violated', counterexample: [trigger.event.id], assumptions: [...monitor.fairnessAssumptions] };
      else return { monitor: monitor.id, status: 'unknown', counterexample: [trigger.event.id], assumptions: [...monitor.fairnessAssumptions] };
    }
    return { monitor: monitor.id, status: observationClosed ? 'satisfied' : 'unknown', counterexample: [], assumptions: [...monitor.fairnessAssumptions] };
  });
}

function causalOrder(events: Record<string, PortableEventV2>, policy: CausalAcceptancePolicy, errors: string[]): string[] {
  const parents = new Map(Object.entries(events).map(([id, event]) => [id, new Set(event.parents)]));
  const ids = Object.keys(events).sort();
  for (let leftIndex = 0; leftIndex < ids.length; leftIndex++) for (let rightIndex = leftIndex + 1; rightIndex < ids.length; rightIndex++) {
    const left = events[ids[leftIndex]]; const right = events[ids[rightIndex]];
    if (isAncestor(left.id, right.id, events) || isAncestor(right.id, left.id, events) || commute(left, right, policy)) continue;
    const leftContract = policy.contracts[left.type]; const rightContract = policy.contracts[right.type];
    const resolution = leftContract?.resolution === rightContract?.resolution ? leftContract?.resolution : undefined;
    if (!resolution || resolution === 'reject') { errors.push(`concurrent events '${left.id}' and '${right.id}' conflict without arbitration`); continue; }
    if (resolution === 'id-order') parents.get(right.id)!.add(left.id);
    else if (resolution === 'authority-order') {
      const order = leftContract.authorityOrder ?? []; const leftRank = order.indexOf(left.issuer); const rightRank = order.indexOf(right.issuer);
      if (leftRank < 0 || rightRank < 0 || leftRank === rightRank) errors.push(`authority order cannot arbitrate '${left.id}' and '${right.id}'`);
      else parents.get(leftRank < rightRank ? right.id : left.id)!.add(leftRank < rightRank ? left.id : right.id);
    }
  }
  const output: string[] = [];
  while (output.length < ids.length) {
    const ready = ids.filter((id) => !output.includes(id) && [...parents.get(id)!].every((parent) => output.includes(parent))).sort();
    if (!ready.length) { errors.push('causal event graph contains a cycle'); break; }
    output.push(...ready);
  }
  return output;
}
function commute(left: PortableEventV2, right: PortableEventV2, policy: CausalAcceptancePolicy): boolean {
  const a = policy.contracts[left.type]; const b = policy.contracts[right.type]; if (!a || !b) return false;
  const ar = a.reads.map((path) => accessPath(path, left)); const aw = a.writes.map((path) => accessPath(path, left));
  const br = b.reads.map((path) => accessPath(path, right)); const bw = b.writes.map((path) => accessPath(path, right));
  return !intersects(aw, [...br, ...bw]) && !intersects(bw, [...ar, ...aw]);
}
function accessPath(path: string, event: PortableEventV2): string { return path.replaceAll('$subject', event.subject?.id ?? '?').replaceAll('$actor', event.actor ?? '?'); }
function intersects(left: string[], right: string[]): boolean { return left.some((value) => right.some((other) => pathsOverlap(value, other))); }
function pathsOverlap(left: string, right: string): boolean { return left === right || left.startsWith(`${right}.`) || right.startsWith(`${left}.`); }
function isAncestor(ancestor: string, descendant: string, events: Record<string, PortableEventV2>, seen = new Set<string>()): boolean {
  if (seen.has(descendant)) return false; seen.add(descendant);
  return events[descendant]?.parents.some((parent) => parent === ancestor || isAncestor(ancestor, parent, events, seen)) ?? false;
}
function stripIntegrity(event: PortableEventV2): Omit<PortableEventV2, 'integrity'> { const copy = structuredClone(event); delete (copy as Partial<PortableEventV2>).integrity; return copy; }
