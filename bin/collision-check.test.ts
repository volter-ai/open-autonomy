// OA-04: bin/collision-check.ts is the shared namespace-collision check (preflight's primary check + the
// compile-time gate reuse it verbatim). Two layers of tests, matching the OA-05 pattern:
//   1. Dependency-injected unit tests (fake `io`) for each building block — fast, exercise edge cases a
//      real fixture can't reach cheaply (a broken symlink, an unreadable package.json, ...).
//   2. LIVE fixture tests — real filesystem, real symlinks, and (for the resolution probe) a REAL spawned
//      `node` process, so a tamper that defangs Check A/B (e.g. stops reading `workspaces`) or reverts
//      Check C to a bare `existsSync` goes red here even though the DI tests above still pass with a
//      correspondingly-tampered fake `io`.
import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DIRECT_PROTECTED_NAMES,
  RESOLUTION_PROBE_SPECIFIERS,
  SELF_REFERENCE_NAMES,
  buildTransitiveClosure,
  chainText,
  checkNamespaceCollisions,
  expandWorkspaceGlob,
  probeResolution,
  workspaceMembers,
  type CollisionIO,
  type RunFn,
} from './collision-check';

// ── a fully in-memory fake filesystem, for the DI unit tests ────────────────────────────────────────
function fakeIo(files: Record<string, string>, dirs: Set<string> = new Set(), run?: RunFn): CollisionIO {
  const norm = (p: string) => p.replace(/\/+$/, '');
  return {
    existsSync: (p) => Object.prototype.hasOwnProperty.call(files, norm(p)) || dirs.has(norm(p)),
    readFileSync: (p) => {
      const v = files[norm(p)];
      if (v === undefined) throw new Error(`ENOENT: ${p}`);
      return v;
    },
    readdirSync: (p) => {
      const prefix = norm(p) + '/';
      const seen = new Set<string>();
      for (const f of [...Object.keys(files), ...dirs]) {
        if (f.startsWith(prefix)) {
          const rest = f.slice(prefix.length);
          seen.add(rest.split('/')[0]!);
        }
      }
      if (!seen.size) throw new Error(`ENOENT: ${p}`);
      return [...seen];
    },
    isDirectory: (p) => dirs.has(norm(p)),
    realpathSync: (p) => p,
    run: run ?? (() => ({ status: 1, stdout: '', stderr: 'unexpected run() call in this test' })),
  };
}

describe('buildTransitiveClosure — dynamic BFS, never a hardcoded dep list', () => {
  test('walks termfleet\'s own dependencies field and finds a nested transitive dep, with the shortest chain', () => {
    const dirs = new Set(['/repo/node_modules', '/repo/node_modules/termfleet', '/repo/node_modules/foo', '/repo/node_modules/ws']);
    const io = fakeIo({
      '/repo/node_modules/termfleet/package.json': JSON.stringify({ name: 'termfleet', dependencies: { foo: '^1.0.0' } }),
      '/repo/node_modules/foo/package.json': JSON.stringify({ name: 'foo', dependencies: { ws: '^8.0.0' } }),
      '/repo/node_modules/ws/package.json': JSON.stringify({ name: 'ws' }),
    }, dirs);
    const { chains, rootsInstalled } = buildTransitiveClosure('/repo', ['termfleet', 'ztrack'], io);
    expect(rootsInstalled).toEqual(['termfleet']); // ztrack not installed in this fixture — skipped, not a throw
    expect(chains.get('foo')).toEqual(['termfleet', 'foo']);
    expect(chains.get('ws')).toEqual(['termfleet', 'foo', 'ws']);
    expect(chainText(chains.get('ws')!)).toBe('ws ← foo ← termfleet');
  });

  test('neither root installed → empty closure, no throw (falls back to the static direct set — caller notes this)', () => {
    const io = fakeIo({}, new Set(['/repo/node_modules']));
    const { chains, rootsInstalled } = buildTransitiveClosure('/repo', ['termfleet', 'ztrack'], io);
    expect(rootsInstalled).toEqual([]);
    expect(chains.size).toBe(0);
  });

  test('honors the nested node_modules fallback (mirrors resolvePtyDir\'s hoist-then-nest rule)', () => {
    const dirs = new Set([
      '/repo/node_modules',
      '/repo/node_modules/termfleet',
      '/repo/node_modules/termfleet/node_modules',
      '/repo/node_modules/termfleet/node_modules/nested-dep',
    ]);
    const io = fakeIo(
      {
        '/repo/node_modules/termfleet/package.json': JSON.stringify({ name: 'termfleet', dependencies: { 'nested-dep': '^1.0.0' } }),
        '/repo/node_modules/termfleet/node_modules/nested-dep/package.json': JSON.stringify({ name: 'nested-dep' }),
      },
      dirs,
    );
    const { chains } = buildTransitiveClosure('/repo', ['termfleet'], io);
    expect(chains.has('nested-dep')).toBe(true);
  });

  test('descends GRANDPARENT-nested deps (parentDir carries the actual resolved dir, not a one-level name guess)', () => {
    // gp nested under termfleet's own node_modules; parent nested under gp's; dep nested under parent's —
    // three levels deep. A one-level `<cwd>/node_modules/<parentName>/node_modules` lookup would drop it.
    const base = '/repo/node_modules/termfleet/node_modules';
    const dirs = new Set([
      '/repo/node_modules',
      '/repo/node_modules/termfleet',
      '/repo/node_modules/termfleet/node_modules',
      `${base}/gp`,
      `${base}/gp/node_modules`,
      `${base}/gp/node_modules/parent`,
      `${base}/gp/node_modules/parent/node_modules`,
      `${base}/gp/node_modules/parent/node_modules/leaf`,
    ]);
    const io = fakeIo(
      {
        '/repo/node_modules/termfleet/package.json': JSON.stringify({ name: 'termfleet', dependencies: { gp: '^1.0.0' } }),
        [`${base}/gp/package.json`]: JSON.stringify({ name: 'gp', dependencies: { parent: '^1.0.0' } }),
        [`${base}/gp/node_modules/parent/package.json`]: JSON.stringify({ name: 'parent', dependencies: { leaf: '^1.0.0' } }),
        [`${base}/gp/node_modules/parent/node_modules/leaf/package.json`]: JSON.stringify({ name: 'leaf' }),
      },
      dirs,
    );
    const { chains } = buildTransitiveClosure('/repo', ['termfleet'], io);
    expect(chains.get('leaf')).toEqual(['termfleet', 'gp', 'parent', 'leaf']);
  });
});

