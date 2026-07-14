// The LOCAL substrate's agent-facing Runner seam — the same interface the agents import on github
// (`launch`/`list`), realized through the local loop instead of `gh workflow run`. The agent code is
// identical across substrates; only THIS file differs. Tasks/artifact stay on gh regardless of
// substrate — the runner is the one seam.
//
// Like the github seam it is BOTH a module and a uniform agent-facing CLI, so a prose orchestrator (the
// PM) dispatches a worker the SAME way on every substrate:
//   bun scripts/runner.ts launch <agent> --ref <work-item>   # dispatch a worker on demand
//   bun scripts/runner.ts list   <agent>                     # its in-flight sessions (JSON)
// `--ref` is the work item (the `subject.ref` source); locally it is forwarded under the worker's OWN
// declared param name (e.g. ZTRACK_ISSUE) resolved from the manifest. Extra `--key value` pairs pass through.
//
// Two launch realizations, mirroring github's script-vs-skill split (a deterministic job vs the codex
// wrapper):
//   - a SCRIPT agent (behavior is a .ts/.mjs/.js) → run it via bun, with its declared trigger params
//     resolved from the launch params into env (the local analogue of github's workflow env mapping);
//   - a SKILL agent → a termfleet session via the launch adapter (run-agent.mjs → TermfleetRunner).
//
// Emitted verbatim by compileLocal as scripts/runner.ts so an agent's `import './runner.js'` resolves.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync, appendFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join, resolve } from 'node:path';

export interface LaunchParams {
  [key: string]: string | number;
}
export interface RunInfo {
  id: string;
  status: string;
  conclusion: string | null;
  title: string;
  ref?: string; // the work-item this session is isolated for (the issue number) — lets a caller dedup per issue
}

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const isScript = (behavior: string): boolean => /\.(ts|mjs|js)$/.test(behavior);

/** The primary checkout that owns runtime control/state for every linked worktree. A nested agent may
 * invoke this runner from its own worktree; resolving through git's common directory keeps fences,
 * session state, effects, and child worktrees shared instead of silently forking them per checkout. */
export function installRoot(cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env): string {
  const configured = (env.AUTONOMY_CONTROL_ROOT ?? '').trim();
  if (configured) return resolve(cwd, configured);
  const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd).stdout.trim();
  if (common && basename(common) === '.git') return dirname(common);
  return cwd;
}

const controlPath = (relative: string): string =>
  resolve(installRoot(), relative);

// --- the PAUSE gate (OA-07): defense in depth at the launch seam -------------------------------------
// The scheduler (scheduler/run.mjs) is the primary fence — it never fires a tick while paused. This is the
// SECOND, independent check: even a manually invoked `runner.ts launch`, or a tick that raced the marker
// between its own check and the launch, must still refuse. Scoped to the same file the scheduler checks,
// relative to cwd (this CLI is always invoked from the install root — same convention as
// `.open-autonomy/autonomy.yml` below). EXCEPT the human route: `launchHuman` parks an ask for a person,
// which spends nothing, so it stays unaffected (see `launch` below — the check is skipped for `kind === 'human'`).
const PAUSED_PATH = '.open-autonomy/paused';
export class PausedError extends Error {
  constructor() {
    super('paused');
    this.name = 'PausedError';
  }
}
function pausedMessage(fence = PAUSED_PATH): string {
  return (
    `[runner] PAUSED — launch is fenced by ${fence}.\n` +
    `[runner] review the relevant work, then unpause:  rm ${fence}`
  );
}

// --- the SKILL pre-check (OA-08): refuse a launch whose invocation cannot resolve --------------------------
// A skill agent's launch prompt is `/behavior` (claude) or `$behavior` (codex) — emit.ts:436-437 — which the
// coding CLI resolves against THIS session's cwd (the worktree, or the trunk checkout with no `--branch`). A
// worktree materializes only what is committed on its base; a missing/uncommitted/renamed skill there dies
// silently inside the model session ("Unknown command: /develop") with no signal anywhere upstream (the
// audit's F-7: the runner reports success, the dead session later reads `done`, the PM re-dispatches
// forever). This check is a plain existsSync, deterministic and free — it runs BEFORE any termfleet spend
// and refuses the launch outright: no session is created, no post-session effect marker is recorded.
export class SkillMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillMissingError';
  }
}

interface ManifestAgent {
  kind?: 'agent' | 'human'; // `human` -> a person; the runner PARKS a session instead of executing one
  skill?: string;
  params?: Record<string, string>;
  capabilities?: string[];
  review?: string; // the reviewer agent that judges this proposer's PRs (the merge-boundary review edge)
  execution?: { workspace?: string }; // portable isolation request; validated by core when compiled
  // An opaque shell command declared on ONE agent's manifest entry (e.g. a loop-control arm) that the
  // runner executes in the session's own cwd BEFORE spawning it. The runner stays METHODOLOGY-FREE here:
  // this string is DATA the manifest supplies, never a hardcoded per-agent branch — the runner would run
  // this identically for any agent that declared a `prelaunch:`, and does nothing at all for one that
  // doesn't (most agents declare none, so this is a no-op for them).
  prelaunch?: string;
}

// --- post-session effects: the LOCAL mirror of github's post-skill job step --------------------------------
// On github, a proposer's job runs the propose effect (agent-propose) as a STEP after the skill step — same
// job, same checkout. Locally the session runs ASYNCHRONOUSLY in a termfleet window, so the launch process
// cannot run the effect; the loop's reaper observes the session finishing. So launch RECORDS a pending effect
// (keyed by the session's terminalId — the join key the reaper reports back), and the loop runs it once that
// session is gone (scheduler/run.mjs's reconcilePendingEffects). The effect is gated on two EXPLICIT, universal
// signals — never on a capability: (1) the caller explicitly named a proposal branch, and (2)
// the install targets a `github` CODE HOST (a declared IR signal; only there does a finished branch become a
// PR — a local-git code host has the PM merge worktrees, no PR). The runner never learns what the effect DOES
// — no issue/tracker/branch methodology re-enters it (architecture invariant `substrate-is-runner-only`).
const effectsDir = (): string => controlPath('.open-autonomy/runner-state/effects');

