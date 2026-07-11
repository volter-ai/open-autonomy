// `oa once` — fires the FULL schedule unconditionally, no state-gating, no eligibility probe, no
// crash-loop backoff. The scripted entry point: "run exactly what's declared, once" is its whole
// contract, unchanged by `oa start`'s reconciler. PAUSED is checked FIRST — before even the termfleet
// dependency check inside the preflight chain — so a paused install deterministically reports PAUSED as
// the reason nothing ran, never masked by an unrelated "termfleet not installed" exit that would also
// (coincidentally) prevent a launch.
import type { ProcRunner } from './types.ts';
import { defaultProc } from './proc.ts';
import { loadSchedule } from './config.ts';
import { isPaused, pausedMessage } from './pause.ts';
import { buildTickEnv, fireCommands } from './env.ts';
import { runPreflight } from './preflight.ts';

export interface OnceResult {
  ok: boolean;
  reason?: string;
  fired: number;
}

export async function once(
  opts: { cwd?: string; proc?: ProcRunner; ambient?: NodeJS.ProcessEnv; resolveDefault?: () => Promise<{ baseUrl: string; source: string }> } = {},
): Promise<OnceResult> {
  const cwd = opts.cwd ?? process.cwd();
  const proc = opts.proc ?? defaultProc;
  const ambient = opts.ambient ?? process.env;

  if (isPaused(cwd)) {
    const msg = pausedMessage(cwd);
    console.error(msg);
    return { ok: false, reason: msg, fired: 0 };
  }

  const schedule = loadSchedule(cwd);
  const cmds = schedule.scripts.map((s) => s.cmd);

  // The full run.mjs guard chain (termfleet / OA-04 / OA-09 origin log + AUTONOMY_PROVIDER_URL_SOURCE
  // export / OA-03) — SHARED with `oa start` via runPreflight so the two modes can never drift apart on
  // what they refuse (the failure mode the pre-U4 template never had, because it was one file).
  const pre = await runPreflight(schedule, {
    cwd,
    proc,
    ambient,
    ...(opts.resolveDefault ? { resolveDefault: opts.resolveDefault } : {}),
  });
  if (!pre.ok) {
    const result: OnceResult = { ok: false, fired: 0 };
    if (pre.message) result.reason = pre.message;
    return result;
  }

  fireCommands(cmds, buildTickEnv(schedule.env, ambient), proc);
  return { ok: true, fired: cmds.length };
}
