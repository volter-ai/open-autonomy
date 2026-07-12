// Mode-switch proof for scripts/reconcile-merged-issues.ts: ONE file must behave as the legacy GitHub-
// issue-closer when no `.volter/tracker-config.json` exists, and as the (retired-CLI, helpers-only)
// committed-store implementation when it does — decided at RUNTIME (existsSync), never at compile time.
import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AGENT_ISSUE_BRANCH,
  alreadyReconciled,
  isCommittedStoreMode,
  parseStoreState,
  reconcileOne,
  type MergedPr,
  type ReconcileShell,
} from './reconcile-merged-issues';

const REPO_ROOT = join(import.meta.dir, '..');

const installWith = (tracker: boolean): string => {
  const root = mkdtempSync(join(tmpdir(), 'reconcile-'));
  if (tracker) {
    mkdirSync(join(root, '.volter'), { recursive: true });
    writeFileSync(join(root, '.volter', 'tracker-config.json'), '{"preset":"simple-gh-sdlc"}');
  }
  return root;
};

describe('isCommittedStoreMode — the mode-switch itself', () => {
  test('no .volter/tracker-config.json => legacy mode', () => {
    expect(isCommittedStoreMode(installWith(false))).toBe(false);
  });

  test('.volter/tracker-config.json present => committed-store mode', () => {
    expect(isCommittedStoreMode(installWith(true))).toBe(true);
  });
});

describe('AGENT_ISSUE_BRANCH — widened to a ztrack store id, not digit-only', () => {
  test('matches a bare numeric id (legacy-shaped) and a store id (letters/digits/dashes)', () => {
    expect(AGENT_ISSUE_BRANCH.exec('agent/issue-42')?.[1]).toBe('42');
    expect(AGENT_ISSUE_BRANCH.exec('agent/issue-COMBO-9')?.[1]).toBe('COMBO-9');
    expect(AGENT_ISSUE_BRANCH.exec('agent/issue-LOCAL-41')?.[1]).toBe('LOCAL-41');
  });

  test('does not match a non-issue-bound branch (e.g. a bare agent proposal, or a flip branch)', () => {
    expect(AGENT_ISSUE_BRANCH.test('agent/ir-strategist-abc')).toBe(false);
    expect(AGENT_ISSUE_BRANCH.test('flip/COMBO-9')).toBe(false);
  });
});

describe('parseStoreState / alreadyReconciled — idempotency predicate (pure, no disk)', () => {
  const done = (sha: string) => `---\nstate: "done"\nstateType: "completed"\n---\nPR: ${sha}\n`;
  const inReview = `---\nstate: "in-review"\nstateType: "in_progress"\n---\nPR: agent/issue-COMBO-9\n`;

  test('a done store with the matching merge sha is already reconciled', () => {
    const sha = 'a'.repeat(40);
    expect(parseStoreState(done(sha))).toEqual({ state: 'done', prUrl: sha });
    expect(alreadyReconciled(done(sha), sha)).toBe(true);
  });

  test('a done store with a DIFFERENT (stale) PR value is NOT already reconciled — must still patch', () => {
    const sha = 'a'.repeat(40);
    const stale = 'b'.repeat(40);
    expect(alreadyReconciled(done(stale), sha)).toBe(false);
  });

  test('an in-review store is never already-reconciled regardless of its PR value', () => {
    expect(alreadyReconciled(inReview, 'a'.repeat(40))).toBe(false);
  });
});

