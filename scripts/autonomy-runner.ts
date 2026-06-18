// The Runner contract (docs/AUTONOMY-IR.md §4.1) as a concrete, swappable backend.
// This is the connective tissue: a skill/script calls `autonomy launch|list|cancel` and never
// knows whether it's termfleet on a laptop or a dispatch on github.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// A session's whole lifecycle. Without `done`/`failed`, list() never reflects reality —
// a finished session would read as `running` forever. So update is not optional.
export type SessionStatus = 'running' | 'paused' | 'cancelled' | 'done' | 'failed';

export interface Session {
  id: string;
  role: string;
  issue?: string;
  status: SessionStatus;
  ref?: string; // backend-specific handle (e.g. termfleet agentSessionId) for get/wait
}

export interface Runner {
  launch(role: string, issue?: string): Session; // C — create
  get(id: string): Session | undefined; // R — read one
  list(): Session[]; // R — read all (running)
  update(id: string, patch: { status?: SessionStatus; issue?: string }): boolean; // U — transition
  cancel(id: string): boolean; // D — delete
}

// Default backend: records sessions to a JSON state file and invokes a pluggable launch command
// (AUTONOMY_LAUNCH_CMD). Real and testable everywhere — no termfleet/cloud required.
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

  launch(role: string, issue?: string): Session {
    const session: Session = { id: `${role}-${this.now()}`, role, issue, status: 'running' };
    this.write([...this.read(), session]);
    if (this.launchCmd) {
      spawnSync(this.launchCmd, {
        shell: true,
        stdio: 'inherit',
        env: { ...process.env, AUTONOMY_AGENT: role, AUTONOMY_ISSUE: issue ?? '' },
      });
    }
    return session;
  }
  get(id: string): Session | undefined {
    return this.read().find((s) => s.id === id);
  }
  list(): Session[] {
    return this.read().filter((s) => s.status === 'running');
  }
  update(id: string, patch: { status?: SessionStatus; issue?: string }): boolean {
    const sessions = this.read();
    const target = sessions.find((s) => s.id === id);
    if (!target) return false;
    if (patch.status) target.status = patch.status;
    if (patch.issue !== undefined) target.issue = patch.issue;
    this.write(sessions);
    return true;
  }
  cancel(id: string): boolean {
    return this.update(id, { status: 'cancelled' });
  }
}

// Real local backend: drives termfleet (what ztrack's run-agent.mjs / recover-*.mjs use today).
export class TermfleetRunner implements Runner {
  private cli = process.env.TERMFLEET_CLI || 'termfleet';
  private agent = process.env.TERMFLEET_AGENT || 'codex';
  private url = process.env.TERMFLEET_PROVIDER_URL || 'http://127.0.0.1:7376';

  launch(role: string, issue?: string): Session {
    const id = `ztrack-${role}`;
    // Re-export the orchestration context so the agent's own nested `autonomy launch ...` calls
    // reach this same provider/state (recursive dispatch: PM launches develop from inside its session).
    const env: Record<string, string> = { ...(process.env as Record<string, string>) };
    if (issue) env.AUTONOMY_ISSUE = issue;
    const setup = Object.entries(env)
      .filter(([k]) => /^(TERMFLEET_.*|AUTONOMY.*|PATH)$/.test(k))
      .map(([k, v]) => `export ${k}=${JSON.stringify(v ?? '')}`)
      .join('; ');
    // Per-role prompt: a skill/prompt file if provided, else the bare role (+issue).
    const promptDir = process.env.AUTONOMY_PROMPT_DIR;
    const promptFile = promptDir ? `${promptDir}/${role}.txt` : '';
    const promptArg =
      promptFile && existsSync(promptFile)
        ? `--prompt-file ${JSON.stringify(promptFile)}`
        : `--prompt ${JSON.stringify(issue ? `${role}\n\nAssigned issue: ${issue}.` : role)}`;
    const r = spawnSync(
      `${this.cli} ${this.agent} new -y --url ${JSON.stringify(this.url)} --name ${JSON.stringify(id)} --cwd ${JSON.stringify(process.cwd())} ${promptArg} --setup-command ${JSON.stringify(setup)}`,
      { shell: true, encoding: 'utf8' },
    );
    let ref: string | undefined;
    try {
      ref = JSON.parse(r.stdout)?.agentSessionId;
    } catch {
      /* non-JSON output (e.g. needs -y review) → no ref */
    }
    return { id, role, issue, status: 'running', ...(ref ? { ref } : {}) };
  }
  get(id: string): Session | undefined {
    return this.list().find((s) => s.id === id);
  }
  list(): Session[] {
    // termfleet's agent CRUD: `<agent> list` returns this agent's windows ([{id,name,agent,...}]).
    const r = spawnSync(`${this.cli} ${this.agent} list --url '${this.url}'`, { shell: true, encoding: 'utf8' });
    if (r.status || !r.stdout.trim()) return [];
    return (JSON.parse(r.stdout) as Array<{ name: string }>).map((w) => ({
      id: w.name,
      role: w.name.replace(/^ztrack-/, ''),
      status: 'running' as const,
    }));
  }
  update(id: string, patch: { status?: SessionStatus }): boolean {
    // termfleet tracks only liveness; the one meaningful transition it can honor is cancellation.
    return patch.status === 'cancelled' ? this.cancel(id) : true;
  }
  cancel(id: string): boolean {
    // `<agent> kill --name <window name>` (id is the session/window name, e.g. ztrack-develop).
    return !spawnSync(`${this.cli} ${this.agent} kill --url '${this.url}' --name '${id}'`, {
      shell: true,
      stdio: 'inherit',
    }).status;
  }
}

// The runners we actually ship and support. The compiler may only wire one of these — anything
// else fails fast at compile time, rather than installing a runner that doesn't exist.
export const SUPPORTED_RUNNERS = ['exec', 'termfleet'] as const;
export type RunnerName = (typeof SUPPORTED_RUNNERS)[number];
