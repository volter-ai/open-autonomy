import { describe, expect, test } from 'bun:test';
import { compileGithub } from './emit';
import type { AutonomyIR, Trigger } from '@open-autonomy/core';

function irWith(triggers: Trigger[], kind?: 'agent' | 'human'): AutonomyIR {
  return {
    schema: 'autonomy.ir.v1',
    targets: ['gh-actions'],
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
  // The engine emits only what it DERIVES: the agent workflows + security DATA materializations (the
  // zizmor baseline). The code-host workflows (security.yml, dependabot) AND the gate scripts they call
  // (check-supply-chain, human-approval-gate, the merge pair) are RESOURCES carried by the profile (like
  // the standards docs) — never engine output. The mirror ships only actor-execution machinery.
  test('emits the zizmor baseline; code-host workflows AND their gate scripts are resources, not emitted', () => {
    const out = compileGithub(irWith([{ cron: '0 0 * * *' }]));
    // derived data the engine materializes:
    expect(out.generated['.github/zizmor.yml']).toContain('maintainer.yml'); // baseline = the emitted agent workflow
    // actor-execution runtime IS injected (the runner: how the credentialed box is wrapped):
    expect(out.generated['scripts/claude-agent-run.ts']).toBeDefined();
    expect(out.generated['scripts/agent-propose.ts']).toBeDefined(); // the emitted effect step invokes it
    // code-host CI workflows + the gate scripts they call are RESOURCES (carried by the profile):
    expect(out.generated['.github/workflows/security.yml']).toBeUndefined();
    expect(out.generated['.github/dependabot.yml']).toBeUndefined();
    for (const gate of ['check-supply-chain', 'human-approval-gate', 'rearm-auto-merge', 'reconcile-merged-issues'])
      expect(out.generated[`scripts/${gate}.ts`]).toBeUndefined();
  });

  test('engine bakes in NO org IDENTITY (proxy/audience/bot) — but DOES default the model (a box capability)', () => {
    const base = irWith([{ cron: '0 0 * * *' }]); // no policy.box.github
    const bare = compileGithub(base).generated['.github/workflows/maintainer.yml'];
    expect(bare).not.toContain('volter'); // no org IDENTITY (proxy host / audience / bot) leaks from the engine
    expect(bare).toContain('${{ vars.PUBLIC_AGENT_PROXY_HOST }}'); // proxy host: bare var, no fallback (infra identity)
    expect(bare).toContain('${{ vars.MODEL_PROXY_OIDC_AUDIENCE }}'); // audience: bare var, no fallback (infra identity)
    // The box ALWAYS has a model endpoint (SPEC), so the substrate supplies a DEFAULT model even when the
    // profile names none — a capability default (overridable by the var), NOT org identity.
    expect(bare).toContain("${{ vars.PUBLIC_AGENT_MODEL || 'deepseek/deepseek-v4-flash' }}");

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

describe('compileGithub — merge is a code-host resource, not engine output', () => {
  // The integration boundary (the sibling of deploy's "no agent deploys"): arming native auto-merge +
  // reconciling merged issues is NOT actor output, so the engine does not bake it into the agent workflows.
  // It lives in the merge.yml code-host resource (carried by the profile). The proposer only DISPATCHES it —
  // exactly as it dispatches ci/agent-review — and the tasks:author PM no longer carries reconcile/re-arm.
  const propIR: AutonomyIR = {
    schema: 'autonomy.ir.v1',
    targets: ['gh-actions'],
    agents: {
      developer: { behavior: 'develop', capabilities: ['code:propose'], triggers: [{ dispatch: true }], review: 'reviewer' },
      reviewer: { behavior: 'review', capabilities: ['code:review'], triggers: [{ dispatch: true }] },
      pm: { behavior: 'pm', capabilities: ['tasks:author'], triggers: [{ cron: '0 * * * *' }] },
    },
    policy: { box: {} },
    resources: [],
  };

  test('the engine never emits merge.yml — it is carried by the profile as a resource', () => {
    expect(compileGithub(propIR).generated['.github/workflows/merge.yml']).toBeUndefined();
  });

  test('a code:propose agent runs the agent-owned effect script; arming is delegated, never inline', () => {
    const out = compileGithub(propIR);
    const wf = out.generated['.github/workflows/developer.yml'] ?? '';
    expect(wf).toContain('bun scripts/agent-propose.ts'); // the runner only invokes the agent-owned effect
    expect(wf).not.toContain('gh pr merge'); // no inline arm in the actor's job — that's methodology, not runner
    const script = out.generated['scripts/agent-propose.ts'] ?? '';
    expect(script).toContain('merge.yml'); // the effect arms native auto-merge via the merge.yml resource
  });

  test('a tasks:author agent no longer runs reconcile/re-arm — those move to the merge.yml schedule', () => {
    const wf = compileGithub(propIR).generated['.github/workflows/pm.yml'] ?? '';
    expect(wf).not.toContain('reconcile-merged-issues.ts');
    expect(wf).not.toContain('rearm-auto-merge.ts');
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
  // engaged maintainer past the profile's human.sla_minutes policy). It is judgment, not a frozen template, so it is
  // proven by a live run + a calibrated simulator, never a unit test.
  test.todo('the human seam escalates on SLA (behavioral — PM Step 2c; live-proven, not unit-tested)', () => {});
});
