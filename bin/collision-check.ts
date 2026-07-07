// OA-04: detect npm-workspace / package-name collisions between the ADOPTER repo and the local runner's
// own dependency namespace, BEFORE they crash several process-hops deep (see
// docs/adoption-fixes/OA-04-workspace-name-collision-detection.md).
//
// Two failure modes, one root cause: the emitted runner imports bare specifiers (`termfleet`,
// `@termfleet/core/...`) from the HOST repo's own namespace. If the host itself (or an npm workspace
// member of it) is named one of those specifiers, Node's module resolution can bind the bare import to
// the host's own source instead of the published package:
//   (a) self-reference — the host's ROOT package.json is named e.g. "termfleet" (Node ESM self-reference
//       binds a bare `import 'termfleet'` to the repo itself, especially once it has an `exports` field).
//   (b) workspace shadowing — an npm workspace MEMBER is named "termfleet"/"@termfleet/core"/a transitive
//       dep of either; npm symlinks `node_modules/<name>` -> the workspace's own source, shadowing the
//       published copy with no supported override (`--install-links` only helps `file:` deps).
//
// Three checks, run together by `checkNamespaceCollisions`:
//   A. self-reference  — host root package.json `name` in the direct protected set.
//   B. workspace shadow — a `workspaces` glob member's `name` in the direct set OR the dynamic transitive
//      closure of termfleet's/ztrack's own `dependencies` (their real installed dep tree — never hardcoded).
//   C. resolution probe — authoritative: actually resolve each direct-set specifier the way the emitted
//      runner will (`import.meta.resolve` from the repo root, in a real child `node`), and refuse if it
//      doesn't resolve inside `<cwd>/node_modules/` with a REAL (non-symlinked-into-the-repo) copy there.
//      This catches anything A/B missed (e.g. a workspace added after the last preflight run).
//
// Shared by bin/preflight.ts (primary — run before the other checks) and bin/autonomy-compile.ts
// (compile-time, so an operator who skips preflight still gets stopped). NOT imported by the emitted
// runner (packages/substrate-local/src/emit.ts) — that file ships dependency-free into every install, so
// it inlines its own copy of just the Check-C probe rather than importing this module.
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── the protected name set ──────────────────────────────────────────────────────────────────────────
// Direct set: STATIC on purpose. These are the exact packages the emitted runtime/install flow bind at
// runtime — `termfleet`/`@termfleet/core` (packages/substrate-local/src/backend.mjs:15-16), `ztrack` (the
// installed validation preset `import`s it — `.volter/tracker/validation/preset.mts`, docs/OPERATIONS.md's
// tracker step), and `open-autonomy` itself (a local workspace of that name would shadow every
// `npx open-autonomy` via `node_modules/.bin`). This list must NOT grow dynamically — it's the fixed
// contract; the dynamic part is the transitive closure below.
//
export const DIRECT_PROTECTED_NAMES = ['termfleet', '@termfleet/core', 'ztrack', 'open-autonomy'] as const;

// Check C (the resolution probe) needs the ACTUAL specifier the runtime resolves — which for two of
// these is a SUBPATH, not the bare package root: `backend.mjs` imports `@termfleet/core/local-providers.js`,
// and the ztrack preset imports `ztrack/preset-kit`. This matters because a perfectly healthy,
// non-colliding `@termfleet/core`/`ztrack` install can legitimately have NO "." entry in its own `exports`
// map (both do, empirically) — probing the bare package root there would throw ERR_PACKAGE_PATH_NOT_EXPORTED
// on a HEALTHY install, exactly the false-alarm class this project's own F-5 lesson
// (docs/adoption-fixes/OA-05-preflight-false-pty-failure.md) warns never to repeat.
//
// "open-autonomy" is deliberately ABSENT from this probe list: nothing the runner emits ever bare-imports
// it (it is a CLI, invoked as `npx open-autonomy` / a `node_modules/.bin` entry, not a library dependency —
// its `package.json` ships no "main"/"exports" at all). Its actual collision risk is `.bin` PATH shadowing
// (a workspace member named "open-autonomy" would shadow the real CLI's `node_modules/.bin/open-autonomy`),
// which `import.meta.resolve` cannot observe — and worse, probing it would FAIL on every healthy install
// (bin-only packages have no importable entry point to resolve), a guaranteed false alarm, not a rare one.
// Checks A/B still cover "open-autonomy" — they are pure name-matches against `DIRECT_PROTECTED_NAMES`,
// mechanism-agnostic, so they catch the self-reference/workspace-member-name risk without needing to
// resolve anything.
export interface ProtectedSpecifier {
  name: string;
  /** what the runtime actually resolves — equals `name` unless the real import is a subpath. */
  specifier: string;
}
export const RESOLUTION_PROBE_SPECIFIERS: ProtectedSpecifier[] = [
  { name: 'termfleet', specifier: 'termfleet' },
  { name: '@termfleet/core', specifier: '@termfleet/core/local-providers.js' },
  { name: 'ztrack', specifier: 'ztrack/preset-kit' },
];

