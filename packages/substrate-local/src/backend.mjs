#!/usr/bin/env node
// The autonomy runner (substrate primitive), vendored into this profile. Drives termfleet through its
// SDK (the `termfleet` npm package), not a `termfleet` binary on PATH. Its entire knowledge is: agents,
// running agents, and their lifecycle. It knows nothing about what an agent does or works on — no
// "issues", no states. That lives entirely in the agents (skills) and the profile's scripts.
//
// This is a plain-JS port of @open-autonomy/substrate-local's runner.ts (TermfleetRunner) + the core CLI.
// Keep the two in sync. The install must have `termfleet` (+ `@termfleet/core`) in node_modules.
//
//   launch <agent> [--k v ...]  ·  get <id>  ·  list  ·  update <id> --status <s>  ·  cancel <id>
//
// `launch` accepts arbitrary --key value params and passes them through verbatim; the system never
// interprets them (a profile gives them meaning, e.g. a ztrack-using profile declares ZTRACK_ISSUE).
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProviderClient, providerRefFromUrl } from 'termfleet';
import { resolveDefaultProvider } from '@termfleet/core/local-providers.js';
import { RUNNER_DEFAULTS } from './runner-defaults.mjs';

// Real local backend: drives termfleet via its ProviderClient SDK. The window name IS the agent; the
// system never encodes anything else into it. Defaults come from RUNNER_DEFAULTS; TERMFLEET_* override.
export class TermfleetRunner {
  harness = process.env.TERMFLEET_AGENT || RUNNER_DEFAULTS.harness; // claude|codex|gemini — the coding CLI, not our agent
  #clientPromise;
  #client() {
    return (this.#clientPromise ??= resolveDefaultProvider({ url: process.env.TERMFLEET_PROVIDER_URL }).then((p) => {
      // OA-09: log the effective provider + its origin on first resolve. The loop driver's own startup line
      // (emit.ts's LOOP_DRIVER) only covers processes it launches directly; a NESTED launch (the PM's own
      // `runner.ts launch developer ...`, or anyone driving this backend directly) resolves independently
      // and needs its own visibility. AUTONOMY_PROVIDER_URL_SOURCE (set by the loop driver, and re-exported
      // into every launched session's env below via the TERMFLEET_.*|AUTONOMY.* filter) distinguishes
      // `schedule` (the durable compile-time pin) from `env` (a genuine ambient override) when
      // TERMFLEET_PROVIDER_URL is set — both look identical here since schedule.env is already merged into
      // process.env by the time this runs (emit.ts's fireTick), so the hint is the only way to tell them
      // apart; `env` is the safe default when the hint is absent (e.g. this backend driven directly, outside
      // the loop). Unpinned, the SDK's own `source` (current-context | auto-local) is used verbatim.
      // TRIM (OA-09 Blocker 2): a set-but-empty/whitespace TERMFLEET_PROVIDER_URL is unset to the SDK (it
      // trims + falsy-checks `opts.url`), so it must read as unpinned here too — otherwise this line would
      // claim `env`/`schedule` while the SDK actually auto-discovered p.source.
      const pinnedEnv = (process.env.TERMFLEET_PROVIDER_URL || '').trim();
      const source = pinnedEnv ? process.env.AUTONOMY_PROVIDER_URL_SOURCE || 'env' : p.source;
      // stderr, never stdout — `list`/`launch`'s CLI output is a single JSON line on stdout that callers
      // (including this repo's own tests) parse directly; a diagnostic line ahead of it would corrupt that.
      console.error(`[runner] provider ${p.baseUrl} (${source})`);
      return new ProviderClient(providerRefFromUrl(p.baseUrl));
    }));
  }

  async launch(agent, params = {}) {
    // OA-08: verify the launch's skill invocation resolves in THIS cwd BEFORE spending anything on it —
    // deterministic and provider-independent (no termfleet call is needed to fail fast). The scheduler
    // launches the PM straight through THIS backend (emit.ts's LOOP_DRIVER -> run-agent.mjs ->
    // `autonomy-runner.mjs launch`), bypassing runner-frontend.ts's own pre-check entirely — so this is the
    // ONLY guard covering a tick-launched skill agent whose skill went missing post-compile (deleted,
    // renamed, wrong harness). The backend doesn't know the manifest's agent->behavior mapping (it stays
    // domain/manifest-blind by design), but every emitted skill-agent prompt IS the invocation name (`/name`
    // claude, `$name` codex — emit.ts:436-437), and the launch's prompt file is resolved right here anyway —
    // so read it once, early, and check the corresponding skills path. A bare-name prompt (no prompt file at
    // all — e.g. no AUTONOMY_PROMPT_DIR set) has nothing deterministic to verify: skip.
    const promptDir = process.env.AUTONOMY_PROMPT_DIR;
    const promptFile = promptDir ? `${promptDir}/${agent}.txt` : '';
    const promptExists = !!promptFile && existsSync(promptFile);
    const prompt = promptExists ? readFileSync(promptFile, 'utf8') : agent;
    // Match the EXACT emitted skill-invocation shape (emit.ts's promptFiles: `/${behavior}\n` claude,
    // `$${behavior}\n` codex) — a leading `/` or `$` followed by a single skill-name token and nothing else.
    // Anchoring both ends (a lone token, valid skill-name chars only) is deliberate: a hand-authored custom
    // AUTONOMY_PROMPT_DIR whose prompt merely STARTS with a path-like token (e.g. "/tmp/notes.md summarize")
    // is NOT a skill invocation and must not be misread as behavior "tmp/notes.md" and false-refused — it has
    // spaces / extra path segments, so it fails this anchored match and skips the check (nothing to verify).
    const invocation = promptExists ? /^[/$]([A-Za-z0-9._-]+)$/.exec(prompt.trim()) : null;
    if (invocation) {
      const behavior = invocation[1];
      const skillsRoot = this.harness === 'codex' ? '.codex/skills' : '.claude/skills';
      const skillPath = join(process.cwd(), skillsRoot, behavior, 'SKILL.md');
      if (!existsSync(skillPath)) {
        throw new Error(
          `[runner] launch refused: ${agent}'s skill "${behavior}" is missing at ${skillPath} — the session ` +
            `would die at launch ("Unknown command: ${prompt.trim()}"). Commit the harness ` +
            `(docs/OPERATIONS.md#local-runner-quickstart, "Commit the harness"), or check the skill exists ` +
            `for harness "${this.harness}".`,
        );
      }
    }

    const client = await this.#client();
    // Re-export orchestration context so a nested `autonomy launch ...` reaches this provider, plus the
    // opaque params verbatim (a profile may read e.g. $ZTRACK_ISSUE; the system doesn't). The runner stays
    // CODE-HOST-BLIND: it injects no github/repo identity — a code-host agent resolves its own repo through
    // its own tool (e.g. `gh api repos/{owner}/{repo}/…`, which `gh` fills from the remote).
    const exported = {
      ...Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(TERMFLEET_.*|AUTONOMY.*|PATH)$/.test(k))),
      ...params,
    };
    // Put the repo's local node_modules/.bin first so the agent reaches repo-pinned CLIs (e.g. a `-D`
    // ztrack) — exactly what `npm run`/`bun run` do, without the substrate naming any tool. cwd is the
    // repo (createAgentWindow runs the session there), so this is where its node_modules lives.
    exported.PATH = `${process.cwd()}/node_modules/.bin:${exported.PATH ?? process.env.PATH ?? ''}`;
    const setupCommand = Object.entries(exported)
      .map(([k, v]) => `export ${k}=${JSON.stringify(v ?? '')}`)
      .join('; ');
    // createAgentWindow blocks until the agent's first response; give its socket ack a generous timeout
    // (TERMFLEET_CREATE_TIMEOUT_MS overrides) so a real claude cold-start doesn't time out the launch and
    // lose the terminalId — the join key the post-session effect marker + the reaper depend on.
    const createTimeoutMs = Number(process.env.TERMFLEET_CREATE_TIMEOUT_MS || RUNNER_DEFAULTS.createTimeoutMs);
    const ack = await client.createAgentWindow(
      { agent: this.harness, name: agent, cwd: process.cwd(), prompt, setupCommand, createTimeoutMs },
      { timeoutMs: createTimeoutMs },
    );
    const terminalId = ack.result?.terminalId;
    if (!terminalId) {
      throw new Error(`termfleet createAgentWindow returned no terminalId for agent "${agent}": ${ack.error ?? '(no error)'}`);
    }
    const controlSha = (process.env.AUTONOMY_CONTROL_SHA || '').trim();
    if (controlSha) {
      const controlRoot = (process.env.AUTONOMY_CONTROL_ROOT || process.cwd()).trim();
      const dir = join(controlRoot, '.open-autonomy', 'runner-state', 'control-sessions');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${terminalId.replace(/[^0-9A-Za-z._-]/g, '-')}.json`), `${JSON.stringify({
        schema: 'open-autonomy.control-session.v1', id: terminalId, agent, controlSha, launchedAt: new Date().toISOString(),
      }, null, 2)}\n`);
    }
    return {
      id: terminalId,
      agent,
      status: 'running',
      ...(ack.result?.agentSessionId ? { ref: ack.result.agentSessionId } : {}),
      ...(Object.keys(params).length ? { params } : {}),
      ...(controlSha ? { controlSha } : {}),
    };
  }
  async get(id) {
    return (await this.list()).find((s) => s.id === id);
  }
  // termfleet's process-tree lifecycle joined to the window list. A window points at a session via
  // `lifecycle.currentSessionId`; the session carries the real activity `state` (+ attention `signal`).
  async #view() {
    const client = await this.#client();
    const [life, snapshot] = await Promise.all([client.lifecycle(), client.snapshot()]);
    const byId = new Map((life.sessions || []).map((s) => [s.sessionId, s]));
    return { client, snapshot, byId };
  }
  async list() {
    const { snapshot, byId } = await this.#view();
    // id = the terminalId termfleet owns; agent = the window name we launched it under; status reflects
    // termfleet's real per-session activity (running | background | idle | awaiting-human).
    return snapshot.windows.filter((w) => !!w.terminalId).map((w) => sessionOf(w, byId));
  }
  // Close this install's OWN agent sessions that have been IDLE (termfleet `session_waiting`, no attention
  // signal) for >= idleMs — the local analogue of an ephemeral job ending when its work is done. Scope is
  // the `agents` name set (a human's own terminal or another loop's session is never touched). `since` is
  // the caller's persistent Map(sessionId -> firstIdleAtMs): a session that resumes work, is taken over
  // (signal `asking`), or errors is dropped from it and never reaped. Reaps via closeWindow (proven path).
  async reapIdle({ idleMs = 60000, agents, since = new Map(), now = Date.now() } = {}) {
    const { client, snapshot, byId } = await this.#view();
    const seen = new Set();
    const reaped = [];
    for (const w of snapshot.windows) {
      if (agents && agents.size && !agents.has(w.name)) continue;
      const sid = w.lifecycle?.currentSessionId;
      const s = sid ? byId.get(sid) : undefined;
      if (!s) continue;
      seen.add(sid);
      const idle = s.state === 'session_waiting' && !s.signal;
      if (!idle) {
        since.delete(sid);
        continue;
      }
      if (!since.has(sid)) since.set(sid, now);
      if (now - since.get(sid) >= idleMs) {
        const ack = await client.closeWindow(w.id).catch(() => null);
        if (ack && ack.ok !== false) {
          reaped.push({ id: w.terminalId, agent: w.name, sessionId: sid });
          since.delete(sid);
        }
      }
    }
    for (const sid of [...since.keys()]) if (!seen.has(sid)) since.delete(sid);
    return reaped;
  }
  async update(id, patch) {
    if (patch.status === 'cancelled') return this.cancel(id);
    return true;
  }
  async cancel(id) {
    const client = await this.#client();
    const snapshot = await client.snapshot();
    const window = snapshot.windows.find((w) => w.terminalId === id);
    if (!window) return false;
    const ack = await client.closeWindow(window.id);
    return ack.ok !== false;
  }
}

// Map a window + its lifecycle session into a Session, surfacing termfleet's real activity. The contract
// status vocab is running|paused|cancelled|done|failed, so: running/background -> running, idle
// (session_waiting, no signal) -> done, attention `asking` -> paused, `errored` -> failed; a note carries
// the finer distinction. No session yet (just launched) reads as running.
function sessionOf(w, byId) {
  const s = w.lifecycle?.currentSessionId ? byId.get(w.lifecycle.currentSessionId) : undefined;
  let controlSha = '';
  try {
    const root = (process.env.AUTONOMY_CONTROL_ROOT || process.cwd()).trim();
    const receipt = JSON.parse(readFileSync(join(root, '.open-autonomy', 'runner-state', 'control-sessions', `${w.terminalId.replace(/[^0-9A-Za-z._-]/g, '-')}.json`), 'utf8'));
    controlSha = typeof receipt.controlSha === 'string' ? receipt.controlSha : '';
  } catch { /* pre-generation session */ }
  const base = { id: w.terminalId, agent: w.name, ...(controlSha ? { controlSha } : {}) };
  if (!s) return { ...base, status: 'running' };
  const ref = s.sessionId;
  if (s.state === 'session_running') return { ...base, status: 'running', ref };
  if (s.state === 'session_stopped_background_running') return { ...base, status: 'running', ref, note: 'background work running' };
  if (s.signal === 'asking') return { ...base, status: 'paused', ref, note: 'awaiting human input' };
  if (s.signal === 'errored') return { ...base, status: 'failed', ref, note: 'errored, awaiting human' };
  return { ...base, status: 'done', ref, note: 'idle (turn complete)' };
}

function parseParams(args) {
  const params = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a?.startsWith('--')) {
      const key = a.slice(2);
      const next = args[i + 1];
      params[key] = next && !next.startsWith('--') ? (i++, next) : 'true';
    }
  }
  return params;
}

export async function runCli(runner, argv) {
  const [cmd, ...rest] = argv;
  const opt = (name) => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : undefined;
  };

  if (cmd === 'launch') {
    const agent = rest[0];
    if (!agent || agent.startsWith('--')) {
      console.error('usage: autonomy launch <agent> [--key value ...]');
      return 2;
    }
    console.log(JSON.stringify(await runner.launch(agent, parseParams(rest.slice(1)))));
    return 0;
  }
  if (cmd === 'get') {
    const session = await runner.get(rest[0] ?? '');
    if (!session) return 1;
    console.log(JSON.stringify(session));
    return 0;
  }
  if (cmd === 'list') {
    console.log(JSON.stringify(await runner.list()));
    return 0;
  }
  if (cmd === 'update') {
    const id = rest[0];
    const status = opt('--status');
    if (!id || !status) {
      console.error('usage: autonomy update <id> --status <running|paused|cancelled|done|failed>');
      return 2;
    }
    return (await runner.update(id, { status })) ? 0 : 1;
  }
  if (cmd === 'cancel') {
    const id = rest[0];
    if (!id) {
      console.error('usage: autonomy cancel <id>');
      return 2;
    }
    return (await runner.cancel(id)) ? 0 : 1;
  }
  console.error('usage: autonomy <launch|get|list|update|cancel>');
  return 2;
}

// Entrypoint: compare canonical filesystem paths, not URL strings. On macOS `/var` and `/private/var`
// name the same file; a raw string comparison silently skipped the CLI when invoked through `/var`.
const isMain = (() => {
  try {
    return !!process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
})();
if (isMain) {
  process.exit(await runCli(new TermfleetRunner(), process.argv.slice(2)));
}
