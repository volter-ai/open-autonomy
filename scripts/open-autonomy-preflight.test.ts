import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SEAM_CONTRACT_LABELS, expectedLabels, buildPreflightReport } from './open-autonomy-preflight';

const installWith = (manifestYml?: string): string => {
  const dir = mkdtempSync(join(tmpdir(), 'preflight-labels-'));
  if (manifestYml !== undefined) {
    mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
    writeFileSync(join(dir, '.open-autonomy', 'autonomy.yml'), manifestYml);
  }
  return dir;
};

describe('expectedLabels — contract constants + the declared policy, never a hand-kept list', () => {
  test('the manifest is the tunable half: block labels + planner origin/priority labels join the contract set', () => {
    const dir = installWith(
      [
        'policy:',
        '  merge:',
        '    maintainer_block_labels: [do-not-merge, my-org-hold]',
        '  planner:',
        '    issue_origin_label_prefix: "src:"',
        '    priority_labels: { high: prio:high }',
        '',
      ].join('\n'),
    );
    const labels = expectedLabels(dir);
    for (const l of SEAM_CONTRACT_LABELS) expect(labels).toContain(l);
    for (const l of ['do-not-merge', 'my-org-hold', 'src:roadmap-planner', 'prio:high']) expect(labels).toContain(l);
  });

  test('no manifest → the contract constants alone (the missing manifest has its own check)', () => {
    expect(expectedLabels(installWith())).toEqual(SEAM_CONTRACT_LABELS);
  });

  test('duplicates collapse: a contract label also declared as a block label appears once', () => {
    const dir = installWith('policy:\n  merge:\n    maintainer_block_labels: [human-required, agent-paused]\n');
    const labels = expectedLabels(dir);
    expect(labels.filter((l) => l === 'human-required')).toHaveLength(1);
  });

  test('the REAL dogfood install: the seeded set covers the declared hold vocabulary and planner labels', () => {
    // Not a fixture — this reads the repo's compiled .open-autonomy/autonomy.yml, so the preflight seed
    // list can never again drift from the declared policy (it used to be a fifth hand-kept copy).
    const labels = expectedLabels('.');
    for (const l of [
      ...SEAM_CONTRACT_LABELS,
      'do-not-merge',
      'agent-maintainer-hold',
      'origin:roadmap-planner',
      'priority:high',
    ]) {
      expect(labels).toContain(l);
    }
  });
});

describe('buildPreflightReport — REQUIRED_FILES derives per-agent workflows from the manifest (BL-27 dev/03)', () => {
  const installWith = (agents: Record<string, { workflowFile?: string }>): string => {
    const dir = mkdtempSync(join(tmpdir(), 'preflight-files-'));
    mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
    writeFileSync(
      join(dir, '.open-autonomy', 'autonomy.yml'),
      `agents:\n${Object.entries(agents).map(([role, a]) => `  ${role}: ${a.workflowFile ? `{ workflowFile: ${a.workflowFile} }` : '{}'}\n`).join('')}`,
    );
    return dir;
  };

  test('a self-driving-shaped manifest checks for developer/reviewer/pm/planner.yml — no hardcode needed', () => {
    const dir = installWith({
      developer: { workflowFile: 'developer.yml' },
      reviewer: { workflowFile: 'reviewer.yml' },
      pm: { workflowFile: 'pm.yml' },
      planner: { workflowFile: 'planner.yml' },
    });
    const report = buildPreflightReport({ root: dir });
    for (const f of ['.github/workflows/developer.yml', '.github/workflows/reviewer.yml', '.github/workflows/pm.yml', '.github/workflows/planner.yml']) {
      expect(report.checks.some((c) => c.id === `file:${f}`)).toBe(true);
    }
  });

  test('a differently-shaped fork (renamed agents) is checked for ITS OWN workflow files, not the hardcoded four', () => {
    const dir = installWith({ builder: { workflowFile: 'builder.yml' }, critic: { workflowFile: 'critic.yml' } });
    const report = buildPreflightReport({ root: dir });
    expect(report.checks.some((c) => c.id === 'file:.github/workflows/builder.yml')).toBe(true);
    expect(report.checks.some((c) => c.id === 'file:.github/workflows/developer.yml')).toBe(false);
  });

  test('a kind:human actor (no workflowFile) is never checked for a workflow file', () => {
    const dir = installWith({ maintainer: {}, developer: { workflowFile: 'developer.yml' } });
    const report = buildPreflightReport({ root: dir });
    expect(report.checks.some((c) => c.id.includes('maintainer'))).toBe(false);
    expect(report.checks.some((c) => c.id === 'file:.github/workflows/developer.yml')).toBe(true);
  });
});