describe('expandWorkspaceGlob / workspaceMembers', () => {
  const dirs = new Set(['/repo', '/repo/packages', '/repo/packages/core', '/repo/packages/utils', '/repo/apps', '/repo/apps/web']);
  const io = fakeIo(
    {
      '/repo/packages/core/package.json': JSON.stringify({ name: '@termfleet/core' }),
      '/repo/packages/utils/package.json': JSON.stringify({ name: 'my-utils' }),
      '/repo/apps/web/package.json': JSON.stringify({ name: 'web' }),
    },
    dirs,
  );

  test('a `dir/*` pattern expands to every immediate child directory', () => {
    const got = expandWorkspaceGlob('/repo', 'packages/*', io).sort();
    expect(got).toEqual([join('/repo', 'packages', 'core'), join('/repo', 'packages', 'utils')].sort());
  });

  test('a literal (no-wildcard) pattern matches at most one exact directory', () => {
    expect(expandWorkspaceGlob('/repo', 'apps/web', io)).toEqual([join('/repo', 'apps', 'web')]);
  });

  test('workspaceMembers reads each expanded member\'s package.json name, skipping dirs with none', () => {
    const members = workspaceMembers('/repo', ['packages/*'], io);
    expect(members.map((m) => m.name).sort()).toEqual(['@termfleet/core', 'my-utils']);
  });

  test('a `*` segment never matches a dot-dir (a stray .git/.cache is not a workspace member)', () => {
    const d = new Set(['/repo', '/repo/packages', '/repo/packages/real', '/repo/packages/.hidden']);
    const fio = fakeIo(
      {
        '/repo/packages/real/package.json': JSON.stringify({ name: 'real-pkg' }),
        '/repo/packages/.hidden/package.json': JSON.stringify({ name: 'termfleet' }), // would be a false alarm if matched
      },
      d,
    );
    expect(expandWorkspaceGlob('/repo', 'packages/*', fio)).toEqual([join('/repo', 'packages', 'real')]);
  });

  test('honors a `!`-negation pattern — an explicitly-excluded member is never returned', () => {
    const d = new Set(['/repo', '/repo/packages', '/repo/packages/keep', '/repo/packages/drop']);
    const fio = fakeIo(
      {
        '/repo/packages/keep/package.json': JSON.stringify({ name: 'keep-pkg' }),
        '/repo/packages/drop/package.json': JSON.stringify({ name: 'termfleet' }), // opted out via negation
      },
      d,
    );
    const members = workspaceMembers('/repo', ['packages/*', '!packages/drop'], fio);
    expect(members.map((m) => m.name)).toEqual(['keep-pkg']);
  });
});

