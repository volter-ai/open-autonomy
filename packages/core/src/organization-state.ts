import {
  validateOrganizationStateIR,
  type ArtifactState,
  type AttemptState,
  type ClaimState,
  type DecisionState,
  type OrganizationEvent,
  type OrganizationIR,
  type OrganizationStateIR,
  type WorkItemState,
} from './organization-ir';

export type StateEvent = OrganizationEvent & {
  data?: Record<string, unknown>;
};

export interface MaterializationResult {
  state?: OrganizationStateIR;
  errors: string[];
}

/**
 * Pure reference materializer for the portable event vocabulary. Substrates may
 * store state however they choose, but a conforming event projection must reduce
 * to the same observable OrganizationStateIR.
 */
export function materializeOrganizationState(
  definition: OrganizationIR,
  events: StateEvent[],
  base?: OrganizationStateIR,
): MaterializationResult {
  const state: OrganizationStateIR = structuredClone(base ?? {
    schema: 'autonomy.state.v1',
    organization: { name: definition.name, version: definition.version },
    revision: 0,
    observedAt: new Date(0).toISOString(),
  });
  const errors: string[] = [];
  const knownEvents = new Set((state.events ?? []).map((event) => event.id));
  let lastObservedAt = Date.parse(state.observedAt);

  if (state.organization.name !== definition.name)
    errors.push(`base state belongs to '${state.organization.name}', not '${definition.name}'`);

  for (const event of events) {
    const path = `events.${event.id || '<missing>'}`;
    if (!event.id) { errors.push(`${path}: id is required`); continue; }
    if (knownEvents.has(event.id)) { errors.push(`${path}: duplicate event id`); continue; }
    if (!event.at || Number.isNaN(Date.parse(event.at))) { errors.push(`${path}.at: valid timestamp is required`); continue; }
    if (Date.parse(event.at) < lastObservedAt) {
      errors.push(`${path}.at: timestamp precedes the accepted observation sequence`);
      continue;
    }
    if (event.causation && !knownEvents.has(event.causation)) {
      errors.push(`${path}.causation: unknown prior event '${event.causation}'`);
      continue;
    }

    const eventErrors = applyEvent(state, definition, event, path);
    if (eventErrors.length) { errors.push(...eventErrors); continue; }
    knownEvents.add(event.id);
    (state.events ??= []).push(structuredClone(event));
    state.revision += 1;
    state.observedAt = event.at;
    lastObservedAt = Date.parse(event.at);
  }

  if (errors.length) return { errors };
  const validation = validateOrganizationStateIR(state, definition);
  return validation.errors.length ? { errors: validation.errors } : { state, errors: [] };
}

