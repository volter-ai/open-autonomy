// `oa provider up|status|down` (TG.1) — deterministic, repo-unique-port termfleet bring-up. Closes the
// biggest documented local-install stall: ports are box-specific human knowledge today ("twin"/"supercode"
// both recorded no provider port in scheduler/schedule.json's env — the operator had to discover free
// ports by hand and remember to pin them, docs/OPERATIONS.md#pin-the-provider).
//
// What this module does, in order:
//   (i)   derives a REPO-UNIQUE candidate port pair from the install's own path (sha256 -> a seed into
//         the 20000-59999 range), then linear-probes forward until it finds a pair that is genuinely
//         free — NEVER the box-wide documented defaults 7373/7402/7620/7621 (many dev boxes already run
//         termfleet as ambient infrastructure on those ports; a second `serve` there fails silently).
//   (ii)  starts a real `termfleet console serve` + `termfleet provider serve --kind virtual-tmux` on
//         that pair, DETACHED (survives this process exiting), with logs + a state record under
//         `.open-autonomy/runner-state/provider/` (the well-known runner-state directory every other
//         local-runner-cli verb already uses for its own telemetry — see status.ts's last-fire dir,
//         runner-frontend.ts's human-sessions.json/human-attention.md).
//   (iii) pins TERMFLEET_PROVIDER_URL DURABLY into the compiled install's OWN scheduler/schedule.json
//         `env` field IN PLACE — the exact file+field `bin/autonomy-compile.ts --provider-url` seeds at
//         compile time (packages/substrate-local/src/emit.ts) and that every tick's env-builder already
//         reads (src/env.ts's buildTickEnv/resolveProvider; OA-09). Deliberately NOT a re-invocation of a
//         full profile recompile: `@volter/oa` is standalone-publishable and must never import
//         `@open-autonomy/core`/`@open-autonomy/substrate-local` (see termfleet-ambient.d.ts) — a
//         targeted field edit of an ALREADY-compiled install's own config is the minimal, correct,
//         dependency-clean durable-pin mechanism for a re-pin, and it round-trips through the same
//         normalizeSchedule() this package's own config.ts already reads.
//   (iv)  verifies the thing that answered on the port is REALLY termfleet before trusting it — the same
//         two /healthz body shapes `bin/doctor-checks.ts`'s checkProvider relies on:
//         console: `{"ok":true,"service":"console"}`; provider: `{"ok":true,"provider":"<kind>",...}`.
//         A foreign occupant (answers, but not that shape) is NEVER pinned — refused/advanced instead.
//   (v)   idempotent: a healthy pinned provider is a no-op; a dead pinned provider is restarted on the
//         SAME pinned ports (never re-derived — a re-derivation on every call would silently migrate a
//         running install's provider port out from under an ambient TERMFLEET_PROVIDER_URL nobody re-read).
//
// No-core-imports discipline held throughout (README.md "Design contract"): this file imports ONLY node
// builtins. Every termfleet interaction is either (a) shelling out to the ADOPTER repo's own installed
// `termfleet` binary via `npx` (never a static dependency of this package — mirrors env.ts/guards.ts), or
// (b) a bare `fetch()` against its documented HTTP /healthz contract.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { basename, join } from 'node:path';

// =========================================================================================================
// Port derivation + collision probing (TG.1-i)
// =========================================================================================================

/** The documented box-wide termfleet defaults (docs/OPERATIONS.md#2-start-termfleet-console--a-local-provider,
 *  bin/doctor-checks.ts's own fallback candidates) — never picked, even if they happen to be free right now,
 *  so this helper's own output can never collide with the box's own ambient termfleet infra later. */
export const DEFAULT_FORBIDDEN_PORTS = [7373, 7402, 7620, 7621];
export const DEFAULT_RANGE_START = 20000;
export const DEFAULT_RANGE_END = 59999;

export interface PortPair {
  consolePort: number;
  providerPort: number;
}

/** Deterministic seed from the install's own absolute path — same repo -> same first candidate, every
 *  time, on every box (a fresh clone at a DIFFERENT path derives a different seed; that's fine, uniqueness
 *  only needs to hold hard within one box, and the probe below still finds a free pair regardless). */
