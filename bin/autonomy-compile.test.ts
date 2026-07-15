// BL-14: fixture test for the fresh-compile clobber guard, exercised through the REAL CLI (not just the
// underlying findClobbers unit — the AC is about `open-autonomy compile` behavior end-to-end: refuse by
// default, --force overrides, and an additive profile never trips it).
import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KNOWN_GOOD_ZTRACK } from './ztrack-preset.ts';

const REPO_ROOT = join(import.meta.dir, '..');

function compile(args: string[]): { exitCode: number; stdout: string; stderr: string } {
  const r = Bun.spawnSync(['bun', join(REPO_ROOT, 'bin', 'autonomy-compile.ts'), ...args], {
    cwd: REPO_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return { exitCode: r.exitCode, stdout: r.stdout.toString('utf8'), stderr: r.stderr.toString('utf8') };
}

describe('autonomy-compile — fresh-compile clobber guard (BL-14)', () => {
  test('compiling self-driving into a dir with an existing, DIFFERENT README.md refuses and names the file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-clobber-'));
    try {
      writeFileSync(join(dir, 'README.md'), "this is the adopter's OWN pre-existing readme\n");
      const r = compile(['self-driving', 'gh-actions', dir]);
      expect(r.exitCode).toBe(1);
      expect(r.stderr).toContain('would overwrite');
      expect(r.stderr).toContain('README.md');
      expect(r.stderr).toContain('--force');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('--force proceeds and overwrites', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-clobber-force-'));
    try {
      writeFileSync(join(dir, 'README.md'), "this is the adopter's OWN pre-existing readme\n");
      const r = compile(['self-driving', 'gh-actions', dir, '--force']);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('installed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  test('an additive profile (simple-gh-sdlc) compiling into the SAME populated dir is never refused', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-clobber-overlay-'));
    try {
      writeFileSync(join(dir, 'README.md'), "this is the adopter's OWN pre-existing readme, totally unrelated\n");
      writeFileSync(join(dir, 'package.json'), '{"name":"their-app","version":"1.0.0"}\n');
      const r = compile(['simple-gh-sdlc', 'gh-actions', dir]);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('installed');
      expect(r.stderr).not.toContain('would overwrite');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  test('compiling into a fresh (non-existent) dir is never refused', () => {
    const parent = mkdtempSync(join(tmpdir(), 'oa-clobber-fresh-'));
    const dir = join(parent, 'nested', 'outdir');
    try {
      const r = compile(['hello', 'gh-actions', dir]);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('installed');
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  }, 30_000);
});

describe('autonomy-compile — local schedule target configuration', () => {
  test('applies independent fences through the real CLI without putting them in profile policy', () => {
    const parent = mkdtempSync(join(tmpdir(), 'oa-schedule-config-'));
    const dir = join(parent, 'install');
    const config = join(parent, 'schedule.json');
    try {
      writeFileSync(config, JSON.stringify({
        schema: 'open-autonomy.local-schedule-config.v1',
        defaults: { fence: '.open-autonomy/paused', retrySeconds: 300 },
        agents: {
          planner: { fence: '.open-autonomy/audits-paused', retrySeconds: 3600 },
          kaizen: { fence: '.open-autonomy/audits-paused', retrySeconds: 3600 },
        },
      }));
      const r = compile(['simple-gh', 'local', dir, '--local-schedule-config', config]);
      expect(r.exitCode).toBe(0);
      const schedule = JSON.parse(readFileSync(join(dir, 'scheduler', 'schedule.json'), 'utf8')) as {
        jobs: Array<{ name: string; fence: string; retrySeconds: number }>;
      };
      expect(schedule.jobs.find(({ name }) => name === 'manager')).toMatchObject({
        fence: '.open-autonomy/paused', retrySeconds: 300,
      });
      for (const name of ['planner', 'kaizen']) {
        expect(schedule.jobs.find((job) => job.name === name)).toMatchObject({
          fence: '.open-autonomy/audits-paused', retrySeconds: 3600,
        });
      }
      expect(readFileSync(join(dir, '.open-autonomy', 'paused'), 'utf8')).toContain('rm .open-autonomy/paused');
      expect(readFileSync(join(dir, '.open-autonomy', 'audits-paused'), 'utf8')).toContain('rm .open-autonomy/audits-paused');
      const manifest = JSON.parse(readFileSync(join(dir, '.open-autonomy', 'generated.json'), 'utf8')) as { files: string[] };
      expect(manifest.files).not.toContain('.open-autonomy/paused');
      expect(manifest.files).not.toContain('.open-autonomy/audits-paused');
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  }, 30_000);

  test('rejects local schedule config on a non-local target', () => {
    const parent = mkdtempSync(join(tmpdir(), 'oa-schedule-config-target-'));
    const config = join(parent, 'schedule.json');
    try {
      writeFileSync(config, JSON.stringify({ schema: 'open-autonomy.local-schedule-config.v1' }));
      const r = compile(['hello', 'gh-actions', '--local-schedule-config', config]);
      expect(r.exitCode).toBe(2);
      expect(r.stderr).toContain('only applies to the "local" substrate');
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});

describe('autonomy-compile — printed next-steps include the commit-the-harness step (OA-03, AC-7)', () => {
  test('no-tracker profile (hello, local): "Commit the harness" is step 4, "Run the loop" is step 5', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-nextsteps-hello-'));
    try {
      const r = compile(['hello', 'local', dir]);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('4. Commit the harness');
      expect(r.stdout).toContain('5. Run the loop');
      // The commit step must appear BEFORE the run-the-loop step.
      expect(r.stdout.indexOf('Commit the harness')).toBeGreaterThan(0);
      expect(r.stdout.indexOf('Commit the harness')).toBeLessThan(r.stdout.indexOf('Run the loop'));
      // No tracker step for `hello` — numbering must not skip to 5/6.
      expect(r.stdout).not.toContain('5. Commit the harness');
      expect(r.stdout).not.toContain('6. Run the loop');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  test('tracker profile (simple-sdlc, local): "Commit the harness" is step 5, "Run the loop" is step 6', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-nextsteps-sdlc-'));
    try {
      const r = compile(['simple-sdlc', 'local', dir]);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('4. Tracker');
      expect(r.stdout).toContain('5. Commit the harness');
      expect(r.stdout).toContain('6. Run the loop');
      expect(r.stdout.indexOf('Commit the harness')).toBeLessThan(r.stdout.indexOf('Run the loop'));
      expect(r.stdout).not.toContain('4. Commit the harness');
      expect(r.stdout).not.toContain('5. Run the loop');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  test('commit-the-harness text names the worktree failure mode and a staging list DERIVED from this compile', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-nextsteps-text-'));
    try {
      const r = compile(['hello', 'local', dir]);
      expect(r.stdout).toContain('git worktrees');
      expect(r.stdout).toContain('Unknown command: /develop');
      // hello's footprint: no standards/ (hardcoding it made the printed command die with
      // `fatal: pathspec 'standards/' did not match any files` and the &&-chained commit never ran).
      expect(r.stdout).toContain('git add .claude/ .codex/ .open-autonomy/ scheduler/ scripts/');
      expect(r.stdout).not.toContain('standards/');
      expect(r.stdout).toContain('git commit -m "Install the open-autonomy harness"');
      expect(r.stdout).toContain('docs/OPERATIONS.md#local-runner-quickstart');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  test('a profile WITH standards/ (simple-sdlc) still stages it — the derived list is per-profile, not truncated', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-nextsteps-sdlc-stage-'));
    try {
      const r = compile(['simple-sdlc', 'local', dir]);
      expect(r.stdout).toContain('git add .claude/ .codex/ .open-autonomy/ scheduler/ scripts/ standards/');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  test("hello's exact printed commit command RUNS clean end-to-end (git exits 0, everything staged + committed)", () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-nextsteps-runcmd-'));
    try {
      const r = compile(['hello', 'local', dir]);
      expect(r.exitCode).toBe(0);
      // The printed command line includes the `cd <dir> && ` prefix (outDir != '.'), so it is runnable as-is.
      const line = r.stdout.split('\n').find((l) => l.includes('git add '));
      expect(line).toBeDefined();
      const initGit = (args: string[]) => Bun.spawnSync(['git', ...args], { cwd: dir });
      initGit(['init', '-q']);
      initGit(['config', 'user.email', 'oa03-test@example.com']);
      initGit(['config', 'user.name', 'OA-03 test']);
      const run = Bun.spawnSync(['bash', '-c', line!.trim()], { stdout: 'pipe', stderr: 'pipe' });
      const stderr = run.stderr.toString('utf8');
      expect(stderr).not.toContain('did not match any files'); // the exact Blocker-2 failure mode
      expect(run.exitCode).toBe(0);
      // Everything the compile wrote is now committed — the working tree is clean.
      const st = Bun.spawnSync(['git', 'status', '--porcelain'], { cwd: dir, stdout: 'pipe' });
      expect(st.stdout.toString('utf8').trim()).toBe('');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});

// OA-12 (docs/adoption-fixes/OA-12-tracker-onboarding-docs-and-compile-hint.md, AC-4): the tracker step of
// the printed next-steps must (a) pin the install to KNOWN_GOOD_ZTRACK instead of a bare `npm install -D
// ztrack` (version-drift: `npx` can resolve a different major than the repo's pin), (b) never print a bare
// non-conforming `npx ztrack issue create` (no --title/--assignee/AC body) — only a pointer at the
// conforming form, and (c) mention the `.volter/`-exists no-op so an adopter with tracker history doesn't
// assume a silent no-op init actually did something.
describe('autonomy-compile — OA-12: tracker next-steps print pinned install + conforming pointer + no-op caveat', () => {
  test('tracker profile (simple-sdlc, local): prints the pinned install, no bare issue-create, and the .volter/ caveat', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa12-nextsteps-sdlc-'));
    try {
      const r = compile(['simple-sdlc', 'local', dir]);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain(`npm install -D ztrack@${KNOWN_GOOD_ZTRACK}`);
      // Never a bare, non-conforming create — only the conforming-fields pointer.
      expect(r.stdout).not.toContain('`npx ztrack issue create`');
      expect(r.stdout).toContain('a conforming issue needs --title, --assignee');
      expect(r.stdout).toContain('## Acceptance Criteria');
      expect(r.stdout).toContain('docs/OPERATIONS.md#local-runner-quickstart step 6');
      // The .volter/-exists no-op caveat.
      expect(r.stdout).toContain('.volter/ exists');
      expect(r.stdout).toContain('.volter/tracker-config.json');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});

// OA-04 (docs/adoption-fixes/OA-04-workspace-name-collision-detection.md): compiling into a repo whose
// package.json (or a declared workspace member) collides with the runner's own dependency namespace must
// refuse LOUDLY before writing anything — mirroring the clobber guard's shape (refuse by default,
// `--force` overrides). At compile time termfleet is typically not installed yet, so no real npm install
// is needed here — this exercises checks A/B (the static protected-name set) exactly as the spec's own
// note describes; bin/preflight.test.ts's OA-04 describe block covers the full checks A+B+C against a
// real npm-installed fixture (needs termfleet actually on disk for Check C to have anything to probe).
describe('autonomy-compile — OA-04 namespace-collision gate', () => {
  test('a target repo whose root package.json is itself named "termfleet" (with a colliding workspace member) refuses before writing any file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-collision-compile-'));
    try {
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'termfleet', version: '0.0.0-dev', exports: { '.': './dist/index.js' }, workspaces: ['packages/*'] }),
      );
      mkdirSync(join(dir, 'packages', 'core'), { recursive: true });
      writeFileSync(join(dir, 'packages', 'core', 'package.json'), JSON.stringify({ name: '@termfleet/core', version: '0.2.0' }));
      const r = compile(['simple-sdlc', 'local', dir]);
      expect(r.exitCode).toBe(1);
      expect(r.stderr).toContain('COLLISION (self-reference)');
      expect(r.stderr).toContain('COLLISION (workspace shadowing)');
      expect(r.stderr).toContain('--force');
      expect(r.stdout).not.toMatch(/installed \d+ files/); // nothing written
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('--force compiles anyway despite the collision (the same escape hatch the clobber guard uses)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-collision-compile-force-'));
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'termfleet', version: '0.0.0-dev' }));
      const r = compile(['simple-sdlc', 'local', dir, '--force']);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('installed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  test('a target repo with an unrelated name and no workspace collision compiles clean (no false alarm)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-collision-compile-clean-'));
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'their-totally-unrelated-app', version: '1.0.0' }));
      const r = compile(['simple-sdlc', 'local', dir]);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('installed');
      expect(r.stderr).not.toContain('COLLISION');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  test('a target dir with NO package.json at all is never checked (nothing to collide with yet) — compiles clean', () => {
    const parent = mkdtempSync(join(tmpdir(), 'oa-collision-compile-nopkg-'));
    const dir = join(parent, 'fresh');
    try {
      const r = compile(['hello', 'local', dir]);
      expect(r.exitCode).toBe(0);
      expect(r.stderr).not.toContain('COLLISION');
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  }, 30_000);

  // BLOCKER 1 (skeptic panel): the documented adopter command is `compile simple-sdlc local .` — a RELATIVE
  // outDir. Check C resolves each specifier to an ABSOLUTE path; if the gate compares that against a
  // node_modules prefix built from the relative `.`, every probe spuriously reads "outside node_modules"
  // and a HEALTHY clean repo hard-fails. Reproduce with a real-ish node_modules/termfleet so Check C
  // actually probes (it is a no-op when termfleet isn't installed). Faked node_modules (a real dir with an
  // exports map + entry) is enough for `import.meta.resolve('termfleet')` to resolve — no network needed.
  const compileIn = (cwd: string, args: string[]) => {
    const r = Bun.spawnSync(['bun', join(REPO_ROOT, 'bin', 'autonomy-compile.ts'), ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
    return { exitCode: r.exitCode, stdout: r.stdout.toString('utf8'), stderr: r.stderr.toString('utf8') };
  };
  const installFakeTermfleet = (dir: string) => {
    mkdirSync(join(dir, 'node_modules', 'termfleet'), { recursive: true });
    writeFileSync(
      join(dir, 'node_modules', 'termfleet', 'package.json'),
      JSON.stringify({ name: 'termfleet', version: '0.2.0', main: 'index.js', exports: { '.': './index.js' } }),
    );
    writeFileSync(join(dir, 'node_modules', 'termfleet', 'index.js'), 'export const x = 1;\n');
  };

  test('BLOCKER 1: a RELATIVE outDir (`compile simple-sdlc local .`) in a clean repo with termfleet installed compiles clean — no spurious "outside node_modules"', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-collision-relout-'));
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'a-clean-adopter-app', version: '1.0.0' }));
      installFakeTermfleet(dir);
      const r = compileIn(dir, ['simple-sdlc', 'local', '.']); // the exact documented command form
      expect(r.stderr).not.toContain('COLLISION');
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('installed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  test('BLOCKER 1 (gate still fires on a relative outDir): a colliding repo named "termfleet", `compile … local .`, still refuses', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-collision-relout-bad-'));
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'termfleet', version: '0.0.0-dev' }));
      installFakeTermfleet(dir);
      const r = compileIn(dir, ['simple-sdlc', 'local', '.']);
      expect(r.exitCode).toBe(1);
      expect(r.stderr).toContain('COLLISION');
      expect(r.stdout).not.toMatch(/installed \d+ files/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  // BLOCKER 2 (skeptic panel): the collision gate is LOCAL-only — a gh-actions compile never runs the local
  // termfleet runner, so gating it is pure false-alarm surface and would break this repo's own dogfood regen.
  test('BLOCKER 2a: a gh-actions compile into a repo named "termfleet" is NOT gated (github never runs the local runner)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-collision-gh-'));
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'termfleet', version: '0.0.0-dev' }));
      const r = compile(['simple-gh-sdlc', 'gh-actions', dir]); // additive profile, would-collide name, github substrate
      expect(r.stderr).not.toContain('COLLISION');
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('installed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  test('BLOCKER 2b: a LOCAL compile into a repo named "open-autonomy" is NOT flagged as self-reference (open-autonomy is never bare-imported)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-collision-oaname-'));
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'open-autonomy', version: '1.0.0' }));
      const r = compile(['simple-sdlc', 'local', dir]);
      expect(r.stderr).not.toContain('COLLISION');
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('installed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  test('BLOCKER 2 (dogfood regen shape): compile self-driving github into an "open-autonomy"-named dir does not collision-block', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-collision-dogfood-'));
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'open-autonomy', version: '0.4.1' }));
      // self-driving is a whole-repo SCAFFOLD carrying package.json/README/etc., so a fresh dir trips the
      // clobber guard — --force bypasses that (the real dogfood regen targets the repo root, where the files
      // already match). The point of THIS test is only that no COLLISION appears and it materializes.
      const r = compile(['self-driving', 'github', dir, '--force']);
      expect(r.stderr).not.toContain('COLLISION');
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('installed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});

// OA-10 (a): the clobber guard's REFUSAL SCOPE + MESSAGE must be profile-agnostic — the false comment/
// message this spec fixes claimed only a whole-repo scaffold (self-driving) could ever trip the guard,
// and told the adopter to "compile an additive profile instead" even while they were compiling one.
describe('autonomy-compile — OA-10a: collision message is scope-correct (AC-1)', () => {
  test('AC-1: an additive profile (simple-sdlc) colliding on scripts/ names the file and makes NO scaffold claim', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa10-ac1-'));
    try {
      mkdirSync(join(dir, 'scripts'), { recursive: true });
      writeFileSync(join(dir, 'scripts', 'run-agent.mjs'), "console.log('the adopter\\'s own script')\n");
      const r = compile(['simple-sdlc', 'local', dir]);
      expect(r.exitCode).toBe(1);
      expect(r.stdout).not.toMatch(/installed \d+ files/); // nothing written
      expect(r.stderr).toContain('would overwrite');
      expect(r.stderr).toContain('scripts/run-agent.mjs');
      expect(r.stderr).toContain('--force');
      // The false claim this spec fixes: simple-sdlc is NOT a scaffold, and must not be told to compile itself.
      expect(r.stderr).not.toContain('whole-repo SCAFFOLD');
      expect(r.stderr).not.toContain('compile an additive profile');
      expect(r.stderr).not.toMatch(/is a whole-repo/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a scaffold collision (self-driving, README.md) STILL gets the scaffold-specific advice', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa10-ac1-scaffold-'));
    try {
      writeFileSync(join(dir, 'README.md'), "the adopter's OWN readme\n");
      const r = compile(['self-driving', 'gh-actions', dir]);
      expect(r.exitCode).toBe(1);
      expect(r.stderr).toContain('README.md');
      expect(r.stderr).toContain('whole-repo SCAFFOLD');
      expect(r.stderr).toContain('simple-gh-sdlc');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// Harness hook files get the same structured merge on collision, never a silent clobber.
describe('autonomy-compile — mandatory harness gate merge', () => {
  test('an existing Claude settings file is merged with both gate events and is idempotent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa10-ac2-'));
    try {
      mkdirSync(join(dir, '.claude'), { recursive: true });
      writeFileSync(join(dir, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow: ['Bash(npm test)'] } }));
      const r1 = compile(['simple-sdlc', 'local', dir]);
      expect(r1.exitCode).toBe(0);
      expect(r1.stdout).toContain('merged: .claude/settings.json');
      const settings1 = JSON.parse(readFileSync(join(dir, '.claude', 'settings.json'), 'utf8'));
      expect(settings1.permissions.allow).toEqual(['Bash(npm test)']); // preserved
      expect(typeof settings1.hooks.Stop[0].hooks[0].command).toBe('string');
      expect(typeof settings1.hooks.SubagentStop[0].hooks[0].command).toBe('string');
      const stopLenAfterFirst = settings1.hooks.Stop.length;
      const subagentStopLenAfterFirst = settings1.hooks.SubagentStop.length;

      // Idempotent: re-running must not duplicate the hook entry — and (nit a) must NOT print a spurious
      // "merged" receipt line when nothing actually changed.
      const r2 = compile(['simple-sdlc', 'local', dir]);
      expect(r2.exitCode).toBe(0);
      expect(r2.stdout).not.toContain('merged: .claude/settings.json'); // no-op merge prints no receipt line
      const settings2 = JSON.parse(readFileSync(join(dir, '.claude', 'settings.json'), 'utf8'));
      expect(settings2.hooks.Stop.length).toBe(stopLenAfterFirst);
      expect(settings2.hooks.SubagentStop.length).toBe(subagentStopLenAfterFirst);
      expect(settings2.permissions.allow).toEqual(['Bash(npm test)']); // still preserved
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  test('an existing Codex hook file is merged with both gate events and preserves unrelated hooks', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-gate-codex-'));
    try {
      mkdirSync(join(dir, '.codex'), { recursive: true });
      writeFileSync(
        join(dir, '.codex', 'hooks.json'),
        JSON.stringify({ hooks: { PostToolUse: [{ hooks: [{ command: 'echo adopter-hook' }] }] } }, null, 2),
      );
      const r1 = compile(['simple-sdlc', 'local', dir]);
      expect(r1.exitCode).toBe(0);
      expect(r1.stdout).toContain('merged: .codex/hooks.json');
      const hooks = JSON.parse(readFileSync(join(dir, '.codex', 'hooks.json'), 'utf8')).hooks;
      expect(hooks.PostToolUse).toHaveLength(1);
      expect(hooks.Stop).toHaveLength(1);
      expect(hooks.SubagentStop).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  test('an unparseable existing hook file refuses by name', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa10-ac3-'));
    try {
      mkdirSync(join(dir, '.claude'), { recursive: true });
      writeFileSync(join(dir, '.claude', 'settings.json'), '{ this is not valid json');
      const r = compile(['simple-sdlc', 'local', dir]);
      expect(r.exitCode).toBe(1);
      expect(r.stdout).not.toMatch(/installed \d+ files/); // nothing written
      expect(r.stderr).toContain('.claude/settings.json');
      expect(r.stderr).toContain('not valid JSON');
      // Same generic scope fix as AC-1 — no scaffold claim for this additive profile either.
      expect(r.stderr).not.toContain('whole-repo SCAFFOLD');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// OA-10 (a)/(b): the deletion-resurrection guard + the printed receipt.
describe('autonomy-compile — OA-10a/b: deletion-resurrection guard + printed receipt (AC-4, AC-5, AC-6)', () => {
  test('AC-4: deleting a manifest-listed emitted file, then re-compiling, refuses and names it as operator-deleted; --force resurrects it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa10-ac4-'));
    try {
      const first = compile(['simple-gh-sdlc', 'local', dir]);
      expect(first.exitCode).toBe(0);
      const securityYml = join(dir, '.github', 'workflows', 'security.yml');
      expect(existsSync(securityYml)).toBe(true);
      rmSync(securityYml);

      const refused = compile(['simple-gh-sdlc', 'local', dir]);
      expect(refused.exitCode).toBe(1);
      expect(refused.stdout).not.toMatch(/installed \d+ files/); // nothing (re-)written
      expect(refused.stderr).toContain('.github/workflows/security.yml');
      expect(refused.stderr).toMatch(/deleted|delete/i);
      expect(refused.stderr).toContain('--force');
      expect(existsSync(securityYml)).toBe(false); // still not recreated

      const forced = compile(['simple-gh-sdlc', 'local', dir, '--force']);
      expect(forced.exitCode).toBe(0);
      expect(forced.stdout).toContain('resurrected');
      expect(forced.stdout).toContain('.github/workflows/security.yml');
      expect(existsSync(securityYml)).toBe(true); // recreated under --force
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  // THE critical OA-07 coordination point: an operator's `rm .open-autonomy/paused` (the intended UNPAUSE)
  // must never be flagged as a deletion to refuse on, nor resurrected — even though it is, in every other
  // respect, exactly the shape findResurrections exists to catch (an emitted path, now absent on disk).
  test("OA-07 exemption: 'rm .open-autonomy/paused' then re-compiling succeeds cleanly — never flagged, never resurrected", () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa10-oa07-exempt-'));
    try {
      const first = compile(['simple-sdlc', 'local', dir]);
      expect(first.exitCode).toBe(0);
      const pausedPath = join(dir, '.open-autonomy', 'paused');
      expect(existsSync(pausedPath)).toBe(true); // fresh install starts paused (OA-07)

      rmSync(pausedPath); // the operator's intended unpause

      const recompiled = compile(['simple-sdlc', 'local', dir]);
      expect(recompiled.exitCode).toBe(0); // NOT refused
      expect(recompiled.stdout).toContain('installed'); // a normal, successful compile
      expect(recompiled.stderr).not.toMatch(/paused/i); // never named as a deletion to reconcile
      expect(recompiled.stdout).not.toMatch(/resurrected.*paused|paused.*resurrected/i);
      expect(existsSync(pausedPath)).toBe(false); // still NOT resurrected — the unpause holds
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  test('AC-5: a successful compile prints the manifest pointer, a grouped summary, and the Stop-hook note', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa10-ac5-'));
    try {
      const r = compile(['simple-sdlc', 'local', dir]);
      expect(r.exitCode).toBe(0);
      const generatedJsonHits = (r.stdout.match(/generated\.json/g) ?? []).length;
      expect(generatedJsonHits).toBeGreaterThanOrEqual(1);
      const gateNoteHits = (r.stdout.match(/Stop \+ SubagentStop validation gates/gi) ?? []).length;
      expect(gateNoteHits).toBeGreaterThanOrEqual(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  test('AC-6: every path .open-autonomy/generated.json lists actually exists on disk after compile', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa10-ac6-'));
    try {
      const r = compile(['simple-sdlc', 'local', dir]);
      expect(r.exitCode).toBe(0);
      const manifest = JSON.parse(readFileSync(join(dir, '.open-autonomy', 'generated.json'), 'utf8')) as { files: string[] };
      expect(manifest.files.length).toBeGreaterThan(0);
      for (const f of manifest.files) expect(existsSync(join(dir, f))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// OA-09: the --provider-url flag (durable TERMFLEET_PROVIDER_URL pin) — argument validation (skeptic-panel
// MINOR a: `--provider-url --force` must not swallow `--force` as the URL) + the end-to-end pin emission.
describe('autonomy-compile — --provider-url (OA-09)', () => {
  test('--provider-url with a following FLAG (--force) is rejected, never swallowed as the value', () => {
    const r = compile(['simple-sdlc', 'local', '--provider-url', '--force']);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('--provider-url requires a <url> value');
    expect(r.stderr).not.toContain('installed'); // nothing written
  });

  test('--provider-url as the trailing token with no value is rejected', () => {
    const r = compile(['simple-sdlc', 'local', '--provider-url']);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('--provider-url requires a <url> value');
  });

  test('--provider-url with an unparseable value is rejected', () => {
    const r = compile(['simple-sdlc', 'local', 'not-a-real-out-dir-arg', '--provider-url', 'not a url']);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('is not a valid URL');
  });

  test('--provider-url with a valid url compiles and lands the durable pin in scheduler/schedule.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-provider-url-'));
    try {
      const r = compile(['simple-sdlc', 'local', dir, '--provider-url', 'http://127.0.0.1:7602']);
      expect(r.exitCode).toBe(0);
      const schedule = JSON.parse(readFileSync(join(dir, 'scheduler', 'schedule.json'), 'utf8')) as { env: Record<string, string> };
      expect(schedule.env.TERMFLEET_PROVIDER_URL).toBe('http://127.0.0.1:7602');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
