#!/usr/bin/env bun
// TE.2 — Phase 1 RECOMMEND / CONFIRM PROFILE (G1) + instantiate the SetupPack
// (OA-INSTALL-IMPLEMENTATION-TASKS.md#te2, DESIGN §Phase 1/G1 + §Q0 the instantiation seam + §Q3 "at
// Phase 1 it instantiates the chosen profile's setup pack").
//
// This is the install agent's SELECT step: takes TE.1's DETECT REPORT, calls TD.1/TD.2's recommender
// machinery, and asks THE ONE G1 QUESTION — "I recommend X on Y because <reasons>; confirm or override?"
// — OR, when the operator already pre-picked a profile, validates that pick instead (per DESIGN §Phase 1:
// "If the user already picked a profile, skip the ask and just validate the choice against the repo").
// On confirmation it instantiates the chosen profile's SetupPack via TS.1's `getSetupPack` (the Q0
// instantiation seam where the common scaffold binds to Layer 2) and emits a SELECTION RECORD — every
// later phase (TE.3+) reads THIS record's `pack`, never the profile name.
//
// STATELESS, TWO-INVOCATION DESIGN (per the task brief): this is a CLI building block for the install
// AGENT (the agent is the one that actually talks to the human — see docs/INSTALL-AGENT.md / CLAUDE.md
// "never script what an agent can do"). This script's job is only to (1) EMIT the question/blocker as
// data the agent can relay, and (2) on a SECOND invocation carrying the human's answer (`--confirm` or
// `--override <profile>`), RE-DERIVE the same recommendation from the same detect input and apply it. No
// session/state file is written between the two invocations — the second invocation recomputes
// everything from scratch, so it is safe to run from a fresh process, a different cwd, or even a
// different day. This mirrors bin/recommend-profile.ts's own "pure function of its inputs" discipline.
//
// ONE-QUESTION BOOKKEEPING (acceptance (ii)): each invocation emits AT MOST one question:
//   - recommend flow, invocation 1 (no --confirm/--override): emits exactly 1 question, NO record.
//   - recommend flow, invocation 2 (--confirm <profile>@<substrate> or --override <profile>): emits 0 NEW questions
//     (the record's `g1` field documents the question that WAS asked in invocation 1 + the answer given
//     here) — a record IS emitted.
//
// CONFIRM-DRIFT GUARD (review rounds D1 + D4): because the two invocations are stateless, the repo can
// change between them — and a bare "yes" flag would then silently bind whatever the SECOND derivation
// happens to recommend, fabricating a g1 record for a question the human never saw (D1 live repro: empty
// repo asked "simple-sdlc?", repo gained content + a GitHub remote, bare --confirm bound simple-gh-sdlc
// and flipped landing_mode pr-free→auto-merge). And G1 is a confirm/override of profile + SUBSTRATE
// (DESIGN §Q3's gate table: "confirm/override profile+substrate") — the recommender yields the SAME
// profile on two substrates (simple-gh-sdlc@gh-actions when hostedRunner && ghAdmin!==false vs @local
// when ghAdmin===false, packages/core/src/recommend.ts), so a profile-only token would still silently
// flip WHERE THE FLEET RUNS on a ghAdmin drift (D4 live repro: ghAdmin false→true between invocations
// re-bound simple-gh-sdlc from local to gh-actions under a profile-only --confirm). So `--confirm`
// REQUIRES the full `<profile>@<substrate>` token the human actually confirmed (invocation 1's help line
// prints the exact token): the second invocation re-derives the recommendation and HARD-ERRORS on a
// mismatch in EITHER dimension ("recommendation drifted since the question was asked … re-ask G1") — it
// never binds a profile OR substrate the human did not see, and `g1.answer` records exactly the confirmed
// pair. A bare `--confirm`, or a profile-only token without `@<substrate>`, is a loud usage error (no
// soft fallback).
//   - pre-pick flow, validated OK: emits 0 questions — the human's pre-pick + a clean validation together
//     already constitute G1's answer; a record is emitted immediately, no re-ask.
//   - pre-pick flow, BLOCKED: emits exactly 1 question (the blocker doubles as "pick something else?") —
//     NO record (nothing to instantiate a pack for; the human must re-invoke with a different --pick or
//     the plain recommend flow).
//
// REUSE (do not re-derive): `detectRepoFacts`/`validatePrePick`/`recommendProfile`/`formatValidation` are
// TD.1/TD.2's own exported functions (packages/core/src/recommend.ts, bin/recommend-profile.ts) — the
// EXACT same eligibility/clobber-guard/ghAdmin-honesty logic TE.2's acceptance case demands is reused
// verbatim, not copied. `getSetupPack`/`validateSetupPack` are TS.1's own (packages/core/src/setup-pack.ts).
// `detect`/`DetectReport` are TE.1's own (bin/install-detect.ts) — when no `--detect <file>` is given,
// this file calls TE.1's `detect()` directly rather than re-implementing repo/gh probing.
//
// HOME rationale (bin/, not packages/local-runner-cli/): identical reasoning to TA.3/TD.2/TE.1's own
// header comments — this file takes RUNTIME imports of `@open-autonomy/core` (`getSetupPack`,
// `recommendProfile`, …) that only resolve under `bun`'s extension-free internal module resolution, never
// under plain Node ESM. `bin/` is this repo's own dev/install-time tooling; `packages/local-runner-cli`
// (`@volter/oa`) ships standalone to an adopter's repo and cannot take this monorepo-only dependency.
//
// Test-glob note (same pattern as TA.3/TD.2/TE.1): `check:core`'s glob (`packages/*/src/*.test.ts`) does
// not reach `bin/`, so `bin/install-select.test.ts` is wired into its own `check:install-select`
// package.json script, added to the `check` composite (see package.json).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  getSetupPack,
  loadAllProfileFacts,
  recommendProfile,
  type Recommendation,
  type RepoFacts,
  type SetupPack,
  type Substrate,
} from '@open-autonomy/core';
import { profilesRoot as bundledProfilesRoot } from './bundled-profiles';
import { defaultProc, validatePrePick, type ProcFn, type ValidationResult } from './recommend-profile';
import { detect, type DetectReport } from './install-detect';

