// TB.2 — `oa maturity`: compose TB.1's IMM signal library (imm-signals.ts), TB.3's per-profile signal-set
// SELECTION (signal-sets.ts) and TF.1's mission-advancing signal (m6-signal.ts) into ONE IMM stage verdict
// (M0..M6, DESIGN §Q1) and write it to a durable `.open-autonomy/install.json` record — the missing stage
// record DESIGN calls out ("no durable stage record today — unpause/arm leave no trace", `emit.ts:602-612`).
// This file does the COMPOSING; it never re-derives a signal TB.1/TB.3/TF.1 already computes.
//
// NO-CORE-IMPORTS RULE, continued (see imm-signals.ts / signal-sets.ts / m6-signal.ts / board-readiness.ts
// headers): `bin/ensure-ci-workflow.ts`'s header EMPIRICALLY CONFIRMS wiring `@open-autonomy/core`'s
// `getSetupPack` into this package breaks `cli.test.ts`'s real-`node`-subprocess tests with
// `ERR_MODULE_NOT_FOUND` — core resolves its own internal modules extension-free (bundler-style), which
// plain Node ESM cannot follow, and `@volter/oa` ships standalone to installs that may not have this
// monorepo (or core) present at all. So — despite signal-sets.ts's own speculative note that "TB.2's
// composer... DOES depend on core" — THIS unit follows the estabished, empirically-necessary rule instead:
// `readPack` below is a small, dependency-free YAML/JSON read of `<profileDir>/ir.yml` +
// `<profileDir>/setup-pack.yml` + `<profileDir>/provision.json`, mirroring m6-signal.ts's own
// `readPackFacts`/`readRequiredChecks` and signal-sets.ts's `SignalSetPack` structural subset EXACTLY —
// never a second, drift-prone reimplementation of `getSetupPack`'s full VIEW derivation, just the same
// already-hand-authored leaf fields every sibling file in this package already reads this same way.
//
// STAGE COMPOSITION — the decisions this unit had to make that DESIGN states but does not fully mechanize
// (documented here once; cited again inline at each gate):
//
//   M1 SCOPED has no artifact today (DESIGN §Q1). This file IS that missing artifact, going forward: once
//   ANY run of `oa maturity` records a `profile` (supplied via `--profile-dir`/`--profile`, or already on
//   record in a PRIOR `install.json`), every later run — even one made before `compile` ever ran — can see
//   that choice was made and report M1 instead of M0. `computeMaturity` therefore reads the PRIOR
//   `install.json` (if any) BEFORE it overwrites it.
//
//   The ladder is CUMULATIVE: once M2/M3 hold, they must never regress just because a supporting signal
//   later flips (A4 "paused seeded" is cited as M2 evidence in DESIGN's table, but A4 is FALSE the moment
//   the install is unpaused at M5 — gating M2 on A4 would wrongly demote a RUNNING install back to
//   "not scaffolded"). So M2 gates on A1+A2+A3 (manifest/parse validity) only; A4/A5 are each other's own
//   stage's business (M2's supporting evidence vs M5's hard gate), never cross-gated.
//
//   M3 INSTALLED gates on the profile's OWN designated `maturity_signals.m3_tool` signal (doctor: A8/A10 ·
//   gh-preflight: A12) — not both — because `m3_tool` is LITERALLY the pack field that names which tool
//   proves M3 for this profile (DESIGN §Q1's per-profile ladder: "m3_tool: doctor" / "m3_tool: gh-preflight").
//   A13 (branch-protection-applied) is HARD wherever `codeHost==='github'`, independent of target — a
//   `present:false` OR an `unverifiable:` A13 both block equally (never waved through; standing rule).
//
//   TP.1 FIX — the m3_tool field is singular but DESIGN §Q1 declares simple-gh-sdlc's m3_tool as a genuine
//   PER-TARGET split ("doctor(local)/gh-preflight(hosted)"), unlike self-driving's single, target-invariant
//   "gh-preflight" (self-driving's repo is truthfully GitHub-hosted on every target it ships, so gh-preflight
//   stays authoritative regardless of which target is running the scheduler — signal-sets.ts's own A12/A13
//   comment). Rather than widen the pack SCHEMA to a per-target map (a bigger, unproven cross-profile change),
//   the m3_tool='doctor' branch now falls back to A12/gh-preflight when A8 is not in this run's `applicable`
//   set (i.e. target != 'local', per TB.3's own target-driven selection) AND this profile is still
//   codeHost=github (A12 IS applicable) — exactly simple-gh-sdlc's declared dual-target intent, without
//   touching self-driving's or the local-only profiles' (simple-gh/simple-sdlc) existing, already-tested
//   behavior (A8 stays applicable — and is used — for every target THEY ship). See the M3 gate below.
//
//   A11 (local `bin/preflight.ts`) and A12 (`scripts/open-autonomy-preflight.ts`) are SOFTENED on their own
//   `doctor-unavailable:`-prefixed evidence (the script literally isn't resolvable in this deployment shape
//   — both scripts ship ONLY inside a full open-autonomy source checkout, never into a compiled install or
//   into `@volter/oa` itself; see imm-signals.ts's own `preflightBin`/`ghPreflightScript` doc: "an
//   import.meta.url-relative default... would silently resolve to nothing once actually published
//   standalone"). Softening this ONE failure mode (never a genuine exit!=0 failure, which still hard-blocks)
//   is what keeps M3 reachable for a real adopter install that never has this monorepo checked out next to
//   it — the alternative (treating "the checker isn't installed here" as a permanent M3 blocker) would make
//   M3 unreachable for every real `@volter/oa` adopter, which cannot be the intent. A8/A10 (this package's
//   OWN bundled `doctor()`) is never softened this way — a `doctor-unavailable:` there means `doctor()`
//   itself threw against a genuinely broken install, not a missing external tool.
//
//   M4 ARMED's direction-content rung reads the INSTALL's own compiled `.open-autonomy/autonomy.yml`
//   (never the source profile) for a WARN-unedited-template check mirroring TA.1's local mirror
//   (`bin/preflight.ts`'s `checkDocumentContentGate`) — re-implemented here in miniature (not imported;
//   `bin/preflight.ts` is a script, not a package export) since it is the SAME compiled artifact A3 already
//   parses. A profile that declares no `documents.roles` block (every operator-mode profile) trivially
//   passes (nothing to warn about) — exactly TB.3's own "operator mode has no REPLACE-THIS-seeded template"
//   posture, mirrored onto M4's gate instead of merely the signal-set SELECTION.
//
//   M5 RUNNING requires BOTH the fence lifted (A5) AND real, READABLE, INSTALL-SCOPED profile-agent
//   session/fire evidence — DESIGN §Q1's own caution: "the fence is lifted and a profile agent actually
//   fired (not merely 'the loop is up')". A5 alone is NEVER enough. FIX-ROUND D1 (HIGH): the naive probe
//   (`status()` -> the install's own TermfleetRunner) resolves its provider from AMBIENT
//   TERMFLEET_PROVIDER_URL or SDK auto-discovery (backend.mjs's `resolveDefaultProvider({url: process.env
//   .TERMFLEET_PROVIDER_URL})`), and its `list()` returns EVERY window on that provider unfiltered — on a
//   shared dev box that read a FOREIGN loop's sessions as this install's own M5 evidence (reproduced live:
//   a virgin M4 install reported M5/RUNNING off two sessions belonging to unrelated installs). The gate
//   must reflect the INSTALL, not the shell, so session evidence is now scoped BOTH ways:
//     (1) the probe's provider comes from the install's OWN scheduler/schedule.json
//         `env.TERMFLEET_PROVIDER_URL` pin (TG.1's durable artifact, via provider.ts's readSchedulePin —
//         the exact field doctor.ts's own provider check already consults) and NEVER from ambient env or
//         auto-discovery. No pin => session evidence = 'unknown: no install-scoped provider pin' and M5
//         blocks honestly.
//     (2) listed sessions are filtered to the agent names this install's own compiled autonomy.yml +
//         schedule.json declare — the same name-set scoping backend.mjs's reapIdle already applies ("a
//         human's own terminal or another loop's session is never touched"). A foreign session on the
//         pinned provider is cited as IGNORED, never counted as evidence.
//   The install's own durable last-fire telemetry (.open-autonomy/runner-state/last-fire/, written ONLY by
//   this install's own reconciler on an actual state-gated fire — status.ts's recordFire) is inherently
//   install-scoped and stays valid M5 evidence as-is. Everything here is read-only — this composer never
//   dispatches/launches anything to manufacture evidence (the ⛔ never-launch-agents rule).
//
//   M6 ADVANCING delegates WHOLESALE to TF.1's `missionAdvancingSignal` — this file never re-derives
//   board-specific gate/linkage logic TF.1 already owns.
//
//   extra_rungs (self-driving's `proxy-ready`/M3.p, `direction-present`/M4.d, `human-seam-wired`/M4.h — the
//   only three DESIGN names) each get a small, honest, best-effort signal implementation below (no earlier
//   track built one). A rung name this file does not recognize reports `unverifiable: no signal
//   implementation...` and BLOCKS its assumed stage (M4, the more common of the two) rather than being
//   silently waved through — forward-compatible without ever faking a pass.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { IMM_SIGNALS } from './imm-signals.ts';
import type { Signal, SignalContext } from './imm-signals.ts';
import { IMM_SIGNAL_IDS, signalSetFor } from './signal-sets.ts';
import type { InstallTarget, SignalId, SignalSetPack, SkippedSignal } from './signal-sets.ts';
import { missionAdvancingSignal } from './m6-signal.ts';
import type { MissionAdvancingContext } from './m6-signal.ts';
import { readLastFires } from './status.ts';
import { defaultSessionRunner, listSessionsBestEffort } from './sessions.ts';
import { readSchedulePin } from './provider.ts';
import { loadSchedule } from './config.ts';
import { defaultProc } from './proc.ts';
import type { ProcRunner, Session } from './types.ts';

