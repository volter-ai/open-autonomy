// OA-09: a compiled TERMFLEET_PROVIDER_URL pin (bin/autonomy-compile.ts's --provider-url) must (a) land
// durably in scheduler/schedule.json's env, and (b) be VISIBLE — the loop driver logs the effective
// provider URL + its origin (env|schedule|current-context|auto-local) on the first tick, so a
// misattachment shows up in the very first line of output instead of never
// (docs/adoption-fixes/OA-09-termfleet-coexistence-provider-pinning.md). Exercised against the REAL
// emitted `scheduler/run.mjs` (matches the house pattern: scheduler-termfleet-guard.test.ts /
// pause-gate.test.ts) — a revert of either the schedule.json env or the LOOP_DRIVER's log statement goes
// red here, not just in a unit test of compileLocal in isolation.
import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileLocal } from './emit';
import type { AutonomyIR } from '@open-autonomy/core';

const skillAgentIr: AutonomyIR = {
  schema: 'autonomy.ir.v1',
  targets: ['local'],
  agents: { pm: { behavior: 'pm', capabilities: ['tasks:converse'], triggers: [{ cron: '*/15 * * * *' }] } },
  policy: { box: {} },
  resources: [],
};

// A minimal but VALID node_modules/termfleet + node_modules/@termfleet/core — resolvable (so the emitted
// collision-check probe in scheduler/run.mjs passes) but otherwise inert. `ztrack` is deliberately absent
// (RUNNER_SPECS's probe skips a spec whose package isn't installed at all — see emit.ts's LOOP_DRIVER).
function installMinimalTermfleet(dir: string): void {
  mkdirSync(join(dir, 'node_modules', 'termfleet'), { recursive: true });
  writeFileSync(
    join(dir, 'node_modules', 'termfleet', 'package.json'),
    JSON.stringify({ name: 'termfleet', version: '0.2.0', main: 'index.js', exports: { '.': './index.js' } }),
  );
  writeFileSync(join(dir, 'node_modules', 'termfleet', 'index.js'), 'export const x = 1;\n');
  mkdirSync(join(dir, 'node_modules', '@termfleet', 'core'), { recursive: true });
  writeFileSync(
    join(dir, 'node_modules', '@termfleet', 'core', 'package.json'),
    JSON.stringify({ name: '@termfleet/core', version: '0.2.1', exports: { './local-providers.js': './local-providers.js' } }),
  );
  // A minimal but FUNCTIONAL stand-in for the real @termfleet/core's resolveDefaultProvider — resolvable
  // (satisfies the collision-check probe every needsRunner tick runs) and, for the no-pin test below,
  // genuinely exercised: mirrors the real chain's `if (url) return {baseUrl:url, source:'flag:--url'}`
  // fast path and its `no_provider` throw when nothing is live (real shape: @termfleet/core@0.2.1
  // dist/local-providers.js — verified against the real published package during development, not vendored
  // here to keep this fixture offline/fast).
  writeFileSync(
    join(dir, 'node_modules', '@termfleet', 'core', 'local-providers.js'),
    `export async function resolveDefaultProvider(opts) {\n` +
      `  const url = opts && opts.url ? String(opts.url).trim() : '';\n` +
      `  if (url) return { baseUrl: url, source: 'flag:--url' };\n` +
      `  throw new Error('No provider specified and no live local provider was found.');\n` +
      `}\n`,
  );
}

// scaffold(): compile + materialize scheduler/run.mjs + schedule.json (never the full runtime — these
// tests only need to reach the LOOP_DRIVER's own effective-provider log statement, which fires BEFORE
// fireTick spawns anything real). With `stubAgent: true`, ALSO writes a stub scripts/run-agent.mjs that
// prints the effective TERMFLEET_PROVIDER_URL its process actually received — this is how the
// precedence-of-reality tests observe what fireTick passes to a CHILD (never a real termfleet/claude
// launch; the incident rule). The schedule's command is `… node scripts/run-agent.mjs`, so fireTick runs
// exactly this stub with the merged tick env.
function scaffold(providerUrl?: string, opts: { stubAgent?: boolean } = {}): string {
  const out = compileLocal(skillAgentIr, { providerUrl });
  const dir = mkdtempSync(join(tmpdir(), 'oa-provider-pin-'));
  mkdirSync(join(dir, 'scheduler'), { recursive: true });
  writeFileSync(join(dir, 'scheduler', 'run.mjs'), out.generated['scheduler/run.mjs']!);
  writeFileSync(join(dir, 'scheduler', 'schedule.json'), out.generated['scheduler/schedule.json']!);
  installMinimalTermfleet(dir);
  if (opts.stubAgent) {
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    // Prints to STDOUT (fireTick inherits stdio, so it reaches the parent's stdout) the exact
    // TERMFLEET_PROVIDER_URL the child inherited — the ground truth of what the tick's merge produced.
    writeFileSync(
      join(dir, 'scripts', 'run-agent.mjs'),
      `console.log('CHILD_PIN=' + (process.env.TERMFLEET_PROVIDER_URL ?? '<unset>'));\n`,
    );
  }
  return dir;
}

