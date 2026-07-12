#!/usr/bin/env node
// world-smoke.mjs — the up-front SMOKE gate for the evidence environment.
//
// PROBLEM this closes: the develop skill only discovers whether the mock/world/Playwright
// environment works reactively, inside each issue's §Baseline. That means it can't tell
// "feature genuinely absent" apart from "environment broken", and its evidence is
// untrustworthy if the mocks are subtly broken (e.g. an unmodeled vendor op, a leaking
// "sealed" world, a dead capture pipeline). This script proves the WHOLE evidence chain
// end-to-end, once, up front — boot -> egress seal -> seed -> mock coverage -> Playwright
// capture -> evidence-adapter dry-run -> teardown — before any development is attempted.
//
// Contract: NON-MUTATING. No git commits, no tracker writes, no changes to any tracked
// file. Self-contained: boots its OWN world (a distinct instance name, see BOOT below) and
// tears it down itself, even on failure. Safe to run next to an already-running dev world.
//
// Usage: node scripts/world-smoke.mjs   (wired as `npm run smoke`)
//
// Exit 0 + "SMOKE: PASS" iff every stage passes. Exit 1 + "SMOKE: FAIL (stage N: <reason>)"
// on the first stage that fails (stages run in order; we do not keep going after a failure,
// except teardown, which always runs).
//
// ADOPTING THIS SCRIPT (this profile scaffolds structure; the app/world topology below is
// the adopter's to fill in — see README.md's "Adopting this profile"):
//   - SMOKE_WORLD_INSTANCE (env, default "combo-dev") — the world instance name your
//     develop/reviewer skills boot for §Baseline/§DryRun; only used in a log line here.
//   - SMOKE_SOURCE_FILES (env, comma-separated, default below under SOURCE_FILES) — the
//     app/script source files stage 4's vendor-import scan reads by name (in addition to a
//     repo-wide `git ls-files` scan, which still catches anything not listed here).
//   - SMOKE_CANONICAL_VISUAL_STATE (env, default below under CANONICAL_VISUAL_STATE) — the
//     one visual-edit playwright-visual-state script stage 5 replays as the canonical
//     capture proving the Playwright/screenshot pipeline itself works.
//   - The stage-4 op-level probe (deriveStripeOps/probeScript below) is ONE worked example —
//     a live op-probe against the Stripe twin, wired because Stripe is a common vendor. It is
//     entirely gated behind `usedVendors.has('stripe')` (stage 4 pass 2) and is a no-op for an
//     app that never imports 'stripe'. VENDOR_REGISTRY-based vendor COVERAGE (pass 1: "does
//     every external the app imports have a configured twin?") is fully generic and vendor-
//     agnostic already; per-op PROBING for a vendor other than Stripe is a template to extend
//     (add a probe strategy alongside the Stripe one) rather than something this profile ships
//     pre-built for every possible vendor.

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VOLTER_WORLD = path.join(ROOT, 'node_modules/.bin/volter-world');
const WORLD_CONFIG = path.join(ROOT, 'world.config.json');
const WORLD_ENV_FILE = path.join(ROOT, '.volter/world.env');

// Distinct instance name so `npm run smoke` never clobbers a developer's already-running dev
// world (the develop skill's §Baseline/§DryRun world — SMOKE_WORLD_INSTANCE below names it
// for the log line only). Fully self-contained: booted and torn down within this process.
const WORLD_NAME = process.env.SMOKE_WORLD_NAME || 'smoke-gate';
const DEV_WORLD_INSTANCE = process.env.SMOKE_WORLD_INSTANCE || 'combo-dev';

const STAGE_NAMES = [
  'Boot sealed',
  'Sealed-egress negative test',
  'Seed',
  'Mock-coverage probe',
  'Canonical Playwright capture',
  'Evidence pipeline dry-run',
  'Teardown',
];

let currentStage = 0;
const startedAt = Date.now();
let worldBooted = false;
let tempOutDir = null;

function log(line) {
  process.stdout.write(`${line}\n`);
}

function pass(stageIdx, detail) {
  log(`PASS  stage ${stageIdx + 1}/${STAGE_NAMES.length} ${STAGE_NAMES[stageIdx]}${detail ? ` — ${detail}` : ''}`);
}

async function fail(stageIdx, reason) {
  log(`FAIL  stage ${stageIdx + 1}/${STAGE_NAMES.length} ${STAGE_NAMES[stageIdx]} — ${reason}`);
  await teardown(stageIdx === STAGE_NAMES.length - 1);
  log('');
  log(`SMOKE: FAIL (stage ${stageIdx + 1}: ${STAGE_NAMES[stageIdx]} — ${reason})`);
  process.exit(1);
}

function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', ...opts });
}

function envFrom(base, extra) {
  return { ...base, ...extra };
}

// Run a command "inside the world env": `volter-world env <name> -- <cmd...>`.
function worldExec(args, opts = {}) {
  return sh(VOLTER_WORLD, ['env', WORLD_NAME, '--', ...args], opts);
}

async function teardown(alreadyAtTeardownStage) {
  if (!worldBooted) return;
  currentStage = STAGE_NAMES.length - 1; // Teardown
  const down = sh(VOLTER_WORLD, ['down', WORLD_NAME, '--purge']);
  worldBooted = false;
  if (tempOutDir && fs.existsSync(tempOutDir)) {
    fs.rmSync(tempOutDir, { recursive: true, force: true });
    tempOutDir = null;
  }
  if (down.status !== 0) {
    log(`FAIL  stage ${STAGE_NAMES.length}/${STAGE_NAMES.length} Teardown — volter-world down exited ${down.status}: ${(down.stderr || down.stdout || '').trim()}`);
    if (!alreadyAtTeardownStage) {
      // Teardown failing after some other stage failed is a secondary problem; surface it but
      // keep the ORIGINAL failure as the reported cause via the caller's own fail() message.
    }
    return false;
  }
  pass(STAGE_NAMES.length - 1, (down.stdout || '').trim().split('\n').filter(Boolean).pop());
  return true;
}

