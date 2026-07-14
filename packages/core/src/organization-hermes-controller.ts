import { semanticDigest } from './organization-canonical';

export type ControllerWorkStatus = 'queued' | 'dispatching' | 'running' | 'blocked-input' | 'review' | 'reviewing' | 'done' | 'failed' | 'escalated' | 'paused';
export type SlackIntent = 'question' | 'answer' | 'mutation' | 'command' | 'new-work' | 'ambiguous';

export interface ControllerPrincipal {
  externalId: string;
  actor: string;
  scopes: string[];
}

export interface ControllerWork {
  id: string;
  title: string;
  accountable: string;
  assignees: string[];
  reviewer?: string;
  status: ControllerWorkStatus;
  priority: number;
  createdSequence: number;
  dispatchCount: number;
  progress: number;
  attempts: string[];
  activeClaim?: string;
  blockedQuestion?: { id: string; text: string };
  retryBudget: number;
  costBudget: number;
  costConsumed: number;
  repository: string;
}

export interface ControllerClaim {
  id: string;
  work: string;
  actor: string;
  worker: string;
  fence: number;
  acquiredAt: number;
  expiresAt: number;
  status: 'active' | 'released' | 'expired' | 'superseded';
}

export interface ControllerAttempt {
  id: string;
  work: string;
  actor: string;
  worker: string;
  claim: string;
  fence: number;
  status: 'running' | 'blocked' | 'review' | 'succeeded' | 'failed' | 'lost' | 'rejected';
  startedAt: number;
  endedAt?: number;
  session: string;
  runtime: string;
  isolation: string;
  credentialScopes: string[];
  cost: number;
  evidence?: Array<{ kind: string; uri: string; digest?: string; verified: boolean }>;
}

export interface ControllerConversation {
  id: string;
  transport: 'slack';
  channel: string;
  thread: string;
  relatedWork: string[];
  messages: Array<{ event: string; principal: string; intent: SlackIntent; text: string; at: number }>;
}

export interface ControllerEffect {
  id: string;
  kind: 'slack-reply' | 'hermes-create' | 'hermes-comment' | 'hermes-reassign' | 'worker-launch' | 'repository-write';
  idempotencyKey: string;
  work?: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'acknowledged' | 'failed';
  acknowledgedExternalId?: string;
}

export interface ControllerApproval {
  id: string;
  work: string;
  artifactDigest: string;
  principal: string;
  scope: string;
  expiresAt: number;
  used: boolean;
}

export interface ControllerMetrics {
  ticks: number;
  queueDepth: number;
  running: number;
  progress: number;
  cost: number;
  latencySamples: number[];
  oscillations: number;
}

export interface HermesControllerState {
  schema: 'autonomy.hermes-controller.v1';
  organization: string;
  revision: number;
  paused: boolean;
  sequence: number;
  principals: Record<string, ControllerPrincipal>;
  work: Record<string, ControllerWork>;
  claims: Record<string, ControllerClaim>;
  attempts: Record<string, ControllerAttempt>;
  conversations: Record<string, ControllerConversation>;
  effects: Record<string, ControllerEffect>;
  approvals: Record<string, ControllerApproval>;
  seenEvents: string[];
  metrics: ControllerMetrics;
}

export interface HermesControllerPolicy {
  workerCapacity: number;
  reviewerCapacity: number;
  claimTtl: number;
  maxTicksWithoutProgress: number;
  maxOscillations: number;
  allowedRepositories: string[];
  requiredCompletionEvidence: string[];
}

export interface SlackEnvelope {
  eventId: string;
  principal: string;
  channel: string;
  thread: string;
  text: string;
  at: number;
  signatureVerified: boolean;
}

export interface ControllerTransition {
  state: HermesControllerState;
  effects: ControllerEffect[];
  errors: string[];
}