export function derivePortSeed(repoPath: string): number {
  return createHash('sha256').update(repoPath).digest().readUInt32BE(0);
}

export type PortFreeProbe = (port: number) => Promise<boolean> | boolean;

/** Real free-port probe: attempt to bind, not just TCP-connect — a bind attempt is the only reliable
 *  "is this port truly unused" signal (a connect-only probe reads a filtered/refused port as ambiguous,
 *  and doctor-checks.ts's own provider check separately establishes that "answers something" != "free"). */
function defaultIsPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, '127.0.0.1', () => {
      srv.close(() => resolve(true));
    });
  });
}

export interface PickPortsOptions {
  repoPath: string;
  isPortFree?: PortFreeProbe;
  rangeStart?: number;
  rangeEnd?: number;
  forbidden?: number[];
  maxAttempts?: number;
}

/** Pick a repo-unique, free (consolePort, consolePort+1) pair. Deterministic candidate ORDER (same
 *  repoPath -> same sequence), but the OUTCOME depends on what's actually free right now (collision-probe:
 *  advances past occupied/forbidden candidates). Never returns a pair touching `forbidden`
 *  (default: DEFAULT_FORBIDDEN_PORTS). */
export async function pickProviderPorts(opts: PickPortsOptions): Promise<PortPair> {
  const rangeStart = opts.rangeStart ?? DEFAULT_RANGE_START;
  const rangeEnd = opts.rangeEnd ?? DEFAULT_RANGE_END;
  if (rangeEnd - rangeStart < 2) {
    throw new Error(`[oa] provider: port range ${rangeStart}-${rangeEnd} is too small to hold a console+provider pair`);
  }
  const forbidden = new Set(opts.forbidden ?? DEFAULT_FORBIDDEN_PORTS);
  const isPortFree = opts.isPortFree ?? defaultIsPortFree;
  // consolePort must leave room for providerPort = consolePort + 1 within [rangeStart, rangeEnd].
  const span = rangeEnd - rangeStart; // number of valid consolePort offsets: rangeStart .. rangeEnd-1
  const seed = derivePortSeed(opts.repoPath);
  const maxAttempts = opts.maxAttempts ?? span + 1;
  for (let i = 0; i < maxAttempts; i++) {
    const consolePort = rangeStart + ((seed + i) % span);
    const providerPort = consolePort + 1;
    if (forbidden.has(consolePort) || forbidden.has(providerPort)) continue;
    const [consoleFree, providerFree] = await Promise.all([isPortFree(consolePort), isPortFree(providerPort)]);
    if (consoleFree && providerFree) return { consolePort, providerPort };
  }
  throw new Error(
    `[oa] provider: exhausted ${maxAttempts} candidate port pair(s) in range ${rangeStart}-${rangeEnd} derived ` +
      'from this install\'s own path — every candidate was occupied or forbidden. Widen the range or free some ports.',
  );
}

// =========================================================================================================
// termfleet identity verification (TG.1-iv) — mirrors bin/doctor-checks.ts's checkProvider body shapes.
// =========================================================================================================

export interface IdentityCheck {
  reachable: boolean;
  isTermfleet: boolean;
  detail: string;
  body?: unknown;
}

/** Three-way healthz probe (fix D2). The distinction that matters — and that bin/doctor-checks.ts's
 *  checkProvider enforces ("port occupied but NOT answering as this install's termfleet provider") — is
 *  between a port that is DEAD (connection refused / timed out: nothing there, safe to [re]spawn onto)
 *  and a port that ANSWERED anything at all over HTTP (something LIVE holds it — if the answer isn't
 *  termfleet-shaped, it is a FOREIGN occupant that must never be killed-by-recorded-pid, spawned onto,
 *  or pinned). A plain `python3 -m http.server` 404s /healthz; a non-JSON banner is equally foreign.
 *  Only a transport-level failure means "nothing is listening". */
