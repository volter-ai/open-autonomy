// The local substrate's runner: drives termfleet through its SDK (not the CLI). Agents express intent —
// launch/list/cancel — and the termfleet ProviderClient realizes it over a socket to a running provider.
// We depend on the `termfleet` npm package (resolvable, version-pinned, typed) rather than a `termfleet`
// binary on PATH + stdout parsing. The window NAME is the agent label; termfleet owns the terminalId.
// Implements the core (async) Runner contract.
import { existsSync, readFileSync } from 'node:fs';
import type { Runner, Session, SessionStatus, LaunchParams } from '@open-autonomy/core';
import { ProviderClient, providerRefFromUrl } from 'termfleet';
import { resolveDefaultProvider } from '@termfleet/core/local-providers.js';
import { RUNNER_DEFAULTS } from './runner-config';

type Harness = 'claude' | 'codex' | 'gemini';

export class TermfleetRunner implements Runner {
  private harness = (process.env.TERMFLEET_AGENT || RUNNER_DEFAULTS.harness) as Harness; // which coding CLI termfleet runs
  // The provider client, resolved once. Discovery mirrors the CLI's: an explicit TERMFLEET_PROVIDER_URL,
  // else the current-context provider, else live local auto-discovery — done by termfleet's own SDK.
  private clientPromise?: Promise<ProviderClient>;
  private client(): Promise<ProviderClient> {
    return (this.clientPromise ??= resolveDefaultProvider({ url: process.env.TERMFLEET_PROVIDER_URL }).then(
      (p) => new ProviderClient(providerRefFromUrl(p.baseUrl)),
    ));
  }

  async launch(agent: string, params: LaunchParams = {}): Promise<Session> {
    const client = await this.client();
    // Re-export orchestration context so the agent's own nested `autonomy launch ...` reaches this
    // provider, plus the opaque params verbatim (a profile may read e.g. $ZTRACK_ISSUE; the system doesn't).
    const exported: Record<string, string> = {
      ...Object.fromEntries(
        Object.entries(process.env as Record<string, string>).filter(([k]) => /^(TERMFLEET_.*|AUTONOMY.*|PATH)$/.test(k)),
      ),
      ...params,
    };
    const setupCommand = Object.entries(exported)
      .map(([k, v]) => `export ${k}=${JSON.stringify(v ?? '')}`)
      .join('; ');
    const promptDir = process.env.AUTONOMY_PROMPT_DIR;
    const promptFile = promptDir ? `${promptDir}/${agent}.txt` : '';
    // createAgentWindow takes the prompt as a string — read the per-harness launch prompt file if present,
    // else use the agent name (which activates the skill of that name in the harness).
    const prompt = promptFile && existsSync(promptFile) ? readFileSync(promptFile, 'utf8') : agent;
    const ack = await client.createAgentWindow({ agent: this.harness, name: agent, cwd: process.cwd(), prompt, setupCommand });
    const terminalId = ack.result?.terminalId;
    if (!terminalId) {
      throw new Error(`termfleet createAgentWindow returned no terminalId for agent "${agent}": ${ack.error ?? '(no error)'}`);
    }
    return {
      id: terminalId, // the terminalId termfleet owns — RECEIVED, never invented
      agent,
      status: 'running',
      ...(ack.result?.agentSessionId ? { ref: ack.result.agentSessionId } : {}),
      ...(Object.keys(params).length ? { params } : {}),
    };
  }
  async get(id: string): Promise<Session | undefined> {
    return (await this.list()).find((s) => s.id === id);
  }
  async list(): Promise<Session[]> {
    const client = await this.client();
    const snapshot = await client.snapshot();
    // id = the terminalId termfleet owns; agent = the label we launched it under (the window name).
    return snapshot.windows
      .filter((w) => !!w.terminalId)
      .map((w) => ({ id: w.terminalId!, agent: w.name, status: 'running' as const }));
  }
  async update(id: string, patch: { status?: SessionStatus }): Promise<boolean> {
    if (patch.status === 'cancelled') return this.cancel(id);
    return true;
  }
  async cancel(id: string): Promise<boolean> {
    // id is the terminalId; resolve it to termfleet's numeric window id, then close that one window.
    const client = await this.client();
    const snapshot = await client.snapshot();
    const window = snapshot.windows.find((w) => w.terminalId === id);
    if (!window) return false;
    const ack = await client.closeWindow(window.id);
    return ack.ok !== false;
  }
}