// =========================================================================================================
// detect-report -> RepoFacts adapter. TD.1's `RepoFacts` interface is the recommender's input contract;
// TE.1's `DetectReport` is a richer, differently-shaped struct. Only the mechanically-detected subset
// TD.1 actually consumes is pulled across (onGitHub, populated, ghAdmin); the Phase-1/3 operator
// preferences (hostedRunner, preferNoAutoMerge, canFundProxy, wantsDemo, wantsSOC2) are NEVER present in
// a detect report (they are not mechanically detectable, per TD.2's own `detectRepoFacts` note) — they
// only ever come from this CLI's own flags, layered on top exactly the way `bin/recommend-profile.ts`
// layers its own `overrides`.
// =========================================================================================================

export function repoFactsFromDetectReport(report: DetectReport, overrides: Partial<RepoFacts> = {}): RepoFacts {
  return {
    onGitHub: report.git.onGitHub,
    populated: report.git.populated,
    ghAdmin: report.gh.admin,
    ...overrides,
  };
}

/** Reference to the detect input a selection record was built from — deliberately NOT the whole
 *  DetectReport (which carries tool/doctor probes no later phase needs); this is a small "citable
 *  pointer + the facts actually consumed" record, the same "cite the fact, don't re-embed the world"
 *  discipline `renderHuman`'s notes-arrays already use elsewhere in this repo. */
export interface DetectRef {
  source: 'file' | 'live';
  file?: string;
  repoDir: string;
  repoFacts: RepoFacts;
}

/** Read + parse a TE.1 DetectReport JSON file. Throws loudly (never silently substitutes defaults) on a
 *  missing file, invalid JSON, or a JSON value that isn't shaped like a DetectReport (missing its `git`/
 *  `gh` sections) — a malformed detect input must never be silently treated as "empty repo, no GitHub". */
