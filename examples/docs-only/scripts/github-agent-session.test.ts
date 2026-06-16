import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeDecision, writeDecision } from './public-agent-decision.js';

const root = join(import.meta.dir, '..');

function initPatchRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), 'agent-session-patch-repo-'));
  spawnSync('git', ['init'], { cwd: repo });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd: repo });
  writeFileSync(join(repo, 'README.md'), 'clean\n');
  spawnSync('git', ['add', 'README.md'], { cwd: repo });
  spawnSync('git', ['commit', '-m', 'init'], { cwd: repo });
  return repo;
}

describe('github-agent-session', () => {
  test('runs an agent command and emits a validated bundle shape', () => {
    const taskDir = mkdtempSync(join(tmpdir(), 'github-agent-session-test-'));
    const patchRepo = initPatchRepo();
    const issuePath = join(taskDir, 'issue.json');
    const preDecisionDir = join(taskDir, 'pre-decisions');
    mkdirSync(preDecisionDir);
    writeDecision(preDecisionDir, makeDecision({
      stage: 'target',
      issue: 301,
      actor: 'github-actions',
      decision: 'can_develop',
      subject: { type: 'issue', number: 301, branch: 'agent/issue-301' },
      evidence: ['target:target.json'],
      next_action: 'triage',
    }, new Date('2026-06-16T00:00:00.000Z')));
    writeFileSync(issuePath, JSON.stringify({ number: 301, title: 'Session wrapper', body: 'Bundle this.' }));

    const result = spawnSync('bun', [
      'scripts/github-agent-session.ts',
      '--issue', issuePath,
      '--run-id', `run_session_${Date.now()}`,
      '--out', taskDir,
      '--worktree', patchRepo,
      '--repo', 'volter/twin',
      '--actor', 'octocat',
      '--',
      'node',
      '-e',
      [
        "const fs=require('node:fs'),p=require('node:path')",
        "const task=process.env.OSS_AGENT_TASK_DIR",
        "fs.mkdirSync(p.join(task,'artifacts'),{recursive:true})",
        "fs.writeFileSync(p.join(task,'artifacts','result.json'),JSON.stringify({ok:true})+'\\n')",
        "fs.writeFileSync(p.join(task,'artifacts','pr.md'),'# PR\\n')",
        "fs.writeFileSync(p.join(task,'artifacts','transcript.md'),'# Transcript\\n')",
      ].join(';'),
    ], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, PUBLIC_AGENT_PRE_DECISIONS_DIR: preDecisionDir },
    });

    expect(result.status).toBe(0);
    const manifestPath = join(taskDir, 'bundle', 'manifest.json');
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(manifest.schema_version).toBe(1);
    expect(manifest.status).toBe('pr-ready');
    expect(manifest.repo).toBe('volter/twin');
    expect(manifest.run_receipt).toBe('run-receipt.json');
    expect(manifest.transcript).toBe('transcript.md');
    expect(manifest.artifacts).toContain('artifacts/result.json');
    expect(existsSync(join(taskDir, 'bundle', 'run-receipt.json'))).toBe(true);
    expect(readFileSync(join(taskDir, 'bundle', 'transcript.md'), 'utf8')).toContain('# Transcript');
    const receipt = JSON.parse(readFileSync(join(taskDir, 'bundle', 'run-receipt.json'), 'utf8'));
    expect(receipt.schema).toBe('volter.agent.run_receipt.v1');
    expect(receipt.run_id).toBe(manifest.run_id);
    expect(manifest.decisions).toHaveLength(2);
    expect(manifest.decisions).toContainEqual(expect.stringMatching(/^decisions\/target-dec_[a-f0-9]{16}\.json$/));
    expect(manifest.decisions).toContainEqual(expect.stringMatching(/^decisions\/develop-dec_[a-f0-9]{16}\.json$/));
    const decisions = manifest.decisions.map((rel: string) => JSON.parse(readFileSync(join(taskDir, 'bundle', rel), 'utf8')));
    expect(decisions.map((decision: { stage: string }) => decision.stage).sort()).toEqual(['develop', 'target']);
    const develop = decisions.find((decision: { stage: string }) => decision.stage === 'develop');
    expect(develop.schema).toBe('volter.agent.decision.v1');
    expect(develop.issue).toBe(301);
    expect(develop.run_id).toBe(manifest.run_id);
  });

  test('turns secret-looking patch output into a safe blocked bundle', () => {
    const taskDir = mkdtempSync(join(tmpdir(), 'github-agent-session-secret-test-'));
    const patchRepo = initPatchRepo();
    const issuePath = join(taskDir, 'issue.json');
    writeFileSync(issuePath, JSON.stringify({ number: 302, title: 'Secret patch', body: 'Do not leak this.' }));

    const result = spawnSync('bun', [
      'scripts/github-agent-session.ts',
      '--issue', issuePath,
      '--run-id', `run_session_secret_${Date.now()}`,
      '--out', taskDir,
      '--worktree', patchRepo,
      '--repo', 'volter/twin',
      '--actor', 'octocat',
      '--',
      'bash',
      '-lc',
      [
        'printf "anthropic_abcdefghijklmnopqrstuvwxyz\\n" > "$1/LEAK.md"',
        'mkdir -p "$OSS_AGENT_TASK_DIR/artifacts"',
        'printf "{\\"ok\\":true}\\n" > "$OSS_AGENT_TASK_DIR/artifacts/result.json"',
      ].join('; '),
      '_',
      patchRepo,
    ], { cwd: root, encoding: 'utf8' });

    expect(result.status).toBe(0);
    const manifestPath = join(taskDir, 'bundle', 'manifest.json');
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(manifest.status).toBe('blocked');
    expect(manifest.artifacts).toEqual([]);
    expect(readFileSync(join(taskDir, 'bundle', 'changes.patch'), 'utf8')).toBe('');
    const decision = JSON.parse(readFileSync(join(taskDir, 'bundle', manifest.decisions[0]), 'utf8'));
    expect(decision.decision).toBe('blocked');
    expect(decision.failure_signature).toContain('real-looking secret found');
  });
});