// ---------------------------------------------------------------------------
// Stage 1: Boot sealed + doctor
// ---------------------------------------------------------------------------
async function stageBoot() {
  currentStage = 0;
  if (!fs.existsSync(VOLTER_WORLD)) {
    await fail(0, `volter-world CLI not found at ${VOLTER_WORLD} — run npm ci first`);
  }
  // NOTE: --env-file is an OUTPUT path (volter-world up writes the booted instance's env
  // there), not a required pre-existing input — it does not need to exist beforehand, and
  // in a fresh clone / CI checkout it won't (.volter/world.env is gitignored local state).

  // Outer wall-clock budget for the WHOLE boot, derived from world.config.json's own declared
  // per-service readiness timeouts (see deriveWorldBootTimeoutMs) — NOT a hardcoded literal. A
  // hardcoded number here can silently be tighter than what the config itself declares
  // acceptable, in which case spawnSync's `timeout` SIGTERMs `volter-world up` with no readiness-
  // probe diagnostic at all (opaque `volter-world up exited null:`), even though no service had
  // actually failed and the boot was still within its own declared allowance.
  let bootTimeoutMs = MIN_BOOT_TIMEOUT_MS;
  try {
    bootTimeoutMs = deriveWorldBootTimeoutMs(JSON.parse(fs.readFileSync(WORLD_CONFIG, 'utf8')));
  } catch (e) {
    log(`WARN  stage 1: could not derive a config-based boot timeout from ${WORLD_CONFIG} (${e.message}) — falling back to ${MIN_BOOT_TIMEOUT_MS}ms floor`);
  }
  const up = sh(VOLTER_WORLD, ['up', WORLD_CONFIG, '--env-file', WORLD_ENV_FILE, '--mode', 'sealed', '--name', WORLD_NAME], { timeout: bootTimeoutMs });
  if (up.status !== 0) {
    await fail(0, `volter-world up exited ${up.status}: ${(up.stderr || up.stdout || '').trim()}${up.signal === 'SIGTERM' ? ` (killed by outer ${bootTimeoutMs}ms boot-timeout wrapper — see deriveWorldBootTimeoutMs; if this fires with no per-service readiness message, world.config.json's declared timeouts may need revisiting, not this wrapper)` : ''}`);
  }
  worldBooted = true;

  const doctor = sh(VOLTER_WORLD, ['doctor', WORLD_NAME, '--json']);
  let report;
  try {
    report = JSON.parse(doctor.stdout);
  } catch {
    await fail(0, `volter-world doctor did not return parseable JSON: ${(doctor.stdout || doctor.stderr || '').trim()}`);
  }
  if (!report.ok) {
    const down = (report.checks || []).filter((c) => !c.ok).map((c) => `${c.id} (${c.message})`);
    await fail(0, `doctor reports unhealthy: ${down.join(', ') || 'unknown check(s) failed'}`);
  }
  // Default (3) matches this profile's own scaffolding template (a twin + api + web); override
  // with SMOKE_MIN_SERVICES for a world.config.json with a different topology.
  const minServices = Number(process.env.SMOKE_MIN_SERVICES || 3);
  const services = (report.checks || []).filter((c) => /^service:.+:tcp$/.test(c.id));
  if (services.length < minServices) {
    await fail(0, `doctor only reports ${services.length}/${minServices} expected services healthy — checks: ${JSON.stringify(report.checks)}`);
  }
  pass(0, `all ${services.length} services healthy (${services.map((s) => s.id.split(':')[1]).join(', ')})`);
}

// ---------------------------------------------------------------------------
// Stage 2: Sealed-egress negative test
// ---------------------------------------------------------------------------
async function stageEgress() {
  currentStage = 1;
  const probe = `
    fetch("https://example.com").then(() => {
      console.log("EGRESS_LEAK");
      process.exit(0);
    }).catch((e) => {
      console.log("EGRESS_BLOCKED:" + e.message);
      process.exit(0);
    });
  `;
  const res = worldExec(['node', '-e', probe], { timeout: 20_000 });
  const out = (res.stdout || '').trim();
  if (res.status !== 0 && !out.includes('EGRESS_BLOCKED') && !out.includes('EGRESS_LEAK')) {
    await fail(1, `probe process failed to run: exit ${res.status}: ${(res.stderr || '').trim()}`);
  }
  if (out.includes('EGRESS_LEAK')) {
    await fail(1, `LEAK — a real external fetch to https://example.com SUCCEEDED from inside the sealed world. A leaking "sealed" world is worse than none: the twin-inject strict-egress guard is not refusing untwinned hosts. Check VOLTER_TWIN_STRICT_EGRESS and node:http/https/fetch patching in @volter/twin/inject.cjs.`);
  }
  if (!out.includes('EGRESS_BLOCKED')) {
    await fail(1, `probe produced neither EGRESS_BLOCKED nor EGRESS_LEAK — unexpected output: ${out} / stderr: ${(res.stderr || '').trim()}`);
  }
  const blockedMsg = out.slice(out.indexOf('EGRESS_BLOCKED:') + 'EGRESS_BLOCKED:'.length);
  if (!/blocked untwinned external/i.test(blockedMsg)) {
    await fail(1, `fetch was rejected, but not with the expected strict-egress refusal message (expected "blocked untwinned external ..."): got "${blockedMsg}"`);
  }
  pass(1, `external fetch correctly refused: ${blockedMsg}`);
}

// ---------------------------------------------------------------------------
// Stage 3: Seed (+ idempotency)
// ---------------------------------------------------------------------------
async function stageSeed() {
  currentStage = 2;
  const first = worldExec(['node', 'scripts/seed-world.mjs'], { timeout: 30_000 });
  if (first.status !== 0) {
    await fail(2, `first seed run failed (exit ${first.status}): ${(first.stderr || first.stdout || '').trim()}`);
  }
  const second = worldExec(['node', 'scripts/seed-world.mjs'], { timeout: 30_000 });
  if (second.status !== 0) {
    await fail(2, `seed is NOT idempotent — re-running it failed (exit ${second.status}): ${(second.stderr || second.stdout || '').trim()}`);
  }
  if (!/already seeded/i.test(second.stdout || '')) {
    await fail(2, `seed re-run exited 0 but did not report "already seeded, skipping" — cannot confirm idempotency (stdout: ${(second.stdout || '').trim()})`);
  }
  pass(2, 'seed succeeded and re-run is a confirmed no-op');
}

// ---------------------------------------------------------------------------
// Stage 4: Mock-coverage probe
// ---------------------------------------------------------------------------
// GENERALIZED, twin-config + source driven. This stage used to only know about Stripe
// (a hand-picked `stripe.<resource>.<method>(` regex). That meant if the app ever grew a
// call to some OTHER external (e.g. `@slack/web-api` chat.postMessage) with no twin
// configured, smoke would say nothing — the gap would only surface later when the sealed
// world's strict-egress guard blocked the real call at runtime (or worse, didn't).
//
// The check now runs in two passes:
//   1. VENDOR COVERAGE: derive the set of vendor SDKs the app source actually imports/uses
//      (VENDOR_REGISTRY covers known SDKs by import specifier; a generic `@scope/name`
//      heuristic catches anything else scoped-package-shaped), and derive the set of
//      vendors CONFIGURED as a twin in world.config.json (services with type: "twin"; the
//      vendor is read off `injectEnv`/`command`/`id`). Any vendor the app imports with NO
//      configured twin is a hard stage-4 FAIL naming the vendor.
//   2. OP COVERAGE (per configured vendor, where a probe strategy exists): for Stripe,
//      keep the existing `stripe.<resource>.<method>(` derivation + live op-probe against
//      the twin. Vendors with a configured twin but no per-op probe strategy still pass
//      vendor coverage (twin present and reachable) but are noted as op-coverage-unverified
//      rather than silently declared fully modeled.
// Default names an adopter using this profile's own scaffolding template would have; override
// with SMOKE_SOURCE_FILES (comma-separated) once your app's real layout differs. A repo-wide
// `git ls-files` scan (deriveUsedVendors, below) still catches vendor imports outside this list
// — SOURCE_FILES only additionally gates the Stripe-specific op-derivation (deriveStripeOps),
// which needs a fixed, named file set to parse rather than a repo-wide heuristic.
const SOURCE_FILES = (process.env.SMOKE_SOURCE_FILES
  ? process.env.SMOKE_SOURCE_FILES.split(',').map((s) => s.trim()).filter(Boolean)
  : ['apps/api/server.mjs', 'apps/web/src/App.tsx', 'apps/web/src/main.tsx', 'scripts/seed-world.mjs']);
const CALL_RE = /stripe\.([a-zA-Z_]+)\.([a-zA-Z_]+)\(/g;
const KNOWN_CROSS_CHECK = [
  'products.list', 'prices.list', 'subscriptions.list', 'subscriptions.cancel',
  'products.create', 'prices.create', 'customers.create', 'subscriptions.create',
];

// Known vendor SDK registry: vendor name -> how to recognize its import in source.
// `packages` are the npm import specifiers (as they'd appear in `from '...'` / `require('...')`).
// This is intentionally a small, explicit list of SDKs we know how to name — NOT the only
// detection mechanism: GENERIC_SCOPED_PACKAGE_RE / GENERIC_BARE_PACKAGE_RE below catch any
// other vendor-shaped import so a brand-new SDK this list doesn't yet know about still gets
// flagged (by its package name) rather than silently passing. Includes common BARE-named
// (non-`@scope/`) vendor SDKs explicitly, since the generic scoped-package fallback alone
// cannot see those (see GENERIC_BARE_PACKAGE_RE's own comment for why that gap mattered).
const VENDOR_REGISTRY = {
  stripe: { packages: ['stripe'] },
  slack: { packages: ['@slack/web-api'] },
  linear: { packages: ['@linear/sdk'] },
  jira: { packages: ['jira.js'] },
  github: { packages: ['@octokit/rest'] },
  twilio: { packages: ['twilio'] },
  openai: { packages: ['openai'] },
  resend: { packages: ['resend'] },
  anthropic: { packages: ['@anthropic-ai/sdk'] },
  sendgrid: { packages: ['@sendgrid/mail'] },
  aws: { packages: ['aws-sdk'] },
  plaid: { packages: ['plaid'] },
  twitter: { packages: ['twitter-api-v2'] },
};
// Reverse index: import specifier -> vendor name.
const PACKAGE_TO_VENDOR = Object.fromEntries(
  Object.entries(VENDOR_REGISTRY).flatMap(([vendor, { packages }]) => packages.map((p) => [p, vendor])),
);
// Generic fallback #1: any `@scope/name` import not already in PACKAGE_TO_VENDOR. Catches
// scoped SDKs this registry hasn't been taught about by name yet (vendor name derived from the
// scope). Gated against RUNTIME_DEPENDENCY_PACKAGES (below) so build tooling that merely
// happens to live under a `@scope/` namespace (e.g. `@vitejs/plugin-react`, a devDependency,
// never called at request-time) doesn't false-positive as an uncovered external — a real
// vendor SDK the app talks to at runtime is a `dependencies` entry, not a `devDependencies`-
// only build tool.
const GENERIC_SCOPED_PACKAGE_RE = /from\s+['"](@[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)['"]|require\(\s*['"](@[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)['"]\s*\)/g;
// Generic fallback #2: a BARE (non-scoped) package import (e.g. a default import of the "twilio"
// package, imported under its own bare package name — deliberately not written here in the
// literal `import X from "X"` shape, since this file itself is repo-wide-scanned and that shape
// would otherwise self-match this very comment).
// Without this, a bare-named vendor SDK not yet in VENDOR_REGISTRY would pass vendor-coverage
// SILENTLY — the scoped-only regex above never matches a bare specifier at all, so a brand-new
// bare SDK this registry doesn't know about yet would be invisible to stage 4 entirely (a
// false-green in the exact gate built to prevent that). Deliberately excludes relative
// (`./`, `../`) and Node builtin-shaped specifiers, and — like the scoped fallback — is gated
// against RUNTIME_DEPENDENCY_PACKAGES so a bare devDependency build tool (e.g. `esbuild`,
// `typescript`) doesn't false-positive as an uncovered external.
const GENERIC_BARE_PACKAGE_RE = /from\s+['"]([a-zA-Z][a-zA-Z0-9_.-]*)['"]|require\(\s*['"]([a-zA-Z][a-zA-Z0-9_.-]*)['"]\s*\)/g;
const NODE_BUILTIN_RE = /^(node:|assert|buffer|child_process|cluster|crypto|dgram|dns|domain|events|fs|http|http2|https|net|os|path|perf_hooks|process|punycode|querystring|readline|repl|stream|string_decoder|tls|tty|url|util|v8|vm|zlib|module|worker_threads)$/;
// Bare runtime-dependency packages that are NOT a vendor SDK in the sense this stage cares about
// (something the app calls out to an external network service through), so the bare fallback
// must not flag them — same spirit as the scoped fallback's `@volter`/`@volter-ai-dev` exclusion,
// just for non-scoped names: `react`/`react-dom` are UI rendering libraries with no "external
// call" semantic at all (a browser-rendered component tree, not an API client), and `termfleet` is
// this repo's OWN orchestration-harness dependency (scripts/runner.ts's launch machinery), not
// something the APP talks to as an external vendor. Kept short and explicit on purpose — anything
// not on this list still gets flagged (by design; false-negatives here are exactly the bug this
// fix closes), so growing this list is a deliberate, reviewable per-package judgment call, not a
// silent broadening of what passes.
const NON_VENDOR_BARE_PACKAGES = new Set(['react', 'react-dom', 'termfleet']);
const IMPORT_RE_FOR = (pkg) => new RegExp(`from\\s+['"]${pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]|require\\(\\s*['"]${pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]\\s*\\)`);

// Union of `dependencies` (NOT devDependencies) across every package.json in the repo/workspaces.
// This is the derivation-based signal for "a real runtime SDK the app might call an external
// through" vs. "a build-time/type-only tool" — read off the manifests, not a hand-maintained
// denylist that would rot exactly like the thing this whole fix removes.
function deriveRuntimeDependencyPackages() {
  const pkgs = new Set();
  const ls = sh('git', ['ls-files', '--cached', '--others', '--exclude-standard']);
  const manifestFiles = ls.status === 0
    ? (ls.stdout || '').split('\n').filter((f) => /(^|\/)package\.json$/.test(f) && !f.includes('node_modules/'))
    : ['package.json', 'apps/api/package.json', 'apps/web/package.json'];
  for (const rel of manifestFiles) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) continue;
    try {
      const manifest = JSON.parse(fs.readFileSync(full, 'utf8'));
      for (const name of Object.keys(manifest.dependencies || {})) pkgs.add(name);
    } catch {
      // malformed package.json is not this stage's concern; ignore for dependency-set purposes
    }
  }
  return pkgs;
}

// ---------------------------------------------------------------------------
// Boot timeout derivation
// ---------------------------------------------------------------------------
// BUG this closes: `volter-world up` was previously wrapped in a HARDCODED outer wall-clock
// timeout (90_000ms) via spawnSync's own `timeout` option. That number was picked independently
// of what the adopter's OWN world.config.json declares acceptable per service (each service has
// its own readiness-probe budget, e.g. `readyWhen.timeoutMs`). When the sum of those per-service
// budgets exceeds the outer wrapper's number — which a real adopter hit in production — spawnSync
// kills `volter-world up` with SIGTERM the moment ITS timeout elapses, even though no individual
// service had actually failed its own readiness probe and the boot was still within what the
// config itself calls acceptable. Because SIGTERM short-circuits the CLI, it never gets to print
// its own honest "service X timed out" diagnostic — it surfaces here as an opaque
// `volter-world up exited null: ` (empty stderr/stdout), which is strictly worse than a real
// per-service timeout message.
//
// FIX: derive the outer timeout FROM the config's own declared per-service budgets, so the outer
// wrapper is always at least as generous as what the config says is acceptable — never an
// independently-chosen number that can silently be tighter. See deriveWorldBootTimeoutMs below.

// Per-service readiness timeout, read defensively since the field name/shape is owned by
// `volter-world`/`@volter/twin-world` (not vendored/inspectable in this sandbox — see comment
// on deriveWorldBootTimeoutMs for why SUM, not MAX, is used). Tries the documented
// `readyWhen.timeoutMs` shape first, then a couple of plausible fallbacks, so a differently-
// shaped-but-still-numeric config field is still honored rather than silently ignored.
function readServiceTimeoutMs(svc) {
  const candidates = [
    svc?.readyWhen?.timeoutMs,
    svc?.readinessTimeoutMs,
    svc?.timeoutMs,
  ];
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c) && c > 0) return c;
  }
  return null;
}

// Fallback per-service budget when a service declares no readiness timeout at all (a minimal/
// degenerate config) — conservative, matches the old global default order of magnitude, so a
// config missing this field entirely doesn't collapse the derived sum to ~0.
const DEFAULT_SERVICE_TIMEOUT_MS = 60_000;
// Fixed margin for the CLI's own non-per-service overhead: world creation, CA minting, network
// setup, etc, which happen once per boot regardless of service count. Modest on purpose — this
// is NOT where most of the budget should come from; the per-service sum is the primary driver.
const BOOT_OVERHEAD_MARGIN_MS = 90_000;
// Sane floor for a tiny/degenerate config (e.g. zero services, or a config that fails to parse
// enough to find any) — keeps `up` from being wrapped in an unreasonably short timeout even when
// the derivation has nothing to sum.
const MIN_BOOT_TIMEOUT_MS = 90_000;

// Derive the outer wall-clock budget for `volter-world up` from the world config's own declared
// per-service readiness timeouts, so the wrapper can never be tighter than what the config itself
// says is acceptable.
//
// SUM vs MAX: services CAN have startup dependencies on each other (e.g. an app server waiting on
// postgres before it even starts its own readiness probe), so a later service's timeout clock may
// only start once an earlier one is satisfied — i.e. worst case, the budgets are consumed
// sequentially, not concurrently. `volter-world`/`@volter/twin-world` is not vendored in this
// sandbox to inspect its actual scheduling, so this deliberately takes the SAFE, CONSERVATIVE
// model (SUM of all per-service timeouts) rather than assuming full parallelism (MAX) — the
// worst outcome of over-budgeting SUM is a smoke run waits a bit longer before reporting a REAL
// failure; the worst outcome of under-budgeting MAX is exactly the bug this fix closes (an
// opaque SIGTERM cutting off a boot that was still within its own declared allowance).
//
// Exported as a standalone pure function (config object in, number out) specifically so it can be
// unit-tested with a fabricated config without needing a real `volter-world`/`world.config.json`
// (see the `node -e` smoke check in this profile's PR description) — following this repo's
// existing convention of isolating pure logic behind a run-as-entrypoint gate (this file runs
// under plain `node`, so it uses the `import.meta.url === file://process.argv[1]` idiom — see
// this profile's own scripts/next-free-issue-id.mjs — rather than the `import.meta.main` gate
// used in scripts that run under `bun`, e.g. scripts/rearm-auto-merge.ts) instead of leaving the
// derivation buried in the imperative stage functions.
export function deriveWorldBootTimeoutMs(rawConfig) {
  const services = Array.isArray(rawConfig?.services) ? rawConfig.services : [];
  const perServiceSum = services.reduce((sum, svc) => sum + (readServiceTimeoutMs(svc) ?? DEFAULT_SERVICE_TIMEOUT_MS), 0);
  const derived = perServiceSum + BOOT_OVERHEAD_MARGIN_MS;
  return Math.max(derived, MIN_BOOT_TIMEOUT_MS);
}

// Read world.config.json and return the set of vendors CONFIGURED as a twin service.
// Vendor is derived from the service's `injectEnv` (e.g. STRIPE_TWIN_URL -> stripe) with
// `id`/`command` as fallbacks — never hardcoded to "just stripe".
function deriveConfiguredTwinVendors() {
  const raw = JSON.parse(fs.readFileSync(WORLD_CONFIG, 'utf8'));
  const vendors = new Map(); // vendor -> service id
  for (const svc of raw.services || []) {
    if (svc.type !== 'twin') continue;
    let vendor = null;
    if (svc.injectEnv) {
      const m = /^([A-Z0-9_]+)_TWIN_URL$/.exec(svc.injectEnv);
      if (m) vendor = m[1].toLowerCase();
    }
    if (!vendor && typeof svc.command === 'string') {
      const m = /world-([a-zA-Z0-9_-]+)/.exec(svc.command);
      if (m) vendor = m[1].toLowerCase();
    }
    if (!vendor && svc.id) vendor = String(svc.id).toLowerCase();
    if (vendor) vendors.set(vendor, svc.id);
  }
  return vendors;
}

// Scan SOURCE_FILES (+ any additional not-yet-committed app/script source, so a brand new
// file is caught too) for vendor SDK imports. Returns Map<vendor, Set<matched package>>.
function deriveUsedVendors() {
  const used = new Map();
  const filesToScan = new Set(SOURCE_FILES);
  const ls = sh('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'apps', 'scripts']);
  if (ls.status === 0) {
    for (const f of (ls.stdout || '').split('\n')) {
      if (/\.(mjs|cjs|js|jsx|ts|tsx)$/.test(f) && !/\.config\.(mjs|cjs|js|ts|tsx)$/.test(f)) filesToScan.add(f);
    }
  } else {
    log(`WARN  stage 4 vendor scan: git ls-files failed (${(ls.stderr || '').trim()}) — repo-wide scan skipped, only SOURCE_FILES checked`);
  }
  const runtimeDeps = deriveRuntimeDependencyPackages();
  for (const rel of filesToScan) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) continue;
    const text = fs.readFileSync(full, 'utf8');
    for (const [pkg, vendor] of Object.entries(PACKAGE_TO_VENDOR)) {
      if (IMPORT_RE_FOR(pkg).test(text)) {
        if (!used.has(vendor)) used.set(vendor, new Set());
        used.get(vendor).add(pkg);
      }
    }
    // Generic fallback for scoped packages the registry doesn't know by name yet — only
    // packages actually declared as a runtime `dependencies` entry somewhere in the repo
    // count; a `@scope/pkg` that's merely imported in a *.config.* file or is devDependencies-
    // only (build tooling, type packages) is not a "the app calls this external" signal.
    let m;
    GENERIC_SCOPED_PACKAGE_RE.lastIndex = 0;
    while ((m = GENERIC_SCOPED_PACKAGE_RE.exec(text))) {
      const pkg = m[1] || m[2];
      if (PACKAGE_TO_VENDOR[pkg]) continue; // already handled by the named registry above
      if (/^@volter\b|^@volter-ai-dev\b/.test(pkg)) continue; // our own twin/world tooling, not an external vendor SDK
      if (!runtimeDeps.has(pkg)) continue; // not declared as a runtime dependency anywhere — treat as build/type tooling, not an uncovered external
      const vendor = pkg.split('/')[0].replace(/^@/, '').toLowerCase();
      if (!used.has(vendor)) used.set(vendor, new Set());
      used.get(vendor).add(pkg);
    }
    // Generic fallback for BARE (non-scoped) packages the registry doesn't know by name yet —
    // same gating as the scoped fallback (must be a real runtime dependency, never a build/type
    // tool), plus excluding Node builtins and relative/absolute specifiers, which are never a
    // "vendor SDK" in the sense this stage cares about.
    GENERIC_BARE_PACKAGE_RE.lastIndex = 0;
    while ((m = GENERIC_BARE_PACKAGE_RE.exec(text))) {
      const pkg = m[1] || m[2];
      if (PACKAGE_TO_VENDOR[pkg]) continue; // already handled by the named registry above
      if (NODE_BUILTIN_RE.test(pkg)) continue; // a Node builtin, not an external vendor SDK
      if (NON_VENDOR_BARE_PACKAGES.has(pkg)) continue; // UI framework / our own tooling — not a vendor SDK
      if (!runtimeDeps.has(pkg)) continue; // not declared as a runtime dependency anywhere — treat as build/type tooling, not an uncovered external
      const vendor = pkg.toLowerCase();
      if (!used.has(vendor)) used.set(vendor, new Set());
      used.get(vendor).add(pkg);
    }
  }
  return used;
}