// autonomy-runner prints the launched session as JSON ({ id: terminalId, agent, ... }) on its last output line.
export function terminalIdFromLaunch(stdout: string): string {
  for (const line of stdout.trim().split('\n').reverse()) {
    try {
      const o = JSON.parse(line) as { id?: unknown };
      if (o && typeof o.id === 'string') return o.id;
    } catch {
      /* not the JSON line */
    }
  }
  return '';
}
interface EffectMarker {
  id: string;
  agent: string;
  ref: string; // the work-item (issue number) this session is isolated for — surfaced in `list` for per-issue dedup
  worktree: string;
  effect: string;
  env: Record<string, string>;
}

interface WorkspaceLease {
  schema: 'open-autonomy.workspace-lease.v1';
  id: string;
  agent: string;
  branch: string;
  worktree: string;
  createdAt: string;
}

function recordWorkspaceLease(lease: Omit<WorkspaceLease, 'schema' | 'createdAt'>): void {
  const dir = controlPath('.open-autonomy/runner-state/workspaces');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${lease.id.replace(/[^0-9A-Za-z._-]/g, '-')}.json`);
  writeFileSync(file, `${JSON.stringify({
    schema: 'open-autonomy.workspace-lease.v1',
    ...lease,
    createdAt: new Date().toISOString(),
  } satisfies WorkspaceLease, null, 2)}\n`);
}
function recordPostSessionEffect(marker: EffectMarker): void {
  const dir = effectsDir();
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${marker.id.replace(/[^0-9A-Za-z._-]/g, '-')}.json`);
  writeFileSync(file, `${JSON.stringify(marker, null, 2)}\n`);
}

// Pending post-session effects for an agent = work whose session FINISHED but whose effect (the propose) has
// not run yet — the window between a session being reaped and its PR being opened. `list` counts these as
// in-flight so a WIP/dedup check (the PM's) does not relaunch the proposer in that gap and double-propose.
function pendingEffects(agent: string): EffectMarker[] {
  const dir = effectsDir();
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          return JSON.parse(readFileSync(join(dir, f), 'utf8')) as EffectMarker;
        } catch {
          return null;
        }
      })
      .filter((m): m is EffectMarker => !!m && m.agent === agent);
  } catch {
    return []; // no markers dir yet
  }
}

interface RuntimeManifest {
  agents?: Record<string, ManifestAgent>;
  codeHost?: string;
  policy?: Record<string, unknown>;
}

function runtimeManifest(): RuntimeManifest {
  const jsonPath = controlPath('.open-autonomy/autonomy.json');
  if (existsSync(jsonPath)) return JSON.parse(readFileSync(jsonPath, 'utf8')) as RuntimeManifest;
  const yamlPath = controlPath('.open-autonomy/autonomy.yml');
  if (!existsSync(yamlPath)) return {};
  const yaml = (Bun as unknown as { YAML?: { parse(input: string): unknown } }).YAML;
  if (!yaml) throw new Error('runtime manifest JSON is missing and this Bun version cannot parse autonomy.yml');
  return yaml.parse(readFileSync(yamlPath, 'utf8')) as RuntimeManifest;
}

function manifestAgent(agent: string): ManifestAgent {
  return runtimeManifest().agents?.[agent] ?? {};
}

// The code host this install targets (a first-class IR signal, carried in the manifest) — `github` means a
// finished branch becomes a PR, so the runner runs the propose effect on completion; `local-git` means the PM
// merges worktrees, so there is no propose effect. Read once per launch to gate the post-session effect.
function manifestCodeHost(): string {
  return runtimeManifest().codeHost ?? '';
}

// The profile's `policy.box.gh-actions` config (emitAutonomy carries `ir.policy.box` verbatim into the
// manifest's `policy` field, keyed by runner name — see packages/core/src/manifest.ts). The github substrate
// reads the SAME key (packages/substrate-github/src/emit.ts's `githubBox`, with a `.github` alias fallback)
// to learn a profile's EXTRA required-check/reviewer gates (e.g. soc2-baseline's `supply-chain` + `codeql`
// gates, or simple-gh-sdlc's `security` gate); the local runner mirrors that lookup so the SAME declared
// policy also threads through the local propose effect, not just github's.
function manifestGhActionsBox(): { propose_dispatch_checks?: string[]; propose_dispatch_reviews?: string[] } {
  const m = runtimeManifest();
  const box = (m.policy?.['gh-actions'] ?? m.policy?.github ?? {}) as {
    propose_dispatch_checks?: string[];
    propose_dispatch_reviews?: string[];
  };
  return box;
}

// --- the HUMAN route: a kind:human actor cannot be executed or watched -------------------------------------
// This is the THIRD launch realization (beside script-via-bun and skill-via-termfleet): a person. `launch`
// PARKS a session instead of running anything, and it NEVER auto-completes — completion is an external
// authorized act (`update <id> --status done`), driven by an operator (or, in test, a human simulator)
// after verifying the completion condition. This mirrors core's HumanRunner semantics EXACTLY (same
// fields: `status` stays `running`, `params` carry the ask opaquely, `note` echoes the completion
// condition — packages/core/src/runner.ts, tested in packages/core/src/runner.test.ts), but is
// REIMPLEMENTED here rather than imported: this file is emitted VERBATIM into every install with no
// package dependency on @open-autonomy/core (installs never see the monorepo's workspace packages), and
// it already owns this pattern of file-backed session state (the effect markers above) — so folding the
// human route in here keeps ONE emitted file with no new install-time dependency, while core's HumanRunner
// remains the substrate-neutral REFERENCE implementation (used directly in core's own tests/conformance).
// Divergence from the reference: this route adds a REAL (not no-op) `engage` — console + a well-known
// attention file an operator can tail, plus an optional command hook — because a shipped install needs an
// actual default delivery mechanism, not just a pluggable callback a host language wires up.
const humanSessionsPath = (): string => controlPath('.open-autonomy/runner-state/human-sessions.json');
const humanAttentionPath = (): string => controlPath('.open-autonomy/runner-state/human-attention.md');

interface HumanSession {
  id: string;
  agent: string;
  status: string; // running | cancelled | done | failed — bookkeeping only until an authorized `update`
  params?: Record<string, string>;
  note?: string;
}

