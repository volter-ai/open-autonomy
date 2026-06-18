#!/usr/bin/env bun
import { cpSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Hands-free setup for a self-driving testbed: a repo whose only human-seeded artifact is the
// constitution. Control files come from templates/self-driving-repo (scaffold); this overlays the
// constitution-only seed (empty roadmap + provision manifest) and provisions. No scenario issues
// are seeded — the strategist generates the first roadmap. The one unavoidable manual step is
// setting MODEL_PROXY_ADMIN_TOKEN, which is reported, not performed.

export interface BootstrapStep {
  id: string;
  describe: string;
}

export function selfDrivingBootstrapSteps(): BootstrapStep[] {
  return [
    { id: 'scaffold', describe: 'copy templates/self-driving-repo into a build dir' },
    { id: 'overlay', describe: 'overlay the constitution-only seed (empty roadmap + provision manifest)' },
    { id: 'provision', describe: 'create repo and reconcile variables, labels, branch protection' },
    { id: 'secret-check', describe: 'verify MODEL_PROXY_ADMIN_TOKEN is set (manual if missing)' },
    { id: 'strategist', describe: 'dispatch the strategist to generate the first roadmap' },
  ];
}

interface Options {
  repo: string;
  seed: string;
  template: string;
  private: boolean;
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const repo = value('--repo');
  if (!repo) throw new Error('Usage: bun scripts/bootstrap-self-driving-testbed.ts --repo owner/name [--public]');
  return {
    repo,
    seed: value('--seed') ?? 'examples/self-driving-testbed',
    template: value('--template') ?? 'templates/self-driving-repo',
    private: !argv.includes('--public'),
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
  process.stdout.write(`Bootstrapping self-driving testbed ${options.repo}\n`);

  process.stdout.write('\n[1/5] scaffold\n');
  const build = mkdtempSync(join(tmpdir(), 'self-driving-'));
  run('bun', ['scripts/scaffold-target-repo.ts', '--target', build, '--force']);

  process.stdout.write('\n[2/5] overlay constitution-only seed\n');
  const seed = resolve(options.seed);
  cpSync(join(seed, '.open-autonomy', 'roadmap.yml'), join(build, '.open-autonomy', 'roadmap.yml'));
  cpSync(join(seed, 'provision.json'), join(build, 'provision.json'));
  process.stdout.write(`overlaid empty roadmap + provision manifest into ${build}\n`);

  process.stdout.write('\n[3/5] provision\n');
  run('bun', ['scripts/provision-target-repo.ts', '--repo', options.repo, '--source', build, ...(options.private ? ['--private'] : [])]);

  process.stdout.write('\n[4/5] secret-check\n');
  if (secretPresent(options.repo)) {
    process.stdout.write('MODEL_PROXY_ADMIN_TOKEN is set.\n');
  } else {
    process.stdout.write(`MANUAL: set the proxy admin token, then re-run:\n  gh secret set MODEL_PROXY_ADMIN_TOKEN -R ${options.repo}\nStopping before the strategist runs until the secret exists.\n`);
    process.exit(75);
  }

  process.stdout.write('\n[5/5] dispatch strategist\n');
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
