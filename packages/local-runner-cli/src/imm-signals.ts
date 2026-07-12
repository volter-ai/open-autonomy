// TB.1 — the IMM (Install Maturity Model, DESIGN §Q1) deterministic signal library.
//
// Each exported `a<N>...` function is a PURE(ish), read-mostly probe: `(installDir, ctx?) -> Signal`,
// where `Signal = { present: boolean, evidence: string }`. `evidence` is never a bare boolean re-stated —
// it always CITES a fact (a file path + what was found in it, or a command + a digest of its output), so
// a caller composing these into an IMM stage verdict (TB.2, NOT this file) can show its work.
//
// Scope discipline (per the task list): this file is the SIGNAL LIBRARY ONLY.
//   - No judgment signals (direction/vision quality, "is this a real North Star" — that is Track C, the
//     audit agent).
//   - No stage composition (M0..M6 verdict-building is TB.2's `oa maturity` verb, not here).
//   - No provider/session starts. Never `oa start`/`oa once`/mint a token/launch an agent. A8/A10's doctor
//     wrap probes the provider's `/healthz` only (a plain GET with a 3s timeout, packages/local-runner-
//     cli/src/doctor.ts) — it never starts one. If a signal genuinely needs something this repo cannot
//     prove without a live dependency (gh auth, a provider, a profile's own source tree), it reports
//     `present: false` with a NAMED reason ('unverifiable: …' / 'not-applicable: …' / 'doctor-unavailable:
//     …') — it never fakes a pass.
//
// NO-CORE-IMPORTS RULE (mirrors board-readiness.ts's header): this package (`@volter/oa`) is designed to
// be independently publishable — `@open-autonomy/core` is a private, unpublished monorepo workspace
// package, so nothing here imports it. A13 (provision.json vs live branch protection) reads
// `<profileDir>/provision.json` with a plain `JSON.parse`, exactly the way board-readiness.ts's
// `readMaturitySignals` reads `<profileDir>/setup-pack.yml` with the `yaml` package instead of importing
// `getSetupPack` — a real, tiny, independently-publishable dependency, not the monorepo's own core.
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { ProcRunner } from './types.ts';
import { defaultProc, firstLine } from './proc.ts';
import { checkUncommittedHarness } from './guards.ts';
import { doctor } from './doctor.ts';
import { isPaused, pausedMarkerPath, pauseReasonText } from './pause.ts';
import { hasDispatchableWork } from './board-readiness.ts';

export interface Signal {
  present: boolean;
  /** A cited fact — a file path + what was found, or a command + a digest of its output. Never a bare
   *  restatement of `present`. */
  evidence: string;
}

export type SignalFn = (installDir: string, ctx?: SignalContext) => Promise<Signal>;

export interface SignalContext {
  /** injectable subprocess seam (gh/bun/git probes) — tests stub this; default shells out for real. */
  proc?: ProcRunner;
  /** ambient env override (default process.env). */
  env?: NodeJS.ProcessEnv;
  /** the SOURCE profile directory (e.g. `profiles/simple-sdlc`) — needed by A13 (provision.json) and, as
   *  a board-kind hint, by A14 (mirrors board-readiness.ts's own `profileDir` param). Not copied into an
   *  install by compile, so it must be supplied out-of-band by whatever composes these signals. */
  profileDir?: string;
  /** identity fallback for A14's board-kind resolution when `profileDir` doesn't resolve one — see
   *  board-readiness.ts's `resolveBoardKind`. */
  actor?: string;
  /** `owner/name` override for A13 — skips the `gh repo view` autodetect probe. */
  repo?: string;
  /** A8/A10: probe the provider's `/healthz` over the network (default true — WITHOUT this, `doctor()`
   *  reports the provider check as a vacuous "skipped (offline mode)" pass, which would let this signal
   *  silently pass an install with no reachable provider; see doctor.ts's own `--live` flag). Never starts
   *  a provider — a bounded GET with a 3s timeout either way. */
  live?: boolean;
  /** override the resolved path to (root) `bin/preflight.ts` — A11. Defaults to `<cwd>/bin/preflight.ts`
   *  (repo-root-relative, matching this package's own test convention — board-readiness.test.ts's header:
   *  "cwd = repo root"), which only resolves when the caller's process.cwd() IS an `open-autonomy` source
   *  checkout. Deliberately NOT resolved via `import.meta.url`: this package (`@volter/oa`) ships
   *  independently of the root `open-autonomy` package's bundled dist (scripts/build-cli.ts's DATA_FILES
   *  manifest + its static sibling-read scan cover THAT bundle, not this one) — an import.meta.url-relative
   *  default here would either falsely trip that unrelated scan or silently resolve to nothing once
   *  actually published standalone. Explicit is honest; a bad guess is not. */
  preflightBin?: string;
  /** override the resolved path to `scripts/open-autonomy-preflight.ts` — A12. Same default (`<cwd>/
   *  scripts/open-autonomy-preflight.ts`) and the same resolution caveat as `preflightBin`. */
  ghPreflightScript?: string;
  /** A8/A10 doctor's injectable fetch (tests only). */
  fetchImpl?: typeof fetch;
}

