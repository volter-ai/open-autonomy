// Synchronous capacity probe used by one-shot trigger entrypoints. Continuous reconciliation already has
// a live SessionRunner instance; `once` and `dispatch` are short-lived processes, so they query the emitted
// runner adapter exactly once and fail closed when a finite cap cannot be evaluated.
import { join } from 'node:path';
import type { NormalizedSchedule, ProcRunner } from './types.ts';

const active = (status: string): boolean => status === 'running' || status === 'paused' || status === 'awaiting-human';

export function activeScheduledSessionCount(
  cwd: string,
  schedule: NormalizedSchedule,
  env: NodeJS.ProcessEnv,
  proc: ProcRunner,
): number | null {
  const result = proc('node', [join(cwd, 'scripts', 'autonomy-runner.mjs'), 'list'], {
    cwd,
    encoding: 'utf8',
    env,
  });
  if (result.status !== 0 || result.error) return null;
  try {
    const sessions = JSON.parse(result.stdout || '[]') as Array<{ agent?: unknown; status?: unknown }>;
    if (!Array.isArray(sessions)) return null;
    const scheduled = new Set(schedule.jobs.flatMap((job) => job.agent ? [job.agent] : []));
    return sessions.filter((session) =>
      typeof session.agent === 'string' && scheduled.has(session.agent) &&
      typeof session.status === 'string' && active(session.status)).length;
  } catch {
    return null;
  }
}
