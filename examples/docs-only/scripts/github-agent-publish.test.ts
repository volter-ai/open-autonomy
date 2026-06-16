import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { writeJson, type AgentBundleManifest } from './public-agent-bundle.js';
import { makeDecision, writeDecision } from './public-agent-decision.js';

const root = join(import.meta.dir, '..');

function runPublish(args: string[], cwd = root): ReturnType<typeof spawnSync> {
  return spawnSync('bun', ['scripts/github-agent-publish.ts', ...args], {
    cwd,
    encoding: 'utf8',
  });
}

function initRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), 'agent-publish-repo-'));
  spawnSync('git', ['init'], { cwd: repo });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd: repo });
  writeFileSync(join(repo, 'README.md'), 'hello\n');
  spawnSync('git', ['add', 'README.md'], { cwd: repo });
  spawnSync('git', ['commit', '-m', 'init'], { cwd: repo });
  return repo;
}

function makeBundle(patch: string, overrides: Partial<AgentBundleManifest> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'agent-bundle-'));
  mkdirSync(join(dir, 'artifacts'), { recursive: true });
  mkdirSync(join(dir, 'decisions'), { recursive: true });
  writeFileSync(join(dir, 'session.json'), JSON.stringify({ status: overrides.status ?? 'pr-ready' }));
  writeFileSync(join(dir, 'run-receipt.json'), JSON.stringify({ schema: 'volter.agent.run_receipt.v1', run_id: 'run_test' }));
  writeFileSync(join(dir, 'transcript.md'), '# Transcript\n');
  writeFileSync(join(dir, 'changes.patch'), patch);
  writeFileSync(join(dir, 'artifacts', 'result.json'), '{}\n');
  const decisionPath = writeDecision(join(dir, 'decisions'), makeDecision({
    stage: 'develop',
    issue: 42,
    run_id: 'run_test',
    actor: 'octocat',
    decision: overrides.status ?? 'pr-ready',
    evidence: ['session:session.json'],
    next_action: 'publish',
  }, new Date('2026-06-16T00:00:00.000Z')));
  const decisionRel = `decisions/${decisionPath.split('/').pop()}`;
  const manifest: AgentBundleManifest = {
    schema_version: 1,
    run_id: 'run_test',
    repo: 'volter/twin',
    issue: 42,
    actor: 'octocat',
    status: 'pr-ready',
    created_at: new Date().toISOString(),
    session: 'session.json',
    run_receipt: 'run-receipt.json',
    transcript: 'transcript.md',
    patch: 'changes.patch',
    decisions: [decisionRel],
    artifacts: ['artifacts/result.json'],
    evidence: [{ path: 'artifacts/result.json', kind: 'artifact', media_type: 'application/json' }],
    ...overrides,
  };
  writeJson(join(dir, 'manifest.json'), manifest);
  return dir;
}