export function loadDetectReport(file: string): DetectReport {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (e) {
    throw new Error(`--detect ${file}: could not read file (${(e as Error).message ?? e})`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`--detect ${file}: not valid JSON (${(e as Error).message ?? e})`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`--detect ${file}: malformed detect report — expected a JSON object shaped like TE.1's DetectReport (bin/install-detect.ts), got ${Array.isArray(parsed) ? 'an array' : typeof parsed}`);
  }
  const r = parsed as Partial<DetectReport>;
  if (!r.git || typeof r.git !== 'object' || typeof (r.git as { onGitHub?: unknown }).onGitHub !== 'boolean') {
    throw new Error(`--detect ${file}: malformed detect report — missing/invalid "git.onGitHub" (expected TE.1's DetectReport shape, e.g. from "bun bin/install-detect.ts <repoDir> --json")`);
  }
  if (!r.gh || typeof r.gh !== 'object') {
    throw new Error(`--detect ${file}: malformed detect report — missing "gh" section (expected TE.1's DetectReport shape)`);
  }
  return r as DetectReport;
}

// =========================================================================================================
// The G1 question + the SELECTION RECORD.
// =========================================================================================================

/** THE ONE G1 QUESTION, verbatim per the task brief's own wording. */
export function formatG1Question(rec: Recommendation): string {
  return `I recommend ${rec.profile} on ${rec.substrate} because ${rec.reasons.join('; ')}; confirm or override?`;
}

/** Parse --confirm's `<profile>@<substrate>` token (D4). G1 confirms BOTH dimensions (DESIGN §Q3:
 *  "confirm/override profile+substrate"), so a profile-only token is refused loudly — a soft fallback
 *  would let a substrate drift (same profile, ghAdmin flipped between the stateless invocations) bind a
 *  substrate the human never saw. Profile directory names never contain '@', so the split is unambiguous. */
export function parseConfirmToken(token: string): { profile: string; substrate: Substrate } | { error: string } {
  const at = token.indexOf('@');
  if (at === -1) {
    return {
      error:
        `error: --confirm requires the full <profile>@<substrate> token (got a profile-only "${token}") — ` +
        `e.g. --confirm ${token}@local. G1 confirms BOTH the profile AND the substrate (invocation 1's help ` +
        `line prints the exact token): a profile-only confirmation would let a substrate drift between the ` +
        `two stateless invocations silently flip where the fleet runs.`,
    };
  }
  const profile = token.slice(0, at);
  const substrate = token.slice(at + 1);
  if (!profile) return { error: `error: --confirm token "${token}" is missing the profile before '@' (expected <profile>@<substrate>, e.g. simple-sdlc@local)` };
  if (substrate !== 'local' && substrate !== 'gh-actions') {
    return { error: `error: --confirm token "${token}" has an invalid substrate "${substrate}" (expected <profile>@<substrate> with substrate 'local' or 'gh-actions')` };
  }
  return { profile, substrate };
}

export interface G1Record {
  /** Was a confirm/override question ever put to the human for this selection? */
  asked: boolean;
  /** The exact question text, when one was asked. */
  question?: string;
  /** What the human (or, for a validated pre-pick, the human's earlier --pick itself) answered. */
  answer: string;
}

/** The SELECTION RECORD — Phase 1's output, and every later phase's input. `pack` is loaded via TS.1's
 *  `getSetupPack` (the Q0 instantiation seam): from here on, later phases read THIS field, never the
 *  bare profile name. */
export interface SelectionRecord {
  profile: string;
  substrate: Substrate;
  pack: SetupPack;
  g1: G1Record;
  detect: DetectRef;
}