export interface HermesWorkerEvent {
  eventId: string;
  kind: 'claimed' | 'heartbeat' | 'blocked' | 'completed' | 'failed' | 'lost' | 'reviewed';
  work: string;
  actor: string;
  worker: string;
  runId: string;
  fence: number;
  at: number;
  session?: string;
  runtime?: string;
  isolation?: string;
  credentialScopes?: string[];
  question?: string;
  cost?: number;
  artifactDigest?: string;
  evidence?: Array<{ kind: string; uri: string; digest?: string; verified: boolean }>;
  verdict?: 'accept' | 'reject';
}

export interface HermesCommandPlan {
  executable: 'hermes';
  argv: string[];
  idempotencyKey: string;
  verify: { board: string; work?: string; expectedStatus?: string };
}

export function createHermesController(organization: string, principals: ControllerPrincipal[]): HermesControllerState {
  return { schema: 'autonomy.hermes-controller.v1', organization, revision: 0, paused: false, sequence: 0,
    principals: Object.fromEntries(principals.map((principal) => [principal.externalId, structuredClone(principal)])), work: {}, claims: {}, attempts: {}, conversations: {}, effects: {}, approvals: {}, seenEvents: [],
    metrics: { ticks: 0, queueDepth: 0, running: 0, progress: 0, cost: 0, latencySamples: [], oscillations: 0 } };
}

export function ingestSlack(state: HermesControllerState, envelope: SlackEnvelope): ControllerTransition {
  const next = structuredClone(state); const errors: string[] = [];
  if (!envelope.signatureVerified) return { state: next, effects: [], errors: ['Slack signature is not verified'] };
  if (next.seenEvents.includes(envelope.eventId)) return { state: next, effects: [], errors: [] };
  const principal = next.principals[envelope.principal];
  if (!principal) return { state: next, effects: [], errors: [`unknown Slack principal '${envelope.principal}'`] };
  next.seenEvents.push(envelope.eventId); next.sequence++;
  const parsed = classifySlack(envelope.text);
  const conversationId = `${envelope.channel}:${envelope.thread}`;
  const conversation = next.conversations[conversationId] ?? { id: conversationId, transport: 'slack' as const, channel: envelope.channel, thread: envelope.thread, relatedWork: [], messages: [] };
  conversation.messages.push({ event: envelope.eventId, principal: principal.actor, intent: parsed.intent, text: envelope.text, at: envelope.at });
  next.conversations[conversationId] = conversation;
  const effects: ControllerEffect[] = [];
  const reply = (text: string, work?: string) => effects.push(makeEffect(next, envelope.eventId, 'slack-reply', work, { channel: envelope.channel, thread: envelope.thread, text }));
  if (parsed.intent === 'new-work') {
    if (!principal.scopes.includes('work:create')) errors.push(`actor '${principal.actor}' lacks work:create`);
    else {
      const id = stableId('work', envelope.eventId); const work: ControllerWork = { id, title: parsed.body!, accountable: principal.actor, assignees: [], status: 'queued', priority: 0, createdSequence: next.sequence, dispatchCount: 0, progress: 0, attempts: [], retryBudget: 3, costBudget: 10, costConsumed: 0, repository: parsed.repository ?? '' };
      if (!work.repository) errors.push('new work requires an explicit repository');
      else { next.work[id] = work; conversation.relatedWork.push(id); effects.push(makeEffect(next, envelope.eventId, 'hermes-create', id, { title: work.title, idempotencyKey: envelope.eventId })); reply(`Created ${id}`, id); }
    }
  } else if (parsed.intent === 'question') {
    const work = next.work[parsed.work!];
    if (!work) errors.push(`unknown work '${parsed.work}'`); else { if (!conversation.relatedWork.includes(work.id)) conversation.relatedWork.push(work.id); reply(`${work.id}: ${work.status}; progress=${work.progress}; attempts=${work.attempts.length}`, work.id); }
  } else if (parsed.intent === 'answer') {
    const work = next.work[parsed.work!];
    if (!work) errors.push(`unknown work '${parsed.work}'`);
    else if (work.status !== 'blocked-input' || work.blockedQuestion?.id !== parsed.question) errors.push(`answer does not match the active question for '${work.id}'`);
    else { work.status = 'queued'; work.blockedQuestion = undefined; effects.push(makeEffect(next, envelope.eventId, 'hermes-comment', work.id, { answer: parsed.body, question: parsed.question })); }
  } else if (parsed.intent === 'mutation') {
    if (!principal.scopes.includes('work:mutate')) errors.push(`actor '${principal.actor}' lacks work:mutate`);
    else { const work = next.work[parsed.work!]; if (!work) errors.push(`unknown work '${parsed.work}'`); else if (parsed.body === 'pause') work.status = 'paused'; else if (parsed.body === 'resume' && work.status === 'paused') work.status = 'queued'; else errors.push(`unsupported mutation '${parsed.body}'`); }
  } else if (parsed.intent === 'command') {
    if (!principal.scopes.includes('controller:operate')) errors.push(`actor '${principal.actor}' lacks controller:operate`);
    else if (parsed.body === 'pause') next.paused = true; else if (parsed.body === 'resume') next.paused = false; else errors.push(`unsupported command '${parsed.body}'`);
  } else reply('Ambiguous request. Use: new repo=<id> <title> | status <work> | answer <work> <question> <text> | mutate <work> pause|resume | command pause|resume');
  next.revision++;
  for (const effect of effects) next.effects[effect.id] = effect;
  refreshMetrics(next);
  return { state: next, effects, errors };
}

