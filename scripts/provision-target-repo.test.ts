import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  formatReport,
  missingSecrets,
  parseManifest,
  planLabels,
  planVariables,
  provisionTargetRepo,
  type ProcFn,
} from './provision-target-repo.js';

const MANIFEST = JSON.stringify({
  private: true,
  required_secrets: ['EXAMPLE_REPO_SECRET'],
  variables: [
    { name: 'MODEL_PROXY_URL', value: 'https://proxy.example' },
    { name: 'PUBLIC_AGENT_REPO_PAUSED', value: 'false' },
  ],
  labels: [{ name: 'needs-info' }, { name: 'human-required' }],
  branch_protection: { branch: 'main', required_checks: ['ci'] },
});

describe('provision-target-repo manifest', () => {
  test('parses a valid manifest and rejects malformed variables', () => {
    const manifest = parseManifest(MANIFEST);
    expect(manifest.variables).toHaveLength(2);
    expect(manifest.required_secrets).toContain('EXAMPLE_REPO_SECRET');
    expect(() => parseManifest(JSON.stringify({ variables: [{ name: 'X' }], labels: [] }))).toThrow();
  });
});

describe('provision-target-repo planning', () => {
  test('plans variable create/update/unchanged from existing state', () => {
    const desired = parseManifest(MANIFEST).variables;
    const plan = planVariables(desired, { MODEL_PROXY_URL: 'https://proxy.example' });
    expect(plan.find((v) => v.name === 'MODEL_PROXY_URL')?.action).toBe('unchanged');
    expect(plan.find((v) => v.name === 'PUBLIC_AGENT_REPO_PAUSED')?.action).toBe('create');
    const updated = planVariables(desired, { MODEL_PROXY_URL: 'https://old.example', PUBLIC_AGENT_REPO_PAUSED: 'false' });
    expect(updated.find((v) => v.name === 'MODEL_PROXY_URL')?.action).toBe('update');
  });

  test('plans only missing labels for creation', () => {
    const desired = parseManifest(MANIFEST).labels;
    const plan = planLabels(desired, ['needs-info']);
    expect(plan.find((l) => l.name === 'needs-info')?.action).toBe('exists');
    expect(plan.find((l) => l.name === 'human-required')?.action).toBe('create');
  });

  test('reports only secrets that are absent', () => {
    expect(missingSecrets(['EXAMPLE_REPO_SECRET'], [])).toEqual(['EXAMPLE_REPO_SECRET']);
    expect(missingSecrets(['EXAMPLE_REPO_SECRET'], ['EXAMPLE_REPO_SECRET'])).toEqual([]);
  });

  test('report surfaces manual secret follow-up and applied changes', () => {
    const report = formatReport({
      repo: 'owner/name',
      created: true,
      pushed: true,
      variables: planVariables(parseManifest(MANIFEST).variables, {}),
      labels: planLabels(parseManifest(MANIFEST).labels, []),
      branchProtection: 'configured',
      missingSecrets: ['EXAMPLE_REPO_SECRET'],
      dryRun: false,
    });
    expect(report).toContain('repo owner/name: created');
    expect(report).toContain('create MODEL_PROXY_URL');
    expect(report).toContain('MANUAL: set these secrets');
    expect(report).toContain('EXAMPLE_REPO_SECRET');
  });
});

// =========================================================================================================
// TE.10 — `armAutoMerge` gates the allow_auto_merge PATCH. Regression coverage for the finding: this PATCH
// used to fire UNCONDITIONALLY, so `oa install`'s automated EXECUTE (bin/install-execute.ts's
// stepCiAndProvision) silently pre-armed native auto-merge before any human ever watched a PR merge —
// contradicting TE.6's already-ratified G4b runbook (bin/install-handoff.ts's G4B_RUNBOOK) and
// docs/INSTALL-AGENT.md's "supervised first merge (then arm auto-merge)" playbook. Every `gh`/`git` call
// below goes through an injected `ProcFn` stub — nothing here touches a real repo or a real `gh` binary.
// =========================================================================================================

const REPO = 'acme/te10-scratch';
const BP_MANIFEST = {
  private: true,
  required_secrets: [],
  variables: [],
  labels: [],
  branch_protection: { branch: 'main', required_checks: ['ci', 'agent-review'] },
};

const tmps: string[] = [];
function trackTmp(dir: string): string {
  tmps.push(dir);
  return dir;
}
function cleanupTmps(): void {
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true });
}

function writeManifestFile(manifest: unknown): string {
  const dir = trackTmp(mkdtempSync(join(tmpdir(), 'provision-test-')));
  const path = join(dir, 'provision.json');
  writeFileSync(path, JSON.stringify(manifest));
  return path;
}