async function fetchHealthz(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<{ kind: 'unreachable'; error: string } | { kind: 'answered'; body?: unknown; note?: string }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${url.replace(/\/$/, '')}/healthz`, { signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) return { kind: 'answered', note: `HTTP ${res.status}` };
    try {
      return { kind: 'answered', body: await res.json() };
    } catch {
      return { kind: 'answered', note: 'HTTP 200 but the body was not valid JSON' };
    }
  } catch (e) {
    clearTimeout(t);
    return { kind: 'unreachable', error: (e as Error)?.message ?? String(e) };
  }
}

/** `{"ok":true,"service":"console"}` — termfleet's console-server.js's literal /healthz body. */
export function isTermfleetConsoleBody(body: unknown): boolean {
  return !!body && typeof body === 'object' && (body as Record<string, unknown>).ok === true && (body as Record<string, unknown>).service === 'console';
}
/** `{"ok":true,"provider":"<kind>",...}` — termfleet's provider-engine.js's literal /healthz body
 *  (getHealth() = driver health + build info + optional instanceId). Same predicate bin/doctor-checks.ts's
 *  server-side `assertTermfleetProviderIdentity` uses. */
export function isTermfleetProviderBody(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return b.ok === true && typeof b.provider === 'string' && b.provider.trim().length > 0;
}

export async function verifyConsoleIdentity(url: string, fetchImpl: typeof fetch = fetch, timeoutMs = 3000): Promise<IdentityCheck> {
  const r = await fetchHealthz(url, fetchImpl, timeoutMs);
  if (r.kind === 'unreachable') return { reachable: false, isTermfleet: false, detail: r.error };
  const ok = isTermfleetConsoleBody(r.body);
  return {
    reachable: true,
    isTermfleet: ok,
    detail: ok ? 'termfleet console' : `answered but NOT a termfleet console (${r.note ?? `body: ${JSON.stringify(r.body)}`})`,
    body: r.body,
  };
}
export async function verifyProviderIdentity(url: string, fetchImpl: typeof fetch = fetch, timeoutMs = 3000): Promise<IdentityCheck> {
  const r = await fetchHealthz(url, fetchImpl, timeoutMs);
  if (r.kind === 'unreachable') return { reachable: false, isTermfleet: false, detail: r.error };
  const ok = isTermfleetProviderBody(r.body);
  const kind = ok ? (r.body as Record<string, unknown>).provider : undefined;
  return {
    reachable: true,
    isTermfleet: ok,
    detail: ok ? `termfleet provider (kind '${kind}')` : `answered but NOT a termfleet provider (${r.note ?? `body: ${JSON.stringify(r.body)}`})`,
    body: r.body,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll until the endpoint answers at all (success OR a definitive foreign answer) or the timeout expires.
 *  Stopping on the FIRST reachable response (not just a termfleet-shaped one) means a foreign occupant is
 *  detected immediately rather than being masked by a full timeout wait. */
async function pollForIdentity(
  url: string,
  kind: 'console' | 'provider',
  fetchImpl: typeof fetch,
  timeoutMs: number,
  intervalMs: number,
): Promise<IdentityCheck> {
  const deadline = Date.now() + timeoutMs;
  let last: IdentityCheck = { reachable: false, isTermfleet: false, detail: 'not probed yet' };
  for (;;) {
    last = kind === 'console' ? await verifyConsoleIdentity(url, fetchImpl, 2000) : await verifyProviderIdentity(url, fetchImpl, 2000);
    if (last.reachable) return last;
    if (Date.now() >= deadline) return last;
    await sleep(intervalMs);
  }
}

// =========================================================================================================
// Durable pin (TG.1-iii) — scheduler/schedule.json's env field, in place.
// =========================================================================================================

function schedulePath(cwd: string): string {
  return process.env.AUTONOMY_SCHEDULE ?? join(cwd, 'scheduler', 'schedule.json');
}

/** Read the currently-pinned TERMFLEET_PROVIDER_URL out of scheduler/schedule.json's env, if any. Mirrors
 *  config.ts's own tolerant-read style (missing file / malformed JSON -> undefined, never throws). */
export function readSchedulePin(cwd: string): string | undefined {
  const p = schedulePath(cwd);
  if (!existsSync(p)) return undefined;
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8')) as { env?: Record<string, unknown> };
    const v = raw.env?.TERMFLEET_PROVIDER_URL;
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  } catch {
    return undefined;
  }
}

/** Write TERMFLEET_PROVIDER_URL into scheduler/schedule.json's `env` field IN PLACE — see module header
 *  for why this (not a recompile) is the real durable-pin mechanism this package uses. Preserves every
 *  other key and the schedule's own shape (legacy `scripts: string[]` or the new per-script object form)
 *  byte-for-byte apart from the one field; matches emit.ts's own `JSON.stringify(obj, null, 2) + '\n'`
 *  formatting so a diff against a compile-time pin is a one-line change, not a reformat. */
export function pinScheduleProviderUrl(cwd: string, url: string): void {
  const p = schedulePath(cwd);
  if (!existsSync(p)) {
    throw new Error(
      `[oa] provider: ${p} does not exist — this does not look like a compiled local install ` +
        '(run `bun bin/autonomy-compile.ts <profile> local <dir>` first).',
    );
  }
  const raw = JSON.parse(readFileSync(p, 'utf8')) as { env?: Record<string, unknown> };
  raw.env = { ...(raw.env ?? {}), TERMFLEET_PROVIDER_URL: url };
  writeFileSync(p, `${JSON.stringify(raw, null, 2)}\n`);
}

// =========================================================================================================
// State record — .open-autonomy/runner-state/provider/ (idempotency + `down`'s only source of truth)
// =========================================================================================================

export interface ProviderState {
  repoPath: string;
  prefix: string;
  consolePort: number;
  providerPort: number;
  consoleUrl: string;
  providerUrl: string;
  consolePid?: number;
  providerPid?: number;
  startedAt: string;
  stoppedAt?: string;
}

function stateDir(cwd: string): string {
  return join(cwd, '.open-autonomy', 'runner-state', 'provider');
}
function statePath(cwd: string): string {
  return join(stateDir(cwd), 'state.json');
}

export function readProviderState(cwd: string): ProviderState | undefined {
  const p = statePath(cwd);
  if (!existsSync(p)) return undefined;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as ProviderState;
  } catch {
    return undefined;
  }
}
function writeProviderState(cwd: string, state: ProviderState): void {
  mkdirSync(stateDir(cwd), { recursive: true });
  writeFileSync(statePath(cwd), `${JSON.stringify(state, null, 2)}\n`);
}
function openLogFd(cwd: string, name: string): number {
  mkdirSync(stateDir(cwd), { recursive: true });
  return openSync(join(stateDir(cwd), name), 'a');
}

// =========================================================================================================
// Bring-up (TG.1-ii, v)
// =========================================================================================================

export interface SpawnedProcess {
  pid?: number;
  unref?: () => void;
}
/** The one process-spawning seam bring-up goes through — defaults to a real detached `spawn`; tests
 *  inject a stub so the suite never launches a real termfleet process (mirrors src/proc.ts's `ProcRunner`
 *  seam used throughout the rest of this package). */
export type SpawnImpl = (cmd: string, args: string[], opts: { cwd: string; stdio: [unknown, number, number]; detached: boolean }) => SpawnedProcess;

function defaultSpawn(cmd: string, args: string[], opts: { cwd: string; stdio: [unknown, number, number]; detached: boolean }): SpawnedProcess {
  const stdio = opts.stdio as ['ignore', number, number];
  return spawn(cmd, args, { cwd: opts.cwd, stdio, detached: opts.detached, env: process.env });
}

class ForeignOccupantError extends Error {
  readonly foreignOccupant = true as const;
}

/** The one process-KILLING seam (fix D1) — mirrors the SpawnImpl seam so tests can record/deny kills
 *  without real processes. Default: `killProcessTree` (group-kill, see below). */
export type KillImpl = (pid: number, signal: NodeJS.Signals) => void;

export interface BringUpOptions {
  cwd?: string;
  fetchImpl?: typeof fetch;
  isPortFree?: PortFreeProbe;
  spawnImpl?: SpawnImpl;
  kill?: KillImpl;
  rangeStart?: number;
  rangeEnd?: number;
  forbidden?: number[];
  prefix?: string;
  pollTimeoutMs?: number;
  pollIntervalMs?: number;
  npxCmd?: string;
  now?: () => string;
}

export interface BringUpResult {
  action: 'started' | 'restarted' | 'noop' | 'foreign-occupant-refused';
  state?: ProviderState;
  providerUrl?: string;
  consoleUrl?: string;
  detail: string;
}

interface StartCtx {
  fetchImpl: typeof fetch;
  spawnImpl: SpawnImpl;
  kill: KillImpl;
  npxCmd: string;
  pollTimeoutMs: number;
  pollIntervalMs: number;
  now: () => string;
  action: 'started' | 'restarted';
}

async function startOn(cwd: string, prefix: string, consolePort: number, providerPort: number, ctx: StartCtx): Promise<BringUpResult> {
  const consoleUrl = `http://127.0.0.1:${consolePort}`;
  const providerUrl = `http://127.0.0.1:${providerPort}`;

  const consoleLogFd = openLogFd(cwd, 'console.log');
  const providerLogFd = openLogFd(cwd, 'provider.log');
  // `--no-auto-local-adapters`: console serve otherwise tries to open a local terminal-emulator window
  // (iTerm/WezTerm) it has no business opening for a headless provider bring-up (and which throws on a
  // box with no GUI terminal at all, e.g. `spawnSync osascript ENOENT` on Linux/CI).
  const consoleChild = ctx.spawnImpl(
    ctx.npxCmd,
    ['--yes', 'termfleet', 'console', 'serve', '--name', prefix, '--port', String(consolePort), '--no-auto-local-adapters'],
    { cwd, stdio: ['ignore', consoleLogFd, consoleLogFd], detached: true },
  );
  consoleChild.unref?.();
  const providerChild = ctx.spawnImpl(
    ctx.npxCmd,
    ['--yes', 'termfleet', 'provider', 'serve', '--kind', 'virtual-tmux', '--prefix', prefix, '--count', '1', '--port', String(providerPort)],
    { cwd, stdio: ['ignore', providerLogFd, providerLogFd], detached: true },
  );
  providerChild.unref?.();

  // Fix D1: from here on, ANY throw (foreign occupant, poll timeout, a failed pin write) leaves two live
  // detached process trees this call just spawned, that no state record tracks and no later `down` can
  // therefore ever clean. Group-kill BOTH just-spawned trees before letting the error propagate — this is
  // the error-path mirror of providerDown's own npx-forks-the-real-server tree-kill.
  try {
    const [consoleId, providerId] = await Promise.all([
      pollForIdentity(consoleUrl, 'console', ctx.fetchImpl, ctx.pollTimeoutMs, ctx.pollIntervalMs),
      pollForIdentity(providerUrl, 'provider', ctx.fetchImpl, ctx.pollTimeoutMs, ctx.pollIntervalMs),
    ]);

    // The PROVIDER is the one thing TERMFLEET_PROVIDER_URL ever points at — a foreign occupant there must
    // never be pinned. (A foreign console is logged but non-fatal: nothing downstream reads a console pin.)
    if (providerId.reachable && !providerId.isTermfleet) {
      throw new ForeignOccupantError(
        `port ${providerPort} answered but NOT as a termfleet provider — ${providerId.detail}. Refusing to pin a foreign occupant; never launched here.`,
      );
    }
    if (!providerId.reachable) {
      throw new Error(
        `[oa] provider: launched \`termfleet provider serve\` on port ${providerPort} but it never answered /healthz within ` +
          `${ctx.pollTimeoutMs}ms (${providerId.detail}). See .open-autonomy/runner-state/provider/provider.log.`,
      );
    }

    pinScheduleProviderUrl(cwd, providerUrl);

    const state: ProviderState = {
      repoPath: cwd,
      prefix,
      consolePort,
      providerPort,
      consoleUrl,
      providerUrl,
      consolePid: consoleChild.pid,
      providerPid: providerChild.pid,
      startedAt: ctx.now(),
    };
    writeProviderState(cwd, state);

    const consoleNote =
      consoleId.reachable && !consoleId.isTermfleet
        ? `FOREIGN occupant, ignored (${consoleId.detail})`
        : consoleId.isTermfleet
          ? 'OK'
          : `not healthy (${consoleId.detail})`;
    return {
      action: ctx.action,
      state,
      providerUrl,
      consoleUrl,
      detail:
        `${ctx.action} termfleet on repo-unique ports — console ${consoleUrl} (${consoleNote}), provider ${providerUrl} ` +
        `(${providerId.detail}). Pinned scheduler/schedule.json env.TERMFLEET_PROVIDER_URL="${providerUrl}".`,
    };
  } catch (e) {
    bestEffortKill(consoleChild.pid, ctx.kill);
    bestEffortKill(providerChild.pid, ctx.kill);
    throw e;
  }
}