// ============================================================================================
// Stage vocabulary (DESIGN §Q1)
// ============================================================================================

export type Stage = 'M0' | 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6';

export const STAGE_ORDER: Stage[] = ['M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6'];

export const STAGE_NAMES: Record<Stage, string> = {
  M0: 'EMPTY',
  M1: 'SCOPED',
  M2: 'SCAFFOLDED',
  M3: 'INSTALLED',
  M4: 'ARMED',
  M5: 'RUNNING',
  M6: 'ADVANCING',
};

export interface InstallSignalEntry {
  id: string;
  present: boolean;
  evidence: string;
}
export interface InstallSkipEntry {
  id: string;
  reason: string;
}

/** The `.open-autonomy/install.json` shape — deliberately NO timestamp field (deterministic; the repo
 *  convention avoids nondeterministic fields — same posture as `generated.json`/`autonomy.yml`). Key order
 *  is fixed by this interface's own declaration order + `computeMaturity`'s literal object construction,
 *  so two runs against the same install state serialize byte-identical JSON. */
export interface InstallRecord {
  stage: Stage;
  stageName: string;
  signals: InstallSignalEntry[];
  skipped: InstallSkipEntry[];
  profile: string | null;
  substrate: InstallTarget | null;
  blockers: string[];
}

export const INSTALL_JSON_REL = '.open-autonomy/install.json';

