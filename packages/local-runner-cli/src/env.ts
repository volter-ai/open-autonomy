// The env each tick passes to a launched command (verbatim port of run.mjs's buildTickEnv + the OA-09
// provider-origin resolve/log). Precedence UNCHANGED: ambient process.env overrides schedule.env. A
// set-but-EMPTY ambient TERMFLEET_PROVIDER_URL (`VAR= oa start` idiom) is treated as UNSET so it can't
// shadow a real schedule pin.
import type { ProcResult, ProcRunner } from './types.ts';

export function buildTickEnv(scheduleEnv: Record<string, string>, ambient: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...scheduleEnv, ...ambient };
  if (typeof ambient.TERMFLEET_PROVIDER_URL === 'string' && ambient.TERMFLEET_PROVIDER_URL.trim() === '') {
    if (scheduleEnv.TERMFLEET_PROVIDER_URL) env.TERMFLEET_PROVIDER_URL = scheduleEnv.TERMFLEET_PROVIDER_URL;
    else delete env.TERMFLEET_PROVIDER_URL;
  }
  return env;
}

/** Fire a list of shell commands in sequence (inherits stdio) — the `--once` / non-reconciled-script
 *  primitive. */
export function fireCommands(cmds: string[], env: NodeJS.ProcessEnv, proc: ProcRunner): ProcResult[] {
  return cmds.map((cmd) => proc(cmd, [], { shell: true, stdio: 'inherit', env }));
}

/** OA-09: resolve + log the EFFECTIVE provider URL + its ORIGIN once, before any tick fires. Origin is
 *  one of `env` (ambient TERMFLEET_PROVIDER_URL, beats everything), `schedule` (the compiled pin), or
 *  `auto-local` (zero-config live discovery via @termfleet/core, only reached when neither pin is set —
 *  callers pass a `resolveDefault` hook so tests never need a real termfleet install). Returns null when
 *  nothing resolved AND no pin is set (discovery deferred to launch time, matching run.mjs). */
export async function resolveProvider(
  scheduleEnv: Record<string, string>,
  ambient: NodeJS.ProcessEnv = process.env,
  resolveDefault?: () => Promise<{ baseUrl: string; source: string }>,
): Promise<{ url: string; source: string } | null> {
  const ambientPin = (ambient.TERMFLEET_PROVIDER_URL || '').trim();
  const schedulePin = (scheduleEnv.TERMFLEET_PROVIDER_URL || '').trim();
  if (ambientPin) return { url: ambientPin, source: 'env' };
  if (schedulePin) return { url: schedulePin, source: 'schedule' };
  if (!resolveDefault) return null;
  try {
    const resolved = await resolveDefault();
    return { url: resolved.baseUrl, source: resolved.source };
  } catch (e) {
    console.error(`[oa] provider: none resolved yet (${(e as Error)?.message ?? e}) — will be resolved (or fail loudly) at launch time.`);
    return null;
  }
}

/** Default `resolveDefault` hook — dynamically imports the adopter repo's own installed
 *  @termfleet/core/local-providers.js (not vendored; a peer dep this CLI drives but never bundles). */
export async function defaultResolveDefaultProvider(): Promise<{ baseUrl: string; source: string }> {
  const { resolveDefaultProvider } = await import('@termfleet/core/local-providers.js');
  return resolveDefaultProvider({});
}