// Derivation runs over a whitespace-NORMALIZED copy of each source file (dots and the
// opening paren re-joined to their identifiers) so a merely reformatted call —
// `stripe.products\n  .list(` or `stripe.products.list ({...})` — still derives, instead
// of silently vanishing from the probe list.
function normalizeForDerivation(text) {
  return text.replace(/\s*\.\s*/g, '.').replace(/([\w$])\s+\(/g, '$1(');
}

function deriveStripeOps() {
  const found = new Set();
  for (const rel of SOURCE_FILES) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) continue;
    const text = normalizeForDerivation(fs.readFileSync(full, 'utf8'));
    let m;
    CALL_RE.lastIndex = 0;
    while ((m = CALL_RE.exec(text))) {
      found.add(`${m[1]}.${m[2]}`);
    }
  }
  return [...found].sort();
}

// Derivation blind-spot sentinel. CALL_RE only parses plain two-segment
// `stripe.<resource>.<method>(` calls, and only in SOURCE_FILES. Any Stripe usage it
// CANNOT parse — a three-segment call (stripe.checkout.sessions.create), bracket/dynamic
// access, aliasing the client into another variable, or a `stripe` import in some other
// file — would otherwise be silently unprobed: exactly the false-green this gate exists
// to prevent. So each of those is a HARD stage-4 FAIL (not a warn): the gate refuses to
// vouch for coverage it cannot derive. Remedy: rewrite the call as plain
// `stripe.<resource>.<method>(...)` inside SOURCE_FILES, or extend deriveStripeOps and
// the probe strategies (and this sentinel) to cover the new style/site.
const UNPARSEABLE_STYLES = [
  ['three-segment call (e.g. stripe.checkout.sessions.create) — the derivation only parses two segments',
    /\bstripe(?:\?\.|\.)[A-Za-z_$][\w$]*(?:\?\.|\.)[A-Za-z_$][\w$]*(?:\?\.|\.)/],
  ['bracket/dynamic access on the stripe client', /\bstripe\s*\[/],
  ['aliasing the stripe client into another variable', /=\s*stripe\s*(?:$|[;,)\]])/m],
];
const STRIPE_IMPORT_RE = /from\s+['"]stripe['"]|require\(\s*['"]stripe['"]\s*\)/;

function findDerivationBlindSpots() {
  const problems = [];
  for (const rel of SOURCE_FILES) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) continue;
    const text = normalizeForDerivation(fs.readFileSync(full, 'utf8'));
    for (const [why, re] of UNPARSEABLE_STYLES) {
      if (re.test(text)) problems.push(`${rel}: ${why}`);
    }
  }
  // Repo-wide: a `stripe` import anywhere outside SOURCE_FILES means calls this probe
  // never sees. --others --exclude-standard includes not-yet-committed files, so a
  // freshly written route module is caught at develop-time, not just once tracked in CI.
  const ls = sh('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'apps', 'scripts']);
  if (ls.status === 0) {
    const files = (ls.stdout || '').split('\n')
      .filter((f) => /\.(mjs|cjs|js|jsx|ts|tsx)$/.test(f) && !SOURCE_FILES.includes(f));
    for (const rel of files) {
      const full = path.join(ROOT, rel);
      if (!fs.existsSync(full)) continue;
      if (STRIPE_IMPORT_RE.test(fs.readFileSync(full, 'utf8'))) {
        problems.push(`${rel}: imports 'stripe' but is not in SOURCE_FILES — its calls are never derived or probed`);
      }
    }
  } else {
    log(`WARN  stage 4 blind-spot sentinel: git ls-files failed (${(ls.stderr || '').trim()}) — repo-wide stripe-import scan skipped`);
  }
  return problems;
}

