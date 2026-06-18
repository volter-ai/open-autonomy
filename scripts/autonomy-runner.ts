// The runner: the system's entire knowledge is agents, running agents, and their lifecycle.
// It knows nothing about what an agent does or what it works on — no "issues", no states like
// "ready"/"in progress", no domain at all. That lives entirely in the agents and the scripts.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type SessionStatus = 'running' | 'paused' | 'cancelled' | 'done' | 'failed';

export interface Session {
  id: string;
  agent: string; // which agent is running; an opaque name from the config
  status: SessionStatus;
  ref?: string; // backend handle (e.g. termfleet agentSessionId)
  params?: Record<string, string>; // opaque pass-through; the system never interprets these
}

// Arbitrary parameters carried to a launched agent. The system passes them through verbatim — a
// runner/bundle may give one meaning (e.g. "issue"), but the autonomy system never knows what they are.
export type LaunchParams = Record<string, string>;

export interface Runner {
  launch(agent: string, params?: LaunchParams): Session; // C
  get(id: string): Session | undefined; // R (one)
  list(): Session[]; // R (running)
  update(id: string, patch: { status?: SessionStatus }): boolean; // U
  cancel(id: string): boolean; // D
}

// Records running agents to a state file and invokes a pluggable launch command.
export class ExecRunner implements Runner {
  constructor(
    private statePath: string,
    private launchCmd?: string,
    private now: () => string = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
  ) {}
  private read(): Session[] {
    return existsSync(this.statePath) ? (JSON.parse(readFileSync(this.statePath, 'utf8')) as Session[]) : [];
  }
  private write(sessions: Session[]): void {
    mkdirSync(dirname(this.statePath), { recursive: true });
    writeFileSync(this.statePath, JSON.stringify(sessions, null, 2));
  }
  launch(agent: string, params: LaunchParams = {}): Session {
    const session: Session = {
      id: `${agent}-${this.now()}`,
      agent,
      status: 'running',
      ...(Object.keys(params).length ? { params } : {}),
    };
    this.write([...this.read(), session]);
    if (this.launchCmd) {
      // params pass through as env, verbatim — the runner doesn't interpret them
      spawnSync(this.launchCmd, { shell: true, stdio: 'inherit', env: { ...process.env, ...params, AUTONOMY_AGENT: agent } });
    }
    return session;
  }
  get(id: string): Session | undefined {
    return this.read().find((s) => s.id === id);
  }
  list(): Session[] {
    return this.read().filter((s) => s.status === 'running');
  }
  update(id: string, patch: { status?: SessionStatus }): boolean {
    const sessions = this.read();
    const target = sessions.find((s) => s.id === id);
    if (!target) return false;
    if (patch.status) target.status = patch.status;
    this.write(sessions);
    return true;
  }
  cancel(id: string): boolean {
    return this.update(id, { status: 'cancelled' });
  }
}

// Real local backend: drives termfleet. The window name IS the agent; the system never encodes
// anything else into it.
export class TermfleetRunner implements Runner {
  private cli = process.env.TERMFLEET_CLI || 'termfleet';
  private model = process.env.TERMFLEET_AGENT || 'codex'; // claude|codex — the model, not our agent
  private url = process.env.TERMFLEET_PROVIDER_URL || 'http://127.0.0.1:7376';

  launch(agent: string, params: LaunchParams = {}): Session {
    // Re-export orchestration context so the agent's own nested `autonomy launch ...` reaches this
    // provider, plus the opaque params verbatim (a bundle may read e.g. $issue; the system doesn't).
    const exported: Record<string, string> = {
      ...Object.fromEntries(Object.entries(process.env as Record<string, string>).filter(([k]) => /^(TERMFLEET_.*|AUTONOMY.*|PATH)$/.test(k))),
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
      `${this.cli} ${this.model} new -y --url ${JSON.stringify(this.url)} --name ${JSON.stringify(agent)} --cwd ${JSON.stringify(process.cwd())} ${promptArg} --setup-command ${JSON.stringify(setup)}`,
      { shell: true, encoding: 'utf8' },
    );
    let created: { terminalId?: string; agentSessionId?: string } = {};
    try {
      created = JSON.parse(r.stdout);
    } catch {
      /* non-JSON (e.g. -y review) */
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
  get(id: string): Session | undefined {
    return this.list().find((s) => s.id === id);
  }
  list(): Session[] {
    const r = spawnSync(`${this.cli} ${this.model} list --url ${JSON.stringify(this.url)}`, {
      shell: true,
      encoding: 'utf8',
    });
    if (r.status || !r.stdout.trim()) return [];
    // id = the terminalId termfleet owns; agent = the label we launched it under (the window name).
    return (JSON.parse(r.stdout) as Array<{ name: string; terminalId: string }>).map((w) => ({
      id: w.terminalId,
      agent: w.name,
      status: 'running' as const,
    }));
  }
  update(id: string, patch: { status?: SessionStatus }): boolean {
    return patch.status === 'cancelled' ? this.cancel(id) : true;
  }
  cancel(id: string): boolean {
    // id is the terminalId; resolve it to termfleet's numeric window id, then kill that one window.
    const r = spawnSync(`${this.cli} ${this.model} list --url ${JSON.stringify(this.url)}`, { shell: true, encoding: 'utf8' });
    let windowId: number | undefined;
    try {
      windowId = (JSON.parse(r.stdout) as Array<{ id: number; terminalId: string }>).find((w) => w.terminalId === id)?.id;
    } catch {
      /* ignore */
    }
    if (windowId === undefined) return false;
    return !spawnSync(`${this.cli} ${this.model} kill --url ${JSON.stringify(this.url)} --id ${windowId}`, {
      shell: true,
      stdio: 'inherit',
    }).status;
  }
}

// The runners we actually ship; the compiler may only wire one of these.
export const SUPPORTED_RUNNERS = ['exec', 'termfleet'] as const;
export type RunnerName = (typeof SUPPORTED_RUNNERS)[number];
