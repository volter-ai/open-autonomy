import { describe, expect, test } from 'bun:test';
import type { OrganizationIR } from './organization-ir';
import { normalizeOrganization, type NormalizedOrganizationIR } from './organization-normalize';
import { deriveAtomicObligations, type DeploymentCandidateV2 } from './organization-solver';
import {
  acceptCausalHistory, checkTraceConformance, sealPortableEvent,
  type CausalAcceptancePolicy, type PortableEventV2,
} from './organization-causal-state';
import { compareSubstrateRealizations, type SubstrateRealizationProof } from './organization-substrate-proof';

const definition: OrganizationIR = {
  schema: 'autonomy.organization.v2', name: 'portable-control',
  behaviors: { execute: { kind: 'program', inline: 'perform the assigned change' } },
  actors: { coder: { kind: 'agent', behaviors: ['execute'] } },
  workTypes: { task: { lifecycle: { initial: 'ready', terminal: ['done'], states: { ready: {}, done: {} }, transitions: [{ from: 'ready', to: 'done', event: 'complete' }] } } },
};

const policy: CausalAcceptancePolicy = {
  eventSchema: 'autonomy.event.v2', reducer: 'organization-reducer-v2', maximumEvents: 20,
  issuers: ['control-a', 'control-b'].map((issuer) => ({ issuer, eventTypes: ['work.created', 'attempt.started', 'attempt.status', 'work.transitioned'], subjects: ['work', 'attempt'], requireAuthenticated: true })),
  contracts: Object.fromEntries(['work.created', 'attempt.started', 'attempt.status', 'work.transitioned'].map((type) => [type, { type, reads: [], writes: [`event.${type}`], resolution: 'id-order' as const }])),
};

function normalized(): NormalizedOrganizationIR {
  return normalizeOrganization({
    schema: 'autonomy.normalized-organization.v1', root: 'portable/root' as never,
    modules: { 'portable/root': definition }, sourceMap: [],
    digest: { algorithm: 'sha256', canonicalization: 'oa-c14n-v1', domain: 'organization', value: '' },
  }).normalized!;
}

function event(issuer: string, id: string, type: string, subject: { kind: string; id: string }, payload: Record<string, unknown>, parents: string[] = []): PortableEventV2 {
  return sealPortableEvent({
    schema: 'autonomy.event.v2', reducer: 'organization-reducer-v2', id, type,
    at: `2026-07-14T12:00:0${parents.length}Z`, issuer, actor: 'coder', subject, parents,
    epistemic: type === 'attempt.status' ? 'verification' : 'observation',
    provenance: [{ uri: `${issuer}://native/${id}`, digest: `${issuer}:${id}` }],
    evidence: type === 'attempt.status' ? [{ kind: 'test', uri: `${issuer}://evidence/${id}`, status: 'verification' }] : undefined,
    payload,
  }, true);
}

function candidate(provider: string, assumptions: string[] = []): DeploymentCandidateV2 {
  const obligations = deriveAtomicObligations(definition);
  return {
    composition: { instances: { control: { manifest: provider }, worker: { manifest: `${provider}-worker` } }, authorities: { work: 'control', attempt: 'worker' } },
    ledger: { obligations, unresolved: [], witnesses: obligations.map((obligation) => ({ obligation: obligation.id, disposition: 'preserved', assumptions, losses: [], errors: [] })) },
    objective: { approximations: 0, assumptions: assumptions.length, preferencePenalty: 0, unknownEconomics: 0, estimatedCost: 1, estimatedLatency: 1, negativeCapacity: -1, providerCount: 2, key: provider },
  };
}