export function renderRecordHuman(record: SelectionRecord): string {
  const lines: string[] = [];
  lines.push(`SELECTION RECORD — ${record.profile} @ ${record.substrate}`);
  lines.push('='.repeat(60));
  lines.push(`G1: asked=${record.g1.asked}  answer="${record.g1.answer}"`);
  if (record.g1.question) lines.push(`  question: ${record.g1.question}`);
  lines.push('');
  lines.push(`SetupPack: landing_mode=${record.pack.landing_mode}  terminal_stage=${record.pack.terminal_stage}`);
  lines.push(`  direction_spec.mode=${record.pack.direction_spec.mode}  board_seed_recipe.promotion_fence=${record.pack.board_seed_recipe.promotion_fence}`);
  lines.push(`  maturity_signals: m3_tool=${record.pack.maturity_signals.m3_tool} m4_predicate=${record.pack.maturity_signals.m4_predicate} m6_signal=${record.pack.maturity_signals.m6_signal}`);
  lines.push('');
  lines.push(`detect: source=${record.detect.source}${record.detect.file ? ` file=${record.detect.file}` : ''} repoDir=${record.detect.repoDir}`);
  lines.push(`  repoFacts: onGitHub=${record.detect.repoFacts.onGitHub} populated=${record.detect.repoFacts.populated} ghAdmin=${record.detect.repoFacts.ghAdmin === undefined ? 'unknown' : record.detect.repoFacts.ghAdmin}`);
  return lines.join('\n');
}

// =========================================================================================================
// CLI arg parsing.
// =========================================================================================================

interface CliOptions {
  repoDir?: string;
  detectFile?: string;
  json: boolean;
  out?: string;
  pick?: string;
  substrate?: Substrate;
  /** The `<profile>@<substrate>` token the human confirmed (D1/D4: --confirm REQUIRES the full pair —
   *  never a bare boolean, never a profile-only name that would let a substrate drift bind silently). */
  confirm?: string;
  override?: string;
  hostedRunner?: boolean;
  preferNoAutoMerge?: boolean;
  canFundProxy?: boolean;
  wantsDemo?: boolean;
  wantsSOC2?: boolean;
  profilesRoot?: string;
}

/** parseArgs result: `error` is set on any malformed invocation — unknown flags and value-taking flags
 *  with a missing value are LOUD errors (review round D2/D3), never silently dropped/undefined (a typo'd
 *  `--comfirm` must not silently re-ask; a dangling `--pick` must not silently switch flows). */
export interface ParsedArgs {
  opts: CliOptions;
  error?: string;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const opts: CliOptions = { json: false };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    // D3: a value-taking flag whose value is absent (end of argv) or looks like another flag is a loud
    // error — never a silent `undefined` that changes which flow runs.
    const takeValue = (flag: string): string | undefined => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) return undefined;
      i++;
      return v;
    };
    switch (a) {
      case '--detect': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value (a TE.1 detect-report JSON file path)` };
        opts.detectFile = v;
        break;
      }
      case '--json':
        opts.json = true;
        break;
      case '--out': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value (the file path to write the selection record to)` };
        opts.out = v;
        break;
      }
      case '--pick': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value (the pre-picked profile name)` };
        opts.pick = v;
        break;
      }
      case '--substrate': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value ('local' or 'gh-actions')` };
        opts.substrate = v as Substrate;
        break;
      }
      case '--confirm': {
        // D1: --confirm REQUIRES the confirmed token (invocation 1's help line prints it exactly).
        // A bare --confirm is refused loudly so a drifted recommendation can never be silently bound.
        // (The token's <profile>@<substrate> SHAPE is validated in run() — D4 — where the error can say
        // more; here we only refuse the fully-absent value.)
        const v = takeValue(a);
        if (v === undefined) {
          return {
            opts,
            error:
              'error: --confirm requires the profile name being confirmed, as the full <profile>@<substrate> ' +
              'token, e.g. --confirm simple-sdlc@local (invocation 1\'s G1 question names it and its help ' +
              'line prints the exact token). A bare --confirm is refused: this CLI is stateless, so the repo ' +
              'may have changed since the question was asked — the confirmed pair is what lets the second ' +
              'invocation detect recommendation drift instead of silently binding a profile or substrate the ' +
              'human never saw.',
          };
        }
        opts.confirm = v;
        break;
      }
      case '--override': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value (the profile name to select instead of the recommendation)` };
        opts.override = v;
        break;
      }
      case '--hosted-runner':
        opts.hostedRunner = true;
        break;
      case '--no-hosted-runner':
        opts.hostedRunner = false;
        break;
      case '--prefer-no-auto-merge':
        opts.preferNoAutoMerge = true;
        break;
      case '--can-fund-proxy':
        opts.canFundProxy = true;
        break;
      case '--cannot-fund-proxy':
        opts.canFundProxy = false;
        break;
      case '--demo':
        opts.wantsDemo = true;
        break;
      case '--soc2':
        opts.wantsSOC2 = true;
        break;
      case '--profiles-root': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value (a profiles directory)` };
        opts.profilesRoot = v;
        break;
      }
      default:
        // D2: unknown flags are a loud error, never silently dropped (a typo'd `--comfirm` silently
        // re-asking the question is exactly the confusion this exists to prevent).
        if (a.startsWith('--')) return { opts, error: `error: unknown flag "${a}"` };
        positional.push(a);
        break;
    }
  }
  opts.repoDir = positional[0];
  return { opts };
}