export function applyHermesWorkerEvent(state: HermesControllerState, event: HermesWorkerEvent, policy: HermesControllerPolicy): ControllerTransition {
  const next = structuredClone(state); const errors: string[] = []; const effects: ControllerEffect[] = [];
  if (next.seenEvents.includes(event.eventId)) return { state: next, effects, errors };
  const work = next.work[event.work];
  if (!work) return { state: next, effects, errors: [`unknown work '${event.work}'`] };
  if (!policy.allowedRepositories.includes(work.repository)) return { state: next, effects, errors: [`repository '${work.repository}' is outside worker scope`] };
  next.seenEvents.push(event.eventId);
  if (event.kind === 'claimed') {
    if (work.activeClaim && next.claims[work.activeClaim]?.status === 'active') return { state, effects: [], errors: [`work '${work.id}' already has an active claim`] };
    const maximumFence = Math.max(0, ...Object.values(next.claims).filter((claim) => claim.work === work.id).map((claim) => claim.fence));
    if (event.fence <= maximumFence) return { state, effects: [], errors: [`claim fence ${event.fence} is not newer than ${maximumFence}`] };
    const claim: ControllerClaim = { id: event.runId, work: work.id, actor: event.actor, worker: event.worker, fence: event.fence, acquiredAt: event.at, expiresAt: event.at + policy.claimTtl, status: 'active' };
    next.claims[claim.id] = claim; work.activeClaim = claim.id; work.status = 'running'; work.dispatchCount++;
    const attempt: ControllerAttempt = { id: event.runId, work: work.id, actor: event.actor, worker: event.worker, claim: claim.id, fence: claim.fence, status: 'running', startedAt: event.at, session: event.session ?? `session:${event.runId}`, runtime: event.runtime ?? 'unknown', isolation: event.isolation ?? 'unknown', credentialScopes: [...(event.credentialScopes ?? [])], cost: 0 };
    next.attempts[attempt.id] = attempt; work.attempts.push(attempt.id);
  } else {
    const claim = next.claims[event.runId]; const attempt = next.attempts[event.runId];
    const isReview = event.kind === 'reviewed' && attempt?.status === 'review';
    if (!claim || !attempt || claim.fence !== event.fence || (!isReview && (claim.status !== 'active' || work.activeClaim !== claim.id))) return { state, effects: [], errors: [`stale or forged worker event '${event.eventId}'`] };
    if (event.kind === 'heartbeat') claim.expiresAt = event.at + policy.claimTtl;
    if (event.kind === 'blocked') { attempt.status = 'blocked'; attempt.endedAt = event.at; claim.status = 'released'; work.activeClaim = undefined; work.status = 'blocked-input'; work.blockedQuestion = { id: stableId('question', event.eventId), text: event.question ?? 'input required' }; }
    if (event.kind === 'lost' || event.kind === 'failed') { attempt.status = event.kind; attempt.endedAt = event.at; claim.status = 'released'; work.activeClaim = undefined; work.retryBudget--; work.status = work.retryBudget > 0 ? 'queued' : 'escalated'; }
    if (event.kind === 'completed') {
      const evidence = event.evidence ?? []; const missing = policy.requiredCompletionEvidence.filter((kind) => !evidence.some((item) => item.kind === kind && item.verified));
      if (missing.length) return { state, effects: [], errors: [`completion lacks verified evidence: ${missing.join(', ')}`] };
      attempt.status = work.reviewer ? 'review' : 'succeeded'; attempt.endedAt = event.at; attempt.evidence = structuredClone(evidence); claim.status = 'released'; work.activeClaim = undefined; work.status = work.reviewer ? 'review' : 'done'; work.progress++;
    }
    if (event.kind === 'reviewed') {
      if (event.actor !== work.reviewer) return { state, effects: [], errors: [`actor '${event.actor}' is not reviewer '${work.reviewer}'`] };
      const latest = [...work.attempts].reverse().map((id) => next.attempts[id]).find((value) => value.status === 'review');
      if (!latest) return { state, effects: [], errors: ['no attempt awaits review'] };
      if (event.verdict === 'accept') { latest.status = 'succeeded'; work.status = 'done'; work.progress++; }
      else { latest.status = 'rejected'; work.retryBudget--; work.status = work.retryBudget > 0 ? 'queued' : 'escalated'; }
    }
    const cost = event.cost ?? 0; attempt.cost += cost; work.costConsumed += cost; next.metrics.cost += cost;
    if (work.costConsumed > work.costBudget && work.status !== 'done') work.status = 'escalated';
  }
  next.revision++; refreshMetrics(next);
  return { state: next, effects, errors };
}