// ============================================================================================
// Pack facts — dependency-free reads off the SOURCE profile dir. See file header for why this is not
// `@open-autonomy/core`'s `getSetupPack`.
// ============================================================================================

interface RawIr {
  targets?: string[];
  codeHost?: string;
  documents?: { roles?: { vision?: string; constitution?: string; roadmap?: string } };
}
interface RawSetupPackAuthored {
  direction_spec?: { mode?: string };
  maturity_signals?: { m3_tool?: string };
  extra_rungs?: string[];
}

export interface PackInfo {
  name: string;
  pack: SignalSetPack;
}

/** Reads `<profileDir>/ir.yml` (+ optional `setup-pack.yml`) for exactly the leaf fields `signalSetFor`
 *  needs. Returns `undefined` (never throws) on a missing/unparseable `ir.yml` — every caller has a
 *  documented fallback (the universal-signals-only path, see `computeMaturity`). */
function readPack(profileDir: string): PackInfo | undefined {
  const irPath = join(profileDir, 'ir.yml');
  if (!existsSync(irPath)) return undefined;
  let ir: RawIr;
  try {
    ir = (parseYaml(readFileSync(irPath, 'utf8')) ?? {}) as RawIr;
  } catch {
    return undefined;
  }
  let authored: RawSetupPackAuthored = {};
  const authoredPath = join(profileDir, 'setup-pack.yml');
  if (existsSync(authoredPath)) {
    try {
      authored = (parseYaml(readFileSync(authoredPath, 'utf8')) ?? {}) as RawSetupPackAuthored;
    } catch {
      authored = {};
    }
  }
  const codeHost = ir.codeHost === 'github' ? 'github' : 'local-git';
  const targets = Array.isArray(ir.targets) ? ir.targets : [];
  const hasRolesBlock = !!ir.documents?.roles;
  // mirrors packages/core/src/setup-pack.ts's deriveDirectionSpec: an authored override wins; otherwise
  // ir.documents.roles's presence alone implies 'documents.roles' mode, else 'operator'.
  const rawMode = authored.direction_spec?.mode;
  const directionMode: 'none' | 'operator' | 'documents.roles' =
    rawMode === 'none' || rawMode === 'operator' || rawMode === 'documents.roles' ? rawMode : hasRolesBlock ? 'documents.roles' : 'operator';
  const m3Tool: 'doctor' | 'gh-preflight' = authored.maturity_signals?.m3_tool === 'gh-preflight' ? 'gh-preflight' : 'doctor';

  const pack: SignalSetPack = {
    codeHost,
    targets,
    direction_spec: { mode: directionMode },
    maturity_signals: { m3_tool: m3Tool },
    extra_rungs: Array.isArray(authored.extra_rungs) ? authored.extra_rungs : [],
  };
  return { name: basename(profileDir), pack };
}

// ============================================================================================
// Direction-content check (M4's direction rung + the 'direction-present' extra rung) — reads the INSTALL's
// own compiled `.open-autonomy/autonomy.yml`'s `documents.roles.{vision,constitution}` via a REAL YAML
// parse (this package already depends on `yaml` — imm-signals.ts/signal-sets.ts/m6-signal.ts/
// board-readiness.ts all use it — unlike `bin/preflight.ts`, which deliberately carries NO YAML dependency
// because it ships in the plain-`node` adopter bundle run before `bun install` even happens; that
// constraint does not apply here, so a real parse is simpler and more robust than mirroring its scoped
// regex would be).
// ============================================================================================

const UNEDITED_TEMPLATE_MARKER = 'REPLACE THIS';
const CONTENT_GATE_ROLES = ['vision', 'constitution'] as const;

interface RawAutonomyYmlDocuments {
  documents?: { roles?: Partial<Record<(typeof CONTENT_GATE_ROLES)[number], string>> };
}

/** `present:true` when EITHER this install declares no `documents.roles.{vision,constitution}` at all
 *  (operator-mode direction — nothing to warn about, matches TB.3's own posture) OR every declared role's
 *  file exists and carries no `REPLACE THIS` marker. `present:false` names each problem. */
