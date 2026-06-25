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

describe('compileGithub — derived security data vs code-host resources', () => {
  // The engine emits only what it DERIVES: the agent workflows + security DATA materializations (the zizmor
  // baseline + the supply-chain runtime). The security.yml workflow + dependabot config that consume them
  // are code-host RESOURCES carried by the profile (like the standards docs) — never engine output.
  test('emits the zizmor baseline + supply-chain runtime; security.yml + dependabot are resources, not emitted', () => {
    const out = compileGithub(irWith([{ cron: '0 0 * * *' }]));
    // derived data the engine materializes:
    expect(out.generated['.github/zizmor.yml']).toContain('maintainer.yml'); // baseline = the emitted agent workflow
    expect(out.generated['scripts/check-supply-chain.ts']).toBeDefined();    // supply-chain runtime is injected
    // code-host CI workflows are RESOURCES (carried by the profile), NOT engine output:
    expect(out.generated['.github/workflows/security.yml']).toBeUndefined();
    expect(out.generated['.github/dependabot.yml']).toBeUndefined();
  });

  test('engine bakes in NO org identity — proxy host / OIDC audience / model / bot come from policy.box.github', () => {
    const base = irWith([{ cron: '0 0 * * *' }]); // no policy.box.github
    const bare = compileGithub(base).generated['.github/workflows/maintainer.yml'];
    expect(bare).not.toContain('volter'); // nothing org-specific leaks from the engine
    expect(bare).toContain('${{ vars.PUBLIC_AGENT_PROXY_HOST }}'); // bare var, no fallback, when undeclared

    const configured: AutonomyIR = {
      ...base,
      policy: { box: { github: { proxy_host: 'acme-proxy.example.dev', oidc_audience: 'acme-aud', model: 'x/y' } } },
    };
    const wf = compileGithub(configured).generated['.github/workflows/maintainer.yml'];
    expect(wf).toContain("${{ vars.PUBLIC_AGENT_PROXY_HOST || 'acme-proxy.example.dev' }}"); // profile value is the fallback
    expect(wf).toContain("${{ vars.MODEL_PROXY_OIDC_AUDIENCE || 'acme-aud' }}");
    expect(wf).toContain("${{ vars.PUBLIC_AGENT_MODEL || 'x/y' }}");
  });

  test('a human-only install emits an empty zizmor baseline (no agent workflow to whitelist)', () => {
    const out = compileGithub(irWith([{ dispatch: true }], 'human'));
    expect(out.generated['.github/zizmor.yml']).toBeDefined();
    expect(out.generated['.github/zizmor.yml']).not.toContain('maintainer.yml');
  });

  test('materializes the profile human-required scope VERBATIM — the engine carries policy, never authors it', () => {
    const base = irWith([{ cron: '0 0 * * *' }]);
    const declared = ['.github/workflows/**', 'custom/sensitive/**'];
    const withPolicy: AutonomyIR = { ...base, policy: { box: { risk: { human_required_paths: declared } } } };
    const paths = JSON.parse(compileGithub(withPolicy).generated['.open-autonomy/human-required-paths.json']) as string[];
    expect(paths).toEqual(declared); // exactly what policy declares, in order — no engine-injected paths
    // a profile that declares nothing gets nothing: no substrate defaults baked into the engine
    expect(JSON.parse(compileGithub(base).generated['.open-autonomy/human-required-paths.json'])).toEqual([]);
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
