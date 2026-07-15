// The shared preflight guard chain BOTH modes run before any tick fires — same order as run.mjs's own
// top-level sequence (which executed before --once AND continuous mode alike):
//   1. termfleet-installed refusal            (only when the schedule actually needs the runner)
//   2. OA-04 dep-integrity collision probe    (same scoping)
//   3. OA-09 provider resolve + log + URL/origin export (same scoping) — the exports land in the SAME env
//      object buildTickEnv and the in-process lifecycle runner read (process.env by default), so launches,
//      reaping, and reconciliation cannot resolve different providers.
//   4. OA-03 uncommitted-harness refusal      (unconditional; AUTONOMY_ALLOW_UNCOMMITTED_HARNESS=1 downgrades)
// `oa once` filters fenced jobs BEFORE calling this, so a fully fenced schedule returns without a
// coincidental preflight failure for work that will not run.
import type { NormalizedSchedule, ProcRunner } from './types.ts';
import { defaultProc } from './proc.ts';
import { checkDepIntegrity, checkTermfleetInstalled, checkUncommittedHarness, needsRunner } from './guards.ts';
import { defaultResolveDefaultProvider, resolveProvider } from './env.ts';

export interface PreflightResult {
  ok: boolean;
  /** the failing guard's message (also already printed to stderr — kept here so callers like `once` can
   *  surface it in their own result object). */
  message?: string;
}

export interface PreflightOptions {
  cwd: string;
  proc?: ProcRunner;
  /** the env object the OA-09 origin export is written INTO (default process.env — the same object
   *  buildTickEnv reads ambiently, so the export reaches launched children). Tests inject their own. */
  ambient?: NodeJS.ProcessEnv;
  /** OA-09 auto-discovery hook (only reached when neither an ambient nor a schedule pin is set);
   *  default dynamically imports the adopter repo's @termfleet/core. Failure is non-fatal (logged,
   *  resolution deferred to launch time) — verbatim run.mjs behavior. */
  resolveDefault?: () => Promise<{ baseUrl: string; source: string }>;
}

export async function runPreflight(schedule: NormalizedSchedule, opts: PreflightOptions): Promise<PreflightResult> {
  const proc = opts.proc ?? defaultProc;
  const ambient = opts.ambient ?? process.env;
  const cmds = schedule.jobs.map((job) => job.cmd);

  if (needsRunner(cmds)) {
    const termfleet = checkTermfleetInstalled(opts.cwd);
    if (!termfleet.ok) {
      console.error(termfleet.message);
      return { ok: false, message: termfleet.message };
    }
    const integrity = checkDepIntegrity(opts.cwd, proc);
    if (!integrity.ok) {
      console.error(integrity.message);
      return { ok: false, message: integrity.message };
    }
    // OA-09: log the EFFECTIVE provider URL + ORIGIN once, before any tick — a misattachment is visible in
    // the first line of output instead of never. Pin this process before constructing the lifecycle runner,
    // then re-export the ORIGIN so nested resolves can report the same schedule-vs-env distinction.
    const provider = await resolveProvider(schedule.env, ambient, opts.resolveDefault ?? defaultResolveDefaultProvider);
    if (provider) {
      console.error(`[oa] provider ${provider.url} (${provider.source})`);
      ambient.TERMFLEET_PROVIDER_URL = provider.url;
      ambient.AUTONOMY_PROVIDER_URL_SOURCE = provider.source;
    }
  }

  const harness = checkUncommittedHarness(opts.cwd, proc, ambient);
  if (harness.message) console.error(harness.message);
  if (!harness.ok) return { ok: false, message: harness.message };

  return { ok: true };
}