async function stageMockCoverage() {
  currentStage = 3;

  // --- Pass 1: vendor coverage (twin-config-driven + source-driven) ------------------
  const configuredTwins = deriveConfiguredTwinVendors(); // Map<vendor, serviceId>
  const usedVendors = deriveUsedVendors(); // Map<vendor, Set<package>>

  const uncovered = [...usedVendors.keys()].filter((v) => !configuredTwins.has(v));
  if (uncovered.length > 0) {
    const detail = uncovered
      .map((v) => `${v} (imported via ${[...usedVendors.get(v)].join(', ')})`)
      .join(', ');
    const remedies = uncovered
      .map((v) => `no twin configured in world.config.json for ${v}; add @volter/twin-${v} and a twin service, or the sealed world will block it`)
      .join(' | ');
    await fail(3, `app calls external(s) with NO configured twin: ${detail}. ${remedies}`);
  }
  log(`INFO  stage 4 vendor coverage OK — every external the app imports (${[...usedVendors.keys()].join(', ') || 'none'}) has a configured twin (${[...configuredTwins.keys()].join(', ') || 'none'})`);

  // --- Pass 2: op coverage, per configured+used vendor -------------------------------
  // Stripe has a full derivation + live op-probe (below, unchanged in spirit). Other
  // configured vendors without a per-op probe strategy still passed vendor coverage above
  // (twin configured + reachable via stage 1's doctor check) but their specific ops are not
  // individually probed here — noted, not silently claimed as modeled.
  const otherConfiguredUsedVendors = [...usedVendors.keys()].filter((v) => v !== 'stripe');
  if (otherConfiguredUsedVendors.length > 0) {
    log(`NOTE  stage 4: ${otherConfiguredUsedVendors.join(', ')} twin(s) configured+reachable but this stage has no per-op probe strategy for them yet — only vendor-level coverage was verified, not individual op modeling. Extend VENDOR_REGISTRY + add a probe strategy (see the stripe op-probe below) for full op-level assurance.`);
  }

  if (!usedVendors.has('stripe')) {
    pass(3, 'no stripe usage detected in source — skipping stripe op-probe');
    return;
  }

  const derived = deriveStripeOps();
  if (derived.length === 0) {
    await fail(3, `derived zero stripe.<resource>.<method>( calls from ${SOURCE_FILES.join(', ')} — the derivation regex found nothing; either the app no longer calls Stripe this way (update this script) or the source files moved`);
  }

  const blindSpots = findDerivationBlindSpots();
  if (blindSpots.length > 0) {
    await fail(3, `Stripe usage the endpoint derivation CANNOT parse — these would be silently unprobed, i.e. a mock gap could hide behind a green smoke: ${blindSpots.join(' | ')}. Rewrite as plain stripe.<resource>.<method>(...) in ${SOURCE_FILES.join(' / ')}, or extend deriveStripeOps and the probe strategies (and this sentinel) to cover the new style/site.`);
  }

  const missingFromCrossCheck = derived.filter((op) => !KNOWN_CROSS_CHECK.includes(op));
  const missingFromDerived = KNOWN_CROSS_CHECK.filter((op) => !derived.includes(op));
  if (missingFromCrossCheck.length || missingFromDerived.length) {
    log(`WARN  stage 4 endpoint-derivation drift vs. cross-check list — derived-only: [${missingFromCrossCheck.join(', ')}] cross-check-only: [${missingFromDerived.join(', ')}] (the DERIVED list is authoritative; update KNOWN_CROSS_CHECK in this script if this is an intentional new call site)`);
  }

  const probeScript = `
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_API_KEY || 'sk_test_fake');
    const ops = ${JSON.stringify(derived)};
    const results = [];
    for (const op of ops) {
      const [resource, method] = op.split('.');
      try {
        let r;
        if (method === 'list') r = await stripe[resource][method]({ limit: 1 });
        else if (method === 'cancel') {
          const subs = await stripe.subscriptions.list({ limit: 1, status: 'all' });
          if (!subs.data.length) throw new Error('no subscription available to probe cancel against (seed stage should have created one)');
          r = await stripe[resource][method](subs.data[0].id);
          // restore: the twin models a real Stripe cancel, so this permanently cancels the
          // probed subscription — acceptable, smoke's world is torn down + purged right after.
        } else if (op === 'customers.create') {
          r = await stripe.customers.create({ name: 'Smoke Probe', email: 'smoke-probe@example.com' });
        } else if (op === 'products.create') {
          r = await stripe.products.create({ name: 'Smoke Probe Product' });
        } else if (op === 'prices.create') {
          const p = await stripe.products.create({ name: 'Smoke Probe Price Product' });
          r = await stripe.prices.create({ product: p.id, unit_amount: 100, currency: 'usd' });
        } else if (op === 'subscriptions.create') {
          const cust = await stripe.customers.create({ name: 'Smoke Probe Sub Customer', email: 'smoke-probe-sub@example.com' });
          const prod = await stripe.products.create({ name: 'Smoke Probe Sub Product' });
          const price = await stripe.prices.create({ product: prod.id, unit_amount: 100, currency: 'usd', recurring: { interval: 'month' } });
          r = await stripe.subscriptions.create({ customer: cust.id, items: [{ price: price.id }] });
        } else {
          throw new Error('no probe strategy for op ' + op);
        }
        results.push({ op, ok: true });
      } catch (e) {
        results.push({ op, ok: false, status: e.statusCode ?? e.status ?? null, message: e.message ?? String(e) });
      }
    }
    console.log('SMOKE_PROBE_RESULTS:' + JSON.stringify(results));
  `;
  const res = worldExec(['node', '--input-type=module', '-e', probeScript], { timeout: 30_000 });
  const line = (res.stdout || '').split('\n').find((l) => l.startsWith('SMOKE_PROBE_RESULTS:'));
  if (!line) {
    await fail(3, `probe process produced no results (exit ${res.status}): stdout=${(res.stdout || '').trim()} stderr=${(res.stderr || '').trim()}`);
  }
  const results = JSON.parse(line.slice('SMOKE_PROBE_RESULTS:'.length));
  const unmodeled = results.filter((r) => !r.ok);
  if (unmodeled.length > 0) {
    const detail = unmodeled.map((r) => `stripe.${r.op}(...) -> ${r.status ?? '???'} ${r.message}`).join(' | ');
    await fail(3, `Stripe twin does NOT model ${unmodeled.length} operation(s) the app actually calls: ${detail}. The Stripe twin's known capability coverage is partial (~79%); this app path is not one of the covered operations. Do not proceed with development against this world — evidence produced from a mock gap like this is not trustworthy.`);
  }
  pass(3, `all ${results.length} derived ops modeled by the twin (${derived.join(', ')})`);
}

