// TB.1 acceptance tests — packages/local-runner-cli/src/imm-signals.ts. Run via `bun run check:core`
// (`bun test packages/*/src/*.test.ts`), cwd = repo root — same convention as board-readiness.test.ts.
//
// House style: filesystem/git-shaped signals (A1-A6, A11) are tested against REAL temp dirs with REAL
// git/subprocess plumbing (guards.test.ts's own pattern) — no stubbing of `git`/`fs`. Signals that talk to
// `gh` (A13) or launch a heavier tool (A12's gh-preflight, A8/A10's doctor dep-integrity probe) use
// StubProc / fetchImpl injection exactly like board-readiness.test.ts / doctor.test.ts already do — no
// real network call, no real `gh` auth required to run this suite.
import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  a1GeneratedJsonValid,
  a2CompileClean,
  a3AutonomyYmlParses,
  a4PausedSeeded,
  a5PausedAbsent,
  a6HarnessCommitted,
  a8a10DoctorPass,
  a11PreflightPass,
  a12GhPreflightReady,
  a13ProvisionMatchesLiveProtection,
  a14BoardHasDispatchableWork,
  collectImmSignals,
  IMM_SIGNALS,
} from './imm-signals.ts';
import { defaultProc } from './proc.ts';
import { StubProc, fail, ok } from './test-support/stub-proc.ts';
import type { ProcRunner } from './types.ts';

function tmpRepo(prefix = 'oa-imm-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeGenerated(dir: string, files: string[], schema = 'open-autonomy.generated.v1'): void {
  mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
  writeFileSync(join(dir, '.open-autonomy', 'generated.json'), JSON.stringify({ schema, files }, null, 2));
}

function writeAutonomyYml(dir: string, opts: { codeHost?: string; agents?: Record<string, unknown>; schema?: string } = {}): void {
  mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
  const schema = opts.schema ?? 'open-autonomy.autonomy.v1';
  const codeHost = opts.codeHost ?? 'local-git';
  const agents = opts.agents ?? { pm: { skill: 'pm', triggers: { schedule: '*/15 * * * *' } } };
  const body = { schema, codeHost, agents };
  // Hand-roll tiny YAML (avoids pulling in the `yaml` writer) — every value here is a plain scalar/object,
  // so JSON-as-YAML (a valid YAML subset) round-trips fine through the `yaml` package's parser.
  writeFileSync(join(dir, '.open-autonomy', 'autonomy.yml'), JSON.stringify(body));
}

function gitInit(dir: string): void {
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@test.dev'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'test'], { cwd: dir });
}

