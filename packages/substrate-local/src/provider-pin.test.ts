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
// fireTick spawns anything real; a missing scripts/run-agent.mjs makes that spawn fail fast, harmlessly).
function scaffold(providerUrl?: string): string {
  const out = compileLocal(skillAgentIr, { providerUrl });
  const dir = mkdtempSync(join(tmpdir(), 'oa-provider-pin-'));
  mkdirSync(join(dir, 'scheduler'), { recursive: true });
  writeFileSync(join(dir, 'scheduler', 'run.mjs'), out.generated['scheduler/run.mjs']!);
  writeFileSync(join(dir, 'scheduler', 'schedule.json'), out.generated['scheduler/schedule.json']!);
  installMinimalTermfleet(dir);
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