describe('reconcileOne — committed-store injected-shell path', () => {
  const pr = (over: Partial<MergedPr> = {}): MergedPr => ({
    number: 7,
    headRefName: 'agent/issue-COMBO-9',
    mergeCommit: { oid: 'c'.repeat(40) },
    ...over,
  });

  function fakeShell(store: { text: string | null }, over: Partial<ReconcileShell> = {}): ReconcileShell {
    return {
      gh: () => '',
      ghAllowFail: () => '',
      git: () => '',
      ztrack: () => ({ ok: true, out: '' }),
      readStore: () => store.text,
      commit: () => true,
      ...over,
    };
  }

  test('no-match for a branch that is not agent/issue-*', () => {
    const store = { text: null };
    const result = reconcileOne(pr({ headRefName: 'flip/COMBO-9' }), 'o/r', fakeShell(store));
    expect(result.action).toBe('no-match');
  });

  test('no-sha when the PR has no mergeCommit', () => {
    const store = { text: null };
    const result = reconcileOne(pr({ mergeCommit: null }), 'o/r', fakeShell(store));
    expect(result.action).toBe('no-sha');
  });

  test('no-store-file when the store has no file for this id', () => {
    const store = { text: null };
    const result = reconcileOne(pr(), 'o/r', fakeShell(store));
    expect(result.action).toBe('no-store-file');
  });

  test('already-reconciled short-circuits before touching ztrack', () => {
    const sha = pr().mergeCommit!.oid;
    const store = { text: `---\nstate: "done"\nstateType: "completed"\n---\nPR: ${sha}\n` };
    let ztrackCalled = false;
    const shell = fakeShell(store, { ztrack: () => { ztrackCalled = true; return { ok: true, out: '' }; } });
    const result = reconcileOne(pr(), 'o/r', shell);
    expect(result.action).toBe('already-reconciled');
    expect(ztrackCalled).toBe(false);
  });

  test('flips: patches + edits ztrack, commits, and reports action=flipped', () => {
    const store = { text: '---\nstate: "in-review"\nstateType: "in_progress"\n---\nPR: agent/issue-COMBO-9\n' };
    const afterText = '---\nstate: "done"\nstateType: "completed"\n---\nPR: cccccccccccccccccccccccccccccccccccccccc\n';
    let patchArgs: string[] = [];
    let editArgs: string[] = [];
    let committed = false;
    const shell = fakeShell(store, {
      ztrack: (args) => {
        if (args[0] === 'issue' && args[1] === 'patch') { patchArgs = args; store.text = afterText; }
        if (args[0] === 'issue' && args[1] === 'edit') editArgs = args;
        return { ok: true, out: '' };
      },
      commit: () => { committed = true; return true; },
      ghAllowFail: () => '', // no numeric intake issue for a store-id branch anyway
    });
    const result = reconcileOne(pr(), 'o/r', shell);
    expect(result.action).toBe('flipped');
    expect(patchArgs).toContain('COMBO-9');
    expect(editArgs).toEqual(['issue', 'edit', 'COMBO-9', '--state', 'done']);
    expect(committed).toBe(true);
  });

  test('patch-failed surfaces loudly when ztrack patch fails, never silently treated as done', () => {
    const store = { text: '---\nstate: "in-review"\n---\nPR: x\n' };
    const shell = fakeShell(store, { ztrack: () => ({ ok: false, out: 'boom' }) });
    const result = reconcileOne(pr(), 'o/r', shell);
    expect(result.action).toBe('patch-failed');
  });

  test('unchanged when ztrack commands report ok but the store file text is identical before/after', () => {
    const store = { text: '---\nstate: "in-review"\n---\nPR: x\n' };
    const shell = fakeShell(store, { ztrack: () => ({ ok: true, out: '' }) }); // readStore always returns same text
    const result = reconcileOne(pr(), 'o/r', shell);
    expect(result.action).toBe('unchanged');
  });
});

// --- CLI-level mode-switch proof: the actual `import.meta.main` entrypoint takes the right branch. ---
// A fake `gh`/`git` on PATH means neither branch ever touches the real network — legacy mode's gh calls
// resolve to a controlled, empty JSON response; committed-store mode's retirement path exits before any
// shell call happens at all.
function withFakeGh(root: string): string {
  const binDir = join(root, 'fakebin');
  mkdirSync(binDir, { recursive: true });
  writeFileSync(
    join(binDir, 'gh'),
    '#!/bin/sh\ncase "$*" in\n  *"issue list"*) echo "[]" ;;\n  *"pr list"*) echo "[]" ;;\n  *) echo "[]" ;;\nesac\n',
    { mode: 0o755 },
  );
  return `${binDir}:${process.env.PATH}`;
}

function runReconcileCli(root: string): { exitCode: number; stdout: string; stderr: string } {
  const r = Bun.spawnSync(['bun', join(REPO_ROOT, 'scripts', 'reconcile-merged-issues.ts')], {
    cwd: root,
    env: { ...process.env, PATH: withFakeGh(root), GITHUB_REPOSITORY: 'o/r' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return { exitCode: r.exitCode, stdout: r.stdout.toString('utf8'), stderr: r.stderr.toString('utf8') };
}

describe('CLI mode-switch — the actual entrypoint branches on tracker-config.json presence', () => {
  test('legacy mode (no tracker-config.json): runs the direct gh issue-close sweep, exits 0', () => {
    const root = installWith(false);
    const r = runReconcileCli(root);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/reconcile: \d+ issue\(s\) closed/);
    // Never the store-mode retirement error.
    expect(r.stderr).not.toContain('RETIRED as a direct CLI entrypoint');
  });

  test('committed-store mode (tracker-config.json present): loud retirement error, exits non-zero, never pushes', () => {
    const root = installWith(true);
    const r = runReconcileCli(root);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain('RETIRED as a direct CLI entrypoint for committed-store installs');
    expect(r.stderr).toContain('scripts/flip-done.ts');
    // Never falls through to the legacy issue-close sweep.
    expect(r.stdout).not.toMatch(/issue\(s\) closed/);
  });
});