/** `spawn(..., { detached: true })` makes `pid` its OWN process-group leader — but what we actually spawn
 *  is `npx`, which FORKS the real termfleet server as a child rather than exec-replacing itself (verified
 *  live: `npx ... termfleet provider serve` leaves npx's own pid AND a separate `node .../termfleet`
 *  server pid both running). Signaling only the direct pid therefore orphans the real server. Kill the
 *  whole process GROUP via the POSIX negative-pid convention (reaches npx + its child in one signal);
 *  fall back to the direct pid if group-kill fails (e.g. it was somehow not a group leader). */
function killProcessTree(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    process.kill(pid, signal);
  }
}

function bestEffortKill(pid: number | undefined, kill: KillImpl = killProcessTree): void {
  if (!pid) return;
  try {
    kill(pid, 'SIGTERM');
  } catch {
    /* already dead — nothing to do */
  }
}

// =========================================================================================================
// planBringUpProvider (TE.5 --dry-run seam) — the SAME idempotency/identity decision `bringUpProvider`
// makes, computed WITHOUT ever spawning a process, pinning the schedule, or writing any state file. Every
// read here is already independently safe: `readProviderState`/`readSchedulePin` are plain file reads;
// `verifyConsoleIdentity`/`verifyProviderIdentity` are non-mutating HTTP GETs to a URL a PRIOR real
// bring-up (not this call) may already be serving; `pickProviderPorts` only ever *binds-then-immediately-
// closes* a candidate port to test freedom (`defaultIsPortFree`) — it never keeps the socket open, never
// spawns termfleet, never writes anything. This is the one bring-up leg the near-miss this unit fixes was
// actually about (a real termfleet provider is itself the first half of the hazard) — a dry-run caller must
// see the exact ports/URL a real run would use without that real run ever happening.
export interface PlanBringUpResult {
  action: 'would-noop' | 'would-restart' | 'would-start' | 'would-refuse-foreign-occupant';
  detail: string;
  providerUrl?: string;
  consoleUrl?: string;
  consolePort?: number;
  providerPort?: number;
}

