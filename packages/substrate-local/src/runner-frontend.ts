// The LOCAL substrate's agent-facing Runner seam — the same interface the agents import on github
// (`launch`/`list`), realized through the local loop instead of `gh workflow run`. The agent code is
// identical across substrates; only THIS file differs. Tasks/artifact stay on gh regardless of
// substrate — the runner is the one seam.
//
// Like the github seam it is BOTH a module and a uniform agent-facing CLI, so a prose orchestrator (the
// PM) dispatches a worker the SAME way on every substrate:
//   bun scripts/runner.ts launch <agent> --ref <work-item>   # dispatch a worker on demand
//   bun scripts/runner.ts list   <agent>                     # its in-flight sessions (JSON)
// `--ref` is the work item (the `subject.ref` source); locally it is forwarded under the worker's OWN
// declared param name (e.g. ZTRACK_ISSUE) resolved from the manifest. Extra `--key value` pairs pass through.
//
// Two launch realizations, mirroring github's script-vs-skill split (a deterministic job vs the codex
// wrapper):
//   - a SCRIPT agent (behavior is a .ts/.mjs/.js) → run it via bun, with its declared trigger params
//     resolved from the launch params into env (the local analogue of github's workflow env mapping);
//   - a SKILL agent → a termfleet session via the launch adapter (run-agent.mjs → TermfleetRunner).
//
// Emitted verbatim by compileLocal as scripts/runner.ts so an agent's `import './runner.js'` resolves.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
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

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const isScript = (behavior: string): boolean => /\.(ts|mjs|js)$/.test(behavior);

interface ManifestAgent {
  skill?: string;
  params?: Record<string, string>;
}
function manifestAgent(agent: string): ManifestAgent {
  const path = '.open-autonomy/autonomy.yml';
  if (!existsSync(path)) return {};
  const m = Bun.YAML.parse(readFileSync(path, 'utf8')) as { agents?: Record<string, ManifestAgent> };
  return m.agents?.[agent] ?? {};
}

/** Launch an agent with forwarded params (agent:launch). */
export async function launch(agent: string, params: LaunchParams = {}): Promise<void> {
  const { skill: behavior = '', params: declared = {} } = manifestAgent(agent);

  if (behavior && isScript(behavior)) {
    // Deterministic agent: run its script via bun. Resolve its declared trigger params from the launch
    // params — the launch's `issue_number` is the subject.ref (the work item); other documented sources
    // (subject.text/actor/…) are not available on a programmatic launch, so they resolve empty.
    const env: Record<string, string> = { ...(process.env as Record<string, string>) };
    for (const [name, source] of Object.entries(declared)) {
      env[name] = source === 'subject.ref' ? String(params.issue_number ?? '') : '';
    }
    spawnSync('bun', [behavior], { stdio: 'inherit', env });
    return;
  }

  // Skill agent: a termfleet session via the launch adapter (forwards params verbatim).
  const names = Object.keys(params);
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    AUTONOMY_AGENT: agent,
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

// --- the uniform agent-facing CLI (same surface as the github seam) ---
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
    // `--ref` is the work item (`subject.ref`); locally we forward it under the target's OWN declared
    // param name (the param whose source is `subject.ref`), so the worker reads e.g. $ZTRACK_ISSUE.
    if ('ref' in flags) {
      const { params: declared = {} } = manifestAgent(agent);
      const refParam = Object.entries(declared).find(([, src]) => src === 'subject.ref')?.[0];
      if (refParam) flags[refParam] = flags.ref;
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
