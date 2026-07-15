import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { compileGithub } from './emit';
import { REVIEW_RESULT_SCHEMA_ID, type AutonomyIR, type Trigger } from '@open-autonomy/core';

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

  test('emits a compiler-owned target enforcement report', () => {
    const report = JSON.parse(compileGithub(irWith([{ cron: '0 0 * * *' }])).generated['.open-autonomy/enforcement.json']);
    expect(report).toMatchObject({ schema: 'open-autonomy.enforcement.v1', target: 'gh-actions', generated: true });
    expect(report.controls.some((control: { control: string }) => control.control === 'agent.maintainer.capabilities')).toBe(true);
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

  // The egress guard is RUNNER security (how the credentialed box is wrapped) — substrate-owned, the
  // inverse of the gate-script split above. Its implementation used to be ONE profile's resource, so any
  // OTHER profile setting the flag compiled to agent jobs invoking a nonexistent file.
  test('private_egress_guard: ANY flag-setting profile gets the step AND scripts/egress-guard.sh together', () => {
    const flagged: AutonomyIR = {
      ...irWith([{ cron: '0 0 * * *' }]),
      policy: { box: { 'gh-actions': { private_egress_guard: true } } },
    };
    const out = compileGithub(flagged);
    const wf = out.generated['.github/workflows/maintainer.yml'];
    expect(wf).toContain('bash scripts/egress-guard.sh'); // the job step…
    expect(out.generated['scripts/egress-guard.sh']).toContain('default-DENY'); // …and its implementation
    // the pre-fix failure mode, stated as the invariant: every emitted job that invokes the guard gets the
    // file from the SAME compile — no dependence on a profile resource.
    expect(flagged.resources).toEqual([]);
  });

  test('private_egress_guard unset: no step, no file', () => {
    const out = compileGithub(irWith([{ cron: '0 0 * * *' }]));
    expect(out.generated['scripts/egress-guard.sh']).toBeUndefined();
    expect(out.generated['.github/workflows/maintainer.yml']).not.toContain('egress-guard.sh');
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
      reviewer: {
        behavior: 'review',
        capabilities: ['code:review'],
        result: { schema: REVIEW_RESULT_SCHEMA_ID },
        triggers: [{ dispatch: true, params: { TARGET_REF: 'subject.ref' } }],
      },
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

  test('a merge reviewer is read-only; a separate base-branch effect posts the bound verdict', () => {
    const out = compileGithub(propIR);
    const wf = out.generated['.github/workflows/reviewer.yml'] ?? '';
    const modelJob = wf.slice(wf.indexOf('  reviewer:'), wf.indexOf('  review_effect:'));
    const effectJob = wf.slice(wf.indexOf('  review_effect:'));
    expect(modelJob).not.toContain('statuses: write');
    expect(modelJob).not.toContain('issues: write');
    expect(modelJob).toContain('OSS_AGENT_RESULT_PATH: .agent-run/artifacts/result.json');
    expect(modelJob).toContain('OSS_AGENT_RESULT_SCHEMA_PATH: .agent-run/result-schema.json');
    expect(modelJob).toContain(`"$id":"${REVIEW_RESULT_SCHEMA_ID}"`);
    const setupJob = wf.slice(wf.indexOf('  setup:'), wf.indexOf('  reviewer:'));
    expect(setupJob).not.toContain('statuses: write');
    expect(setupJob).toContain('Bind review target');
    expect(effectJob).toContain("if: always() && needs.setup.result == 'success'");
    expect(effectJob).toContain('statuses: write');
    expect(effectJob).toContain('ref: ${{ github.event.repository.default_branch }}');
    expect(effectJob).toContain('bun scripts/finalize-agent-review.ts');
    expect(out.generated['scripts/finalize-agent-review.ts']).toContain('A non-successful model job always wins');
  });

  test('an advisory code:review agent not named by a review edge retains its direct status capability', () => {
    const advisory: AutonomyIR = {
      ...propIR,
      agents: {
        ...propIR.agents,
        verifier: { behavior: 'verify', capabilities: ['code:review'], triggers: [{ dispatch: true }] },
      },
    };
    const wf = compileGithub(advisory).generated['.github/workflows/verifier.yml'] ?? '';
    expect(wf).toContain('statuses: write');
    expect(wf).not.toContain('review_effect:');
  });

  test('a merge reviewer without a subject.ref binding is rejected instead of emitting a decorative finalizer', () => {
    const invalid: AutonomyIR = {
      ...propIR,
      agents: { ...propIR.agents, reviewer: { ...propIR.agents.reviewer!, triggers: [{ dispatch: true }] } },
    };
    expect(() => compileGithub(invalid)).toThrow('must declare a trigger param sourced from subject.ref');
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

// TC.3: an actor (audit) can carry BOTH `dispatch` and `cron` — the hosted realization (`renderOn`) already
// appends a `schedule:` block whenever `cronOf(agent)` is truthy, INDEPENDENT of whether `dispatch` is also
// declared (workflow_dispatch is always emitted regardless; `cronOf` just adds `schedule:` on top). No
// compiler change was needed for this unit — this test proves the existing behavior for the combined case.
describe('compileGithub — TC.3: a cron trigger coexists with dispatch on the SAME actor', () => {
  test('the compiled workflow gets BOTH `schedule:` (the cron) and `workflow_dispatch:` (unchanged)', () => {
    const wfs = workflows(compileGithub(irWith([{ dispatch: true, params: { TARGET_REF: 'subject.ref' } }, { cron: '51 9 * * 0' }])));
    expect(wfs.length).toBe(1);
    const onBlock = wfs[0]!.slice(wfs[0]!.indexOf('\non:'), wfs[0]!.indexOf('\njobs:'));
    expect(onBlock).toContain('schedule:');
    expect(onBlock).toContain('cron: "51 9 * * 0"');
    expect(onBlock).toContain('workflow_dispatch:'); // dispatch:true is UNCHANGED by adding a cron alongside it
    expect(onBlock.includes('\n  issues:')).toBe(false); // still no extra label-watch event
  });

  test('trigger declaration ORDER does not matter — cron-first emits identically to dispatch-first', () => {
    const cronFirst = workflows(compileGithub(irWith([{ cron: '51 9 * * 0' }, { dispatch: true }])))[0]!;
    const dispatchFirst = workflows(compileGithub(irWith([{ dispatch: true }, { cron: '51 9 * * 0' }])))[0]!;
    expect(cronFirst).toBe(dispatchFirst);
  });

  test('a bare cron trigger (no dispatch at all) still gets the ORIGINAL autonomous "no work item" step — unaffected by the subject-ref carve-out', () => {
    const wf = workflows(compileGithub(irWith([{ cron: '51 9 * * 0' }])))[0]!;
    expect(wf).toContain('Provide subject (autonomous — no work item)');
    // no subjectRefParam at all -> the "Provide subject" step body (mkdir + printf) is untouched by D1;
    // scope the assertion to that step's own body, since `github.event_name` legitimately appears
    // elsewhere in this workflow (the control job's own `if:` condition).
    const stepBody = wf.slice(wf.indexOf('Provide subject (autonomous'));
    expect(stepBody.slice(0, stepBody.indexOf('- name:', 10))).not.toContain('github.event_name');
  });
});

// D1 fix (post-review): subjectRefParam() is agent-wide — it can't tell WHICH trigger fired a given run.
// Before this fix, an agent carrying both a cron trigger AND a dispatch trigger with a subject.ref param
// (audit) got the SAME single-line `if [ -z "$ref" ]; then ...; exit 1; fi` guard as every subject-scoped
// agent. On a REAL `schedule` firing, none of github.event.issue/inputs/pull_request exist, so `$ref`
// resolves empty and the guard exited 1 BEFORE the audit job ever ran — the weekly cron would fail every
// single time. These tests execute the job step's ACTUAL bash body (not just assert the `on:` block),
// simulating both a real `schedule` firing and a real `workflow_dispatch` firing with no ref, proving the
// fix closes the schedule case WITHOUT weakening the dispatch case.
describe('compileGithub — D1: the "Provide subject" step body actually runs correctly per firing event', () => {
  // Extract the literal `run: |` script body of a named step from a compiled workflow's YAML text — a
  // structural extraction (indentation-based), not a regex guess, so it stays correct if surrounding steps
  // change shape.
  function extractRunScript(wf: string, stepName: string): string {
    const lines = wf.split('\n');
    const stepIdx = lines.findIndex((l) => l.trim() === `- name: ${stepName}`);
    if (stepIdx === -1) throw new Error(`step "${stepName}" not found`);
    const runIdx = lines.findIndex((l, i) => i > stepIdx && l.trim() === 'run: |');
    if (runIdx === -1) throw new Error(`no "run: |" found under step "${stepName}"`);
    const runIndent = lines[runIdx]!.length - lines[runIdx]!.trimStart().length;
    const body: string[] = [];
    for (let i = runIdx + 1; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.trim() === '') {
        body.push('');
        continue;
      }
      const indent = line.length - line.trimStart().length;
      if (indent <= runIndent) break;
      body.push(line.slice(runIndent + 2)); // de-indent to the script's own column
    }
    return body.join('\n');
  }

  // Simulate the ONE bit of GitHub Actions templating this script depends on (`${{ github.event_name }}`)
  // by substituting it with a literal value — everything else in the script is real, unmodified bash that
  // reads real env vars ($TARGET_REF, via `ref="${TARGET_REF}"`), so this executes the actual shipped logic.
  function runStep(script: string, eventName: string, targetRef: string, cwd: string): { status: number | null; stdout: string; issueJson: string | null } {
    const simulated = script.replaceAll('${{ github.event_name }}', eventName);
    mkdirSync(cwd, { recursive: true });
    const r = spawnSync('bash', ['-c', simulated], { cwd, env: { ...process.env, TARGET_REF: targetRef, PATH: process.env.PATH }, encoding: 'utf8' });
    const issuePath = join(cwd, '.agent-run', 'issue.json');
    return { status: r.status, stdout: r.stdout, issueJson: existsSync(issuePath) ? readFileSync(issuePath, 'utf8') : null };
  }

  test('a REAL `schedule` firing with no ref: proceeds (exit 0), writes the autonomous placeholder — the weekly cron now actually runs', () => {
    const wf = workflows(compileGithub(irWith([{ dispatch: true, params: { TARGET_REF: 'subject.ref' } }, { cron: '51 9 * * 0' }])))[0]!;
    const script = extractRunScript(wf, 'Provide subject');
    const dir = mkdtempSync(join(tmpdir(), 'oa-d1-schedule-'));
    try {
      const result = runStep(script, 'schedule', '', dir);
      expect(result.status).toBe(0); // NOT exit 1 — this is the exact regression D1 reports
      expect(result.stdout).not.toContain('no subject.ref forwarded');
      expect(result.issueJson).not.toBeNull();
      expect(JSON.parse(result.issueJson!)).toEqual({ number: 0, title: 'maintainer', body: '' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a REAL `workflow_dispatch` firing with no ref: STILL exits 1 — the dispatch path is not weakened', () => {
    const wf = workflows(compileGithub(irWith([{ dispatch: true, params: { TARGET_REF: 'subject.ref' } }, { cron: '51 9 * * 0' }])))[0]!;
    const script = extractRunScript(wf, 'Provide subject');
    const dir = mkdtempSync(join(tmpdir(), 'oa-d1-dispatch-'));
    try {
      const result = runStep(script, 'workflow_dispatch', '', dir);
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('no subject.ref forwarded by the trigger');
      expect(result.issueJson).toBeNull(); // no placeholder written on a genuine caller error
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a REAL `issue_comment` firing with no ref: STILL exits 1 too (only `schedule` is exempt)', () => {
    const wf = workflows(compileGithub(irWith([{ dispatch: true, params: { TARGET_REF: 'subject.ref' } }, { cron: '51 9 * * 0' }])))[0]!;
    const script = extractRunScript(wf, 'Provide subject');
    const dir = mkdtempSync(join(tmpdir(), 'oa-d1-comment-'));
    try {
      const result = runStep(script, 'issue_comment', '', dir);
      expect(result.status).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a `workflow_dispatch` firing WITH a real ref still proceeds to the gh api fetch line unchanged (no regression on the happy path)', () => {
    const wf = workflows(compileGithub(irWith([{ dispatch: true, params: { TARGET_REF: 'subject.ref' } }, { cron: '51 9 * * 0' }])))[0]!;
    const script = extractRunScript(wf, 'Provide subject');
    // Replace the real `gh api ...` call with a stub so this test has no network/credential dependency —
    // everything BEFORE that line (the guard itself) is untouched and still real.
    const stubbed = script.replace(/gh api .*$/m, 'echo "would fetch $ref" && printf \'{"stubbed":true}\\n\' > .agent-run/issue.json');
    const dir = mkdtempSync(join(tmpdir(), 'oa-d1-happy-'));
    try {
      const result = runStep(stubbed, 'workflow_dispatch', '42', dir);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('would fetch 42');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a dispatch-ONLY agent (no cron at all) is completely untouched by the D1 fix — byte-identical guard, no event_name check', () => {
    const wf = workflows(compileGithub(irWith([{ dispatch: true, params: { TARGET_REF: 'subject.ref' } }])))[0]!;
    const script = extractRunScript(wf, 'Provide subject');
    expect(script).not.toContain('github.event_name');
    expect(script).toContain('if [ -z "$ref" ]; then echo "no subject.ref forwarded by the trigger"; exit 1; fi');
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
