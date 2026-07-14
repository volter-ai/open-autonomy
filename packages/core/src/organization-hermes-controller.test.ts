import { describe, expect, test } from 'bun:test';
import {
  acknowledgeControllerEffect, applyHermesWorkerEvent, createHermesController, ingestSlack,
  failControllerEffect, recordControllerApproval, requestApprovedRepositoryWrite, restoreHermesController,
  snapshotHermesController, tickHermesController, planHermesCommand, type HermesControllerPolicy, type HermesControllerState,
} from './organization-hermes-controller';

const policy: HermesControllerPolicy = { workerCapacity: 2, reviewerCapacity: 1, claimTtl: 10, maxTicksWithoutProgress: 4, maxOscillations: 2, allowedRepositories: ['repo-a', 'repo-b'], requiredCompletionEvidence: ['tests', 'artifact'] };
const base = () => createHermesController('coding-org', [
  { externalId: 'slack-owner', actor: 'owner', scopes: ['work:create', 'work:mutate', 'controller:operate', 'artifact:approve'] },
  { externalId: 'slack-viewer', actor: 'viewer', scopes: [] },
]);
const slack = (eventId: string, text: string, principal = 'slack-owner') => ({ eventId, principal, channel: 'C1', thread: 'T1', text, at: 100, signatureVerified: true });
function withWork(repository = 'repo-a'): { state: HermesControllerState; work: string } {
  const transition = ingestSlack(base(), slack('event-new', `new repo=${repository} Implement feature`));
  return { state: transition.state, work: Object.keys(transition.state.work)[0] };
}
const claim = (work: string, runId = 'run-1', fence = 1, at = 110) => ({ eventId: `claim-${runId}`, kind: 'claimed' as const, work, actor: 'coder', worker: `process-${runId}`, runId, fence, at, session: `session-${runId}`, runtime: 'codex-cli', isolation: 'container', credentialScopes: [`repo:${work}:write`] });

describe('P9 Slack correlation and durable controller state', () => {
  test('distinguishes new work, status questions, answers, mutations, commands, and ambiguity', () => {
    const created = ingestSlack(base(), slack('new-1', 'new repo=repo-a Fix compiler'));
    const work = Object.keys(created.state.work)[0];
    expect(created.errors).toEqual([]);
    expect(created.effects.map((effect) => effect.kind)).toEqual(['hermes-create', 'slack-reply']);
    const status = ingestSlack(created.state, slack('status-1', `status ${work}`));
    expect(Object.keys(status.state.work)).toHaveLength(1);
    expect(status.state.conversations['C1:T1'].messages.at(-1)?.intent).toBe('question');
    const ambiguous = ingestSlack(status.state, slack('amb-1', 'how is everything?'));
    expect(ambiguous.state.conversations['C1:T1'].messages.at(-1)?.intent).toBe('ambiguous');
    expect(ambiguous.effects[0].payload.text).toContain('Ambiguous request');
    const paused = ingestSlack(ambiguous.state, slack('mut-1', `mutate ${work} pause`));
    expect(paused.state.work[work].status).toBe('paused');
    expect(ingestSlack(paused.state, slack('cmd-1', 'command pause')).state.paused).toBe(true);
  });

  test('deduplicates replayed Slack events and routes an answer only to its exact blocked question', () => {
    const { state, work } = withWork();
    const claimed = applyHermesWorkerEvent(state, claim(work), policy).state;
    const blocked = applyHermesWorkerEvent(claimed, { eventId: 'block-1', kind: 'blocked', work, actor: 'coder', worker: 'process-run-1', runId: 'run-1', fence: 1, at: 112, question: 'Which API?' }, policy).state;
    const question = blocked.work[work].blockedQuestion!.id;
    expect(ingestSlack(blocked, slack('bad-answer', `answer ${work} wrong use v2`)).errors[0]).toContain('does not match');
    const answered = ingestSlack(blocked, slack('answer-1', `answer ${work} ${question} use v2`));
    expect(answered.state.work[work].status).toBe('queued');
    expect(answered.effects[0].kind).toBe('hermes-comment');
    const replay = ingestSlack(answered.state, slack('answer-1', `answer ${work} ${question} malicious replay`));
    expect(replay.effects).toEqual([]);
    expect(replay.state.revision).toBe(answered.state.revision);
  });

  test('rejects unverified transport identity and unauthorized creation', () => {
    expect(ingestSlack(base(), { ...slack('forged', 'new repo=repo-a attack'), signatureVerified: false }).errors).toEqual(['Slack signature is not verified']);
    expect(ingestSlack(base(), slack('unauthorized', 'new repo=repo-a attack', 'slack-viewer')).errors).toContain("actor 'viewer' lacks work:create");
  });
});

