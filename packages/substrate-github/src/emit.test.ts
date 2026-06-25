import { describe, expect, test } from 'bun:test';
import { compileGithub } from './emit';
import type { AutonomyIR, Trigger } from '@open-autonomy/core';

function irWith(triggers: Trigger[], kind?: 'agent' | 'human'): AutonomyIR {
  return {
    schema: 'autonomy.ir.v1',
    targets: ['github'],
    agents: {
      maintainer: {
        behavior: 'humans/maintainer-review',
        capabilities: ['tasks:converse'],
        triggers,
        ...(kind ? { kind } : {}),
      },
    },
    policy: { box: {} },
    resources: [],
  };
}

function workflows(out: { generated: Record<string, string> }): string[] {
  // Agent-workflow realization only — exclude the substrate-emitted infra workflow (the universal
  // security baseline), which is not an agent job.
  return Object.entries(out.generated)
    .filter(([p]) => p.startsWith('.github/workflows/') && p !== '.github/workflows/security.yml')
    .map(([, c]) => c);
}

describe('compileGithub — substrate-universal security baseline', () => {
  // The substrate secures the surface it creates: it emits a security workflow + dependabot + a zizmor
  // baseline, and injects the supply-chain runner — into EVERY github install, not per-profile.
  test('emits the security workflow, dependabot, supply-chain runner, and a zizmor baseline scoped to the emitted agent workflows', () => {
    const out = compileGithub(irWith([{ cron: '0 0 * * *' }]));
    expect(out.generated['.github/workflows/security.yml']).toContain('scripts/check-supply-chain.ts');
    expect(out.generated['.github/workflows/security.yml']).toContain('zizmor');
    expect(out.generated['.github/dependabot.yml']).toContain('package-ecosystem: github-actions');
    expect(out.generated['scripts/check-supply-chain.ts']).toBeDefined();
    // the zizmor baseline whitelists exactly the agent workflow this compile emitted (maintainer.yml)
    expect(out.generated['.github/zizmor.yml']).toContain('maintainer.yml');
  });

  test('a human-only install still carries the baseline, with no agent workflow to whitelist', () => {
    const out = compileGithub(irWith([{ dispatch: true }], 'human'));
    expect(out.generated['.github/workflows/security.yml']).toBeDefined();
    expect(out.generated['.github/zizmor.yml']).not.toContain('maintainer.yml');
  });
});

describe('compileGithub — dispatch trigger realization', () => {
  // A dispatch trigger is invoked on demand through the Runner — every workflow already exposes
  // workflow_dispatch, so a dispatch trigger adds NO extra `on:` event (no issues:labeled label-watching).
  test('a `dispatch` trigger emits workflow_dispatch and adds no issues-event to `on:`', () => {
    const wfs = workflows(compileGithub(irWith([{ dispatch: true }]))); // non-human → a workflow is emitted
    expect(wfs.length).toBe(1);
    expect(wfs[0]).toContain('workflow_dispatch:');
    // dispatch adds nothing to `on:` beyond the always-present launch surface — no `issues:` label-watch.
    const onBlock = wfs[0]!.slice(wfs[0]!.indexOf('\non:'), wfs[0]!.indexOf('\njobs:'));
    expect(onBlock.includes('\n  issues:')).toBe(false);
  });
});

describe('compileGithub — kind: human is declared, not job-realized', () => {
  // A person needs no runner job: the durable "await a human" block is the existing label + merge boundary,
  // and how a person is notified/assigned/escalated is config the search varies, not a frozen template.
  test('a human actor generates NO github workflow', () => {
    expect(workflows(compileGithub(irWith([{ dispatch: true }], 'human'))).length).toBe(0);
  });

  test('but the human actor IS declared in the manifest (kind:human, no job to launch)', () => {
    const manifest = compileGithub(irWith([{ dispatch: true }], 'human')).generated['.open-autonomy/autonomy.yml'] ?? '';
    expect(manifest).toContain('maintainer');
    expect(manifest).toContain('kind: human');
    expect(manifest).not.toContain('maintainer.yml'); // a person has no launchable workflow
  });

  // The human seam RESUMES on a recorded maintainer decision — the seam's `out` (docs/SPEC.md#handoffs). The
  // operator control plane gains `/agent decide|answer`: it records the typed resolution and clears the human
  // block so the PM re-triages. (Deterministic + maintainer-gated; this is the testable tier.)
  test('the operator control plane resumes the human seam via /agent decide (clears the block)', () => {
    const control = compileGithub(irWith([{ dispatch: true }])).generated['.github/agent-control.mjs'] ?? '';
    expect(control).toContain('decide|answer'); // recognized control verbs
    expect(control).toContain("'human-required'"); // the block it lifts
    expect(control).toContain('--remove-label'); // resolution clears the human-blocking labels
  });

  // The remaining affordance — ESCALATE on SLA — is the BEHAVIORAL tier (PM doctrine, Step 2c: re-ping the
  // engaged maintainer past policy.box.human.sla_minutes). It is judgment, not a frozen template, so it is
  // proven by a live run + a calibrated simulator, never a unit test.
  test.todo('the human seam escalates on SLA (behavioral — PM Step 2c; live-proven, not unit-tested)', () => {});
});