// A repo that already EXISTS with commits (hasCommits=true, shouldPush=false) — keeps every test below
// clear of pushInitialContent's real `git init/add/commit/push` calls (irrelevant to the auto-merge gate
// under test, and no business touching a real remote in a unit test).
function makeCallLoggingProc(): { proc: ProcFn; calls: string[][] } {
  const calls: string[][] = [];
  const proc: ProcFn = (cmd, args, opts) => {
    calls.push([cmd, ...args]);
    if (cmd === 'gh' && args[0] === 'repo' && args[1] === 'view') return { status: 0, stdout: '{"name":"te10-scratch"}', stderr: '' };
    if (cmd === 'gh' && args[0] === 'api' && args[1] === `repos/${REPO}/commits`) return { status: 0, stdout: 'deadbeef', stderr: '' };
    if (cmd === 'gh' && args[0] === 'variable' && args[1] === 'list') return { status: 0, stdout: '[]', stderr: '' };
    if (cmd === 'gh' && args[0] === 'label' && args[1] === 'list') return { status: 0, stdout: '[]', stderr: '' };
    if (cmd === 'gh' && args[0] === 'api' && args[1] === '-X' && args[2] === 'PATCH' && args[3] === `repos/${REPO}`) {
      return { status: 0, stdout: '', stderr: '' }; // allow_auto_merge PATCH (only reached when armed)
    }
    if (cmd === 'gh' && args[0] === 'api' && args[1] === '-X' && args[2] === 'PUT' && args[3]?.includes('/protection')) {
      return { status: 0, stdout: '', stderr: '' };
    }
    if (cmd === 'gh' && args[0] === 'secret' && args[1] === 'list') return { status: 0, stdout: '[]', stderr: '' };
    void opts;
    return { status: 1, stdout: '', stderr: `unexpected call in TE.10 test: ${cmd} ${args.join(' ')}` };
  };
  return { proc, calls };
}

describe('provisionTargetRepo — armAutoMerge (TE.10)', () => {
  test('default (armAutoMerge omitted/false, the real oa-install shape) never issues the allow_auto_merge PATCH', async () => {
    const manifestPath = writeManifestFile(BP_MANIFEST);
    const { proc, calls } = makeCallLoggingProc();
    const report = await provisionTargetRepo(
      { repo: REPO, source: '/nonexistent-unused', manifest: manifestPath, forceContent: false, dryRun: false, armAutoMerge: false },
      proc,
    );
    expect(calls.some((c) => c.join(' ').includes('allow_auto_merge'))).toBe(false);
    // Branch protection itself STILL gets configured — this fix must not regress TE.5's already-proven
    // hardening: required checks land on the real PUT call.
    const putCall = calls.find((c) => c[0] === 'gh' && c[3] === 'PUT' && c[4]?.includes('/protection'));
    expect(putCall).toBeDefined();
    expect(report).toContain('branch protection: configured');
    cleanupTmps();
  });

  test('explicit --arm-auto-merge (the bin/bench.ts live-testing call site) DOES issue the allow_auto_merge PATCH', async () => {
    const manifestPath = writeManifestFile(BP_MANIFEST);
    const { proc, calls } = makeCallLoggingProc();
    const report = await provisionTargetRepo(
      { repo: REPO, source: '/nonexistent-unused', manifest: manifestPath, forceContent: false, dryRun: false, armAutoMerge: true },
      proc,
    );
    const patchCall = calls.find((c) => c.join(' ').includes('allow_auto_merge=true'));
    expect(patchCall).toBeDefined();
    expect(patchCall).toEqual(['gh', 'api', '-X', 'PATCH', `repos/${REPO}`, '-F', 'allow_auto_merge=true']);
    // Branch protection still configured too — arming auto-merge is additive, never a substitute.
    const putCall = calls.find((c) => c[0] === 'gh' && c[3] === 'PUT' && c[4]?.includes('/protection'));
    expect(putCall).toBeDefined();
    expect(report).toContain('branch protection: configured');
    cleanupTmps();
  });

  test('a manifest with no branch_protection block never issues the PATCH even when armAutoMerge:true (nothing to arm)', async () => {
    const manifestPath = writeManifestFile({ ...BP_MANIFEST, branch_protection: undefined });
    const { proc, calls } = makeCallLoggingProc();
    await provisionTargetRepo(
      { repo: REPO, source: '/nonexistent-unused', manifest: manifestPath, forceContent: false, dryRun: false, armAutoMerge: true },
      proc,
    );
    expect(calls.some((c) => c.join(' ').includes('allow_auto_merge'))).toBe(false);
    cleanupTmps();
  });
});