describe('P9 claims, attempts, recovery, and verification', () => {
  test('fences exclusive ownership and rejects stale or forged completion', () => {
    const { state, work } = withWork();
    const first = applyHermesWorkerEvent(state, claim(work), policy);
    expect(first.errors).toEqual([]);
    expect(applyHermesWorkerEvent(first.state, claim(work, 'run-2', 2), policy).errors[0]).toContain('already has an active claim');
    const forged = applyHermesWorkerEvent(first.state, { eventId: 'forged-complete', kind: 'completed', work, actor: 'coder', worker: 'attacker', runId: 'run-1', fence: 0, at: 113, evidence: [] }, policy);
    expect(forged.errors[0]).toContain('stale or forged');
    expect(forged.state.work[work].status).toBe('running');
  });

  test('expires a lost worker, increments fencing, and preserves distinct organizational/runtime identities', () => {
    const { state, work } = withWork();
    const first = applyHermesWorkerEvent(state, claim(work), policy).state;
    const expired = tickHermesController(first, 121, policy).state;
    expect(expired.attempts['run-1'].status).toBe('lost');
    expect(expired.work[work].status).toBe('dispatching');
    const second = applyHermesWorkerEvent(expired, claim(work, 'run-2', 2, 122), policy);
    expect(second.errors).toEqual([]);
    expect(second.state).toMatchObject({ organization: 'coding-org', work: { [work]: { accountable: 'owner' } }, attempts: { 'run-2': { actor: 'coder', worker: 'process-run-2', session: 'session-run-2', runtime: 'codex-cli' } } });
  });

  test('requires verified completion evidence and independent review, then retries rejection', () => {
    const seeded = withWork(); seeded.state.work[seeded.work].reviewer = 'reviewer';
    const running = applyHermesWorkerEvent(seeded.state, claim(seeded.work), policy).state;
    const weak = applyHermesWorkerEvent(running, { eventId: 'weak', kind: 'completed', work: seeded.work, actor: 'coder', worker: 'process-run-1', runId: 'run-1', fence: 1, at: 115, evidence: [{ kind: 'tests', uri: 'ci://1', verified: false }] }, policy);
    expect(weak.errors[0]).toContain('tests, artifact');
    const completed = applyHermesWorkerEvent(running, { eventId: 'complete', kind: 'completed', work: seeded.work, actor: 'coder', worker: 'process-run-1', runId: 'run-1', fence: 1, at: 115, cost: 1, evidence: [{ kind: 'tests', uri: 'ci://1', verified: true }, { kind: 'artifact', uri: 'git://sha', digest: 'abc', verified: true }] }, policy).state;
    expect(completed.work[seeded.work].status).toBe('review');
    expect(applyHermesWorkerEvent(completed, { eventId: 'self-review', kind: 'reviewed', work: seeded.work, actor: 'coder', worker: 'review', runId: 'run-1', fence: 1, at: 116, verdict: 'accept' }, policy).errors[0]).toContain('is not reviewer');
    const rejected = applyHermesWorkerEvent(completed, { eventId: 'review-reject', kind: 'reviewed', work: seeded.work, actor: 'reviewer', worker: 'review', runId: 'run-1', fence: 1, at: 116, verdict: 'reject' }, policy).state;
    expect(rejected.work[seeded.work].status).toBe('queued');
    expect(rejected.attempts['run-1'].status).toBe('rejected');
  });
});

