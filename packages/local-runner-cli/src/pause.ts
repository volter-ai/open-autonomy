// The `.open-autonomy/paused` marker file — DESIGN CONTRACT: it stays the source of truth. `oa pause`
// touches it (an agent action never deletes it); `oa resume` removes it (a human typing the CLI verb IS
// the operator's act — same authority as the documented `rm .open-autonomy/paused`, just spelled `oa
// resume`). `oa status`/the reconciler only ever READ it. The CLI is ergonomics over the file, never a
// daemon holding state of its own.
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function pausedMarkerPath(cwd: string = process.cwd()): string {
  return join(cwd, '.open-autonomy', 'paused');
}

export function isPaused(cwd: string = process.cwd()): boolean {
  return existsSync(pausedMarkerPath(cwd));
}

export function pausedMessage(cwd: string = process.cwd()): string {
  return (
    '[oa] PAUSED — fresh installs start paused so an existing backlog is never dispatched unreviewed.\n' +
    '[oa] review the board, then unpause:  oa resume   (or: rm .open-autonomy/paused — details: ' +
    pausedMarkerPath(cwd) +
    ')'
  );
}

/** `oa pause [reason]` — touches the marker (creates it if absent; content is human-readable, matching
 *  the seed-once marker compileLocal writes). Idempotent: pausing an already-paused install just leaves
 *  the file in place (never deletes-then-recreates, so an operator's own rationale in the file is
 *  preserved unless they explicitly overwrite it by passing a new reason). */
export function pause(opts: { cwd?: string; reason?: string } = {}): { alreadyPaused: boolean; path: string } {
  const cwd = opts.cwd ?? process.cwd();
  const path = pausedMarkerPath(cwd);
  const alreadyPaused = existsSync(path);
  if (!alreadyPaused || opts.reason) {
    const body =
      opts.reason ??
      'This open-autonomy install is PAUSED (touched via `oa pause`).\nUnpause:  oa resume   (or: rm .open-autonomy/paused)\n';
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body.endsWith('\n') ? body : `${body}\n`);
  }
  return { alreadyPaused, path };
}

/** `oa resume` — removes the marker. Prints DRAIN semantics: pausing never kills an in-flight wave (the
 *  reconciler leaves it running to completion); resuming just re-arms new fires on the next heartbeat —
 *  there is no separate "drain" step to wait for on the resume side, only on the pause side. */
export function resume(opts: { cwd?: string } = {}): { wasPaused: boolean; path: string } {
  const cwd = opts.cwd ?? process.cwd();
  const path = pausedMarkerPath(cwd);
  const wasPaused = existsSync(path);
  if (wasPaused) unlinkSync(path);
  return { wasPaused, path };
}

export function pauseReasonText(cwd: string = process.cwd()): string | null {
  const path = pausedMarkerPath(cwd);
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

export const DRAIN_NOTE =
  'drain semantics: pausing never kills an in-flight wave — the current session runs to completion; only ' +
  'a NEW fire is blocked. Resuming re-arms new fires within one reconcile period (~20s heartbeat), no drain wait.';
