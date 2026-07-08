// OA-09 AC-7 — the end-to-end MISATTACHMENT-CLOSED demonstration: a launched session actually LANDS on
// the pinned provider, and a foreign provider on 7373 gets none. Complementary to (does NOT duplicate)
// packages/substrate-local/src/provider-pin.test.ts:262-313, which is the already-green Tier-A proof that
// the CHILD PROCESS inherits the right TERMFLEET_PROVIDER_URL (via a stub run-agent.mjs that just prints
// `CHILD_PIN=...`). That suite never calls termfleet's SDK at all — it proves the ENV reaches the child,
// not that a LAUNCH actually happens against the resolved provider. This file is Tier-B: it drives the
// REAL dispatch chain — `scheduler/run.mjs --once` -> `scripts/run-agent.mjs` -> `scripts/autonomy-runner.mjs`
// (backend.mjs, emitted verbatim) -> the termfleet SDK's `resolveDefaultProvider` + `ProviderClient
// .createAgentWindow` — against a MODEL-FREE stub termfleet, so a real (stub) session is actually created
// and its landed provider is directly observable.
//
// HONEST BOUNDARY: this drives OA's own routing/launch layer end-to-end and model-free via the stub
// provider (packages/substrate-local/src/test-support/stub-termfleet.ts) — it lands a real window on the
// RESOLVED (pinned) provider and proves a foreign decoy on 7373 gets none. It does NOT exercise termfleet's
// real virtual-tmux provider process — a real provider paired with a real coding-CLI would spawn a billed
// agent, which is forbidden (see docs/adoption-fixes/proofs/oa-09.md). Zero model calls anywhere in this
// file.
//
// Why the shared stub-termfleet.ts is EXTENDED here rather than reused verbatim (and why that extension
// lives in THIS file, not in stub-termfleet.ts itself): the shared stub's `resolveDefaultProvider` only
// ever looks at `opts.url` — it has no notion of `~/.termfleet/current.json` (the real SDK's
// current-context fallback, OA-09's own root-cause doc, `@termfleet/core@0.2.1 local-providers.js:132-146`).
// Without that fallback, staging a "foreign provider on 7373" fixture would be VACUOUS — nothing in the
// resolution path would ever consult it, pinned or not, so the assertion "the foreign provider gets none"
// would trivially always pass even with the pin removed entirely. Two local overrides (below) restore just
// enough of the real precedence chain (explicit url > ~/.termfleet/current.json > auto-local) to make the
// decoy real, plus tag every recorded (stub) session with the provider URL it actually landed on. Both
// overrides are written directly into a FIXTURE's own node_modules (never touching the shared
// stub-termfleet.ts, so every existing importer — OA-08's launch-verification.test.ts, OA-18's
// bin/doctor.test.ts / bin/doctor-checks.test.ts — stays exactly as it was).
import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { materialize, parseIr } from '@open-autonomy/core';
import { compileLocal } from './emit';
import { installStubTermfleet } from './test-support/stub-termfleet';

// packages/substrate-local/src -> repo root
const REPO_ROOT = join(import.meta.dir, '..', '..', '..');
const HELLO_DIR = join(REPO_ROOT, 'profiles', 'hello');
const PINNED_URL = 'http://127.0.0.1:7602';
const FOREIGN_URL = 'http://127.0.0.1:7373';

function git(dir: string, args: string[]) {
  return spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
}
function gitInit(dir: string) {
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 'oa09-e2e@example.com']);
  git(dir, ['config', 'user.name', 'OA09 e2e']);
}
function commitAll(dir: string, msg: string) {
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', msg]);
}

