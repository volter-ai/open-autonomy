#!/usr/bin/env node
// The autonomy runner (substrate primitive), vendored into this profile. Drives termfleet through its
// SDK (the `termfleet` npm package), not a `termfleet` binary on PATH. Its entire knowledge is: agents,
// running agents, and their lifecycle. It knows nothing about what an agent does or works on — no
// "issues", no states. That lives entirely in the agents (skills) and the profile's scripts.
//
// This is a plain-JS port of @open-autonomy/substrate-local's runner.ts (TermfleetRunner) + the core CLI.
// Keep the two in sync. The install must have `termfleet` (+ `@termfleet/core`) in node_modules.
//
//   launch <agent> [--k v ...]  ·  get <id>  ·  list  ·  update <id> --status <s>  ·  cancel <id>
//
// `launch` accepts arbitrary --key value params and passes them through verbatim; the system never
// interprets them (a profile gives them meaning, e.g. a ztrack-using profile declares ZTRACK_ISSUE).
import { existsSync, readFileSync } from 'node:fs';
import { ProviderClient, providerRefFromUrl } from 'termfleet';
import { resolveDefaultProvider } from '@termfleet/core/local-providers.js';
import { RUNNER_DEFAULTS } from './runner-defaults.mjs';

// Real local backend: drives termfleet via its ProviderClient SDK. The window name IS the agent; the
// system never encodes anything else into it. Defaults come from RUNNER_DEFAULTS; TERMFLEET_* override.
export class TermfleetRunner {
  harness = process.env.TERMFLEET_AGENT || RUNNER_DEFAULTS.harness; // claude|codex|gemini — the coding CLI, not our agent
  #clientPromise;
  #client() {
    return (this.#clientPromise ??= resolveDefaultProvider({ url: process.env.TERMFLEET_PROVIDER_URL }).then(
      (p) => new ProviderClient(providerRefFromUrl(p.baseUrl)),
    ));
  }

  async launch(agent, params = {}) {
    const client = await this.#client();
    // Re-export orchestration context so a nested `autonomy launch ...` reaches this provider, plus the
    // opaque params verbatim (a profile may read e.g. $ZTRACK_ISSUE; the system doesn't).
    const exported = {
      ...Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(TERMFLEET_.*|AUTONOMY.*|PATH)$/.test(k))),
      ...params,
    };
    const setupCommand = Object.entries(exported)
      .map(([k, v]) => `export ${k}=${JSON.stringify(v ?? '')}`)
      .join('; ');
    const promptDir = process.env.AUTONOMY_PROMPT_DIR;
    const promptFile = promptDir ? `${promptDir}/${agent}.txt` : '';
    const prompt = promptFile && existsSync(promptFile) ? readFileSync(promptFile, 'utf8') : agent;
    const ack = await client.createAgentWindow({ agent: this.harness, name: agent, cwd: process.cwd(), prompt, setupCommand });
    const terminalId = ack.result?.terminalId;
    if (!terminalId) {
      throw new Error(`termfleet createAgentWindow returned no terminalId for agent "${agent}": ${ack.error ?? '(no error)'}`);
    }
    return {
      id: terminalId,
      agent,
      status: 'running',
      ...(ack.result?.agentSessionId ? { ref: ack.result.agentSessionId } : {}),
      ...(Object.keys(params).length ? { params } : {}),
    };
  }
  async get(id) {
    return (await this.list()).find((s) => s.id === id);
  }
  async list() {
    const client = await this.#client();
    const snapshot = await client.snapshot();
    // id = the terminalId termfleet owns; agent = the label we launched it under (the window name).
    return snapshot.windows.filter((w) => !!w.terminalId).map((w) => ({ id: w.terminalId, agent: w.name, status: 'running' }));
  }
  async update(id, patch) {
    if (patch.status === 'cancelled') return this.cancel(id);
    return true;
  }
  async cancel(id) {
    const client = await this.#client();
    const snapshot = await client.snapshot();
    const window = snapshot.windows.find((w) => w.terminalId === id);
    if (!window) return false;
    const ack = await client.closeWindow(window.id);
    return ack.ok !== false;
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

export async function runCli(runner, argv) {
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
    console.log(JSON.stringify(await runner.launch(agent, parseParams(rest.slice(1)))));
    return 0;
  }
  if (cmd === 'get') {
    const session = await runner.get(rest[0] ?? '');
    if (!session) return 1;
    console.log(JSON.stringify(session));
    return 0;
  }
  if (cmd === 'list') {
    console.log(JSON.stringify(await runner.list()));
    return 0;
  }
  if (cmd === 'update') {
    const id = rest[0];
    const status = opt('--status');
    if (!id || !status) {
      console.error('usage: autonomy update <id> --status <running|paused|cancelled|done|failed>');
      return 2;
    }
    return (await runner.update(id, { status })) ? 0 : 1;
  }
  if (cmd === 'cancel') {
    const id = rest[0];
    if (!id) {
      console.error('usage: autonomy cancel <id>');
      return 2;
    }
    return (await runner.cancel(id)) ? 0 : 1;
  }
  console.error('usage: autonomy <launch|get|list|update|cancel>');
  return 2;
}

// Entrypoint: the local-loop substrate runner is termfleet. One concrete runner, no selection switch.
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await runCli(new TermfleetRunner(), process.argv.slice(2)));
}