describe('probeResolution — the authoritative Check C, DI-driven', () => {
  test('package not installed at all under node_modules/<name> → ok (nothing to probe; not this check\'s job)', () => {
    const io = fakeIo({}, new Set(['/repo/node_modules']), () => {
      throw new Error('run() must never be called when the package is not installed');
    });
    expect(probeResolution('/repo', 'termfleet', 'termfleet', io)).toEqual({ ok: true });
  });

  test('resolution succeeds, resolved path lands under node_modules/<name>/, realpath does not escape → ok', () => {
    const dirs = new Set(['/repo/node_modules', '/repo/node_modules/termfleet']);
    const io = fakeIo(
      { '/repo/node_modules/termfleet/package.json': '{}' },
      dirs,
      () => ({ status: 0, stdout: 'file:///repo/node_modules/termfleet/dist/index.js\n', stderr: '' }),
    );
    expect(probeResolution('/repo', 'termfleet', 'termfleet', io)).toEqual({ ok: true });
  });

  test('node exits nonzero (resolution genuinely fails) → resolution-failed', () => {
    const dirs = new Set(['/repo/node_modules', '/repo/node_modules/termfleet']);
    const io = fakeIo(
      { '/repo/node_modules/termfleet/package.json': '{}' },
      dirs,
      () => ({ status: 1, stdout: '', stderr: 'Error [ERR_MODULE_NOT_FOUND]: boom' }),
    );
    const r = probeResolution('/repo', 'termfleet', 'termfleet', io);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('resolution-failed');
  });

  test('resolves OUTSIDE node_modules/<name>/ entirely (self-reference to the repo root) → outside-node-modules', () => {
    const dirs = new Set(['/repo/node_modules', '/repo/node_modules/termfleet']);
    const io = fakeIo(
      { '/repo/node_modules/termfleet/package.json': '{}' },
      dirs,
      () => ({ status: 0, stdout: 'file:///repo/dist/index.js\n', stderr: '' }),
    );
    const r = probeResolution('/repo', 'termfleet', 'termfleet', io);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('outside-node-modules');
  });

  test('resolved path is under node_modules/<name>/ but its realpath escapes into the repo tree (workspace symlink) → escapes-into-repo', () => {
    const dirs = new Set(['/repo/node_modules', '/repo/node_modules/termfleet']);
    const io: CollisionIO = {
      ...fakeIo(
        { '/repo/node_modules/termfleet/package.json': '{}' },
        dirs,
        () => ({ status: 0, stdout: 'file:///repo/node_modules/termfleet/dist/index.js\n', stderr: '' }),
      ),
      realpathSync: () => '/repo/packages/core', // the symlink's REAL target lives inside the repo, not node_modules
    };
    const r = probeResolution('/repo', 'termfleet', 'termfleet', io);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('escapes-into-repo');
  });

  test('a subpath specifier (e.g. "@termfleet/core/local-providers.js") is what gets resolved — a package with no root "." export is NOT a false alarm', () => {
    const dirs = new Set(['/repo/node_modules', '/repo/node_modules/@termfleet/core']);
    const io = fakeIo(
      { '/repo/node_modules/@termfleet/core/package.json': '{}' },
      dirs,
      (_cmd, args) => {
        expect(args).toContain('@termfleet/core/local-providers.js'); // NOT the bare "@termfleet/core"
        return { status: 0, stdout: 'file:///repo/node_modules/@termfleet/core/dist/local-providers.js\n', stderr: '' };
      },
    );
    const r = probeResolution('/repo', '@termfleet/core', '@termfleet/core/local-providers.js', io);
    expect(r.ok).toBe(true);
  });

  // Fix 2 (pnpm-workspace-install-hardening): pnpm installs `node_modules/<name>` as a SYMLINK into
  // `node_modules/.pnpm/<name>@<version>/node_modules/<name>`, and Node's ESM `import.meta.resolve`
  // REALPATHS by default — so on a perfectly healthy pnpm install, resolving even the package's own files
  // returns an absolute path under `node_modules/.pnpm/...`, which does NOT literally string-prefix-match
  // `node_modules/<name>/`. Proven live on a real pnpm-installed `@termfleet/core`; this was a false
  // positive ("outside-node-modules") on an install with nothing wrong.
  test('pnpm symlink layout: resolution lands under node_modules/.pnpm/<name>@<ver>/node_modules/<name>/ (pkgDir\'s own realpath), NOT literally under node_modules/<name>/ → still ok', () => {
    const dirs = new Set([
      '/repo/node_modules',
      '/repo/node_modules/@termfleet',
      '/repo/node_modules/@termfleet/core', // the pnpm-style symlink itself
      '/repo/node_modules/.pnpm',
      '/repo/node_modules/.pnpm/@termfleet+core@1.0.0',
      '/repo/node_modules/.pnpm/@termfleet+core@1.0.0/node_modules',
      '/repo/node_modules/.pnpm/@termfleet+core@1.0.0/node_modules/@termfleet',
      '/repo/node_modules/.pnpm/@termfleet+core@1.0.0/node_modules/@termfleet/core',
    ]);
    const realTarget = '/repo/node_modules/.pnpm/@termfleet+core@1.0.0/node_modules/@termfleet/core';
    const io: CollisionIO = {
      ...fakeIo(
        { '/repo/node_modules/@termfleet/core/package.json': '{}' },
        dirs,
        (_cmd, args) => {
          expect(args).toContain('@termfleet/core/local-providers.js');
          // import.meta.resolve realpaths through the pnpm symlink to the .pnpm store copy.
          return { status: 0, stdout: `file://${realTarget}/dist/local-providers.js\n`, stderr: '' };
        },
      ),
      realpathSync: (p) => (p === '/repo/node_modules/@termfleet/core' ? realTarget : p),
    };
    const r = probeResolution('/repo', '@termfleet/core', '@termfleet/core/local-providers.js', io);
    expect(r).toEqual({ ok: true });
  });

  // The pnpm-realpath acceptance above must NOT weaken the genuine collision case: a workspace member
  // symlinked in place of the real package realpaths into the REPO's own source tree (never into
  // node_modules/.pnpm/...), so it must still fail — here both the literal-prefix check AND the new
  // pkgDir-realpath check see the same repo-tree escape, so the check that runs next (escapes-into-repo,
  // Fix 2 leaves it untouched) is what actually reports it; either way this must never resolve `ok: true`.
  test('pnpm-shaped symlink but the realpath escapes OUTSIDE node_modules entirely (a workspace shadow, not a .pnpm store copy) → still a collision, not ok', () => {
    const dirs = new Set(['/repo/node_modules', '/repo/node_modules/@termfleet', '/repo/node_modules/@termfleet/core', '/repo/packages', '/repo/packages/core']);
    const io: CollisionIO = {
      ...fakeIo(
        { '/repo/node_modules/@termfleet/core/package.json': '{}' },
        dirs,
        () => ({ status: 0, stdout: 'file:///repo/packages/core/dist/local-providers.js\n', stderr: '' }),
      ),
      realpathSync: (p) => (p === '/repo/node_modules/@termfleet/core' ? '/repo/packages/core' : p),
    };
    const r = probeResolution('/repo', '@termfleet/core', '@termfleet/core/local-providers.js', io);
    expect(r.ok).toBe(false);
    expect(r.reason === 'outside-node-modules' || r.reason === 'escapes-into-repo').toBe(true);
  });

  test('a broken pkgDir symlink (realpathSync throws) during the new realpath check falls back to pkgDir itself, same defensive pattern as the existing escapes-into-repo check', () => {
    const dirs = new Set(['/repo/node_modules', '/repo/node_modules/termfleet']);
    const io: CollisionIO = {
      ...fakeIo(
        { '/repo/node_modules/termfleet/package.json': '{}' },
        dirs,
        () => ({ status: 0, stdout: 'file:///somewhere/else/entirely/index.js\n', stderr: '' }),
      ),
      realpathSync: () => {
        throw new Error('ENOENT: broken symlink');
      },
    };
    const r = probeResolution('/repo', 'termfleet', 'termfleet', io);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('outside-node-modules'); // falls back to pkgDir, which still doesn't match -> correctly still a collision
  });
});