// D2 (HIGH, aggregate-review finding) — self-driving@local could STRUCTURALLY NEVER reach M3 because
// `agentWorkflowFiles` used to require every manifest-listed `.github/workflows/<agent>.yml` unconditionally,
// even on an install whose OWN compile (a local-substrate compile) never generates those files by design
// (substrate-local/emit.ts: "no workflows..."). The fix makes the check TARGET-AWARE: a workflow file is
// only required when `.open-autonomy/generated.json`'s `files[]` (the install's own real compiled-output
// provenance record — core/file-manifest.ts) actually lists it. Both directions are proven below: (a) a
// local-shaped install (generated.json present, workflow files NOT listed) is never asked for them; (b) a
// gh-actions-shaped install (generated.json lists them) still hard-fails if one is deleted post-compile —
// the check must never be silently weakened for a genuinely hosted install.
describe('buildPreflightReport — agentWorkflowFiles is target-aware against generated.json (D2 fix)', () => {
  const installWith = (agents: Record<string, { workflowFile?: string }>, generatedFiles?: string[]): string => {
    const dir = mkdtempSync(join(tmpdir(), 'preflight-d2-'));
    mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
    writeFileSync(
      join(dir, '.open-autonomy', 'autonomy.yml'),
      `agents:\n${Object.entries(agents).map(([role, a]) => `  ${role}: ${a.workflowFile ? `{ workflowFile: ${a.workflowFile} }` : '{}'}\n`).join('')}`,
    );
    if (generatedFiles !== undefined) {
      writeFileSync(
        join(dir, '.open-autonomy', 'generated.json'),
        JSON.stringify({ schema: 'open-autonomy.generated.v1', files: generatedFiles }, null, 2),
      );
    }
    return dir;
  };

  test('(a) a local-target compile — generated.json exists but never lists .github/workflows/*.yml — never demands them, even though none exist on disk', () => {
    const dir = installWith(
      {
        draft: { workflowFile: 'draft.yml' },
        develop: { workflowFile: 'develop.yml' },
        pm: { workflowFile: 'pm.yml' },
        reviewer: { workflowFile: 'reviewer.yml' },
      },
      // a real local-substrate compile's generated.json — no .github/workflows/*.yml entries at all
      ['.open-autonomy/autonomy.yml', '.open-autonomy/generated.json', '.open-autonomy/roadmap.yml', 'scheduler/schedule.json'],
    );
    const report = buildPreflightReport({ root: dir });
    for (const f of ['draft.yml', 'develop.yml', 'pm.yml', 'reviewer.yml']) {
      expect(report.checks.some((c) => c.id === `file:.github/workflows/${f}`)).toBe(false);
    }
    // sanity: this is genuinely proving the workflow files are ABSENT on disk, not merely unlisted
    for (const f of ['draft.yml', 'develop.yml', 'pm.yml', 'reviewer.yml']) {
      expect(existsSync(join(dir, '.github', 'workflows', f))).toBe(false);
    }
  });

  test('(b) a gh-actions-target compile — generated.json DOES list .github/workflows/*.yml — still hard-fails when one is deleted post-compile', () => {
    const dir = installWith(
      { pm: { workflowFile: 'pm.yml' }, reviewer: { workflowFile: 'reviewer.yml' } },
      ['.github/workflows/pm.yml', '.github/workflows/reviewer.yml', '.open-autonomy/autonomy.yml', '.open-autonomy/generated.json'],
    );
    // materialize pm.yml only — reviewer.yml was "deleted post-compile"
    mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(dir, '.github', 'workflows', 'pm.yml'), '# workflow\n');
    const report = buildPreflightReport({ root: dir });
    const pmCheck = report.checks.find((c) => c.id === 'file:.github/workflows/pm.yml')!;
    const reviewerCheck = report.checks.find((c) => c.id === 'file:.github/workflows/reviewer.yml')!;
    expect(pmCheck.status).toBe('pass');
    expect(reviewerCheck.status).toBe('fail');
    expect(report.ready).toBe(false);
    expect(report.missing).toContain('file:.github/workflows/reviewer.yml');
  });

  test('generated.json missing entirely (legacy/corrupted install) falls back to the pre-D2-fix unfiltered behavior — never silently relaxes', () => {
    const dir = installWith({ pm: { workflowFile: 'pm.yml' } }); // no generatedFiles arg -> no generated.json written
    const report = buildPreflightReport({ root: dir });
    const pmCheck = report.checks.find((c) => c.id === 'file:.github/workflows/pm.yml')!;
    expect(pmCheck.status).toBe('fail'); // still required, matching legacy behavior
  });

  test('generated.json present but corrupted (invalid JSON) also falls back to unfiltered, not a silent pass', () => {
    const dir = installWith({ pm: { workflowFile: 'pm.yml' } });
    writeFileSync(join(dir, '.open-autonomy', 'generated.json'), '{not valid json');
    const report = buildPreflightReport({ root: dir });
    const pmCheck = report.checks.find((c) => c.id === 'file:.github/workflows/pm.yml')!;
    expect(pmCheck.status).toBe('fail');
  });

  test('(c) regression — a gh-actions install with every listed workflow file present on disk still passes cleanly', () => {
    const dir = installWith(
      { developer: { workflowFile: 'developer.yml' } },
      ['.github/workflows/developer.yml', '.open-autonomy/autonomy.yml', '.open-autonomy/generated.json'],
    );
    mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(dir, '.github', 'workflows', 'developer.yml'), '# workflow\n');
    const report = buildPreflightReport({ root: dir });
    expect(report.checks.find((c) => c.id === 'file:.github/workflows/developer.yml')!.status).toBe('pass');
  });
});

