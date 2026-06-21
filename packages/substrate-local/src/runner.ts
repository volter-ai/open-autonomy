// The local substrate's runner: drives termfleet. The window name IS the agent; the system never
// encodes anything else into it. Implements the core Runner contract.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { Runner, Session, SessionStatus, LaunchParams } from '@open-autonomy/core';
import { RUNNER_DEFAULTS } from './runner-config';

export class TermfleetRunner implements Runner {
  private cli = process.env.TERMFLEET_CLI || RUNNER_DEFAULTS.cli;
  private model = process.env.TERMFLEET_AGENT || RUNNER_DEFAULTS.harness; // claude|codex — the model, not our agent
  private url = process.env.TERMFLEET_PROVIDER_URL || RUNNER_DEFAULTS.providerUrl;

  launch(agent: string, params: LaunchParams = {}): Session {
    // Re-export orchestration context so the agent's own nested `autonomy launch ...` reaches this
    // provider, plus the opaque params verbatim (a profile may read e.g. $issue; the system doesn't).
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