export function tickHermesController(state: HermesControllerState, now: number, policy: HermesControllerPolicy): ControllerTransition {
  const next = structuredClone(state); const effects: ControllerEffect[] = []; const errors: string[] = [];
  next.metrics.ticks++;
  for (const claim of Object.values(next.claims)) if (claim.status === 'active' && claim.expiresAt <= now) {
    claim.status = 'expired'; const work = next.work[claim.work]; const attempt = next.attempts[claim.id];
    if (work.activeClaim === claim.id) { work.activeClaim = undefined; work.retryBudget--; work.status = work.retryBudget > 0 ? 'queued' : 'escalated'; }
    if (attempt?.status === 'running') { attempt.status = 'lost'; attempt.endedAt = now; }
  }
  if (!next.paused) {
    const running = Object.values(next.work).filter((work) => work.status === 'running' || work.status === 'dispatching').length;
    const available = Math.max(0, policy.workerCapacity - running);
    const queue = Object.values(next.work).filter((work) => work.status === 'queued' && work.costConsumed <= work.costBudget)
      .sort((a, b) => a.dispatchCount - b.dispatchCount || b.priority - a.priority || a.createdSequence - b.createdSequence || compare(a.id, b.id));
    for (const work of queue.slice(0, available)) { work.status = 'dispatching'; effects.push(makeEffect(next, `dispatch:${work.id}:${work.dispatchCount}`, 'worker-launch', work.id, { role: 'worker', repository: work.repository, fence: Math.max(0, ...Object.values(next.claims).filter((claim) => claim.work === work.id).map((claim) => claim.fence)) + 1 })); }
    const reviewing = Object.values(next.work).filter((work) => work.status === 'reviewing').length;
    const reviewQueue = Object.values(next.work).filter((work) => work.status === 'review').sort((a, b) => a.createdSequence - b.createdSequence || compare(a.id, b.id));
    for (const work of reviewQueue.slice(0, Math.max(0, policy.reviewerCapacity - reviewing))) { work.status = 'reviewing'; effects.push(makeEffect(next, `review:${work.id}:${work.attempts.length}`, 'worker-launch', work.id, { role: 'reviewer', reviewer: work.reviewer, repository: work.repository })); }
  }
  const lastProgress = state.metrics.progress;
  refreshMetrics(next);
  if (next.metrics.progress === lastProgress && next.metrics.ticks >= policy.maxTicksWithoutProgress && next.metrics.queueDepth > 0) errors.push('loop made no progress within configured tick bound');
  if (next.metrics.oscillations > policy.maxOscillations) errors.push('loop exceeded oscillation bound');
  next.revision++;
  for (const effect of effects) next.effects[effect.id] = effect;
  return { state: next, effects, errors };
}