// The termfleet/@termfleet-core overrides described in the file header. Installed on TOP of
// installStubTermfleet's baseline files (same package.json shapes, same OA08_*/OA_STUB_TF_* knobs) — only
// the two behaviors below are added:
//   (1) every (stub) createAgentWindow call now also records WHICH provider URL it was constructed
//       against (`provider` field) — the direct "this session landed on <url>" evidence AC-7 needs.
//   (2) resolveDefaultProvider restores the real SDK's current-context fallback (env/flag beats
//       ~/.termfleet/current.json beats auto-local) so a decoy current.json is a genuine, non-vacuous
//       foreign candidate — never consulted at all once an explicit url (a pin) is present, exactly
//       mirroring the real precedence this repo's own OA-09 doc cites.
function installProviderLandingStub(dir: string): void {
  installStubTermfleet(dir);
  const termfleetIndex = join(dir, 'node_modules', 'termfleet', 'index.js');
  writeFileSync(
    termfleetIndex,
    `import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';\n` +
      `import { dirname } from 'node:path';\n` +
      `export function providerRefFromUrl(url) { return { url }; }\n` +
      `let counter = 0;\n` +
      `export class ProviderClient {\n` +
      `  constructor(ref) { this.ref = ref; }\n` +
      `  async createAgentWindow(opts) {\n` +
      `    if (process.env.OA08_STUB_PROVIDER_DOWN === '1') throw new Error('OA stub: termfleet provider unreachable (simulated)');\n` +
      `    const id = 'stub-terminal-' + (++counter) + '-' + Date.now();\n` +
      // OA-09 addition: tag the record with the provider this client was actually constructed against —
      // the "which provider did the session land on" evidence.
      `    const rec = JSON.stringify({ id, agent: opts.name, cwd: opts.cwd, provider: (this.ref && this.ref.url) || null }) + '\\n';\n` +
      `    for (const sentinel of [process.env.OA08_SESSION_SENTINEL, process.env.OA_STUB_TF_SESSIONS_FILE]) {\n` +
      `      if (!sentinel) continue;\n` +
      `      mkdirSync(dirname(sentinel), { recursive: true });\n` +
      `      appendFileSync(sentinel, rec);\n` +
      `    }\n` +
      `    return { result: { terminalId: id } };\n` +
      `  }\n` +
      `  async lifecycle() { return { sessions: [] }; }\n` +
      `  async snapshot() {\n` +
      `    if (process.env.OA_STUB_TF_DIE === '1') return { windows: [] };\n` +
      `    const byId = new Map();\n` +
      `    for (const sentinel of [process.env.OA08_SESSION_SENTINEL, process.env.OA_STUB_TF_SESSIONS_FILE]) {\n` +
      `      if (!sentinel || !existsSync(sentinel)) continue;\n` +
      `      for (const l of readFileSync(sentinel, 'utf8').trim().split('\\n').filter(Boolean)) {\n` +
      `        const rec = JSON.parse(l);\n` +
      `        byId.set(rec.id, { id: 0, name: rec.agent, terminalId: rec.id, lifecycle: {} });\n` +
      `      }\n` +
      `    }\n` +
      `    return { windows: [...byId.values()] };\n` +
      `  }\n` +
      `  async captureTerminal(_terminalId, _lines) { return { content: process.env.OA_STUB_TF_CAPTURE || '' }; }\n` +
      `  async closeWindow() { return { ok: true }; }\n` +
      `  disconnect() {}\n` +
      `}\n`,
  );
  const localProviders = join(dir, 'node_modules', '@termfleet', 'core', 'local-providers.js');
  writeFileSync(
    localProviders,
    `import { appendFileSync, existsSync, readFileSync } from 'node:fs';\n` +
      `import { join } from 'node:path';\n` +
      `export async function resolveDefaultProvider(opts) {\n` +
      `  const explicit = opts && opts.url ? String(opts.url).trim() : '';\n` +
      `  let url = explicit;\n` +
      `  let source = 'flag/env';\n` +
      // Real precedence (OA-09 doc, citing @termfleet/core@0.2.1 local-providers.js:132-146): an explicit
      // url (flag/TERMFLEET_PROVIDER_URL) short-circuits BEFORE ever consulting current-context — a pin
      // must never even look at a foreign current.json, let alone be beaten by it.
      `  if (!url) {\n` +
      `    const currentPath = join(process.env.TERMFLEET_HOME || process.env.HOME || '.', '.termfleet', 'current.json');\n` +
      `    if (existsSync(currentPath)) {\n` +
      `      try {\n` +
      `        const parsed = JSON.parse(readFileSync(currentPath, 'utf8'));\n` +
      `        if (parsed && parsed.url) { url = parsed.url; source = 'current-context'; }\n` +
      `      } catch {}\n` +
      `    }\n` +
      `  }\n` +
      `  if (!url) { url = 'http://127.0.0.1:0'; source = 'auto-local'; }\n` +
      `  const sink = process.env.OA_STUB_TF_PROVIDER_SINK;\n` +
      `  if (sink) { try { appendFileSync(sink, url + '\\n'); } catch {} }\n` +
      `  return { baseUrl: url, source };\n` +
      `}\n`,
  );
}

