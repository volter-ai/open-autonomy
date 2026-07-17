#!/usr/bin/env bun
// TE.5 — Phase 4 EXECUTE + Phase 5 VALIDATE (OA-INSTALL-IMPLEMENTATION-TASKS.md#te5, DESIGN §Phase 4/§Phase
// 5 + hardening #4; docs/INSTALL-AGENT.md:203 "commit the harness first, wire the gate last";
// profiles/simple-sdlc/ir.yml:95-99 (seed-drafts-not-ready); scripts/provision-target-repo.ts:363
// (continues-on-failed-protection-PUT); scripts/open-autonomy-preflight.ts:189-194 (passes-with-zero-
// protection); TE.10 — this step never passes --arm-auto-merge, so provisioning here never arms native
// auto-merge; see scripts/provision-target-repo.ts's `armAutoMerge` doc and bin/install-handoff.ts's
// G4B_RUNBOOK for the human-gated arm step).
//
// THIS IS AN ORCHESTRATION unit — it composes ALREADY-BUILT primitives into the dependency-ordered
// EXECUTE -> VALIDATE sequence. It never re-derives a signal/guard/compile/provision primitive; every
// step below cites the file it reuses and calls straight into it (a subprocess for a script, a function
// import for a package export).
//
// EXECUTE order (dependency order, "commit the harness first, wire the gate last"):
//   1. compile              — `bun bin/autonomy-compile.ts <profile> <substrate> <repoDir>` (subprocess —
//                             autonomy-compile.ts is a top-level script, not an importable function; this
//                             is the same "reuse via subprocess" idiom TE.4's probe-PR step already uses).
//   2. install deps         — bun/termfleet/ztrack presence, consuming TE.1's own DetectReport (--detect),
//                             never re-running detect's own probes.
//                             DEFECT D1 FIX (aggregate-review, 100%-reproducible on a fresh self-driving
//                             install): this step USED TO run before compile. `npm install -D` on a
//                             directory with no package.json auto-creates a minimal one
//                             (`{devDependencies:{ztrack:...}}`). self-driving ships its OWN real
//                             package.json as a REPO_SHELL_FILES resource (bin/autonomy-compile.ts) —
//                             compile's clobber guard then correctly refused to overwrite the just-auto-
//                             created stub with self-driving's real file, blocking EVERY unforced fresh
//                             self-driving EXECUTE at the compile step, every time. Compile-first fixes
//                             this: it materializes whatever package.json the profile ships (self-driving)
//                             or doesn't ship (every additive profile — simple-sdlc, simple-gh-sdlc, …)
//                             FIRST, so install-deps's `npm install` always lands on whatever now exists on
//                             disk (the profile's own file, or nothing yet, in which case npm's own
//                             auto-create behavior is exactly what an additive profile always relied on —
//                             unchanged). Safe to reorder: compile is a pure-materialization subprocess of
//                             THIS orchestrator's own already-installed node_modules — it never shells out
//                             to npm/ztrack/termfleet itself and has no forward dependency on the TARGET
//                             repo's deps being installed (verified by reading compileLocal/compileGithub
//                             end to end: the only `npm`/`ztrack` mentions are inside emitted TEMPLATE
//                             STRINGS that become the compiled harness's own runtime scripts, never
//                             executed during compile itself).
//   3. write filled vision  — applies TE.3's ALREADY-GATHERED fill content (--direction-fill), never
//                             invents any. Re-verifies via TE.3's own `checkDirectionInvariant`
//                             (bin/install-direction.ts) — the exact function, not a re-derivation.
//   4. commit the harness   — git add + commit, pre/post-verified via guards.ts's own
//                             `checkUncommittedHarness` (packages/local-runner-cli/src/guards.ts) — reused
//                             verbatim as both the pre-check and the post-commit confirmation, never
//                             re-parsing `.open-autonomy/generated.json` a second way.
//   5. provider up (local)  — TG.1's own `bringUpProvider` (packages/local-runner-cli/src/provider.ts),
//                             reused verbatim; N/A for a gh-actions target.
//                             DEFECT D3 FIX (aggregate-review): `bringUpProvider` calls `provider.ts`'s own
//                             `pinScheduleProviderUrl`, which mutates `scheduler/schedule.json` IN PLACE —
//                             AFTER step 4 already committed the harness (schedule.json included). Left
//                             alone, `git status` shows schedule.json modified immediately after a real
//                             EXECUTE run, and `oa maturity`'s A6 signal fails until an operator manually
//                             re-commits it. This step now follows a successful pin with a SECOND, narrow
//                             commit of ONLY scheduler/schedule.json (same add-then-commit semantics step 4
//                             already establishes) whenever the pin actually left it dirty — applies to
//                             every local-target profile (the check is substrate-scoped, never profile-
//                             scoped), so the working tree is clean the instant provider-up finishes.
//   6. CI + provision (gh)  — TA.3's own `ensureCiScaffold` (bin/ensure-ci-workflow.ts) then
//                             `scripts/provision-target-repo.ts` (subprocess — a top-level script) with
//                             the check names TE.4's probe-PR discovery found (or the pack's own
//                             `required_checks` when no live probe ran), THEN hardening #4's own
//                             independent verification: `a13ProvisionMatchesLiveProtection`
//                             (packages/local-runner-cli/src/imm-signals.ts) — the EXACT hard-signal
//                             function `oa maturity` itself uses for M3 — called directly here rather than
//                             trusting provisioning's own exit code (scripts/provision-target-repo.ts:363
//                             continues silently on a failed non-admin PUT). A present:false verdict of
//                             ANY kind (unverifiable, not-applicable, proven-negative) is a NAMED BLOCKER,
//                             never a silent pass. N/A for a local-git profile.
//   7. seed the board       — dispatches the profile's REAL originator ONCE (its setup-pack.yml's
//                             `board_seed_recipe.originator_skill` — NOT a hardcoded 'planner': CRITICAL#2
//                             fix, aggregate-review round 2. simple-sdlc's roster has no `planner` agent at
//                             all — its originator is `draft` — so a hardcoded 'planner' dispatched the
//                             wrong agent, and worse, would have gone missing-prompt-file straight into
//                             packages/substrate-local/src/backend.mjs's silent bare-agent-name prompt
//                             fallback, see that step's own comment below) via the paused-safe primary
//                             dispatch channel TC.2's audit skill established (`AUTONOMY_AGENT=<originator>
//                             node scripts/run-agent.mjs` — no `.open-autonomy/paused` check, unlike
//                             runner-frontend.ts's `launch()`; see profiles/*/skills/audit/SKILL.md's
//                             "SETUP-COMPLETION MODE" section for the cited mechanism this reuses, only
//                             the agent name differs) or, on a gh-actions target, `gh workflow run
//                             <originator>.yml` (packages/substrate-github/src/emit.ts emits one workflow
//                             file per agent ROLE — `${name}.yml` — so this is the same originator-driven
//                             fix applied uniformly to both substrates, not just the local one the defect
//                             report called out). ⛔ SAFETY: dispatching this for real launches a real agent —
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
import { defaultProc, firstErrLine, firstLine } from '../packages/local-runner-cli/src/proc.ts';
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
import { bringUpProvider, planBringUpProvider, readSchedulePin, type BringUpOptions } from '../packages/local-runner-cli/src/provider.ts';
import { readLastFires } from '../packages/local-runner-cli/src/status.ts';