describe('P9 loop, queueing, budgets, approvals, and restart', () => {
  test('uses capacity and least-dispatched FIFO fairness with visible overload and progress bounds', () => {
    let state = base();
    for (const [index, repo] of ['repo-a', 'repo-b', 'repo-a'].entries()) state = ingestSlack(state, slack(`new-${index}`, `new repo=${repo} task-${index}`)).state;
    const first = tickHermesController(state, 110, policy);
    expect(first.effects).toHaveLength(2);
    expect(first.state.metrics.queueDepth).toBe(1);
    expect(first.effects.map((effect) => effect.work)).toEqual(Object.values(state.work).sort((a, b) => a.createdSequence - b.createdSequence).slice(0, 2).map((work) => work.id));
    let stalled = first.state;
    for (let tick = 0; tick < 4; tick++) stalled = tickHermesController(stalled, 111 + tick, policy).state;
    expect(tickHermesController(stalled, 120, policy).errors).toContain('loop made no progress within configured tick bound');
    expect(tickHermesController(first.state, 121, policy).effects).toEqual([]);
    const released = failControllerEffect(first.state, first.effects[0].id, 'spawn failed');
    expect(released.state.work[first.effects[0].work!].status).toBe('queued');
  });

  test('reserves independent reviewer capacity and does not duplicate review launch across ticks', () => {
    let state = withWork().state; const ids = Object.keys(state.work);
    state = ingestSlack(state, slack('new-review-2', 'new repo=repo-b second review')).state;
    ids.push(Object.keys(state.work).find((id) => !ids.includes(id))!);
    for (const id of ids) { state.work[id].status = 'review'; state.work[id].reviewer = 'reviewer'; }
    const tick = tickHermesController(state, 120, policy);
    expect(tick.effects).toHaveLength(1);
    expect(tick.effects[0].payload.role).toBe('reviewer');
    expect(tick.state.work[tick.effects[0].work!].status).toBe('reviewing');
    expect(tickHermesController(tick.state, 121, policy).effects).toEqual([]);
  });

  test('attributes cost and escalates before an unbounded positive-cost loop', () => {
    const seeded = withWork(); seeded.state.work[seeded.work].costBudget = 1;
    const running = applyHermesWorkerEvent(seeded.state, claim(seeded.work), policy).state;
    const failed = applyHermesWorkerEvent(running, { eventId: 'cost-fail', kind: 'failed', work: seeded.work, actor: 'coder', worker: 'process-run-1', runId: 'run-1', fence: 1, at: 115, cost: 2 }, policy).state;
    expect(failed.work[seeded.work]).toMatchObject({ costConsumed: 2, status: 'escalated' });
    expect(failed.attempts['run-1'].cost).toBe(2);
    expect(failed.metrics.cost).toBe(2);
  });

  test('binds approval to artifact, scope, principal, expiry, and one acknowledged effect', () => {
    const seeded = withWork();
    const approved = recordControllerApproval(seeded.state, seeded.work, 'sha256:good', 'slack-owner', 'merge', 200);
    expect(approved.errors).toEqual([]);
    expect(requestApprovedRepositoryWrite(approved.state, seeded.work, 'sha256:evil', 'merge', 150).errors).toEqual(['no current artifact-bound approval authorizes this write']);
    const write = requestApprovedRepositoryWrite(approved.state, seeded.work, 'sha256:good', 'merge', 150);
    expect(write.effects[0]).toMatchObject({ kind: 'repository-write', payload: { artifactDigest: 'sha256:good', approvedBy: 'owner' } });
    expect(requestApprovedRepositoryWrite(write.state, seeded.work, 'sha256:good', 'merge', 151).errors[0]).toContain('no current');
    const ack = acknowledgeControllerEffect(write.state, write.effects[0].id, 'merge-123');
    expect(acknowledgeControllerEffect(ack.state, write.effects[0].id, 'merge-123').errors).toEqual([]);
    expect(acknowledgeControllerEffect(ack.state, write.effects[0].id, 'merge-evil').errors[0]).toContain('already acknowledged');
  });

  test('restores all authoritative continuity and outbox acknowledgements without hidden memory', () => {
    const seeded = withWork();
    const effect = Object.values(seeded.state.effects)[0];
    const acknowledged = acknowledgeControllerEffect(seeded.state, effect.id, 'hermes-task-1').state;
    const restored = restoreHermesController(snapshotHermesController(acknowledged));
    expect(restored).toEqual(acknowledged);
    expect(ingestSlack(restored, slack('event-new', 'new repo=repo-a replay')).effects).toEqual([]);
    expect(Object.values(restored.effects).find((item) => item.id === effect.id)).toMatchObject({ status: 'acknowledged', acknowledgedExternalId: 'hermes-task-1' });
  });

  test('renders Hermes calls as argument vectors and requires post-state verification', () => {
    const seeded = ingestSlack(base(), slack('shell-safe', 'new repo=repo-a $(touch /tmp/pwned); keep literal'));
    const create = seeded.effects.find((effect) => effect.kind === 'hermes-create')!;
    const planned = planHermesCommand(create, 'oa-p9-proof-20260714');
    expect(planned.errors).toEqual([]);
    expect(planned.plan?.argv).toContain('$(touch /tmp/pwned); keep literal');
    expect(planned.plan).toMatchObject({ executable: 'hermes', verify: { board: 'oa-p9-proof-20260714', expectedStatus: 'ready' } });
    expect(planHermesCommand(create, '../default').errors).toEqual(['invalid Hermes board slug']);
    expect(planHermesCommand(seeded.effects.find((effect) => effect.kind === 'slack-reply')!, 'oa-p9-proof-20260714').errors[0]).toContain('not executed');
  });
});