function applyEvent(state: OrganizationStateIR, definition: OrganizationIR, event: StateEvent, path: string): string[] {
  const data = event.data ?? {};
  const subjectId = event.subject?.id;
  const requireSubject = (): string | undefined => subjectId ? undefined : `${path}.subject.id is required`;
  const requireActor = (): string | undefined => event.actor ? undefined : `${path}.actor is required`;
  const fail = (...values: Array<string | undefined>) => values.filter((value): value is string => Boolean(value));
  const requireSubjectKind = (kind: string): string | undefined =>
    event.subject?.kind === kind ? undefined : `${path}.subject.kind must be '${kind}'`;

  switch (event.type) {
    case 'work.created': {
      const missing = fail(requireSubject(), requireSubjectKind('work'));
      if (missing.length) return missing;
      if (state.work?.[subjectId!]) return [`${path}: work '${subjectId}' already exists`];
      const work = data as unknown as WorkItemState;
      const type = definition.workTypes?.[work.type];
      if (!type) return [`${path}.data.type: unknown work type '${String(work.type)}'`];
      const created: WorkItemState = { ...structuredClone(work), state: work.state ?? type.lifecycle.initial, createdAt: event.at, updatedAt: event.at };
      (state.work ??= {})[subjectId!] = created;
      return [];
    }
    case 'work.transitioned': {
      const missing = fail(requireSubject(), requireSubjectKind('work'));
      if (missing.length) return missing;
      const work = state.work?.[subjectId!];
      if (!work) return [`${path}: unknown work '${subjectId}'`];
      const to = data.to as string | undefined;
      const trigger = data.event as string | undefined;
      const lifecycle = definition.workTypes?.[work.type]?.lifecycle;
      const transition = lifecycle?.transitions.find((candidate) =>
        (Array.isArray(candidate.from) ? candidate.from : [candidate.from]).includes(work.state)
        && candidate.to === to && candidate.event === trigger);
      if (!transition) return [`${path}: no '${trigger}' transition from '${work.state}' to '${to}'`];
      work.state = to!;
      work.updatedAt = event.at;
      return [];
    }
    case 'work.assigned': {
      const missing = fail(requireSubject(), requireSubjectKind('work'));
      if (missing.length) return missing;
      const work = state.work?.[subjectId!];
      if (!work) return [`${path}: unknown work '${subjectId}'`];
      const assignees = data.assignees as string[] | undefined;
      if (!Array.isArray(assignees)) return [`${path}.data.assignees must be an array`];
      const unknown = assignees.find((id) => !definition.actors[id] && !definition.units?.[id]);
      if (unknown) return [`${path}.data.assignees: unknown actor or unit '${unknown}'`];
      work.assignees = [...assignees]; work.updatedAt = event.at;
      return [];
    }
    case 'claim.acquired': {
      const missing = fail(requireSubject(), requireSubjectKind('claim'), requireActor());
      if (missing.length) return missing;
      if (!state.work?.[String(data.work)]) return [`${path}.data.work: unknown work '${String(data.work)}'`];
      if (state.claims?.[subjectId!]) return [`${path}: claim '${subjectId}' already exists`];
      (state.claims ??= {})[subjectId!] = { ...(structuredClone(data) as unknown as ClaimState), actor: event.actor!, acquiredAt: event.at, status: 'active' };
      return [];
    }
    case 'claim.released': case 'claim.revoked': case 'claim.expired': {
      const missing = fail(requireSubject(), requireSubjectKind('claim')); if (missing.length) return missing;
      const claim = state.claims?.[subjectId!];
      if (!claim) return [`${path}: unknown claim '${subjectId}'`];
      if (claim.status !== 'active') return [`${path}: claim '${subjectId}' is not active`];
      claim.status = event.type.slice('claim.'.length) as ClaimState['status'];
      return [];
    }
    case 'attempt.started': {
      const missing = fail(requireSubject(), requireSubjectKind('attempt'), requireActor()); if (missing.length) return missing;
      const workId = String(data.work);
      if (!state.work?.[workId]) return [`${path}.data.work: unknown work '${workId}'`];
      if (state.attempts?.[subjectId!]) return [`${path}: attempt '${subjectId}' already exists`];
      const attempt: AttemptState = { work: workId, actor: event.actor!, status: 'running', startedAt: event.at };
      (state.attempts ??= {})[subjectId!] = attempt;
      const current = (state.work[workId].currentAttempts ??= []); if (!current.includes(subjectId!)) current.push(subjectId!);
      return [];
    }
    case 'attempt.status': {
      const missing = fail(requireSubject(), requireSubjectKind('attempt')); if (missing.length) return missing;
      const attempt = state.attempts?.[subjectId!];
      if (!attempt) return [`${path}: unknown attempt '${subjectId}'`];
      const status = data.status as AttemptState['status'];
      if (!['paused', 'succeeded', 'failed', 'cancelled', 'lost'].includes(status)) return [`${path}.data.status: invalid terminal/update status`];
      attempt.status = status; attempt.result = data.result;
      if (status !== 'paused') attempt.endedAt = event.at;
      return [];
    }
    case 'artifact.recorded': {
      const missing = fail(requireSubject(), requireSubjectKind('artifact')); if (missing.length) return missing;
      (state.artifacts ??= {})[subjectId!] = structuredClone(data) as unknown as ArtifactState;
      return [];
    }
    case 'decision.recorded': {
      const missing = fail(requireSubject(), requireSubjectKind('decision')); if (missing.length) return missing;
      (state.decisions ??= {})[subjectId!] = structuredClone(data) as unknown as DecisionState;
      return [];
    }
    case 'budget.consumed': {
      const missing = requireSubjectKind('budget'); if (missing) return [missing];
      const budget = subjectId;
      if (!budget || !definition.budgets?.[budget]) return [`${path}: unknown budget '${String(budget)}'`];
      const amount = Number(data.amount);
      if (!(amount >= 0)) return [`${path}.data.amount must be non-negative`];
      const usage = (state.budgetUsage ??= {})[budget] ??= { budget, consumed: 0, asOf: event.at };
      usage.consumed += amount; usage.asOf = event.at;
      return [];
    }
    default: return [`${path}.type: unsupported portable event '${event.type}'`];
  }
}