// The BFS roots for the transitive closure — read termfleet's and ztrack's OWN installed `dependencies`,
// never a hardcoded list, so this tracks whatever they actually ship.
const TRANSITIVE_ROOTS = ['termfleet', 'ztrack'] as const;

export type RunFn = (
  cmd: string,
  args: string[],
  opts?: Record<string, unknown>,
) => {
  status: number | null | undefined;
  stdout: string | null | undefined;
  stderr: string | null | undefined;
  signal?: string | null | undefined;
};

export interface CollisionIO {
  existsSync: (p: string) => boolean;
  readFileSync: (p: string) => string;
  readdirSync: (p: string) => string[];
  isDirectory: (p: string) => boolean;
  realpathSync: (p: string) => string;
  run: RunFn;
}

function isDirDefault(p: string): boolean {
  try {
    return lstatSync(p).isDirectory();
  } catch {
    return false;
  }
}

export const defaultCollisionIO: CollisionIO = {
  existsSync,
  readFileSync: (p) => readFileSync(p, 'utf8'),
  readdirSync: (p) => readdirSync(p),
  isDirectory: isDirDefault,
  realpathSync: (p) => realpathSync(p),
  run: (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts }),
};

function readJson(io: CollisionIO, path: string): Record<string, unknown> | null {
  if (!io.existsSync(path)) return null;
  try {
    return JSON.parse(io.readFileSync(path));
  } catch {
    return null;
  }
}

// ── transitive closure (dynamic — never a hardcoded list) ──────────────────────────────────────────
export interface TransitiveResult {
  /** dep name -> shortest root..dep chain, e.g. ['termfleet', 'ws'] prints as "ws ← termfleet". */
  chains: Map<string, string[]>;
  rootsInstalled: string[];
}

/** Resolve an installed dep's package.json honoring npm's hoist-or-nest behavior: hoisted at
 *  `<cwd>/node_modules/<name>` when possible, else nested under its parent's own `node_modules`. Mirrors
 *  bin/preflight.ts's `resolvePtyDir` (same nesting rule, generalized to an arbitrary parent). */
function resolveDepPkgJson(cwd: string, name: string, parentName: string | undefined, io: CollisionIO): string | null {
  const hoisted = join(cwd, 'node_modules', name, 'package.json');
  if (io.existsSync(hoisted)) return hoisted;
  if (parentName) {
    const nested = join(cwd, 'node_modules', parentName, 'node_modules', name, 'package.json');
    if (io.existsSync(nested)) return nested;
  }
  return null;
}

/** BFS over `dependencies` starting at each installed root (today: termfleet, ztrack). Read at runtime
 *  from whatever is ACTUALLY installed — this is the "never hardcoded" half of the protected name set
 *  (termfleet ships 24 deps today: @homebridge/node-pty-prebuilt-multiarch, ws, zod, react, … — this
 *  function names none of them; it discovers them). A root that isn't installed yet is simply skipped
 *  (falls back to the direct set only — the caller notes this). */