const GENERATED_MANIFEST_REL = '.open-autonomy/generated.json';
const GENERATED_SCHEMA = 'open-autonomy.generated.v1';
const AUTONOMY_YML_REL = '.open-autonomy/autonomy.yml';
const AUTONOMY_SCHEMA = 'open-autonomy.autonomy.v1';

interface RawGeneratedManifest {
  schema?: string;
  files?: unknown;
}

function readGeneratedManifestRaw(installDir: string): { path: string; parsed?: RawGeneratedManifest; parseError?: string } {
  const path = join(installDir, GENERATED_MANIFEST_REL);
  if (!existsSync(path)) return { path };
  try {
    return { path, parsed: JSON.parse(readFileSync(path, 'utf8')) as RawGeneratedManifest };
  } catch (e) {
    return { path, parseError: (e as Error).message };
  }
}

// --- A1 — .open-autonomy/generated.json valid: schema tag + every files[] entry exists on disk ----------
// cf packages/core/src/file-manifest.ts:14-35 (the manifest's OWN writer/reader) and
// bin/autonomy-compile.ts's pre-write clobber/resurrection gates, which this signal mirrors read-only.

export async function a1GeneratedJsonValid(installDir: string, _ctx: SignalContext = {}): Promise<Signal> {
  const { path, parsed, parseError } = readGeneratedManifestRaw(installDir);
  if (parseError) return { present: false, evidence: `${path}: not valid JSON (${parseError})` };
  if (!parsed) return { present: false, evidence: `${path}: does not exist` };
  if (parsed.schema !== GENERATED_SCHEMA) {
    return { present: false, evidence: `${path}: schema is "${parsed.schema ?? '(missing)'}", expected "${GENERATED_SCHEMA}"` };
  }
  const files = Array.isArray(parsed.files) ? parsed.files.filter((f): f is string => typeof f === 'string') : [];
  if (!files.length) return { present: false, evidence: `${path}: schema OK but files[] is empty or missing` };
  const missing = files.filter((f) => !existsSync(join(installDir, f)));
  if (missing.length) {
    const shown = missing.slice(0, 5).join(', ');
    return {
      present: false,
      evidence: `${path}: schema OK, ${files.length} files[] entries, but ${missing.length} missing on disk: ${shown}${missing.length > 5 ? `, +${missing.length - 5} more` : ''}`,
    };
  }
  return { present: true, evidence: `${path}: schema="${GENERATED_SCHEMA}", all ${files.length} files[] entries exist on disk under ${installDir}` };
}