function readHumanSessions(): HumanSession[] {
  try {
    return JSON.parse(readFileSync(humanSessionsPath(), 'utf8')) as HumanSession[];
  } catch {
    return []; // no parked sessions yet
  }
}
function writeHumanSessions(sessions: HumanSession[]): void {
  const path = humanSessionsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(sessions, null, 2)}\n`);
}
function getHumanSession(id: string): HumanSession | undefined {
  return readHumanSessions().find((s) => s.id === id);
}
function updateHumanSession(id: string, patch: { status?: string }): boolean {
  const sessions = readHumanSessions();
  const target = sessions.find((s) => s.id === id);
  if (!target) return false;
  if (patch.status) target.status = patch.status;
  writeHumanSessions(sessions);
  return true;
}

// ENGAGE: deliver the ask to a person. Default = print it to the console AND append it to a well-known
// attention file (an operator can `tail -f` it, or a health-monitor/PM can read it). An operator-configured
// command hook (AUTONOMY_HUMAN_ENGAGE_CMD) receives the session JSON on stdin — Slack/email/paging/whatever
// — entirely black-box and never required: absent, engage still parks + prints + appends, it just has no
// extra delivery. Never a path to auto-completion; engage only NOTIFIES.
function engageHuman(session: HumanSession): void {
  const ask = session.params?.ask ?? '(no ask given)';
  console.log(`[runner] HUMAN ENGAGE: ${session.agent} #${session.id} — ${ask}`);
  if (session.note) console.log(`[runner]   ${session.note}`);
  const attentionPath = humanAttentionPath();
  mkdirSync(dirname(attentionPath), { recursive: true });
  appendFileSync(
    attentionPath,
    [
      `## ${session.agent} #${session.id}`,
      '',
      `- ask: ${ask}`,
      `- completion condition: ${session.params?.completion ?? '(none provided)'}`,
      `- resume once verified: \`bun scripts/runner.ts update ${session.id} --status done\``,
      '',
      '',
    ].join('\n'),
  );
  const cmd = process.env.AUTONOMY_HUMAN_ENGAGE_CMD;
  if (cmd) {
    const r = spawnSync(cmd, { shell: true, input: JSON.stringify(session), encoding: 'utf8' });
    if (r.error) console.error(`[runner] AUTONOMY_HUMAN_ENGAGE_CMD failed: ${r.error.message}`);
  }
}

/** Launch a kind:human actor (agent:launch's human realization): park a session, engage, return. NEVER
 *  completes on its own — the note tells the caller (the PM / an operator) exactly what to verify before
 *  driving `update(id, { status: 'done' })`, the only path to terminal (docs/SPEC.md#handoffs). */
function launchHuman(agent: string, params: LaunchParams = {}): void {
  const stringParams = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const session: HumanSession = {
    id: `${agent}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    agent,
    status: 'running', // parked; a human runner can never confirm completion itself — no presumed-done
    ...(Object.keys(stringParams).length ? { params: stringParams } : {}),
    note: `bookkeeping only — completion is not auto-detected here; verify this completion condition, then mark done: ${stringParams.completion ?? '(none provided)'}`,
  };
  const sessions = readHumanSessions();
  sessions.push(session);
  writeHumanSessions(sessions);
  engageHuman(session);
  console.log(JSON.stringify(session)); // same convention as autonomy-runner.mjs's launch (last line = JSON)
}

// --- worktree isolation (local analogue of github's per-job fresh checkout) ---
// Two orthogonal requests use the same worktree primitive:
//   - `--branch <name>`: join/create that explicit branch and retain the existing proposal lifecycle;
//   - `--workspace isolated` (or manifest execution.workspace): create a fresh unique branch/worktree only.
// The latter is launch fencing, not a proposal signal. With neither request, the session uses trunk.
const worktreePathFor = (branch: string): string =>
  join(installRoot(), '.worktrees', branch.replace(/[^0-9A-Za-z._-]/g, '-'));
let isolationSequence = 0;
export function isolationBranch(agent: string, now = Date.now(), pid = process.pid): string {
  const safeAgent = agent.replace(/[^0-9A-Za-z._-]/g, '-').replace(/^-+|-+$/g, '') || 'agent';
  return `autonomy/run-${safeAgent}-${now}-${pid}-${++isolationSequence}`;
}

function git(args: string[], cwd?: string): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync('git', args, { encoding: 'utf8', ...(cwd ? { cwd } : {}) });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

// Create (or reuse) the worktree for the PM-assigned branch, from trunk HEAD. Idempotent: develop creates
// it, review (same `--branch`) joins it. node_modules is gitignored (lives only in the main checkout), so a
// fresh worktree has none — symlink it (root AND every workspace-member directory that has its own, see
// linkNodeModulesInto) so the repo-pinned ztrack/preset-kit + agent CLIs resolve inside it.
// Ignore the Runner-created paths via the repo's COMMON `.git/info/exclude`, not `.gitignore`. info/exclude
// is shared by every worktree and is never committed, so it reliably covers a worktree's `node_modules`
// symlink(s) regardless of what `.gitignore` that worktree's branch has checked out. (Appending to the main
// checkout's working-copy `.gitignore` does NOT reach a worktree, which sees its branch's committed version.)
// `node_modules` carries no trailing slash and no leading slash on purpose — a bare `node_modules` pattern
// matches a directory of that name AT ANY DEPTH (gitignore semantics), so it covers every per-package
// symlink linkNodeModulesInto creates, not just the root one; a `node_modules/` (trailing-slash) pattern
// would still match at any depth too, but the missing trailing slash is deliberate for a different reason:
// it also matches if some future change ever created `node_modules` as a plain FILE, not just a directory.
// (Whichever form: any of these symlinks would otherwise be staged by a worker's `git add -A` and merged onto trunk.)
function ensureRunnerPathsIgnored(): void {
  const commonDir = git(['rev-parse', '--git-common-dir']).stdout.trim();
  if (!commonDir) return;
  const excludePath = join(resolve(commonDir), 'info', 'exclude');
  let present: string[] = [];
  try {
    present = readFileSync(excludePath, 'utf8').split('\n');
  } catch {
    /* no exclude file yet — created below */
  }
  const missing = ['.worktrees/', 'node_modules', '.open-autonomy/runner-state/'].filter((e) => !present.includes(e));
  if (missing.length) {
    mkdirSync(dirname(excludePath), { recursive: true });
    appendFileSync(excludePath, `${missing.join('\n')}\n`);
  }
}

/** The base ref for a NEW agent branch: a function of the DECLARED code host (F-2/OA-02), never of repo
 *  shape (never "does a remote exist" or "does a fetch succeed"). github + a resolvable origin/<trunk> ->
 *  that remote-tracking ref (remote merges make local HEAD stale — see ensureWorktree's comment); every
 *  other case (local-git, or an undeclared codeHost, or origin/<trunk> unresolved) -> local HEAD. Exported
 *  and pure so it's unit-testable without a live termfleet stack — mirrors the `mergeInFlight` pattern. */
export function worktreeBase(codeHost: string, originTrunkResolves: boolean, trunk: string): string {
  return codeHost === 'github' && originTrunkResolves ? `origin/${trunk}` : 'HEAD';
}

/** Parse the remote's symbolic HEAD without guessing from the operator's current checkout. */
export function defaultBranchFromSymref(output: string, remote = 'origin'): string {
  const line = output.split('\n').find((entry) => entry.startsWith('ref: refs/heads/') && entry.endsWith('\tHEAD'));
  if (line) return line.slice('ref: refs/heads/'.length, -'\tHEAD'.length);
  const local = output.trim().replace(new RegExp(`^${remote}/`), '');
  return local && !local.includes('\n') ? local : '';
}

function remoteDefaultBranch(remote = 'origin'): string {
  const local = git(['symbolic-ref', '--quiet', '--short', `refs/remotes/${remote}/HEAD`]).stdout.trim();
  let branch = defaultBranchFromSymref(local, remote);
  if (!branch) {
    const remoteHead = git(['ls-remote', '--symref', remote, 'HEAD']);
    if (remoteHead.status === 0) branch = defaultBranchFromSymref(remoteHead.stdout, remote);
  }
  if (!branch) {
    throw new Error(
      `cannot resolve ${remote}'s default branch; set refs/remotes/${remote}/HEAD ` +
      `(git remote set-head ${remote} --auto) before launching an isolated github workspace`,
    );
  }
  return branch;
}