export async function planBringUpProvider(opts: BringUpOptions = {}): Promise<PlanBringUpResult> {
  const cwd = opts.cwd ?? process.cwd();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const isPortFree = opts.isPortFree ?? defaultIsPortFree;

  const existing = readProviderState(cwd);
  if (existing) {
    const [consoleId, providerId] = await Promise.all([
      verifyConsoleIdentity(existing.consoleUrl, fetchImpl),
      verifyProviderIdentity(existing.providerUrl, fetchImpl),
    ]);
    if (providerId.reachable && providerId.isTermfleet) {
      return {
        action: 'would-noop',
        providerUrl: existing.providerUrl,
        consoleUrl: existing.consoleUrl,
        consolePort: existing.consolePort,
        providerPort: existing.providerPort,
        detail:
          `[DRY-RUN] would be a no-op: provider ${existing.providerUrl} already answers as termfleet (${providerId.detail}); ` +
          `console ${consoleId.isTermfleet ? 'also healthy' : `NOT healthy (${consoleId.detail})`}. Nothing would be spawned/pinned.`,
      };
    }
    if (providerId.reachable && !providerId.isTermfleet) {
      return {
        action: 'would-refuse-foreign-occupant',
        detail:
          `[DRY-RUN] would REFUSE: ${existing.providerUrl} (this install's pinned port) is occupied by a FOREIGN ` +
          `(non-termfleet) service — ${providerId.detail}. A real run would not restart or re-pin over it.`,
      };
    }
    return {
      action: 'would-restart',
      providerUrl: existing.providerUrl,
      consoleUrl: existing.consoleUrl,
      consolePort: existing.consolePort,
      providerPort: existing.providerPort,
      detail:
        `[DRY-RUN] would restart termfleet on the SAME already-pinned ports — console ${existing.consoleUrl}, ` +
        `provider ${existing.providerUrl} (currently unreachable: ${providerId.detail}). A real run would SIGTERM the ` +
        `recorded pids (${existing.consolePid ?? '?'}/${existing.providerPid ?? '?'}) and re-spawn on the same pair; never re-derived.`,
    };
  }

  // Fresh bring-up: derive the SAME repo-unique candidate pair a real call would pick — a pure bind-probe,
  // never a spawn.
  const { consolePort, providerPort } = await pickProviderPorts({
    repoPath: cwd,
    isPortFree,
    rangeStart: opts.rangeStart,
    rangeEnd: opts.rangeEnd,
    forbidden: opts.forbidden,
  });
  const consoleUrl = `http://127.0.0.1:${consolePort}`;
  const providerUrl = `http://127.0.0.1:${providerPort}`;
  return {
    action: 'would-start',
    providerUrl,
    consoleUrl,
    consolePort,
    providerPort,
    detail:
      `[DRY-RUN] would start termfleet on repo-unique ports derived from ${cwd} — console ${consoleUrl}, provider ` +
      `${providerUrl} (via \`npx --yes termfleet console serve --port ${consolePort}\` + \`npx --yes termfleet ` +
      `provider serve --kind virtual-tmux --port ${providerPort}\`), then pin scheduler/schedule.json ` +
      `env.TERMFLEET_PROVIDER_URL="${providerUrl}". NOT spawned, NOT pinned by this call.`,
  };
}

