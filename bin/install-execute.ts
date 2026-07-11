#!/usr/bin/env bun
// TE.5 — Phase 4 EXECUTE + Phase 5 VALIDATE (OA-INSTALL-IMPLEMENTATION-TASKS.md#te5, DESIGN §Phase 4/§Phase
// 5 + hardening #4; docs/INSTALL-AGENT.md:203 "commit the harness first, wire the gate last";
// profiles/simple-sdlc/ir.yml:95-99 (seed-drafts-not-ready); scripts/provision-target-repo.ts:305
// (continues-on-failed-protection-PUT); scripts/open-autonomy-preflight.ts:189-194 (passes-with-zero-
// protection)).
//
// THIS IS AN ORCHESTRATION unit — it composes ALREADY-BUILT primitives into the dependency-ordered
// EXECUTE -> VALIDATE sequence. It never re-derives a signal/guard/compile/provision primitive; every
// step below cites the file it reuses and calls straight into it (a subprocess for a script, a function
// import for a package export).
//
// EXECUTE order (dependency order, "commit the harness first, wire the gate last"):
//   1. install deps        — bun/termfleet/ztrack presence, consuming TE.1's own DetectReport (--detect),
//                             never re-running detect's own probes.
//   2. compile              — `bun bin/autonomy-compile.ts <profile> <substrate> <repoDir>` (subprocess —
//                             autonomy-compile.ts is a top-level script, not an importable function; this
//                             is the same "reuse via subprocess" idiom TE.4's probe-PR step already uses).
//   3. write filled vision  — applies TE.3's ALREADY-GATHERED fill content (--direction-fill), never
//                             invents any. Re-verifies via TE.3's own `checkDirectionInvariant`
//                             (bin/install-direction.ts) — the exact function, not a re-derivation.
//   4. commit the harness   — git add + commit, pre/post-verified via guards.ts's own
//                             `checkUncommittedHarness` (packages/local-runner-cli/src/guards.ts) — reused
//                             verbatim as both the pre-check and the post-commit confirmation, never
//                             re-parsing `.open-autonomy/generated.json` a second way.
//   5. provider up (local)  — TG.1's own `bringUpProvider` (packages/local-runner-cli/src/provider.ts),
//                             reused verbatim; N/A for a gh-actions target.
//   6. CI + provision (gh)  — TA.3's own `ensureCiScaffold` (bin/ensure-ci-workflow.ts) then
//                             `scripts/provision-target-repo.ts` (subprocess — a top-level script) with
//                             the check names TE.4's probe-PR discovery found (or the pack's own
//                             `required_checks` when no live probe ran), THEN hardening #4's own
//                             independent verification: `a13ProvisionMatchesLiveProtection`
//                             (packages/local-runner-cli/src/imm-signals.ts) — the EXACT hard-signal
//                             function `oa maturity` itself uses for M3 — called directly here rather than
//                             trusting provisioning's own exit code (scripts/provision-target-repo.ts:305
//                             continues silently on a failed non-admin PUT). A present:false verdict of
//                             ANY kind (unverifiable, not-applicable, proven-negative) is a NAMED BLOCKER,
//                             never a silent pass. N/A for a local-git profile.
//   7. seed the board       — dispatches the profile's planner ONCE via the paused-safe primary dispatch
//                             channel TC.2's audit skill established (`AUTONOMY_AGENT=planner node
//                             scripts/run-agent.mjs` — no `.open-autonomy/paused` check, unlike
//                             runner-frontend.ts's `launch()`; see profiles/*/skills/audit/SKILL.md's
//                             "SETUP-COMPLETION MODE" section for the cited mechanism this reuses, only
//                             the agent name differs) or, on a gh-actions target, `gh workflow run
//                             planner.yml`. ⛔ SAFETY: dispatching this for real launches a real agent —
//                             this file only ever CONSTRUCTS the exact command and calls it through an
//                             injectable `proc`; this unit's own acceptance stubs `proc` so no agent is
//                             ever actually launched (see install-execute.test.ts + the PR body's explicit
//                             disclosure). This step never mutates board state itself (no ready/oa-approved
//                             label/state code path exists anywhere in this file) — promotion is entirely
//                             the dispatched planner's own doctrine (pr-139: "file drafts, never ready").
//
// A step's status is 'ok' | 'blocked' | 'skipped' (N/A for this profile/substrate — never a false pass).
// `runExecute` halts immediately on the first 'blocked' step (fail-closed, dependency order) — it never
// proceeds past a named blocker to a later step.
//
// VALIDATE (fail-closed, never a report that overstates readiness):
//   - `oa doctor`                         — reused verbatim (packages/local-runner-cli/src/doctor.ts).
//   - `oa maturity`                       — reused verbatim (packages/local-runner-cli/src/maturity.ts);
//                                            composes the IMM stage (M0..M6) incl. A13 as a HARD M3 signal.
//   - setup-completion DETERMINISTIC checks (TC.2's mode, the checklist logic only — never the
//     agent-judgment parts, same "cannot exercise a real agent launch" reasoning as EXECUTE step 7):
//       (a) direction filled       — TE.3's own `checkDirectionInvariant`, reused verbatim.
//       (b) board seeded w/ drafts — a NEW deterministic check (`checkBoardSeededWithDrafts` below):
//           deliberately NOT TA.2's `hasDispatchableWork` (that predicate asks about READY items filtered
//           through the day-one allowlist fence — a correctly-seeded, paused, pre-first-tick install has
//           ZERO ready items by design; see profiles/simple-sdlc/skills/audit/SKILL.md's own "(b) Board
//           seeded with >=1 draft" section, which draws this exact distinction). Reads the board at the
//           DRAFT rung directly, mirroring board-readiness.ts's own ztrack/gh-issues read shape.
//       (c) provision matches live protection — reads the A13 entry `oa maturity` ALREADY wrote to
//           `.open-autonomy/install.json` rather than re-probing `gh api` a second time for the same fact
//           (TC.2's own doctrine: "prefer TB.2's own recorded evidence over re-probing").
//       (d) first-tick smoke record — reads `.open-autonomy/install.json`'s `stage` + `readLastFires`
//           (packages/local-runner-cli/src/status.ts) — absent is EXPECTED (N/A, never FAIL) on a paused,
//           pre-first-tick install; this is the exact "MUST run correctly against a paused, pre-first-tick
//           install" premise TC.2's own SKILL.md documents for check (d).
//   - emits an IMM stage report and computes `canAdvanceToG4` — true ONLY when doctor passed, the install
//     reached >= M3/INSTALLED, and none of the four setup-completion checks FAILed. `canAdvanceToG4`
//     deliberately does NOT require reaching M4/ARMED: M4 requires a READY+allowlisted board item (A14),
//     and promoting the first item to ready IS G4a itself (TE.6, the human act) — Phase 4 EXECUTE seeds
//     DRAFTS ONLY by design (DESIGN's "the missing ready label IS the day-one dispatch fence"), so a
//     flawless, agent-only EXECUTE+VALIDATE pass can never reach M4 on its own; requiring it here would
//     make `canAdvanceToG4` permanently false even on a perfect install — an UNDERSTATEMENT of readiness,
//     the same failure class this program's standing rules forbid in the other direction (an overclaim).
//     The one maturity blocker treated as this expected hand-off point (never a defect) is exactly "M4
//     blocked: A14 board has no dispatchable work" — every other hard signal fail still fully blocks.
//
// Test-glob note (same pattern as every TE.*/TA.3 sibling): wired into its own `check:install-execute`
// package.json script, added to the `check` composite.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { SetupPack } from '@open-autonomy/core';
import { profilesRoot as bundledProfilesRoot } from './bundled-profiles';
import { ensureCiScaffold, formatCiScaffoldResult, type CiScaffoldResult } from './ensure-ci-workflow.ts';
import { checkDirectionInvariant, type InvariantResult } from './install-direction.ts';
import type { ProcResult, ProcRunner } from '../packages/local-runner-cli/src/types.ts';
import { defaultProc, firstLine } from '../packages/local-runner-cli/src/proc.ts';
import { checkUncommittedHarness } from '../packages/local-runner-cli/src/guards.ts';
import { doctor, formatDoctorReport, type DoctorReport } from '../packages/local-runner-cli/src/doctor.ts';
import {
  computeMaturity,
  STAGE_ORDER,
  type InstallRecord,
  type MaturityOptions,
  type SessionProbe,
  type Stage,
} from '../packages/local-runner-cli/src/maturity.ts';
import { a13ProvisionMatchesLiveProtection, type Signal, type SignalContext } from '../packages/local-runner-cli/src/imm-signals.ts';
import { resolveBoardKind } from '../packages/local-runner-cli/src/board-readiness.ts';
import { PARKED_LABELS } from '../packages/local-runner-cli/src/eligibility.ts';
import { bringUpProvider, readSchedulePin, type BringUpOptions } from '../packages/local-runner-cli/src/provider.ts';
import { readLastFires } from '../packages/local-runner-cli/src/status.ts';

