// The github surface of the Runner contract (the `agent:*` capability axis). Agents express INTENT —
// "launch the developer for issue N", "list the developer's runs" — and how github realizes that
// (workflow_dispatch via gh) is hidden here. A different substrate ships a different runner.ts with the
// same interface (e.g. a termfleet launch); the agent code does not change. Tasks/artifact stay on gh
// regardless of substrate — the runner is the one true substrate seam.
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
