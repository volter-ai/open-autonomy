// `oa once` — fires the FULL schedule unconditionally, no state-gating, no eligibility probe, no
// crash-loop backoff. The scripted entry point: "run exactly what's declared, once" is its whole
// contract, unchanged by `oa start`'s reconciler. PAUSED is checked FIRST — before even the termfleet
// dependency check — so a paused install deterministically reports PAUSED as the reason nothing ran,
// never masked by an unrelated "termfleet not installed" exit that would also (coincidentally) prevent a
// launch.
import type { ProcRunner } from './types.ts';
import { defaultProc } from './proc.ts';
import { loadSchedule } from './config.ts';
import { isPaused, pausedMessage } from './pause.ts';
import { buildTickEnv, fireCommands } from './env.ts';
import { checkDepIntegrity, checkTermfleetInstalled, checkUncommittedHarness, needsRunner } from './guards.ts';

export interface OnceResult {
  ok: boolean;
  reason?: string;
  fired: number;
}

export function once(opts: { cwd?: string; proc?: ProcRunner } = {}): OnceResult {
  const cwd = opts.cwd ?? process.cwd();
  const proc = opts.proc ?? defaultProc;

  if (isPaused(cwd)) {
    const msg = pausedMessage(cwd);
    console.error(msg);
    return { ok: false, reason: msg, fired: 0 };
  }

  const schedule = loadSchedule(cwd);
  const cmds = schedule.scripts.map((s) => s.cmd);

  if (needsRunner(cmds)) {
    const termfleet = checkTermfleetInstalled(cwd);
    if (!termfleet.ok) {
      console.error(termfleet.message);
      return { ok: false, reason: termfleet.message, fired: 0 };
    }
    const integrity = checkDepIntegrity(cwd, proc);
    if (!integrity.ok) {
      console.error(integrity.message);
      return { ok: false, reason: integrity.message, fired: 0 };
    }
  }

  const harness = checkUncommittedHarness(cwd, proc);
  if (harness.message) console.error(harness.message);
  if (!harness.ok) return { ok: false, reason: harness.message, fired: 0 };

  fireCommands(cmds, buildTickEnv(schedule.env), proc);
  return { ok: true, fired: cmds.length };
}
