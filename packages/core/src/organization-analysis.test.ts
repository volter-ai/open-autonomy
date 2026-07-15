import { describe, expect, test } from 'bun:test';
import type { OrganizationIR } from './organization-ir';
import { analyzeOrganization, verifyAnalysisCertificate, type AnalysisEnvironment } from './organization-analysis';

const sound: OrganizationIR = {
  schema: 'autonomy.organization.v2', name: 'analyzable',
  behaviors: { execute: { kind: 'program', inline: 'bounded operation' } },
  capabilities: { change: { resourceKinds: ['repository'], actions: ['write'] } },
  actors: {
    maker: { kind: 'agent', behaviors: ['execute'], capabilities: [{ capability: 'change', scope: { kind: 'repository', ids: ['repo'] }, delegable: true }] },
    reviewer: { kind: 'human', behaviors: ['execute'] },
  },
  workTypes: { task: {
    lifecycle: { initial: 'ready', terminal: ['done'], states: { ready: {}, active: {}, done: {} }, transitions: [{ from: 'ready', to: 'active', event: 'start' }, { from: 'active', to: 'done', event: 'complete' }] },
    assignment: { mode: 'direct', candidates: ['maker'] }, requiredCapabilities: ['change'], retry: { maxAttempts: 3, exhaustion: 'escalate' },
    verification: { required: true, independent: true, verifier: ['reviewer'] },
  } },
  protocols: { review: { roles: ['author', 'reviewer'], messages: { request: { from: 'author', to: 'reviewer' } }, sessions: { initial: 'open', terminal: ['closed'], states: { open: { on: { approve: 'closed' } }, closed: { on: {} } } } } },
  budgets: { calls: { resource: 'requests', limit: 10, unit: 'requests', period: 'day' } },
};
const environment: AnalysisEnvironment = {
  bounds: { maximumStates: 100, maximumDepth: 20, horizon: 'day' },
  fairnessAssumptions: ['enabled transitions are eventually scheduled'],
  closedWorld: ['delegation', 'information-flow', 'resource-demand'],
  delegations: [{ from: 'maker', to: 'helper', parent: sound.actors.maker.capabilities![0]!, child: { capability: 'change', scope: { kind: 'repository', ids: ['repo'] }, delegable: false } }],
  informationFlows: [{ from: 'work', to: 'review', sourceLabel: 1, targetClearance: 1 }],
  resourceDemands: [{ budget: 'calls', amount: 7, unit: 'requests', horizon: 'day', arrivals: 4, serviceCapacity: 5 }],
};

describe('P12 bounded formal analyses', () => {
  test('checks all ten required analyses and emits bounded certificates', () => {
    const results = analyzeOrganization(sound, environment);
    expect(results.map((item) => item.id)).toEqual([
      'lifecycle-reachability', 'dead-state-and-deadlock', 'capability-attenuation', 'least-authority',
      'separation-of-duty', 'protocol-compatibility', 'information-flow', 'budget-bounds',
      'retry-amplification', 'control-loop-progress',
    ]);
    expect(results.every((item) => item.status === 'proved')).toBe(true);
    for (const item of results) {
      expect(item.certificate?.checker).toBe('oa-finite-analysis-v1');
      expect(verifyAnalysisCertificate(item, sound, environment)).toBe(true);
      expect(item.bounds).toEqual(environment.bounds);
      expect(item.soundnessDomain.length).toBeGreaterThan(0);
    }
  });

  test('rejects a tampered result certificate', () => {
    const item = analyzeOrganization(sound, environment)[0]!;
    item.findings.push({ property: 'forged', message: 'forged proof', counterexample: [] });
    expect(verifyAnalysisCertificate(item, sound, environment)).toBe(false);
  });

  test('returns concrete witnesses for graph, authority, protocol, flow, resource, retry, and loop violations', () => {
    const broken = structuredClone(sound);
    broken.workTypes!.task!.lifecycle.states.orphan = {};
    broken.workTypes!.task!.lifecycle.states.stuck = {};
    broken.workTypes!.task!.lifecycle.transitions.push({ from: 'active', to: 'stuck', event: 'wait' });
    broken.workTypes!.task!.verification!.verifier = ['maker'];
    broken.workTypes!.task!.requiredCapabilities = [];
    broken.workTypes!.task!.retry = { exhaustion: 'replan' };
    broken.protocols!.review!.messages.bad = { from: 'intruder', to: 'reviewer' };
    broken.protocols!.review!.sessions!.states.open.on = {};
    const hostile: AnalysisEnvironment = {
      ...environment,
      delegations: [{ from: 'maker', to: 'helper', parent: environment.delegations![0]!.parent, child: { capability: 'change', scope: { kind: 'repository', ids: ['other'] } } }],
      informationFlows: [{ from: 'secret', to: 'public', sourceLabel: 3, targetClearance: 0 }],
      resourceDemands: [{ budget: 'calls', amount: 11, unit: 'requests', horizon: 'day', arrivals: 9, serviceCapacity: 2 }],
    };
    const violated = analyzeOrganization(broken, hostile).filter((item) => item.status === 'violated');
    expect(violated.length).toBeGreaterThanOrEqual(9);
    expect(violated.every((item) => item.findings.some((finding) => finding.counterexample.length > 0))).toBe(true);
  });

  test('reports unknown for open worlds and exhausted bounds instead of claiming proof', () => {
    const open = analyzeOrganization(sound, { bounds: { maximumStates: 1, maximumDepth: 1 } });
    expect(open.find((item) => item.id === 'capability-attenuation')?.status).toBe('unknown');
    expect(open.find((item) => item.id === 'information-flow')?.status).toBe('unknown');
    expect(open.find((item) => item.id === 'budget-bounds')?.status).toBe('unknown');
    expect(open.find((item) => item.id === 'lifecycle-reachability')?.findings[0]?.message).toContain('bound');
  });

  test('requires opaque selector delegation to remain unproved without a containment witness', () => {
    const opaque = structuredClone(environment);
    opaque.delegations = [{ from: 'maker', to: 'helper', parent: { capability: 'change', scope: { expression: 'external("scope")' } }, child: { capability: 'change', scope: { kind: 'repository' } } }];
    expect(analyzeOrganization(sound, opaque).find((item) => item.id === 'capability-attenuation')?.status).toBe('violated');
  });
});