export function acknowledgeControllerEffect(state: HermesControllerState, effectId: string, externalId: string): ControllerTransition {
  const next = structuredClone(state); const effect = next.effects[effectId];
  if (!effect) return { state: next, effects: [], errors: [`unknown effect '${effectId}'`] };
  if (effect.status === 'acknowledged') return effect.acknowledgedExternalId === externalId ? { state: next, effects: [], errors: [] } : { state: next, effects: [], errors: [`effect '${effectId}' already acknowledged as '${effect.acknowledgedExternalId}'`] };
  effect.status = 'acknowledged'; effect.acknowledgedExternalId = externalId; next.revision++;
  return { state: next, effects: [], errors: [] };
}

export function failControllerEffect(state: HermesControllerState, effectId: string, reason: string): ControllerTransition {
  const next = structuredClone(state); const effect = next.effects[effectId];
  if (!effect) return { state: next, effects: [], errors: [`unknown effect '${effectId}'`] };
  if (effect.status === 'acknowledged') return { state: next, effects: [], errors: [`acknowledged effect '${effectId}' cannot fail`] };
  effect.status = 'failed'; effect.payload.failure = reason;
  const work = effect.work ? next.work[effect.work] : undefined;
  if (work && effect.kind === 'worker-launch') work.status = effect.payload.role === 'reviewer' ? 'review' : 'queued';
  next.revision++; refreshMetrics(next);
  return { state: next, effects: [], errors: [] };
}

export function recordControllerApproval(state: HermesControllerState, workId: string, artifactDigest: string, principalId: string, scope: string, expiresAt: number): ControllerTransition {
  const next = structuredClone(state); const principal = next.principals[principalId];
  if (!principal || !principal.scopes.includes('artifact:approve')) return { state: next, effects: [], errors: [`principal '${principalId}' cannot approve artifacts`] };
  if (!next.work[workId]) return { state: next, effects: [], errors: [`unknown work '${workId}'`] };
  const id = stableId('approval', `${workId}:${artifactDigest}:${principal.actor}:${scope}`);
  next.approvals[id] = { id, work: workId, artifactDigest, principal: principal.actor, scope, expiresAt, used: false }; next.revision++;
  return { state: next, effects: [], errors: [] };
}

export function requestApprovedRepositoryWrite(state: HermesControllerState, workId: string, artifactDigest: string, scope: string, now: number): ControllerTransition {
  const next = structuredClone(state); const work = next.work[workId];
  if (!work) return { state: next, effects: [], errors: [`unknown work '${workId}'`] };
  const approval = Object.values(next.approvals).find((item) => item.work === workId && item.artifactDigest === artifactDigest && item.scope === scope && !item.used && item.expiresAt > now);
  if (!approval) return { state: next, effects: [], errors: ['no current artifact-bound approval authorizes this write'] };
  approval.used = true;
  const effect = makeEffect(next, approval.id, 'repository-write', workId, { repository: work.repository, artifactDigest, scope, approvedBy: approval.principal });
  next.effects[effect.id] = effect; next.revision++;
  return { state: next, effects: [effect], errors: [] };
}

export function restoreHermesController(snapshot: string): HermesControllerState {
  const parsed = JSON.parse(snapshot) as HermesControllerState;
  if (parsed.schema !== 'autonomy.hermes-controller.v1') throw new Error('unsupported Hermes controller snapshot');
  return structuredClone(parsed);
}
export function snapshotHermesController(state: HermesControllerState): string { return JSON.stringify(state); }

