import { describe, expect, test } from 'bun:test';
import type { OrganizationIR } from './organization-ir';
import {
  acceptCausalHistory, checkTraceConformance, liftNativeObservation, materializeCausalHistory, monitorTemporalProperties,
  sealPortableEvent, type CausalAcceptancePolicy, type NativeLiftAdapter, type PortableEventV2,
} from './organization-causal-state';

const definition: OrganizationIR = {
  schema: 'autonomy.organization.v2', name: 'causal-test',
  behaviors: { work: { kind: 'program', inline: 'work' } }, actors: { worker: { kind: 'agent', behaviors: ['work'] } },
  workTypes: { task: { lifecycle: { initial: 'ready', terminal: ['done'], states: { ready: {}, done: {} }, transitions: [{ from: 'ready', to: 'done', event: 'complete' }] } } },
  artifacts: { result: { mediaType: 'text/plain' } },
};
const policy: CausalAcceptancePolicy = {
  eventSchema: 'autonomy.event.v2', reducer: 'organization-reducer-v2', maximumEvents: 100,
  issuers: [
    { issuer: 'hermes', eventTypes: ['work.created', 'work.transitioned', 'attempt.started', 'attempt.status', 'artifact.recorded'], subjects: ['work', 'attempt', 'artifact'], requireAuthenticated: true },
    { issuer: 'auditor', eventTypes: ['artifact.recorded', 'history.retracted'], subjects: ['artifact', 'event'], requireAuthenticated: true },
  ],
  contracts: {
    'work.created': { type: 'work.created', reads: [], writes: ['work.$subject'], resolution: 'reject' },
    'work.transitioned': { type: 'work.transitioned', reads: ['work.$subject.state'], writes: ['work.$subject.state'], resolution: 'id-order' },
    'attempt.started': { type: 'attempt.started', reads: ['work'], writes: ['attempts.$subject'], resolution: 'reject' },
    'attempt.status': { type: 'attempt.status', reads: ['attempts.$subject'], writes: ['attempts.$subject'], resolution: 'id-order' },
    'artifact.recorded': { type: 'artifact.recorded', reads: [], writes: ['artifacts.$subject'], resolution: 'id-order' },
    'history.retracted': { type: 'history.retracted', reads: ['events'], writes: ['events'], resolution: 'id-order' },
  },
};
function event(id: string, type: string, subject: { kind: string; id: string }, payload: Record<string, unknown>, parents: string[] = [], overrides: Partial<Omit<PortableEventV2, 'integrity'>> = {}): PortableEventV2 {
  return sealPortableEvent({ schema: 'autonomy.event.v2', reducer: 'organization-reducer-v2', id, type, at: `2026-07-14T12:00:0${id.length % 9}Z`, issuer: 'hermes', actor: 'worker', subject, parents, epistemic: 'observation', provenance: [{ uri: `hermes://event/${id}`, digest: `native:${id}` }], payload, ...overrides }, true);
}

