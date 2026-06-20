#!/usr/bin/env bun
import { cpSync, mkdtempSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

// Hands-free setup for a live scenario testbed (docs/LIVE_TESTING_STRATEGY.md, Pillar 1).
// The installation is SCAFFOLDED by compiling profiles/self-driving (so it can never drift from
// canonical), then the testbed's repo-owned + scenario seed is overlaid; then provision -> verify the
// model-proxy admin secret -> seed every [oa-test:*] scenario issue -> preflight. Each step is
// idempotent. The only unavoidable manual action is setting MODEL_PROXY_ADMIN_TOKEN (reported, not done).

export interface BootstrapStep {
  id: string;
  describe: string;
}

export function bootstrapSteps(): BootstrapStep[] {
  return [
    { id: 'scaffold', describe: 'compile profiles/self-driving (generic machinery) into a build dir' },
    { id: 'overlay', describe: 'overlay the testbed seed (constitution, roadmap, scenarios, provision)' },
    { id: 'provision', describe: 'create repo and reconcile content, variables, labels, branch protection' },
    { id: 'secret-check', describe: 'verify MODEL_PROXY_ADMIN_TOKEN is set (manual if missing)' },
    { id: 'seed', describe: 'create every testbed scenario issue' },
    { id: 'preflight', describe: 'run Open Autonomy Preflight and require ready' },
  ];
}

// The testbed-specific seed overlaid onto the scaffolded installation (relative paths). Everything
// else (skills, workflows, runtime, rubrics, standards, package.json) comes from compile(self-driving).
const OVERLAY_FILES = [
  'provision.json',
  '.open-autonomy/roadmap.yml',
  '.open-autonomy/autonomy.yml',
  'docs/CONSTITUTION.md',
  'docs/PROJECT.md',
  'docs/ROADMAP.md',
  'docs/ISSUE_SCENARIOS.md',
  'docs/LIVE_TESTING_STRATEGY.md',
  'docs/TEST_MATRIX.md',
  'docs/TEST_RUNS.md',
  'README.md',
  'scripts/testbed-seed-issues.ts',
];

interface Options {
  repo: string;
  seed: string;
  private: boolean;
  doSeed: boolean;
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  return {
    repo: value('--repo') ?? 'volter-ai/open-autonomy-testbed',
    seed: resolve(value('--seed') ?? 'examples/testbed'),
    private: !argv.includes('--public'),
    doSeed: !argv.includes('--no-seed'),
  };
}

function run(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] });
}

function secretPresent(repo: string): boolean {
  try {
    const out = execFileSync('gh', ['secret', 'list', '-R', repo, '--json', 'name'], { encoding: 'utf8' });
    return (JSON.parse(out) as Array<{ name: string }>).some((s) => s.name === 'MODEL_PROXY_ADMIN_TOKEN');
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  process.stdout.write(`Bootstrapping scenario testbed ${options.repo}\n`);

  process.stdout.write('\n[1/6] scaffold installation (compile profiles/self-driving)\n');
  const build = mkdtempSync(join(tmpdir(), 'oa-testbed-'));
  run('bun', ['scripts/scaffold-target-repo.ts', '--target', build, '--force']);

  process.stdout.write('\n[2/6] overlay testbed seed\n');
  for (const rel of OVERLAY_FILES) {
    mkdirSync(dirname(join(build, rel)), { recursive: true });
    cpSync(join(options.seed, rel), join(build, rel));
  }
  process.stdout.write(`overlaid ${OVERLAY_FILES.length} seed files into ${build}\n`);

  process.stdout.write('\n[3/6] provision\n');
  run('bun', ['scripts/provision-target-repo.ts', '--repo', options.repo, '--source', build, '--force-content', ...(options.private ? ['--private'] : [])]);

  process.stdout.write('\n[4/6] secret-check\n');
  if (secretPresent(options.repo)) {
    process.stdout.write('MODEL_PROXY_ADMIN_TOKEN is set.\n');
  } else {
    process.stdout.write(`MANUAL: set the proxy admin token, then re-run:\n  gh secret set MODEL_PROXY_ADMIN_TOKEN -R ${options.repo}\nStopping before seed/preflight until the secret exists.\n`);
    process.exit(75);
  }

  if (options.doSeed) {
    process.stdout.write('\n[5/6] seed\n');
    run('bun', [join(build, 'scripts/testbed-seed-issues.ts'), '--apply', '--all', '--repo', options.repo]);
  } else {
    process.stdout.write('\n[5/6] seed skipped (--no-seed)\n');
  }

  process.stdout.write('\n[6/6] preflight\n');
  run('gh', ['workflow', 'run', 'Open Autonomy Preflight', '-R', options.repo]);
  process.stdout.write(`Preflight dispatched. Check: gh run list -R ${options.repo} --workflow "Open Autonomy Preflight"\n`);
  process.stdout.write('\nBootstrap complete.\n');
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
