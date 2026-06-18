// The Runner contract (docs/AUTONOMY-IR.md §4.1) as a concrete, swappable backend.
// This is the connective tissue: a skill/script calls `autonomy launch|list|cancel` and never
// knows whether it's termfleet on a laptop or a dispatch on github.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface Session {
  id: string;
  role: string;
  issue?: string;
  status: 'running' | 'cancelled';
}

export interface Runner {
  launch(role: string, issue?: string): Session; // create
  list(): Session[]; // read (running only)
  cancel(id: string): boolean; // delete
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
  list(): Session[] {
    return this.read().filter((s) => s.status === 'running');
  }
  cancel(id: string): boolean {
    const sessions = this.read();
    const target = sessions.find((s) => s.id === id);
    if (!target) return false;
    target.status = 'cancelled';
    this.write(sessions);
    return true;
  }
}

// Real local backend: drives termfleet (what ztrack's run-agent.mjs / recover-*.mjs use today).
export class TermfleetRunner implements Runner {
  private cli = process.env.TERMFLEET_CLI || 'termfleet';
  private agent = process.env.TERMFLEET_AGENT || 'codex';
  private url = process.env.TERMFLEET_PROVIDER_URL || 'http://127.0.0.1:7376';

  launch(role: string, issue?: string): Session {
    const id = `ztrack-${role}`;
    const prompt = issue ? `${role}\\n\\nAssigned issue: ${issue}.` : role;
    spawnSync(
      `${this.cli} ${this.agent} new -y --url '${this.url}' --name '${id}' --cwd '${process.cwd()}' --prompt '${prompt}'`,
      { shell: true, stdio: 'inherit' },
    );
    return { id, role, issue, status: 'running' };
  }
  list(): Session[] {
    const r = spawnSync(`${this.cli} list --url '${this.url}'`, { shell: true, encoding: 'utf8' });
    if (r.status || !r.stdout.trim()) return [];
    return (JSON.parse(r.stdout) as Array<{ name: string; agent: string }>)
      .filter((p) => p.agent !== 'no-agent')
      .map((p) => ({ id: p.name, role: p.name.replace(/^ztrack-/, ''), status: 'running' as const }));
  }
  cancel(id: string): boolean {
    return !spawnSync(`${this.cli} kill '${id}' --url '${this.url}'`, { shell: true, stdio: 'inherit' }).status;
  }
}

export function getRunner(): Runner {
  const kind = process.env.AUTONOMY_RUNNER || 'exec';
  if (kind === 'termfleet') return new TermfleetRunner();
  return new ExecRunner(process.env.AUTONOMY_STATE || '.autonomy/sessions.json', process.env.AUTONOMY_LAUNCH_CMD);
}