// Compile + materialize a real `hello` (single skill-agent, "greeter") local install, commit the harness
// (the worktree-visibility guard — emit.ts's LOOP_DRIVER refuses to tick an uncommitted install), and
// clear the fresh-install PAUSED marker (OA-07) so a tick can actually fire.
function scaffoldHello(providerUrl?: string): string {
  const ir = parseIr(readFileSync(join(HELLO_DIR, 'ir.yml'), 'utf8'));
  const out = compileLocal(ir, { providerUrl });
  const dir = mkdtempSync(join(tmpdir(), 'oa09-provider-landing-'));
  materialize(out, dir, (from) => readFileSync(join(HELLO_DIR, from), 'utf8'));
  rmSync(join(dir, '.open-autonomy', 'paused'), { force: true });
  gitInit(dir);
  commitAll(dir, 'install the open-autonomy harness');
  return dir;
}

// A decoy ~/.termfleet/current.json (a machine-global `termfleet use` context) pointing at the FOREIGN
// provider on 7373 — the exact silent-misattachment vector OA-09's doc identifies ("beats discovery
// without any ambiguity check"). Isolated via TERMFLEET_HOME (the same isolation idiom
// provider-pin.test.ts's own "no live provider" test already uses) so this never touches the real box's
// actual ~/.termfleet.
function stageForeignCurrentContext(): string {
  const home = mkdtempSync(join(tmpdir(), 'oa09-termfleet-home-'));
  mkdirSync(join(home, '.termfleet'), { recursive: true });
  writeFileSync(join(home, '.termfleet', 'current.json'), JSON.stringify({ url: FOREIGN_URL }));
  return home;
}

function readLines(path: string): string[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').trim().split('\n').filter(Boolean);
}

const tmps: string[] = [];
function track(dir: string): string {
  tmps.push(dir);
  return dir;
}
function cleanup() {
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true });
}

describe('AC-3: compileLocal --provider-url lands a durable pin in scheduler/schedule.json', () => {
  test('a hello install compiled with --provider-url carries TERMFLEET_PROVIDER_URL in schedule.json.env', () => {
    const dir = track(scaffoldHello(PINNED_URL));
    try {
      const schedule = JSON.parse(readFileSync(join(dir, 'scheduler', 'schedule.json'), 'utf8')) as {
        env: Record<string, string>;
      };
      expect(schedule.env).toEqual({ TERMFLEET_PROVIDER_URL: PINNED_URL });
    } finally {
      cleanup();
    }
  });
});