export { defaultProc, firstLine };
export type { ProcResult, ProcRunner };

// =========================================================================================================
// Input records — structural reads of TE.2's SelectionRecord and TE.4's AuthorizeRecord. Deliberately NOT
// a re-import of their internal types (same discipline as TE.3/TE.4's own `SelectionRecordRef`): a minimal
// structural contract this file actually consumes, loud on anything malformed.
// =========================================================================================================

export type Substrate = 'local' | 'gh-actions';

export interface SelectionRecordRef {
  profile: string;
  substrate: Substrate;
  pack: SetupPack;
  detect: { repoDir: string; [k: string]: unknown };
  [k: string]: unknown;
}

export function loadSelectionRecord(file: string): SelectionRecordRef {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (e) {
    throw new Error(`--record ${file}: could not read file (${(e as Error).message ?? e})`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`--record ${file}: not valid JSON (${(e as Error).message ?? e})`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`--record ${file}: malformed selection record — expected a JSON object shaped like TE.2's SelectionRecord, got ${Array.isArray(parsed) ? 'an array' : typeof parsed}`);
  }
  const r = parsed as Partial<SelectionRecordRef>;
  if (typeof r.profile !== 'string' || !r.profile) throw new Error(`--record ${file}: missing/invalid "profile"`);
  if (!r.pack || typeof r.pack !== 'object' || typeof (r.pack as { codeHost?: unknown }).codeHost !== 'string') {
    throw new Error(`--record ${file}: missing/invalid "pack.codeHost" (expected an instantiated SetupPack)`);
  }
  if (!r.detect || typeof r.detect !== 'object' || typeof (r.detect as { repoDir?: unknown }).repoDir !== 'string') {
    throw new Error(`--record ${file}: missing/invalid "detect.repoDir"`);
  }
  if (r.substrate !== 'local' && r.substrate !== 'gh-actions') {
    throw new Error(`--record ${file}: "substrate" must be 'local' or 'gh-actions' (got ${JSON.stringify(r.substrate)})`);
  }
  return r as SelectionRecordRef;
}

export type CheckNameDiscoveryRef =
  | { status: 'discovered'; prNumber: number; checks: string[] }
  | { status: 'deferred' | 'not-applicable' | 'error'; [k: string]: unknown };

export interface AuthorizeRecordRef {
  profile: string;
  substrate: Substrate;
  checkNameDiscovery?: CheckNameDiscoveryRef;
  [k: string]: unknown;
}

export function loadAuthorizeRecord(file: string): AuthorizeRecordRef {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (e) {
    throw new Error(`--authorize ${file}: could not read file (${(e as Error).message ?? e})`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`--authorize ${file}: not valid JSON (${(e as Error).message ?? e})`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`--authorize ${file}: malformed authorize record — expected a JSON object shaped like TE.4's AuthorizeRecord`);
  }
  const r = parsed as Partial<AuthorizeRecordRef>;
  if (typeof r.profile !== 'string' || !r.profile) throw new Error(`--authorize ${file}: missing/invalid "profile"`);
  return r as AuthorizeRecordRef;
}

// The direction-fill input (--direction-fill): the ALREADY-GATHERED content TE.3 (Phase 2) obtained from
// the human/operator — TE.5 applies it verbatim, it never invents any of it. `{ files: [{path, content}] }`
// — repo-relative paths + their final text, written straight into the compiled repoDir.
export interface DirectionFillFile {
  files: Array<{ path: string; content: string }>;
}

export function loadDirectionFill(file: string): DirectionFillFile {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (e) {
    throw new Error(`--direction-fill ${file}: could not read file (${(e as Error).message ?? e})`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`--direction-fill ${file}: not valid JSON (${(e as Error).message ?? e})`);
  }
  const p = parsed as Partial<DirectionFillFile>;
  if (!Array.isArray(p.files) || p.files.some((f) => typeof f?.path !== 'string' || typeof f?.content !== 'string')) {
    throw new Error(`--direction-fill ${file}: expected {"files":[{"path":"...","content":"..."}]}`);
  }
  return { files: p.files };
}