// --- workspace-member node_modules discovery (pnpm/yarn/npm workspace layouts don't hoist everything to
// root) ---------------------------------------------------------------------------------------------------
// npm's classic hoisting puts (almost) every dependency under the ROOT node_modules, so linking just that
// one directory into a fresh worktree (below) is enough for a script/CLI anywhere in the repo to resolve
// its tools. pnpm (and any workspace-aware manager configured to skip full hoisting) instead gives EACH
// workspace member its OWN node_modules/.bin — e.g. apps/server/node_modules/.bin/knex — with nothing
// equivalent at the root. A worktree that only linked the root node_modules would leave every per-package
// CLI unreachable (proven live: `pnpm db:migrate` inside a fresh worktree died "knex not found" even though
// the main checkout had `apps/server/node_modules/.bin/knex`). So we ALSO best-effort-symlink node_modules
// for every workspace member directory this checkout actually declares.
//
// Member directories are read from the repo's OWN declared workspace globs — never hardcoded to
// "apps"/"packages" — so this stays correct for any repo shape:
//   - npm/yarn/bun: package.json's "workspaces" (array form, or yarn's `{ packages: [...] }` object form).
//   - pnpm: pnpm-workspace.yaml's "packages" list (pnpm does not read package.json's "workspaces" field at
//     all — this is its own, DIFFERENT source of truth, and is checked FIRST/in addition since a pnpm repo
//     may have no "workspaces" field in package.json whatsoever).
// A repo with neither file (a plain single-package project) simply yields no members — a no-op, exactly
// like the existing root-link behavior degrades gracefully when there's no root node_modules to link either.
function readWorkspaceGlobs(): string[] {
  const globs: string[] = [];
  try {
    const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
      workspaces?: string[] | { packages?: string[] };
    };
    if (Array.isArray(pkg.workspaces)) globs.push(...pkg.workspaces);
    else if (Array.isArray(pkg.workspaces?.packages)) globs.push(...pkg.workspaces.packages);
  } catch {
    /* no root package.json, or it doesn't parse — fall through to pnpm-workspace.yaml / the conventional fallback */
  }
  try {
    const source = readFileSync(resolve('pnpm-workspace.yaml'), 'utf8');
    const packagesBlock = /^packages:\s*\n((?:[ \t]+-.*\n?)*)/m.exec(source)?.[1] ?? '';
    globs.push(...packagesBlock
      .split('\n')
      .map((line) => /^\s*-\s*["']?(.+?)["']?\s*$/.exec(line)?.[1])
      .filter((value): value is string => !!value));
  } catch {
    /* no pnpm-workspace.yaml — not a pnpm workspace, or it doesn't parse */
  }
  // Nothing declared anywhere (no "workspaces" field, no pnpm-workspace.yaml): fall back to the
  // conventional globs most workspace repos use, so a repo that DOES shape itself this way but forgot (or
  // has yet) to declare it explicitly still gets its member node_modules linked. A glob that matches nothing
  // (below) is simply a no-op, so trying these speculatively is always safe.
  if (!globs.length) globs.push('apps/*', 'packages/*');
  return [...new Set(globs)];
}

// A minimal, single-`*`-segment glob expander — deliberately NOT the general-purpose engine
// bin/collision-check.ts's expandWorkspaceGlob is (that lives in the dev-only CLI package and pulls in
// machinery this file can't depend on: runner-frontend.ts is emitted VERBATIM into every install with zero
// package dependencies — see the file-header comment). Covers what real workspace globs actually use:
// literal segments and a single trailing `*` segment (`packages/*`, `apps/*`, a scoped `packages/@scope/*`,
// ...). Anything fancier (`**`, mid-path `*`) simply matches nothing here rather than throwing — a missed
// exotic pattern degrades to "that glob's members don't get linked", the same best-effort posture as every
// other step in this function.
function expandSimpleGlob(pattern: string): string[] {
  const segments = pattern.split('/').filter(Boolean);
  let dirs = [resolve('.')];
  for (const seg of segments) {
    const next: string[] = [];
    if (seg === '*') {
      for (const d of dirs) {
        let entries: string[] = [];
        try {
          entries = readdirSync(d);
        } catch {
          continue;
        }
        for (const e of entries) {
          if (e.startsWith('.') || e === 'node_modules') continue;
          const p = join(d, e);
          if (existsSync(p)) next.push(p);
        }
      }
    } else if (seg.includes('*')) {
      return []; // an exotic mid-segment wildcard — not worth a false-positive match; skip this glob
    } else {
      for (const d of dirs) next.push(join(d, seg));
    }
    dirs = next;
  }
  return dirs;
}

/** Every workspace-member directory this checkout declares (or conventionally implies), deduped, that
 *  actually exists on disk and has its OWN node_modules to link. Exported so it's unit-testable without a
 *  real worktree. */
export function workspaceMemberNodeModulesDirs(): string[] {
  const dirs = new Set<string>();
  for (const glob of readWorkspaceGlobs()) {
    for (const dir of expandSimpleGlob(glob)) {
      if (existsSync(join(dir, 'node_modules'))) dirs.add(dir);
    }
  }
  return [...dirs];
}

// Best-effort-symlink `<dir>/node_modules` from the main checkout into the same relative path inside
// `worktree`, for the root AND every workspace-member directory that has its own node_modules. Every link
// is independently best-effort (try/catch swallow, never throw) — a missing/failed symlink for any one
// package just means THAT package falls back to root/global resolution inside the worktree, exactly like
// the pre-existing root-only behavior already degraded.
function linkNodeModulesInto(worktree: string): void {
  const roots = [resolve('.'), ...workspaceMemberNodeModulesDirs()];
  for (const dir of roots) {
    const source = join(dir, 'node_modules');
    const relDir = dir === resolve('.') ? '' : dir.slice(resolve('.').length + 1);
    const linkPath = join(worktree, relDir, 'node_modules');
    if (!existsSync(source) || existsSync(linkPath)) continue;
    try {
      mkdirSync(dirname(linkPath), { recursive: true });
      symlinkSync(source, linkPath, 'dir');
    } catch {
      /* best-effort: a missing symlink just means that package falls back to root/global tools */
    }
  }
}

// Returns the base descriptor actually used to create the worktree ('existing' when the branch already
// had one — idempotent reuse — otherwise the ref `ensureWorktree` based the new branch on: 'HEAD' or
// 'origin/<trunk>'). Callers that don't care (launch()) simply ignore the return value; the doctor's
// worktree-probe entry (below) reports it so an operator can see exactly which base a real dispatch would
// pick, without doctor ever re-deriving that decision itself (OA-18).
function ensureWorktree(branch: string, worktree: string, codeHost: string): string {
  if (existsSync(worktree)) return 'existing';
  ensureRunnerPathsIgnored();
  mkdirSync(dirname(worktree), { recursive: true });
  const branchExists = git(['rev-parse', '--verify', '--quiet', branch]).status === 0;
  // The base of a NEW agent branch is a function of the DECLARED code host (F-2/OA-02), never of whether a
  // remote happens to exist. github: a finished branch becomes a PR and auto-merges on the REMOTE (this loop
  // never pulls it back), so the local trunk goes stale — fetch the trunk and branch from origin/<trunk> when
  // that remote-tracking ref resolves. local-git (or an undeclared codeHost): the PM merges worktrees into the
  // LOCAL trunk directly, so it is the sole authoritative trunk and origin/<trunk> is at best stale, at worst
  // foreign state — branch from local HEAD, and perform NO fetch (no network operation at all), preserving the
  // fully-local guarantee ("GitHub is not needed") even when the repo happens to have a GitHub-shaped remote.
  let base = 'HEAD';
  if (!branchExists && codeHost === 'github') {
    const trunk = remoteDefaultBranch('origin');
    const fetched = git(['fetch', 'origin', trunk]);
    if (fetched.status !== 0) {
      throw new Error(`cannot refresh origin/${trunk}; refusing to branch from a possibly stale remote-tracking ref: ${fetched.stderr || fetched.stdout}`);
    }
    const resolves = git(['rev-parse', '--verify', '--quiet', `origin/${trunk}`]).status === 0;
    if (!resolves) throw new Error(`cannot resolve origin/${trunk} after fetch; refusing to branch from a stale local checkout`);
    base = worktreeBase(codeHost, resolves, trunk);
  }
  const add = branchExists ? ['worktree', 'add', worktree, branch] : ['worktree', 'add', '-b', branch, worktree, base];
  const r = git(add);
  if (r.status !== 0) throw new Error(`git worktree add failed for ${branch}: ${r.stderr || r.stdout}`);
  linkNodeModulesInto(worktree);
  return branchExists ? 'existing' : base;
}

export interface WorktreeProbeResult {
  branch: string;
  worktree: string;
  base: string; // 'existing' | 'HEAD' | 'origin/<trunk>' — whatever ensureWorktree actually chose
  sha: string; // the worktree's resolved HEAD, after creation
  codeHost: string;
}

/** OA-18's harness-integrity seam: doctor's check 5 must prove a real worktree through the RUNNER'S OWN
 *  code path, never a doctor-side reimplementation of the base-ref decision (which would drift the day
 *  `ensureWorktree`'s rule changes — see OA-02). This is that one exported, base-reporting entry point,
 *  invoked from outside as `bun scripts/runner.ts worktree-probe <branch>` (see runCli below). Doctor owns
 *  cleanup (`git worktree remove --force` + `git branch -D`) — this function only ever creates. */
export function worktreeProbe(branch: string): WorktreeProbeResult {
  const codeHost = manifestCodeHost();
  const worktree = worktreePathFor(branch);
  const base = ensureWorktree(branch, worktree, codeHost);
  const sha = git(['rev-parse', 'HEAD'], worktree).stdout.trim();
  return { branch, worktree, base, sha, codeHost };
}

/** Where harness `harness` resolves behavior `behavior`'s skill invocation in `cwd` — mirrors EXACTLY the
 *  copy paths compileLocal installs (emit.ts:512-513): `codex` -> `.codex/skills/<behavior>/SKILL.md`, any
 *  other harness (`claude`, the default) -> `.claude/skills/<behavior>/SKILL.md`. Pure + exported (mirrors
 *  the `mergeInFlight`/`worktreeBase` precedent) so the claude/codex truth table is unit-testable with no
 *  process, env, or git involved at all. */
export function skillPathFor(harness: string, behavior: string, cwd: string): string {
  const skillsRoot = harness === 'codex' ? '.codex/skills' : '.claude/skills';
  return join(cwd, skillsRoot, behavior, 'SKILL.md');
}

// The harness default, resolved EXACTLY as run-agent.mjs does (emit.ts:394): `TERMFLEET_AGENT` overrides;
// otherwise `RUNNER_DEFAULTS.harness`. That constant is emitted as a co-located sibling, `./runner-defaults.mjs`
// (emit.ts:471; backend.mjs imports it the very same way), which exists next to THIS file only once it has
// been emitted as `scripts/runner.ts` into a real install — not in this package's own `src/`, where this same
// source is ALSO imported directly (unemitted) by this package's own unit tests (worktree-probe.test.ts et
// al). The dynamic import below uses a VARIABLE specifier (never a literal) so `tsc` never attempts to
// resolve it statically (a literal `import('./runner-defaults.mjs')` fails `check:autonomy` outright when the
// file is absent, which it is in-package); at runtime it picks up the real sibling when one exists and falls
// back to `'claude'` — `RUNNER_DEFAULTS.harness`'s actual value (runner-config.ts) — when it doesn't, so both
// contexts agree without hardcoding the literal on the emitted path.
async function defaultHarness(): Promise<string> {
  try {
    const sibling = './runner-defaults.mjs';
    const mod = (await import(sibling)) as { RUNNER_DEFAULTS?: { harness?: string } };
    if (mod.RUNNER_DEFAULTS?.harness) return mod.RUNNER_DEFAULTS.harness;
  } catch {
    /* in-package: no sibling on disk yet (this file imported directly, not via a compiled install) */
  }
  return 'claude';
}

/** Launch an agent with forwarded params (agent:launch). Resolves to the launch's exit code; the pre-check
 *  refusal (and the pause gate, OA-07) throw instead — see runCli, which maps both to a nonzero exit. */
export async function launch(agent: string, params: LaunchParams = {}): Promise<number> {
  const { kind, skill: behavior = '', params: declared = {}, review = '', prelaunch = '', execution } = manifestAgent(agent);

  if (kind === 'human') {
    // The THIRD route: a person cannot be executed — park the ask instead (see the human route above).
    // Exempt from the pause gate: parking an ask for a person spends nothing.
    launchHuman(agent, params);
    return 0;
  }

  const fence = typeof params.fence === 'string' && params.fence ? params.fence : PAUSED_PATH;
  const resolvedFence = controlPath(fence);
  if (existsSync(resolvedFence)) {
    console.error(pausedMessage(fence));
    throw new PausedError();
  }

  if (behavior && isScript(behavior)) {
    // Deterministic agent: run its script via bun. Resolve its declared trigger params from the launch
    // params — the launch's `issue_number` is the subject.ref (the work item); other documented sources
    // (subject.text/actor/…) are not available on a programmatic launch, so they resolve empty.
    const env: Record<string, string> = { ...(process.env as Record<string, string>) };
    for (const [name, source] of Object.entries(declared)) {
      env[name] = source === 'subject.ref' ? String(params.issue_number ?? '') : '';
    }
    const r = spawnSync('bun', [behavior], { stdio: 'inherit', env });
    return r.status ?? 1;
  }

  // Skill agent: a termfleet session via the launch adapter. Workspace isolation and proposal lifecycle
  // are intentionally orthogonal. An explicit branch preserves the established named-work lifecycle;
  // `workspace: isolated` creates a unique worktree but never requests a proposal effect.
  const explicitBranch = typeof params.branch === 'string' && params.branch ? params.branch : '';
  const requestedWorkspace = params.workspace ?? execution?.workspace ?? 'shared';
  if (requestedWorkspace !== 'shared' && requestedWorkspace !== 'isolated')
    throw new Error(`[runner] invalid workspace mode "${requestedWorkspace}" (expected "shared" or "isolated")`);
  const branch = explicitBranch || (requestedWorkspace === 'isolated' ? isolationBranch(agent) : '');
  const worktree = branch ? worktreePathFor(branch) : '';
  // Read the declared code host ONCE per launch and reuse it for both decisions it gates: the worktree base
  // (below) and the post-session propose effect (below, at the github-only branch).
  const codeHost = manifestCodeHost();
  // `ensureWorktree` returns 'existing' when the branch already had a worktree (idempotent reuse), otherwise
  // the base ref it just created the worktree at ('HEAD' | 'origin/<trunk>'). Capture that so the pre-check
  // below can tear down ONLY a worktree THIS launch created — never a pre-existing one (which may be a legit
  // in-progress rework worktree a reviewer sent back).
  const worktreeStatus = branch ? ensureWorktree(branch, worktree, codeHost) : '';
  const createdWorktreeThisCall = !!branch && worktreeStatus !== 'existing';

  // OA-08 pre-check: does this launch's skill invocation actually resolve in the session's cwd? Applies with
  // OR without `--branch` (a trunk-checkout launch of a skill missing from the main checkout dies the exact
  // same way). Runs AFTER the pause gate above (a paused install refuses first) and before any termfleet
  // spend — no session is created, no post-session effect marker is recorded, on refusal.
  const cwd = worktree || process.cwd();
  const harness = process.env.TERMFLEET_AGENT || (await defaultHarness());
  const skillPath = skillPathFor(harness, behavior, cwd);
  if (!existsSync(skillPath)) {
    const baseSha = git(['rev-parse', 'HEAD'], cwd).stdout.trim() || '(unknown)';
    // Recoverability: a worktree is frozen at the base commit it was created on, and `ensureWorktree`
    // early-returns on an existing one — so a refused `--branch` launch that LEFT its just-created worktree
    // behind would re-check that same frozen (skill-less) copy on every retry, refusing forever even after
    // the operator does exactly what this message says (commit the harness on trunk). So tear down a
    // worktree+branch THIS call created before throwing: the next retry then rebuilds a FRESH worktree off
    // the now-fixed trunk and resolves. Scoped to `createdWorktreeThisCall` so a pre-existing (rework)
    // worktree is never destroyed. Paths are constructed (worktreePathFor → resolve; a validated non-empty
    // branch) — never an unguarded removal of an empty variable.
    if (createdWorktreeThisCall && worktree) {
      git(['worktree', 'remove', '--force', worktree]);
      git(['branch', '-D', branch]);
    }
    const message =
      `[runner] launch refused: ${agent}'s skill "${behavior}" is missing at\n` +
      `  ${skillPath} — the session would die at launch ("Unknown command: /${behavior}").\n` +
      `  The worktree contains only files committed on its base; commit the harness on trunk\n` +
      `  (docs/OPERATIONS.md#local-runner-quickstart, "Commit the harness"), or check the skill\n` +
      `  exists for harness "${harness}".` +
      (branch ? ` (branch ${branch}, base ${baseSha})` : '');
    console.error(message);
    throw new SkillMissingError(message);
  }

  const names = Object.keys(params).filter((k) => k !== 'branch' && k !== 'workspace' && k !== 'fence');
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    AUTONOMY_CONTROL_ROOT: installRoot(),
    AUTONOMY_AGENT: agent,
    AUTONOMY_FORWARD: [process.env.AUTONOMY_FORWARD, ...names].filter(Boolean).join(','),
    ...Object.fromEntries(names.map((k) => [k, String(params[k])])),
  };

  // --- the DECLARED PRELAUNCH (arms optional session-local state before the session spawns) --------------
  // Runs in the session's own cwd (the worktree it is about to be launched into — or process.cwd() for a
  // trunk launch), with the SAME env the session itself will see (so any forwarded params are already
  // resolved), BEFORE the session spawns — so whatever the command arms (e.g. a marker file a session's own
  // hooks read) exists the instant the session starts looking for it. Scoped purely by manifest
  // declaration: only an agent whose entry carries a `prelaunch:` ever runs one — every other agent declares
  // none, so this is a no-op for them, and the runner never special-cases an agent name to decide whether to
  // run it. `shell: true` because the declared value is a shell command string, not an argv array; a
  // nonzero exit is logged but never refuses the launch — a prelaunch is a best-effort arm, not a gate on
  // whether the session itself gets to run.
  if (prelaunch) {
    const r = spawnSync(prelaunch, { shell: true, stdio: 'inherit', env, cwd });
    if (r.status !== 0) {
      console.error(`[runner] ${agent}: prelaunch "${prelaunch}" exited ${r.status ?? '(signal)'} — continuing anyway (best-effort arm)`);
    }
  }

  // An EXPLICIT PROPOSAL-BRANCH session on a github CODE HOST gets a post-session effect recorded: when the session finishes,
  // the loop turns that worktree into a PR (agent-propose) — the local mirror of github's post-skill propose
  // step. Gated on two explicit signals, never a capability: a worktree exists (a `--branch` was named) and
  // the install's code host is `github` (where finished branches become PRs). Capture the launch output to
  // learn the session's terminalId (the join key the reaper reports back); every other launch (the PM, the
  // drafter, a local-git worker, the reviewer) stays live (stdio inherit).
  if (worktree) {
    const r = spawnSync('node', [join(scriptsDir, 'run-agent.mjs')], { encoding: 'utf8', env, cwd: worktree });
    if (r.stdout) process.stdout.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
    const id = terminalIdFromLaunch(r.stdout ?? '');
    if (id) {
      // Every session using an isolated worktree owns a lease, including a reviewer joining a branch
      // another session created. Cleanup groups leases by worktree and waits for all of them.
      recordWorkspaceLease({ id, agent, branch, worktree });
      if (explicitBranch && codeHost === 'github') {
        const ghBox = manifestGhActionsBox();
        recordPostSessionEffect({
          id,
          agent,
          ref: /agent\/issue-(\d+)/.exec(branch)?.[1] ?? '', // the issue this session is isolated for
          worktree,
          effect: 'scripts/agent-propose.ts', // the github code host's publish effect (git + gh; runner-independent)
          env: {
            // ISSUE_REF derives from the worktree's branch so agent-propose checks out the SAME branch the
            // worker committed onto (`agent/issue-<n>`); the rest mirror github's propose-step env.
            ISSUE_REF: /agent\/issue-(\d+)/.exec(branch)?.[1] ?? '',
            AGENT_NAME: agent,
            AGENT_BOT_NAME: process.env.AGENT_BOT_NAME ?? 'open-autonomy-agent',
            AGENT_BOT_EMAIL: process.env.AGENT_BOT_EMAIL ?? 'open-autonomy-agent@users.noreply.github.com',
            REVIEW_AGENT: review,
            ...(ghBox.propose_dispatch_checks?.length
              ? { EXTRA_CHECK_WORKFLOWS: ghBox.propose_dispatch_checks.join(',') }
              : {}),
            ...(ghBox.propose_dispatch_reviews?.length
              ? { EXTRA_REVIEW_WORKFLOWS: ghBox.propose_dispatch_reviews.join(',') }
              : {}),
          },
        });
      }
    } else {
      console.error(`[runner] ${agent}: launched but no terminalId in output; workspace cleanup cannot be tracked`);
    }
    return r.status ?? 1;
  }
  const r = spawnSync('node', [join(scriptsDir, 'run-agent.mjs')], { stdio: 'inherit', env, ...(worktree ? { cwd: worktree } : {}) });
  return r.status ?? 1;
}