/** Bring up a repo-unique-port termfleet provider for the compiled install at `cwd`, idempotently. See
 *  the module header for the full (i)-(v) contract. */
export async function bringUpProvider(opts: BringUpOptions = {}): Promise<BringUpResult> {
  const cwd = opts.cwd ?? process.cwd();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const isPortFree = opts.isPortFree ?? defaultIsPortFree;
  const spawnImpl = opts.spawnImpl ?? defaultSpawn;
  const kill = opts.kill ?? killProcessTree;
  const npxCmd = opts.npxCmd ?? 'npx';
  const pollTimeoutMs = opts.pollTimeoutMs ?? 15000;
  const pollIntervalMs = opts.pollIntervalMs ?? 250;
  const now = opts.now ?? (() => new Date().toISOString());
  const ctxBase = { fetchImpl, spawnImpl, kill, npxCmd, pollTimeoutMs, pollIntervalMs, now };

  const existing = readProviderState(cwd);
  if (existing) {
    const [consoleId, providerId] = await Promise.all([
      verifyConsoleIdentity(existing.consoleUrl, fetchImpl),
      verifyProviderIdentity(existing.providerUrl, fetchImpl),
    ]);

    if (providerId.reachable && providerId.isTermfleet) {
      // Healthy pinned provider -> idempotent no-op. Self-heal the pin if something external cleared it.
      if (readSchedulePin(cwd) !== existing.providerUrl) pinScheduleProviderUrl(cwd, existing.providerUrl);
      return {
        action: 'noop',
        state: existing,
        providerUrl: existing.providerUrl,
        consoleUrl: existing.consoleUrl,
        detail:
          `already up: provider ${existing.providerUrl} answers as termfleet (${providerId.detail}); console ` +
          `${consoleId.isTermfleet ? 'also healthy' : `NOT healthy (${consoleId.detail})`} — no-op.`,
      };
    }

    if (providerId.reachable && !providerId.isTermfleet) {
      // Our pinned port is now occupied by something that isn't termfleet -- never restart/re-pin over it.
      return {
        action: 'foreign-occupant-refused',
        state: existing,
        detail:
          `refusing: ${existing.providerUrl} (this install's pinned port) is occupied by a FOREIGN ` +
          `(non-termfleet) service — ${providerId.detail}. Not restarting or re-pinning; free the port or ` +
          'investigate the occupant first.',
      };
    }

    // Provider port genuinely DEAD (transport-level refusal — fix D2 guarantees a port that answered
    // ANYTHING, even a 404, took the foreign-occupant branch above and never reaches this SIGTERM) ->
    // reap this install's own recorded pids and restart on the SAME pinned ports, never re-derive.
    bestEffortKill(existing.consolePid, kill);
    bestEffortKill(existing.providerPid, kill);
    try {
      return await startOn(cwd, existing.prefix, existing.consolePort, existing.providerPort, { ...ctxBase, action: 'restarted' });
    } catch (e) {
      if (e instanceof ForeignOccupantError) {
        return { action: 'foreign-occupant-refused', state: existing, detail: e.message };
      }
      throw e;
    }
  }

  // Fresh bring-up: derive a repo-unique candidate pair and verify it's genuinely free before touching it.
  const prefix = opts.prefix ?? `${basename(cwd)}-oa`;
  const excluded = new Set<number>();
  const wrappedIsPortFree: PortFreeProbe = async (p) => (excluded.has(p) ? false : isPortFree(p));

  const attempts = 5;
  let lastRefusal: string | undefined;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const { consolePort, providerPort } = await pickProviderPorts({
      repoPath: cwd,
      isPortFree: wrappedIsPortFree,
      rangeStart: opts.rangeStart,
      rangeEnd: opts.rangeEnd,
      forbidden: opts.forbidden,
    });
    try {
      return await startOn(cwd, prefix, consolePort, providerPort, { ...ctxBase, action: 'started' });
    } catch (e) {
      if (e instanceof ForeignOccupantError) {
        lastRefusal = e.message;
        excluded.add(consolePort);
        excluded.add(providerPort);
        continue;
      }
      throw e;
    }
  }
  throw new Error(`[oa] provider: could not bring up a genuine termfleet provider after ${attempts} attempt(s) — last refusal: ${lastRefusal ?? '(unknown)'}`);
}