// A minimal structural read of TE.1's DetectReport (bin/install-detect.ts) — just the `tools` leaf this
// file's own installDeps step needs. Never re-derives detect's own probing logic.
interface MinimalDetectTools {
  bun?: { present: boolean };
  termfleet?: { installed: boolean };
  ztrack?: { vendored: boolean; global: boolean };
}
function loadDetectToolsFacts(file: string): MinimalDetectTools | undefined {
  let raw: { tools?: MinimalDetectTools };
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`--detect ${file}: could not read/parse TE.1 detect report (${(e as Error).message ?? e})`);
  }
  return raw.tools;
}

// =========================================================================================================
// Step result shape shared by every EXECUTE step.
// =========================================================================================================

export type StepStatus = 'ok' | 'blocked' | 'skipped';

export interface ExecuteStepResult {
  id: string;
  status: StepStatus;
  detail: string;
  [k: string]: unknown;
}

function step(id: string, status: StepStatus, detail: string, extra: Record<string, unknown> = {}): ExecuteStepResult {
  return { id, status, detail, ...extra };
}

function profileDirOf(profilesRoot: string, profile: string): string {
  return join(profilesRoot, profile);
}

// =========================================================================================================
// Step 1 — install deps (bun/termfleet/ztrack), consuming TE.1's own DetectReport when supplied.
// =========================================================================================================

export function stepInstallDeps(sel: SelectionRecordRef, opts: { proc: ProcRunner; detectFile?: string }): ExecuteStepResult {
  const repoDir = sel.detect.repoDir;
  let tools: MinimalDetectTools | undefined;
  if (opts.detectFile) {
    try {
      tools = loadDetectToolsFacts(opts.detectFile);
    } catch (e) {
      return step('install-deps', 'blocked', (e as Error).message);
    }
  }
  const notes: string[] = [];
  const toolSource = tools ? "TE.1's own DetectReport (--detect)" : 'a minimal node_modules presence read (no --detect supplied — never a re-derivation of TE.1\'s own probing logic)';

  // ztrack: every profile routes through it (CLAUDE.md: "all four route through ztrack").
  const ztrackPresent = tools ? Boolean(tools.ztrack?.vendored || tools.ztrack?.global) : existsSync(join(repoDir, 'node_modules', 'ztrack'));
  if (!ztrackPresent) {
    const r = opts.proc('npm', ['install', '-D', 'ztrack@1.0.0'], { cwd: repoDir });
    if (r.status !== 0) return step('install-deps', 'blocked', `npm install -D ztrack@1.0.0 failed (exit ${r.status}): ${firstLine(r.stderr || r.stdout)}`);
    notes.push('installed ztrack@1.0.0 (was absent)');
  } else {
    notes.push(`ztrack present (source: ${toolSource})`);
  }

  // termfleet: only the local substrate drives agent sessions through it.
  if (sel.substrate === 'local') {
    const termfleetPresent = tools ? Boolean(tools.termfleet?.installed) : existsSync(join(repoDir, 'node_modules', 'termfleet'));
    if (!termfleetPresent) {
      const r = opts.proc('npm', ['install', 'termfleet'], { cwd: repoDir });
      if (r.status !== 0) return step('install-deps', 'blocked', `npm install termfleet failed (exit ${r.status}): ${firstLine(r.stderr || r.stdout)}`);
      notes.push('installed termfleet (was absent)');
    } else {
      notes.push(`termfleet present (source: ${toolSource})`);
    }
  } else {
    notes.push('substrate=gh-actions — termfleet not required (no local agent sessions)');
  }

  notes.push('bun present (this orchestrator runs under bun)');
  return step('install-deps', 'ok', notes.join('; '));
}

// =========================================================================================================
// Step 2 — compile the profile onto the substrate. `bun bin/autonomy-compile.ts` is a top-level script
// (import.meta.main body), not an importable function — reused via subprocess, the same idiom TE.4's
// probe-PR step already uses for `gh`/`git`.
// =========================================================================================================

// A plain repo-root-relative literal (never `dirname(fileURLToPath(import.meta.url))`) — this file, like
// every TE.1-4 sibling (install-detect/select/direction/authorize.ts), is dev-time-only monorepo tooling,
// always invoked as `bun bin/install-execute.ts ...` from the repo root, never part of the published
// `dist/cli.js` bundle. `scripts/build-cli.ts`'s own static sibling-read scanner (which DOES cover every
// `bin/*.ts` file) would otherwise flag a computed-from-import.meta.url reference to `autonomy-compile.ts`
// as an unresolvable bundle path (dist/cli.js never contains a copy of it, correctly) — a plain literal
// avoids that false positive entirely rather than papering over it with a DATA_FILES registration this
// bundle has no business carrying.
const AUTONOMY_COMPILE_SCRIPT = 'bin/autonomy-compile.ts';
const PROVISION_TARGET_REPO_SCRIPT = 'scripts/provision-target-repo.ts';

export function stepCompile(sel: SelectionRecordRef, opts: { proc: ProcRunner; force?: boolean }): ExecuteStepResult {
  const args = [AUTONOMY_COMPILE_SCRIPT, sel.profile, sel.substrate, sel.detect.repoDir];
  if (opts.force) args.push('--force');
  const r = opts.proc('bun', args, {});
  if (r.status !== 0) {
    return step('compile', 'blocked', `bun bin/autonomy-compile.ts ${sel.profile} ${sel.substrate} ${sel.detect.repoDir} failed (exit ${r.status}): ${firstLine(r.stderr || r.stdout)}`);
  }
  return step('compile', 'ok', `compiled ${sel.profile}@${sel.substrate} into ${sel.detect.repoDir}: ${firstLine(r.stdout)}`);
}

// =========================================================================================================
// Step 3 — write the filled vision/constitution (TE.3's already-gathered output). Never invents content;
// re-verifies via TE.3's own checkDirectionInvariant (bin/install-direction.ts), reused verbatim.
// =========================================================================================================

function applyDirectionFill(repoDir: string, fill: DirectionFillFile): string[] {
  const written: string[] = [];
  for (const f of fill.files) {
    const abs = join(repoDir, f.path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, f.content);
    written.push(f.path);
  }
  return written;
}

