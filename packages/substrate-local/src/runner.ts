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
// Derived from the SDK so we never re-declare termfleet's shapes: a lifecycle session and a window.
type LifeSession = Awaited<ReturnType<ProviderClient['lifecycle']>>['sessions'][number];
type Win = Awaited<ReturnType<ProviderClient['snapshot']>>['windows'][number];

// Map a window + its lifecycle session into a Session, surfacing termfleet's real activity. The contract
// status vocab is running|paused|cancelled|done|failed, so: running/background -> running, idle
// (session_waiting, no signal) -> done, attention `asking` -> paused, `errored` -> failed; a note carries
// the finer distinction. No session yet (just launched) reads as running.
function sessionOf(w: Win, byId: Map<string, LifeSession>): Session {
  const s = w.lifecycle?.currentSessionId ? byId.get(w.lifecycle.currentSessionId) : undefined;
  const base = { id: w.terminalId!, agent: w.name };
  if (!s) return { ...base, status: 'running' };
  const ref = s.sessionId;
  if (s.state === 'session_running') return { ...base, status: 'running', ref };
  if (s.state === 'session_stopped_background_running') return { ...base, status: 'running', ref, note: 'background work running' };
  if (s.signal === 'asking') return { ...base, status: 'paused', ref, note: 'awaiting human input' };
  if (s.signal === 'errored') return { ...base, status: 'failed', ref, note: 'errored, awaiting human' };
  return { ...base, status: 'done', ref, note: 'idle (turn complete)' };
}

export class TermfleetRunner implements Runner {
  private harness = (process.env.TERMFLEET_AGENT || RUNNER_DEFAULTS.harness) as Harness; // which coding CLI termfleet runs
  // The provider client, resolved once. Discovery mirrors the CLI's: an explicit TERMFLEET_PROVIDER_URL,
  // else the current-context provider, else live local auto-discovery — done by termfleet's own SDK.
  private clientPromise?: Promise<ProviderClient>;
  private client(): Promise<ProviderClient> {
    return (this.clientPromise ??= resolveDefaultProvider({ url: process.env.TERMFLEET_PROVIDER_URL }).then((p) => {
      // OA-09: log the effective provider + its origin on first resolve — see backend.mjs's twin (keep in
      // sync) for the full rationale. AUTONOMY_PROVIDER_URL_SOURCE (set by the loop driver) distinguishes
      // `schedule` (the durable compile-time pin) from `env` (a genuine ambient override); `env` is the
      // default when the hint is absent (this runner driven outside the loop). Unpinned, the SDK's own
      // `source` (current-context | auto-local) is used verbatim.
      const source = process.env.TERMFLEET_PROVIDER_URL ? process.env.AUTONOMY_PROVIDER_URL_SOURCE || 'env' : p.source;
      // stderr, never stdout — `list`/`launch`'s CLI output is a single JSON line on stdout that callers
      // (including this repo's own tests) parse directly; a diagnostic line ahead of it would corrupt that.
      console.error(`[runner] provider ${p.baseUrl} (${source})`);
      return new ProviderClient(providerRefFromUrl(p.baseUrl));
    }));
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
    // Put the repo's local node_modules/.bin first so the agent reaches repo-pinned CLIs (e.g. a `-D`
    // ztrack) — exactly what `npm run`/`bun run` do, without the substrate naming any tool. cwd is the
    // repo (createAgentWindow runs the session there), so this is where its node_modules lives.
    exported.PATH = `${process.cwd()}/node_modules/.bin:${exported.PATH ?? process.env.PATH ?? ''}`;
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
  // termfleet's process-tree lifecycle joined to the window list. A window points at a session via
  // `lifecycle.currentSessionId`; the session carries the real activity `state` (+ attention `signal`).
  private async view(): Promise<{ client: ProviderClient; snapshot: Awaited<ReturnType<ProviderClient['snapshot']>>; byId: Map<string, LifeSession> }> {
    const client = await this.client();
    const [life, snapshot] = await Promise.all([client.lifecycle(), client.snapshot()]);
    const byId = new Map((life.sessions || []).map((s) => [s.sessionId, s] as const));
    return { client, snapshot, byId };
  }
  async list(): Promise<Session[]> {
    const { snapshot, byId } = await this.view();
    // id = the terminalId termfleet owns; agent = the window name; status = termfleet's real activity.
    return snapshot.windows.filter((w) => !!w.terminalId).map((w) => sessionOf(w, byId));
  }
  // Close this install's OWN agent sessions IDLE (termfleet `session_waiting`, no attention signal) for
  // >= idleMs — the local analogue of an ephemeral job ending when its work is done. Scope is the `agents`
  // name set (a human's own terminal / another loop's session is never touched). `since` is the caller's
  // persistent Map(sessionId -> firstIdleAtMs): a session that resumes, is taken over (`asking`), or
  // errors is dropped and never reaped. Reaps via closeWindow (the proven cancel path).
  async reapIdle(opts: { idleMs?: number; agents?: Set<string>; since?: Map<string, number>; now?: number } = {}): Promise<Array<{ id: string; agent: string; sessionId: string }>> {
    const { idleMs = 60000, agents, since = new Map<string, number>(), now = Date.now() } = opts;
    const { client, snapshot, byId } = await this.view();
    const seen = new Set<string>();
    const reaped: Array<{ id: string; agent: string; sessionId: string }> = [];
    for (const w of snapshot.windows) {
      if (agents && agents.size && !agents.has(w.name)) continue;
      const sid = w.lifecycle?.currentSessionId ?? undefined;
      const s = sid ? byId.get(sid) : undefined;
      if (!sid || !s) continue;
      seen.add(sid);
      const idle = s.state === 'session_waiting' && !s.signal;
      if (!idle) {
        since.delete(sid);
        continue;
      }
      if (!since.has(sid)) since.set(sid, now);
      if (now - (since.get(sid) as number) >= idleMs) {
        const ack = await client.closeWindow(w.id).catch(() => null);
        if (ack && ack.ok !== false) {
          reaped.push({ id: w.terminalId!, agent: w.name, sessionId: sid });
          since.delete(sid);
        }
      }
    }
    for (const sid of [...since.keys()]) if (!seen.has(sid)) since.delete(sid);
    return reaped;
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
