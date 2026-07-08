// A shared, MODEL-FREE stub `termfleet` + `@termfleet/core` pair — installed into a fixture's
// `node_modules` so a REAL emitted install (scripts/run-agent.mjs -> scripts/autonomy-runner.mjs ->
// backend.mjs) can be driven as a real subprocess with ZERO model calls and zero spend. This is the
// deterministic virtual-tmux analog OA-08's launch-verification.test.ts pioneered
// (its own local `installStubTermfleet`, now generalized and centralized HERE so both suites — and OA-18's
// doctor --live tests, bin/doctor-checks.test.ts + bin/doctor.test.ts — import ONE implementation instead of
// hand-rolling their own). NOT a `*.test.ts` file on purpose: both packages/substrate-local's own tests and
// bin/*.test.ts (a different package) need to import it, and only a non-test module is importable from both
// without tripping each package's "test files aren't part of the public surface" convention.
//
// The stub satisfies exactly:
//   - backend.mjs's import surface (`ProviderClient`, `providerRefFromUrl` from `termfleet`;
//     `resolveDefaultProvider` from `@termfleet/core/local-providers.js`) — the launch/list/cancel path.
//   - the extra SDK surface bin/doctor-checks.ts's `checkLive` calls directly for its dead-session evidence
//     capture (`captureTerminal`, `disconnect`) — NOT exercised by OA-08's suite, which never calls them.
//
// Every knob below is read from an ENVIRONMENT VARIABLE at runtime by the stub code AS WRITTEN TO DISK —
// never via a closure captured at install time — because the stub is loaded by SEPARATE `node`/`bun` child
// processes (one for `launch`, then one per `list` poll, then one for `cancel`, ...): a closure captured
// once in the writer process could never reach any of them. Setting these in the TEST's own process.env is
// sufficient — every spawnSync/Bun.spawn call in this codebase's dispatch chain builds its child env from
// (a superset of) `process.env`, so the knob is inherited transitively all the way down.
//
//   OA08_SESSION_SENTINEL    — file path; every REAL createAgentWindow call appends a JSON line here
//                              (`{id, agent, cwd}`). OA-08's OWN sentinel channel — its tests assert on its
//                              presence/absence directly, and (when set) this stub's `snapshot()` replays it
//                              into `windows` too. Left unset by OA-18's tests (see OA_STUB_TF_SESSIONS_FILE
//                              below) so the two suites' bookkeeping never entangles.
//   OA08_STUB_PROVIDER_DOWN  — '1' => createAgentWindow throws (OA-08's AC-3: "termfleet provider down").
//   OA_STUB_TF_SESSIONS_FILE — file path; a SECOND, independent sentinel channel every REAL
//                              createAgentWindow call ALSO appends a JSON line to (regardless of whether
//                              OA08_SESSION_SENTINEL is set) — OA-18's OWN bookkeeping channel, so its tests
//                              never have to adopt OA-08's naming/semantics. `snapshot()` replays entries
//                              from EITHER channel that is set (deduped by id) into `windows` — this is the
//                              "the launched terminal survives" default.
//   OA_STUB_TF_DIE           — '1' => snapshot() reports NO windows at all, from EITHER channel — the
//                              session "died at launch" (OA-18 AC-10's fail-path / AC-6's login-prompt
//                              path: the launch chain still gets a terminalId back from createAgentWindow,
//                              but the FIRST poll of `runner list` already finds it gone).
//                              Unset/'0' => snapshot() reports every window a set sentinel channel recorded
//                              — the session "survives" (OA-08's existing behavior, unchanged; OA-18 AC-10's
//                              pass path).
//   OA_STUB_TF_CAPTURE       — the exact string captureTerminal() returns as `.content` — e.g. "DOCTOR-OK",
//                              a captured login-prompt blob, or arbitrary dead-terminal contents. Unset =>
//                              ''.
//   OA_STUB_TF_PROVIDER_SINK — file path; every resolveDefaultProvider() call appends the URL it resolved
//                              (the pin/default it was constructed with) as one line — the provider-identity
//                              seam OA-09 needs; unused by OA-08/OA-18's own tests today but load-bearing
//                              for whoever builds that next (per the recon in OA-18's build brief).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TERMFLEET_INDEX_JS = `import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
export function providerRefFromUrl(url) { return { url }; }
let counter = 0;
export class ProviderClient {
  constructor(ref) { this.ref = ref; }
  async createAgentWindow(opts) {
    if (process.env.OA08_STUB_PROVIDER_DOWN === '1') throw new Error('OA stub: termfleet provider unreachable (simulated)');
    const id = 'stub-terminal-' + (++counter) + '-' + Date.now();
    const rec = JSON.stringify({ id, agent: opts.name, cwd: opts.cwd }) + '\\n';
    for (const sentinel of [process.env.OA08_SESSION_SENTINEL, process.env.OA_STUB_TF_SESSIONS_FILE]) {
      if (!sentinel) continue;
      mkdirSync(dirname(sentinel), { recursive: true });
      appendFileSync(sentinel, rec);
    }
    return { result: { terminalId: id } };
  }
  async lifecycle() { return { sessions: [] }; }
  async snapshot() {
    if (process.env.OA_STUB_TF_DIE === '1') return { windows: [] };
    const byId = new Map();
    for (const sentinel of [process.env.OA08_SESSION_SENTINEL, process.env.OA_STUB_TF_SESSIONS_FILE]) {
      if (!sentinel || !existsSync(sentinel)) continue;
      for (const l of readFileSync(sentinel, 'utf8').trim().split('\\n').filter(Boolean)) {
        const rec = JSON.parse(l);
        byId.set(rec.id, { id: 0, name: rec.agent, terminalId: rec.id, lifecycle: {} });
      }
    }
    return { windows: [...byId.values()] };
  }
  async captureTerminal(_terminalId, _lines) {
    return { content: process.env.OA_STUB_TF_CAPTURE || '' };
  }
  async closeWindow() { return { ok: true }; }
  disconnect() {}
}
`;

const TERMFLEET_CORE_LOCAL_PROVIDERS_JS = `import { appendFileSync } from 'node:fs';
export async function resolveDefaultProvider(opts) {
  const url = (opts && opts.url) || 'http://127.0.0.1:0';
  const sink = process.env.OA_STUB_TF_PROVIDER_SINK;
  if (sink) { try { appendFileSync(sink, url + '\\n'); } catch {} }
  return { baseUrl: url, source: opts && opts.url ? 'env' : 'auto-local' };
}
`;

/** Install a minimal but functionally REAL `termfleet` + `@termfleet/core` pair into `dir`'s node_modules —
 *  satisfies backend.mjs's exact import surface plus checkLive's captureTerminal/disconnect surface. Every
 *  behavior knob is an env var (see the file header); calling this with no env vars set reproduces OA-08's
 *  original always-survives, empty-capture stub exactly. Because Node's module resolution walks UP from any
 *  importer to find the nearest ancestor `node_modules` on disk (independent of git — a worktree is just a
 *  nested directory), installing this ONCE at an install's repo root is enough to resolve both from the
 *  main checkout AND from any git worktree the runner creates under it (e.g. `<dir>/.worktrees/<branch>`). */
export function installStubTermfleet(dir: string): void {
  const nm = join(dir, 'node_modules');
  mkdirSync(join(nm, 'termfleet'), { recursive: true });
  writeFileSync(
    join(nm, 'termfleet', 'package.json'),
    JSON.stringify({ name: 'termfleet', version: '0.0.0-stub', type: 'module', main: './index.js', exports: { '.': './index.js' } }),
  );
  writeFileSync(join(nm, 'termfleet', 'index.js'), TERMFLEET_INDEX_JS);

  mkdirSync(join(nm, '@termfleet', 'core'), { recursive: true });
  writeFileSync(
    join(nm, '@termfleet', 'core', 'package.json'),
    JSON.stringify({ name: '@termfleet/core', version: '0.0.0-stub', type: 'module', exports: { './local-providers.js': './local-providers.js' } }),
  );
  writeFileSync(join(nm, '@termfleet', 'core', 'local-providers.js'), TERMFLEET_CORE_LOCAL_PROVIDERS_JS);
}