const USAGE = [
  'usage: bun bin/install-select.ts <repoDir> [--detect <detect-report.json>] [--json] [--out <file>]',
  '                                  [--pick <profileName> [--substrate local|gh-actions]]',
  '                                  [--confirm <profileName>@<substrate> | --override <profileName>]',
  '                                  [--hosted-runner|--no-hosted-runner] [--prefer-no-auto-merge]',
  '                                  [--can-fund-proxy|--cannot-fund-proxy] [--demo] [--soc2]',
  '                                  [--profiles-root <dir>]',
  '',
  'Two flows:',
  '  (a) no --pick: RECOMMEND. First invocation (no --confirm/--override) emits the G1 question.',
  '      Second invocation, same args + --confirm <profile>@<substrate> (accept — pass the exact token the',
  '      question\'s help line printed) or --override <profile> (reject + choose), re-derives the',
  '      recommendation (stateless) and emits the SELECTION RECORD. If the re-derived recommendation no',
  '      longer matches the confirmed profile OR substrate (the repo changed between invocations), the CLI',
  '      hard-errors and G1 must be re-asked — it never binds a profile or substrate the human did not see.',
  '  (b) --pick <profile>: VALIDATE. Validates the pre-pick against the repo. If OK, emits the SELECTION',
  '      RECORD immediately (no question). If BLOCKED, emits the ONE blocker question, no record.',
].join('\n');

// =========================================================================================================
// run() — the CLI's testable core.
// =========================================================================================================

export interface RunResult {
  ok: boolean;
  output: string;
  /** True iff THIS invocation put a new question to the human (for the one-question-invariant tests). */
  asked: boolean;
  record?: SelectionRecord;
}

function overridesFromOpts(opts: CliOptions): Partial<RepoFacts> {
  return {
    hostedRunner: opts.hostedRunner,
    preferNoAutoMerge: opts.preferNoAutoMerge,
    canFundProxy: opts.canFundProxy,
    wantsDemo: opts.wantsDemo,
    wantsSOC2: opts.wantsSOC2,
  };
}

function loadPackOrError(profilesRoot: string, profile: string): { pack: SetupPack } | { error: string } {
  try {
    return { pack: getSetupPack(join(profilesRoot, profile)) };
  } catch (e) {
    return { error: (e as Error).message ?? String(e) };
  }
}

function emitRecord(record: SelectionRecord, opts: CliOptions): string {
  if (opts.out) writeFileSync(opts.out, JSON.stringify(record, null, 2) + '\n');
  return opts.json ? JSON.stringify(record, null, 2) : renderRecordHuman(record);
}

