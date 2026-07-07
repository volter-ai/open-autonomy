// OA-03: agents launched with `--branch` run in git WORKTREES, which materialize only COMMITTED files.
// An uncommitted (or partially committed) harness used to be a SILENT failure: the scheduler ticked
// "successfully", the PM launched workers, and every worker died instantly inside its tmux session with
// `Unknown command: /develop` — nothing at the scheduler/runner level ever saw it (the dead session reads
// as 'done'). This guard refuses the tick up front, naming the exact uncommitted paths from
// `.open-autonomy/generated.json` (the compile's own, authoritative output footprint).
//
// These tests drive the REAL EMITTED `scheduler/run.mjs` (not a helper function) against a real git
// fixture — spawning `node scheduler/run.mjs --once` in a scaffolded temp repo, exactly like
// scheduler-termfleet-guard.test.ts does for the guard just above this one in the loop driver.
import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { compileLocal } from './emit';
import type { AutonomyIR, CompileOutput } from '@open-autonomy/core';

// A script-only cron agent (`sweep`) keeps `needsRunner` false, so the pre-existing termfleet guard
// (scheduler-termfleet-guard.test.ts) never fires here and can't mask what THIS guard does. A second
// agent (`develop`, dispatch-triggered — no cron) is a prose skill: compileLocal still copies its
// SKILL.md to `.claude/skills/develop/` and `.codex/skills/develop/` (copies aren't scoped to cron
// agents), giving the manifest a realistic skill path to name — the exact one cited in the audit finding
// (`Unknown command: /develop`).
const ir: AutonomyIR = {
  schema: 'autonomy.ir.v1',
  targets: ['local'],
  agents: {
    sweep: { behavior: 'scripts/sweep.ts', capabilities: ['tasks:converse'], triggers: [{ cron: '*/15 * * * *' }] },
    develop: { behavior: 'develop', capabilities: ['tasks:converse'], triggers: [{ dispatch: true }] },
  },
  policy: { box: {} },
  resources: [],
};

function git(dir: string, args: string[]) {
  return spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
}

// Writes every manifest-listed file (out.generated + out.copies' `to` paths) onto disk, plus the
// non-generated `scripts/sweep.ts` the schedule shells out to (a profile-owned script compileLocal never
// emits content for — mirrors scheduler-termfleet-guard.test.ts's own scaffold). Returns the temp dir; the
// caller owns cleanup.
function scaffold(compiled: CompileOutput): string {
  const dir = mkdtempSync(join(tmpdir(), 'oa-harness-guard-'));
  for (const [path, content] of Object.entries(compiled.generated)) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  for (const copy of compiled.copies) {
    const full = join(dir, copy.to);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, `# stub SKILL.md for ${copy.to}\n`);
  }
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  writeFileSync(join(dir, 'scripts', 'sweep.ts'), 'console.log("swept");\n');
  return dir;
}

function initGitRepo(dir: string) {
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'oa03-test@example.com']);
  git(dir, ['config', 'user.name', 'OA-03 test']);
}

