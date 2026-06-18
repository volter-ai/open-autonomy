#!/usr/bin/env bun
import { execFileSync } from 'node:child_process';

// Hands-free setup for a self-driving testbed: a repo whose only human-seeded artifact is the
// constitution. The committed source (examples/self-driving-testbed) is a scaffold of
// templates/self-driving-repo with an empty roadmap and a provisioning manifest — no scenario
// issues. The bootstrap provisions the repo, verifies the admin-token secret, and dispatches the
// strategist to generate the first roadmap. The strategist then proposes, the strategy reviewer
// ratifies, and the loop executes. The only manual step is setting MODEL_PROXY_ADMIN_TOKEN.
//
// Keep the source in sync with the template with:
//   bun scripts/open-autonomy-upgrade.ts --template templates/self-driving-repo \
//     --target examples/self-driving-testbed --apply

export interface BootstrapStep {
  id: string;
  describe: string;
}

export function selfDrivingBootstrapSteps(): BootstrapStep[] {
  return [
    { id: 'provision', describe: 'create repo and reconcile variables, labels, branch protection' },
    { id: 'secret-check', describe: 'verify MODEL_PROXY_ADMIN_TOKEN is set (manual if missing)' },
    { id: 'strategist', describe: 'dispatch the strategist to generate the first roadmap' },
  ];
}

interface Options {
  repo: string;
  source: string;
  private: boolean;
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const repo = value('--repo');
  if (!repo) throw new Error('Usage: bun scripts/bootstrap-self-driving-testbed.ts --repo owner/name [--public]');
  return { repo, source: value('--source') ?? 'examples/self-driving-testbed', private: !argv.includes('--public') };
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
  process.stdout.write(`Bootstrapping self-driving testbed ${options.repo}\n`);

  process.stdout.write('\n[1/3] provision\n');
  run('bun', ['scripts/provision-target-repo.ts', '--repo', options.repo, '--source', options.source, ...(options.private ? ['--private'] : [])]);

  process.stdout.write('\n[2/3] secret-check\n');
  if (secretPresent(options.repo)) {
    process.stdout.write('MODEL_PROXY_ADMIN_TOKEN is set.\n');
  } else {
    process.stdout.write(`MANUAL: set the proxy admin token, then re-run:\n  gh secret set MODEL_PROXY_ADMIN_TOKEN -R ${options.repo}\nStopping before the strategist runs until the secret exists.\n`);
    process.exit(75);
  }

  process.stdout.write('\n[3/3] dispatch strategist\n');
  run('gh', ['workflow', 'run', 'open-autonomy-strategist.yml', '-R', options.repo, '-f', 'apply=true']);
  process.stdout.write(`Strategist dispatched. Watch: gh run list -R ${options.repo} --workflow "Open Autonomy Strategist"\n`);
  process.stdout.write('\nBootstrap complete. The repo will now propose, ratify, and execute its own roadmap.\n');
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