export async function run(argv: string[], profilesRootDefault: string, proc: ProcFn = defaultProc): Promise<RunResult> {
  const parsed = parseArgs(argv);
  if (parsed.error) return { ok: false, output: `${parsed.error}\n\n${USAGE}`, asked: false };
  const opts = parsed.opts;
  if (!opts.repoDir) return { ok: false, output: USAGE, asked: false };
  if (opts.substrate && opts.substrate !== 'local' && opts.substrate !== 'gh-actions') {
    return { ok: false, output: `error: --substrate must be 'local' or 'gh-actions', got "${opts.substrate}"\n\n${USAGE}`, asked: false };
  }
  if (opts.pick && (opts.confirm || opts.override)) {
    return { ok: false, output: 'error: --pick starts the standalone validate-a-pre-pick flow; it cannot be combined with --confirm/--override (those belong to the no-pre-pick recommend flow\'s second invocation).', asked: false };
  }
  if (opts.confirm && opts.override) {
    return { ok: false, output: 'error: --confirm and --override are mutually exclusive.', asked: false };
  }

  // --- resolve the detect input (--detect <file> or a live TE.1 detect() run) --------------------------
  let detectRef: DetectRef;
  try {
    if (opts.detectFile) {
      const report = loadDetectReport(opts.detectFile);
      const repoFacts = repoFactsFromDetectReport(report, overridesFromOpts(opts));
      detectRef = { source: 'file', file: opts.detectFile, repoDir: opts.repoDir, repoFacts };
    } else {
      if (!existsSync(opts.repoDir)) return { ok: false, output: `error: ${opts.repoDir} does not exist`, asked: false };
      const report = await detect(opts.repoDir, proc);
      const repoFacts = repoFactsFromDetectReport(report, overridesFromOpts(opts));
      detectRef = { source: 'live', repoDir: opts.repoDir, repoFacts };
    }
  } catch (e) {
    return { ok: false, output: `error: ${(e as Error).message ?? e}`, asked: false };
  }

  const profilesRoot = opts.profilesRoot ?? profilesRootDefault;
  const profiles = loadAllProfileFacts(profilesRoot);

  // ---- (b) pre-pick: validate-a-pre-pick (TD.2) ----------------------------------------------------
  if (opts.pick) {
    const result: ValidationResult = validatePrePick(opts.pick, opts.substrate, detectRef.repoFacts, profiles);

    if (!result.ok) {
      // BLOCKED — exactly one question: the blocker doubles as "pick something else?". No record.
      const question = `BLOCKED: "${opts.pick}"${opts.substrate ? ` @ ${opts.substrate}` : ''} is not valid for this repo — ${result.blocker}`;
      const output = opts.json
        ? JSON.stringify({ mode: 'validate', asked: true, question, result, detect: detectRef }, null, 2)
        : `${question}\n\nNotes:\n${[...result.notes].map((n) => `  - ${n}`).join('\n')}`;
      return { ok: false, output, asked: true };
    }

    // Validated OK — zero questions: the pre-pick + a clean validation already IS G1's confirmed answer.
    const loaded = loadPackOrError(profilesRoot, result.profile);
    if ('error' in loaded) return { ok: false, output: `error: ${loaded.error}`, asked: false };
    const record: SelectionRecord = {
      profile: result.profile,
      substrate: result.substrate,
      pack: loaded.pack,
      g1: { asked: false, answer: `pre-picked "${result.profile}"${opts.substrate ? ` @ ${opts.substrate}` : ''} — validated OK against the repo, no confirmation question needed` },
      detect: detectRef,
    };
    return { ok: true, output: emitRecord(record, opts), asked: false, record };
  }

  // ---- (a) no pre-pick: recommend flow ---------------------------------------------------------------
  let rec: Recommendation;
  try {
    rec = recommendProfile(detectRef.repoFacts, profiles);
  } catch (e) {
    return { ok: false, output: `error: ${(e as Error).message ?? e}`, asked: false };
  }
  const question = formatG1Question(rec);

  if (!opts.confirm && !opts.override) {
    // Invocation 1: emit THE ONE G1 QUESTION. No record — nothing is instantiated until the human answers.
    const output = opts.json
      ? JSON.stringify({ mode: 'recommend', asked: true, question, recommendation: rec, detect: detectRef }, null, 2)
      : [question, '', 'Why:', ...rec.reasons.map((r) => `  - ${r}`), '', 'Answer on a second invocation (same repoDir/--detect args — this CLI is stateless):', `  --confirm ${`${rec.profile}@${rec.substrate}`.padEnd(18)} accept the recommendation (pass exactly this profile@substrate token)`, '  --override <profileName>     choose a different profile instead'].join('\n');
    return { ok: true, output, asked: true };
  }

  // Invocation 2: apply the human's answer. Zero NEW questions.
  let chosenProfile = rec.profile;
  let chosenSubstrate = rec.substrate;
  let answer: string;
  if (opts.confirm) {
    // CONFIRM-DRIFT GUARD (D1 + D4): the human confirmed a NAMED profile@substrate pair — the one
    // invocation 1's question put to them (G1 is a confirm/override of profile+SUBSTRATE, DESIGN §Q3's
    // gate table; the recommender yields the same profile on two substrates, so a profile-only check
    // would still let a ghAdmin drift silently flip where the fleet runs). If re-deriving now recommends
    // a different profile OR substrate, the repo's facts changed between the two stateless invocations
    // and this "confirmation" answers a question that was never asked. HARD-ERROR: never bind the
    // drifted pair, never fabricate a g1 record for it — G1 must be re-asked.
    const confirmed = parseConfirmToken(opts.confirm);
    if ('error' in confirmed) return { ok: false, output: `${confirmed.error}\n\n${USAGE}`, asked: false };
    if (confirmed.profile !== rec.profile || confirmed.substrate !== rec.substrate) {
      const f = detectRef.repoFacts;
      const factsNow = `onGitHub=${f.onGitHub}, populated=${f.populated}, ghAdmin=${f.ghAdmin === undefined ? 'unknown' : f.ghAdmin}`;
      return {
        ok: false,
        output:
          `error: recommendation drifted since the question was asked (was "${confirmed.profile}@${confirmed.substrate}", now "${rec.profile}@${rec.substrate}"` +
          ` — repo facts changed: the facts NOW read ${factsNow}, which drive: ${rec.reasons.join('; ')}); ` +
          `re-ask G1: re-run without --confirm to emit the current question, and confirm THAT recommendation.`,
        asked: false,
      };
    }
    answer = `confirmed "${confirmed.profile}@${confirmed.substrate}"`;
  } else {
    // --override <profile>: never blindly trust an override into a clobber — validate it through the
    // SAME eligibility path a pre-pick goes through (reuses TD.2's validatePrePick, not re-derived).
    const check = validatePrePick(opts.override as string, opts.substrate, detectRef.repoFacts, profiles);
    if (!check.ok) {
      return { ok: false, output: `error: --override "${opts.override}" is not valid for this repo — ${check.blocker}`, asked: false };
    }
    chosenProfile = check.profile;
    chosenSubstrate = check.substrate;
    answer = `overridden to "${chosenProfile}" @ ${chosenSubstrate} (recommendation had been "${rec.profile}" @ ${rec.substrate})`;
  }

  const loaded = loadPackOrError(profilesRoot, chosenProfile);
  if ('error' in loaded) return { ok: false, output: `error: ${loaded.error}`, asked: false };
  const record: SelectionRecord = {
    profile: chosenProfile,
    substrate: chosenSubstrate,
    pack: loaded.pack,
    g1: { asked: true, question, answer },
    detect: detectRef,
  };
  return { ok: true, output: emitRecord(record, opts), asked: false, record };
}

// =========================================================================================================
// Standalone CLI.
// =========================================================================================================
if (import.meta.main) {
  const result = await run(process.argv.slice(2), bundledProfilesRoot);
  process.stdout.write(result.output + '\n');
  process.exit(result.ok ? 0 : 1);
}
