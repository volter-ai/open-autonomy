#!/usr/bin/env bun
import { execFileSync } from 'node:child_process';

// Hands-free setup for a live testbed repo (docs/LIVE_TESTING_STRATEGY.md, Pillar 1).
// Chains: provision repo/vars/labels/branch-protection -> verify the model-proxy admin secret ->
// seed every scenario -> run preflight. Each step is idempotent and reports clearly; the only
// unavoidable manual action is setting MODEL_PROXY_ADMIN_TOKEN, which is reported, not performed.

export interface BootstrapStep {
  id: string;
  describe: string;
}

export function bootstrapSteps(): BootstrapStep[] {
  return [
    { id: 'provision', describe: 'create repo and reconcile variables, labels, branch protection' },
    { id: 'secret-check', describe: 'verify MODEL_PROXY_ADMIN_TOKEN is set (manual if missing)' },
    { id: 'seed', describe: 'create every testbed scenario issue' },
    { id: 'preflight', describe: 'run Open Autonomy Preflight and require ready' },
  ];
}

interface Options {
  repo: string;
  source: string;
  private: boolean;
  seed: boolean;
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  return {
    repo: value('--repo') ?? 'volter-ai/open-autonomy-testbed',
    source: value('--source') ?? 'examples/testbed',
    private: !argv.includes('--public'),
    seed: !argv.includes('--no-seed'),
  };
}

function run(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] });
}

function tryRun(cmd: string, args: string[]): { ok: boolean; out: string } {
  try {
    return { ok: true, out: execFileSync(cmd, args, { encoding: 'utf8' }) };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string };
    return { ok: false, out: String(err.stdout ?? err.stderr ?? error) };
  }
}

function secretPresent(repo: string): boolean {
  const result = tryRun('gh', ['secret', 'list', '-R', repo, '--json', 'name']);
  if (!result.ok) return false;
  return (JSON.parse(result.out) as Array<{ name: string }>).some((s) => s.name === 'MODEL_PROXY_ADMIN_TOKEN');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  process.stdout.write(`Bootstrapping testbed ${options.repo}\n`);

  process.stdout.write('\n[1/4] provision\n');
  run('bun', ['scripts/provision-target-repo.ts', '--repo', options.repo, '--source', options.source, ...(options.private ? ['--private'] : [])]);

  process.stdout.write('\n[2/4] secret-check\n');
  if (secretPresent(options.repo)) {
    process.stdout.write('MODEL_PROXY_ADMIN_TOKEN is set.\n');
  } else {
    process.stdout.write(`MANUAL: set the proxy admin token, then re-run:\n  gh secret set MODEL_PROXY_ADMIN_TOKEN -R ${options.repo}\nStopping before seed/preflight until the secret exists.\n`);
    process.exit(75);
  }

  if (options.seed) {
    process.stdout.write('\n[3/4] seed\n');
    run('bun', [`${options.source}/scripts/testbed-seed-issues.ts`, '--apply', '--all', '--repo', options.repo]);
  } else {
    process.stdout.write('\n[3/4] seed skipped (--no-seed)\n');
  }

  process.stdout.write('\n[4/4] preflight\n');
  run('gh', ['workflow', 'run', 'Open Autonomy Preflight', '-R', options.repo]);
  process.stdout.write('Preflight dispatched. Check the run with: gh run list -R ' + options.repo + ' --workflow "Open Autonomy Preflight"\n');
  process.stdout.write('\nBootstrap complete.\n');
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
