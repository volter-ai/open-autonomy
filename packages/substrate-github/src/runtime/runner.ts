// The github surface of the Runner contract (the `agent:*` capability axis). Agents express INTENT —
// "launch the developer for issue N", "list the developer's runs" — and how github realizes that
// (workflow_dispatch via gh) is hidden here. A different substrate ships a different runner.ts with the
// same interface (e.g. a termfleet launch); the agent code does not change. Tasks/artifact stay on gh
// regardless of substrate — the runner is the one true substrate seam.
//
// It is BOTH a module (import { launch, list }) and a uniform agent-facing CLI so a prose orchestrator
// (the PM) dispatches a worker the SAME way on every substrate, with no `gh`/`termfleet` knowledge:
//   bun scripts/runner.ts launch <agent> --ref <work-item>   # dispatch a worker on demand
//   bun scripts/runner.ts list   <agent>                     # its in-flight/recent runs (JSON)
// `--ref` is the work item (the `subject.ref` source); github realizes it as the `issue_number` dispatch
// input. Extra `--key value` pairs are forwarded verbatim.
import { $ } from 'bun';
import { existsSync, readFileSync } from 'node:fs';

export interface LaunchParams {
  [key: string]: string | number;
}
export interface RunInfo {
  id: number;
  status: string;
  conclusion: string | null;
  title: string;
}

// Resolve a logical agent name to its launchable unit (the github workflow file) from the manifest.
function workflowFile(agent: string): string {
  const path = '.open-autonomy/autonomy.yml';
  const manifest = existsSync(path)
    ? (Bun.YAML.parse(readFileSync(path, 'utf8')) as { agents?: Record<string, { workflowFile?: string }> })
    : {};
  const file = manifest.agents?.[agent]?.workflowFile;
  if (!file) throw new Error(`runner: no launchable unit for agent "${agent}" (no workflowFile in the manifest)`);
  return file;
}

/** Launch an agent with forwarded params (agent:launch). */
export async function launch(agent: string, params: LaunchParams = {}): Promise<void> {
  const file = workflowFile(agent);
  const ref = process.env.GITHUB_REF_NAME || 'main';
  const fields = Object.entries(params).flatMap(([k, v]) => ['-f', `${k}=${v}`]);
  await $`gh workflow run ${file} --ref ${ref} ${fields}`.nothrow();
}

/** List an agent's recent runs (agent:list). */
export async function list(agent: string, limit = 50): Promise<RunInfo[]> {
  const file = workflowFile(agent);
  const raw = await $`gh run list --workflow ${file} --limit ${String(limit)} --json databaseId,status,conclusion,displayTitle`
    .nothrow()
    .text();
  try {
    return (JSON.parse(raw || '[]') as Array<{ databaseId: number; status: string; conclusion: string | null; displayTitle: string }>).map(
      (r) => ({ id: r.databaseId, status: r.status, conclusion: r.conclusion, title: r.displayTitle }),
    );
  } catch {
    return [];
  }
}

// --- the uniform agent-facing CLI (same surface on every substrate) ---
function parseFlags(args: string[]): LaunchParams {
  const params: LaunchParams = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a?.startsWith('--')) {
      const key = a.slice(2);
      const next = args[i + 1];
      params[key] = next && !next.startsWith('--') ? (i++, next) : 'true';
    }
  }
  return params;
}

export async function runCli(argv: string[]): Promise<number> {
  const [cmd, agent, ...rest] = argv;
  if (!cmd || !agent || agent.startsWith('--')) {
    console.error('usage: runner.ts <launch|list> <agent> [--ref <work-item>] [--key value ...]');
    return 2;
  }
  if (cmd === 'launch') {
    const flags = parseFlags(rest);
    // `--ref` is the work item (`subject.ref`); on github that is the `issue_number` dispatch input.
    if ('ref' in flags) {
      flags.issue_number = flags.ref;
      delete flags.ref;
    }
    await launch(agent, flags);
    return 0;
  }
  if (cmd === 'list') {
    console.log(JSON.stringify(await list(agent)));
    return 0;
  }
  console.error(`runner.ts: unknown command "${cmd}"`);
  return 2;
}

if (import.meta.main) process.exit(await runCli(process.argv.slice(2)));