describe('compileLocal --provider-url — the durable schedule.json pin (AC-3)', () => {
  test('with a providerUrl, schedule.json.env carries TERMFLEET_PROVIDER_URL', () => {
    const out = compileLocal(skillAgentIr, { providerUrl: 'http://127.0.0.1:7602' });
    const schedule = JSON.parse(out.generated['scheduler/schedule.json']!) as { env: Record<string, string> };
    expect(schedule.env).toEqual({ TERMFLEET_PROVIDER_URL: 'http://127.0.0.1:7602' });
  });

  test('without a providerUrl (the default), schedule.json.env stays empty — unpinned installs are unaffected', () => {
    const out = compileLocal(skillAgentIr);
    const schedule = JSON.parse(out.generated['scheduler/schedule.json']!) as { env: Record<string, string> };
    expect(schedule.env).toEqual({});
  });
});

describe('scheduler/run.mjs --once — the effective-provider log line (AC-4)', () => {
  test('a compiled pin (schedule.json.env.TERMFLEET_PROVIDER_URL, no ambient override) logs "(schedule)"', () => {
    const dir = scaffold('http://127.0.0.1:7602');
    try {
      const r = spawnSync('node', ['scheduler/run.mjs', '--once'], { cwd: dir, encoding: 'utf8' });
      const line = r.stderr.split('\n').find((l) => l.includes('provider http://127.0.0.1:7602'));
      expect(line).toBeDefined();
      expect(line).toMatch(/provider .*http:\/\/127\.0\.0\.1:7602.*\(schedule\)/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('an ambient TERMFLEET_PROVIDER_URL overrides the compiled pin AND its logged origin — "(env)", not "(schedule)" (the documented override doctrine, made visible)', () => {
    const dir = scaffold('http://127.0.0.1:7602'); // compiled pin
    try {
      const r = spawnSync('node', ['scheduler/run.mjs', '--once'], {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, TERMFLEET_PROVIDER_URL: 'http://127.0.0.1:9999' }, // ambient override
      });
      const line = r.stderr.split('\n').find((l) => l.includes('provider http://127.0.0.1:9999'));
      expect(line).toBeDefined();
      expect(line).toMatch(/provider .*http:\/\/127\.0\.0\.1:9999.*\(env\)/);
      expect(r.stderr).not.toContain('7602'); // the compiled pin is fully shadowed, never mentioned
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('no pin at all + a live local provider auto-discovered ⇒ logs "(auto-local)" — AC-4\'s second clause', () => {
    // A fixture where the (stubbed) resolveDefaultProvider succeeds via auto-discovery, mirroring the real
    // chain's `{baseUrl, source:'auto-local'}` shape for exactly one live local provider — deterministic and
    // offline (never a real termfleet/claude launch; see the "no pin, no live provider" test below for why
    // that matters on this suite's own dev box).
    const dir = scaffold(undefined);
    try {
      writeFileSync(
        join(dir, 'node_modules', '@termfleet', 'core', 'local-providers.js'),
        `export async function resolveDefaultProvider(opts) {\n` +
          `  const url = opts && opts.url ? String(opts.url).trim() : '';\n` +
          `  if (url) return { baseUrl: url, source: 'flag:--url' };\n` +
          `  return { baseUrl: 'http://127.0.0.1:17999', source: 'auto-local', label: 'virtual-tmux' };\n` +
          `}\n`,
      );
      const r = spawnSync('node', ['scheduler/run.mjs', '--once'], {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, TERMFLEET_PROVIDER_URL: '' },
      });
      const line = r.stderr.split('\n').find((l) => l.includes('provider http://127.0.0.1:17999'));
      expect(line).toBeDefined();
      expect(line).toMatch(/provider .*http:\/\/127\.0\.0\.1:17999.*\(auto-local\)/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('no pin at all (neither ambient nor compiled) and no live local provider ⇒ a plain "none resolved yet" note, never a crash or a false provider line', () => {
    const dir = scaffold(undefined);
    try {
      // TERMFLEET_HOME isolates this from whatever REAL termfleet state this box happens to have (this
      // suite's own dev box legitimately runs termfleet as fleet infra — see bin/preflight.test.ts's OA-04
      // block for the same isolation concern) — an empty scratch dir has no current.json / advertised
      // providers, so resolveDefaultProvider's auto-discovery genuinely finds nothing.
      const scratchHome = mkdtempSync(join(tmpdir(), 'oa-termfleet-home-'));
      try {
        const r = spawnSync('node', ['scheduler/run.mjs', '--once'], {
          cwd: dir,
          encoding: 'utf8',
          env: { ...process.env, TERMFLEET_PROVIDER_URL: '', TERMFLEET_HOME: scratchHome },
        });
        expect(r.stderr).toContain('provider: none resolved yet');
        expect(r.stderr).not.toMatch(/provider http/);
      } finally {
        rmSync(scratchHome, { recursive: true, force: true });
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// The BACKEND's own source attribution (skeptic-panel test gap: hardcoding 'auto-local' stayed green). A
// NESTED launch resolves the provider independently of the loop driver, so the emitted backend
// (scripts/autonomy-runner.mjs) logs its OWN `[runner] provider … (source)` line on first resolve. Drive it
// with a STUB termfleet SDK (never a real socket/agent — the incident rule): `list` resolves the provider,
// logs, then returns [] over the stub client. Asserts the source is REAL (env-hint honored when pinned; the
// SDK's own source verbatim when unpinned) — so hardcoding it goes red.
describe('scripts/autonomy-runner.mjs (backend) — the [runner] provider source line', () => {
  function scaffoldBackend(): string {
    const out = compileLocal(skillAgentIr);
    const dir = mkdtempSync(join(tmpdir(), 'oa-backend-src-'));
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    writeFileSync(join(dir, 'scripts', 'autonomy-runner.mjs'), out.generated['scripts/autonomy-runner.mjs']!);
    writeFileSync(join(dir, 'scripts', 'runner-defaults.mjs'), out.generated['scripts/runner-defaults.mjs']!);
    // Stub `termfleet`: just enough for backend.list() to resolve + return [] — no socket, no agent.
    mkdirSync(join(dir, 'node_modules', 'termfleet'), { recursive: true });
    writeFileSync(
      join(dir, 'node_modules', 'termfleet', 'package.json'),
      JSON.stringify({ name: 'termfleet', version: '0.2.0', type: 'module', main: 'index.js', exports: { '.': './index.js' } }),
    );
    writeFileSync(
      join(dir, 'node_modules', 'termfleet', 'index.js'),
      `export function providerRefFromUrl(url) { return { url }; }\n` +
        `export class ProviderClient {\n` +
        `  constructor(ref) { this.ref = ref; }\n` +
        `  async lifecycle() { return { sessions: [] }; }\n` +
        `  async snapshot() { return { windows: [] }; }\n` +
        `  disconnect() {}\n` +
        `}\n`,
    );
    // Stub `@termfleet/core/local-providers.js`: mirrors the real resolution chain's shape — an explicit url
    // returns {source:'flag:--url'}; unpinned returns a fixed live provider tagged {source:'auto-local'}.
    mkdirSync(join(dir, 'node_modules', '@termfleet', 'core'), { recursive: true });
    writeFileSync(
      join(dir, 'node_modules', '@termfleet', 'core', 'package.json'),
      JSON.stringify({ name: '@termfleet/core', version: '0.2.1', type: 'module', exports: { './local-providers.js': './local-providers.js' } }),
    );
    writeFileSync(
      join(dir, 'node_modules', '@termfleet', 'core', 'local-providers.js'),
      `export async function resolveDefaultProvider(opts) {\n` +
        `  const url = opts && opts.url ? String(opts.url).trim() : '';\n` +
        `  if (url) return { baseUrl: url, source: 'flag:--url' };\n` +
        `  return { baseUrl: 'http://127.0.0.1:17999', source: 'auto-local' };\n` +
        `}\n`,
    );
    return dir;
  }

  test('pinned (with the loop driver\'s AUTONOMY_PROVIDER_URL_SOURCE=schedule hint) ⇒ logs "(schedule)", and stdout stays parseable JSON (log went to stderr)', () => {
    const dir = scaffoldBackend();
    try {
      const r = spawnSync('node', ['scripts/autonomy-runner.mjs', 'list'], {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, TERMFLEET_PROVIDER_URL: 'http://127.0.0.1:7602', AUTONOMY_PROVIDER_URL_SOURCE: 'schedule' },
      });
      expect(r.stderr).toMatch(/\[runner\] provider http:\/\/127\.0\.0\.1:7602 \(schedule\)/);
      expect(JSON.parse(r.stdout)).toEqual([]); // stdout is ONLY the JSON — the [runner] line is on stderr
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('unpinned ⇒ logs the SDK\'s OWN source verbatim ("auto-local"), never a hardcoded/pin label', () => {
    const dir = scaffoldBackend();
    try {
      const env = { ...process.env };
      delete env.TERMFLEET_PROVIDER_URL;
      delete env.AUTONOMY_PROVIDER_URL_SOURCE;
      const r = spawnSync('node', ['scripts/autonomy-runner.mjs', 'list'], { cwd: dir, encoding: 'utf8', env });
      expect(r.stderr).toMatch(/\[runner\] provider http:\/\/127\.0\.0\.1:17999 \(auto-local\)/);
      expect(r.stderr).not.toContain('(schedule)');
      expect(r.stderr).not.toContain('(env)');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// The precedence-of-REALITY tests (skeptic-panel Blocker 2 + test gap). The AC-4 tests above only assert the
// [loop] provider LOG's independent re-implementation of precedence — inverting fireTick's actual merge to
// `Object.assign({}, process.env, schedule.env)` (schedule wins) left every substrate-local test green. These
// spawn the emitted run.mjs with a STUB run-agent.mjs (never a real launch — the incident rule) that prints
// the TERMFLEET_PROVIDER_URL the CHILD actually inherited, so they pin the real env the tick passes down.
describe('scheduler/run.mjs --once — the env the tick actually passes to a launched child (Blocker 2 / test gap)', () => {
  const childPin = (stdout: string): string | undefined => {
    const line = stdout.split('\n').find((l) => l.startsWith('CHILD_PIN='));
    return line?.slice('CHILD_PIN='.length);
  };

  test('compiled pin, no ambient ⇒ the CHILD inherits the schedule pin (7602)', () => {
    const dir = scaffold('http://127.0.0.1:7602', { stubAgent: true });
    try {
      // Delete any ambient TERMFLEET_PROVIDER_URL so this box's own fleet env can't leak in.
      const env = { ...process.env };
      delete env.TERMFLEET_PROVIDER_URL;
      const r = spawnSync('node', ['scheduler/run.mjs', '--once'], { cwd: dir, encoding: 'utf8', env });
      expect(childPin(r.stdout)).toBe('http://127.0.0.1:7602');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('compiled pin + a REAL ambient override ⇒ the CHILD inherits the AMBIENT value (9999), never the pin — the documented precedence, now asserted on the REAL merged env (inverting fireTick goes red here)', () => {
    const dir = scaffold('http://127.0.0.1:7602', { stubAgent: true });
    try {
      const r = spawnSync('node', ['scheduler/run.mjs', '--once'], {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, TERMFLEET_PROVIDER_URL: 'http://127.0.0.1:9999' },
      });
      expect(childPin(r.stdout)).toBe('http://127.0.0.1:9999');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('BLOCKER 2 regression: compiled pin + a set-but-EMPTY ambient (VAR= node scheduler/run.mjs) ⇒ the CHILD still inherits the SCHEDULE pin (7602), and the [loop] log AGREES — an empty ambient must NOT shadow the pin into a silent auto-discovery', () => {
    const dir = scaffold('http://127.0.0.1:7602', { stubAgent: true });
    try {
      const r = spawnSync('node', ['scheduler/run.mjs', '--once'], {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, TERMFLEET_PROVIDER_URL: '' }, // the empty-string idiom
      });
      // The child must NOT see '' (which the SDK would treat as unset → auto-discover onto a foreign
      // provider); the empty ambient is normalized away and the schedule pin shows through.
      expect(childPin(r.stdout)).toBe('http://127.0.0.1:7602');
      // …and the startup log must AGREE (no lie): it says (schedule), the same effective value the child got.
      const logLine = r.stderr.split('\n').find((l) => l.includes('[loop] provider '));
      expect(logLine).toMatch(/provider .*http:\/\/127\.0\.0\.1:7602.*\(schedule\)/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