describe('github-agent-publish', () => {
  test('validates and applies a safe patch', () => {
    const repo = initRepo();
    writeFileSync(join(repo, 'README.md'), 'hello\nworld\n');
    const patch = spawnSync('git', ['diff', '--binary'], { cwd: repo, encoding: 'utf8' }).stdout;
    spawnSync('git', ['checkout', '--', 'README.md'], { cwd: repo });
    const bundle = makeBundle(patch);

    const result = runPublish(['--bundle', bundle, '--repo', repo, '--apply', '--promote-dir', 'agent-sessions/run_test']);
    expect(result.status).toBe(0);
    expect(readFileSync(join(repo, 'README.md'), 'utf8')).toBe('hello\nworld\n');
    expect(readFileSync(join(repo, 'agent-sessions', 'run_test', 'manifest.json'), 'utf8')).toContain('"run_id": "run_test"');
    expect(readFileSync(join(repo, 'agent-sessions', 'run_test', 'run-receipt.json'), 'utf8')).toContain('volter.agent.run_receipt.v1');
    expect(readFileSync(join(repo, 'agent-sessions', 'run_test', 'transcript.md'), 'utf8')).toContain('# Transcript');
    const promotedDecision = readdirSync(join(repo, 'agent-sessions', 'run_test', 'decisions')).find((name) => name.startsWith('develop-dec_'));
    expect(promotedDecision).toBeTruthy();
    expect(readFileSync(join(repo, 'agent-sessions', 'run_test', 'decisions', promotedDecision!), 'utf8')).toContain('"stage": "develop"');
    expect(readFileSync(join(bundle, 'pr-body.md'), 'utf8')).toContain('Closes #42');
    expect(readFileSync(join(bundle, 'pr-body.md'), 'utf8')).toContain('Decision files: 1');
  });

  test('rejects workflow edits', () => {
    const repo = initRepo();
    mkdirSync(join(repo, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(repo, '.github', 'workflows', 'ci.yml'), 'name: ci\n');
    spawnSync('git', ['add', '.github/workflows/ci.yml'], { cwd: repo });
    spawnSync('git', ['commit', '-m', 'workflow'], { cwd: repo });
    writeFileSync(join(repo, '.github', 'workflows', 'ci.yml'), 'name: owned\n');
    const patch = spawnSync('git', ['diff', '--binary'], { cwd: repo, encoding: 'utf8' }).stdout;
    const bundle = makeBundle(patch);

    const result = runPublish(['--bundle', bundle, '--repo', repo]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('may not edit GitHub workflows');
  });

  test('rejects secret-looking patch content', () => {
    const repo = initRepo();
    writeFileSync(join(repo, 'README.md'), 'sk_live_abcdefghijklmnop\n');
    const patch = spawnSync('git', ['diff', '--binary', '--', 'README.md'], { cwd: repo, encoding: 'utf8' }).stdout;
    const bundle = makeBundle(patch);

    const result = runPublish(['--bundle', bundle, '--repo', repo]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('real-looking secret');
  });

  test('rejects blocked bundles before applying patches', () => {
    const repo = initRepo();
    writeFileSync(join(repo, 'README.md'), 'blocked change\n');
    const patch = spawnSync('git', ['diff', '--binary'], { cwd: repo, encoding: 'utf8' }).stdout;
    spawnSync('git', ['checkout', '--', 'README.md'], { cwd: repo });
    const bundle = makeBundle(patch, { status: 'blocked' });

    const result = runPublish(['--bundle', bundle, '--repo', repo, '--apply']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('status is not pr-ready');
    expect(readFileSync(join(repo, 'README.md'), 'utf8')).toBe('hello\n');
  });

  test('rejects bundle metadata mismatches', () => {
    const repo = initRepo();
    const bundle = makeBundle('');

    const result = runPublish([
      '--bundle', bundle,
      '--repo', repo,
      '--expected-run-id', 'run_other',
      '--expected-repo', 'volter/twin',
      '--expected-issue', '42',
      '--expected-actor', 'octocat',
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('manifest.run_id mismatch');
  });

  test('allows non-workflow repo paths by default', () => {
    const repo = initRepo();
    writeFileSync(join(repo, 'package.json'), '{"scripts":{"test":"echo ok"}}\n');
    spawnSync('git', ['add', 'package.json'], { cwd: repo });
    spawnSync('git', ['commit', '-m', 'package'], { cwd: repo });
    writeFileSync(join(repo, 'package.json'), '{"scripts":{"test":"echo owned"}}\n');
    const patch = spawnSync('git', ['diff', '--binary', '--', 'package.json'], { cwd: repo, encoding: 'utf8' }).stdout;
    spawnSync('git', ['checkout', '--', 'package.json'], { cwd: repo });
    const bundle = makeBundle(patch);

    const result = runPublish(['--bundle', bundle, '--repo', repo, '--apply']);
    expect(result.status).toBe(0);
    expect(readFileSync(join(repo, 'package.json'), 'utf8')).toContain('echo owned');
  });

  test('rejects binary patches', () => {
    const repo = initRepo();
    const patch = [
      'diff --git a/docs/image.png b/docs/image.png',
      'new file mode 100644',
      'index 0000000..1234567',
      'GIT binary patch',
      'literal 1',
      'Ic$@',
      '',
    ].join('\n');
    const bundle = makeBundle(patch);

    const result = runPublish(['--bundle', bundle, '--repo', repo, '--allowed-paths', 'docs/**']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('binary patches are not allowed');
  });

  test('rejects symlink patches', () => {
    const repo = initRepo();
    const patch = [
      'diff --git a/docs/link.md b/docs/link.md',
      'new file mode 120000',
      'index 0000000..1234567',
      '--- /dev/null',
      '+++ b/docs/link.md',
      '@@ -0,0 +1 @@',
      '+README.md',
      '',
    ].join('\n');
    const bundle = makeBundle(patch);

    const result = runPublish(['--bundle', bundle, '--repo', repo, '--allowed-paths', 'docs/**']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('symlinks are not allowed');
  });

  test('rejects unsupported artifact types', () => {
    const repo = initRepo();
    const bundle = makeBundle('');
    writeFileSync(join(bundle, 'artifacts', 'blob.bin'), Buffer.from([0, 1, 2]));
    const manifest = JSON.parse(readFileSync(join(bundle, 'manifest.json'), 'utf8')) as AgentBundleManifest;
    manifest.artifacts.push('artifacts/blob.bin');
    manifest.evidence.push({ path: 'artifacts/blob.bin', kind: 'artifact', media_type: 'application/octet-stream' });
    writeJson(join(bundle, 'manifest.json'), manifest);

    const result = runPublish(['--bundle', bundle, '--repo', repo]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('artifact extension not allowed');
  });

  test('rejects artifact symlinks', () => {
    const repo = initRepo();
    const bundle = makeBundle('');
    symlinkSync(join(bundle, 'session.json'), join(bundle, 'artifacts', 'linked.txt'));
    const manifest = JSON.parse(readFileSync(join(bundle, 'manifest.json'), 'utf8')) as AgentBundleManifest;
    manifest.artifacts.push('artifacts/linked.txt');
    manifest.evidence.push({ path: 'artifacts/linked.txt', kind: 'artifact', media_type: 'text/plain' });
    writeJson(join(bundle, 'manifest.json'), manifest);

    const result = runPublish(['--bundle', bundle, '--repo', repo]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('artifact symlink is not allowed');
  });

  test('rejects evidence entries that do not point at listed artifacts', () => {
    const repo = initRepo();
    const bundle = makeBundle('');
    const manifest = JSON.parse(readFileSync(join(bundle, 'manifest.json'), 'utf8')) as AgentBundleManifest;
    manifest.evidence.push({ path: 'artifacts/missing.webp', kind: 'screenshot', media_type: 'image/webp' });
    writeJson(join(bundle, 'manifest.json'), manifest);

    const result = runPublish(['--bundle', bundle, '--repo', repo]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('evidence path is not a listed artifact');
  });

  test('rejects invalid decision files', () => {
    const repo = initRepo();
    const bundle = makeBundle('');
    const manifest = JSON.parse(readFileSync(join(bundle, 'manifest.json'), 'utf8')) as AgentBundleManifest;
    writeFileSync(join(bundle, 'decisions', 'bad.json'), '{"schema":"wrong"}\n');
    manifest.decisions = ['decisions/bad.json'];
    writeJson(join(bundle, 'manifest.json'), manifest);

    const result = runPublish(['--bundle', bundle, '--repo', repo]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unsupported decision schema');
  });
});