describe('checkNamespaceCollisions — the assembled check, DI-driven', () => {
  test('no package.json at all → skip note, not a failure', () => {
    const io = fakeIo({}, new Set(['/repo']));
    const r = checkNamespaceCollisions('/repo', io);
    expect(r.failed).toBe(false);
    expect(r.notes.some((n) => /skip/i.test(n))).toBe(true);
  });

  test('Check A — host root package.json name is itself a protected name → failed, self-reference named', () => {
    const io = fakeIo({ '/repo/package.json': JSON.stringify({ name: 'termfleet' }) }, new Set(['/repo', '/repo/node_modules']));
    const r = checkNamespaceCollisions('/repo', io);
    expect(r.failed).toBe(true);
    expect(r.warns.some((w) => w.includes('self-reference') && w.includes('"termfleet"'))).toBe(true);
  });

  test('Check A never fires on an unrelated repo name', () => {
    const io = fakeIo({ '/repo/package.json': JSON.stringify({ name: 'my-app' }) }, new Set(['/repo', '/repo/node_modules']));
    const r = checkNamespaceCollisions('/repo', io);
    expect(r.failed).toBe(false);
  });

  test('Check A does NOT fire when the ROOT is named "open-autonomy" (not a bare-imported specifier — this repo\'s own dogfood regen)', () => {
    // open-autonomy is a CLI (node_modules/.bin), never bare-imported by the runner, so a repo named
    // open-autonomy is not an ESM self-reference hazard. This is exactly this repo's own dogfood shape
    // (root package.json name === "open-autonomy"); flagging it would false-alarm every regen.
    const io = fakeIo({ '/repo/package.json': JSON.stringify({ name: 'open-autonomy' }) }, new Set(['/repo', '/repo/node_modules']));
    const r = checkNamespaceCollisions('/repo', io);
    expect(r.failed).toBe(false);
    expect(r.warns).toEqual([]);
  });

  test('Check B STILL fires when a workspace MEMBER is named "open-autonomy" (the .bin-shadow risk is real)', () => {
    const dirs = new Set(['/repo', '/repo/node_modules', '/repo/packages', '/repo/packages/oa']);
    const io = fakeIo(
      {
        '/repo/package.json': JSON.stringify({ name: 'host-app', workspaces: ['packages/*'] }),
        '/repo/packages/oa/package.json': JSON.stringify({ name: 'open-autonomy' }),
      },
      dirs,
    );
    const r = checkNamespaceCollisions('/repo', io);
    expect(r.failed).toBe(true);
    expect(r.warns.some((w) => w.includes('workspace shadowing') && w.includes('open-autonomy'))).toBe(true);
  });

  test('Check B (direct) — a workspace member literally named "@termfleet/core" → failed, workspace-shadowing named, no chain suffix', () => {
    const dirs = new Set(['/repo', '/repo/node_modules', '/repo/packages', '/repo/packages/core']);
    const io = fakeIo(
      {
        '/repo/package.json': JSON.stringify({ name: 'host-app', workspaces: ['packages/*'] }),
        '/repo/packages/core/package.json': JSON.stringify({ name: '@termfleet/core' }),
      },
      dirs,
    );
    const r = checkNamespaceCollisions('/repo', io);
    expect(r.failed).toBe(true);
    const w = r.warns.find((x) => x.includes('workspace shadowing'))!;
    expect(w).toContain('@termfleet/core');
    expect(w).not.toContain('dependency chain');
  });

  test('Check B (transitive) — a workspace member named after a dep DEEP in termfleet\'s own tree → failed, prints the owning chain', () => {
    const dirs = new Set([
      '/repo',
      '/repo/node_modules',
      '/repo/node_modules/termfleet',
      '/repo/node_modules/some-lib',
      '/repo/packages',
      '/repo/packages/deep-dep',
    ]);
    const io = fakeIo(
      {
        '/repo/package.json': JSON.stringify({ name: 'host-app', workspaces: ['packages/*'] }),
        '/repo/node_modules/termfleet/package.json': JSON.stringify({ name: 'termfleet', dependencies: { 'some-lib': '^1.0.0' } }),
        '/repo/node_modules/some-lib/package.json': JSON.stringify({ name: 'some-lib', dependencies: { 'deep-dep': '^1.0.0' } }),
        '/repo/packages/deep-dep/package.json': JSON.stringify({ name: 'deep-dep' }),
      },
      dirs,
    );
    const r = checkNamespaceCollisions('/repo', io);
    expect(r.failed).toBe(true);
    const w = r.warns.find((x) => x.includes('workspace shadowing') && x.includes('deep-dep'))!;
    expect(w).toBeDefined();
    expect(w).toContain('deep-dep ← some-lib ← termfleet');
  });

  test('a yarn-style `{workspaces: {packages: [...]}}` object form is also honored', () => {
    const dirs = new Set(['/repo', '/repo/node_modules', '/repo/packages', '/repo/packages/core']);
    const io = fakeIo(
      {
        '/repo/package.json': JSON.stringify({ name: 'host-app', workspaces: { packages: ['packages/*'] } }),
        '/repo/packages/core/package.json': JSON.stringify({ name: 'ztrack' }),
      },
      dirs,
    );
    const r = checkNamespaceCollisions('/repo', io);
    expect(r.failed).toBe(true);
    expect(r.warns.some((w) => w.includes('ztrack'))).toBe(true);
  });

  test('no workspaces field at all → Check B is a no-op, never throws', () => {
    const io = fakeIo({ '/repo/package.json': JSON.stringify({ name: 'my-app' }) }, new Set(['/repo', '/repo/node_modules']));
    expect(() => checkNamespaceCollisions('/repo', io)).not.toThrow();
  });

  test('a clean repo with an unrelated workspace member passes clean, with the OK note', () => {
    const dirs = new Set(['/repo', '/repo/node_modules', '/repo/packages', '/repo/packages/utils']);
    const io = fakeIo(
      {
        '/repo/package.json': JSON.stringify({ name: 'my-app', workspaces: ['packages/*'] }),
        '/repo/packages/utils/package.json': JSON.stringify({ name: '@my-app/utils' }),
      },
      dirs,
    );
    const r = checkNamespaceCollisions('/repo', io);
    expect(r.failed).toBe(false);
    expect(r.notes.some((n) => n.includes('✓'))).toBe(true);
    expect(r.warns).toEqual([]);
  });
});