export function planHermesCommand(effect: ControllerEffect, board: string): { plan?: HermesCommandPlan; errors: string[] } {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(board)) return { errors: ['invalid Hermes board slug'] };
  const prefix = ['kanban', '--board', board];
  if (effect.kind === 'hermes-create') {
    const title = effect.payload.title; if (typeof title !== 'string' || !title.trim()) return { errors: ['Hermes create effect requires title'] };
    return { plan: { executable: 'hermes', argv: [...prefix, 'create', title, '--idempotency-key', effect.idempotencyKey, '--json'], idempotencyKey: effect.idempotencyKey, verify: { board, work: effect.work, expectedStatus: 'ready' } }, errors: [] };
  }
  if (effect.kind === 'hermes-comment') {
    if (!effect.work || !/^[-_A-Za-z0-9]+$/.test(effect.work)) return { errors: ['Hermes comment effect requires safe work id'] };
    const answer = effect.payload.answer; if (typeof answer !== 'string') return { errors: ['Hermes comment effect requires answer'] };
    return { plan: { executable: 'hermes', argv: [...prefix, 'comment', effect.work, answer], idempotencyKey: effect.idempotencyKey, verify: { board, work: effect.work } }, errors: [] };
  }
  if (effect.kind === 'hermes-reassign') {
    const assignee = effect.payload.assignee;
    if (!effect.work || typeof assignee !== 'string' || !/^[-_A-Za-z0-9]+$/.test(effect.work) || !/^[-_A-Za-z0-9]+$/.test(assignee)) return { errors: ['Hermes reassign effect requires safe work and assignee'] };
    return { plan: { executable: 'hermes', argv: [...prefix, 'reassign', effect.work, assignee], idempotencyKey: effect.idempotencyKey, verify: { board, work: effect.work } }, errors: [] };
  }
  return { errors: [`effect '${effect.kind}' is not executed by the Hermes Kanban adapter`] };
}

function classifySlack(text: string): { intent: SlackIntent; work?: string; question?: string; body?: string; repository?: string } {
  const trimmed = text.trim(); let match: RegExpMatchArray | null;
  if ((match = trimmed.match(/^new\s+repo=([^\s]+)\s+(.+)$/i))) return { intent: 'new-work', repository: match[1], body: match[2] };
  if ((match = trimmed.match(/^status\s+([^\s]+)$/i))) return { intent: 'question', work: match[1] };
  if ((match = trimmed.match(/^answer\s+([^\s]+)\s+([^\s]+)\s+(.+)$/i))) return { intent: 'answer', work: match[1], question: match[2], body: match[3] };
  if ((match = trimmed.match(/^mutate\s+([^\s]+)\s+(pause|resume)$/i))) return { intent: 'mutation', work: match[1], body: match[2].toLowerCase() };
  if ((match = trimmed.match(/^command\s+(pause|resume)$/i))) return { intent: 'command', body: match[1].toLowerCase() };
  return { intent: 'ambiguous' };
}
function makeEffect(state: HermesControllerState, cause: string, kind: ControllerEffect['kind'], work: string | undefined, payload: Record<string, unknown>): ControllerEffect {
  const idempotencyKey = `${kind}:${cause}:${work ?? '-'}`; const id = stableId('effect', idempotencyKey);
  return state.effects[id] ?? { id, kind, idempotencyKey, work, payload: structuredClone(payload), status: 'pending' };
}
function stableId(domain: string, value: string): string { return `${domain}_${semanticDigest(value, domain).value.slice(0, 12)}`; }
function refreshMetrics(state: HermesControllerState): void { state.metrics.queueDepth = Object.values(state.work).filter((work) => work.status === 'queued' || work.status === 'review').length; state.metrics.running = Object.values(state.work).filter((work) => work.status === 'running' || work.status === 'dispatching' || work.status === 'reviewing').length; state.metrics.progress = Object.values(state.work).reduce((sum, work) => sum + work.progress, 0); }
function compare(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
