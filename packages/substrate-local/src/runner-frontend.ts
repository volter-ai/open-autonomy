// The LOCAL substrate's agent-facing Runner seam — the same interface the agents import on github
// (`launch`/`list`), but realized through the local loop's launch adapter (run-agent.mjs → the vendored
// TermfleetRunner) instead of `gh workflow run`. The agent code is identical across substrates; only
// THIS file differs. Tasks/artifact stay on gh regardless of substrate — the runner is the one seam.
//
// Emitted verbatim by compileLocal next to the agent ticks as `scheduler/scripts/runner.ts`, so an
// agent's `import { launch } from './runner.js'` resolves to it.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export interface LaunchParams {
  [key: string]: string | number;
}
export interface RunInfo {
  id: string;
  status: string;
  conclusion: string | null;
  title: string;
}

// run-agent.mjs / autonomy-runner.mjs live one level up, in <base>/scripts/ (this file is in
// <base>/scheduler/scripts/).
const scriptsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts');

/** Launch an agent with forwarded params (agent:launch) — a local termfleet session, not a gh dispatch. */
export async function launch(agent: string, params: LaunchParams = {}): Promise<void> {
  const names = Object.keys(params);
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    AUTONOMY_AGENT: agent,
    // run-agent forwards env names listed here to the runner as --key value params.
    AUTONOMY_FORWARD: [process.env.AUTONOMY_FORWARD, ...names].filter(Boolean).join(','),
    ...Object.fromEntries(names.map((k) => [k, String(params[k])])),
  };
  spawnSync('node', [join(scriptsDir, 'run-agent.mjs')], { stdio: 'inherit', env });
}

/** List an agent's running sessions (agent:list) via the local runner backend. */
export async function list(agent: string, _limit = 50): Promise<RunInfo[]> {
  const r = spawnSync('node', [join(scriptsDir, 'autonomy-runner.mjs'), 'list'], { encoding: 'utf8' });
  let sessions: Array<{ id: string; agent: string; status: string }> = [];
  try {
    sessions = JSON.parse(r.stdout || '[]');
  } catch {
    /* no sessions / backend unavailable */
  }
  return sessions
    .filter((s) => s.agent === agent)
    .map((s) => ({ id: s.id, status: s.status, conclusion: null, title: s.agent }));
}
