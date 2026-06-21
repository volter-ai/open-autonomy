#!/usr/bin/env node
// The autonomy runner (substrate primitive), vendored into this profile.
// Its entire knowledge is: agents, running agents, and their lifecycle. It knows nothing about
// what an agent does or what it works on — no "issues", no states like "ready"/"in progress",
// no domain at all. That lives entirely in the agents (skills) and the profile's scripts.
//
// This is a plain-JS port of open-autonomy's packages/core/src/runner.ts (TermfleetRunner) +
// packages/core/src/cli.ts. Keep the two in sync; this file is the local-loop runner backend.
//
//   launch <agent> [--k v ...]  ·  get <id>  ·  list  ·  update <id> --status <s>  ·  cancel <id>
//
// `launch` accepts arbitrary --key value params and passes them through verbatim; the system never
// interprets them (a profile gives them meaning, e.g. a ztrack-using profile declares ZTRACK_ISSUE).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { RUNNER_DEFAULTS } from './runner-defaults.mjs';

// Real local backend: drives termfleet. The window name IS the agent; the system never encodes
// anything else into it. Defaults come from the substrate-owned RUNNER_DEFAULTS; TERMFLEET_* override.
export class TermfleetRunner {
  cli = process.env.TERMFLEET_CLI || RUNNER_DEFAULTS.cli;
  model = process.env.TERMFLEET_AGENT || RUNNER_DEFAULTS.harness; // claude|codex — the model, not our agent
  // No hardcoded provider URL: with TERMFLEET_PROVIDER_URL unset we pass NO --url
  // and let termfleet resolve a provider itself (env -> `termfleet use` context ->
  // live local auto-discovery). The old baked-in default is the crutch that drifted.
  url = process.env.TERMFLEET_PROVIDER_URL;
  get urlArg() {
    return this.url ? `--url ${JSON.stringify(this.url)}` : '';
  }

  launch(agent, params = {}) {
    // Re-export orchestration context so the agent's own nested `autonomy launch ...` reaches this
    // provider, plus the opaque params verbatim (a profile may read e.g. $ZTRACK_ISSUE; the system doesn't).
    const exported = {
      ...Object.fromEntries(
        Object.entries(process.env).filter(([k]) => /^(TERMFLEET_.*|AUTONOMY.*|PATH)$/.test(k)),
      ),
      ...params,
    };
    const setup = Object.entries(exported)
      .map(([k, v]) => `export ${k}=${JSON.stringify(v ?? '')}`)
      .join('; ');
    const promptDir = process.env.AUTONOMY_PROMPT_DIR;
    const promptFile = promptDir ? `${promptDir}/${agent}.txt` : '';
    const promptArg =
      promptFile && existsSync(promptFile)
        ? `--prompt-file ${JSON.stringify(promptFile)}`
        : `--prompt ${JSON.stringify(agent)}`;
    // --name is only a LABEL (which agent). The session IDENTITY is whatever termfleet assigns and
    // RETURNS (terminalId) — the runner RECEIVES it and never invents one, so repeat launches of the
    // same agent get distinct ids instead of colliding.
    const r = spawnSync(
      `${this.cli} ${this.model} new -y ${this.urlArg} --name ${JSON.stringify(agent)} --cwd ${JSON.stringify(process.cwd())} ${promptArg} --setup-command ${JSON.stringify(setup)}`,
      { shell: true, encoding: 'utf8' },
    );
    let created = {};
    try {
      created = JSON.parse(r.stdout);
    } catch {
      /* non-JSON */
    }
    if (!created.terminalId) {
      throw new Error(`termfleet returned no terminalId for agent "${agent}": ${r.stdout || r.stderr}`);
    }
    return {
      id: created.terminalId,
      agent,
      status: 'running',
      ...(created.agentSessionId ? { ref: created.agentSessionId } : {}),
      ...(Object.keys(params).length ? { params } : {}),
    };
  }
  get(id) {
    return this.list().find((s) => s.id === id);
  }
  list() {
    const r = spawnSync(`${this.cli} ${this.model} list ${this.urlArg}`, {
      shell: true,
      encoding: 'utf8',
    });
    if (r.status || !r.stdout.trim()) return [];
    // id = the terminalId termfleet owns; agent = the label we launched it under (the window name).
    return JSON.parse(r.stdout).map((w) => ({ id: w.terminalId, agent: w.name, status: 'running' }));
  }
  update(id, patch) {
    return patch.status === 'cancelled' ? this.cancel(id) : true;
  }
  cancel(id) {
    // id is the terminalId; resolve it to termfleet's numeric window id, then kill that one window.
    const r = spawnSync(`${this.cli} ${this.model} list ${this.urlArg}`, { shell: true, encoding: 'utf8' });
    let windowId;
    try {
      windowId = JSON.parse(r.stdout).find((w) => w.terminalId === id)?.id;
    } catch {
      /* ignore */
    }
    if (windowId === undefined) return false;
    return !spawnSync(`${this.cli} ${this.model} kill ${this.urlArg} --id ${windowId}`, {
      shell: true,
      stdio: 'inherit',
    }).status;
  }
}

function parseParams(args) {
  const params = {};
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

export function runCli(runner, argv) {
  const [cmd, ...rest] = argv;
  const opt = (name) => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : undefined;
  };

  if (cmd === 'launch') {
    const agent = rest[0];
    if (!agent || agent.startsWith('--')) {
      console.error('usage: autonomy launch <agent> [--key value ...]');
      return 2;
    }
    console.log(JSON.stringify(runner.launch(agent, parseParams(rest.slice(1)))));
    return 0;
  }
  if (cmd === 'get') {
    const session = runner.get(rest[0] ?? '');
    if (!session) return 1;
    console.log(JSON.stringify(session));
    return 0;
  }
  if (cmd === 'list') {
    console.log(JSON.stringify(runner.list()));
    return 0;
  }
  if (cmd === 'update') {
    const id = rest[0];
    const status = opt('--status');
    if (!id || !status) {
      console.error('usage: autonomy update <id> --status <running|paused|cancelled|done|failed>');
      return 2;
    }
    return runner.update(id, { status }) ? 0 : 1;
  }
  if (cmd === 'cancel') {
    const id = rest[0];
    if (!id) {
      console.error('usage: autonomy cancel <id>');
      return 2;
    }
    return runner.cancel(id) ? 0 : 1;
  }
  console.error('usage: autonomy <launch|get|list|update|cancel>');
  return 2;
}

// Entrypoint: the local-loop substrate runner is termfleet. One concrete runner, no selection switch.
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(runCli(new TermfleetRunner(), process.argv.slice(2)));
}
