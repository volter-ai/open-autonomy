// Schedule loading and normalization. The scheduler accepts the emitted job shape and both historical
// script shapes, but it never infers role semantics or task eligibility from a command/agent name.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NormalizedJob, NormalizedSchedule, RawSchedule, RawScheduleJob, RawScheduleScriptObject } from './types.ts';

export function agentOf(cmd: string): string | null {
  const m = cmd.match(/(?:^|\s)AUTONOMY_AGENT=(\S+)/);
  return m ? m[1]! : null;
}

function normalizeJob(
  entry: string | RawScheduleScriptObject | RawScheduleJob,
  index: number,
  topIntervalSeconds: number,
  legacy: boolean,
): NormalizedJob {
  const obj = typeof entry === 'string' ? { cmd: entry } : entry;
  const cmd = 'command' in obj ? obj.command : obj.cmd;
  if (typeof cmd !== 'string' || !cmd.trim()) throw new Error(`[oa] schedule.json: job ${index + 1} needs a command`);
  const name = ('name' in obj && obj.name) || agentOf(cmd) || `job-${index + 1}`;
  const intervalSeconds = Number(obj.intervalSeconds ?? topIntervalSeconds);
  if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
    throw new Error(`[oa] schedule.json: job "${name}" needs intervalSeconds > 0`);
  }
  const retrySeconds = Number(('retrySeconds' in obj ? obj.retrySeconds : undefined) ?? intervalSeconds);
  if (!Number.isFinite(retrySeconds) || retrySeconds < 0) {
    throw new Error(`[oa] schedule.json: job "${name}" needs retrySeconds >= 0`);
  }
  const agent = ('agent' in obj ? obj.agent : undefined) ?? agentOf(cmd);
  const fence = ('fence' in obj ? obj.fence : undefined) ?? (legacy ? '.open-autonomy/paused' : undefined);
  return { name, cmd, intervalSeconds, retrySeconds, ...(fence ? { fence } : {}), agent };
}

export function normalizeSchedule(raw: RawSchedule): NormalizedSchedule {
  const topIntervalSeconds = Number(raw.intervalSeconds ?? 900);
  const usesJobs = Array.isArray(raw.jobs);
  const entries = usesJobs ? raw.jobs! : raw.scripts ?? [];
  if (!entries.length) throw new Error('[oa] schedule.json: declare at least one job');
  const jobs = entries.map((entry, index) => normalizeJob(entry, index, topIntervalSeconds, !usesJobs));
  const names = new Set<string>();
  for (const job of jobs) {
    if (names.has(job.name)) throw new Error(`[oa] schedule.json: duplicate job name "${job.name}"`);
    names.add(job.name);
  }
  const maxConcurrent = raw.maxConcurrent == null ? Number.POSITIVE_INFINITY : Number(raw.maxConcurrent);
  if (!(maxConcurrent === Number.POSITIVE_INFINITY || (Number.isInteger(maxConcurrent) && maxConcurrent > 0))) {
    throw new Error('[oa] schedule.json: maxConcurrent must be a positive integer');
  }
  return { intervalSeconds: topIntervalSeconds, env: raw.env ?? {}, jobs, scripts: jobs, maxConcurrent };
}

export function loadSchedule(cwd: string = process.cwd(), path?: string): NormalizedSchedule {
  const schedulePath = path ?? process.env.AUTONOMY_SCHEDULE ?? join(cwd, 'scheduler', 'schedule.json');
  return normalizeSchedule(JSON.parse(readFileSync(schedulePath, 'utf8')) as RawSchedule);
}

/** @deprecated Scheduling is uniform; retained as a compatibility export. */
export function reconciledScripts(_schedule: NormalizedSchedule): NormalizedJob[] {
  return [];
}

/** @deprecated Scheduling is uniform; retained as a compatibility export. */
export function otherScripts(schedule: NormalizedSchedule): NormalizedJob[] {
  return schedule.jobs;
}
