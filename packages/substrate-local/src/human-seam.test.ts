// BL-28: the LOCAL realization of the human seam (kind:human actors). Two layers, matching the house
// pattern (spec-example.test.ts / scheduler-termfleet-guard.test.ts): (1) compileLocal's kind-awareness —
// a human is declared but never scheduled/prompted; (2) the emitted scripts/runner.ts's THIRD launch
// route — spawned as a REAL subprocess against a scaffolded install, exactly as an adopter would run it,
// so this exercises the actual shipped bytes, not a hand test double.
import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AutonomyIR } from '@open-autonomy/core';
import { compileLocal } from './emit';

describe('compileLocal — kind:human is DECLARED, never EXECUTED', () => {
  const ir: AutonomyIR = {
    schema: 'autonomy.ir.v1',
    targets: ['local'],
    agents: {
      requester: { behavior: 'scripts/request.ts', capabilities: ['agent:launch'], triggers: [{ cron: '*/15 * * * *' }] },
      // Deliberately carries a cron too — the guard must exclude a human from the schedule even then; a
      // real profile declares `dispatch: true` only (see profiles/hello-human), but nothing in the IR
      // FORBIDS a human from carrying a cron, so compileLocal must not trust that it never will.
      approver: { kind: 'human', behavior: 'approver', capabilities: ['tasks:converse', 'code:review'], triggers: [{ cron: '*/15 * * * *' }] },
    },
    policy: { box: {} },
    resources: [],
  };
  const out = compileLocal(ir);

  test('a human is excluded from scheduler/schedule.json even though it carries a cron', () => {
    const schedule = JSON.parse(out.generated['scheduler/schedule.json']) as { scripts: string[] };
    expect(schedule.scripts.some((s) => s.includes('request.ts'))).toBe(true); // the script agent IS scheduled
    expect(schedule.scripts.some((s) => s.includes('approver'))).toBe(false); // the human is NOT
  });

  test('a human gets no launch prompt (no harness to invoke)', () => {
    expect(Object.keys(out.generated)).not.toContain('scripts/prompts/claude/approver.txt');
    expect(Object.keys(out.generated)).not.toContain('scripts/prompts/codex/approver.txt');
  });

  test("a human's SKILL.md IS still copied — doctrine for the person, mirroring compileGithub", () => {
    expect(out.copies).toContainEqual({ from: 'skills/approver/SKILL.md', to: '.codex/skills/approver/SKILL.md' });
    expect(out.copies).toContainEqual({ from: 'skills/approver/SKILL.md', to: '.claude/skills/approver/SKILL.md' });
  });

  test('the manifest still declares the human actor (kind: human, dispatch round-trips)', () => {
    expect(out.generated['.open-autonomy/autonomy.yml']).toContain('kind: human');
  });
});

describe('the emitted scripts/runner.ts — the human route (a REAL subprocess against a scaffolded install)', () => {
  const runtimeIr: AutonomyIR = {
    schema: 'autonomy.ir.v1',
    targets: ['local'],
    agents: {
      approver: { kind: 'human', behavior: 'approver', capabilities: ['tasks:converse', 'code:review'], triggers: [{ dispatch: true }] },
    },
    policy: { box: {} },
    resources: [],
  };

  function scaffold(): string {
    const out = compileLocal(runtimeIr);
    const dir = mkdtempSync(join(tmpdir(), 'oa-human-seam-'));
    mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    writeFileSync(join(dir, '.open-autonomy', 'autonomy.yml'), out.generated['.open-autonomy/autonomy.yml']);
    writeFileSync(join(dir, 'scripts', 'runner.ts'), out.generated['scripts/runner.ts']);
    return dir;
  }
  const runner = (dir: string, args: string[], env?: Record<string, string>) =>
    spawnSync('bun', ['scripts/runner.ts', ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });
  const lastJson = <T>(stdout: string): T => JSON.parse(stdout.trim().split('\n').pop() ?? '{}') as T;

  test('launch PARKS a session (status running), engages (console + attention file), and never auto-completes', () => {
    const dir = scaffold();
    try {
      const r = runner(dir, ['launch', 'approver', '--ask', 'approve the change', '--completion', '/agent approve']);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('HUMAN ENGAGE: approver');
      expect(r.stdout).toContain('approve the change');
      const session = lastJson<{ id: string; agent: string; status: string; note?: string }>(r.stdout);
      expect(session.agent).toBe('approver');
      expect(session.status).toBe('running'); // parked, not done
      expect(session.note).toContain('bookkeeping only');
      expect(session.note).toContain('/agent approve');

      const attention = readFileSync(join(dir, '.open-autonomy', 'runner-state', 'human-attention.md'), 'utf8');
      expect(attention).toContain('approve the change');
      expect(attention).toContain(`runner.ts update ${session.id} --status done`);

      // re-reading (list/get) never shows it auto-completed — the only path to done is an external update.
      const listed = lastJson<Array<{ id: string; status: string }>>(runner(dir, ['list', 'approver']).stdout);
      expect(listed.map((s) => s.id)).toContain(session.id);
      expect(listed.find((s) => s.id === session.id)?.status).toBe('running');
      const got = lastJson<{ status: string }>(runner(dir, ['get', session.id]).stdout);
      expect(got.status).toBe('running');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('an operator-configured engage command hook receives the session JSON on stdin (black-box, optional)', () => {
    const dir = scaffold();
    try {
      const r = runner(dir, ['launch', 'approver', '--ask', 'need a repro'], { AUTONOMY_HUMAN_ENGAGE_CMD: 'cat > engage-hook.json' });
      expect(r.status).toBe(0);
      const hooked = JSON.parse(readFileSync(join(dir, 'engage-hook.json'), 'utf8')) as { agent: string; params?: { ask?: string } };
      expect(hooked.agent).toBe('approver');
      expect(hooked.params?.ask).toBe('need a repro');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('update <id> --status done is the only path to terminal, and resumes the flow (list drops it)', () => {
    const dir = scaffold();
    try {
      const session = lastJson<{ id: string }>(runner(dir, ['launch', 'approver', '--ask', 'ship it']).stdout);
      const updateResult = runner(dir, ['update', session.id, '--status', 'done']);
      expect(updateResult.status).toBe(0);
      const got = lastJson<{ status: string }>(runner(dir, ['get', session.id]).stdout);
      expect(got.status).toBe('done');
      const listed = lastJson<Array<{ id: string }>>(runner(dir, ['list', 'approver']).stdout);
      expect(listed.map((s) => s.id)).not.toContain(session.id); // resolved, no longer in-flight
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('cancel retracts a parked ask', () => {
    const dir = scaffold();
    try {
      const session = lastJson<{ id: string }>(runner(dir, ['launch', 'approver', '--ask', 'never mind']).stdout);
      const cancelResult = runner(dir, ['cancel', session.id]);
      expect(cancelResult.status).toBe(0);
      const got = lastJson<{ status: string }>(runner(dir, ['get', session.id]).stdout);
      expect(got.status).toBe('cancelled');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