describe('P10 causal acceptance and reducer algebra', () => {
  test('deduplicates exact replay, accepts reordered input, and satisfies prefix composition', () => {
    const created = event('e-created', 'work.created', { kind: 'work', id: 'w1' }, { type: 'task', title: 'one', state: 'ready' });
    const transitioned = event('e-done', 'work.transitioned', { kind: 'work', id: 'w1' }, { to: 'done', event: 'complete' }, ['e-created']);
    const all = acceptCausalHistory([transitioned, created, created], policy);
    expect(all.errors).toEqual([]); expect(all.duplicates).toEqual(['e-created']);
    expect(all.history?.order).toEqual(['e-created', 'e-done']);
    const prefix = acceptCausalHistory([created], policy).history!;
    const appended = acceptCausalHistory([transitioned], policy, prefix).history!;
    expect(materializeCausalHistory(definition, appended).state).toEqual(materializeCausalHistory(definition, all.history!).state);
  });

  test('commuting concurrent events are topological-order invariant despite hostile wall clocks', () => {
    const left = event('a', 'work.created', { kind: 'work', id: 'w1' }, { type: 'task', title: 'one' }, [], { at: '2030-01-01T00:00:00Z' });
    const right = event('b', 'work.created', { kind: 'work', id: 'w2' }, { type: 'task', title: 'two' }, [], { at: '2020-01-01T00:00:00Z' });
    const forward = acceptCausalHistory([left, right], policy).history!;
    const reverse = acceptCausalHistory([right, left], policy).history!;
    expect(forward.order).toEqual(reverse.order);
    expect(materializeCausalHistory(definition, forward).state).toEqual(materializeCausalHistory(definition, reverse).state);
    expect(materializeCausalHistory(definition, forward).state?.observedAt).toBe('2030-01-01T00:00:00Z');
  });

  test('rejects concurrent conflict without arbitration and deterministically orders declared conflict', () => {
    const rejectPolicy = structuredClone(policy); rejectPolicy.contracts['artifact.recorded'].resolution = 'reject';
    const left = event('artifact-a', 'artifact.recorded', { kind: 'artifact', id: 'same' }, { type: 'result', uri: 'a' });
    const right = event('artifact-b', 'artifact.recorded', { kind: 'artifact', id: 'same' }, { type: 'result', uri: 'b' });
    expect(acceptCausalHistory([left, right], rejectPolicy).errors[0]).toContain('conflict without arbitration');
    const first = acceptCausalHistory([right, left], policy).history!;
    const second = acceptCausalHistory([left, right], policy).history!;
    expect(first.order).toEqual(second.order);
    expect(materializeCausalHistory(definition, first).state).toEqual(materializeCausalHistory(definition, second).state);
  });

  test('models corrections and retractions as causal immutable events', () => {
    const original = event('artifact-1', 'artifact.recorded', { kind: 'artifact', id: 'result-1' }, { type: 'result', uri: 'bad' });
    const corrected = event('artifact-2', 'artifact.recorded', { kind: 'artifact', id: 'result-1' }, { type: 'result', uri: 'good' }, ['artifact-1'], { corrects: 'artifact-1', epistemic: 'verification' });
    const correctionHistory = acceptCausalHistory([corrected, original], policy).history!;
    expect(correctionHistory.active).toEqual(['artifact-2']);
    expect(materializeCausalHistory(definition, correctionHistory).state?.artifacts?.['result-1'].uri).toBe('good');
    const retraction = event('retract-1', 'history.retracted', { kind: 'event', id: 'artifact-2' }, {}, ['artifact-2'], { issuer: 'auditor', retracts: 'artifact-2', epistemic: 'attestation' });
    const retracted = acceptCausalHistory([original, corrected, retraction], policy).history!;
    expect(retracted.active).toEqual([]);
    expect(materializeCausalHistory(definition, retracted).state?.artifacts).toBeUndefined();
  });
});