describe('buildPreflightReport — MODEL_PROXY_URL does not apply to a local-runner install (BL-27 dev/03)', () => {
  test('a gh-actions-shaped install (no scheduler/run.mjs) warns when MODEL_PROXY_URL is unset', () => {
    const dir = mkdtempSync(join(tmpdir(), 'preflight-env-gh-'));
    const report = buildPreflightReport({ root: dir, env: {} });
    const check = report.checks.find((c) => c.id === 'env:MODEL_PROXY_URL')!;
    expect(check.status).toBe('warn');
  });

  test('a local-runner install (scheduler/run.mjs present) passes without needing MODEL_PROXY_URL at all', () => {
    const dir = mkdtempSync(join(tmpdir(), 'preflight-env-local-'));
    mkdirSync(join(dir, 'scheduler'), { recursive: true });
    writeFileSync(join(dir, 'scheduler', 'run.mjs'), '// loop driver\n');
    const report = buildPreflightReport({ root: dir, env: {} });
    const check = report.checks.find((c) => c.id === 'env:MODEL_PROXY_URL')!;
    expect(check.status).toBe('pass');
    expect(check.message).toContain('does not apply to a local-runner install');
  });
});

// U2 (supercode study §II.9.1) — preflight is the compile/preflight-time existence check for a declared
// document role: `referencedAutonomyPaths` already walks `config.documents` (open-autonomy-config.ts) and
// existsSync-checks every value with a hard 'fail' status, so a declared role rides that SAME mechanism
// that already checks constitution/roadmap — no new preflight code needed, just the role showing up in
// config.documents (see open-autonomy-config.test.ts for that half).
describe('buildPreflightReport — a declared document role is existence-checked (U2)', () => {
  const installWithManifest = (manifestYml: string, files: Record<string, string> = {}): string => {
    const dir = mkdtempSync(join(tmpdir(), 'preflight-roles-'));
    mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
    writeFileSync(join(dir, '.open-autonomy', 'autonomy.yml'), manifestYml);
    for (const [rel, content] of Object.entries(files)) {
      mkdirSync(join(dir, rel, '..'), { recursive: true });
      writeFileSync(join(dir, rel), content);
    }
    return dir;
  };

  test('a declared vision role whose file is missing is a hard FAIL (not a warn)', () => {
    const dir = installWithManifest('documents:\n  roles:\n    vision: docs/VISION.md\n');
    const report = buildPreflightReport({ root: dir });
    const check = report.checks.find((c) => c.id === 'autonomy-ref:docs/VISION.md');
    expect(check?.status).toBe('fail');
    expect(report.ready).toBe(false);
  });

  test('a declared vision role whose file EXISTS passes', () => {
    const dir = installWithManifest('documents:\n  roles:\n    vision: docs/VISION.md\n', { 'docs/VISION.md': '# vision\n' });
    const report = buildPreflightReport({ root: dir });
    const check = report.checks.find((c) => c.id === 'autonomy-ref:docs/VISION.md');
    expect(check?.status).toBe('pass');
  });

  test('an undeclared vision role is simply never checked (no false-positive fail)', () => {
    const dir = installWithManifest('agents: {}\n');
    const report = buildPreflightReport({ root: dir });
    expect(report.checks.some((c) => c.id === 'autonomy-ref:docs/VISION.md')).toBe(false);
  });

  test('a declared constitution role overrides the default docs/CONSTITUTION.md path — the OVERRIDDEN path is what gets checked', () => {
    const dir = installWithManifest('documents:\n  roles:\n    constitution: profiles/acme/docs/OUR_CONSTITUTION.md\n');
    const report = buildPreflightReport({ root: dir });
    expect(report.checks.some((c) => c.id === 'autonomy-ref:profiles/acme/docs/OUR_CONSTITUTION.md')).toBe(true);
    expect(report.checks.some((c) => c.id === 'autonomy-ref:docs/CONSTITUTION.md')).toBe(false);
  });
});

