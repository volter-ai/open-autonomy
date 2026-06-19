#!/usr/bin/env bun
import { cpSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Hands-free setup for a self-driving testbed: a repo whose only human-seeded artifact is the
// constitution. The testbed is a script that USES the machinery — it scaffolds an installation
// (scaffold-target-repo, which compiles profiles/self-driving onto the github substrate) and
// overlays a thin product seed (examples/self-driving-testbed: constitution, empty roadmap, research
// sources, provision manifest), then provisions. No scenario issues are seeded; the strategist
// generates the first roadmap. The only manual step is setting MODEL_PROXY_ADMIN_TOKEN.

export interface BootstrapStep {
  id: string;
  describe: string;
}

export function selfDrivingBootstrapSteps(): BootstrapStep[] {
  return [
    { id: 'scaffold', describe: 'compile profiles/self-driving (generic machinery) into a build dir' },
    { id: 'overlay', describe: 'overlay the thin product seed (constitution, empty roadmap, sources, manifest)' },
    { id: 'provision', describe: 'create repo and reconcile content, variables, labels, branch protection' },
    { id: 'strategist', describe: 'dispatch the strategist to generate the first roadmap' },
  ];
}

// Files the product seed overlays onto the scaffolded template (relative paths).
const OVERLAY_FILES = [
  'docs/CONSTITUTION.md',
  '.open-autonomy/roadmap.yml',
  '.open-autonomy/strategist-sources.json',
  'provision.json',
];

interface Options {
  repo: string;
  seed: string;
  private: boolean;
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const repo = value('--repo');
  if (!repo) throw new Error('Usage: bun scripts/bootstrap-self-driving-testbed.ts --repo owner/name [--public]');
  return { repo, seed: resolve(value('--seed') ?? 'examples/self-driving-testbed'), private: !argv.includes('--public') };
}

function run(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] });
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  process.stdout.write(`Bootstrapping self-driving testbed ${options.repo}\n`);

  process.stdout.write('\n[1/4] scaffold template (generic machinery)\n');
  const build = mkdtempSync(join(tmpdir(), 'self-driving-'));
  run('bun', ['scripts/scaffold-target-repo.ts', '--target', build, '--force']);

  process.stdout.write('\n[2/4] overlay product seed\n');
  for (const rel of OVERLAY_FILES) {
    cpSync(join(options.seed, rel), join(build, rel));
  }
  process.stdout.write(`overlaid ${OVERLAY_FILES.length} seed files into ${build}\n`);

  process.stdout.write('\n[3/4] provision\n');
  run('bun', ['scripts/provision-target-repo.ts', '--repo', options.repo, '--source', build, '--force-content', ...(options.private ? ['--private'] : [])]);

  // No per-repo secret needed: the repo's workflows mint and revoke model-proxy runs via GitHub
  // OIDC. Ensure the repo's public-agent workflow is in the proxy's OIDC allowlist (operator step).
  process.stdout.write('\n[4/4] dispatch strategist\n');
  run('gh', ['workflow', 'run', 'open-autonomy-strategist.yml', '-R', options.repo, '-f', 'apply=true']);
  process.stdout.write(`Strategist dispatched. Watch: gh run list -R ${options.repo} --workflow "Open Autonomy Strategist"\n`);
  process.stdout.write('\nBootstrap complete (hands-free). The repo will now propose, ratify, and execute its own roadmap.\n');
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