export function stepDirectionFill(sel: SelectionRecordRef, opts: { fillFile?: string; profileDir: string }): ExecuteStepResult {
  const repoDir = sel.detect.repoDir;
  const before: InvariantResult = checkDirectionInvariant(sel.pack, opts.profileDir, repoDir);
  if (before.satisfied) {
    return step('direction-fill', 'skipped', `direction invariant already satisfied — nothing to apply (${before.reason})`);
  }
  if (!opts.fillFile) {
    return step(
      'direction-fill',
      'blocked',
      `direction invariant not satisfied (${before.reason}) and no --direction-fill supplied — TE.5 applies already-gathered fill content, it never invents it; re-invoke with --direction-fill <file> once TE.3's output has been obtained.`,
    );
  }
  let fill: DirectionFillFile;
  try {
    fill = loadDirectionFill(opts.fillFile);
  } catch (e) {
    return step('direction-fill', 'blocked', (e as Error).message);
  }
  const written = applyDirectionFill(repoDir, fill);
  const after: InvariantResult = checkDirectionInvariant(sel.pack, opts.profileDir, repoDir);
  if (!after.satisfied) {
    return step('direction-fill', 'blocked', `applied --direction-fill (${written.join(', ') || '(no files)'}) but the invariant is STILL not satisfied: ${after.reason}`);
  }
  return step('direction-fill', 'ok', `applied --direction-fill (${written.join(', ')}) — invariant now satisfied: ${after.reason}`);
}

// =========================================================================================================
// Step 4 — commit the harness. Pre-check AND post-commit verification both go through guards.ts's own
// `checkUncommittedHarness` — never a second manifest-diffing implementation.
// =========================================================================================================

export function stepCommitHarness(sel: SelectionRecordRef, opts: { proc: ProcRunner }): ExecuteStepResult {
  const repoDir = sel.detect.repoDir;
  const manifestPath = join(repoDir, '.open-autonomy', 'generated.json');
  if (!existsSync(manifestPath)) {
    // checkUncommittedHarness itself reads an absent manifest as ok:true ("nothing declared, nothing to
    // check") — correct for ITS purpose (a schedule with no compiled harness has nothing to guard), but
    // wrong for THIS step's own precondition: compile must have run before there is anything to commit.
    return step('commit-harness', 'blocked', `${manifestPath} does not exist — the compile step must run first`);
  }
  const pre = checkUncommittedHarness(repoDir, opts.proc);
  if (pre.ok && !pre.message) {
    return step('commit-harness', 'skipped', 'harness already fully committed — nothing to do (checkUncommittedHarness reports clean)');
  }
  let files: string[] = [];
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    files = Array.isArray(manifest.files) ? manifest.files : [];
  } catch (e) {
    return step('commit-harness', 'blocked', `${manifestPath}: unparseable (${(e as Error).message})`);
  }
  if (!files.length) {
    return step('commit-harness', 'blocked', `${manifestPath} lists 0 files — nothing to commit; compile likely did not run correctly`);
  }
  const add = opts.proc('git', ['add', '-f', '--', ...files], { cwd: repoDir });
  if (add.status !== 0) return step('commit-harness', 'blocked', `git add failed (exit ${add.status}): ${firstLine(add.stderr || add.stdout)}`);
  const commit = opts.proc('git', ['commit', '-m', 'Install the open-autonomy harness'], { cwd: repoDir });
  if (commit.status !== 0) return step('commit-harness', 'blocked', `git commit failed (exit ${commit.status}): ${firstLine(commit.stderr || commit.stdout)}`);
  const post = checkUncommittedHarness(repoDir, opts.proc);
  if (!post.ok) return step('commit-harness', 'blocked', `committed, but checkUncommittedHarness STILL reports uncommitted/gitignored harness files: ${post.message}`);
  return step('commit-harness', 'ok', `committed ${files.length} harness file(s) — checkUncommittedHarness confirms clean`);
}

// =========================================================================================================
// Step 5 — provider up (local target only). TG.1's own bringUpProvider, reused verbatim.
// =========================================================================================================

export async function stepProviderUp(sel: SelectionRecordRef, opts: { bringUp?: Partial<BringUpOptions> } = {}): Promise<ExecuteStepResult> {
  if (sel.substrate !== 'local') {
    return step('provider-up', 'skipped', `substrate=${sel.substrate} — provider bring-up only applies to the local substrate`);
  }
  let result;
  try {
    result = await bringUpProvider({ cwd: sel.detect.repoDir, ...opts.bringUp });
  } catch (e) {
    // bringUpProvider THROWS (rather than returning 'foreign-occupant-refused') once it exhausts every
    // candidate port pair to a foreign occupant on a fresh bring-up — never let that propagate as an
    // unhandled rejection out of an orchestration step; it is exactly as much a named blocker as the
    // returned-result case below.
    return step('provider-up', 'blocked', (e as Error).message ?? String(e));
  }
  if (result.action === 'foreign-occupant-refused') {
    return step('provider-up', 'blocked', result.detail);
  }
  return step('provider-up', 'ok', result.detail, { providerUrl: result.providerUrl });
}

// =========================================================================================================
// Step 6 — CI scaffold + provisioning (github target only). TA.3's ensureCiScaffold, then
// scripts/provision-target-repo.ts (subprocess), then hardening #4's independent live-protection
// verification via a13ProvisionMatchesLiveProtection (the exact function `oa maturity` uses for M3).
// =========================================================================================================