// TA.1 — the content gate: a DECLARED vision/constitution role file that EXISTS but still carries the
// shipped template's `REPLACE THIS` marker is a WARN (never a FAIL — content quality is an agent-judgment
// call OA deliberately leaves open, unlike the file's mere existence, covered by the FAIL suite above).
describe('buildPreflightReport — content gate: WARN on an unedited vision/constitution template (TA.1)', () => {
  const installWithManifest = (manifestYml: string, files: Record<string, string> = {}): string => {
    const dir = mkdtempSync(join(tmpdir(), 'preflight-content-gate-'));
    mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
    writeFileSync(join(dir, '.open-autonomy', 'autonomy.yml'), manifestYml);
    for (const [rel, content] of Object.entries(files)) {
      mkdirSync(join(dir, rel, '..'), { recursive: true });
      writeFileSync(join(dir, rel), content);
    }
    return dir;
  };

  test('a declared constitution role whose file still has the REPLACE THIS marker WARNs, and never contributes to `missing`/readiness', () => {
    const dir = installWithManifest('documents:\n  roles:\n    constitution: docs/CONSTITUTION.md\n', {
      'docs/CONSTITUTION.md': '# Constitution\n\n<!-- REPLACE THIS for your project. -->\nBuild the best <your product>.\n',
    });
    const report = buildPreflightReport({ root: dir });
    const check = report.checks.find((c) => c.id === 'content-gate:docs/CONSTITUTION.md');
    expect(check?.status).toBe('warn');
    expect(check?.message).toBe('WARN: docs/CONSTITUTION.md is an unedited template (REPLACE THIS marker present)');
    // `ready`/exit code is driven ONLY by 'fail' statuses (buildPreflightReport's `missing` filter) — a
    // 'warn' must never appear in `missing`, regardless of how many unrelated REQUIRED_FILES this bare
    // fixture is missing (this fixture isn't a full green install; other checks legitimately fail here).
    expect(report.missing).not.toContain('content-gate:docs/CONSTITUTION.md');
  });

  test('a declared vision role whose file still has the REPLACE THIS marker WARNs too', () => {
    const dir = installWithManifest('documents:\n  roles:\n    vision: docs/VISION.md\n', {
      'docs/VISION.md': '# Vision\n\n<!-- REPLACE THIS for your project. -->\n',
    });
    const report = buildPreflightReport({ root: dir });
    const check = report.checks.find((c) => c.id === 'content-gate:docs/VISION.md');
    expect(check?.status).toBe('warn');
    expect(check?.message).toContain('REPLACE THIS marker present');
  });

  test('after the marker is replaced with real content, the warning is gone', () => {
    const dir = installWithManifest('documents:\n  roles:\n    constitution: docs/CONSTITUTION.md\n', {
      'docs/CONSTITUTION.md': '# Constitution\n\nBuild the absolute best rocket-delivery platform on Earth.\n',
    });
    const report = buildPreflightReport({ root: dir });
    expect(report.checks.some((c) => c.id === 'content-gate:docs/CONSTITUTION.md')).toBe(false);
    expect(report.checks.find((c) => c.id === 'autonomy-ref:docs/CONSTITUTION.md')?.status).toBe('pass');
  });

  test('a declared role whose file is MISSING gets no content-gate WARN (that is the FAIL suite\'s job, not this one\'s — no double-reporting)', () => {
    const dir = installWithManifest('documents:\n  roles:\n    vision: docs/VISION.md\n');
    const report = buildPreflightReport({ root: dir });
    expect(report.checks.some((c) => c.id === 'content-gate:docs/VISION.md')).toBe(false);
    expect(report.checks.find((c) => c.id === 'autonomy-ref:docs/VISION.md')?.status).toBe('fail');
  });

  test('a declared roadmap role is never content-gated, even with the marker present (machine-groomed, not authored content)', () => {
    const dir = installWithManifest('documents:\n  roles:\n    vision: docs/VISION.md\n    roadmap: plans/roadmap.yml\n', {
      'docs/VISION.md': '# Vision\nReal content, no marker.\n',
      'plans/roadmap.yml': '# REPLACE THIS placeholder roadmap\n',
    });
    const report = buildPreflightReport({ root: dir });
    expect(report.checks.some((c) => c.id === 'content-gate:plans/roadmap.yml')).toBe(false);
  });

  test('a profile with no documents block emits neither warn nor fail from the content gate', () => {
    // (other REQUIRED_FILES / autonomy-ref checks legitimately fail against this bare fixture — e.g.
    // GOVERNANCE_DOCS's default `constitution` guess is always existence-checked, declared or not. That's
    // pre-existing, unrelated behavior; the content gate's only job here is to stay silent because no
    // `documents.roles` were DECLARED at all — `config.documentRoles` is empty, per open-autonomy-config.ts.)
    const dir = installWithManifest('agents: {}\n');
    const report = buildPreflightReport({ root: dir });
    expect(report.checks.some((c) => c.id.startsWith('content-gate:'))).toBe(false);
    // docs/VISION.md specifically has no GOVERNANCE_DOCS default guess (open-autonomy-config.test.ts), so
    // an undeclared vision role is never referenced at all — a clean negative control for "undeclared".
    expect(report.checks.some((c) => c.id.startsWith('autonomy-ref:docs/VISION.md'))).toBe(false);
  });
});