function proof(id: 'a' | 'b', options: { assumptions?: string[]; state?: 'done' | 'ready'; normalized?: NormalizedOrganizationIR } = {}): SubstrateRealizationProof {
  const issuer = `control-${id}`;
  const created = event(issuer, 'created', 'work.created', { kind: 'work', id: 'w1' }, { type: 'task', title: 'portable', state: 'ready' });
  const started = event(issuer, 'started', 'attempt.started', { kind: 'attempt', id: 'try1' }, { work: 'w1' }, ['created']);
  const succeeded = event(issuer, 'succeeded', 'attempt.status', { kind: 'attempt', id: 'try1' }, { status: 'succeeded' }, ['started']);
  const events = [created, started, succeeded];
  if ((options.state ?? 'done') === 'done') events.push(event(issuer, 'done', 'work.transitioned', { kind: 'work', id: 'w1' }, { to: 'done', event: 'complete' }, ['succeeded']));
  const accepted = acceptCausalHistory(events, policy);
  if (!accepted.history) throw new Error(accepted.errors.join('; '));
  return {
    id, normalized: options.normalized ?? normalized(), deployment: candidate(id === 'a' ? 'control-suite' : 'work-board', options.assumptions),
    history: accepted.history, conformance: checkTraceConformance(definition, accepted.history),
    measurements: {
      cost: { value: id === 'a' ? 1 : 2, unit: 'USD', uncertainty: 'estimated', observedAt: '2026-07-14T12:00:00Z' },
      latency: { value: id === 'a' ? 10 : 20, unit: 'ms', uncertainty: 'bounded', observedAt: '2026-07-14T12:00:00Z' },
      capacity: { value: id === 'a' ? 4 : 8, unit: 'concurrent-attempts', uncertainty: 'bounded', observedAt: '2026-07-14T12:00:00Z' },
      humanLoad: { value: id === 'a' ? 2 : 3, unit: 'human-minutes', uncertainty: 'estimated', observedAt: '2026-07-14T12:00:00Z' },
    },
    failures: [{ scenario: 'worker-loss', outcome: 'recovered', assumptions: id === 'a' ? ['lease expiry'] : ['heartbeat sweep'], observations: ['work returned to ready queue'] }],
    sourceRevision: id === 'a' ? 'control-suite@1' : 'work-board@90f85a7d',
  };
}

describe('P11 dissimilar-substrate portability proof', () => {
  test('proves one canonical organization on dissimilar compositions and accounts for every observed difference', () => {
    const left = proof('a'); const right = proof('b', { assumptions: ['operator maintains heartbeat scheduler'] });
    const result = compareSubstrateRealizations(definition, left, right);
    expect(result).toMatchObject({ status: 'independent', canonicalBytesEqual: true, portableStateEqual: true, obligationSetEqual: true, errors: [] });
    expect(new Set(result.residuals.map((item) => item.category))).toEqual(new Set(['assumption', 'failure', 'economic', 'operation']));
    expect(result.residuals.every((item) => item.semanticImpact !== 'unknown')).toBe(true);
  });

  test('rejects semantic specialization, product vocabulary, and divergent portable state', () => {
    const specialized = normalized();
    const specializedBehavior = specialized.modules['portable/root']?.behaviors?.execute;
    if (!specializedBehavior) throw new Error('normalized fixture lost execute behavior');
    specializedBehavior.inline = 'different behavior';
    expect(compareSubstrateRealizations(definition, proof('a'), proof('b', { normalized: specialized })).status).toBe('not-independent');
    const named = normalized(); named.modules['portable/root']!.name = 'Hermes control';
    expect(compareSubstrateRealizations(definition, proof('a'), proof('b', { normalized: named })).errors.some((error) => error.includes('product-specific vocabulary'))).toBe(true);
    expect(compareSubstrateRealizations(definition, proof('a'), proof('b', { state: 'ready' })).errors).toContain('projected portable states differ');
  });

  test('does not turn nonconformance or unknown trace assurance into an independence claim', () => {
    const right = proof('b'); right.conformance.status = 'undetermined';
    expect(compareSubstrateRealizations(definition, proof('a'), right).status).toBe('undetermined');
    right.conformance.status = 'nonconformant';
    expect(compareSubstrateRealizations(definition, proof('a'), right).status).toBe('not-independent');
  });
});