export function buildTransitiveClosure(cwd: string, roots: readonly string[] = TRANSITIVE_ROOTS, io: CollisionIO = defaultCollisionIO): TransitiveResult {
  const chains = new Map<string, string[]>();
  const visited = new Set<string>();
  const rootsInstalled: string[] = [];
  const queue: Array<{ name: string; parent: string | undefined; chain: string[] }> = [];
  for (const root of roots) {
    if (resolveDepPkgJson(cwd, root, undefined, io)) {
      rootsInstalled.push(root);
      queue.push({ name: root, parent: undefined, chain: [root] });
    }
  }
  while (queue.length) {
    const { name, parent, chain } = queue.shift()!;
    if (visited.has(name)) continue;
    visited.add(name);
    const pkgPath = resolveDepPkgJson(cwd, name, parent, io);
    if (!pkgPath) continue;
    const pkg = readJson(io, pkgPath);
    const deps = (pkg && (pkg.dependencies as Record<string, string> | undefined)) || {};
    for (const dep of Object.keys(deps)) {
      if (!roots.includes(dep) && !chains.has(dep)) chains.set(dep, [...chain, dep]);
      if (!visited.has(dep)) queue.push({ name: dep, parent: name, chain: [...chain, dep] });
    }
  }
  return { chains, rootsInstalled };
}

/** "ws ← termfleet" — reads as "ws is owned/required by termfleet". Root..dep chain reversed + joined. */
export function chainText(chain: string[]): string {
  return [...chain].reverse().join(' ← ');
}