export async function stepCiAndProvision(
  sel: SelectionRecordRef,
  authRecord: AuthorizeRecordRef | undefined,
  opts: { proc: ProcRunner; profilesRoot: string; ownerRepo?: string },
): Promise<ExecuteStepResult> {
  if (sel.pack.codeHost !== 'github') {
    return step('ci-and-provision', 'skipped', `codeHost=${sel.pack.codeHost} — no CI scaffold/provisioning needed`);
  }
  const repoDir = sel.detect.repoDir;
  const profileDir = profileDirOf(opts.profilesRoot, sel.profile);

  // Fail fast on missing required input BEFORE any filesystem mutation (ensureCiScaffold below writes a
  // workflow file to repoDir) — a loud usage error, never a side effect first.
  if (!opts.ownerRepo) {
    return step('ci-and-provision', 'blocked', 'no --owner-repo <owner/name> supplied — a GitHub-target EXECUTE cannot provision without knowing the real target repo');
  }

  const ci: CiScaffoldResult = ensureCiScaffold(repoDir, sel.pack);
  if (!ci.ok) {
    return step('ci-and-provision', 'blocked', `TA.3 CI scaffold BLOCKED: ${ci.blocker}`);
  }

  const discovered = authRecord?.checkNameDiscovery;
  let requiredChecks: string[] | undefined;
  let checkNameSource: string;
  if (discovered?.status === 'discovered') {
    requiredChecks = discovered.checks;
    checkNameSource = `TE.4 probe-PR discovery (PR #${discovered.prNumber})`;
  } else {
    requiredChecks = sel.pack.required_checks;
    checkNameSource = `pack.required_checks fallback — no live TE.4 probe was run (checkNameDiscovery.status=${discovered?.status ?? '(no authorize record supplied)'})`;
  }
  if (!requiredChecks || requiredChecks.length === 0) {
    return step('ci-and-provision', 'blocked', 'no required check names available (neither a TE.4 probe-PR discovery nor pack.required_checks) — refusing to provision branch protection blind');
  }

  const provisionSrc = join(profileDir, 'provision.json');
  if (!existsSync(provisionSrc)) {
    return step('ci-and-provision', 'blocked', `profile "${sel.profile}" ships no provision.json — cannot provision a github target`);
  }
  let manifest: { branch_protection?: { required_checks?: string[]; [k: string]: unknown }; [k: string]: unknown };
  try {
    manifest = JSON.parse(readFileSync(provisionSrc, 'utf8'));
  } catch (e) {
    return step('ci-and-provision', 'blocked', `${provisionSrc}: unparseable (${(e as Error).message})`);
  }
  if (!manifest.branch_protection) {
    return step('ci-and-provision', 'blocked', `${provisionSrc} declares no branch_protection block`);
  }
  manifest.branch_protection.required_checks = requiredChecks;
  const patchedManifestPath = join(repoDir, '.open-autonomy-install-provision.json');
  writeFileSync(patchedManifestPath, JSON.stringify(manifest, null, 2));

  const prov = opts.proc('bun', [PROVISION_TARGET_REPO_SCRIPT, '--repo', opts.ownerRepo, '--source', repoDir, '--manifest', patchedManifestPath], {});
  const provisionExitOk = prov.status === 0;

  // HARDENING #4: never trust the exit code above — provision-target-repo.ts:305 continues silently on a
  // failed non-admin protection PUT. Independently re-verify via the EXACT hard-signal function `oa
  // maturity` uses for M3 (imm-signals.ts's a13ProvisionMatchesLiveProtection) — a present:false verdict
  // of ANY kind (unverifiable/not-applicable/proven-negative) is a NAMED BLOCKER, never a silent pass.
  const ctx: SignalContext = { profileDir, proc: opts.proc, repo: opts.ownerRepo };
  const a13: Signal = await a13ProvisionMatchesLiveProtection(repoDir, ctx);
  if (!a13.present) {
    return step(
      'ci-and-provision',
      'blocked',
      `provision-target-repo ${provisionExitOk ? 'exited 0' : `FAILED (exit ${prov.status})`} but the independent live-protection verification (hardening #4, A13) did NOT confirm protection — NAMED BLOCKER, never waved through: ${a13.evidence}`,
    );
  }
  return step(
    'ci-and-provision',
    'ok',
    `CI scaffold: ${formatCiScaffoldResult(ci) || '(no authored-workflow checks needed)'}; provisioned with checks [${requiredChecks.join(', ')}] (source: ${checkNameSource}); independently verified live protection: ${a13.evidence}`,
  );
}

// =========================================================================================================
// Step 7 — seed the board with DRAFT items only. Dispatches the profile's planner ONCE via the paused-safe
// primary dispatch channel TC.2's audit skill established. ⛔ Real dispatch launches a real agent — this
// function only ever constructs+calls the command through an injectable proc; this unit's own acceptance
// stubs it (see PR body's explicit mocked-sequencing disclosure). Never mutates board state itself.
// =========================================================================================================

export interface DispatchCommand {
  cmd: string;
  args: string[];
  env?: Record<string, string>;
}

/** `repoDir` is REQUIRED for a local-substrate command (not optional) — see the "install-scoped, never
 *  ambient" note below; this is a deliberate signature change from an earlier draft that omitted it (found
 *  live, see this file's own PR-body incident note). */
export function buildPlannerDispatchCommand(substrate: Substrate, repoDir: string | undefined, ownerRepo?: string): DispatchCommand {
  if (substrate === 'local') {
    // INSTALL-SCOPED, NEVER AMBIENT (live-verified incident during this unit's own acceptance proof — see
    // PR body): a bare `node scripts/run-agent.mjs` with no TERMFLEET_PROVIDER_URL falls back to the
    // runner SDK's own default/auto-discovery, which on a shared box can resolve to a DIFFERENT, already-
    // running, box-wide ambient termfleet provider rather than THIS install's own TG.1-pinned one — exactly
    // the OA-09 hazard docs/OPERATIONS.md's stop-conditions warn about ("a termfleet provider can launch
    // terminal sessions as your user, box-wide"). Mirrors maturity.ts's own
    // `defaultInstallScopedSessionProbe`: force TERMFLEET_PROVIDER_URL to this install's OWN
    // scheduler/schedule.json pin (TG.1's durable artifact, via provider.ts's `readSchedulePin`) whenever
    // one exists, so a real dispatch can only ever reach the provider THIS install's own Phase-4 step 5
    // brought up — never an unrelated ambient one.
    const env: Record<string, string> = { AUTONOMY_AGENT: 'planner' };
    if (repoDir) {
      const pin = readSchedulePin(repoDir);
      if (pin) env.TERMFLEET_PROVIDER_URL = pin;
    }
    return { cmd: 'node', args: ['scripts/run-agent.mjs'], env };
  }
  const args = ['workflow', 'run', 'planner.yml'];
  if (ownerRepo) args.push('--repo', ownerRepo);
  return { cmd: 'gh', args };
}

export interface SeedBoardResult extends ExecuteStepResult {
  command: DispatchCommand;
}

export function stepSeedBoardDrafts(sel: SelectionRecordRef, opts: { proc: ProcRunner; ownerRepo?: string }): SeedBoardResult {
  const command = buildPlannerDispatchCommand(sel.substrate, sel.detect.repoDir, opts.ownerRepo);
  const env = command.env ? { ...process.env, ...command.env } : process.env;
  const r = opts.proc(command.cmd, command.args, { cwd: sel.detect.repoDir, env });
  if (r.status !== 0) {
    return { ...step('seed-board-drafts', 'blocked', `planner dispatch failed (${command.cmd} ${command.args.join(' ')}, exit ${r.status}): ${firstLine(r.stderr || r.stdout)}`), command };
  }
  return {
    ...step(
      'seed-board-drafts',
      'ok',
      `dispatched the planner once via ${command.cmd} ${command.args.join(' ')} — seeds DRAFT items only; never self-promotes to ready/oa-approved (that is the planner's own doctrine, pr-139: "file drafts, never ready" — this orchestrator holds no board-mutation code path of its own).`,
    ),
    command,
  };
}

