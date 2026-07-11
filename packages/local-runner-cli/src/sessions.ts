// The runner SDK seam. Design contract: "the CLI reads them from cwd" — the adopter repo's own emitted
// scripts/autonomy-runner.mjs (compileLocal's vendored TermfleetRunner) is dynamically imported from
// `<cwd>/scripts/autonomy-runner.mjs`, never bundled into this package. Tests inject a stub SessionRunner
// object directly (src/test-support/stub-session-runner.ts) — no real termfleet provider, no real file
// needed on disk.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import type { Session, SessionRunner } from './types.ts';

/** Best-effort construction of the default SessionRunner — dynamically imports the adopter repo's own
 *  `scripts/autonomy-runner.mjs` (a plain .mjs file with zero deps on this package, matching run.mjs's
 *  own import shape) and wraps its TermfleetRunner class. Returns null if unavailable (fresh install with
 *  no runner emitted yet, or the import throws) — callers degrade to the CLI-fallback path below. */
export async function defaultSessionRunner(cwd: string = process.cwd()): Promise<SessionRunner | null> {
  try {
    const mod = await import(join(cwd, 'scripts', 'autonomy-runner.mjs'));
    const runner = new mod.TermfleetRunner();
    return {
      list: () => runner.list(),
      reapIdle: (opts) => runner.reapIdle(opts),
    };
  } catch (e) {
    console.error('[oa] reaping/session-probe disabled (runner unavailable):', (e as Error)?.message ?? e);
    return null;
  }
}

/** Best-effort live-session snapshot for the reconciler's "no session in flight" check (the
 *  respawn-trigger use of the AUTONOMY_SINGLETON primitive). Prefers the already-constructed
 *  SessionRunner (no extra process); falls back to shelling out to the exact CLI
 *  `autonomy-runner.mjs list` uses if that import failed, so the reconciler still has SOME signal in that
 *  degraded mode. Returns null (not []) on total failure so the caller can tell "confirmed nothing
 *  running" from "couldn't ask" and fail CLOSED — never risk stacking a second session on top of one the
 *  loop simply couldn't see. */
export async function listSessionsBestEffort(cwd: string, runner: SessionRunner | null): Promise<Session[] | null> {
  if (runner) {
    try {
      return await runner.list();
    } catch (e) {
      console.error('[oa] session probe failed (runner.list):', (e as Error)?.message ?? e);
    }
  }
  const r = spawnSync('node', [join(cwd, 'scripts', 'autonomy-runner.mjs'), 'list'], { cwd, encoding: 'utf8' });
  if (r.status === 0) {
    try {
      return JSON.parse(r.stdout || '[]');
    } catch {
      /* fall through */
    }
  }
  return null;
}