describe('AC-7: a REAL tick lands a REAL (stub) session on the PINNED provider — the foreign 7373 decoy gets none', () => {
  test('pinned + a foreign current-context decoy on 7373 present: the launched session lands on 7602, 7373 is never touched, log says (schedule)', () => {
    const dir = track(scaffoldHello(PINNED_URL));
    const home = track(stageForeignCurrentContext());
    installProviderLandingStub(dir);
    const sink = join(dir, 'oa09-provider-sink.log');
    const sessions = join(dir, 'oa09-sessions.log');
    try {
      const env = { ...process.env };
      delete env.TERMFLEET_PROVIDER_URL; // this dev box's own ambient pin (if any) must not leak in
      delete env.AUTONOMY_PROVIDER_URL_SOURCE;
      env.TERMFLEET_HOME = home; // isolates ~/.termfleet/current.json to our staged decoy
      env.OA_STUB_TF_PROVIDER_SINK = sink;
      env.OA_STUB_TF_SESSIONS_FILE = sessions;

      const r = spawnSync('node', ['scheduler/run.mjs', '--once'], { cwd: dir, encoding: 'utf8', env });
      expect(r.status).toBe(0);

      // --- pin lands: the resolved provider was ALWAYS 7602, never 7373 ---
      const sinkLines = readLines(sink);
      expect(sinkLines.length).toBeGreaterThan(0); // resolveDefaultProvider really was called (>=1 real resolve)
      expect(sinkLines.every((l) => l === PINNED_URL)).toBe(true);
      expect(sinkLines.some((l) => l.includes('7373'))).toBe(false);

      // --- misattachment closed: the ACTUAL launched (stub) session's own record shows the landed provider ---
      const sessionLines = readLines(sessions).map((l) => JSON.parse(l) as { id: string; agent: string; provider: string | null });
      expect(sessionLines.length).toBe(1); // exactly one real (stub) createAgentWindow call — the greeter launch
      expect(sessionLines[0]!.agent).toBe('greeter');
      expect(sessionLines[0]!.provider).toBe(PINNED_URL);
      expect(sessionLines.some((s) => s.provider === FOREIGN_URL)).toBe(false); // the foreign decoy landed NOTHING

      // --- AC-4: the effective-source log line agrees — "(schedule)", never "(current-context)"/"(auto-local)" ---
      const loopLine = r.stderr.split('\n').find((l) => l.includes('[loop] provider '));
      expect(loopLine).toMatch(new RegExp(`provider .*${PINNED_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*\\(schedule\\)`));
      expect(r.stderr).not.toContain('7373');
      // The NESTED backend resolve (run-agent.mjs -> autonomy-runner.mjs) logs its OWN agreeing line too —
      // proving the pin held all the way down the real dispatch chain, not just at the loop driver's guess.
      expect(r.stderr).toMatch(/\[runner\] provider http:\/\/127\.0\.0\.1:7602 \(schedule\)/);
    } finally {
      cleanup();
    }
  }, 30_000);

  test('CONTRAST (proves the decoy is real, not vacuous): the SAME foreign current-context decoy, UNPINNED — the launched session lands on the foreign 7373', () => {
    const dir = track(scaffoldHello(undefined)); // no --provider-url: an unpinned install
    const home = track(stageForeignCurrentContext());
    installProviderLandingStub(dir);
    const sink = join(dir, 'oa09-provider-sink.log');
    const sessions = join(dir, 'oa09-sessions.log');
    try {
      const env = { ...process.env };
      delete env.TERMFLEET_PROVIDER_URL;
      delete env.AUTONOMY_PROVIDER_URL_SOURCE;
      env.TERMFLEET_HOME = home;
      env.OA_STUB_TF_PROVIDER_SINK = sink;
      env.OA_STUB_TF_SESSIONS_FILE = sessions;

      const r = spawnSync('node', ['scheduler/run.mjs', '--once'], { cwd: dir, encoding: 'utf8', env });
      expect(r.status).toBe(0);

      const sinkLines = readLines(sink);
      expect(sinkLines.length).toBeGreaterThan(0);
      expect(sinkLines.every((l) => l === FOREIGN_URL)).toBe(true); // WOULD have landed on the decoy, pre-fix

      const sessionLines = readLines(sessions).map((l) => JSON.parse(l) as { provider: string | null });
      expect(sessionLines.length).toBe(1);
      expect(sessionLines[0]!.provider).toBe(FOREIGN_URL);

      const loopLine = r.stderr.split('\n').find((l) => l.includes('[loop] provider '));
      expect(loopLine).toMatch(/provider http:\/\/127\.0\.0\.1:7373 \(current-context\)/);
    } finally {
      cleanup();
    }
  }, 30_000);
});