export function directionContentSignal(installDir: string): Signal {
  const manifestPath = join(installDir, '.open-autonomy', 'autonomy.yml');
  if (!existsSync(manifestPath)) {
    return { present: false, evidence: `${manifestPath}: does not exist — cannot evaluate direction content (M2 not yet reached)` };
  }
  let doc: RawAutonomyYmlDocuments;
  try {
    doc = (parseYaml(readFileSync(manifestPath, 'utf8')) ?? {}) as RawAutonomyYmlDocuments;
  } catch (e) {
    return { present: false, evidence: `${manifestPath}: unparseable (${(e as Error).message})` };
  }
  const roles = doc.documents?.roles ?? {};
  const declared = CONTENT_GATE_ROLES.filter((r) => roles[r]);
  if (!declared.length) {
    return {
      present: true,
      evidence: `${manifestPath}: declares no documents.roles.{vision,constitution} — this profile has no direction-content rung (operator-mode direction)`,
    };
  }
  const problems: string[] = [];
  const clean: string[] = [];
  for (const role of declared) {
    const relPath = roles[role]!;
    const abs = join(installDir, relPath);
    if (!existsSync(abs)) {
      problems.push(`${relPath} (declared ${role}) does not exist`);
      continue;
    }
    const text = readFileSync(abs, 'utf8');
    if (text.includes(UNEDITED_TEMPLATE_MARKER)) {
      problems.push(`${relPath} is an unedited template (${UNEDITED_TEMPLATE_MARKER} marker present)`);
    } else {
      clean.push(relPath);
    }
  }
  if (problems.length) {
    return {
      present: false,
      evidence: `direction content NOT clean: ${problems.join('; ')}${clean.length ? ` (clean: ${clean.join(', ')})` : ''}`,
    };
  }
  return { present: true, evidence: `direction content clean: ${clean.join(', ')} exist and carry no "${UNEDITED_TEMPLATE_MARKER}" marker` };
}

// ============================================================================================
// The other two extra rungs (self-driving only, today): 'proxy-ready' (M3.p) and 'human-seam-wired' (M4.h).
// Both are best-effort, HONEST, bounded checks — never a fabricated pass. Neither is exercised by this
// unit's live acceptance (simple-sdlc ships no extra_rungs); both are exported and proven by
// maturity.test.ts's dedicated fixture suites ('extra rungs — direct signal tests' + the self-driving-like
// computeMaturity fixtures: proxy-ready-blocks-M3, human-seam-wired-gates-M4, unrecognized-rung fail-closed).
// ============================================================================================

/** M3.p — a funded, OIDC-allowlisted model proxy. This can only mechanically confirm REACHABILITY (a
 *  bounded GET, matching doctor.ts's own provider-health pattern) — it can NEVER confirm funding/allowlist
 *  status from here, so a reachable proxy is reported honestly as reachability-only, not full "ready". */
export async function proxyReadySignal(env: NodeJS.ProcessEnv, fetchImpl: typeof fetch): Promise<Signal> {
  const url = env.MODEL_PROXY_URL;
  if (!url) {
    return {
      present: false,
      evidence:
        'unverifiable: MODEL_PROXY_URL not set in env — cannot confirm a funded, OIDC-allowlisted model proxy is reachable ' +
        "(self-driving's M3.p is a deploy-and-fund sub-project, DESIGN §Q3's honest terminal-reachability note)",
    };
  }
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3000);
    const res = await fetchImpl(`${url.replace(/\/$/, '')}/healthz`, { signal: controller.signal });
    clearTimeout(t);
    return {
      present: res.ok,
      evidence: `GET ${url}/healthz -> HTTP ${res.status} (MODEL_PROXY_URL=${url}) — reachability only, NOT proof of funding/allowlist status`,
    };
  } catch (e) {
    return { present: false, evidence: `MODEL_PROXY_URL=${url} set but unreachable (GET .../healthz: ${(e as Error)?.message ?? e})` };
  }
}

/** M4.h — a provisioned `kind:human` maintainer actor + a non-empty `PUBLIC_AGENT_MAINTAINERS`. */
export function humanSeamWiredSignal(installDir: string, env: NodeJS.ProcessEnv): Signal {
  const manifestPath = join(installDir, '.open-autonomy', 'autonomy.yml');
  if (!existsSync(manifestPath)) {
    return { present: false, evidence: `${manifestPath}: does not exist — cannot check for a kind:human maintainer actor` };
  }
  const text = readFileSync(manifestPath, 'utf8');
  const hasHumanActor = /^\s+kind:\s*human\s*$/m.test(text);
  const maintainersVar = env.PUBLIC_AGENT_MAINTAINERS;
  if (!hasHumanActor) {
    return { present: false, evidence: `${manifestPath}: no agent declares "kind: human" — no maintainer actor compiled into this install` };
  }
  if (!maintainersVar || !maintainersVar.trim()) {
    return {
      present: false,
      evidence: `${manifestPath} declares a kind:human maintainer actor, but env PUBLIC_AGENT_MAINTAINERS is unset/empty — the human seam has no one to notify`,
    };
  }
  return { present: true, evidence: `${manifestPath} declares a kind:human maintainer actor, and env PUBLIC_AGENT_MAINTAINERS="${maintainersVar}" is set` };
}

/** Which stage an extra rung gates — the only three names DESIGN §Q1 ships today (self-driving). An
 *  unrecognized rung is assumed the more common M4 for blocker-naming purposes (see `evaluateExtraRung`). */
const RUNG_STAGE: Record<string, Stage> = {
  'proxy-ready': 'M3',
  'direction-present': 'M4',
  'human-seam-wired': 'M4',
};

function rungStage(id: string): Stage {
  return RUNG_STAGE[id] ?? 'M4';
}

export async function evaluateExtraRung(id: string, installDir: string, env: NodeJS.ProcessEnv, fetchImpl: typeof fetch): Promise<Signal> {
  if (id === 'proxy-ready') return proxyReadySignal(env, fetchImpl);
  if (id === 'direction-present') return directionContentSignal(installDir);
  if (id === 'human-seam-wired') return humanSeamWiredSignal(installDir, env);
  return {
    present: false,
    evidence: `unverifiable: no signal implementation for extra rung "${id}" — TB.2 recognizes proxy-ready/direction-present/human-seam-wired only; a newly declared rung needs a composer update before it can gate anything`,
  };
}

