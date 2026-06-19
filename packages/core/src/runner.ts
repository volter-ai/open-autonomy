// The runner contract: the system's entire knowledge is agents, running agents, and their lifecycle.
// It knows nothing about what an agent does or what it works on — no "issues", no states like
// "ready"/"in progress", no domain at all. That lives entirely in the agents and the scripts.
// Substrate-specific runners (TermfleetRunner, GithubRunner) live in their substrate packages and
// implement this contract. ExecRunner (a file-backed reference runner) ships here for tests/conformance.
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
// substrate may give one meaning (e.g. "issue"), but the autonomy system never knows what they are.
export type LaunchParams = Record<string, string>;

export interface Runner {
  launch(agent: string, params?: LaunchParams): Session; // C
  get(id: string): Session | undefined; // R (one)
  list(): Session[]; // R (running)
  update(id: string, patch: { status?: SessionStatus }): boolean; // U
  cancel(id: string): boolean; // D
}

// Reference runner: records running agents to a state file and invokes a pluggable launch command.
// Substrate-agnostic; used by the conformance battery and as a deterministic default.
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

// The substrates we ship a runner for; a compiler may wire one of these.
export const SUPPORTED_RUNNERS = ['exec', 'termfleet', 'github'] as const;
export type RunnerName = (typeof SUPPORTED_RUNNERS)[number];
