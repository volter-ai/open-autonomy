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