/** List an agent's in-flight work (agent:list): live termfleet sessions PLUS pending post-session effects
 *  (a finished session whose propose has not run yet) PLUS any PARKED human sessions for this agent
 *  (running only — a resolved one is no longer in-flight). Including parked human sessions is what lets a
 *  PM's WIP/dedup check and the escalate-on-SLA doctrine SEE an outstanding ask instead of relaunching it,
 *  and matches core's HumanRunner.list() semantics (running only). Including the pending effects makes
 *  "in-flight" span the whole launch→propose lifecycle, so a WIP/dedup caller never relaunches the
 *  proposer in the reap→propose gap (which would open a duplicate PR). Deduped by id: while a session is
 *  live its marker.id == the session id, so it counts once; once reaped, only the marker remains; once
 *  proposed, the marker is gone (the PR exists, which the caller dedups on instead). */
export async function list(agent: string, _limit = 50): Promise<RunInfo[]> {
  const r = spawnSync('node', [join(scriptsDir, 'autonomy-runner.mjs'), 'list'], { encoding: 'utf8' });
  let sessions: Array<{ id: string; agent: string; status: string }> = [];
  try {
    sessions = JSON.parse(r.stdout || '[]');
  } catch {
    /* no sessions / backend unavailable */
  }
  const inFlight = mergeInFlight(sessions, pendingEffects(agent), agent);
  const parkedHuman = readHumanSessions()
    .filter((s) => s.agent === agent && s.status === 'running')
    .map((s) => ({ id: s.id, status: s.status, conclusion: null, title: agent, ...(s.params?.ref ? { ref: s.params.ref } : {}) }));
  return [...inFlight, ...parkedHuman];
}