// ── workspaces glob expansion ───────────────────────────────────────────────────────────────────────
function escapeRegex(s: string): string {
  return s.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

/** Minimal glob expander for npm `workspaces` patterns: literal segments, `*` (one path segment,
 *  e.g. `packages/*`), and `**` (any depth, directories only, skipping `node_modules`/dotfiles). This is
 *  not a general-purpose glob engine — it covers the patterns npm workspaces actually uses. */
export function expandWorkspaceGlob(cwd: string, pattern: string, io: CollisionIO): string[] {
  const segments = pattern.split('/').filter(Boolean);
  let dirs = [cwd];
  for (const seg of segments) {
    const next: string[] = [];
    if (seg === '**') {
      const collect = (dir: string, acc: string[]) => {
        acc.push(dir);
        let entries: string[] = [];
        try {
          entries = io.readdirSync(dir);
        } catch {
          return;
        }
        for (const e of entries) {
          if (e === 'node_modules' || e.startsWith('.')) continue;
          const p = join(dir, e);
          if (io.isDirectory(p)) collect(p, acc);
        }
      };
      for (const d of dirs) collect(d, next);
    } else if (seg.includes('*')) {
      const re = new RegExp(`^${seg.split('*').map(escapeRegex).join('.*')}$`);
      for (const d of dirs) {
        let entries: string[] = [];
        try {
          entries = io.readdirSync(d);
        } catch {
          continue;
        }
        for (const e of entries) {
          if (re.test(e) && io.isDirectory(join(d, e))) next.push(join(d, e));
        }
      }
    } else {
      for (const d of dirs) {
        const p = join(d, seg);
        if (io.isDirectory(p)) next.push(p);
      }
    }
    dirs = next;
  }
  return dirs;
}

export interface WorkspaceMember {
  name: string;
  dir: string;
}

/** Expand every `workspaces` glob (npm array form, or the yarn-style `{packages: [...]}` object form)
 *  into the member directories that actually have a package.json, and read each one's `name`. */
export function workspaceMembers(cwd: string, workspaces: string[], io: CollisionIO): WorkspaceMember[] {
  const seen = new Set<string>();
  const members: WorkspaceMember[] = [];
  for (const pattern of workspaces) {
    for (const dir of expandWorkspaceGlob(cwd, pattern, io)) {
      if (seen.has(dir)) continue;
      seen.add(dir);
      const pkg = readJson(io, join(dir, 'package.json'));
      if (pkg && typeof pkg.name === 'string') members.push({ name: pkg.name, dir });
    }
  }
  return members;
}

// ── check C: the authoritative resolution probe ─────────────────────────────────────────────────────
export type ResolutionFailureReason = 'resolution-failed' | 'outside-node-modules' | 'escapes-into-repo';

export interface ResolutionResult {
  ok: boolean;
  /** Set only when `ok` is false. */
  reason?: ResolutionFailureReason;
  detail?: string;
}

/** Resolve `specifier` (the actual bare-or-subpath import the runtime uses — see RESOLUTION_PROBE_SPECIFIERS)
 *  the way the emitted runner will: `import.meta.resolve(specifier)` in a real child `node` process run
 *  with `cwd` as its working directory (so it shares the root package scope with `scripts/`, faithfully
 *  reproducing Node's self-reference behavior). `name` (the package name, no subpath) is used only to
 *  decide whether there's anything to probe at all and to realpath-check the package's own directory. A
 *  package that isn't installed at all under `<cwd>/node_modules/` yet is NOT a failure here — that's
 *  simply "nothing to probe" (checks A/B, or a plain "not installed" note, cover that case); this check is
 *  about a package that IS present resolving to something OTHER than its own real installed copy. */
export function probeResolution(cwd: string, name: string, specifier: string, io: CollisionIO = defaultCollisionIO): ResolutionResult {
  const nodeModulesRoot = join(cwd, 'node_modules');
  const pkgDir = join(nodeModulesRoot, name);
  if (!io.existsSync(join(pkgDir, 'package.json'))) return { ok: true }; // not installed yet — not this check's concern

  const r = io.run('node', ['--input-type=module', '-e', "console.log(import.meta.resolve(process.argv[1]))", specifier], { cwd });
  if (r.status !== 0) {
    return { ok: false, reason: 'resolution-failed', detail: (r.stderr ?? '').trim() || 'node exited nonzero with no stderr' };
  }

  let resolvedPath: string;
  try {
    resolvedPath = fileURLToPath((r.stdout ?? '').trim());
  } catch {
    return { ok: false, reason: 'resolution-failed', detail: `could not parse resolved specifier: ${(r.stdout ?? '').trim()}` };
  }

  // The resolved file must live INSIDE this package's own node_modules directory (not just node_modules/
  // broadly — a subpath specifier like "@termfleet/core/local-providers.js" must resolve under
  // node_modules/@termfleet/core/, never merely under node_modules/ at large).
  const expectedPrefix = pkgDir + sep;
  if (resolvedPath !== pkgDir && !resolvedPath.startsWith(expectedPrefix)) {
    return { ok: false, reason: 'outside-node-modules', detail: resolvedPath };
  }

  let real = pkgDir;
  try {
    real = io.realpathSync(pkgDir);
  } catch {
    /* leave as pkgDir — a broken symlink target is handled by the resolution-failed branch above */
  }
  const realExpectedPrefix = nodeModulesRoot + sep;
  if (real !== nodeModulesRoot && !real.startsWith(realExpectedPrefix)) {
    return { ok: false, reason: 'escapes-into-repo', detail: real };
  }
  return { ok: true };
}

// ── error text: named + actionable, one shared shape for every mechanism ──────────────────────────
const NO_OVERRIDE =
  'npm has NO flag to prefer a registry copy over a workspace link (--install-links applies to file: deps, ' +
  'not workspaces) — there is no in-place override.';
const REMEDIATION =
  `Remediation: rename the colliding workspace/root package, or run the open-autonomy local loop from a ` +
  `repo that does not itself develop the runner's own dependencies. ${NO_OVERRIDE}`;

function selfReferenceError(name: string): string {
  return (
    `COLLISION (self-reference): this repo's own root package.json is named "${name}", which is also a bare ` +
    `specifier the local runner imports at runtime. Node's ESM self-reference resolution can bind a bare ` +
    `import of "${name}" to THIS repo (via its own package.json "exports" field — and even without one today, ` +
    `adding one later would break this silently) instead of the published copy under node_modules/${name}. ` +
    `Consequence: the emitted runner would either crash several process-hops deep with ERR_MODULE_NOT_FOUND ` +
    `(an unbuilt repo) or — worse — silently run this repo's OWN dev code as the runner SDK (a built repo). ` +
    REMEDIATION
  );
}

function workspaceShadowError(name: string, memberDir: string, mechanism: 'direct' | 'transitive', chain?: string[]): string {
  const chainSuffix = chain ? ` (dependency chain: ${chainText(chain)})` : '';
  const owner = mechanism === 'direct' ? "the runner's own" : 'a transitively required';
  return (
    `COLLISION (workspace shadowing): the npm workspace member at "${memberDir}" is named "${name}"${chainSuffix}, ` +
    `so npm symlinks node_modules/${name} to that member's own source — SHADOWING ${owner} published package of ` +
    `that name with this repo's in-development code. Consequence: the emitted runner would load this repo's own ` +
    `workspace source instead of the published dependency it needs (a deep ERR_PACKAGE_PATH_NOT_EXPORTED / ` +
    `ERR_MODULE_NOT_FOUND, or silently wrong behavior). ${REMEDIATION}`
  );
}

function resolutionProbeError(name: string, specifier: string, result: ResolutionResult): string {
  const why =
    result.reason === 'resolution-failed'
      ? `Node failed to resolve "${specifier}" the way the emitted runner will (import.meta.resolve from this repo's root): ${result.detail}`
      : result.reason === 'outside-node-modules'
        ? `"${specifier}" resolved OUTSIDE node_modules/${name}/ entirely (to ${result.detail}) — a self-reference, not the installed package`
        : `"${name}"'s installed location escapes node_modules/ into this repo's own tree (realpath ${result.detail}) — a workspace/file symlink standing in for the registry copy`;
  return (
    `COLLISION (resolution probe): ${why}. Consequence: the emitted runner's import of "${specifier}" would not ` +
    `resolve to the published package it needs — a deep ERR_MODULE_NOT_FOUND, or (self-reference) silently ` +
    `running this repo's own dev code as the runner SDK. ${REMEDIATION}`
  );
}

// ── the assembled check ─────────────────────────────────────────────────────────────────────────────
export interface CollisionCheckResult {
  notes: string[];
  warns: string[];
  failed: boolean;
}

/** Checks A + B + C against `cwd`. Shaped like bin/preflight.ts's other checks ({notes, warns, failed}) so
 *  both call sites (preflight's CLI driver, autonomy-compile's compile-time gate) replay it identically. */
export function checkNamespaceCollisions(cwd: string, io: CollisionIO = defaultCollisionIO): CollisionCheckResult {
  const notes: string[] = [];
  const warns: string[] = [];
  const direct = new Set<string>(DIRECT_PROTECTED_NAMES);

  const rootPkg = readJson(io, join(cwd, 'package.json'));
  if (!rootPkg) {
    notes.push('no package.json at repo root — skip namespace-collision check');
    return { notes, warns, failed: false };
  }

  const { chains, rootsInstalled } = buildTransitiveClosure(cwd, TRANSITIVE_ROOTS, io);
  if (!rootsInstalled.length) {
    notes.push(
      'neither termfleet nor ztrack is installed yet — transitive-dependency collision detection falls back to ' +
        'the static protected-name set only (termfleet, @termfleet/core, ztrack, open-autonomy); re-run after ' +
        '`npm install termfleet` for the full check.',
    );
  }

  // Check A — self-reference.
  if (typeof rootPkg.name === 'string' && direct.has(rootPkg.name)) {
    warns.push(selfReferenceError(rootPkg.name));
  }

  // Check B — workspace shadowing (direct set, or the dynamic transitive closure — printing the owning chain).
  const workspacesField = rootPkg.workspaces as string[] | { packages?: string[] } | undefined;
  const workspaces: string[] = Array.isArray(workspacesField)
    ? workspacesField
    : Array.isArray(workspacesField?.packages)
      ? workspacesField!.packages!
      : [];
  if (workspaces.length) {
    for (const member of workspaceMembers(cwd, workspaces, io)) {
      if (direct.has(member.name)) {
        warns.push(workspaceShadowError(member.name, member.dir, 'direct'));
      } else if (chains.has(member.name)) {
        warns.push(workspaceShadowError(member.name, member.dir, 'transitive', chains.get(member.name)));
      }
    }
  }

  // Check C — the authoritative resolution probe (catches self-reference/shadowing A/B missed, e.g. a
  // workspace added after the last preflight run, or a name outside the static direct-set match logic).
  // Scoped to RESOLUTION_PROBE_SPECIFIERS, not the full direct set — see that constant's comment for why
  // "open-autonomy" (no runtime bare-import; a `.bin`-shadowing risk only) is excluded here.
  for (const { name, specifier } of RESOLUTION_PROBE_SPECIFIERS) {
    const result = probeResolution(cwd, name, specifier, io);
    if (!result.ok) warns.push(resolutionProbeError(name, specifier, result));
  }

  if (!warns.length) {
    notes.push("namespace-collision check: no collisions between this repo and the runner's dependency namespace ✓");
  }
  return { notes, warns, failed: warns.length > 0 };
}