/** A11/A12 both prefix `doctor-unavailable:` when the EXTERNAL checker script itself cannot be resolved in
 *  this deployment shape (see this file's header for why that must not permanently block M3 for a real
 *  adopter install). A genuine `present:false` that RAN and failed is never softened. */
function softOk(s: Signal): boolean {
  return s.present || /^doctor-unavailable:/.test(s.evidence);
}

// ============================================================================================
// M5 session evidence — INSTALL-SCOPED (fix-round D1, HIGH). See this file's header for the full failure
// story. Two scoping rules, both mandatory:
//   (1) the provider comes from the install's OWN scheduler/schedule.json env.TERMFLEET_PROVIDER_URL pin
//       (readSchedulePin — TG.1's durable artifact), never from ambient env or SDK auto-discovery;
//   (2) sessions count as evidence only when their `agent` (window name) is one this install's own compiled
//       autonomy.yml/schedule.json declares — backend.mjs reapIdle's own name-set scoping precedent.
// ============================================================================================

/** The injectable probe seam (tests): given the install dir + its OWN pinned provider URL, return that
 *  provider's live sessions (null = probe unavailable). Only ever CALLED when a pin exists — an unpinned
 *  install's session evidence is 'unknown' without any probe. */
export type SessionProbe = (cwd: string, pinnedProviderUrl: string) => Promise<Session[] | null>;

/** Default probe: drive the install's own vendored runner (scripts/autonomy-runner.mjs's TermfleetRunner)
 *  exactly the way `oa status` does, but with TERMFLEET_PROVIDER_URL FORCED to the install's schedule pin
 *  for the probe's duration — the runner's backend reads `process.env.TERMFLEET_PROVIDER_URL` lazily on its
 *  first list() (backend.mjs's #client()), so pinning the env var around the call is the ONE seam that
 *  reaches both its SDK path and listSessionsBestEffort's `node scripts/autonomy-runner.mjs list` CLI
 *  fallback (a subprocess inherits the same env). AUTONOMY_PROVIDER_URL_SOURCE='schedule' keeps the
 *  backend's own OA-09 provenance log line truthful about where the URL came from. Restored in `finally`. */
async function defaultInstallScopedSessionProbe(cwd: string, pinnedProviderUrl: string): Promise<Session[] | null> {
  const savedUrl = process.env.TERMFLEET_PROVIDER_URL;
  const savedSource = process.env.AUTONOMY_PROVIDER_URL_SOURCE;
  process.env.TERMFLEET_PROVIDER_URL = pinnedProviderUrl;
  process.env.AUTONOMY_PROVIDER_URL_SOURCE = 'schedule';
  try {
    const runner = await defaultSessionRunner(cwd);
    return await listSessionsBestEffort(cwd, runner);
  } finally {
    if (savedUrl === undefined) delete process.env.TERMFLEET_PROVIDER_URL;
    else process.env.TERMFLEET_PROVIDER_URL = savedUrl;
    if (savedSource === undefined) delete process.env.AUTONOMY_PROVIDER_URL_SOURCE;
    else process.env.AUTONOMY_PROVIDER_URL_SOURCE = savedSource;
  }
}

/** The agent names THIS install declares — the union of the compiled autonomy.yml's `agents:` keys and the
 *  schedule.json script identities (AUTONOMY_AGENT=<name> / explicit `agent:` keys, via loadSchedule). A
 *  session whose window name is not in this set belongs to some OTHER loop/human on the same provider. */
export function declaredAgentNames(cwd: string): Set<string> {
  const names = new Set<string>();
  const manifestPath = join(cwd, '.open-autonomy', 'autonomy.yml');
  if (existsSync(manifestPath)) {
    try {
      const doc = (parseYaml(readFileSync(manifestPath, 'utf8')) ?? {}) as { agents?: Record<string, unknown> };
      for (const name of Object.keys(doc.agents ?? {})) names.add(name);
    } catch {
      /* an unreadable manifest is A3's finding, not this helper's */
    }
  }
  try {
    for (const s of loadSchedule(cwd).scripts) if (s.agent) names.add(s.agent);
  } catch {
    /* a missing/invalid schedule is A8/A10's finding, not this helper's */
  }
  return names;
}

interface SessionEvidence {
  ok: boolean;
  note: string;
}

async function installScopedSessionEvidence(cwd: string, probe: SessionProbe): Promise<SessionEvidence> {
  const pin = readSchedulePin(cwd);
  if (!pin) {
    return {
      ok: false,
      note:
        'sessions unknown: no install-scoped provider pin (scheduler/schedule.json env.TERMFLEET_PROVIDER_URL unset) — ' +
        'ambient TERMFLEET_PROVIDER_URL / SDK auto-discovery are deliberately NOT consulted (the M5 gate reflects the install, not the shell; run `oa provider up` to pin one)',
    };
  }
  let sessions: Session[] | null;
  try {
    sessions = await probe(cwd, pin);
  } catch (e) {
    return { ok: false, note: `sessions unknown: probe threw against pinned ${pin} (${(e as Error)?.message ?? e})` };
  }
  if (sessions === null) {
    return { ok: false, note: `sessions unknown: probe unavailable against pinned ${pin} (is the runner installed / the pinned provider up?)` };
  }
  const declared = declaredAgentNames(cwd);
  const own = sessions.filter((s) => declared.has(s.agent));
  const foreignCount = sessions.length - own.length;
  const declaredList = [...declared].sort().join(', ') || '(none declared)';
  const foreignNote = foreignCount > 0 ? `; ${foreignCount} foreign session(s) on the same provider IGNORED (window name not one of this install's declared agents [${declaredList}])` : '';
  if (own.length > 0) {
    return {
      ok: true,
      note: `${own.length} live session(s) on this install's pinned provider ${pin} belong to its own declared agents: ${own.map((s) => `${s.agent}:${s.status}`).join(', ')}${foreignNote}`,
    };
  }
  return { ok: false, note: `0 of ${sessions.length} live session(s) on pinned ${pin} belong to this install's declared agents [${declaredList}]${foreignNote}` };
}