export { defaultProc, firstErrLine, firstLine };
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
// Step 2 — install deps (bun/termfleet/ztrack), consuming TE.1's own DetectReport when supplied. Runs
// AFTER compile (D1 fix — see file-header "EXECUTE order" note): `npm install` must land on whatever
// package.json compile just materialized (or didn't ship), never race it to auto-create a stub first.
// =========================================================================================================

export function stepInstallDeps(sel: SelectionRecordRef, opts: { proc: ProcRunner; detectFile?: string; dryRun?: boolean }): ExecuteStepResult {
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
  const wouldInstall: string[] = [];
  const toolSource = tools ? "TE.1's own DetectReport (--detect)" : 'a minimal node_modules presence read (no --detect supplied — never a re-derivation of TE.1\'s own probing logic)';

  // ztrack: every profile routes through it (CLAUDE.md: "all four route through ztrack").
  const ztrackPresent = tools ? Boolean(tools.ztrack?.vendored || tools.ztrack?.global) : existsSync(join(repoDir, 'node_modules', 'ztrack'));
  if (!ztrackPresent) {
    if (opts.dryRun) {
      wouldInstall.push('npm install -D ztrack@1.3.1');
      notes.push('[DRY-RUN] ztrack absent — would run: npm install -D ztrack@1.3.1 (NOT run; node_modules/package.json untouched)');
    } else {
      const r = opts.proc('npm', ['install', '-D', 'ztrack@1.3.1'], { cwd: repoDir });
      if (r.status !== 0) return step('install-deps', 'blocked', `npm install -D ztrack@1.3.1 failed (exit ${r.status}): ${firstLine(r.stderr || r.stdout)}`);
      notes.push('installed ztrack@1.3.1 (was absent)');
    }
  } else {
    notes.push(`ztrack present (source: ${toolSource})`);
  }

  // termfleet: only the local substrate drives agent sessions through it.
  if (sel.substrate === 'local') {
    const termfleetPresent = tools ? Boolean(tools.termfleet?.installed) : existsSync(join(repoDir, 'node_modules', 'termfleet'));
    if (!termfleetPresent) {
      if (opts.dryRun) {
        wouldInstall.push('npm install termfleet');
        notes.push('[DRY-RUN] termfleet absent — would run: npm install termfleet (NOT run; node_modules/package.json untouched)');
      } else {
        const r = opts.proc('npm', ['install', 'termfleet'], { cwd: repoDir });
        if (r.status !== 0) return step('install-deps', 'blocked', `npm install termfleet failed (exit ${r.status}): ${firstLine(r.stderr || r.stdout)}`);
        notes.push('installed termfleet (was absent)');
      }
    } else {
      notes.push(`termfleet present (source: ${toolSource})`);
    }
  } else {
    notes.push('substrate=gh-actions — termfleet not required (no local agent sessions)');
  }

  notes.push('bun present (this orchestrator runs under bun)');
  return step('install-deps', 'ok', notes.join('; '), wouldInstall.length ? { dryRun: true, wouldInstall } : {});
}

