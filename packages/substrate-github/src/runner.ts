// The github substrate's runner: GitHub Actions + a model proxy. launch triggers the agent's
// workflow; the agent runs IN the Action job. GitHub assigns the run id — the runner RECEIVES it
// (via gh run list), never invents one. Implements the core Runner contract.
import { spawnSync } from 'node:child_process';
import type { Runner, Session, SessionStatus, LaunchParams } from '@open-autonomy/core';

export class GithubRunner implements Runner {
  private repoFlag = process.env.GITHUB_REPOSITORY ? `--repo ${process.env.GITHUB_REPOSITORY}` : '';

  launch(agent: string, params: LaunchParams = {}): Session {
    const fields = Object.entries(params)
      .map(([k, v]) => `--field ${k}=${JSON.stringify(v)}`)
      .join(' ');
    const d = spawnSync(`gh workflow run ${agent}.yml ${this.repoFlag} ${fields}`, { shell: true, encoding: 'utf8' });
    if (d.status) throw new Error(`gh workflow run ${agent}.yml failed: ${d.stderr || d.stdout}`);
    const r = spawnSync(
      `gh run list --workflow ${agent}.yml ${this.repoFlag} --limit 1 --json databaseId --jq ".[0].databaseId"`,
      { shell: true, encoding: 'utf8' },
    );
    const id = r.status ? undefined : r.stdout.trim() || undefined;
    return { id: id ?? agent, agent, status: 'running', ...(Object.keys(params).length ? { params } : {}) };
  }
  get(id: string): Session | undefined {
    const r = spawnSync(`gh run view ${id} ${this.repoFlag} --json databaseId,workflowName,status`, {
      shell: true,
      encoding: 'utf8',
    });
    if (r.status || !r.stdout.trim()) return undefined;
    const w = JSON.parse(r.stdout) as { databaseId: number; workflowName: string; status: string };
    return { id: String(w.databaseId), agent: w.workflowName, status: w.status === 'completed' ? 'done' : 'running' };
  }
  list(): Session[] {
    const r = spawnSync(
      `gh run list ${this.repoFlag} --json databaseId,workflowName,status --jq "[.[]|select(.status==\\"in_progress\\" or .status==\\"queued\\")]"`,
      { shell: true, encoding: 'utf8' },
    );
    if (r.status || !r.stdout.trim()) return [];
    return (JSON.parse(r.stdout) as Array<{ databaseId: number; workflowName: string }>).map((w) => ({
      id: String(w.databaseId),
      agent: w.workflowName,
      status: 'running' as const,
    }));
  }
  update(id: string, patch: { status?: SessionStatus }): boolean {
    return patch.status === 'cancelled' ? this.cancel(id) : true;
  }
  cancel(id: string): boolean {
    return !spawnSync(`gh run cancel ${id} ${this.repoFlag}`, { shell: true, stdio: 'inherit' }).status;
  }
}