function runOnce(dir: string, env: Record<string, string> = {}) {
  return spawnSync('node', ['scheduler/run.mjs', '--once'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

describe('scheduler/run.mjs --once — the uncommitted-harness guard (OA-03)', () => {
  test('AC-1: uncommitted harness -> the tick refuses, naming the paths + the exact remediation + the docs anchor', () => {
    const out = compileLocal(ir);
    const dir = scaffold(out);
    try {
      initGitRepo(dir);
      git(dir, ['commit', '-q', '--allow-empty', '-m', 'base']); // a repo exists, but NOTHING of the harness is committed
      const r = runOnce(dir);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('.claude/skills/develop/SKILL.md');
      expect(r.stderr).toContain('scheduler/run.mjs');
      expect(r.stderr).toContain('git add <the paths above>');
      expect(r.stderr).toContain('git commit -m "Install the open-autonomy harness"');
      expect(r.stderr).toContain('docs/OPERATIONS.md#local-runner-quickstart');
      expect(r.stderr).toContain('Unknown command: /develop');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('AC-2: partially committed harness -> refuses, naming ONLY the still-uncommitted paths', () => {
    const out = compileLocal(ir);
    const dir = scaffold(out);
    try {
      initGitRepo(dir);
      git(dir, ['commit', '-q', '--allow-empty', '-m', 'base']);
      // Commit scripts/ + scheduler/ + .open-autonomy/ (per the spec's AC-2 setup); leave .claude/ /
      // .codex/ uncommitted.
      git(dir, ['add', 'scripts/', 'scheduler/', '.open-autonomy/']);
      git(dir, ['commit', '-q', '-m', 'partial']);
      const r = runOnce(dir);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('.claude/skills/develop/SKILL.md');
      expect(r.stderr).toContain('.codex/skills/develop/SKILL.md');
      // The committed paths must NOT be named as uncommitted.
      expect(r.stderr).not.toContain('scheduler/run.mjs');
      expect(r.stderr).not.toContain('.open-autonomy/generated.json');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('AC-3 (regression): fully committed harness -> the tick proceeds silently (guard never fires)', () => {
    const out = compileLocal(ir);
    const dir = scaffold(out);
    try {
      initGitRepo(dir);
      git(dir, ['add', '-A']);
      git(dir, ['commit', '-q', '-m', 'harness']);
      const r = runOnce(dir);
      expect(r.status).toBe(0);
      expect(r.stderr).not.toContain('the open-autonomy harness is not');
      expect(r.stderr).not.toContain('Unknown command: /develop');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('AC-4: non-git directory -> no crash, no false refusal', () => {
    const out = compileLocal(ir);
    const dir = scaffold(out);
    // deliberately no `git init` — this is not a repo at all.
    expect(existsSync(join(dir, '.git'))).toBe(false);
    try {
      const r = runOnce(dir);
      expect(r.status).toBe(0);
      expect(r.stderr).not.toContain('the open-autonomy harness is not');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('AC-4b: git repo but no generated.json (legacy install) -> no-ops, no crash', () => {
    const out = compileLocal(ir);
    const dir = scaffold(out);
    try {
      initGitRepo(dir);
      git(dir, ['commit', '-q', '--allow-empty', '-m', 'base']);
      rmSync(join(dir, '.open-autonomy', 'generated.json'), { force: true });
      const r = runOnce(dir);
      expect(r.status).toBe(0);
      expect(r.stderr).not.toContain('the open-autonomy harness is not');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Blocker 1 (panel): `git status --porcelain -- <files>` silently OMITS gitignored files, so a harness
  // path matched by .gitignore used to false-pass the guard — reintroducing the exact silent zombie this
  // guard exists to stop (the worktree won't contain a gitignored-untracked file either). Two semantics:
  // (a) untracked-and-ignored -> REFUSE, named under a distinct "gitignored" section with `git add -f`
  // remediation; (b) tracked-but-matching-an-ignore-pattern (previously `git add -f`ed and committed) ->
  // CLEAN, because worktrees materialize tracked files regardless of ignore rules.
  test('B1a: gitignored harness paths -> refuses, naming them as gitignored with `git add -f` remediation', () => {
    const out = compileLocal(ir);
    const dir = scaffold(out);
    try {
      initGitRepo(dir);
      writeFileSync(join(dir, '.gitignore'), '.claude/\n');
      git(dir, ['add', '-A']); // stages everything EXCEPT the ignored .claude/
      git(dir, ['commit', '-q', '-m', 'harness-minus-ignored']);
      const r = runOnce(dir);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('gitignored');
      expect(r.stderr).toContain('.claude/skills/develop/SKILL.md'); // the exact file, not a collapsed '.claude/'
      expect(r.stderr).toContain('git add -f');
      // The committed paths are NOT named.
      expect(r.stderr).not.toContain('scheduler/run.mjs');
      expect(r.stderr).not.toContain('.codex/skills/develop/SKILL.md');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('B1b: tracked-but-ignore-matching harness (`git add -f` + commit) -> clean, guard silent', () => {
    const out = compileLocal(ir);
    const dir = scaffold(out);
    try {
      initGitRepo(dir);
      writeFileSync(join(dir, '.gitignore'), '.claude/\n');
      git(dir, ['add', '-A']);
      git(dir, ['add', '-f', '.claude/']); // stage past the ignore rule — the guard's own remediation
      git(dir, ['commit', '-q', '-m', 'harness']);
      const r = runOnce(dir);
      expect(r.status).toBe(0);
      expect(r.stderr).not.toContain('the open-autonomy harness is not');
      expect(r.stderr).not.toContain('gitignored');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('AC-5: AUTONOMY_ALLOW_UNCOMMITTED_HARNESS=1 warns (same path list) but proceeds', () => {
    const out = compileLocal(ir);
    const dir = scaffold(out);
    try {
      initGitRepo(dir);
      git(dir, ['commit', '-q', '--allow-empty', '-m', 'base']); // dirty harness, nothing committed
      const r = runOnce(dir, { AUTONOMY_ALLOW_UNCOMMITTED_HARNESS: '1' });
      expect(r.status).toBe(0);
      expect(r.stderr).toContain('WARNING');
      expect(r.stderr).toContain('AUTONOMY_ALLOW_UNCOMMITTED_HARNESS=1');
      expect(r.stderr).toContain('.claude/skills/develop/SKILL.md');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