/** Merge live sessions + pending effects into one in-flight list for `agent`, deduped by id (a live session
 *  and its own pending marker are the same unit of work). Pure — the testable core of the race fix. */
export function mergeInFlight(
  sessions: Array<{ id: string; agent: string; status: string }>,
  pending: EffectMarker[],
  agent: string,
): RunInfo[] {
  const markerById = new Map(pending.filter((m) => m.agent === agent).map((m) => [m.id, m]));
  const live = sessions
    .filter((s) => s.agent === agent)
    .map((s) => ({ id: s.id, status: s.status, conclusion: null, title: s.agent, ...refOf(markerById.get(s.id)) }));
  const liveIds = new Set(live.map((s) => s.id));
  const pend = [...markerById.values()]
    .filter((m) => !liveIds.has(m.id)) // session already counted; don't double-count
    .map((m) => ({ id: m.id, status: 'proposing', conclusion: null, title: agent, ...refOf(m) }));
  return [...live, ...pend];
}
// Surface the isolated session's work-item (issue) so a caller can dedup per issue, not just per agent.
const refOf = (m?: EffectMarker): { ref?: string } => (m?.ref ? { ref: m.ref } : {});

// --- the uniform agent-facing CLI (same surface as the github seam) ---
function parseFlags(args: string[]): LaunchParams {
  const params: LaunchParams = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a?.startsWith('--')) {
      const key = a.slice(2);
      const next = args[i + 1];
      params[key] = next && !next.startsWith('--') ? (i++, next) : 'true';
    }
  }
  return params;
}