// ---------------------------------------------------------------------------
// Stage 5: Canonical Playwright capture
// ---------------------------------------------------------------------------
// Default matches this profile's own scaffolding template layout (policy.box.visual_evidence
// in ir.yml); override with SMOKE_CANONICAL_VISUAL_STATE once the adopter has authored their
// own visual-state script under that dir (see standards/visual-evidence.md).
const CANONICAL_VISUAL_STATE = process.env.SMOKE_CANONICAL_VISUAL_STATE
  || 'apps/web/.visual-edit/playwright-visual-states/products-loaded.mjs';

async function stageCapture() {
  currentStage = 4;
  const scriptPath = path.join(ROOT, CANONICAL_VISUAL_STATE);
  if (!fs.existsSync(scriptPath)) {
    await fail(4, `canonical visual-state script not found at ${CANONICAL_VISUAL_STATE} — update CANONICAL_VISUAL_STATE in this script if it moved/was renamed`);
  }

  tempOutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'world-smoke-capture-'));
  const runId = 'smoke-gate';

  const appUrlRes = worldExec(['node', '-e', 'console.log(process.env.APP_URL || "")']);
  const appUrl = (appUrlRes.stdout || '').trim();
  if (!appUrl) {
    await fail(4, `could not resolve APP_URL from the world env — capture cannot be pointed at the app`);
  }

  const res = worldExec(['node', CANONICAL_VISUAL_STATE], {
    timeout: 45_000,
    env: envFrom(process.env, {
      VISUAL_STATE_RUN_ID: runId,
      VISUAL_STATE_OUT_DIR: tempOutDir,
      VISUAL_EDIT_APP_URL: appUrl,
    }),
  });
  if (res.status !== 0) {
    await fail(4, `canonical capture "${CANONICAL_VISUAL_STATE}" failed (exit ${res.status}): ${(res.stderr || res.stdout || '').trim()}`);
  }

  const summaryPath = path.join(tempOutDir, 'summary.json');
  if (!fs.existsSync(summaryPath)) {
    await fail(4, `capture exited 0 but produced no summary.json at ${summaryPath}`);
  }
  let summary;
  try {
    summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  } catch (e) {
    await fail(4, `summary.json is not valid JSON: ${e.message}`);
  }
  if (summary.status !== 'pass') {
    await fail(4, `summary.json reports status "${summary.status}", not "pass" (runError: ${JSON.stringify(summary.runError)})`);
  }
  const screenshotRel = summary.evidence?.screenshot;
  if (!screenshotRel) {
    await fail(4, `summary.json has no evidence.screenshot field`);
  }
  const screenshotPath = path.join(tempOutDir, screenshotRel);
  if (!fs.existsSync(screenshotPath)) {
    await fail(4, `summary.json references screenshot "${screenshotRel}" but it does not exist at ${screenshotPath}`);
  }
  const stat = fs.statSync(screenshotPath);
  if (stat.size === 0) {
    await fail(4, `screenshot at ${screenshotPath} is zero-length`);
  }
  const header = Buffer.alloc(8);
  const fd = fs.openSync(screenshotPath, 'r');
  fs.readSync(fd, header, 0, 8, 0);
  fs.closeSync(fd);
  const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!header.equals(PNG_MAGIC)) {
    await fail(4, `evidence file at ${screenshotPath} is not a valid PNG (bad magic bytes) — Chromium/Playwright wiring is likely broken`);
  }

  pass(4, `summary.json status=pass, screenshot ${stat.size}B valid PNG at ${screenshotRel}`);
  // stash the run dir for stage 6, then clean it up ourselves at the very end (not per-stage) —
  // stage 6 needs it to still exist.
  return tempOutDir;
}