// =========================================================================================================
// runExecute — the orchestrator. Fail-closed: halts on the first 'blocked' step (dependency order); a
// 'skipped' step (N/A for this profile/substrate) never halts the sequence.
// =========================================================================================================

export interface ExecuteOptions {
  record: string;
  authorize?: string;
  directionFill?: string;
  detect?: string;
  repoDir?: string;
  profilesRoot?: string;
  ownerRepo?: string;
  force?: boolean;
  proc?: ProcRunner;
  bringUp?: Partial<BringUpOptions>;
}

export interface ExecuteReport {
  ok: boolean;
  profile: string;
  substrate: Substrate;
  steps: ExecuteStepResult[];
  blocker?: string;
}

export async function runExecute(opts: ExecuteOptions): Promise<ExecuteReport> {
  const proc = opts.proc ?? defaultProc;
  const sel = loadSelectionRecord(opts.record);
  if (opts.repoDir) sel.detect.repoDir = opts.repoDir;
  const profilesRoot = opts.profilesRoot ?? bundledProfilesRoot;
  const profileDir = profileDirOf(profilesRoot, sel.profile);

  let authRecord: AuthorizeRecordRef | undefined;
  if (opts.authorize) authRecord = loadAuthorizeRecord(opts.authorize);

  const steps: ExecuteStepResult[] = [];
  const halted = (): ExecuteReport | undefined => {
    const last = steps.at(-1)!;
    if (last.status === 'blocked') return { ok: false, profile: sel.profile, substrate: sel.substrate, steps, blocker: last.detail };
    return undefined;
  };

  steps.push(stepInstallDeps(sel, { proc, detectFile: opts.detect }));
  {
    const h = halted();
    if (h) return h;
  }

  steps.push(stepCompile(sel, { proc, force: opts.force }));
  {
    const h = halted();
    if (h) return h;
  }

  steps.push(stepDirectionFill(sel, { fillFile: opts.directionFill, profileDir }));
  {
    const h = halted();
    if (h) return h;
  }

  steps.push(stepCommitHarness(sel, { proc }));
  {
    const h = halted();
    if (h) return h;
  }

  steps.push(await stepProviderUp(sel, { bringUp: opts.bringUp }));
  {
    const h = halted();
    if (h) return h;
  }

  steps.push(await stepCiAndProvision(sel, authRecord, { proc, profilesRoot, ownerRepo: opts.ownerRepo }));
  {
    const h = halted();
    if (h) return h;
  }

  steps.push(stepSeedBoardDrafts(sel, { proc, ownerRepo: opts.ownerRepo }));
  {
    const h = halted();
    if (h) return h;
  }

  return { ok: true, profile: sel.profile, substrate: sel.substrate, steps };
}

export function renderExecuteHuman(report: ExecuteReport): string {
  const lines: string[] = [];
  lines.push(`EXECUTE (Phase 4) — ${report.profile}@${report.substrate}`);
  lines.push('='.repeat(60));
  for (const s of report.steps) lines.push(`[${s.status.toUpperCase().padEnd(8)}] ${s.id}: ${s.detail}`);
  lines.push('');
  lines.push(report.ok ? 'EXECUTE: all steps ok/skipped' : `EXECUTE: BLOCKED — ${report.blocker}`);
  return lines.join('\n');
}

// =========================================================================================================
// VALIDATE (Phase 5) — fail-closed, always runs the report legs (never halts early — a report verb, like
// `oa doctor`/`oa maturity` themselves), composes an honest `canAdvanceToG4` verdict.
// =========================================================================================================

export interface SetupCompletionCheck {
  status: 'PASS' | 'FAIL' | 'N/A';
  detail: string;
}

export interface BoardDraftCheckResult {
  status: 'PASS' | 'FAIL';
  detail: string;
  count: number;
  variant: string;
}

/** (b) Board seeded with >=1 draft — deliberately NOT TA.2's hasDispatchableWork (see file header). Reads
 *  the board at the DRAFT rung directly, mirroring board-readiness.ts's own ztrack/gh-issues read shape
 *  (readyItemsZtrack/readyItemsGhIssues) but for 'draft' state instead of 'ready'. */
export function checkBoardSeededWithDrafts(opts: { repoDir: string; profileDir?: string; actor?: string; proc: ProcRunner }): BoardDraftCheckResult {
  let kind: ReturnType<typeof resolveBoardKind>;
  try {
    kind = resolveBoardKind({ profileDir: opts.profileDir, actor: opts.actor });
  } catch (e) {
    return { status: 'FAIL', detail: `cannot resolve this profile's board kind: ${(e as Error).message}`, count: 0, variant: 'unknown' };
  }

  if (kind.variant === 'gh-issues') {
    const r = opts.proc('gh', ['issue', 'list', '--state', 'open', '--json', 'number,labels', '--limit', '100'], { cwd: opts.repoDir });
    if (r.status !== 0) return { status: 'FAIL', detail: `gh issue list failed: ${firstLine(r.stderr || r.stdout)}`, count: 0, variant: kind.variant };
    let rows: Array<{ number?: number; labels?: Array<{ name: string }> }> = [];
    try {
      rows = JSON.parse(r.stdout || '[]');
    } catch {
      rows = [];
    }
    const drafts = (Array.isArray(rows) ? rows : []).filter((row) => row.number !== undefined && !(row.labels ?? []).some((l) => l.name === 'ready' || PARKED_LABELS.has(l.name)));
    return drafts.length > 0
      ? { status: 'PASS', detail: `${drafts.length} draft item(s) — open issue(s) carrying no 'ready'/parked label, e.g. #${drafts[0]!.number}`, count: drafts.length, variant: kind.variant }
      : { status: 'FAIL', detail: 'board seeded with 0 draft items (gh-issues board)', count: 0, variant: kind.variant };
  }

  const r = opts.proc('npx', ['ztrack', 'issue', 'list', '--state', 'draft', '--json', 'identifier'], { cwd: opts.repoDir });
  if (r.status !== 0) return { status: 'FAIL', detail: `ztrack issue list --state draft failed: ${firstLine(r.stderr || r.stdout)}`, count: 0, variant: kind.variant };
  let rows: Array<{ identifier?: string }> = [];
  try {
    rows = JSON.parse(r.stdout || '[]');
  } catch {
    rows = [];
  }
  const ids = (Array.isArray(rows) ? rows : []).filter((row): row is { identifier: string } => !!row.identifier).map((row) => row.identifier);
  return ids.length > 0
    ? { status: 'PASS', detail: `${ids.length} draft item(s), e.g. ${ids[0]}`, count: ids.length, variant: kind.variant }
    : { status: 'FAIL', detail: 'board seeded with 0 draft items (ztrack board)', count: 0, variant: kind.variant };
}