export async function runCli(argv: string[]): Promise<number> {
  const [cmd, agent, ...rest] = argv;
  if (!cmd || !agent || agent.startsWith('--')) {
    console.error('usage: runner.ts <launch|list|get|update|cancel|worktree-probe> <agent|id|branch> [--ref <work-item>] [--workspace <shared|isolated>] [--fence <path>] [--key value ...]');
    return 2;
  }
  if (cmd === 'worktree-probe') {
    // The second positional is a throwaway BRANCH name here (doctor's `oa-doctor/probe-<epoch>`), not an
    // agent — reusing the generic positional slot like every other verb reuses it for its own subject.
    try {
      console.log(JSON.stringify(worktreeProbe(agent)));
      return 0;
    } catch (e) {
      console.error(`[runner] worktree-probe failed: ${(e as Error).message}`);
      return 1;
    }
  }
  // `get`/`update`/`cancel` take a SESSION ID (not an agent name). A parked human session lives in this
  // file's own store; anything else (a termfleet session) is delegated to the backend, which already
  // implements all five Runner verbs (packages/substrate-local/src/backend.mjs) — so both realizations of
  // the Runner contract (human + agent) are reachable through the ONE agent-facing seam (SPEC's five verbs:
  // launch/list/get/update/cancel), not just the human resume path this backlog item's minimum required.
  if (cmd === 'get') {
    const human = getHumanSession(agent);
    if (human) {
      console.log(JSON.stringify(human));
      return 0;
    }
    const r = spawnSync('node', [join(scriptsDir, 'autonomy-runner.mjs'), 'get', agent], { stdio: 'inherit' });
    return r.status ?? 0;
  }
  if (cmd === 'update') {
    const flags = parseFlags(rest);
    const status = typeof flags.status === 'string' ? flags.status : '';
    if (!status) {
      console.error('usage: runner.ts update <id> --status <running|paused|cancelled|done|failed>');
      return 2;
    }
    if (getHumanSession(agent)) return updateHumanSession(agent, { status }) ? 0 : 1;
    const r = spawnSync('node', [join(scriptsDir, 'autonomy-runner.mjs'), 'update', agent, '--status', status], { stdio: 'inherit' });
    return r.status ?? 0;
  }
  if (cmd === 'cancel') {
    // `cancel <id>` — the positional is the session id (not an agent). A parked human ask is retracted in
    // its own store; otherwise delegate to the backend's cancel (a termfleet session).
    if (getHumanSession(agent)) return updateHumanSession(agent, { status: 'cancelled' }) ? 0 : 1;
    const r = spawnSync('node', [join(scriptsDir, 'autonomy-runner.mjs'), 'cancel', agent], { stdio: 'inherit' });
    return r.status ?? 0;
  }
  if (cmd === 'launch') {
    const flags = parseFlags(rest);
    // `--ref` is the work item (`subject.ref`); when the target declares a source mapping, forward it
    // under that target's OWN param name (so a worker reads e.g. $ZTRACK_ISSUE). Otherwise retain the
    // portable `ref` key itself — human asks and generic runners surface it directly in list/get.
    if ('ref' in flags) {
      const { params: declared = {} } = manifestAgent(agent);
      const refParam = Object.entries(declared).find(([, src]) => src === 'subject.ref')?.[0];
      if (refParam) {
        flags[refParam] = flags.ref;
        delete flags.ref;
      }
    }
    try {
      return await launch(agent, flags);
    } catch (e) {
      // PausedError / SkillMissingError already printed their own message (launch()) — just surface the
      // nonzero exit so a scripted caller (or a human at the terminal) notices, instead of silently
      // returning 0.
      if (e instanceof PausedError || e instanceof SkillMissingError) return 1;
      throw e;
    }
  }
  if (cmd === 'list') {
    console.log(JSON.stringify(await list(agent)));
    return 0;
  }
  console.error(`runner.ts: unknown command "${cmd}"`);
  return 2;
}

if (import.meta.main) process.exit(await runCli(process.argv.slice(2)));