// =========================================================================================================
// status / down
// =========================================================================================================

export interface ProviderStatusResult {
  running: boolean;
  state?: ProviderState;
  console?: IdentityCheck;
  provider?: IdentityCheck;
  detail: string;
}

export async function providerStatus(opts: { cwd?: string; fetchImpl?: typeof fetch } = {}): Promise<ProviderStatusResult> {
  const cwd = opts.cwd ?? process.cwd();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const state = readProviderState(cwd);
  if (!state) {
    return { running: false, detail: 'no provider state recorded for this install (never brought up via `oa provider up`)' };
  }
  const [consoleId, providerId] = await Promise.all([verifyConsoleIdentity(state.consoleUrl, fetchImpl), verifyProviderIdentity(state.providerUrl, fetchImpl)]);
  const running = providerId.reachable && providerId.isTermfleet;
  const consoleNote = consoleId.reachable ? (consoleId.isTermfleet ? 'UP' : `occupied by something else (${consoleId.detail})`) : 'down';
  const providerNote = providerId.reachable ? (running ? 'UP' : `OCCUPIED BY NON-TERMFLEET (${providerId.detail})`) : 'DOWN';
  return {
    running,
    state,
    console: consoleId,
    provider: providerId,
    detail: `provider ${state.providerUrl}: ${providerNote}; console ${state.consoleUrl}: ${consoleNote}${state.stoppedAt ? ` (recorded stopped at ${state.stoppedAt})` : ''}`,
  };
}

