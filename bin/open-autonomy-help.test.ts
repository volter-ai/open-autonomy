// OA-11: pins `open-autonomy --help`'s adoption hint. Spawns the REAL CLI (never imports the HELP
// constant directly) — the printed bytes are the product surface; testing an exported string would keep
// passing even if the print path itself regressed (e.g. the wrong constant printed, or a stale copy).
//
// F-10: the old hint recommended `compile self-driving gh-actions .` — a whole-repo SCAFFOLD — as "the
// way to adopt into the current repo", exactly backwards from README.md's own guidance (existing repos
// want the additive overlays: simple-gh-sdlc / simple-sdlc / hello). These assertions each independently
// FAILED against the pre-fix HELP string in bin/open-autonomy.ts and pass after.
import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..');

function help(...args: string[]): { exitCode: number; stdout: string; stderr: string } {
  const r = Bun.spawnSync(['bun', join(REPO_ROOT, 'bin', 'open-autonomy.ts'), ...args], {
    cwd: REPO_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return { exitCode: r.exitCode, stdout: r.stdout.toString('utf8'), stderr: r.stderr.toString('utf8') };
}

describe('open-autonomy --help — adoption hint (OA-11 / F-10)', () => {
  test('exits 0 and prints something', () => {
    const r = help('--help');
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim().length).toBeGreaterThan(0);
  });

  test('bare invocation (no args) exits 2', () => {
    const r = help();
    expect(r.exitCode).toBe(2);
  });

  test('AC-1: overlay-first ordering — the first of "compile simple-"/"compile self-driving" to appear is an overlay', () => {
    const { stdout } = help('--help');
    const lines = stdout.split('\n');
    const firstMatch = lines.find((l) => /compile simple-|compile self-driving/.test(l));
    expect(firstMatch).toBeDefined();
    expect(firstMatch).toContain('compile simple-');
  });

  test('AC-2: the scaffold command is labeled SCAFFOLD + NEW, and "existing repo" appears as its companion label', () => {
    const { stdout } = help('--help');
    const lines = stdout.split('\n');
    const scaffoldLineIdx = lines.findIndex((l) => l.includes('compile self-driving'));
    expect(scaffoldLineIdx).toBeGreaterThan(-1);
    // The line immediately preceding the scaffold command names it a SCAFFOLD and frames it as the NEW/
    // dedicated-repo path (case-sensitive, per the spec's test contract) — mirrors README.md's own
    // vocabulary and the clobber-guard error text in bin/autonomy-compile.ts. NEW is pinned explicitly so
    // a future edit can't quietly drop the NEW/dedicated framing while keeping SCAFFOLD.
    expect(lines[scaffoldLineIdx - 1]).toContain('SCAFFOLD');
    expect(lines[scaffoldLineIdx - 1]).toContain('NEW');
    expect(stdout.toLowerCase()).toContain('existing repo');
  });

  test('AC-3: no "current repo" line pairs with self-driving (the exact bug: the hint used to send existing-repo adopters to the scaffold)', () => {
    const { stdout } = help('--help');
    const currentRepoLines = stdout.split('\n').filter((l) => /current repo/i.test(l));
    expect(currentRepoLines.length).toBeGreaterThan(0);
    for (const l of currentRepoLines) {
      expect(l).not.toContain('self-driving');
    }
  });

  test('AC-4: every bundled profile (profiles/*/ir.yml) is named in the help output, including hello-human and soc2-baseline', () => {
    const { stdout } = help('--help');
    const bundled = readdirSync(join(REPO_ROOT, 'profiles'), { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(join(REPO_ROOT, 'profiles', e.name, 'ir.yml')))
      .map((e) => e.name);
    expect(bundled).toContain('hello-human');
    expect(bundled).toContain('soc2-baseline');
    for (const name of bundled) {
      expect(stdout).toContain(name);
    }
  });

  test('AC-4 mutation: a temp profiles/zz-test/ir.yml shows up in --help with NO code edit', () => {
    const zzDir = join(REPO_ROOT, 'profiles', 'zz-test');
    // Guard: never touch this path if it already (unexpectedly) exists — it's a fixed literal path this
    // test owns end-to-end, not a variable that could resolve to something else.
    expect(existsSync(zzDir)).toBe(false);
    mkdirSync(zzDir, { recursive: true });
    writeFileSync(join(zzDir, 'ir.yml'), 'schema: autonomy.ir.v1\ntargets: [local]\nagents: {}\npolicy: { box: {} }\n');
    try {
      const { stdout } = help('--help');
      expect(stdout).toContain('zz-test');
    } finally {
      // Remove by the exact literal path constructed above — never an unguarded rm -rf on a variable that
      // could resolve empty (docs/standards — see bin/pack-smoke.ts's SAFETY note for the house pattern).
      rmSync(zzDir, { recursive: true, force: true });
    }
    expect(existsSync(zzDir)).toBe(false);
  });

  // OA-11 lazy-import guard (skeptic-panel probe 2e). The whole reason `--help` survives a broken package
  // (OA-01: it was one of only two verbs that still ran in 0.4.x) is that bin/open-autonomy.ts's pre-verb
  // path — the module itself plus everything it STATICALLY imports (now including bin/bundled-profiles.ts)
  // — pulls in NO substrate/core package. Every @open-autonomy/* package is loaded only inside the verb
  // switch's dynamic `import()` calls, which never run for `--help`. This test enforces that structurally,
  // by reading the source: a module-scope `import … from '@open-autonomy/…'` (or a bare
  // `import '@open-autonomy/…'`) in EITHER file turns it red. That mutation — the exact one the panel found
  // slipped past every other gate — would otherwise make `--help` exit 1 under an init-time throw in a
  // substrate while shipping green. Dynamic `import(...)` calls are unaffected (the negative lookahead
  // below excludes them), so the verb switch is free to keep lazy-loading substrates.
  test('lazy-import guard: neither open-autonomy.ts nor bundled-profiles.ts STATICALLY imports an @open-autonomy/* (or packages/*) substrate', () => {
    const files = ['open-autonomy.ts', 'bundled-profiles.ts'];
    // Collect the specifier of every STATIC import statement (both `import … from 'x'` and bare
    // `import 'x'`), excluding dynamic `import(...)` call expressions via the `(?!\s*\()` lookahead.
    const staticImportSpecifiers = (src: string): string[] => {
      const specs: string[] = [];
      const fromRe = /\bimport\b(?!\s*\()[\s\S]*?\bfrom\s*['"]([^'"]+)['"]/g;
      const bareRe = /\bimport\b(?!\s*\()\s*['"]([^'"]+)['"]/g;
      let m: RegExpExecArray | null;
      while ((m = fromRe.exec(src))) specs.push(m[1]!);
      while ((m = bareRe.exec(src))) specs.push(m[1]!);
      return specs;
    };
    const forbidden = (spec: string): boolean =>
      spec.startsWith('@open-autonomy/') || /(^|\/)packages\/(core|substrate-)/.test(spec);
    for (const f of files) {
      const src = readFileSync(join(REPO_ROOT, 'bin', f), 'utf8');
      const offenders = staticImportSpecifiers(src).filter(forbidden);
      expect({ file: f, offenders }).toEqual({ file: f, offenders: [] });
    }
  });
});