// ============================================================================================
// install.json read/write
// ============================================================================================

interface PriorInstallRecord {
  profile?: string | null;
  substrate?: string | null;
}

function readPriorInstallJson(cwd: string): PriorInstallRecord | undefined {
  const p = join(cwd, INSTALL_JSON_REL);
  if (!existsSync(p)) return undefined;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as PriorInstallRecord;
  } catch {
    return undefined;
  }
}

function writeInstallJson(cwd: string, record: InstallRecord): void {
  const dir = join(cwd, '.open-autonomy');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'install.json'), `${JSON.stringify(record, null, 2)}\n`);
}

// ============================================================================================
// computeMaturity — the composer
// ============================================================================================

export interface MaturityOptions {
  cwd?: string;
  /** the SOURCE profile directory (e.g. `profiles/simple-sdlc`) — supplies the SignalSetPack + is passed
   *  through to A13/A14/TF.1's own `profileDir` context exactly as they already document. */
  profileDir?: string;
  /** explicit profile-name override (e.g. when `profileDir` isn't available but the operator still wants
   *  to RECORD a choice for M1 purposes) — `profileDir`'s own basename wins when both are supplied. */
  profile?: string;
  target?: InstallTarget;
  proc?: ProcRunner;
  env?: NodeJS.ProcessEnv;
  /** A8/A10 doctor's live provider probe — default true, see imm-signals.ts's own `live` doc. */
  live?: boolean;
  fetchImpl?: typeof fetch;
  repo?: string;
  actor?: string;
  workItemId?: string;
  scanLimit?: number;
  preflightBin?: string;
  ghPreflightScript?: string;
  /** default true — set false only when a caller wants a pure computation with no filesystem write
   *  (e.g. a future dry-run flag; every unit test that asserts `install.json` shape leaves this at its
   *  default so the write path itself is exercised). */
  write?: boolean;
  /** injectable M5 session-probe seam (tests) — see `SessionProbe`. Defaults to the real install-scoped
   *  probe (the install's own runner, forced onto its own schedule.json provider pin). Only ever called
   *  when a pin exists. */
  sessionProbe?: SessionProbe;
}