export interface ProviderDownResult {
  action: 'stopped' | 'not-running';
  detail: string;
}

export function providerDown(opts: { cwd?: string; now?: () => string; kill?: (pid: number, signal: NodeJS.Signals) => void } = {}): ProviderDownResult {
  const cwd = opts.cwd ?? process.cwd();
  const now = opts.now ?? (() => new Date().toISOString());
  const kill = opts.kill ?? killProcessTree;
  const state = readProviderState(cwd);
  if (!state || state.stoppedAt) {
    return {
      action: 'not-running',
      detail: state ? `already stopped at ${state.stoppedAt}` : 'no provider state recorded for this install — nothing to stop',
    };
  }
  const killed: string[] = [];
  for (const [label, pid] of [
    ['console', state.consolePid],
    ['provider', state.providerPid],
  ] as const) {
    if (!pid) continue;
    try {
      kill(pid, 'SIGTERM');
      killed.push(`${label} (pid ${pid})`);
    } catch (e) {
      killed.push(`${label} (pid ${pid}) — kill failed: ${(e as Error).message} (already dead?)`);
    }
  }
  writeProviderState(cwd, { ...state, stoppedAt: now() });
  return { action: 'stopped', detail: `sent SIGTERM to: ${killed.join(', ') || '(no pids recorded)'}` };
}