// ── LIVE fixture tests — real fs, real symlinks, real child `node` — one per check ─────────────────
// These are the tamper probes: they use checkNamespaceCollisions's REAL default IO end to end (no mocked
// `run`), so a regression that defangs Check A/B (e.g. stops reading `workspaces`) or reverts Check C to a
// bare `existsSync` goes red here even if a correspondingly-tampered fake `io` would keep the DI tests
// above green.
describe('checkNamespaceCollisions — LIVE fixtures (real fs, real symlinks, real node child process)', () => {
  function mk(): string {
    // realpathSync: on macOS, tmpdir() lives under /var, which is itself a symlink to /private/var — a
    // fixture path built from the UNRESOLVED tmpdir() would make probeResolution's cwd-vs-realpath
    // comparisons see two different spellings of the same directory (a spawned `node` child's
    // import.meta.resolve fully realpaths its result) and spuriously fail even a genuinely clean fixture.
    // Resolving once here (same fix as probeResolution's own cwd-absolutizing) keeps every path in these
    // fixtures canonical from the start, matching how a real repo checkout's cwd is not itself a symlink.
    return realpathSync(mkdtempSync(join(tmpdir(), 'oa-collision-live-')));
  }

  test('[Check A, live] root package.json literally named "termfleet" → self-reference collision, no network/install needed', () => {
    const dir = mk();
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'termfleet', version: '0.0.0' }));
      const r = checkNamespaceCollisions(dir);
      expect(r.failed).toBe(true);
      expect(r.warns.some((w) => w.includes('self-reference'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('[Check B, live] a workspace member symlinked exactly the way npm workspaces links it, named "@termfleet/core" → workspace-shadowing collision', () => {
    const dir = mk();
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'host-app', workspaces: ['packages/*'] }));
      mkdirSync(join(dir, 'packages', 'core'), { recursive: true });
      writeFileSync(join(dir, 'packages', 'core', 'package.json'), JSON.stringify({ name: '@termfleet/core', version: '0.0.0-dev' }));
      const r = checkNamespaceCollisions(dir);
      expect(r.failed).toBe(true);
      expect(r.warns.some((w) => w.includes('workspace shadowing') && w.includes('@termfleet/core'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('[Check C, live] node_modules/termfleet EXISTS but is a real symlink into the repo tree (npm workspace link shape) → resolution-probe collision even though Checks A/B see nothing wrong here', () => {
    const dir = mk();
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'unrelated-host-name', version: '0.0.0' }));
      // The real npm-workspaces shape: the "real" package lives at a repo-tracked path, and
      // node_modules/termfleet is a symlink to it — never a registry copy. Neither Check A (root name is
      // NOT "termfleet") nor Check B (no `workspaces` field declared at all here) would catch this alone —
      // only the resolution probe does, which is exactly why it's the AUTHORITATIVE check.
      mkdirSync(join(dir, 'packages', 'core'), { recursive: true });
      writeFileSync(join(dir, 'packages', 'core', 'package.json'), JSON.stringify({ name: 'termfleet', version: '0.0.0-dev', main: 'index.js' }));
      writeFileSync(join(dir, 'packages', 'core', 'index.js'), 'module.exports = {};\n');
      mkdirSync(join(dir, 'node_modules'), { recursive: true });
      symlinkSync(join(dir, 'packages', 'core'), join(dir, 'node_modules', 'termfleet'), 'dir');
      const r = checkNamespaceCollisions(dir);
      expect(r.failed).toBe(true);
      expect(r.warns.some((w) => w.includes('resolution probe') && w.includes('termfleet'))).toBe(true);
      // Confirms this is NOT something Check A/B could have caught — proving Check C's "authoritative,
      // catches anything A/B missed" role rather than merely re-deriving the same signal. (Note: the
      // resolution-probe error TEXT may mention "self-reference" as an explanation of the mechanism — so
      // assert on the CHECK'S OWN label prefix, not a bare substring, to avoid a false pass/fail on wording.)
      expect(r.warns.some((w) => w.includes('COLLISION (self-reference)'))).toBe(false);
      expect(r.warns.some((w) => w.includes('COLLISION (workspace shadowing)'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Fix 2 (pnpm-workspace-install-hardening), LIVE: reproduces pnpm's actual on-disk shape —
  // node_modules/@termfleet/core is a SYMLINK into node_modules/.pnpm/<name>@<version>/node_modules/<name>,
  // a sibling directory INSIDE node_modules, never into the repo's own source tree. This is a perfectly
  // healthy pnpm install (nothing shadows anything), so Check C must NOT flag it — before this fix, a real
  // child `node --input-type=module -e "import.meta.resolve(...)"` realpaths through the symlink, landing
  // the resolved path under node_modules/.pnpm/... instead of literally under node_modules/@termfleet/core/,
  // and the old literal-prefix-only check false-positived "outside-node-modules" on this exact shape.
  test('[Check C, live, pnpm layout] node_modules/@termfleet/core is a pnpm-style symlink into node_modules/.pnpm/.../node_modules/@termfleet/core → NO false alarm (healthy pnpm install)', () => {
    const dir = mk();
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'unrelated-host-name', version: '0.0.0' }));
      const storeDir = join(dir, 'node_modules', '.pnpm', '@termfleet+core@1.0.0', 'node_modules', '@termfleet', 'core');
      mkdirSync(storeDir, { recursive: true });
      writeFileSync(
        join(storeDir, 'package.json'),
        JSON.stringify({ name: '@termfleet/core', version: '1.0.0', exports: { './local-providers.js': './local-providers.js' } }),
      );
      writeFileSync(join(storeDir, 'local-providers.js'), 'export function resolveDefaultProvider() { return {}; }\n');
      mkdirSync(join(dir, 'node_modules', '@termfleet'), { recursive: true });
      symlinkSync(storeDir, join(dir, 'node_modules', '@termfleet', 'core'), 'dir');
      const r = checkNamespaceCollisions(dir);
      expect(r.failed).toBe(false);
      expect(r.notes.some((n) => n.includes('✓'))).toBe(true);
      expect(r.warns).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Same pnpm-symlink SHAPE, but the .pnpm store copy is itself a symlink to a workspace member's own
  // source (the real collision this whole check exists to catch — a workspace member named @termfleet/core
  // shadowing the published package even under pnpm). Proves Fix 2 didn't blanket-accept "anything a pnpm
  // symlink points at" — only a resolution that lands inside pkgDir's OWN realpath is accepted, and here
  // pkgDir's realpath (after following node_modules/@termfleet/core -> the workspace member) is the repo's
  // own source tree, not a node_modules/.pnpm/ store copy, so the escapes-into-repo check (unchanged by
  // Fix 2) still fires.
  test('[Check C, live, pnpm layout] node_modules/@termfleet/core symlinked STRAIGHT to a workspace member source (no .pnpm store hop) → still a collision, never weakened by the pnpm realpath acceptance', () => {
    const dir = mk();
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'unrelated-host-name', workspaces: ['packages/*'] }));
      mkdirSync(join(dir, 'packages', 'core'), { recursive: true });
      writeFileSync(
        join(dir, 'packages', 'core', 'package.json'),
        JSON.stringify({ name: '@termfleet/core', version: '0.0.0-dev', exports: { './local-providers.js': './local-providers.js' } }),
      );
      writeFileSync(join(dir, 'packages', 'core', 'local-providers.js'), 'export function resolveDefaultProvider() { return {}; }\n');
      mkdirSync(join(dir, 'node_modules', '@termfleet'), { recursive: true });
      symlinkSync(join(dir, 'packages', 'core'), join(dir, 'node_modules', '@termfleet', 'core'), 'dir');
      const r = checkNamespaceCollisions(dir);
      expect(r.failed).toBe(true);
      // Caught by Check B (workspace shadowing, since it's a declared workspace member here) at minimum;
      // the resolution probe (Check C) must ALSO still see the escape, not be fooled into an 'ok'.
      const probeResult = probeResolution(dir, '@termfleet/core', '@termfleet/core/local-providers.js');
      expect(probeResult.ok).toBe(false);
      expect(probeResult.reason).toBe('escapes-into-repo');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('[no false alarm, live] a real (non-symlinked) node_modules/termfleet directory with an unrelated host name passes clean', () => {
    const dir = mk();
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'my-real-app', version: '1.0.0' }));
      mkdirSync(join(dir, 'node_modules', 'termfleet'), { recursive: true });
      writeFileSync(
        join(dir, 'node_modules', 'termfleet', 'package.json'),
        JSON.stringify({ name: 'termfleet', version: '0.2.0', main: 'index.js', exports: { '.': './index.js' } }),
      );
      writeFileSync(join(dir, 'node_modules', 'termfleet', 'index.js'), 'export const x = 1;\n');
      const r = checkNamespaceCollisions(dir);
      expect(r.failed).toBe(false);
      expect(r.notes.some((n) => n.includes('✓'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Regression: a real `open-autonomy` install (the pack-smoke harness's own throwaway consumer project)
  // was a FALSE ALARM before this fix — "open-autonomy" ships bin-only (no "main"/"exports"), so
  // `import.meta.resolve('open-autonomy')` fails on EVERY install, healthy or not. It must never be probed
  // by Check C; only Checks A/B (pure name-matches) apply to it.
  test('[no false alarm, live] a real, healthy, non-colliding "open-autonomy" install (bin-only, no main/exports) is never probed by Check C', () => {
    const dir = mk();
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'throwaway-consumer', version: '1.0.0' }));
      mkdirSync(join(dir, 'node_modules', 'open-autonomy'), { recursive: true });
      // The real shape (package.json:24-31 of this repo): a `bin` map, no `main`, no `exports` — a
      // bare `import.meta.resolve('open-autonomy')` ALWAYS throws ERR_MODULE_NOT_FOUND for this shape.
      writeFileSync(
        join(dir, 'node_modules', 'open-autonomy', 'package.json'),
        JSON.stringify({ name: 'open-autonomy', version: '0.4.1', bin: { 'open-autonomy': 'dist/cli.js', oa: 'dist/cli.js' } }),
      );
      mkdirSync(join(dir, 'node_modules', 'open-autonomy', 'dist'), { recursive: true });
      writeFileSync(join(dir, 'node_modules', 'open-autonomy', 'dist', 'cli.js'), '#!/usr/bin/env node\nconsole.log("cli");\n');
      const r = checkNamespaceCollisions(dir);
      expect(r.failed).toBe(false);
      expect(r.warns).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

test('DIRECT_PROTECTED_NAMES sanity — the fixed static contract this whole check is built on (Check B)', () => {
  expect(DIRECT_PROTECTED_NAMES).toEqual(['termfleet', '@termfleet/core', 'ztrack', 'open-autonomy']);
});

test('SELF_REFERENCE_NAMES pin — Check A covers only the BARE-IMPORTED names (open-autonomy excluded, it is never imported)', () => {
  expect(SELF_REFERENCE_NAMES).toEqual(['termfleet', '@termfleet/core', 'ztrack']);
});

test('RESOLUTION_PROBE_SPECIFIERS pin — Check C probes the ACTUAL runtime specifiers (subpaths for @termfleet/core + ztrack), not the bare package roots', () => {
  // Unpinned, this list would silently rot: dropping the @termfleet/core or ztrack subpath specifier keeps
  // every other test green (the DI tests stub `run`), so pin it explicitly. open-autonomy must NOT appear
  // (bin-only, no importable entry — probing it false-alarms on every healthy install).
  expect(RESOLUTION_PROBE_SPECIFIERS).toEqual([
    { name: 'termfleet', specifier: 'termfleet' },
    { name: '@termfleet/core', specifier: '@termfleet/core/local-providers.js' },
    { name: 'ztrack', specifier: 'ztrack/preset-kit' },
  ]);
  expect(RESOLUTION_PROBE_SPECIFIERS.some((s) => s.name === 'open-autonomy')).toBe(false);
});
