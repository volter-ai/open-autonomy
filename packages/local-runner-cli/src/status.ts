// `oa status` — fence state + rationale text, sessions via the runner SDK path, last-fire info.
// It runs as a separate one-shot process, so it reads a small telemetry record under
// .open-autonomy/runner-state/last-fire/<agent>.json rather than coupling its display to the scheduler's
// durable cadence state. The telemetry record is written by the scheduler on every actual fire. This is
// informational only — it drives
// nothing (the marker file stays the sole source of truth for pause/resume; last-fire is read-only
// telemetry `oa status` surfaces, never a second control channel).
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Session, SessionRunner } from './types.ts';
import { isPaused, pausedMarkerPath, pauseReasonText } from './pause.ts';
import { defaultSessionRunner, listSessionsBestEffort } from './sessions.ts';
import { readControlGeneration, type ControlGeneration } from './control-generation.ts';
import { readActivationRoutingState, type ActivationRoutingState } from './activation-paths.ts';

function lastFireDir(cwd: string): string {
  return join(cwd, '.open-autonomy', 'runner-state', 'last-fire');
}

/** Record an actual scheduled fire — called by reconciler.ts, never by a human-facing verb. */
export function recordFire(cwd: string, agentKey: string, cmd: string): void {
  const dir = lastFireDir(cwd);
  try {
    mkdirSync(dir, { recursive: true });
    const safeName = agentKey.replace(/[^a-zA-Z0-9_.-]/g, '_');
    writeFileSync(join(dir, `${safeName}.json`), JSON.stringify({ agent: agentKey, cmd, firedAt: new Date().toISOString() }, null, 2));
  } catch {
    /* best-effort telemetry only — never block a fire on a write failure */
  }
}

export interface LastFireRecord {
  agent: string;
  cmd: string;
  firedAt: string;
}

export function readLastFires(cwd: string): LastFireRecord[] {
  const dir = lastFireDir(cwd);
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  const out: LastFireRecord[] = [];
  for (const f of files) {
    try {
      out.push(JSON.parse(readFileSync(join(dir, f), 'utf8')));
    } catch {
      /* skip unreadable/corrupt record */
    }
  }
  return out.sort((a, b) => a.agent.localeCompare(b.agent));
}

export interface StatusReport {
  paused: boolean;
  pauseMarkerPath: string;
  pauseReason: string | null;
  sessions: Session[] | null;
  lastFires: LastFireRecord[];
  controlGeneration: ControlGeneration | null;
  activation: ActivationRoutingState | null;
  rationale: string;
}

export async function status(opts: { cwd?: string; sessionRunnerFactory?: (cwd: string) => Promise<SessionRunner | null> } = {}): Promise<StatusReport> {
  const cwd = opts.cwd ?? process.cwd();
  const paused = isPaused(cwd);
  const activation = readActivationRoutingState(cwd);
  const runtimeRoot = activation?.active?.root ?? cwd;
  const runner = await (opts.sessionRunnerFactory ?? defaultSessionRunner)(runtimeRoot);
  const sessions = await listSessionsBestEffort(runtimeRoot, runner);
  const lastFires = readLastFires(runtimeRoot);
  const controlGeneration = readControlGeneration(runtimeRoot);

  const rationaleLines: string[] = [];
  rationaleLines.push(paused
    ? 'conventional fence: PAUSED — jobs assigned .open-autonomy/paused will not start; jobs may declare another fence.'
    : 'conventional fence: unpaused — jobs assigned .open-autonomy/paused may fire when due; other job fences are independent.');
  if (sessions === null) rationaleLines.push('sessions: unknown (probe unavailable — is `oa start` running, or was the runner ever installed?)');
  else if (sessions.length === 0) rationaleLines.push('sessions: none live.');
  else rationaleLines.push(`sessions: ${sessions.length} live (${sessions.map((s) => `${s.agent}:${s.status}`).join(', ')}).`);
  if (!lastFires.length) rationaleLines.push('last-fire: no scheduled fire recorded yet (either `oa start` has not run, or no job has become due).');
  else for (const lf of lastFires) rationaleLines.push(`last-fire[${lf.agent}]: ${lf.firedAt}`);
  rationaleLines.push(controlGeneration
    ? `control-generation: ${controlGeneration.sha} (${controlGeneration.codeHost || 'undeclared'}).`
    : 'control-generation: none recorded (the accepted scheduler has not started).');
  if (activation) {
    rationaleLines.push(`activation.active: ${activation.active?.sha ?? 'none'}.`);
    rationaleLines.push(`activation.staged: ${activation.staged?.sha ?? 'none'}.`);
    rationaleLines.push(`activation.draining: ${activation.draining.map((generation) => generation.sha).join(', ') || 'none'}.`);
    rationaleLines.push(activation.lastFailed
      ? `activation.last-failed: ${activation.lastFailed.sha} — ${activation.lastFailed.reason}.`
      : 'activation.last-failed: none.');
    if (activation.previous) rationaleLines.push(`activation.rollback: oa rollback ${activation.previous.sha}`);
  }

  return {
    paused,
    pauseMarkerPath: pausedMarkerPath(cwd),
    pauseReason: pauseReasonText(cwd),
    sessions,
    lastFires,
    controlGeneration,
    activation,
    rationale: rationaleLines.join('\n'),
  };
}

export function formatStatus(report: StatusReport): string {
  return report.rationale;
}