// --- A2 — compile-clean: a manifest-shape proxy, not a live re-diff -------------------------------------
// The strict definition ("the install's manifest matches what its declared profile+substrate compile")
// needs the PROFILE SOURCE checked out next to the install — not something an arbitrary INSTALL dir can
// be assumed to carry (an adopter's install is a compile OUTPUT; the profile that produced it may live in
// a different repo entirely, e.g. `open-autonomy`'s own npm package). So A2 is deliberately a CHEAPER,
// dependency-free proxy: does `generated.json`'s files[] array have the SHAPE a genuine compile always
// produces — sorted, deduped, self-referencing (packages/core/src/file-manifest.ts:22-34's
// `generatedPaths`/`withGeneratedManifest`)? This catches hand-editing/corruption/truncation of the
// manifest; it does NOT catch "the profile source changed since this was compiled" (that needs the
// profile source present + a real re-compile — `bun bin/autonomy-compile.ts <profile> <substrate> --force`
// against a checked-out profile, which is a DIFFERENT, heavier operation this signal deliberately does not
// perform). This scope choice is the documented answer to the task's "choose what's honestly checkable
// from an INSTALL dir without the profile source present" instruction.

export async function a2CompileClean(installDir: string, _ctx: SignalContext = {}): Promise<Signal> {
  const { path, parsed, parseError } = readGeneratedManifestRaw(installDir);
  if (parseError) return { present: false, evidence: `${path}: not valid JSON (${parseError}) — cannot evaluate manifest shape` };
  if (!parsed) return { present: false, evidence: `${path}: does not exist — cannot evaluate manifest shape` };
  const rawFiles = Array.isArray(parsed.files) ? parsed.files : [];
  if (!rawFiles.every((f): f is string => typeof f === 'string')) {
    return { present: false, evidence: `${path}: files[] contains a non-string entry — not a genuine compiler-produced manifest` };
  }
  const files = rawFiles as string[];
  if (!files.length) return { present: false, evidence: `${path}: files[] is empty — nothing to evaluate` };
  const sorted = [...files].sort();
  const isSorted = files.every((f, i) => f === sorted[i]);
  const dupes = [...new Set(files.filter((f, i) => files.indexOf(f) !== i))];
  const selfRefCount = files.filter((f) => f === GENERATED_MANIFEST_REL).length;
  const problems: string[] = [];
  if (!isSorted) problems.push('files[] is not lexicographically sorted (a real compile always emits Object.keys(...).sort() — file-manifest.ts:22-27)');
  if (dupes.length) problems.push(`duplicate entries: ${dupes.join(', ')}`);
  if (selfRefCount !== 1) problems.push(`must self-reference ${GENERATED_MANIFEST_REL} exactly once (found ${selfRefCount})`);
  if (problems.length) return { present: false, evidence: `${path}: fails compile-shape validation — ${problems.join('; ')}` };
  return {
    present: true,
    evidence:
      `${path}: has the shape a genuine compile produces (${files.length} entries, sorted, deduped, self-referencing). ` +
      `PROXY CHECK, not a live re-diff — see this function's header comment for why an INSTALL dir cannot generally re-run its own compile.`,
  };
}

// --- A3 — .open-autonomy/autonomy.yml parses + minimal shape (agents present) ----------------------------

export async function a3AutonomyYmlParses(installDir: string, _ctx: SignalContext = {}): Promise<Signal> {
  const path = join(installDir, AUTONOMY_YML_REL);
  if (!existsSync(path)) return { present: false, evidence: `${path}: does not exist` };
  let parsed: unknown;
  try {
    parsed = parseYaml(readFileSync(path, 'utf8'));
  } catch (e) {
    return { present: false, evidence: `${path}: failed to parse (${(e as Error).message})` };
  }
  const doc = (parsed ?? {}) as { schema?: string; agents?: Record<string, unknown> };
  if (doc.schema !== AUTONOMY_SCHEMA) {
    return { present: false, evidence: `${path}: parses, but schema is "${doc.schema ?? '(missing)'}", expected "${AUTONOMY_SCHEMA}"` };
  }
  const agents = doc.agents && typeof doc.agents === 'object' ? Object.keys(doc.agents) : [];
  if (!agents.length) return { present: false, evidence: `${path}: parses (schema="${AUTONOMY_SCHEMA}") but agents: {} is empty` };
  return { present: true, evidence: `${path}: parses, schema="${AUTONOMY_SCHEMA}", agents=[${agents.join(', ')}]` };
}