describe('AC-7 strengthening: precedence, asserted on the REAL landed session (not just the child-inherited env)', () => {
  // provider-pin.test.ts:262-313 already proves the CHILD PROCESS inherits the right env for these exact
  // precedence cases (a stub run-agent.mjs printing CHILD_PIN=...). These two add the assertion that suite
  // cannot make: that a REAL (stub) session actually lands on the resolved provider.
  test('a genuine ambient TERMFLEET_PROVIDER_URL overrides the compiled pin — the session lands on the AMBIENT url, never 7602 nor the 7373 decoy', () => {
    const dir = track(scaffoldHello(PINNED_URL));
    const home = track(stageForeignCurrentContext());
    installProviderLandingStub(dir);
    const sink = join(dir, 'oa09-provider-sink.log');
    const sessions = join(dir, 'oa09-sessions.log');
    const ambientUrl = 'http://127.0.0.1:9999';
    try {
      const env = { ...process.env, TERMFLEET_PROVIDER_URL: ambientUrl };
      delete env.AUTONOMY_PROVIDER_URL_SOURCE;
      env.TERMFLEET_HOME = home;
      env.OA_STUB_TF_PROVIDER_SINK = sink;
      env.OA_STUB_TF_SESSIONS_FILE = sessions;

      const r = spawnSync('node', ['scheduler/run.mjs', '--once'], { cwd: dir, encoding: 'utf8', env });
      expect(r.status).toBe(0);

      const sinkLines = readLines(sink);
      expect(sinkLines.every((l) => l === ambientUrl)).toBe(true);
      const sessionLines = readLines(sessions).map((l) => JSON.parse(l) as { provider: string | null });
      expect(sessionLines[0]!.provider).toBe(ambientUrl);
      expect(r.stderr).not.toContain('7602');
      expect(r.stderr).not.toContain('7373');
      const loopLine = r.stderr.split('\n').find((l) => l.includes('[loop] provider '));
      expect(loopLine).toMatch(/provider http:\/\/127\.0\.0\.1:9999 \(env\)/);
    } finally {
      cleanup();
    }
  }, 30_000);

  test('BLOCKER-2 regression, on the REAL landing: a set-but-EMPTY ambient TERMFLEET_PROVIDER_URL does NOT drop the pin — the session still lands on 7602, never the 7373 decoy', () => {
    const dir = track(scaffoldHello(PINNED_URL));
    const home = track(stageForeignCurrentContext());
    installProviderLandingStub(dir);
    const sink = join(dir, 'oa09-provider-sink.log');
    const sessions = join(dir, 'oa09-sessions.log');
    try {
      const env = { ...process.env, TERMFLEET_PROVIDER_URL: '' }; // the `VAR= node scheduler/run.mjs` idiom
      delete env.AUTONOMY_PROVIDER_URL_SOURCE;
      env.TERMFLEET_HOME = home;
      env.OA_STUB_TF_PROVIDER_SINK = sink;
      env.OA_STUB_TF_SESSIONS_FILE = sessions;

      const r = spawnSync('node', ['scheduler/run.mjs', '--once'], { cwd: dir, encoding: 'utf8', env });
      expect(r.status).toBe(0);

      const sinkLines = readLines(sink);
      expect(sinkLines.every((l) => l === PINNED_URL)).toBe(true);
      expect(sinkLines.some((l) => l === FOREIGN_URL)).toBe(false);
      const sessionLines = readLines(sessions).map((l) => JSON.parse(l) as { provider: string | null });
      expect(sessionLines[0]!.provider).toBe(PINNED_URL);
      const loopLine = r.stderr.split('\n').find((l) => l.includes('[loop] provider '));
      expect(loopLine).toMatch(/provider http:\/\/127\.0\.0\.1:7602 \(schedule\)/);
    } finally {
      cleanup();
    }
  }, 30_000);
});