describe('the CLI writes its --out into a directory that does not exist yet (BL-27 dev/03)', () => {
  test('a bare run mkdir -ps the output parent instead of crashing ENOENT', () => {
    const dir = mkdtempSync(join(tmpdir(), 'preflight-mkdir-'));
    try {
      writeFileSync(join(dir, 'AGENTS.md'), '# agents\n');
      writeFileSync(join(dir, 'VERSION'), '0.0.0\n');
      mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
      writeFileSync(join(dir, '.open-autonomy', 'autonomy.yml'), 'agents: {}\n');
      writeFileSync(join(dir, 'open-autonomy-upgrade-cli.ts'), '');
      mkdirSync(join(dir, 'scripts'), { recursive: true });
      writeFileSync(join(dir, 'scripts', 'open-autonomy-upgrade-cli.ts'), '');
      const outPath = join(dir, 'nested', 'does', 'not', 'exist', 'preflight.json');
      const r = Bun.spawnSync(
        ['bun', join(import.meta.dir, 'open-autonomy-preflight.ts'), '--root', dir, '--out', outPath],
        { stdout: 'pipe', stderr: 'pipe' },
      );
      expect(existsSync(outPath)).toBe(true);
      expect(JSON.parse(readFileSync(outPath, 'utf8')).schema).toBe('open-autonomy.preflight.v1');
      void r; // exit code may be 78 (not-ready) — this test only cares that the write succeeded
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