function readCodeHost(installDir: string): string | undefined {
  const path = join(installDir, AUTONOMY_YML_REL);
  if (!existsSync(path)) return undefined;
  try {
    const doc = parseYaml(readFileSync(path, 'utf8')) as { codeHost?: string };
    return doc?.codeHost;
  } catch {
    return undefined;
  }
}

// --- A4 / A5 — the paused marker, both directions (emit.ts:106-122 unpause, :480-517 seed-once) ---------

export async function a4PausedSeeded(installDir: string, _ctx: SignalContext = {}): Promise<Signal> {
  const path = pausedMarkerPath(installDir);
  if (!isPaused(installDir)) return { present: false, evidence: `${path}: does not exist` };
  const reason = (pauseReasonText(installDir) || '').trim().split('\n')[0] || '(empty file)';
  return { present: true, evidence: `${path}: exists — "${reason}"` };
}

export async function a5PausedAbsent(installDir: string, _ctx: SignalContext = {}): Promise<Signal> {
  const path = pausedMarkerPath(installDir);
  if (isPaused(installDir)) {
    const reason = (pauseReasonText(installDir) || '').trim().split('\n')[0] || '(empty file)';
    return { present: false, evidence: `${path}: still exists — "${reason}"` };
  }
  return { present: true, evidence: `${path}: does not exist (install unpaused)` };
}

// --- A6 — harness-committed: the SAME manifest-scoped git status/ls-files guard the scheduler enforces ---
// (packages/substrate-local/src/emit.ts:269-342's LOOP_DRIVER template — this reuses this package's own
// port of that exact guard, guards.ts's `checkUncommittedHarness`, rather than re-implementing the
// git-porcelain-parsing a third time.)
//
// EVIDENCE HONESTY (fix-round D2): the guard's `ok: true` covers THREE distinct realities, and the
// evidence must name which one actually happened — never assert git output the guard didn't produce:
//   1. git genuinely ran and found 0 dirty / 0 gitignored          -> the real "harness fully committed";
//   2. AUTONOMY_ALLOW_UNCOMMITTED_HARNESS=1 override: git ran and FOUND dirt, but the guard downgrades
//      to ok+warning (guards.ts:147-149) — `present` stays true (this signal mirrors the scheduler's own
//      launch semantics, and the scheduler WILL launch under the override), but the evidence must carry
//      the real dirty count from the warning, never claim "0 dirty";
//   3. not-a-git-repo (or no manifest): the guard early-returns ok WITHOUT running git at all
//      (guards.ts:106) — a vacuous ok. For a manifest-carrying install dir that is not a git repo,
//      "harness-committed" is not establishable (there is nothing to be committed INTO), so this signal
//      reports present:false with the vacuity named — fail-closed, matching the unit's never-fake rule.