export interface SetupCompletionChecks {
  direction: SetupCompletionCheck;
  boardDrafts: BoardDraftCheckResult;
  provisionMatchesProtection: SetupCompletionCheck;
  firstTickSmoke: SetupCompletionCheck;
}

export interface ValidateOptions {
  record: string;
  repoDir?: string;
  profilesRoot?: string;
  proc?: ProcRunner;
  fetchImpl?: typeof fetch;
  live?: boolean;
  sessionProbe?: SessionProbe;
}

export interface ValidateReport {
  profile: string;
  substrate: Substrate;
  doctor: DoctorReport;
  maturity: InstallRecord;
  setupCompletion: SetupCompletionChecks;
  canAdvanceToG4: boolean;
  blockers: string[];
}

export async function runValidate(opts: ValidateOptions): Promise<ValidateReport> {
  const proc = opts.proc ?? defaultProc;
  const sel = loadSelectionRecord(opts.record);
  if (opts.repoDir) sel.detect.repoDir = opts.repoDir;
  const repoDir = sel.detect.repoDir;
  const profilesRoot = opts.profilesRoot ?? bundledProfilesRoot;
  const profileDir = profileDirOf(profilesRoot, sel.profile);
  const pack = sel.pack;
  const live = opts.live ?? true;

  const doctorReport = await doctor({ cwd: repoDir, proc, fetchImpl: opts.fetchImpl, live });

  const maturityOpts: MaturityOptions = { cwd: repoDir, profileDir, proc, live };
  if (opts.fetchImpl) maturityOpts.fetchImpl = opts.fetchImpl;
  if (opts.sessionProbe) maturityOpts.sessionProbe = opts.sessionProbe;
  const maturity = await computeMaturity(maturityOpts);

  // (a) direction filled — TE.3's own mechanical invariant.
  const directionInvariant: InvariantResult = checkDirectionInvariant(pack, profileDir, repoDir);
  const direction: SetupCompletionCheck =
    directionInvariant.mode === 'none'
      ? { status: 'N/A', detail: directionInvariant.reason }
      : { status: directionInvariant.satisfied ? 'PASS' : 'FAIL', detail: directionInvariant.reason };

  // (b) board seeded with drafts — new deterministic check.
  const boardDrafts = checkBoardSeededWithDrafts({ repoDir, profileDir, proc });

  // (c) provision matches live protection — prefer TB.2's own recorded A13 evidence, never re-probe.
  let provisionMatchesProtection: SetupCompletionCheck;
  if (pack.codeHost !== 'github') {
    provisionMatchesProtection = { status: 'N/A', detail: 'codeHost=local-git — no code-host branch-protection concept exists' };
  } else {
    const a13 = maturity.signals.find((s) => s.id === 'A13');
    if (!a13) {
      provisionMatchesProtection = { status: 'FAIL', detail: 'no A13 signal recorded in .open-autonomy/install.json — oa maturity did not evaluate it for this target' };
    } else if (a13.present) {
      provisionMatchesProtection = { status: 'PASS', detail: a13.evidence };
    } else if (/^unverifiable:/.test(a13.evidence)) {
      provisionMatchesProtection = { status: 'N/A', detail: `unverifiable (never a blocking negative) — ${a13.evidence}` };
    } else if (/^not-applicable:/.test(a13.evidence)) {
      provisionMatchesProtection = { status: 'N/A', detail: a13.evidence };
    } else {
      provisionMatchesProtection = { status: 'FAIL', detail: a13.evidence };
    }
  }

  // (d) first-tick smoke — expected absent pre-first-tick (N/A, never FAIL).
  const fires = readLastFires(repoDir);
  const stageIdx = STAGE_ORDER.indexOf(maturity.stage);
  const m4Idx = STAGE_ORDER.indexOf('M4' as Stage);
  const firstTickSmoke: SetupCompletionCheck =
    fires.length > 0 || stageIdx > m4Idx
      ? { status: 'PASS', detail: `${fires.length} last-fire record(s) and/or stage=${maturity.stage} indicate a first tick already happened` }
      : { status: 'N/A', detail: `no first-tick evidence yet (0 last-fire records, stage=${maturity.stage}) — expected for a paused, pre-first-tick install, not a setup blocker` };

  // G4 IS the human promotion act (TE.6's G4a: "human promotes the first item to ready/oa-approved") — the
  // very thing that unblocks oa maturity's own M4/ARMED rung (A14 requires a READY+allowlisted item; Phase
  // 4 EXECUTE seeds DRAFTS ONLY, by design, DESIGN's own "the missing ready label IS the day-one dispatch
  // fence"). So a fully-correct, agent-only EXECUTE+VALIDATE pass can NEVER itself reach M4 — requiring
  // stage>=M4 here would make canAdvanceToG4 permanently false even on a flawless install (an
  // UNDERSTATEMENT of readiness, the same failure class as an overstatement per this program's own
  // standing rule: a verdict must never misrepresent readiness in EITHER direction). The one, and only
  // one, maturity blocker this composer treats as the EXPECTED G4 hand-off point (never a defect) is
  // exactly "M4 blocked: A14 board has no dispatchable work" — every other maturity blocker (harness not
  // committed, A13 protection, preflight, an extra rung, …) still fully blocks, unchanged.
  const EXPECTED_G4_HANDOFF_BLOCKER = /^M4 blocked:.*A14 board has no dispatchable work/;
  const genuineMaturityBlockers = maturity.blockers.filter((b) => !EXPECTED_G4_HANDOFF_BLOCKER.test(b));

  const blockers: string[] = [];
  if (!doctorReport.ok) blockers.push(`oa doctor: ${doctorReport.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`).join('; ')}`);
  if (genuineMaturityBlockers.length) blockers.push(...genuineMaturityBlockers.map((b) => `oa maturity: ${b}`));
  if (direction.status === 'FAIL') blockers.push(`setup-completion (a) direction filled: FAIL — ${direction.detail}`);
  if (boardDrafts.status === 'FAIL') blockers.push(`setup-completion (b) board seeded with drafts: FAIL — ${boardDrafts.detail}`);
  if (provisionMatchesProtection.status === 'FAIL') blockers.push(`setup-completion (c) provision matches live protection: FAIL — ${provisionMatchesProtection.detail}`);

  // The honest mechanical ceiling for THIS phase pair is M3/INSTALLED (M4+ requires the G4 human act) —
  // reaching M3 is still required (a stall at M0-M2 IS a genuine EXECUTE/VALIDATE defect: compile/commit
  // never finished).
  const m3Idx = STAGE_ORDER.indexOf('M3' as Stage);
  const reachedM3 = stageIdx >= m3Idx;
  if (!reachedM3) blockers.push(`stage ${maturity.stage}/${maturity.stageName} has not yet reached M3/INSTALLED`);
  const canAdvanceToG4 = blockers.length === 0 && reachedM3;

  return {
    profile: sel.profile,
    substrate: sel.substrate,
    doctor: doctorReport,
    maturity,
    setupCompletion: { direction, boardDrafts, provisionMatchesProtection, firstTickSmoke },
    canAdvanceToG4,
    blockers,
  };
}

export function renderValidateHuman(report: ValidateReport): string {
  const lines: string[] = [];
  lines.push(`VALIDATE (Phase 5) — IMM STAGE REPORT — ${report.profile}@${report.substrate}`);
  lines.push('='.repeat(60));
  lines.push(`stage: ${report.maturity.stage}/${report.maturity.stageName}`);
  lines.push('');
  lines.push(formatDoctorReport(report.doctor));
  lines.push('');
  lines.push('setup-completion (deterministic checks only — TC.2, never the agent-judgment parts):');
  lines.push(`  (a) direction filled:              ${report.setupCompletion.direction.status} — ${report.setupCompletion.direction.detail}`);
  lines.push(`  (b) board seeded with drafts:       ${report.setupCompletion.boardDrafts.status} — ${report.setupCompletion.boardDrafts.detail}`);
  lines.push(`  (c) provision matches protection:   ${report.setupCompletion.provisionMatchesProtection.status} — ${report.setupCompletion.provisionMatchesProtection.detail}`);
  lines.push(`  (d) first-tick smoke record:        ${report.setupCompletion.firstTickSmoke.status} — ${report.setupCompletion.firstTickSmoke.detail}`);
  lines.push('');
  if (report.blockers.length) {
    lines.push('BLOCKERS (advancement to G4 is BLOCKED — never waved through):');
    for (const b of report.blockers) lines.push(`  - ${b}`);
  } else {
    lines.push('no blockers.');
  }
  lines.push('');
  lines.push(report.canAdvanceToG4 ? 'VALIDATE: canAdvanceToG4 = true' : 'VALIDATE: canAdvanceToG4 = false — BLOCKED');
  return lines.join('\n');
}

// =========================================================================================================
// CLI: bun bin/install-execute.ts execute|validate ...
// =========================================================================================================

const USAGE = [
  'usage: bun bin/install-execute.ts execute --record <selection-record.json>',
  '         [--authorize <authorize-record.json>] [--direction-fill <fill.json>] [--detect <detect-report.json>]',
  '         [--repo-dir <dir>] [--profiles-root <dir>] [--owner-repo <owner/name>] [--force] [--json] [--out <file>]',
  '',
  '       bun bin/install-execute.ts validate --record <selection-record.json>',
  '         [--repo-dir <dir>] [--profiles-root <dir>] [--no-live] [--json] [--out <file>]',
].join('\n');

interface CliOptions {
  mode?: 'execute' | 'validate';
  record?: string;
  authorize?: string;
  directionFill?: string;
  detect?: string;
  repoDir?: string;
  profilesRoot?: string;
  ownerRepo?: string;
  force: boolean;
  noLive: boolean;
  json: boolean;
  out?: string;
}

export function parseArgs(argv: string[]): { opts: CliOptions; error?: string } {
  const opts: CliOptions = { force: false, noLive: false, json: false };
  const rest = [...argv];
  const first = rest[0];
  if (first === 'execute' || first === 'validate') {
    opts.mode = first;
    rest.shift();
  }
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const takeValue = (flag: string): string | undefined => {
      const v = rest[i + 1];
      if (v === undefined || v.startsWith('--')) return undefined;
      i++;
      return v;
    };
    switch (a) {
      case '--record': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value` };
        opts.record = v;
        break;
      }
      case '--authorize': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value` };
        opts.authorize = v;
        break;
      }
      case '--direction-fill': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value` };
        opts.directionFill = v;
        break;
      }
      case '--detect': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value` };
        opts.detect = v;
        break;
      }
      case '--repo-dir': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value` };
        opts.repoDir = v;
        break;
      }
      case '--profiles-root': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value` };
        opts.profilesRoot = v;
        break;
      }
      case '--owner-repo': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value` };
        opts.ownerRepo = v;
        break;
      }
      case '--force':
        opts.force = true;
        break;
      case '--no-live':
        opts.noLive = true;
        break;
      case '--json':
        opts.json = true;
        break;
      case '--out': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value` };
        opts.out = v;
        break;
      }
      default:
        return { opts, error: `error: unknown flag "${a}"` };
    }
  }
  return { opts };
}

if (import.meta.main) {
  const { opts, error } = parseArgs(process.argv.slice(2));
  if (error || !opts.mode || !opts.record) {
    process.stderr.write(`${error ?? USAGE}\n\n${USAGE}\n`);
    process.exit(2);
  }
  if (opts.mode === 'execute') {
    const report = await runExecute({
      record: opts.record,
      authorize: opts.authorize,
      directionFill: opts.directionFill,
      detect: opts.detect,
      repoDir: opts.repoDir,
      profilesRoot: opts.profilesRoot,
      ownerRepo: opts.ownerRepo,
      force: opts.force,
    });
    const out = opts.json ? JSON.stringify(report, null, 2) : renderExecuteHuman(report);
    if (opts.out) writeFileSync(opts.out, JSON.stringify(report, null, 2) + '\n');
    process.stdout.write(out + '\n');
    process.exit(report.ok ? 0 : 1);
  } else {
    const report = await runValidate({
      record: opts.record,
      repoDir: opts.repoDir,
      profilesRoot: opts.profilesRoot,
      live: !opts.noLive,
    });
    const out = opts.json ? JSON.stringify(report, null, 2) : renderValidateHuman(report);
    if (opts.out) writeFileSync(opts.out, JSON.stringify(report, null, 2) + '\n');
    process.stdout.write(out + '\n');
    process.exit(0);
  }
}