// ---------------------------------------------------------------------------
// Stage 6: Evidence pipeline dry-run
// ---------------------------------------------------------------------------
async function stageEvidenceDryRun(runDir) {
  currentStage = 5;
  const evidenceScript = path.join(ROOT, 'scripts/evidence-attach.mjs');
  if (!fs.existsSync(evidenceScript)) {
    await fail(5, `scripts/evidence-attach.mjs not found`);
  }
  const res = sh('node', [evidenceScript, '--run', runDir, '--dry-run'], { timeout: 20_000 });
  if (res.status !== 0) {
    await fail(5, `evidence-attach.mjs --dry-run exited ${res.status}: ${(res.stderr || res.stdout || '').trim()}`);
  }
  const out = res.stdout || '';
  if (!/--dry-run, no git\/tracker mutation\. Plan:/.test(out)) {
    await fail(5, `evidence-attach.mjs --dry-run did not print the expected dry-run banner — output: ${out.trim()}`);
  }
  if (!/would run: npx ztrack evidence add/.test(out) || !/would run: npx ztrack ac patch/.test(out)) {
    await fail(5, `evidence-attach.mjs --dry-run plan is missing an expected step (ztrack evidence add / ztrack ac patch) — output: ${out.trim()}`);
  }
  pass(5, 'evidence-attach.mjs produced a coherent dry-run plan (screenshot resolved, AC mapped, zero mutation)');
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  log(`world-smoke: booting instance "${WORLD_NAME}" (distinct from ${DEV_WORLD_INSTANCE} — never clobbers a running dev world)`);
  await stageBoot();
  await stageEgress();
  await stageSeed();
  await stageMockCoverage();
  const runDir = await stageCapture();
  await stageEvidenceDryRun(runDir);
  const ok = await teardown(true);
  if (!ok) {
    log('');
    log('SMOKE: FAIL (stage 7: Teardown — see above; earlier stages all passed but the world/process was not cleanly torn down)');
    process.exit(1);
  }
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  log('');
  log(`SMOKE: PASS (${elapsed}s, ${STAGE_NAMES.length} stages)`);
  process.exit(0);
}

// Gated so `deriveWorldBootTimeoutMs` (and other pure helpers) can be imported by a unit test
// without running the whole smoke sequence — same convention as this profile's own
// scripts/next-free-issue-id.mjs.
if (import.meta.url === `file://${process.argv[1]}`) {
  process.on('uncaughtException', async (err) => {
    await fail(currentStage, `uncaught exception: ${err?.stack || err}`);
  });

  main();
}
