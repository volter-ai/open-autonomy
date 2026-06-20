// The Runner contract (the `agent:*` capability axis) — the one true substrate seam. Agents express
// INTENT ("launch the developer for issue N", "list its runs"); HOW a substrate realizes that is behind
// this single env-dispatched seam, so the agent code is identical everywhere and ships in one package.
//   - OA_RUNNER=github (default): launch via `gh workflow run`; list via `gh run list`.
//   - OA_RUNNER=local: a script agent runs via `bun <behavior>`; a skill agent is a termfleet session via
//     the install's `scripts/run-agent.mjs`. compileLocal provides run-agent.mjs + autonomy-runner.mjs in
//     the install and sets OA_RUNNER=local; no termfleet dependency lives here.
// Tasks/artifact stay on `gh` regardless of substrate — the runner is the only seam.
import { $ } from 'bun';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const KIND = process.env.OA_RUNNER ?? 'github';

export interface LaunchParams {
  [key: string]: string | number;
}
export interface RunInfo {
  id: number | string;
  status: string;
  conclusion: string | null;
  title: string;
}

interface ManifestAgent {
  skill?: string;
  workflowFile?: string;
  params?: Record<string, string>;
}
function manifestAgent(agent: string): ManifestAgent {
  const path = '.open-autonomy/autonomy.yml';
  if (!existsSync(path)) return {};
  const m = Bun.YAML.parse(readFileSync(path, 'utf8')) as { agents?: Record<string, ManifestAgent> };
  return m.agents?.[agent] ?? {};
}
const isScript = (behavior: string): boolean => /\.(ts|mjs|js)$/.test(behavior);

/** Launch an agent with forwarded params (agent:launch). */
export async function launch(agent: string, params: LaunchParams = {}): Promise<void> {
  return KIND === 'local' ? launchLocal(agent, params) : launchGithub(agent, params);
}

/** List an agent's recent runs/sessions (agent:list). */
export async function list(agent: string, limit = 50): Promise<RunInfo[]> {
  return KIND === 'local' ? listLocal(agent) : listGithub(agent, limit);
}

// --- github: workflow_dispatch via gh ---
function workflowFile(agent: string): string {
  const file = manifestAgent(agent).workflowFile;
  if (!file) throw new Error(`runner: no launchable unit for agent "${agent}" (no workflowFile in the manifest)`);
  return file;
}
async function launchGithub(agent: string, params: LaunchParams): Promise<void> {
  const file = workflowFile(agent);
  const ref = process.env.GITHUB_REF_NAME || 'main';
  const fields = Object.entries(params).flatMap(([k, v]) => ['-f', `${k}=${v}`]);
  await $`gh workflow run ${file} --ref ${ref} ${fields}`.nothrow();
}
async function listGithub(agent: string, limit: number): Promise<RunInfo[]> {
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

// --- local: bun (script) / termfleet session (skill), via the install's adapters at cwd ---
async function launchLocal(agent: string, params: LaunchParams): Promise<void> {
  const { skill: behavior = '', params: declared = {} } = manifestAgent(agent);
  if (behavior && isScript(behavior)) {
    const env: Record<string, string> = { ...(process.env as Record<string, string>) };
    for (const [name, source] of Object.entries(declared)) {
      env[name] = source === 'subject.ref' ? String(params.issue_number ?? '') : '';
    }
    spawnSync('bun', [behavior], { stdio: 'inherit', env });
    return;
  }
  const names = Object.keys(params);
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    AUTONOMY_AGENT: agent,
    AUTONOMY_FORWARD: [process.env.AUTONOMY_FORWARD, ...names].filter(Boolean).join(','),
    ...Object.fromEntries(names.map((k) => [k, String(params[k])])),
  };
  spawnSync('node', ['scripts/run-agent.mjs'], { stdio: 'inherit', env });
}
function listLocal(agent: string): RunInfo[] {
  const r = spawnSync('node', ['scripts/autonomy-runner.mjs', 'list'], { encoding: 'utf8' });
  let sessions: Array<{ id: string; agent: string; status: string }> = [];
  try {
    sessions = JSON.parse(r.stdout || '[]');
  } catch {
    /* no sessions / backend unavailable */
  }
  return sessions.filter((s) => s.agent === agent).map((s) => ({ id: s.id, status: s.status, conclusion: null, title: s.agent }));
}