export async function a6HarnessCommitted(installDir: string, ctx: SignalContext = {}): Promise<Signal> {
  const proc = ctx.proc ?? defaultProc;
  const env = ctx.env ?? process.env;
  const { path, parsed } = readGeneratedManifestRaw(installDir);
  const count = Array.isArray(parsed?.files) ? parsed!.files.length : 0;

  // Same probe the guard itself opens with (guards.ts:105) — run it HERE too, so the guard's
  // early-return-ok on a non-repo is never dressed up as git evidence (fix-round D2b).
  const isGitRepo = proc('git', ['rev-parse', '--git-dir'], { cwd: installDir }).status === 0;
  if (!isGitRepo) {
    if (count > 0) {
      return {
        present: false,
        evidence: `${installDir} is not a git repository (git rev-parse --git-dir failed) — checkUncommittedHarness's ok would be vacuous (guard skipped, git never ran); a harness cannot be committed outside a git repo, so this signal fails closed. Manifest ${path} lists ${count} paths.`,
      };
    }
    return {
      present: true,
      evidence: `${path}: no manifest and ${installDir} is not a git repository — nothing compiled here for this guard to check (vacuous ok; git never ran)`,
    };
  }

  const result = checkUncommittedHarness(installDir, proc, env);
  if (!result.ok) {
    return { present: false, evidence: (result.message ?? 'harness not fully committed').split('\n').join(' / ') };
  }
  // ok:true WITH a message == the AUTONOMY_ALLOW_UNCOMMITTED_HARNESS=1 override path (guards.ts:147-149):
  // git DID find dirt; the guard downgraded to a warning. Surface the real counts (fix-round D2a).
  if (result.message) {
    const dirtyMatch = /uncommitted \((\d+)\)/.exec(result.message);
    const ignoredMatch = /gitignored \((\d+)\)/.exec(result.message);
    const dirtyCount = dirtyMatch ? dirtyMatch[1] : '≥1';
    const ignoredNote = ignoredMatch ? ` + ${ignoredMatch[1]} gitignored` : '';
    return {
      present: true,
      evidence:
        `override AUTONOMY_ALLOW_UNCOMMITTED_HARNESS=1 active: git reported ${dirtyCount} dirty${ignoredNote} of the ${count} paths in ${path} (bypassed, NOT a clean status) — ` +
        `the scheduler will launch under this override, so present mirrors its semantics, but the harness is NOT fully committed. Guard warning: ${(result.message.split('\n')[0] ?? '').trim()}`,
    };
  }
  return {
    present: true,
    evidence: count
      ? `git status --porcelain / git ls-files against the ${count} paths in ${path} report 0 dirty and 0 gitignored — harness fully committed`
      : `${path}: no manifest — checkUncommittedHarness has nothing to check in this git repo, reports ok (vacuous; git never ran against a manifest)`,
  };
}

// --- A8 / A10 — doctor-pass: this package's OWN `oa doctor --json`, wrapped in-process -------------------
// TB.1's scope note collapses the heavier main-tree `bin/doctor-checks.ts` (A7/A8/A10 in the raw DESIGN
// table) down to pr-140's `oa doctor` — see the task's own text: "wrap `oa doctor --json` from
// packages/local-runner-cli". Both A8 and A10 map onto the SAME wrapped check in this unit (composition
// into distinct M-rungs, if the two ever need to diverge, is TB.2's job, not this library's).
// `live: true` by default — see SignalContext.live's doc: without it, doctor()'s provider check is a
// vacuous "skipped (offline mode)" PASS, which would silently let this signal pass an install with no
// reachable provider. `live` only ever does a bounded GET against `/healthz`; it never starts anything.

export async function a8a10DoctorPass(installDir: string, ctx: SignalContext = {}): Promise<Signal> {
  try {
    const report = await doctor({
      cwd: installDir,
      proc: ctx.proc ?? defaultProc,
      live: ctx.live ?? true,
      env: ctx.env ?? process.env,
      ...(ctx.fetchImpl ? { fetchImpl: ctx.fetchImpl } : {}),
    });
    const lines = report.checks.map((c) => `${c.ok ? 'OK' : 'FAIL'} ${c.name}: ${c.detail}`);
    return {
      present: report.ok,
      evidence: `oa doctor --json --live (cwd=${installDir}): ${report.ok ? 'all checks passed' : 'one or more checks FAILED'} — ${lines.join(' | ')}`,
    };
  } catch (e) {
    return { present: false, evidence: `doctor-unavailable: doctor() threw evaluating ${installDir}: ${(e as Error)?.message ?? e}` };
  }
}

// --- A11 — local preflight pass: (root) bin/preflight.ts, run as a subprocess against installDir --------

function defaultPreflightBin(): string {
  return join(process.cwd(), 'bin', 'preflight.ts');
}

export async function a11PreflightPass(installDir: string, ctx: SignalContext = {}): Promise<Signal> {
  const proc = ctx.proc ?? defaultProc;
  const bin = ctx.preflightBin ?? defaultPreflightBin();
  if (!existsSync(bin)) {
    return {
      present: false,
      evidence: `doctor-unavailable: bin/preflight.ts not found at ${bin} (only resolves inside an open-autonomy source checkout; pass ctx.preflightBin to point at one)`,
    };
  }
  const r = proc('bun', [bin], { cwd: installDir, env: ctx.env ?? process.env });
  const outLines = `${r.stdout || ''}${r.stderr || ''}`.split('\n').map((l) => l.trim()).filter(Boolean);
  const lastLine = outLines[outLines.length - 1] || '(no output)';
  return {
    present: r.status === 0,
    evidence: `bun bin/preflight.ts (cwd=${installDir}) exited ${r.status ?? '(no status)'}; last line: "${lastLine}"`,
  };
}

