import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeDecision, validateDecision, writeDecision } from './public-agent-decision.js';

const root = join(import.meta.dir, '..');

describe('public-agent-decision', () => {
  test('creates a valid durable decision record', () => {
    const decision = makeDecision({
      stage: 'develop',
      issue: 7,
      run_id: 'run_test',
      actor: 'octocat',
      decision: 'pr-ready',
      reason: 'implementation completed and publisher checks passed',
      subject: { type: 'issue', number: 7, branch: 'agent/issue-7' },
      attempt: { kind: 'develop', index: 1, max: 3 },
      evidence: ['session:session.json'],
      next_action: 'publish',
    }, new Date('2026-06-16T00:00:00.000Z'));

    expect(decision.schema).toBe('volter.agent.decision.v1');
    expect(decision.id).toMatch(/^dec_[a-f0-9]{16}$/);
    expect(decision.reason).toBe('implementation completed and publisher checks passed');
    expect(validateDecision(decision)).toEqual(decision);
  });

  test('redacts real-looking secrets before writing', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'agent-decision-'));
    const decision = makeDecision({
      stage: 'review',
      issue: 9,
      pr: 10,
      actor: 'reviewer',
      decision: 'blocked: ghp_abcdefghijklmnopqrstuvwxyz1234567890 leaked',
      evidence: ['log contains anthropic_abcdefghijklmnopqrstuvwxyz'],
    }, new Date('2026-06-16T00:00:00.000Z'));
    const path = writeDecision(outDir, decision);
    const text = readFileSync(path, 'utf8');

    expect(text).toContain('[redacted]');
    expect(text).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz1234567890');
    expect(text).not.toContain('anthropic_abcdefghijklmnopqrstuvwxyz');
  });

  test('cli writes a decision file', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'agent-decision-cli-'));
    const result = spawnSync('bun', [
      'scripts/public-agent-decision.ts',
      '--stage', 'develop',
      '--issue', '42',
      '--actor', 'octocat',
      '--decision', 'pr-ready',
      '--reason', 'ready to publish',
      '--run-id', 'run_cli',
      '--out-dir', outDir,
      '--created-at', '2026-06-16T00:00:00.000Z',
    ], { cwd: root, encoding: 'utf8' });

    expect(result.status).toBe(0);
    const path = result.stdout.trim().replace(/^decision=/, '');
    expect(existsSync(path)).toBe(true);
    const decision = validateDecision(JSON.parse(readFileSync(path, 'utf8')));
    expect(decision.issue).toBe(42);
    expect(decision.run_id).toBe('run_cli');
    expect(decision.reason).toBe('ready to publish');
  });

  test('rejects invalid stage and issue values', () => {
    expect(() => validateDecision({
      schema: 'volter.agent.decision.v1',
      id: 'dec_123456789abc',
      stage: 'unknown',
      issue: 0,
      actor: 'octocat',
      decision: 'noop',
      evidence: [],
      created_at: '2026-06-16T00:00:00.000Z',
    })).toThrow('decision.stage is invalid');
  });
});