// =========================================================================================================
// Step 1 — compile the profile onto the substrate. `bun bin/autonomy-compile.ts` is a top-level script
// (import.meta.main body), not an importable function — reused via subprocess, the same idiom TE.4's
// probe-PR step already uses for `gh`/`git`. Runs BEFORE install-deps (D1 fix — see file-header "EXECUTE
// order" note): compile never shells out to npm/ztrack/termfleet itself, so it has no forward dependency
// on the target repo's deps being installed first.
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

export function stepCompile(sel: SelectionRecordRef, opts: { proc: ProcRunner; profileDir?: string; force?: boolean; dryRun?: boolean }): ExecuteStepResult {
  // SELECT already resolved and validated this profile under the caller's profilesRoot. Preserve that
  // identity through EXECUTE instead of reinterpreting a custom name against OA's bundled catalog.
  const profileArg = opts.profileDir ?? sel.profile;
  if (opts.dryRun) {
    // bin/autonomy-compile.ts's OWN built-in dry-run mode (its own file header: "With no outDir, prints the
    // installation's file list (a dry run)") — reused verbatim rather than re-derived: omitting the outDir
    // positional is the exact mechanism that script already uses to guarantee zero writes (compileLocal's
    // own `outDir` branch — the ENTIRE materialize/clobber-guard/write path — never runs at all). This is
    // real, already-proven-safe production code, not a bespoke simulation of it.
    const args = [AUTONOMY_COMPILE_SCRIPT, profileArg, sel.substrate];
    const r = opts.proc('bun', args, {});
    if (r.status !== 0) {
      return step('compile', 'blocked', `[DRY-RUN] bun bin/autonomy-compile.ts ${profileArg} ${sel.substrate} (no outDir — the tool's own built-in dry-run) failed (exit ${r.status}): ${firstLine(r.stderr || r.stdout)}`);
    }
    const wouldWrite = r.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
    return step(
      'compile',
      'ok',
      `[DRY-RUN] would compile ${sel.profile}@${sel.substrate} into ${sel.detect.repoDir} — ${wouldWrite.length} file(s) ` +
        `(via \`bun bin/autonomy-compile.ts ${profileArg} ${sel.substrate}\`'s own built-in dry-run/list mode — no outDir arg, ` +
        `so materialize/write never runs). NOT written.`,
      { dryRun: true, wouldWrite },
    );
  }
  const args = [AUTONOMY_COMPILE_SCRIPT, profileArg, sel.substrate, sel.detect.repoDir];
  if (opts.force) args.push('--force');
  const r = opts.proc('bun', args, {});
  if (r.status !== 0) {
    return step('compile', 'blocked', `bun bin/autonomy-compile.ts ${profileArg} ${sel.substrate} ${sel.detect.repoDir} failed (exit ${r.status}): ${firstLine(r.stderr || r.stdout)}`);
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

export function stepDirectionFill(sel: SelectionRecordRef, opts: { fillFile?: string; profileDir: string; dryRun?: boolean }): ExecuteStepResult {
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
  if (opts.dryRun) {
    // Never writes the fill content to repoDir — loadDirectionFill (above) is a pure read of the ALREADY-
    // gathered content file itself, not of repoDir. Re-verifying the invariant would require the real write
    // this mode refuses to perform, so this reports the plan honestly instead of fabricating a "satisfied"
    // verdict it cannot actually prove.
    const paths = fill.files.map((f) => `${f.path} (${f.content.length} byte(s))`);
    return step(
      'direction-fill',
      'ok',
      `[DRY-RUN] would apply --direction-fill, writing ${fill.files.length} file(s): ${paths.join(', ')} — invariant currently NOT satisfied ` +
        `(${before.reason}); re-verification after writing is skipped in dry-run (would require the real write this mode refuses to perform). ` +
        `Run without --dry-run to confirm the invariant becomes satisfied.`,
      { dryRun: true, wouldWrite: fill.files.map((f) => f.path) },
    );
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

export function stepCommitHarness(sel: SelectionRecordRef, opts: { proc: ProcRunner; dryRun?: boolean; plannedFiles?: string[] }): ExecuteStepResult {
  const repoDir = sel.detect.repoDir;
  const manifestPath = join(repoDir, '.open-autonomy', 'generated.json');
  if (opts.dryRun) {
    // Under --dry-run the compile step (above) never materialized `.open-autonomy/generated.json` — there
    // is genuinely nothing on disk yet to `git add`/`git status` against. Report the plan from the compile
    // step's own dry-run file list (`opts.plannedFiles`, threaded in by runExecute) rather than reading a
    // manifest that, correctly, does not exist. Never calls `git add`/`git commit` for real.
    const files = opts.plannedFiles ?? [];
    if (files.length === 0) {
      return step(
        'commit-harness',
        'ok',
        `[DRY-RUN] compile step reported 0 planned file(s) (or ran with a real, non-dry-run proc stub) — nothing to plan a commit for. NOT run.`,
        { dryRun: true },
      );
    }
    return step(
      'commit-harness',
      'ok',
      `[DRY-RUN] would run: git add -f -- <${files.length} file(s) from the compile plan> && git commit -m "Install the open-autonomy harness". NOT run — repo left untouched.`,
      { dryRun: true, wouldCommit: files },
    );
  }
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

// D3 fix — the one file bringUpProvider's own `pinScheduleProviderUrl` (provider.ts) mutates durably.
// Kept as a literal (not a re-derivation of provider.ts's own `schedulePath`) since this step only ever
// needs the CONVENTIONAL compiled path to know what to `git add`; provider.ts remains the sole source of
// truth for where it actually writes (including its own AUTONOMY_SCHEDULE override), and if that ever
// diverges from this literal, `git status --porcelain` below simply finds nothing dirty here and no-ops —
// fail-quiet in the "nothing to commit" direction, never a false commit of the wrong path.
const SCHEDULE_RELATIVE_PATH = join('scheduler', 'schedule.json');

/** D3 fix — after a successful provider bring-up, `pinScheduleProviderUrl` may have just modified
 *  `scheduler/schedule.json` IN PLACE, AFTER step 4 (`stepCommitHarness`) already committed it — left
 *  alone, `git status` shows it dirty and `oa maturity`'s A6 signal fails until an operator manually
 *  re-commits. Commits ONLY that one file, using the exact same add-then-commit semantics
 *  `stepCommitHarness` already establishes (never a second commit-implementation idiom). No-ops (status:
 *  'skipped') when the file doesn't exist, `repoDir` isn't a git repo (mirrors guards.ts's own
 *  `checkUncommittedHarness` "nothing declared, nothing to check" convention), or the pin left nothing
 *  dirty (e.g. bringUpProvider's idempotent no-op branch, already-committed from an earlier run).
 *  NEVER called under --dry-run (see stepProviderUp below) — a real `git add`/`git commit`, exactly the
 *  class of operation --dry-run exists to suppress. */
function commitSchedulePinIfDirty(repoDir: string, proc: ProcRunner): { status: 'ok' | 'skipped' | 'blocked'; detail: string } {
  if (!existsSync(join(repoDir, SCHEDULE_RELATIVE_PATH))) return { status: 'skipped', detail: '' };
  const isGitRepo = proc('git', ['rev-parse', '--git-dir'], { cwd: repoDir }).status === 0;
  if (!isGitRepo) return { status: 'skipped', detail: '' };
  const status = proc('git', ['status', '--porcelain', '--', SCHEDULE_RELATIVE_PATH], { cwd: repoDir });
  if (!(status.stdout || '').trim()) return { status: 'skipped', detail: '' };
  const add = proc('git', ['add', '--', SCHEDULE_RELATIVE_PATH], { cwd: repoDir });
  if (add.status !== 0) return { status: 'blocked', detail: `git add ${SCHEDULE_RELATIVE_PATH} failed (exit ${add.status}): ${firstLine(add.stderr || add.stdout)}` };
  const commit = proc('git', ['commit', '-m', 'Pin the local termfleet provider URL'], { cwd: repoDir });
  if (commit.status !== 0) return { status: 'blocked', detail: `git commit failed (exit ${commit.status}): ${firstLine(commit.stderr || commit.stdout)}` };
  return { status: 'ok', detail: `committed ${SCHEDULE_RELATIVE_PATH} (provider pin) — working tree clean.` };
}

export async function stepProviderUp(sel: SelectionRecordRef, opts: { proc?: ProcRunner; bringUp?: Partial<BringUpOptions>; dryRun?: boolean } = {}): Promise<ExecuteStepResult> {
  if (sel.substrate !== 'local') {
    return step('provider-up', 'skipped', `substrate=${sel.substrate} — provider bring-up only applies to the local substrate`);
  }
  if (opts.dryRun) {
    // THE critical dry-run leg (see this file's own PR/near-miss note): a REAL termfleet bring-up is itself
    // the first half of the hazard this whole unit exists to close. `planBringUpProvider` computes the
    // SAME action/ports a real call would via only non-mutating reads/probes (readProviderState,
    // verifyConsoleIdentity/verifyProviderIdentity's read-only HTTP GETs, pickProviderPorts' bind-then-
    // close probe) — it never spawns `npx termfleet ...`, never pins scheduler/schedule.json, and (per the
    // D3 fix above) never commits that pin either — commitSchedulePinIfDirty is simply never reached.
    const plan = await planBringUpProvider({ cwd: sel.detect.repoDir, ...opts.bringUp });
    const status: StepStatus = plan.action === 'would-refuse-foreign-occupant' ? 'blocked' : 'ok';
    return step('provider-up', status, plan.detail, {
      dryRun: true,
      wouldBringUp: { action: plan.action, consoleUrl: plan.consoleUrl, providerUrl: plan.providerUrl, consolePort: plan.consolePort, providerPort: plan.providerPort },
    });
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

  const pin = commitSchedulePinIfDirty(sel.detect.repoDir, opts.proc ?? defaultProc);
  if (pin.status === 'blocked') {
    return step('provider-up', 'blocked', `provider is up (${result.detail}) but committing the pinned ${SCHEDULE_RELATIVE_PATH} failed: ${pin.detail}`);
  }
  const detail = pin.detail ? `${result.detail} ${pin.detail}` : result.detail;
  return step('provider-up', 'ok', detail, { providerUrl: result.providerUrl });
}

// =========================================================================================================
// Step 6 — CI scaffold + provisioning (github target only). TA.3's ensureCiScaffold, then
// scripts/provision-target-repo.ts (subprocess), then hardening #4's independent live-protection
// verification via a13ProvisionMatchesLiveProtection (the exact function `oa maturity` uses for M3).
// =========================================================================================================

export async function stepCiAndProvision(
  sel: SelectionRecordRef,
  authRecord: AuthorizeRecordRef | undefined,
  opts: { proc: ProcRunner; profilesRoot: string; ownerRepo?: string; dryRun?: boolean },
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

  const ci: CiScaffoldResult = ensureCiScaffold(repoDir, sel.pack, { dryRun: opts.dryRun });
  if (!ci.ok) {
    return step('ci-and-provision', 'blocked', `${opts.dryRun ? '[DRY-RUN] would be ' : ''}TA.3 CI scaffold BLOCKED: ${ci.blocker}`);
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

  if (opts.dryRun) {
    // Two real mutations skipped here: (1) writing the patched manifest into repoDir (a real file this
    // path would otherwise `writeFileSync`), and (2) `scripts/provision-target-repo.ts` — a REAL PUT
    // against `${opts.ownerRepo}`'s branch protection settings on GitHub. Neither runs. The a13 independent
    // live-protection re-verification is skipped too — there is nothing real to independently re-verify.
    const patchedManifestPath = join(repoDir, '.open-autonomy-install-provision.json');
    return step(
      'ci-and-provision',
      'ok',
      `[DRY-RUN] CI scaffold plan: ${formatCiScaffoldResult(ci) || '(no authored-workflow checks needed)'}; would run: bun ${PROVISION_TARGET_REPO_SCRIPT} ` +
        `--repo ${opts.ownerRepo} --source ${repoDir} --manifest ${patchedManifestPath} — branch_protection.required_checks=[${requiredChecks.join(', ')}] ` +
        `(source: ${checkNameSource}). NOT executed — no real branch-protection/CI mutation against ${opts.ownerRepo}. Independent live-protection ` +
        `re-verification (hardening #4, A13) is skipped: nothing was actually provisioned to verify.`,
      { dryRun: true, wouldProvision: { ownerRepo: opts.ownerRepo, requiredChecks, manifestPath: patchedManifestPath } },
    );
  }

  const patchedManifestPath = join(repoDir, '.open-autonomy-install-provision.json');
  writeFileSync(patchedManifestPath, JSON.stringify(manifest, null, 2));

  // TE.10: deliberately NEVER passes --arm-auto-merge. Provisioning during EXECUTE sets up branch
  // protection + required CI checks only; arming native auto-merge is a human-gated LATER step (TE.6's
  // G4b runbook, bin/install-handoff.ts's G4B_RUNBOOK: "watch the first PR merge under supervision, THEN
  // arm auto-merge" via `gh repo edit <owner>/<repo> --enable-auto-merge`) — never something an
  // unattended EXECUTE phase does on its own. See scripts/provision-target-repo.ts's `armAutoMerge`
  // Options field doc for the full rationale.
  const prov = opts.proc('bun', [PROVISION_TARGET_REPO_SCRIPT, '--repo', opts.ownerRepo, '--source', repoDir, '--manifest', patchedManifestPath], {});
  const provisionExitOk = prov.status === 0;

  // HARDENING #4: never trust the exit code above — provision-target-repo.ts:363 continues silently on a
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
// Step 7 — seed the board with DRAFT items only. Dispatches the profile's REAL originator (setup-pack.yml's
// board_seed_recipe.originator_skill) ONCE via the paused-safe primary dispatch channel TC.2's audit skill
// established. ⛔ Real dispatch launches a real agent — this function only ever constructs+calls the
// command through an injectable proc; this unit's own acceptance stubs it (see PR body's explicit
// mocked-sequencing disclosure). Never mutates board state itself.
//
// CRITICAL#2 FIX (aggregate-review round 2) — renamed from `buildPlannerDispatchCommand`: the old name and
// its hardcoded `AUTONOMY_AGENT: 'planner'` assumed every profile's originator is the planner. It is not —
// simple-sdlc's setup-pack.yml declares `originator_skill: draft` (its ir.yml roster carries no `planner`
// agent at all — see profiles/simple-sdlc/setup-pack.yml's own comment). `originatorSkill` is now a REQUIRED
// parameter the caller resolves from the pack (`sel.pack.board_seed_recipe.originator_skill`), never a
// literal baked in here. Applied to BOTH substrate branches for the same reason (packages/substrate-github/
// src/emit.ts emits one `.github/workflows/<role>.yml` per agent role, so the gh-actions branch's dispatch
// target is exactly as originator-dependent as the local branch's AUTONOMY_AGENT, even though every profile
// that can run gh-actions today happens to declare `planner` — this stays correct if that ever changes).
export interface DispatchCommand {
  cmd: string;
  args: string[];
  env?: Record<string, string>;
}

/** `repoDir` is REQUIRED for a local-substrate command (not optional) — see the "install-scoped, never
 *  ambient" note below; this is a deliberate signature change from an earlier draft that omitted it (found
 *  live, see this file's own PR-body incident note). */
export function buildBoardSeedDispatchCommand(substrate: Substrate, repoDir: string | undefined, originatorSkill: string, ownerRepo?: string): DispatchCommand {
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
    const env: Record<string, string> = { AUTONOMY_AGENT: originatorSkill };
    if (repoDir) {
      const pin = readSchedulePin(repoDir);
      if (pin) env.TERMFLEET_PROVIDER_URL = pin;
    }
    return { cmd: 'node', args: ['scripts/run-agent.mjs'], env };
  }
  const args = ['workflow', 'run', `${originatorSkill}.yml`];
  if (ownerRepo) args.push('--repo', ownerRepo);
  return { cmd: 'gh', args };
}

export interface SeedBoardResult extends ExecuteStepResult {
  command: DispatchCommand;
}

// The launch harness (which coding CLI termfleet drives) — mirrors packages/substrate-local/src/
// runner-config.ts's RUNNER_DEFAULTS.harness default ('claude'); TERMFLEET_AGENT overrides it identically
// at real dispatch time (backend.mjs) and here, so this check probes the EXACT path a real launch resolves.
const DEFAULT_LAUNCH_HARNESS = 'claude';

export function stepSeedBoardDrafts(sel: SelectionRecordRef, opts: { proc: ProcRunner; ownerRepo?: string; dryRun?: boolean; plannedFiles?: string[] }): SeedBoardResult {
  const originatorSkill = sel.pack.board_seed_recipe.originator_skill;
  const command = buildBoardSeedDispatchCommand(sel.substrate, sel.detect.repoDir, originatorSkill, opts.ownerRepo);

  // CRITICAL#2 FIX, part (b) — loud-failure guard, scoped to THIS unit's own dispatch layer.
  // packages/substrate-local/src/backend.mjs's `launch()` silently falls back to the BARE AGENT NAME as the
  // literal prompt text (`promptExists ? readFileSync(promptFile, 'utf8') : agent`) whenever no compiled
  // prompt file exists for AUTONOMY_AGENT — a real coding CLI would then be handed e.g. the literal string
  // "planner" as its entire instructions. That silent-fallback pattern lives in shared runtime code used by
  // every launch path in the system (the loop driver, the PM's own nested launches, a human's `oa dispatch`)
  // — not something this install-time orchestration unit owns or can safely change here (rewriting a shared
  // primitive's error-handling contract needs its own reviewed unit, with every OTHER caller's expectations
  // re-verified — out of scope for a two-defect fix PR). What THIS unit CAN and does guarantee: its own
  // seed-board-drafts dispatch can never be the one that walks into that fallback. Step 1 (compile) already
  // ran earlier in this exact EXECUTE sequence and, for a local-substrate profile, materializes
  // `scripts/prompts/<harness>/<role>.txt` for every real agent role in the profile's ir.yml (packages/
  // substrate-local/src/emit.ts's `promptFiles`) — so if the resolved originator's prompt file is missing,
  // that is itself evidence of a real defect (the pack's declared originator_skill doesn't match the
  // profile's own compiled agent roster) and this step now fails LOUDLY here, before ever spawning anything,
  // instead of silently reaching backend.mjs's fallback.
  //
  // --dry-run interaction: the check is read-only (existsSync only — no side effect), so it is SAFE to run
  // identically under dry-run, but its DATA SOURCE must change: under a real run, step 1 (compile) really
  // wrote the prompt file, so a real on-disk existsSync is the right question. Under dry-run, step 1's own
  // dry-run branch (stepCompile) never wrote anything for real — it only returned a `wouldWrite` file list
  // (threaded through here as `opts.plannedFiles`, the exact same list stepCommitHarness's own dry-run
  // branch already consumes) — so the right question under dry-run is "is the prompt file IN the compile
  // plan", not "does it exist on disk yet". A prediction that the real run WOULD refuse to dispatch is
  // exactly the kind of blocked prediction stepCompile/stepCiAndProvision's own dry-run branches already
  // surface (see runExecute's own dry-run header comment). If `plannedFiles` is empty/absent (compile itself
  // was blocked, or ran through a non-dry-run-listing proc stub), this step makes no claim either way —
  // mirrors stepCommitHarness's own "0 planned files — nothing to plan" discipline: never over-claim a block
  // this step can't actually back up.
  if (sel.substrate === 'local' && sel.detect.repoDir) {
    const harness = process.env.TERMFLEET_AGENT || DEFAULT_LAUNCH_HARNESS;
    const relPromptPath = join('scripts', 'prompts', harness, `${originatorSkill}.txt`);
    const promptFile = join(sel.detect.repoDir, relPromptPath);
    const missing = opts.dryRun
      ? opts.plannedFiles && opts.plannedFiles.length > 0 && !opts.plannedFiles.includes(relPromptPath)
      : !existsSync(promptFile);
    if (missing) {
      return {
        ...step(
          'seed-board-drafts',
          'blocked',
          `${opts.dryRun ? '[DRY-RUN] would refuse' : 'refusing'} to dispatch AUTONOMY_AGENT=${originatorSkill}: no compiled launch prompt ${opts.dryRun ? `is planned at ${relPromptPath}` : `exists at ${promptFile}`}. ` +
            `Dispatching anyway would silently fall through to backend.mjs's bare-agent-name prompt fallback and hand ` +
            `a real coding CLI the literal text "${originatorSkill}" as its entire prompt — refused ${opts.dryRun ? '(predicted)' : 'before spawning anything'}. This means the pack's board_seed_recipe.originator_skill ` +
            `("${originatorSkill}") is out of sync with the profile's own compiled ir.yml agent roster, or step 1 (compile) ` +
            `has not actually run for this repoDir/harness — check profiles/${sel.profile}/setup-pack.yml against ` +
            `profiles/${sel.profile}/ir.yml.`,
          opts.dryRun ? { dryRun: true } : {},
        ),
        command,
      };
    }
  }

  if (opts.dryRun) {
    // Reuses the SAME construct-never-execute discipline install-handoff.ts's go-live logic already proves
    // safe (buildLocalGoLive/buildHostedGoLive: construct a DispatchCommand, never call proc on it). This is
    // real agent dispatch in production (see this file's own header — deliberately, by design, outside
    // dry-run); under --dry-run, `opts.proc` is never called for it at all.
    const envDetail = command.env ? ` (env: ${Object.entries(command.env).map(([k, v]) => `${k}=${v}`).join(', ')})` : '';
    return {
      ...step(
        'seed-board-drafts',
        'ok',
        `[DRY-RUN] would dispatch ${originatorSkill} (this profile's real board_seed_recipe.originator_skill) once via \`${command.cmd} ${command.args.join(' ')}\`${envDetail} — NOT executed; no real agent ever launched.`,
        { dryRun: true },
      ),
      command,
    };
  }

  const env = command.env ? { ...process.env, ...command.env } : process.env;
  const r = opts.proc(command.cmd, command.args, { cwd: sel.detect.repoDir, env });
  if (r.status !== 0) {
    // LOW#5 fix (owner-mandated aggregate skeptic review round 2 — the missing-prompt-file case itself is
    // now refused LOUDLY above, before ever reaching this proc call at all, by CRITICAL#2's own pre-flight
    // guard; this is a DIFFERENT failure — the prompt/skill exists, but the dispatched PROCESS itself still
    // failed). Two concrete gaps the bare "<originator> dispatch failed" message used to hide:
    //  (1) a genuine SPAWN failure (e.g. `node`/`gh` missing from PATH) sets `r.error`, not stderr/stdout —
    //      the old message silently dropped it and printed the useless firstLine-of-nothing "(no output)".
    //  (2) the dispatched process is `node scripts/run-agent.mjs` -> `autonomy-runner.mjs launch <role>`,
    //      which on a real failure THROWS — an uncaught Node error's stderr leads with the SOURCE LINE that
    //      threw (`      throw new Error(...)`), not the message; the real "Error: ..." text is a few lines
    //      further down. `firstLine` grabbed the useless source-line; `firstErrLine` finds the real message.
    const cause = r.error ? r.error.message : firstErrLine(r.stderr || r.stdout);
    const harness = process.env.TERMFLEET_AGENT || DEFAULT_LAUNCH_HARNESS;
    const hint =
      sel.substrate === 'local'
        ? `the compiled "${originatorSkill}" prompt already exists (the pre-flight check above passed), so this ` +
          `looks like a runtime dispatch problem, not a missing skill — check that a termfleet provider is ` +
          `reachable (TERMFLEET_PROVIDER_URL / \`oa provider status\`) and that the coding CLI ("${harness}") is ` +
          `installed and authenticated`
        : `check \`gh auth status\` and that .github/workflows/${originatorSkill}.yml was compiled and pushed to ${opts.ownerRepo ?? '<owner/repo>'}`;
    return { ...step('seed-board-drafts', 'blocked', `${originatorSkill} dispatch failed (${command.cmd} ${command.args.join(' ')}, exit ${r.status}): ${cause} — ${hint}`), command };
  }
  return {
    ...step(
      'seed-board-drafts',
      'ok',
      `dispatched ${originatorSkill} (this profile's real board_seed_recipe.originator_skill) once via ${command.cmd} ${command.args.join(' ')} — seeds DRAFT items only; never self-promotes to ready/oa-approved (that is the originator's own doctrine, pr-139: "file drafts, never ready" — this orchestrator holds no board-mutation code path of its own).`,
    ),
    command,
  };
}

// =========================================================================================================
// runExecute — the orchestrator. Fail-closed: halts on the first 'blocked' step (dependency order); a
// 'skipped' step (N/A for this profile/substrate) never halts the sequence.
//
// --dry-run (`opts.dryRun`): every step above accepts its own `dryRun` flag and, when set, never performs
// the step's real side-effecting operation (no real npm install, no real compile write, no real git commit,
// no real termfleet bring-up, no real branch-protection mutation, no real agent dispatch) — see each step's
// own comment for its specific plan. Under dryRun this orchestrator ALSO never halts early on a 'blocked'
// step: a dry-run's whole purpose is a full end-to-end rehearsal report, so a step that predicts a real run
// WOULD block still lets every later step run and report its own prediction too (each step's dry-run plan is
// computed independently of its siblings' real effects, since none of them performed one) — `ok`/`blocker` on
// the final report still honestly reflect the first step that predicted a block, unchanged from the real
// (non-dry-run) semantics.
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
  /** never performs a real npm install / compile write / git commit / termfleet bring-up / branch-protection
   *  mutation / agent dispatch — see runExecute's own header + each step's comment for its exact plan. */
  dryRun?: boolean;
}

export interface ExecuteReport {
  ok: boolean;
  profile: string;
  substrate: Substrate;
  steps: ExecuteStepResult[];
  blocker?: string;
  dryRun?: boolean;
}

export async function runExecute(opts: ExecuteOptions): Promise<ExecuteReport> {
  const proc = opts.proc ?? defaultProc;
  const dryRun = opts.dryRun === true;
  const sel = loadSelectionRecord(opts.record);
  if (opts.repoDir) sel.detect.repoDir = opts.repoDir;
  const profilesRoot = opts.profilesRoot ?? bundledProfilesRoot;
  const profileDir = profileDirOf(profilesRoot, sel.profile);

  let authRecord: AuthorizeRecordRef | undefined;
  if (opts.authorize) authRecord = loadAuthorizeRecord(opts.authorize);

  const steps: ExecuteStepResult[] = [];
  const finish = (): ExecuteReport => {
    const blocked = steps.find((s) => s.status === 'blocked');
    return { ok: !blocked, profile: sel.profile, substrate: sel.substrate, steps, ...(blocked ? { blocker: blocked.detail } : {}), ...(dryRun ? { dryRun: true } : {}) };
  };
  // Real mode: stop at the first blocked step (fail-closed, dependency order — a later step's real
  // preconditions may depend on an earlier one's real effect). Dry-run mode: never stop early — every step's
  // plan is computed independently of its siblings' (non-)effects, so the whole chain always finishes and
  // reports every phase's prediction, per this unit's own "operator can safely see ALL phases" mandate.
  const haltIfBlocked = (): ExecuteReport | undefined => {
    if (dryRun) return undefined;
    const last = steps.at(-1)!;
    return last.status === 'blocked' ? finish() : undefined;
  };

  // D1 fix: compile MUST run before install-deps — see the file-header "EXECUTE order" note above for the
  // full root cause + rationale (a fresh self-driving install used to self-clobber at the compile step).
  steps.push(stepCompile(sel, { proc, profileDir, force: opts.force, dryRun }));
  {
    const h = haltIfBlocked();
    if (h) return h;
  }
  const compileStep = steps.find((s) => s.id === 'compile');
  const plannedFiles = (compileStep?.wouldWrite as string[] | undefined) ?? undefined;

  steps.push(stepInstallDeps(sel, { proc, detectFile: opts.detect, dryRun }));
  {
    const h = haltIfBlocked();
    if (h) return h;
  }

  steps.push(stepDirectionFill(sel, { fillFile: opts.directionFill, profileDir, dryRun }));
  {
    const h = haltIfBlocked();
    if (h) return h;
  }

  steps.push(stepCommitHarness(sel, { proc, dryRun, plannedFiles }));
  {
    const h = haltIfBlocked();
    if (h) return h;
  }

  steps.push(await stepProviderUp(sel, { proc, bringUp: opts.bringUp, dryRun }));
  {
    const h = haltIfBlocked();
    if (h) return h;
  }

  steps.push(await stepCiAndProvision(sel, authRecord, { proc, profilesRoot, ownerRepo: opts.ownerRepo, dryRun }));
  {
    const h = haltIfBlocked();
    if (h) return h;
  }

  steps.push(stepSeedBoardDrafts(sel, { proc, ownerRepo: opts.ownerRepo, dryRun, plannedFiles }));
  {
    const h = haltIfBlocked();
    if (h) return h;
  }

  return finish();
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
  /** VALIDATE's report-computation itself is already read-only (oa doctor/oa maturity are report verbs) —
   *  the ONE real write in this path is `computeMaturity`'s own `.open-autonomy/install.json` (default
   *  `write: true`). Under --dry-run this is suppressed (`write: false`) so a dry-run VALIDATE leaves the
   *  target repo's disk byte-for-byte untouched, same as every other phase. */
  dryRun?: boolean;
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
  if (opts.dryRun) maturityOpts.write = false;
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