// --- A12 — gh-preflight ready: scripts/open-autonomy-preflight.ts --root <installDir>, subprocess --------
// Only meaningful for a github-substrate install (codeHost read from the install's own compiled
// autonomy.yml — never a guess). A local-substrate install reports 'not-applicable', never a fabricated
// pass or fail.

function defaultGhPreflightScript(): string {
  return join(process.cwd(), 'scripts', 'open-autonomy-preflight.ts');
}

export async function a12GhPreflightReady(installDir: string, ctx: SignalContext = {}): Promise<Signal> {
  const codeHost = readCodeHost(installDir);
  if (codeHost !== 'github') {
    return {
      present: false,
      evidence: `not-applicable: ${AUTONOMY_YML_REL} declares codeHost="${codeHost ?? '(unreadable)'}" — gh-preflight only applies to github-substrate installs`,
    };
  }
  const proc = ctx.proc ?? defaultProc;
  const script = ctx.ghPreflightScript ?? defaultGhPreflightScript();
  if (!existsSync(script)) {
    return {
      present: false,
      evidence: `doctor-unavailable: scripts/open-autonomy-preflight.ts not found at ${script} (only resolves inside an open-autonomy source checkout; pass ctx.ghPreflightScript to point at one)`,
    };
  }
  const outDir = mktempSafe();
  const outFile = join(outDir, 'preflight.json');
  try {
    const r = proc('bun', [script, '--root', installDir, '--out', outFile], { env: ctx.env ?? process.env });
    let ready: boolean | undefined;
    let missing: string[] = [];
    if (existsSync(outFile)) {
      try {
        const parsed = JSON.parse(readFileSync(outFile, 'utf8')) as { ready?: boolean; missing?: string[] };
        ready = parsed.ready;
        missing = Array.isArray(parsed.missing) ? parsed.missing : [];
      } catch {
        // fall through — evidence below still cites the raw exit/stdout
      }
    }
    const stdoutLines = (r.stdout || '').split('\n').map((l) => l.trim()).filter(Boolean);
    const stdoutLast = stdoutLines[stdoutLines.length - 1] || '(no stdout)';
    const missingNote = missing.length ? `; missing: ${missing.join(', ')}` : '';
    return {
      present: ready === true,
      evidence: `bun scripts/open-autonomy-preflight.ts --root ${installDir} --out ${outFile}: exit ${r.status}, stdout "${stdoutLast}", report.ready=${ready === undefined ? '(unreadable — report JSON missing/invalid)' : ready}${missingNote}`,
    };
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

function mktempSafe(): string {
  return mkdtempSync(join(tmpdir(), 'oa-imm-a12-'));
}

// --- A13 — provision.json's declared required_checks == LIVE branch protection ---------------------------
// DESIGN hardening #4: `provision-target-repo.ts:363` logs and CONTINUES on a failed (e.g. non-admin)
// protection PUT, and gh-preflight's own branch-protection check PASSES with zero protection
// (`requiredChecks.length===0 -> 'pass'`) — so this must be verified INDEPENDENTLY of both, straight
// against `gh api branches/<branch>/protection`, never trusted from provisioning's own exit code. A HARD
// signal per spec: an unauthenticated/non-admin `gh` NEVER silently reads as true — it reports
// `present: false` with evidence text starting `unverifiable: <why>`.
//
// EMPIRICAL GOTCHA (fix-round D1 — verified live): GitHub answers a NON-ADMIN token's GET on
// `branches/<b>/protection` with **HTTP 404 "Not Found"** — NOT 403 — even when the branch IS protected
// (verified: a token with `.permissions.admin == false` on volter-ai/open-autonomy, whose `main` is
// protected, gets a plain 404; same on torvalds/linux). So a bare 404 is AMBIGUOUS: it means either
// "genuinely unprotected" or "you can't see it". This function therefore pre-probes
// `gh api repos/<owner>/<repo> --jq .permissions.admin` FIRST and only interprets a protection-endpoint
// 404 as the genuine negative ("protection NOT applied") when the token is admin-confirmed; a non-admin
// token short-circuits to `unverifiable:` without ever touching the protection endpoint.

interface ProvisionBranchProtection {
  branch: string;
  required_checks: string[];
}
interface ProvisionJsonShape {
  branch_protection?: ProvisionBranchProtection;
}

function readProvisionJson(profileDir: string): ProvisionJsonShape | undefined {
  const path = join(profileDir, 'provision.json');
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as ProvisionJsonShape;
  } catch {
    return undefined;
  }
}

export async function a13ProvisionMatchesLiveProtection(installDir: string, ctx: SignalContext = {}): Promise<Signal> {
  if (!ctx.profileDir) {
    return { present: false, evidence: "unverifiable: no ctx.profileDir supplied — cannot locate the source profile's provision.json (not copied into a compiled install)" };
  }
  const provisionPath = join(ctx.profileDir, 'provision.json');
  const provision = readProvisionJson(ctx.profileDir);
  if (!provision) {
    return { present: false, evidence: `not-applicable: ${provisionPath} does not exist or is not valid JSON — this profile ships no provisioning manifest` };
  }
  if (!provision.branch_protection) {
    return { present: false, evidence: `not-applicable: ${provisionPath} declares no branch_protection — this profile has no live-protection requirement` };
  }
  const { branch, required_checks: required } = provision.branch_protection;
  const proc = ctx.proc ?? defaultProc;

  let repo = ctx.repo;
  if (!repo) {
    const r = proc('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], { cwd: installDir });
    if (r.status !== 0) {
      return { present: false, evidence: `unverifiable: cannot determine the target repo (gh repo view --json nameWithOwner failed: ${firstLine(r.stderr)})` };
    }
    repo = r.stdout.trim();
  }
  if (!repo) return { present: false, evidence: 'unverifiable: gh repo view returned an empty nameWithOwner' };

  // Admin pre-probe (fix-round D1 — see this section's header): GitHub 404s the protection endpoint for a
  // NON-ADMIN token even on a protected branch, so admin must be established BEFORE a 404 can be read as
  // "genuinely unprotected". A non-admin/unreadable-permissions token is `unverifiable:`, never a negative.
  const adminProbe = proc('gh', ['api', `repos/${repo}`, '--jq', '.permissions.admin'], { cwd: installDir });
  if (adminProbe.status !== 0) {
    const stderr = firstLine(adminProbe.stderr);
    if (/not logged in|authentication|HTTP 401|gh auth login/i.test(stderr)) {
      return { present: false, evidence: `unverifiable: gh not authenticated (gh api repos/${repo} --jq .permissions.admin: ${stderr})` };
    }
    return { present: false, evidence: `unverifiable: cannot read this token's repo permissions (gh api repos/${repo} --jq .permissions.admin: ${stderr})` };
  }
  const admin = adminProbe.stdout.trim();
  if (admin !== 'true') {
    return {
      present: false,
      evidence:
        `unverifiable: token lacks repo admin on ${repo} (gh api repos/${repo} --jq .permissions.admin=${admin || '(empty)'}) — ` +
        `GitHub answers a non-admin token's GET on branches/${branch}/protection with 404 even when the branch IS protected, so live protection cannot be read with this token`,
    };
  }

  const api = proc('gh', ['api', `repos/${repo}/branches/${branch}/protection`], { cwd: installDir });
  if (api.status !== 0) {
    const stderr = firstLine(api.stderr);
    if (/not logged in|authentication|HTTP 401|gh auth login/i.test(stderr)) {
      return { present: false, evidence: `unverifiable: gh not authenticated (gh api branches/${branch}/protection: ${stderr})` };
    }
    // 404 with an ADMIN-CONFIRMED token (the pre-probe above returned .permissions.admin=true) is the
    // genuine negative: the branch really has no protection rule ("Branch not protected").
    if (/HTTP 404|Not Found|Branch not protected/i.test(stderr)) {
      return {
        present: false,
        evidence: `protection NOT applied on ${repo}@${branch} (admin-confirmed token: .permissions.admin=true; gh api branches/${branch}/protection -> 404 "${stderr}") — ${provisionPath} requires [${required.join(', ')}]`,
      };
    }
    return { present: false, evidence: `unverifiable: gh api branches/${branch}/protection failed (${stderr})` };
  }

  let live: { required_status_checks?: { contexts?: string[] } };
  try {
    live = JSON.parse(api.stdout);
  } catch (e) {
    return { present: false, evidence: `unverifiable: gh api branches/${branch}/protection returned unparseable JSON (${(e as Error).message})` };
  }
  const liveContexts = live.required_status_checks?.contexts ?? [];
  const liveSet = new Set(liveContexts);
  const requiredSet = new Set(required);
  const missingLive = required.filter((c) => !liveSet.has(c));
  const extraLive = liveContexts.filter((c) => !requiredSet.has(c));
  if (missingLive.length) {
    return {
      present: false,
      evidence: `protection on ${repo}@${branch} is missing required check(s) declared in ${provisionPath}: [${missingLive.join(', ')}] (live contexts: [${liveContexts.join(', ')}])`,
    };
  }
  const exact = extraLive.length === 0;
  return {
    present: true,
    evidence: `protection on ${repo}@${branch} live required_status_checks.contexts=[${liveContexts.join(', ')}] ${exact ? 'exactly matches' : 'is a superset of'} ${provisionPath}'s required_checks=[${required.join(', ')}]`,
  };
}

// --- A14 — board-has-dispatchable-work: TA.2's hasDispatchableWork, wrapped -------------------------------

export async function a14BoardHasDispatchableWork(installDir: string, ctx: SignalContext = {}): Promise<Signal> {
  try {
    const verdict = hasDispatchableWork({
      cwd: installDir,
      proc: ctx.proc ?? defaultProc,
      ...(ctx.profileDir ? { profileDir: ctx.profileDir } : {}),
      ...(ctx.actor ? { actor: ctx.actor } : {}),
    });
    const allowlistNote = verdict.allowlistLabel ? `, allowlist=${verdict.allowlistLabel}` : '';
    return {
      present: verdict.actionable,
      evidence: `hasDispatchableWork(variant=${verdict.variant}, source=${verdict.source}${allowlistNote}): ${verdict.reason} (${verdict.actionableCount}/${verdict.readyCount} actionable/ready)`,
    };
  } catch (e) {
    return { present: false, evidence: `unverifiable: ${(e as Error)?.message ?? e}` };
  }
}

// --- the library surface: keyed by signal id, for a caller (or this unit's own fixture-walk proof) to
// run every deterministic signal in one pass. TB.2 (the maturity composer) is expected to import the
// individual `a<N>...` functions it needs directly rather than iterate this map — it is provided for
// exactly the acceptance shape this task's live proof needs: "paste a full signal-set dump at each stage".

export const IMM_SIGNALS: Record<string, SignalFn> = {
  A1: a1GeneratedJsonValid,
  A2: a2CompileClean,
  A3: a3AutonomyYmlParses,
  A4: a4PausedSeeded,
  A5: a5PausedAbsent,
  A6: a6HarnessCommitted,
  A8: a8a10DoctorPass,
  A10: a8a10DoctorPass,
  A11: a11PreflightPass,
  A12: a12GhPreflightReady,
  A13: a13ProvisionMatchesLiveProtection,
  A14: a14BoardHasDispatchableWork,
};

export async function collectImmSignals(installDir: string, ctx: SignalContext = {}): Promise<Record<string, Signal>> {
  const out: Record<string, Signal> = {};
  for (const [id, fn] of Object.entries(IMM_SIGNALS)) {
    out[id] = await fn(installDir, ctx);
  }
  return out;
}
