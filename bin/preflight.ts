#!/usr/bin/env node
// open-autonomy preflight — make an adopter repo install-ready, STRUCTURALLY, so the environment
// gotchas the first live install hit never reach the operator. Run from the adopter repo root AFTER
// installing the runner deps (`npm install termfleet` + `npm install -D ztrack`), BEFORE committing the
// harness. Idempotent — safe to re-run.
//
//   1. node-pty — termfleet's `virtual-tmux` provider spawns PTYs via @homebridge/node-pty-prebuilt-
//      multiarch, which ships NO prebuilt for newer Node (23/24) → the provider would crash at launch with
//      "Cannot find module '.../pty.node'". We rebuild it under the local Node so the provider starts.
//   2. lockfile — adding the runner deps under a different Node/npm than the repo's CI can desync
//      package-lock.json so the repo's CI `npm ci` rejects it ("package.json and package-lock.json are not in
//      sync") — and `npm run build` passes locally (it reuses node_modules) so it only surfaces in CI, on the
//      first agent PR. We verify `npm ci` under the repo's *CI Node version* in a throwaway copy (the repo's
//      node_modules is never touched) and regenerate the lock under that Node if it's out of sync.
import { existsSync, readFileSync, readdirSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const cwd = process.cwd();
let failed = false;
const note = (m: string) => console.log(`preflight: ${m}`);
const warn = (m: string) => { console.log(`preflight: ! ${m}`); failed = true; };
const run = (cmd: string, args: string[], opts: Record<string, unknown> = {}) =>
  spawnSync(cmd, args, { encoding: 'utf8', ...opts });
const have = (cmd: string) => { try { return run(cmd, ['--version']).status === 0; } catch { return false; } };

const PTY = 'node_modules/@homebridge/node-pty-prebuilt-multiarch';
const ptyBuilt = () => ['build/Release/pty.node', 'build/Debug/pty.node'].some((p) => existsSync(join(cwd, PTY, p)));

// ── 1. node-pty: termfleet's provider native module ─────────────────────────────────────────────
function ensureNodePty(): void {
  if (!existsSync(join(cwd, PTY))) {
    note('termfleet/node-pty not installed yet — skip (run after `npm install termfleet`)');
    return;
  }
  if (ptyBuilt()) { note('node-pty native module present (termfleet provider can start) ✓'); return; }
  note('node-pty native module missing (no prebuilt for this Node) — rebuilding (the local provider needs it)…');
  run('npm', ['rebuild', '@homebridge/node-pty-prebuilt-multiarch'], { stdio: 'inherit' });
  if (ptyBuilt()) note('node-pty rebuilt ✓');
  else warn('node-pty rebuild FAILED — install the build toolchain (Xcode CLT / build-essential) and re-run `open-autonomy preflight`');
}

// ── 2. lockfile: `npm ci` under the repo's CI Node version ──────────────────────────────────────
function detectCiNodeMajor(): string | null {
  if (existsSync(join(cwd, '.nvmrc'))) {
    const m = readFileSync(join(cwd, '.nvmrc'), 'utf8').match(/(\d+)/);
    if (m) return m[1]!;
  }
  const wf = join(cwd, '.github/workflows');
  if (existsSync(wf)) {
    for (const f of readdirSync(wf)) {
      if (!/\.ya?ml$/.test(f)) continue;
      const m = readFileSync(join(wf, f), 'utf8').match(/node-version:\s*['"]?(\d+)/);
      if (m) return m[1]!;
    }
  }
  try {
    const eng = (JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')).engines || {}).node as string | undefined;
    const m = eng && eng.match(/(\d+)/);
    if (m) return m[1]!;
  } catch { /* no/invalid package.json */ }
  return null;
}

// A real lock↔package.json desync (npm's EUSAGE), vs an environment/mount failure we must NOT mistake for a
// bad lock (don't regenerate on those — that could corrupt a fine lock).
const isLockDesync = (out: string) => /not in sync|EUSAGE|Missing:|can only install packages when/i.test(out);

function verifyLock(): void {
  if (!existsSync(join(cwd, 'package-lock.json'))) { note('no package-lock.json (not an npm repo) — skip lockfile check'); return; }
  const ci = detectCiNodeMajor();
  const local = process.versions.node.split('.')[0]!;
  const useDocker = !!ci && ci !== local && have('docker') && run('docker', ['info'], { stdio: 'ignore' }).status === 0;
  // Verify in a THROWAWAY copy (package.json + lock only) so the repo's node_modules — with the node-pty we
  // just rebuilt — is never disturbed. The copy lives UNDER cwd (not $TMPDIR) so Docker Desktop, which on
  // macOS only file-shares /Users etc. and NOT /var/folders, can mount it. `npm ci --dry-run` does the
  // lock↔package.json sync check (fails fast when out of sync) without installing.
  const t = mkdtempSync(join(cwd, '.oa-preflight-'));
  try {
    copyFileSync(join(cwd, 'package.json'), join(t, 'package.json'));
    copyFileSync(join(cwd, 'package-lock.json'), join(t, 'package-lock.json'));
    const inNode = (a: string[]) => {
      const r = useDocker
        ? run('docker', ['run', '--rm', '-v', `${t}:/app`, '-w', '/app', `node:${ci}`, ...a])
        : run(a[0]!, a.slice(1), { cwd: t });
      return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
    };
    const where = useDocker
      ? `under node:${ci} (the repo's CI version)`
      : `(local node ${local}${ci && ci !== local ? `; CI uses ${ci} but docker is unavailable — best-effort local check` : ''})`;
    note(`verifying the lockfile with \`npm ci\` ${where}…`);
    const first = inNode(['npm', 'ci', '--dry-run', '--no-audit', '--no-fund']);
    if (first.status === 0) { note("lockfile in sync — the repo's CI `npm ci` will accept it ✓"); return; }
    if (!isLockDesync(first.out)) {
      warn(`could not verify the lockfile (environment issue, not a lock desync) — verify manually with \`npm ci\`:\n${first.out.trim().split('\n').slice(-3).join('\n')}`);
      return;
    }
    note('CI `npm ci` REJECTS the current lock (Node/npm version drift) — regenerating package-lock.json under the CI Node…');
    inNode(['npm', 'install', '--package-lock-only', '--no-audit', '--no-fund']);
    if (inNode(['npm', 'ci', '--dry-run', '--no-audit', '--no-fund']).status !== 0) {
      warn('npm ci still failing after lock regen — resolve the lockfile manually');
      return;
    }
    copyFileSync(join(t, 'package-lock.json'), join(cwd, 'package-lock.json'));
    note('package-lock.json regenerated under the CI Node + `npm ci` now passes ✓ — commit the updated lock');
  } finally {
    rmSync(t, { recursive: true, force: true });
  }
}

console.log('open-autonomy preflight — environment checks for a local-runner install\n');
ensureNodePty();
verifyLock();
console.log(failed ? '\npreflight: FAILED — fix the item(s) above and re-run.' : '\npreflight: OK — environment is install-ready ✓');
process.exit(failed ? 1 : 0);