export async function computeMaturity(opts: MaturityOptions = {}): Promise<InstallRecord> {
  const cwd = opts.cwd ?? process.cwd();
  const proc = opts.proc ?? defaultProc;
  const env = opts.env ?? process.env;
  const live = opts.live ?? true;
  const fetchImpl = opts.fetchImpl ?? fetch;

  // Read the PRIOR record before this run's write overwrites it — the M1 "a choice was already recorded"
  // artifact (see file header).
  const priorRecord = readPriorInstallJson(cwd);

  const packInfo = opts.profileDir ? readPack(opts.profileDir) : undefined;
  const profileName: string | null = packInfo?.name ?? opts.profile ?? priorRecord?.profile ?? null;

  let target: InstallTarget;
  if (opts.target) target = opts.target;
  else if (packInfo?.pack.targets.includes('local')) target = 'local';
  else if (packInfo?.pack.targets[0]) target = packInfo.pack.targets[0] as InstallTarget;
  else target = (priorRecord?.substrate as InstallTarget | undefined) ?? 'local';
  const substrateKnown = !!packInfo || !!opts.target || priorRecord?.substrate != null;

  // --- signal-set SELECTION (TB.3) --------------------------------------------------------------------
  let applicable: SignalId[];
  let skipped: SkippedSignal[];
  if (packInfo) {
    try {
      const set = signalSetFor(packInfo.pack, target);
      applicable = set.applicable;
      skipped = set.skipped;
    } catch (e) {
      applicable = [...IMM_SIGNAL_IDS];
      skipped = [{ id: '(signal-set)', reason: `signalSetFor threw (${(e as Error).message}) — falling back to the full numbered signal set` }];
    }
  } else {
    applicable = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A11', 'A14'];
    skipped = [
      {
        id: '(profile-specific)',
        reason: "no --profile-dir supplied — cannot resolve this profile's SignalSetPack (m3_tool/codeHost/extra_rungs unknown); only the universal signal set was evaluated",
      },
    ];
  }

  // --- run every applicable numbered TB.1 signal ---------------------------------------------------
  const ctx: SignalContext = { proc, env, live, fetchImpl };
  if (opts.profileDir) ctx.profileDir = opts.profileDir;
  if (opts.repo) ctx.repo = opts.repo;
  if (opts.actor) ctx.actor = opts.actor;
  if (opts.preflightBin) ctx.preflightBin = opts.preflightBin;
  if (opts.ghPreflightScript) ctx.ghPreflightScript = opts.ghPreflightScript;

  const signalMap = new Map<string, Signal>();
  for (const id of applicable) {
    if (id in IMM_SIGNALS) {
      const fn = IMM_SIGNALS[id as keyof typeof IMM_SIGNALS];
      signalMap.set(id, await fn(cwd, ctx));
    } else {
      signalMap.set(id, await evaluateExtraRung(id, cwd, env, fetchImpl));
    }
  }
  const sig = (id: string): Signal => signalMap.get(id) ?? { present: false, evidence: `'${id}' was not evaluated (not in this profile's applicable signal set)` };

  // Direction content is evaluated as its OWN entry regardless of whether 'direction-present' happens to be
  // one of this profile's extra_rungs — M4's direction requirement holds on ANY documents.roles profile,
  // not only the one profile that also ships that exact rung name (self-driving).
  const directionSignal = directionContentSignal(cwd);

  // --- M6 (TF.1, delegated wholesale) ---------------------------------------------------------------
  const m6Ctx: MissionAdvancingContext = { proc, env };
  if (opts.profileDir) m6Ctx.profileDir = opts.profileDir;
  if (opts.repo) m6Ctx.repo = opts.repo;
  if (opts.workItemId) m6Ctx.workItemId = opts.workItemId;
  if (opts.scanLimit) m6Ctx.scanLimit = opts.scanLimit;
  const m6Signal = await missionAdvancingSignal(cwd, m6Ctx);

  // --- M5 session evidence (INSTALL-SCOPED, fix-round D1 — read-only, never dispatches anything). Two
  // independent legs: (a) live sessions belonging to this install's own declared agents on ITS OWN pinned
  // provider (never ambient, never a foreign loop's windows — see installScopedSessionEvidence's header);
  // (b) the install's own durable last-fire telemetry, written only by this install's reconciler.
  const fireCount = readLastFires(cwd).length;
  const sessionEvidence = await installScopedSessionEvidence(cwd, opts.sessionProbe ?? defaultInstallScopedSessionProbe);
  const sessionEvidenceOk = sessionEvidence.ok || fireCount > 0;
  const sessionEvidenceNote = `${sessionEvidence.note}; install-scoped last-fire records=${fireCount}`;

  // ============================================================================================
  // Stage composition (cumulative walk — see file header for the rationale behind each gate).
  // ============================================================================================
  const stageChecks: Array<{ stage: Stage; ok: boolean; reasons: string[] }> = [];

  // M1 — SCOPED
  stageChecks.push({
    stage: 'M1',
    ok: profileName !== null,
    reasons: profileName === null ? ['no profile/substrate choice recorded — pass --profile-dir (or --profile) to record one'] : [],
  });

  // M2 — SCAFFOLDED: manifest + parse valid (A1/A2/A3). A4 is cited as supporting evidence only, never gated.
  {
    const a1 = sig('A1');
    const a2 = sig('A2');
    const a3 = sig('A3');
    const reasons: string[] = [];
    if (!a1.present) reasons.push(`A1 generated.json invalid: ${a1.evidence}`);
    if (!a2.present) reasons.push(`A2 compile-shape invalid: ${a2.evidence}`);
    if (!a3.present) reasons.push(`A3 autonomy.yml invalid: ${a3.evidence}`);
    stageChecks.push({ stage: 'M2', ok: a1.present && a2.present && a3.present, reasons });
  }

  // M3 — INSTALLED: harness committed (A6) + local preflight (A11, softened on doctor-unavailable) + this
  // profile's designated m3_tool signal + A13 HARD wherever codeHost=github + any M3-gating extra rung.
  {
    const a6 = sig('A6');
    const a11 = sig('A11');
    const reasons: string[] = [];
    if (!a6.present) reasons.push(`A6 harness not committed: ${a6.evidence}`);
    const a11Ok = softOk(a11);
    if (!a11Ok) reasons.push(`A11 local preflight failed: ${a11.evidence}`);

    let m3ToolOk: boolean;
    if (!packInfo) {
      m3ToolOk = false;
      reasons.push("no --profile-dir supplied — cannot resolve this profile's m3_tool (doctor vs gh-preflight)");
    } else if (packInfo.pack.maturity_signals.m3_tool === 'gh-preflight') {
      // TARGET-INVARIANT: this profile's pack names gh-preflight as its ONE authoritative M3 proof on
      // every target it ships (self-driving's posture — its repo is genuinely GitHub-hosted truth-wise
      // even when the `local` target just controls where the scheduler loop runs, DESIGN §Q1/§Q2's "no
      // hosted doctor... proven by gh-preflight" — signal-sets.ts's own A12/A13 comment: "the repo is
      // still hosted on GitHub... even when the scheduler happens to run on the operator's own machine").
      const a12 = sig('A12');
      m3ToolOk = softOk(a12);
      if (!m3ToolOk) reasons.push(`A12 (m3_tool=gh-preflight) failed: ${a12.evidence}`);
    } else {
      // TARGET-AWARE FALLBACK (TP.1 fix — simple-gh-sdlc's own DESIGN §Q1 line: "m3_tool: doctor(local)/
      // gh-preflight(hosted)", a genuine PER-TARGET split unlike self-driving's single always-gh-preflight
      // value). The pack schema carries exactly ONE `m3_tool` slot (never a per-target map — see
      // packages/core/src/setup-pack.ts's `M3Tool` union), so 'doctor' names this profile's PRIMARY/local
      // tool; when the CURRENT run's target has no local process to probe (TB.3's signalSetFor already
      // excludes A8/A10 from `applicable` whenever target !== 'local' — 'A8' simply will not be in
      // `applicable` here), fall back to A12/gh-preflight whenever this profile is still codeHost=github
      // (i.e. 'A12' IS in `applicable`) rather than reporting an unconditional, permanently-unreachable M3
      // block on every hosted run of a dual-target, m3_tool=doctor profile. On a target that has NEITHER
      // (a local-git profile like simple-sdlc/simple-gh, which only ever ships `targets: [local]`) 'A8' is
      // always applicable, so this fallback branch is never reached for them — no behavior change.
      const a8Applicable = applicable.includes('A8');
      if (a8Applicable) {
        const a8 = sig('A8');
        m3ToolOk = a8.present;
        if (!m3ToolOk) reasons.push(`A8/A10 (m3_tool=doctor) failed: ${a8.evidence}`);
      } else if (applicable.includes('A12')) {
        const a12 = sig('A12');
        m3ToolOk = softOk(a12);
        if (!m3ToolOk) reasons.push(`A12 (m3_tool=doctor, target has no local process — falling back to gh-preflight since codeHost=github) failed: ${a12.evidence}`);
      } else {
        const a8 = sig('A8');
        m3ToolOk = false;
        reasons.push(`A8/A10 (m3_tool=doctor) not applicable for this target and no gh-preflight fallback available (codeHost != github): ${a8.evidence}`);
      }
    }

    let a13Ok = true;
    if (packInfo?.pack.codeHost === 'github') {
      const a13 = sig('A13');
      a13Ok = a13.present;
      if (!a13.present) reasons.push(`A13 branch-protection HARD signal failed: ${a13.evidence}`);
    }

    let extraOk = true;
    for (const rung of applicable.filter((id) => !(id in IMM_SIGNALS) && rungStage(id) === 'M3')) {
      const s = sig(rung);
      if (!s.present) {
        extraOk = false;
        reasons.push(`extra rung '${rung}' (M3) failed: ${s.evidence}`);
      }
    }
    stageChecks.push({ stage: 'M3', ok: a6.present && a11Ok && m3ToolOk && a13Ok && extraOk, reasons });
  }

  // M4 — ARMED: board has dispatchable work (A14) + direction content clean (any documents.roles profile)
  // + any M4-gating extra rung.
  {
    const a14 = sig('A14');
    const reasons: string[] = [];
    if (!a14.present) reasons.push(`A14 board has no dispatchable work: ${a14.evidence}`);
    if (!directionSignal.present) reasons.push(`direction content: ${directionSignal.evidence}`);

    let extraOk = true;
    for (const rung of applicable.filter((id) => !(id in IMM_SIGNALS) && rungStage(id) === 'M4')) {
      const s = sig(rung);
      if (!s.present) {
        extraOk = false;
        reasons.push(`extra rung '${rung}' (M4) failed: ${s.evidence}`);
      }
    }
    stageChecks.push({ stage: 'M4', ok: a14.present && directionSignal.present && extraOk, reasons });
  }

  // M5 — RUNNING: fence lifted (A5) AND real, readable session/fire evidence — DESIGN §Q1's own caution.
  {
    const a5 = sig('A5');
    const reasons: string[] = [];
    if (!a5.present) reasons.push(`A5 fence not lifted: ${a5.evidence}`);
    if (!sessionEvidenceOk) {
      reasons.push(
        `no real profile-agent session/fire evidence found (${sessionEvidenceNote}) — DESIGN §Q1 M5 requires a profile agent to have actually fired, not merely an unpaused fence`,
      );
    }
    stageChecks.push({ stage: 'M5', ok: a5.present && sessionEvidenceOk, reasons });
  }

  // M6 — ADVANCING: TF.1's own signal, delegated wholesale.
  stageChecks.push({ stage: 'M6', ok: m6Signal.present, reasons: m6Signal.present ? [] : [`M6 signal: ${m6Signal.evidence}`] });

  let verdict: Stage = 'M0';
  let blockers: string[] = [];
  for (const c of stageChecks) {
    if (c.ok) {
      verdict = c.stage;
      continue;
    }
    blockers = [`${c.stage} blocked: ${c.reasons.join('; ')}`];
    break;
  }

  // --- assemble the durable record (stable key order + id-sorted arrays for determinism) -----------
  const signalsOut: InstallSignalEntry[] = [...signalMap.entries()].map(([id, s]) => ({ id, present: s.present, evidence: s.evidence }));
  signalsOut.push({ id: 'M4-direction', present: directionSignal.present, evidence: directionSignal.evidence });
  signalsOut.push({ id: 'M6', present: m6Signal.present, evidence: m6Signal.evidence });
  signalsOut.sort((a, b) => a.id.localeCompare(b.id));

  const skippedOut: InstallSkipEntry[] = skipped.map((s) => ({ id: s.id, reason: s.reason })).sort((a, b) => a.id.localeCompare(b.id));

  const record: InstallRecord = {
    stage: verdict,
    stageName: STAGE_NAMES[verdict],
    signals: signalsOut,
    skipped: skippedOut,
    profile: profileName,
    substrate: substrateKnown ? target : null,
    blockers,
  };

  if (opts.write !== false) writeInstallJson(cwd, record);
  return record;
}