describe('P10 lifting, security, epistemics, and conformance', () => {
  const adapter: NativeLiftAdapter = {
    id: 'hermes-work-v1', provider: 'hermes', nativeSchema: 'hermes.task-event', nativeVersion: '1', portableTypes: ['work.created'],
    lift: (native) => native.data.kind === 'created' ? ({ schema: 'autonomy.event.v2', reducer: 'organization-reducer-v2', id: native.id, type: 'work.created', at: native.at, issuer: 'hermes', actor: 'worker', subject: { kind: 'work', id: String(native.data.task) }, parents: [], epistemic: 'observation', provenance: [native.provenance], payload: { type: 'task', title: native.data.title } }) : undefined,
  };

  test('lifts only exact native schemas and returns gaps rather than guessed meaning', () => {
    const native = { provider: 'hermes', schema: 'hermes.task-event', version: '1', id: 'native-1', at: '2026-07-14T12:00:00Z', data: { kind: 'created', task: 'w1', title: 'one' }, provenance: { uri: 'hermes://board/e1', digest: 'abc' }, authenticated: true };
    const lifted = liftNativeObservation(native, adapter);
    expect(lifted.errors).toEqual([]); expect(lifted.event?.epistemic).toBe('observation');
    expect(liftNativeObservation({ ...native, version: '2' }, adapter).gap).toContain('no exact adapter');
    expect(liftNativeObservation({ ...native, data: { kind: 'mystery' } }, adapter).gap).toContain('cannot assign portable meaning');
  });

  test('independently rejects corrupt integrity, unauthorized issuer, bad subject binding, and unauthenticated events', () => {
    const valid = event('secure', 'work.created', { kind: 'work', id: 'w1' }, { type: 'task', title: 'one' });
    const corrupt = structuredClone(valid); corrupt.payload!.title = 'tampered';
    expect(acceptCausalHistory([corrupt], policy).errors[0]).toContain('integrity digest mismatch');
    const unauthorized = event('bad-issuer', 'work.created', { kind: 'work', id: 'w1' }, { type: 'task' }, [], { issuer: 'attacker' });
    expect(acceptCausalHistory([unauthorized], policy).errors[0]).toContain('not authorized');
    const wrongSubject = event('bad-subject', 'work.created', { kind: 'budget', id: 'w1' }, { type: 'task' });
    expect(acceptCausalHistory([wrongSubject], policy).errors[0]).toContain('cannot bind subject');
    const { integrity: _integrity, ...unsignedBody } = valid;
    const unsigned = sealPortableEvent({ ...unsignedBody, id: 'unsigned' }, false);
    expect(acceptCausalHistory([unsigned], policy).errors[0]).toContain('not authenticated');
  });

  test('keeps reports distinct from verification and reports observability/liveness unknowns', () => {
    const created = event('work', 'work.created', { kind: 'work', id: 'w1' }, { type: 'task', title: 'one' });
    const started = event('attempt', 'attempt.started', { kind: 'attempt', id: 'try1' }, { work: 'w1' }, ['work']);
    const reported = event('success', 'attempt.status', { kind: 'attempt', id: 'try1' }, { status: 'succeeded' }, ['attempt'], { epistemic: 'report', evidence: [{ kind: 'worker-output', uri: 'worker://1', status: 'report' }] });
    const history = acceptCausalHistory([reported, started, created], policy).history!;
    const report = checkTraceConformance(definition, history);
    expect(report.status).toBe('nonconformant');
    expect(report.evidence[0]).toContain('lacks verified evidence');
    expect(report.livenessAssumptions.length).toBeGreaterThan(0);
  });

  test('holds late children pending until partition reconciliation supplies parents', () => {
    const child = event('child', 'work.transitioned', { kind: 'work', id: 'w1' }, { to: 'done', event: 'complete' }, ['missing-parent']);
    const pending = acceptCausalHistory([child], policy);
    expect(pending.pending).toEqual(['child']);
    expect(pending.errors).toEqual([]);
    expect(pending.history).toBeUndefined();
  });

  test('rebuilds identically from a serialized version-pinned accepted history', () => {
    const created = event('persisted', 'work.created', { kind: 'work', id: 'w1' }, { type: 'task', title: 'one' });
    const history = acceptCausalHistory([created], policy).history!;
    const restored = JSON.parse(JSON.stringify(history));
    expect(restored).toMatchObject({ eventSchema: 'autonomy.event.v2', reducer: 'organization-reducer-v2' });
    expect(materializeCausalHistory(definition, restored).state).toEqual(materializeCausalHistory(definition, history).state);
  });

  test('evaluates bounded temporal monitors without claiming unbounded liveness from a finite prefix', () => {
    const created = event('trigger', 'work.created', { kind: 'work', id: 'w1' }, { type: 'task', title: 'one' }, [], { correlation: 'w1' });
    const history = acceptCausalHistory([created], policy).history!;
    const monitor = { id: 'eventual-completion', kind: 'bounded-response' as const, triggerType: 'work.created', responseType: 'work.transitioned', bound: 5, clock: 'logical-events' as const, fairnessAssumptions: ['dispatcher fairness', 'worker availability'] };
    expect(monitorTemporalProperties(history, [monitor], false)[0]).toMatchObject({ status: 'unknown', counterexample: ['trigger'], assumptions: ['dispatcher fairness', 'worker availability'] });
    expect(monitorTemporalProperties(history, [monitor], true)[0].status).toBe('violated');
  });
});