// ============================================================================================
// A1 — generated.json valid
// ============================================================================================
describe('A1 — generated.json valid (schema + every files[] entry on disk)', () => {
  test('missing manifest -> false', async () => {
    const dir = tmpRepo();
    try {
      const s = await a1GeneratedJsonValid(dir);
      expect(s.present).toBe(false);
      expect(s.evidence).toContain('does not exist');
      expect(s.evidence).toContain('.open-autonomy/generated.json');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('invalid JSON -> false, cites parse error', async () => {
    const dir = tmpRepo();
    try {
      mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
      writeFileSync(join(dir, '.open-autonomy', 'generated.json'), '{ not json');
      const s = await a1GeneratedJsonValid(dir);
      expect(s.present).toBe(false);
      expect(s.evidence).toContain('not valid JSON');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('wrong schema tag -> false, cites the found vs expected schema', async () => {
    const dir = tmpRepo();
    try {
      writeGenerated(dir, ['a.txt'], 'some.other.schema');
      const s = await a1GeneratedJsonValid(dir);
      expect(s.present).toBe(false);
      expect(s.evidence).toContain('some.other.schema');
      expect(s.evidence).toContain('open-autonomy.generated.v1');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a files[] entry missing on disk -> false, names it', async () => {
    const dir = tmpRepo();
    try {
      writeGenerated(dir, ['.open-autonomy/generated.json', 'scheduler/run.mjs']);
      const s = await a1GeneratedJsonValid(dir);
      expect(s.present).toBe(false);
      expect(s.evidence).toContain('scheduler/run.mjs');
      expect(s.evidence).toContain('missing on disk');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('valid schema + every file present -> true, cites the count', async () => {
    const dir = tmpRepo();
    try {
      mkdirSync(join(dir, 'scheduler'), { recursive: true });
      writeFileSync(join(dir, 'scheduler', 'run.mjs'), '// stub\n');
      writeGenerated(dir, ['.open-autonomy/generated.json', 'scheduler/run.mjs']);
      const s = await a1GeneratedJsonValid(dir);
      expect(s.present).toBe(true);
      expect(s.evidence).toContain('all 2 files[] entries exist on disk');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ============================================================================================
// A2 — compile-clean (manifest-shape proxy)
// ============================================================================================
describe('A2 — compile-clean: manifest-SHAPE proxy (sorted/deduped/self-referencing), not a live re-diff', () => {
  test('missing manifest -> false', async () => {
    const dir = tmpRepo();
    try {
      const s = await a2CompileClean(dir);
      expect(s.present).toBe(false);
      expect(s.evidence).toContain('does not exist');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('unsorted files[] -> false, names the shape problem', async () => {
    const dir = tmpRepo();
    try {
      writeGenerated(dir, ['zzz.txt', '.open-autonomy/generated.json', 'aaa.txt']);
      const s = await a2CompileClean(dir);
      expect(s.present).toBe(false);
      expect(s.evidence).toContain('not lexicographically sorted');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('duplicate entries -> false, names the duplicate', async () => {
    const dir = tmpRepo();
    try {
      writeGenerated(dir, ['.open-autonomy/generated.json', 'a.txt', 'a.txt'].sort());
      const s = await a2CompileClean(dir);
      expect(s.present).toBe(false);
      expect(s.evidence).toContain('duplicate entries');
      expect(s.evidence).toContain('a.txt');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('missing self-reference to generated.json itself -> false', async () => {
    const dir = tmpRepo();
    try {
      writeGenerated(dir, ['a.txt', 'b.txt']);
      const s = await a2CompileClean(dir);
      expect(s.present).toBe(false);
      expect(s.evidence).toContain('self-reference');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a genuinely compile-shaped manifest (sorted, deduped, self-referencing) -> true', async () => {
    const dir = tmpRepo();
    try {
      writeGenerated(dir, ['.open-autonomy/generated.json', 'a.txt', 'b.txt', 'c.txt']);
      const s = await a2CompileClean(dir);
      expect(s.present).toBe(true);
      expect(s.evidence).toContain('PROXY CHECK');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ============================================================================================
// A3 — autonomy.yml parses + minimal shape (agents present)
// ============================================================================================
describe('A3 — autonomy.yml parses + agents present', () => {
  test('missing file -> false', async () => {
    const dir = tmpRepo();
    try {
      const s = await a3AutonomyYmlParses(dir);
      expect(s.present).toBe(false);
      expect(s.evidence).toContain('does not exist');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('unparsable YAML -> false', async () => {
    const dir = tmpRepo();
    try {
      mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
      writeFileSync(join(dir, '.open-autonomy', 'autonomy.yml'), '{ this: is not: valid: yaml: [');
      const s = await a3AutonomyYmlParses(dir);
      expect(s.present).toBe(false);
      expect(s.evidence).toContain('failed to parse');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('wrong schema -> false', async () => {
    const dir = tmpRepo();
    try {
      writeAutonomyYml(dir, { schema: 'not.the.right.schema' });
      const s = await a3AutonomyYmlParses(dir);
      expect(s.present).toBe(false);
      expect(s.evidence).toContain('not.the.right.schema');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('empty agents map -> false', async () => {
    const dir = tmpRepo();
    try {
      writeAutonomyYml(dir, { agents: {} });
      const s = await a3AutonomyYmlParses(dir);
      expect(s.present).toBe(false);
      expect(s.evidence).toContain('agents: {} is empty');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('valid schema + non-empty agents -> true, names the agents', async () => {
    const dir = tmpRepo();
    try {
      writeAutonomyYml(dir, { agents: { pm: {}, draft: {} } });
      const s = await a3AutonomyYmlParses(dir);
      expect(s.present).toBe(true);
      expect(s.evidence).toContain('agents=[pm, draft]');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ============================================================================================
// A4 / A5 — the paused marker, both directions
// ============================================================================================
describe('A4 paused-seeded / A5 paused-absent — expose both directions', () => {
  test('marker present: A4 true, A5 false', async () => {
    const dir = tmpRepo();
    try {
      mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
      writeFileSync(join(dir, '.open-autonomy', 'paused'), 'PAUSED reason line\nmore text\n');
      const a4 = await a4PausedSeeded(dir);
      const a5 = await a5PausedAbsent(dir);
      expect(a4.present).toBe(true);
      expect(a4.evidence).toContain('PAUSED reason line');
      expect(a5.present).toBe(false);
      expect(a5.evidence).toContain('PAUSED reason line');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('marker absent: A4 false, A5 true', async () => {
    const dir = tmpRepo();
    try {
      mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
      const a4 = await a4PausedSeeded(dir);
      const a5 = await a5PausedAbsent(dir);
      expect(a4.present).toBe(false);
      expect(a4.evidence).toContain('does not exist');
      expect(a5.present).toBe(true);
      expect(a5.evidence).toContain('unpaused');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ============================================================================================
// A6 — harness-committed (reuses guards.ts's checkUncommittedHarness against REAL git)
// ============================================================================================
describe('A6 — harness-committed (real git status/ls-files against generated.json)', () => {
  test('no manifest -> present true (nothing to check yet)', async () => {
    const dir = tmpRepo();
    try {
      gitInit(dir);
      const s = await a6HarnessCommitted(dir, { proc: defaultProc });
      expect(s.present).toBe(true);
      expect(s.evidence).toContain('no');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('manifest file present on disk but NOT committed -> false, names it', async () => {
    const dir = tmpRepo();
    try {
      gitInit(dir);
      mkdirSync(join(dir, 'scheduler'), { recursive: true });
      writeFileSync(join(dir, 'scheduler', 'run.mjs'), '// stub\n');
      writeGenerated(dir, ['scheduler/run.mjs']);
      const s = await a6HarnessCommitted(dir, { proc: defaultProc });
      expect(s.present).toBe(false);
      expect(s.evidence).toContain('git add');
      expect(s.evidence).toContain('scheduler/run.mjs');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('manifest files fully committed -> true', async () => {
    const dir = tmpRepo();
    try {
      gitInit(dir);
      mkdirSync(join(dir, 'scheduler'), { recursive: true });
      writeFileSync(join(dir, 'scheduler', 'run.mjs'), '// stub\n');
      writeGenerated(dir, ['scheduler/run.mjs']);
      execFileSync('git', ['add', '-A'], { cwd: dir });
      execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
      const s = await a6HarnessCommitted(dir, { proc: defaultProc });
      expect(s.present).toBe(true);
      expect(s.evidence).toContain('git status --porcelain');
      expect(s.evidence).toContain('0 dirty');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('D2a: AUTONOMY_ALLOW_UNCOMMITTED_HARNESS=1 with a genuinely dirty generated file -> present true (mirrors the scheduler, which WILL launch under the override) but the evidence carries the REAL dirty count and the override, never "0 dirty"', async () => {
    const dir = tmpRepo();
    try {
      gitInit(dir);
      mkdirSync(join(dir, 'scheduler'), { recursive: true });
      writeFileSync(join(dir, 'scheduler', 'run.mjs'), '// stub\n');
      writeGenerated(dir, ['scheduler/run.mjs']);
      // NOT committed — git genuinely reports 1 dirty; the override downgrades the guard to ok+warning.
      const s = await a6HarnessCommitted(dir, { proc: defaultProc, env: { ...process.env, AUTONOMY_ALLOW_UNCOMMITTED_HARNESS: '1' } });
      expect(s.present).toBe(true);
      expect(s.evidence).toContain('override AUTONOMY_ALLOW_UNCOMMITTED_HARNESS=1 active');
      expect(s.evidence).toContain('git reported 1 dirty');
      expect(s.evidence).toContain('bypassed');
      expect(s.evidence).not.toContain('0 dirty');
      expect(s.evidence).not.toContain('harness fully committed'); // the clean-status claim must be absent (the text says "NOT fully committed")
      expect(s.evidence).toContain('NOT fully committed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('D2b: a NON-git dir carrying a manifest -> present false with the vacuity NAMED ("not a git repository", guard skipped) — never fabricated git output', async () => {
    const dir = tmpRepo();
    try {
      // No gitInit — deliberately not a git repo, but a manifest with files exists.
      mkdirSync(join(dir, 'scheduler'), { recursive: true });
      writeFileSync(join(dir, 'scheduler', 'run.mjs'), '// stub\n');
      writeGenerated(dir, ['scheduler/run.mjs']);
      const s = await a6HarnessCommitted(dir, { proc: defaultProc });
      expect(s.present).toBe(false);
      expect(s.evidence).toContain('not a git repository');
      expect(s.evidence).toContain('vacuous');
      expect(s.evidence).not.toContain('0 dirty');
      expect(s.evidence).not.toContain('git status --porcelain');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('D2b corollary: a NON-git dir with NO manifest -> vacuous ok stays true, but the evidence SAYS vacuous + names the non-repo (never fabricated git output)', async () => {
    const dir = tmpRepo();
    try {
      const s = await a6HarnessCommitted(dir, { proc: defaultProc });
      expect(s.present).toBe(true);
      expect(s.evidence).toContain('not a git repository');
      expect(s.evidence).toContain('vacuous');
      expect(s.evidence).not.toContain('0 dirty');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ============================================================================================
// A8 / A10 — doctor-pass (in-process wrap of this package's own `oa doctor`)
// ============================================================================================
describe('A8/A10 — doctor-pass wraps oa doctor --json --live', () => {
  function writeSchedule(dir: string, schedule: object): void {
    mkdirSync(join(dir, 'scheduler'), { recursive: true });
    writeFileSync(join(dir, 'scheduler', 'schedule.json'), JSON.stringify(schedule));
  }

  test('a script-only schedule needs no runner/provider -> true', async () => {
    const dir = tmpRepo();
    try {
      writeSchedule(dir, { intervalSeconds: 900, scripts: ['bun scripts/sweep.ts'] });
      const s = await a8a10DoctorPass(dir, { proc: defaultProc, live: false });
      expect(s.present).toBe(true);
      expect(s.evidence).toContain('all checks passed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('needs the runner but termfleet is not installed -> false, names the missing dep', async () => {
    const dir = tmpRepo();
    try {
      writeSchedule(dir, { intervalSeconds: 900, scripts: ['AUTONOMY_AGENT=pm AUTONOMY_SINGLETON=1 node scripts/run-agent.mjs'] });
      const s = await a8a10DoctorPass(dir, { proc: defaultProc, live: false });
      expect(s.present).toBe(false);
      expect(s.evidence).toContain('termfleet not installed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('live:true against a schedule needing the runner, with an unreachable provider -> false, names the provider gap (honest FAIL, never faked)', async () => {
    const dir = tmpRepo();
    try {
      writeSchedule(dir, {
        intervalSeconds: 900,
        env: { TERMFLEET_PROVIDER_URL: 'http://127.0.0.1:1/does-not-exist' },
        scripts: ['AUTONOMY_AGENT=pm AUTONOMY_SINGLETON=1 node scripts/run-agent.mjs'],
      });
      const fetchImpl = (async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:1');
      }) as unknown as typeof fetch;
      const s = await a8a10DoctorPass(dir, { proc: defaultProc, live: true, fetchImpl, env: {} });
      expect(s.present).toBe(false);
      expect(s.evidence).toContain('provider-health');
      expect(s.evidence).toContain('unreachable');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a proc that throws mid-probe degrades to doctor-unavailable, never a faked pass', async () => {
    const dir = tmpRepo();
    try {
      writeSchedule(dir, { intervalSeconds: 900, scripts: ['AUTONOMY_AGENT=pm AUTONOMY_SINGLETON=1 node scripts/run-agent.mjs'] });
      mkdirSync(join(dir, 'node_modules', 'termfleet'), { recursive: true });
      writeFileSync(join(dir, 'node_modules', 'termfleet', 'package.json'), JSON.stringify({ name: 'termfleet', version: '0.0.0-test' }));
      const throwingProc: ProcRunner = () => {
        throw new Error('simulated environment failure (e.g. node not on PATH)');
      };
      const s = await a8a10DoctorPass(dir, { proc: throwingProc, live: false });
      expect(s.present).toBe(false);
      expect(s.evidence).toContain('doctor-unavailable');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ============================================================================================
// A11 — local preflight pass (bin/preflight.ts, subprocess)
// ============================================================================================
describe('A11 — local preflight pass (bin/preflight.ts run as a subprocess against installDir)', () => {
  function writeFakePreflight(dir: string, exitCode: number, message: string): string {
    const p = join(dir, 'fake-preflight.ts');
    writeFileSync(p, `console.log(${JSON.stringify(message)});\nprocess.exit(${exitCode});\n`);
    return p;
  }

  test('missing preflightBin -> doctor-unavailable, never a faked pass', async () => {
    const dir = tmpRepo();
    try {
      const s = await a11PreflightPass(dir, { preflightBin: join(dir, 'does-not-exist.ts') });
      expect(s.present).toBe(false);
      expect(s.evidence).toContain('doctor-unavailable');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a preflight script that exits 0 -> true, cites the exit code + last line', async () => {
    const dir = tmpRepo();
    try {
      const bin = writeFakePreflight(dir, 0, 'preflight: OK — environment is install-ready');
      const s = await a11PreflightPass(dir, { preflightBin: bin, proc: defaultProc });
      expect(s.present).toBe(true);
      expect(s.evidence).toContain('exited 0');
      expect(s.evidence).toContain('install-ready');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a preflight script that exits 1 -> false, cites the exit code + last line', async () => {
    const dir = tmpRepo();
    try {
      const bin = writeFakePreflight(dir, 1, 'preflight: FAILED — fix the item(s) above');
      const s = await a11PreflightPass(dir, { preflightBin: bin, proc: defaultProc });
      expect(s.present).toBe(false);
      expect(s.evidence).toContain('exited 1');
      expect(s.evidence).toContain('FAILED');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('the DEFAULT preflightBin resolves to the real (root) bin/preflight.ts inside this source checkout', async () => {
    const dir = tmpRepo();
    try {
      // No node_modules/package.json in this bare tmp dir -> most checks self-skip ("no package.json"),
      // and the real preflight still runs to completion and reports a real exit code — proving the
      // default path resolution works, without asserting a specific pass/fail (environment-dependent:
      // whether the box's `claude` CLI is signed in).
      const s = await a11PreflightPass(dir, { proc: defaultProc, env: { ...process.env, TERMFLEET_PROVIDER_URL: '' } });
      expect(typeof s.present).toBe('boolean');
      expect(s.evidence).toContain('bin/preflight.ts');
      expect(s.evidence).not.toContain('doctor-unavailable');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ============================================================================================
// A12 — gh-preflight ready (scripts/open-autonomy-preflight.ts, subprocess; github-substrate only)
// ============================================================================================
describe('A12 — gh-preflight ready — only meaningful for github-substrate installs', () => {
  test('a local-git substrate install -> not-applicable (never a guessed pass/fail)', async () => {
    const dir = tmpRepo();
    try {
      writeAutonomyYml(dir, { codeHost: 'local-git' });
      const s = await a12GhPreflightReady(dir);
      expect(s.present).toBe(false);
      expect(s.evidence).toContain('not-applicable');
      expect(s.evidence).toContain('local-git');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('no autonomy.yml at all -> not-applicable (codeHost unreadable, never guessed github)', async () => {
    const dir = tmpRepo();
    try {
      const s = await a12GhPreflightReady(dir);
      expect(s.present).toBe(false);
      expect(s.evidence).toContain('not-applicable');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('github substrate but missing structural files -> false (ready:false), missing[] cited', async () => {
    const dir = tmpRepo();
    try {
      writeAutonomyYml(dir, { codeHost: 'github', agents: { pm: {} } });
      const s = await a12GhPreflightReady(dir, { proc: defaultProc });
      expect(s.present).toBe(false);
      expect(s.evidence).toContain('report.ready=false');
      expect(s.evidence).toContain('missing:');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('github substrate, a fully structurally-complete install -> true (ready:true)', async () => {
    // Real compile (self-driving/github), then satisfy the one remaining gap the real script itself
    // reports (a declared vision role whose file must exist with real, non-template content) — the exact
    // recipe verified live against scripts/open-autonomy-preflight.ts.
    const dir = tmpRepo();
    try {
      execFileSync('bun', [join(process.cwd(), 'bin', 'autonomy-compile.ts'), 'profiles/self-driving', 'github', dir], {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: 'development' },
      });
      mkdirSync(join(dir, 'docs'), { recursive: true });
      writeFileSync(join(dir, 'docs', 'VISION.md'), '# Vision\nReal content, no markers.\n');
      const s = await a12GhPreflightReady(dir, { proc: defaultProc });
      expect(s.present).toBe(true);
      expect(s.evidence).toContain('report.ready=true');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('missing ghPreflightScript override -> doctor-unavailable', async () => {
    const dir = tmpRepo();
    try {
      writeAutonomyYml(dir, { codeHost: 'github' });
      const s = await a12GhPreflightReady(dir, { ghPreflightScript: join(dir, 'nope.ts') });
      expect(s.present).toBe(false);
      expect(s.evidence).toContain('doctor-unavailable');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ============================================================================================
// A13 — provision.json's required_checks vs LIVE branch protection (HARD signal semantics)
// ============================================================================================
describe('A13 — provision == live-protection (HARD signal: unauthenticated/no-admin -> unverifiable, never true)', () => {
  function provisionProfileDir(dir: string, branchProtection?: { branch: string; required_checks: string[] }): string {
    mkdirSync(dir, { recursive: true });
    if (branchProtection) {
      writeFileSync(join(dir, 'provision.json'), JSON.stringify({ private: true, required_secrets: [], variables: [], labels: [], branch_protection: branchProtection }));
    }
    return dir;
  }

  test('no ctx.profileDir -> unverifiable', async () => {
    const s = await a13ProvisionMatchesLiveProtection('/any/install');
    expect(s.present).toBe(false);
    expect(s.evidence).toContain('unverifiable');
  });

  test('profile ships no provision.json -> not-applicable', async () => {
    const profileDir = tmpRepo('oa-imm-profile-');
    try {
      const s = await a13ProvisionMatchesLiveProtection('/any/install', { profileDir });
      expect(s.present).toBe(false);
      expect(s.evidence).toContain('not-applicable');
    } finally {
      rmSync(profileDir, { recursive: true, force: true });
    }
  });

  test('provision.json declares no branch_protection -> not-applicable', async () => {
    const profileDir = tmpRepo('oa-imm-profile-');
    try {
      writeFileSync(join(profileDir, 'provision.json'), JSON.stringify({ private: true, required_secrets: [], variables: [], labels: [] }));
      const s = await a13ProvisionMatchesLiveProtection('/any/install', { profileDir });
      expect(s.present).toBe(false);
      expect(s.evidence).toContain('not-applicable');
    } finally {
      rmSync(profileDir, { recursive: true, force: true });
    }
  });

  test('gh not authenticated (repo view fails) -> unverifiable, never true', async () => {
    const profileDir = tmpRepo('oa-imm-profile-');
    try {
      provisionProfileDir(profileDir, { branch: 'main', required_checks: ['ci'] });
      const stub = new StubProc().onArgs('gh', ['repo', 'view'], () => fail('gh: To use GitHub CLI in a GitHub Actions workflow, set the GH_TOKEN environment variable (not logged in)', 4));
      const s = await a13ProvisionMatchesLiveProtection('/any/install', { profileDir, proc: stub.runner });
      expect(s.present).toBe(false);
      expect(s.evidence).toContain('unverifiable');
    } finally {
      rmSync(profileDir, { recursive: true, force: true });
    }
  });

  test('admin pre-probe fails 401 (not authenticated) -> unverifiable, never true', async () => {
    const profileDir = tmpRepo('oa-imm-profile-');
    try {
      provisionProfileDir(profileDir, { branch: 'main', required_checks: ['ci'] });
      const stub = new StubProc()
        .onArgs('gh', ['repo', 'view'], () => ok('acme/widgets\n'))
        .onArgs('gh', ['api', 'repos/acme/widgets', '--jq'], () => fail('gh: HTTP 401: Bad credentials (authentication)', 1));
      const s = await a13ProvisionMatchesLiveProtection('/any/install', { profileDir, proc: stub.runner });
      expect(s.present).toBe(false);
      expect(s.evidence).toContain('unverifiable');
      expect(s.evidence).toContain('not authenticated');
    } finally {
      rmSync(profileDir, { recursive: true, force: true });
    }
  });

  test('D1 (the REAL GitHub model, verified live): a NON-ADMIN token gets 404 from the protection endpoint even on a PROTECTED branch — admin=false must short-circuit to unverifiable WITHOUT touching the protection endpoint, never a confident "NOT applied"', async () => {
    const profileDir = tmpRepo('oa-imm-profile-');
    try {
      provisionProfileDir(profileDir, { branch: 'main', required_checks: ['ci'] });
      const stub = new StubProc()
        .onArgs('gh', ['repo', 'view'], () => ok('acme/widgets\n'))
        .onArgs('gh', ['api', 'repos/acme/widgets', '--jq'], () => ok('false\n'))
        // Registered deliberately: if the implementation regressed to probing the protection endpoint with
        // a non-admin token, real GitHub answers 404 (verified live on a repo that IS protected) — and the
        // old code would emit the false "protection NOT applied" verdict, failing the asserts below.
        .onArgs('gh', ['api', 'repos/acme/widgets/branches/main/protection'], () => fail('gh: Not Found (HTTP 404)', 1));
      const s = await a13ProvisionMatchesLiveProtection('/any/install', { profileDir, proc: stub.runner });
      expect(s.present).toBe(false);
      expect(s.evidence).toContain('unverifiable');
      expect(s.evidence).toContain('lacks repo admin');
      expect(s.evidence).not.toContain('NOT applied');
      // The protection endpoint must never have been queried — its 404 is meaningless for this token.
      expect(stub.calls.some((c) => c.cmd === 'gh' && (c.args[1] ?? '').includes('/protection'))).toBe(false);
    } finally {
      rmSync(profileDir, { recursive: true, force: true });
    }
  });

  test('admin pre-probe unreadable (network error) -> unverifiable, never a negative', async () => {
    const profileDir = tmpRepo('oa-imm-profile-');
    try {
      provisionProfileDir(profileDir, { branch: 'main', required_checks: ['ci'] });
      const stub = new StubProc()
        .onArgs('gh', ['repo', 'view'], () => ok('acme/widgets\n'))
        .onArgs('gh', ['api', 'repos/acme/widgets', '--jq'], () => fail('gh: error connecting to api.github.com', 1));
      const s = await a13ProvisionMatchesLiveProtection('/any/install', { profileDir, proc: stub.runner });
      expect(s.present).toBe(false);
      expect(s.evidence).toContain('unverifiable');
      expect(s.evidence).toContain('permissions');
    } finally {
      rmSync(profileDir, { recursive: true, force: true });
    }
  });

  test('admin=true + protection endpoint 404 -> the GENUINE negative "protection NOT applied", citing the admin confirmation', async () => {
    const profileDir = tmpRepo('oa-imm-profile-');
    try {
      provisionProfileDir(profileDir, { branch: 'main', required_checks: ['ci'] });
      const stub = new StubProc()
        .onArgs('gh', ['repo', 'view'], () => ok('acme/widgets\n'))
        .onArgs('gh', ['api', 'repos/acme/widgets', '--jq'], () => ok('true\n'))
        .onArgs('gh', ['api', 'repos/acme/widgets/branches/main/protection'], () => fail('gh: Branch not protected (HTTP 404: Not Found)', 1));
      const s = await a13ProvisionMatchesLiveProtection('/any/install', { profileDir, proc: stub.runner });
      expect(s.present).toBe(false);
      expect(s.evidence).toContain('protection NOT applied');
      expect(s.evidence).toContain('admin-confirmed');
      expect(s.evidence).not.toContain('unverifiable');
    } finally {
      rmSync(profileDir, { recursive: true, force: true });
    }
  });

  test('live protection MISSING a required check -> false, names the gap (mirrors DESIGN hardening #4: provisioning silently continuing must not read as protected)', async () => {
    const profileDir = tmpRepo('oa-imm-profile-');
    try {
      provisionProfileDir(profileDir, { branch: 'main', required_checks: ['ci', 'agent-review', 'security'] });
      const stub = new StubProc()
        .onArgs('gh', ['repo', 'view'], () => ok('acme/widgets\n'))
        .onArgs('gh', ['api', 'repos/acme/widgets', '--jq'], () => ok('true\n'))
        .onArgs('gh', ['api', 'repos/acme/widgets/branches/main/protection'], () =>
          ok(JSON.stringify({ required_status_checks: { contexts: ['ci', 'agent-review'] } })),
        );
      const s = await a13ProvisionMatchesLiveProtection('/any/install', { profileDir, proc: stub.runner });
      expect(s.present).toBe(false);
      expect(s.evidence).toContain('security');
    } finally {
      rmSync(profileDir, { recursive: true, force: true });
    }
  });

  test('live protection contexts exactly match provision.json -> true', async () => {
    const profileDir = tmpRepo('oa-imm-profile-');
    try {
      provisionProfileDir(profileDir, { branch: 'main', required_checks: ['ci'] });
      const stub = new StubProc()
        .onArgs('gh', ['repo', 'view'], () => ok('acme/widgets\n'))
        .onArgs('gh', ['api', 'repos/acme/widgets', '--jq'], () => ok('true\n'))
        .onArgs('gh', ['api', 'repos/acme/widgets/branches/main/protection'], () => ok(JSON.stringify({ required_status_checks: { contexts: ['ci'] } })));
      const s = await a13ProvisionMatchesLiveProtection('/any/install', { profileDir, proc: stub.runner });
      expect(s.present).toBe(true);
      expect(s.evidence).toContain('exactly matches');
    } finally {
      rmSync(profileDir, { recursive: true, force: true });
    }
  });

  test('ctx.repo skips the gh repo view autodetect probe', async () => {
    const profileDir = tmpRepo('oa-imm-profile-');
    try {
      provisionProfileDir(profileDir, { branch: 'main', required_checks: ['ci'] });
      const stub = new StubProc()
        .onArgs('gh', ['api', 'repos/acme/pinned', '--jq'], () => ok('true\n'))
        .onArgs('gh', ['api', 'repos/acme/pinned/branches/main/protection'], () =>
          ok(JSON.stringify({ required_status_checks: { contexts: ['ci'] } })),
        );
      const s = await a13ProvisionMatchesLiveProtection('/any/install', { profileDir, proc: stub.runner, repo: 'acme/pinned' });
      expect(s.present).toBe(true);
      expect(stub.calls.some((c) => c.cmd === 'gh' && c.args[0] === 'repo')).toBe(false);
    } finally {
      rmSync(profileDir, { recursive: true, force: true });
    }
  });
});

// ============================================================================================
// A14 — board-has-dispatchable-work (wraps TA.2's hasDispatchableWork)
// ============================================================================================
describe('A14 — board-has-dispatchable-work wraps hasDispatchableWork', () => {
  test('empty board -> false (via the manager -> ztrack identity default, no profileDir)', async () => {
    const stub = new StubProc().onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'ready'], () => ok('[]'));
    const s = await a14BoardHasDispatchableWork('/fake/repo', { proc: stub.runner, actor: 'manager' });
    expect(s.present).toBe(false);
    expect(s.evidence).toContain('board empty');
  });

  test('one ready, fresh item -> true', async () => {
    const stub = new StubProc()
      .onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'ready'], () => ok(JSON.stringify([{ identifier: 'X-1', labels: [] }])))
      .onArgs('git', ['rev-parse', '--verify', '--quiet', 'agent/issue-X-1'], () => fail('unknown revision', 1));
    const s = await a14BoardHasDispatchableWork('/fake/repo', { actor: 'manager', proc: stub.runner });
    expect(s.present).toBe(true);
    expect(s.evidence).toContain('1/1 actionable/ready');
  });

  test('no profileDir and no actor -> uses the substrate-independent ztrack task-service default', async () => {
    const s = await a14BoardHasDispatchableWork('/fake/repo', {});
    expect(s.present).toBe(false);
    expect(s.evidence).toContain('source=task-service-default');
  });
});

// ============================================================================================
// collectImmSignals / IMM_SIGNALS — the library surface
// ============================================================================================
describe('IMM_SIGNALS / collectImmSignals — the library surface', () => {
  test('IMM_SIGNALS carries exactly the TB.1-scoped ids, A8 and A10 aliasing the same doctor-pass check', () => {
    expect(Object.keys(IMM_SIGNALS).sort()).toEqual(['A1', 'A10', 'A11', 'A12', 'A13', 'A14', 'A2', 'A3', 'A4', 'A5', 'A6', 'A8'].sort());
    expect(IMM_SIGNALS.A8).toBe(IMM_SIGNALS.A10);
  });

  test('collectImmSignals runs every signal and returns a full Record<id, Signal>', async () => {
    const dir = tmpRepo();
    try {
      const signals = await collectImmSignals(dir, { proc: defaultProc, live: false });
      expect(Object.keys(signals).sort()).toEqual(Object.keys(IMM_SIGNALS).sort());
      for (const [id, sig] of Object.entries(signals)) {
        expect(typeof sig.present).toBe('boolean');
        expect(sig.evidence.length).toBeGreaterThan(0);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
