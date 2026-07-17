// AC9: disposable real-git proof. No Twin checkout, model, provider, or external network is involved.
import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { materialize, parseIr } from '@open-autonomy/core';
import { compileLocal } from '@open-autonomy/substrate-local';
import { activateAcceptedGeneration, readActivationState } from './activation.ts';
import { superviseActivation } from './activation-supervisor.ts';

const tmps: string[] = [];
afterEach(() => {
  for (const path of tmps.splice(0)) rmSync(path, { recursive: true, force: true });
});

function git(cwd: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

const IR = `schema: autonomy.ir.v1
targets: [local]
codeHost: github
agents:
  tick:
    behavior: scripts/tick.ts
    capabilities: []
    triggers:
      - { cron: "*/30 * * * *" }
policy:
  box: {}
resources:
  - scripts/tick.ts
`;

function writeProfileAndCompile(repo: string, irText = IR): void {
  const profile = join(repo, 'profiles', 'activation-test');
  mkdirSync(join(profile, 'scripts'), { recursive: true });
  writeFileSync(join(profile, 'ir.yml'), irText);
  writeFileSync(
    join(profile, 'scripts', 'tick.ts'),
    "import { writeFileSync } from 'node:fs'; writeFileSync('ACTIVATION_TICK_FIRED', 'unsafe resume');\n",
  );
  const ir = parseIr(irText);
  const output = compileLocal(ir, { destDir: repo });
  materialize(output, repo, (from) => readFileSync(join(profile, from), 'utf8'));
}

describe('atomic activation — disposable live proof', () => {
  test('accepted N→N+1 activates and cold-starts; a later invalid accepted generation is rejected', async () => {
    const root = mkdtempSync(join(tmpdir(), 'oa243-live-'));
    tmps.push(root);
    const remote = join(root, 'remote.git');
    const repo = join(root, 'repo');
    mkdirSync(repo);
    mkdirSync(remote);
    git(remote, ['init', '--bare', '-q']);
    git(repo, ['init', '-q', '-b', 'main']);
    git(repo, ['config', 'user.email', 'oa243-live@example.invalid']);
    git(repo, ['config', 'user.name', 'oa243-live']);
    writeProfileAndCompile(repo);
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-qm', 'accepted N']);
    git(repo, ['remote', 'add', 'origin', remote]);
    git(repo, ['push', '-qu', 'origin', 'main']);
    git(remote, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
    git(repo, ['fetch', '-q', 'origin']);
    git(repo, ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main']);
    const cli = spawnSync('node', [join(import.meta.dir, 'bin', 'oa.ts'), 'activate', '--profile', 'profiles/activation-test', '--poll-ms', '1000'], {
      cwd: repo,
      encoding: 'utf8',
    });
    expect(cli.status).toBe(0);
    expect(cli.stdout).toContain('[oa] activate: activated');
    const first = readActivationState(repo);
    const n = first.active!.sha;

    git(repo, ['checkout', '-qb', 'candidate-harmless']);
    writeFileSync(join(repo, 'profiles', 'activation-test', 'ir.yml'), `${IR}\n# harmless accepted profile comment\n`);
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-qm', 'harmless autonomy change']);
    git(repo, ['checkout', '-q', 'main']);
    git(repo, ['merge', '--no-ff', '-qm', 'accept harmless autonomy change', 'candidate-harmless']);
    git(repo, ['push', '-q', 'origin', 'main']);

    // The resident supervisor observes the accepted update, switches automatically, and cold-starts the
    // REAL reconciler from N+1. The preserved central pause means no tick fires.
    const controller = new AbortController();
    const activated: string[] = [];
    await superviseActivation({
      cwd: repo,
      signal: controller.signal,
      pollMs: 10,
      onActive: (sha) => {
        activated.push(sha);
        controller.abort();
      },
    });
    const second = readActivationState(repo);
    expect(second.active?.sha).not.toBe(n);
    expect(second.draining.map((generation) => generation.sha)).toContain(n);
    expect(activated).toEqual([second.active!.sha]);
    expect(() => readFileSync(join(second.active!.root, 'ACTIVATION_TICK_FIRED'))).toThrow();

    git(repo, ['checkout', '-qb', 'candidate-invalid']);
    writeFileSync(join(repo, 'profiles', 'activation-test', 'ir.yml'), 'schema: definitely.invalid\n');
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-qm', 'deliberately invalid autonomy generation']);
    git(repo, ['checkout', '-q', 'main']);
    git(repo, ['merge', '--no-ff', '-qm', 'accept invalid fixture generation', 'candidate-invalid']);
    git(repo, ['push', '-q', 'origin', 'main']);

    const invalid = await activateAcceptedGeneration({ cwd: repo });
    expect(invalid.ok).toBe(false);
    expect(invalid.action).toBe('rejected');
    expect(invalid.state.active?.sha).toBe(second.active?.sha);
    expect(invalid.state.lastFailed?.reason).toMatch(/schema|parse|invalid/i);
    expect(readActivationState(repo).active?.sha).toBe(second.active?.sha);
  }, 60_000);
});
