#!/usr/bin/env bun
// TE.3 — Phase 2 CAPTURE DIRECTION (G2) — CONDITIONAL + existing-doc-first, not a forced vision on every
// profile (OA-INSTALL-IMPLEMENTATION-TASKS.md#te3, DESIGN §Phase 2/G2 + hardening #3, the THIRD-SKEPTIC
// CORRECTED version). Consumes a TE.2 SELECTION RECORD (`--record <file>`, bin/install-select.ts's
// `SelectionRecord`) and drives direction capture purely off the loaded pack's `direction_spec.mode` —
// never a profile-name literal (TS.2's `check:no-profile-branching` scans this file too).
//
// THIS IS A DETECT-AND-ASK TOOL, NEVER AN AUTHOR TOOL. It never invents mission/positioning content and
// never writes a doc file. Two behaviors, selected by `pack.direction_spec.mode`:
//
//   (a) 'documents.roles' (self-driving) — the profile's shipped `<!-- REPLACE THIS -->`-seeded role files
//       (`docs/VISION.md`, `docs/CONSTITUTION.md`) are REQUIRED to be filled. This tool's job is only to
//       DETECT which of them still carry the marker and emit that as a structured ASK (file path + role +
//       marker). A second invocation, `--filled <file1,file2,...>`, re-reads the same files fresh off disk
//       (this CLI is stateless, same discipline as bin/install-select.ts) and reports whether the
//       invariant is now satisfied. `roadmap` is deliberately excluded from the check, mirroring TA.1's own
//       `CONTENT_GATE_ROLES` (bin/preflight.ts) — it's the strategist's machine-groomed medium, never
//       hand-authored content a human fills in at install time.
//
//   (b) 'operator' (simple-gh / simple-gh-sdlc / simple-sdlc) — capture direction ONLY when the repo LACKS
//       READABLE POSITIONING (see `isReadablePositioning` below for the concrete bar). If positioning
//       exists: "no action needed, the planner will read <files>" and STOP — this tool NEVER authors a new
//       vision doc and NEVER touches `human_required_paths` when positioning is already present (that would
//       be exactly the risk-surface mutation hardening #3 warns against — declaring `documents.roles.vision`
//       on an operator profile hard-FAILs preflight on a missing file and silently auto-gates a path into
//       `human_required_paths`, packages/core/src/ir-yaml.ts:36-46#pr-138). If positioning is ABSENT, this
//       tool distinguishes two cases per hardening #3's own ordering: some existing-but-sparse doc(s) exist
//       (README.md that's just a title, a stub AGENTS.md, …) → PREFER recommending the install agent
//       role-map that doc as the anchor; truly nothing exists at all → flag that a minimal anchor must be
//       AUTHORED (by the install agent / a human at TE.5), never by this deterministic tool.
//
//   (c) 'none' — the pack declares no direction-capture step at all (not used by any of the four shipped
//       profiles today, kept live in the schema per packages/core/src/setup-pack.ts's own comment). The
//       invariant is trivially satisfied; this tool is a no-op.
//
// THE INVARIANT (per DESIGN, checked — never enforced by writing — by `checkDirectionInvariant`, exported
// standalone for its own unit tests): "some readable positioning exists — found or, if truly absent,
// authored" — checked before TE.5's planner dispatch. This tool only CHECKS + REPORTS it.
//
// REUSE (do not re-derive): `UNEDITED_TEMPLATE_MARKER` is TA.1's own exported constant (bin/preflight.ts)
// — the SAME string every other content-gate check in this repo keys off (scripts/open-autonomy-preflight.ts,
// packages/local-runner-cli/src/maturity.ts). `getSetupPack`/`SetupPack`/`DirectionMode` are TS.1's own
// (packages/core/src/setup-pack.ts). `parseIr` is core's own IR parser — used here ONLY to recover the
// role→path NAMES (`documents.roles.vision`/`.constitution`) that `SetupPack.direction_spec.templates`
// already flattens into a bare array; nothing about IR validation or the auto-gate is re-implemented (
// `parseIr` already runs `applyDocumentAutoGate` internally, exactly as it does for every other real
// caller — this file never calls or duplicates that function itself, and never writes the parsed IR back
// to disk, so no `human_required_paths` mutation happens here beyond what parsing an already-committed
// `ir.yml` already causes in memory).
//
// WHY THE PROFILE SOURCE IS A VALID CHECK TARGET (not a shortcut): `DocumentRoles`' own contract
// (packages/core/src/ir.ts:86-92) says role paths are "relative to the installed repo root ... typically
// authored outside the profile" — but TE.3 (Phase 2) runs BEFORE TE.5 (Phase 4 EXECUTE) ever compiles the
// profile onto the target repo (OA-INSTALL-IMPLEMENTATION-TASKS.md TE.5's own ordering: "compile -> write
// filled vision (TE.3 output) -> commit harness"). On a first-time install the target repo genuinely does
// not have `docs/VISION.md` yet — the only real file that exists to inspect is the profile's OWN shipped
// template (`profiles/self-driving/docs/VISION.md`), which is copied VERBATIM into the target at compile
// time (`resources:`, ir.yml) unless filled first. So `checkDocumentsRolesGaps` prefers the REPO's own copy
// when one already exists (a re-install, or self-driving dogfooding onto the very repo it lives in — this
// repo's own root `docs/VISION.md` is exactly that case, already filled with real content) and falls back
// to the profile's source template otherwise — both branches are checking real, present files, never a
// guess.
//
// HOME rationale (bin/, not packages/local-runner-cli/): identical reasoning to TE.1/TE.2's own header
// comments — this file takes RUNTIME imports of `@open-autonomy/core` that only resolve under `bun`'s
// extension-free internal module resolution.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseIr, type DirectionMode, type SetupPack } from '@open-autonomy/core';
import { profilesRoot as bundledProfilesRoot } from './bundled-profiles';
import { UNEDITED_TEMPLATE_MARKER } from './preflight.ts';

export { UNEDITED_TEMPLATE_MARKER };

// =========================================================================================================
// The SELECTION RECORD (TE.2's own output shape, bin/install-select.ts) — the input contract. Deliberately
// NOT importing `SelectionRecord` as a type from install-select.ts's own module graph (that file has no
// runtime export dependency this needs); this is a minimal structural read of the JSON it emits.
// =========================================================================================================

export interface SelectionRecordRef {
  profile: string;
  substrate: string;
  pack: SetupPack;
  detect: { repoDir: string; [k: string]: unknown };
  [k: string]: unknown;
}

/** Read + parse a TE.2 SelectionRecord JSON file. Loud on anything malformed — same discipline as TE.2's
 *  own `loadDetectReport` (bin/install-select.ts): a malformed/incomplete record must never be silently
 *  treated as some default profile/pack. */
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
    throw new Error(`--record ${file}: malformed selection record — expected a JSON object shaped like TE.2's SelectionRecord (bin/install-select.ts), got ${Array.isArray(parsed) ? 'an array' : typeof parsed}`);
  }
  const r = parsed as Partial<SelectionRecordRef>;
  if (typeof r.profile !== 'string' || !r.profile) {
    throw new Error(`--record ${file}: malformed selection record — missing/invalid "profile" (expected TE.2's SelectionRecord shape, e.g. from "bun bin/install-select.ts <repoDir> ... --out <file>")`);
  }
  if (!r.pack || typeof r.pack !== 'object' || !(r.pack as { direction_spec?: unknown }).direction_spec) {
    throw new Error(`--record ${file}: malformed selection record — missing/invalid "pack.direction_spec" (expected TE.2's SelectionRecord shape with an instantiated SetupPack)`);
  }
  if (!r.detect || typeof r.detect !== 'object' || typeof (r.detect as { repoDir?: unknown }).repoDir !== 'string') {
    throw new Error(`--record ${file}: malformed selection record — missing/invalid "detect.repoDir"`);
  }
  return r as SelectionRecordRef;
}

// =========================================================================================================
// (a) documents.roles mode — TA.1 content-gate reuse.
// =========================================================================================================

// TA.1's own role set (bin/preflight.ts's un-exported `CONTENT_GATE_ROLES`) — mirrored here as a bare list
// of the two field NAMES (not re-deriving any gate logic; `UNEDITED_TEMPLATE_MARKER` — the actual
// detection logic — is imported verbatim above). `roadmap` is never in this list: it's the strategist's
// machine-groomed medium (packages/core/src/ir-yaml.ts's `applyDocumentAutoGate` comment: "roadmap is
// deliberately NEVER auto-gated ... it's the strategist's medium"), not hand-authored content a human
// fills at install time. `SetupPack.direction_spec.templates` is a flat, role-name-erased array (TS.1), so
// recovering "which of these three paths is vision vs constitution vs roadmap" means re-reading the
// profile's own `ir.yml`'s named `documents.roles` map directly — there is no other source for that name.
const CONTENT_GATE_ROLES = ['vision', 'constitution'] as const;
type ContentGateRole = (typeof CONTENT_GATE_ROLES)[number];

export interface TemplateGap {
  role: ContentGateRole;
  /** repo-relative path, per DocumentRoles' own contract (ir.ts:86-92). */
  path: string;
  /** which file was actually read to detect this gap. */
  source: 'repo' | 'profile-source';
  checkedAt: string;
  marker: string;
}

export interface CheckedRole {
  role: ContentGateRole;
  path: string;
  source: 'repo' | 'profile-source' | 'missing';
  filled: boolean;
}

export interface DocumentsRolesCheck {
  gaps: TemplateGap[];
  checkedRoles: CheckedRole[];
}

/** Detect which of the profile's declared vision/constitution role files still carry the unedited-template
 *  marker. Prefers an already-materialized copy in `repoDir` (a re-install, or self-driving dogfooding onto
 *  the repo it already lives in) and falls back to the profile's own shipped source template — see this
 *  file's header "WHY THE PROFILE SOURCE IS A VALID CHECK TARGET". A role whose file exists NOWHERE is
 *  reported as `source: 'missing'` and excluded from `gaps` (a missing declared-role file is TA.1's own
 *  hard-FAIL to report at preflight time — this WARN-only tool does not duplicate that). Pure read — never
 *  writes anything. */
export function checkDocumentsRolesGaps(profileDir: string, repoDir: string): DocumentsRolesCheck {
  const ir = parseIr(readFileSync(join(profileDir, 'ir.yml'), 'utf8'));
  const roles = ir.documents?.roles as Record<string, string | undefined> | undefined;
  const gaps: TemplateGap[] = [];
  const checkedRoles: CheckedRole[] = [];
  if (!roles) return { gaps, checkedRoles };

  for (const role of CONTENT_GATE_ROLES) {
    const relPath = roles[role];
    if (!relPath) continue;
    const repoPath = join(repoDir, relPath);
    const profilePath = join(profileDir, relPath);
    let source: CheckedRole['source'];
    let abs: string | undefined;
    if (existsSync(repoPath)) {
      source = 'repo';
      abs = repoPath;
    } else if (existsSync(profilePath)) {
      source = 'profile-source';
      abs = profilePath;
    } else {
      source = 'missing';
    }
    if (source === 'missing' || !abs) {
      checkedRoles.push({ role, path: relPath, source: 'missing', filled: false });
      continue;
    }
    const content = readFileSync(abs, 'utf8');
    const filled = !content.includes(UNEDITED_TEMPLATE_MARKER);
    checkedRoles.push({ role, path: relPath, source, filled });
    if (!filled) gaps.push({ role, path: relPath, source, checkedAt: abs, marker: UNEDITED_TEMPLATE_MARKER });
  }
  return { gaps, checkedRoles };
}

export interface FilledConfirmation {
  satisfied: boolean;
  stillOutstanding: TemplateGap[];
  /** paths named in --filled that were NOT a declared content-gated role at all (informational only). */
  irrelevantClaims: string[];
  detail: string;
}

/** The --filled confirm step. Stateless by design (mirrors TE.2's own two-invocation discipline, bin/
 *  install-select.ts's header): re-reads the SAME files fresh off disk via a fresh `checkDocumentsRolesGaps`
 *  call — `claimedFilled` is a cross-check of INTENT, never the source of truth for whether a marker is
 *  actually gone. A claimed-filled path that was never a declared content-gated role is reported (not
 *  silently ignored) but does not block satisfaction on its own. */
export function confirmFilled(check: DocumentsRolesCheck, claimedFilled: string[]): FilledConfirmation {
  const gapPaths = new Set(check.gaps.map((g) => g.path));
  const irrelevantClaims = claimedFilled.filter((p) => !check.checkedRoles.some((r) => r.path === p));
  const satisfied = check.gaps.length === 0 && check.checkedRoles.every((r) => r.source !== 'missing');
  const claimedButStillOutstanding = check.gaps.filter((g) => claimedFilled.includes(g.path));
  const detail = satisfied
    ? `all declared content-gated roles (${check.checkedRoles.map((r) => r.role).join(', ')}) are filled — no ${UNEDITED_TEMPLATE_MARKER} marker remains, and every declared role's file is present.`
    : check.gaps.length > 0
      ? `still outstanding: ${check.gaps.map((g) => `${g.role} (${g.path}${gapPaths.has(g.path) && claimedButStillOutstanding.some((c) => c.path === g.path) ? ' — claimed --filled but the marker is STILL present' : ''})`).join('; ')}`
      : `a declared role's file is still entirely missing: ${check.checkedRoles.filter((r) => r.source === 'missing').map((r) => `${r.role} (${r.path})`).join('; ')}`;
  return { satisfied, stillOutstanding: check.gaps, irrelevantClaims, detail };
}

// =========================================================================================================
// (b) operator mode — existing-doc-first positioning check.
// =========================================================================================================
//
// READABLE POSITIONING — the concrete bar (task brief: "define 'readable positioning' concretely and cite
// it"): a candidate file — README.md, AGENTS.md, or any top-level docs/*.md — counts as readable
// positioning iff, after stripping markdown comments and badge/shield-image lines:
//   1. it does NOT carry the shipped UNEDITED_TEMPLATE_MARKER (an unedited template is not real content —
//      same signal TA.1's own content gate keys off, reused here for the identical reason);
//   2. it has at least MIN_READABLE_CHARS (200) non-whitespace characters of remaining content; AND
//   3. at least one of its lines (trimmed) is NOT a heading (`#`) and has >= MIN_PROSE_LINE_CHARS (40)
//      non-whitespace characters — i.e. it is not JUST a title + badges (the classic `npm init`/git-init
//      empty-scaffold shape: "# my-repo" and nothing else).
// This is a presence+non-trivial-content bar, deliberately never a judgment call about QUALITY (same
// "existence, not content" discipline TE.1's `detectLanguageAndBuild` doc comment states) — good enough to
// distinguish "a maintainer wrote something a human/planner can read as positioning" from "an empty repo
// with a one-line README stub", never a claim about whether the positioning is any GOOD.
const POSITIONING_FIXED_CANDIDATES = ['README.md', 'AGENTS.md'];
const MIN_READABLE_CHARS = 200;
const MIN_PROSE_LINE_CHARS = 40;

function stripNonContent(raw: string): string {
  // strip markdown comments (incl. the shipped `<!-- REPLACE THIS ... -->` seeds) and badge/shield-image
  // lines (`[![...`, `![...`) — neither counts as authored prose.
  const noComments = raw.replace(/<!--[\s\S]*?-->/g, '');
  return noComments
    .split('\n')
    .filter((line) => !/^\s*\[?!\[/.test(line))
    .join('\n');
}

export interface PositioningFile {
  path: string;
  chars: number;
  reason: string;
}

export function isReadablePositioning(raw: string): { readable: boolean; chars: number; reason: string } {
  if (raw.includes(UNEDITED_TEMPLATE_MARKER)) {
    return { readable: false, chars: 0, reason: `carries the shipped "${UNEDITED_TEMPLATE_MARKER}" marker — an unedited template, not authored positioning` };
  }
  const stripped = stripNonContent(raw);
  const chars = stripped.replace(/\s/g, '').length;
  const lines = stripped.split('\n').map((l) => l.trim()).filter(Boolean);
  const hasProseLine = lines.some((l) => !l.startsWith('#') && l.replace(/\s/g, '').length >= MIN_PROSE_LINE_CHARS);
  if (chars < MIN_READABLE_CHARS) {
    return { readable: false, chars, reason: `only ${chars} non-whitespace char(s) of content (floor is ${MIN_READABLE_CHARS}) — too sparse to count as readable positioning` };
  }
  if (!hasProseLine) {
    return { readable: false, chars, reason: `${chars} chars but no prose line >= ${MIN_PROSE_LINE_CHARS} non-whitespace chars outside headings/badges — reads as a title-only stub, not real positioning` };
  }
  return { readable: true, chars, reason: `${chars} non-whitespace chars incl. a real prose line — counts as readable positioning` };
}

function listPositioningCandidates(repoDir: string): string[] {
  const candidates: string[] = [];
  for (const rel of POSITIONING_FIXED_CANDIDATES) {
    if (existsSync(join(repoDir, rel)) && statSync(join(repoDir, rel)).isFile()) candidates.push(rel);
  }
  const docsDir = join(repoDir, 'docs');
  if (existsSync(docsDir) && statSync(docsDir).isDirectory()) {
    for (const entry of readdirSync(docsDir).sort()) {
      const p = join(docsDir, entry);
      if (entry.endsWith('.md') && existsSync(p) && statSync(p).isFile()) candidates.push(join('docs', entry));
    }
  }
  return candidates;
}

export interface PositioningCheck {
  /** every candidate that PASSES the readable-positioning bar. */
  readable: PositioningFile[];
  /** every candidate file that exists at all (readable or not) — used to distinguish "sparse" from
   *  "truly nothing exists" when no candidate is readable. */
  candidates: PositioningFile[];
}

export function checkOperatorPositioning(repoDir: string): PositioningCheck {
  const paths = listPositioningCandidates(repoDir);
  const candidates: PositioningFile[] = [];
  const readable: PositioningFile[] = [];
  for (const rel of paths) {
    const raw = readFileSync(join(repoDir, rel), 'utf8');
    const r = isReadablePositioning(raw);
    const pf: PositioningFile = { path: rel, chars: r.chars, reason: r.reason };
    candidates.push(pf);
    if (r.readable) readable.push(pf);
  }
  return { readable, candidates };
}

// =========================================================================================================
// The invariant (standalone, unit-testable per the task's own acceptance requirement).
// =========================================================================================================

export interface InvariantResult {
  mode: DirectionMode;
  satisfied: boolean;
  reason: string;
}

/** "Before TE.5's planner dispatch: some readable positioning exists (found or, if truly absent,
 *  authored)." This function only CHECKS + REPORTS the invariant — it never authors/writes anything to
 *  make it true. Exported standalone so it can be unit-tested independent of the CLI plumbing. */
export function checkDirectionInvariant(pack: SetupPack, profileDir: string, repoDir: string): InvariantResult {
  const mode = pack.direction_spec.mode;
  if (mode === 'none') {
    return { mode, satisfied: true, reason: "direction_spec.mode is 'none' — this profile declares no direction-capture step; the invariant is vacuously satisfied." };
  }
  if (mode === 'documents.roles') {
    const check = checkDocumentsRolesGaps(profileDir, repoDir);
    if (check.checkedRoles.length === 0) {
      return { mode, satisfied: false, reason: 'direction_spec.mode is documents.roles but the profile\'s ir.yml declares no documents.roles block at all — cannot verify the invariant.' };
    }
    const missing = check.checkedRoles.filter((r) => r.source === 'missing');
    if (missing.length > 0) {
      return { mode, satisfied: false, reason: `declared role file(s) missing entirely: ${missing.map((r) => `${r.role} (${r.path})`).join(', ')}` };
    }
    if (check.gaps.length > 0) {
      return { mode, satisfied: false, reason: `unfilled template(s): ${check.gaps.map((g) => `${g.role} (${g.path}, still carries "${g.marker}")`).join(', ')}` };
    }
    return { mode, satisfied: true, reason: `all declared content-gated role file(s) present and filled: ${check.checkedRoles.map((r) => `${r.role} (${r.path})`).join(', ')}` };
  }
  // mode === 'operator'
  const pos = checkOperatorPositioning(repoDir);
  if (pos.readable.length > 0) {
    return { mode, satisfied: true, reason: `readable positioning found: ${pos.readable.map((f) => f.path).join(', ')}` };
  }
  if (pos.candidates.length > 0) {
    return { mode, satisfied: false, reason: `no readable positioning yet — sparse candidate doc(s) exist (${pos.candidates.map((f) => f.path).join(', ')}) but none clear the readable-positioning bar; role-map one of them rather than authoring a new docs/VISION.md.` };
  }
  return { mode, satisfied: false, reason: 'no readable positioning and no candidate doc(s) at all (no README.md/AGENTS.md/docs/*.md) — a minimal anchor must be authored.' };
}

// =========================================================================================================
// The DIRECTION RECORD — this unit's output.
// =========================================================================================================

export type DirectionAction =
  | 'no-op-none'
  | 'already-filled'
  | 'ask-fill'
  | 'confirmed-filled'
  | 'still-outstanding'
  | 'no-action-needed'
  | 'anchor-needed-role-map'
  | 'anchor-needed-author';

export interface DirectionRecord {
  profile: string;
  mode: DirectionMode;
  repoDirChecked: string;
  action: DirectionAction;
  invariant: InvariantResult;
  detail: string;
  documentsRoles?: DocumentsRolesCheck;
  filledConfirmation?: FilledConfirmation;
  positioning?: PositioningCheck;
}

export function renderRecordHuman(record: DirectionRecord): string {
  const lines: string[] = [];
  lines.push(`DIRECTION RECORD (TE.3) — ${record.profile}  mode=${record.mode}`);
  lines.push('='.repeat(60));
  lines.push(`repoDirChecked: ${record.repoDirChecked}`);
  lines.push(`action: ${record.action}`);
  lines.push(`invariant satisfied: ${record.invariant.satisfied}`);
  lines.push(`  ${record.invariant.reason}`);
  lines.push('');
  lines.push(record.detail);
  if (record.documentsRoles) {
    lines.push('');
    lines.push('checked roles:');
    for (const r of record.documentsRoles.checkedRoles) lines.push(`  - ${r.role}: ${r.path} (source=${r.source}, filled=${r.filled})`);
  }
  if (record.positioning) {
    lines.push('');
    lines.push('positioning candidates:');
    if (record.positioning.candidates.length === 0) lines.push('  (none found)');
    for (const c of record.positioning.candidates) lines.push(`  - ${c.path}: ${c.reason}`);
  }
  return lines.join('\n');
}

// =========================================================================================================
// run() — the CLI's testable core.
// =========================================================================================================

interface CliOptions {
  record?: string;
  repoDir?: string;
  profilesRoot?: string;
  filled?: string[];
  json: boolean;
  out?: string;
}

export interface ParsedArgs {
  opts: CliOptions;
  error?: string;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const opts: CliOptions = { json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const takeValue = (flag: string): string | undefined => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) return undefined;
      i++;
      return v;
    };
    switch (a) {
      case '--record': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value (a TE.2 selection-record JSON file path)` };
        opts.record = v;
        break;
      }
      case '--repo-dir': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value (overrides the record's detect.repoDir)` };
        opts.repoDir = v;
        break;
      }
      case '--profiles-root': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value (a profiles directory)` };
        opts.profilesRoot = v;
        break;
      }
      case '--filled': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value (a comma-separated list of file paths claimed as filled)` };
        opts.filled = v.split(',').map((s) => s.trim()).filter(Boolean);
        break;
      }
      case '--json':
        opts.json = true;
        break;
      case '--out': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value (the file path to write the direction record to)` };
        opts.out = v;
        break;
      }
      default:
        return { opts, error: `error: unknown flag "${a}"` };
    }
  }
  return { opts };
}

const USAGE = [
  'usage: bun bin/install-direction.ts --record <selection-record.json> [--repo-dir <dir>]',
  '                                     [--profiles-root <dir>] [--filled <file1,file2,...>]',
  '                                     [--json] [--out <file>]',
  '',
  'Behavior depends on the loaded SetupPack\'s direction_spec.mode (never a profile-name literal):',
  "  documents.roles (self-driving) — detects which shipped REPLACE-THIS role templates still need",
  '    filling and emits that as an ASK. Re-invoke with --filled <paths> after editing them to confirm.',
  '  operator (simple-gh/-sdlc/simple-sdlc) — checks whether the repo already has readable positioning',
  '    (README.md/AGENTS.md/docs/*.md with real content). If so: no action needed. If not: reports an',
  '    anchor is needed, preferring role-mapping an existing sparse doc over authoring a new one.',
  '  This tool never writes/authors any doc file — detect-and-ask only.',
].join('\n');

export interface RunResult {
  ok: boolean;
  output: string;
  record?: DirectionRecord;
}

function emitRecord(record: DirectionRecord, opts: CliOptions): string {
  if (opts.out) writeFileSync(opts.out, JSON.stringify(record, null, 2) + '\n');
  return opts.json ? JSON.stringify(record, null, 2) : renderRecordHuman(record);
}

export function run(argv: string[], profilesRootDefault: string): RunResult {
  const parsed = parseArgs(argv);
  if (parsed.error) return { ok: false, output: `${parsed.error}\n\n${USAGE}` };
  const opts = parsed.opts;
  if (!opts.record) return { ok: false, output: USAGE };

  let sel: SelectionRecordRef;
  try {
    sel = loadSelectionRecord(opts.record);
  } catch (e) {
    return { ok: false, output: `error: ${(e as Error).message ?? e}` };
  }

  const repoDir = opts.repoDir ?? sel.detect.repoDir;
  const profilesRoot = opts.profilesRoot ?? profilesRootDefault;
  const profileDir = join(profilesRoot, sel.profile);
  if (!existsSync(join(profileDir, 'ir.yml'))) {
    return { ok: false, output: `error: profile "${sel.profile}" not found under ${profilesRoot} (no ir.yml) — pass --profiles-root if the record was built against a different profiles catalog` };
  }
  if (!existsSync(repoDir)) {
    return { ok: false, output: `error: repoDir "${repoDir}" does not exist (from record's detect.repoDir; override with --repo-dir)` };
  }

  const pack = sel.pack;
  const mode = pack.direction_spec.mode;

  if (opts.filled && mode !== 'documents.roles') {
    return { ok: false, output: `error: --filled only applies to direction_spec.mode 'documents.roles' (this pack's mode is '${mode}' — operator-mode direction capture is a repo-existing-content check, not a fill-then-confirm cycle; this tool never authors content for operator profiles).` };
  }

  if (mode === 'none') {
    const invariant = checkDirectionInvariant(pack, profileDir, repoDir);
    const record: DirectionRecord = {
      profile: sel.profile,
      mode,
      repoDirChecked: repoDir,
      action: 'no-op-none',
      invariant,
      detail: "direction_spec.mode is 'none' — nothing for this tool to check or ask.",
    };
    return { ok: true, output: emitRecord(record, opts), record };
  }

  if (mode === 'documents.roles') {
    const check = checkDocumentsRolesGaps(profileDir, repoDir);
    if (opts.filled) {
      const confirmation = confirmFilled(check, opts.filled);
      const invariant = checkDirectionInvariant(pack, profileDir, repoDir);
      const record: DirectionRecord = {
        profile: sel.profile,
        mode,
        repoDirChecked: repoDir,
        action: confirmation.satisfied ? 'confirmed-filled' : 'still-outstanding',
        invariant,
        detail: confirmation.detail,
        documentsRoles: check,
        filledConfirmation: confirmation,
      };
      return { ok: confirmation.satisfied, output: emitRecord(record, opts), record };
    }
    const invariant = checkDirectionInvariant(pack, profileDir, repoDir);
    const record: DirectionRecord = {
      profile: sel.profile,
      mode,
      repoDirChecked: repoDir,
      action: check.gaps.length > 0 ? 'ask-fill' : 'already-filled',
      invariant,
      detail:
        check.gaps.length > 0
          ? `ASK: the following shipped template(s) still carry "${UNEDITED_TEMPLATE_MARKER}" and must be filled before Phase 4 (this tool never invents the content):\n${check.gaps.map((g) => `  - ${g.role}: ${g.checkedAt} (repo-relative: ${g.path}, source=${g.source})`).join('\n')}`
          : `all declared content-gated role file(s) are already filled: ${check.checkedRoles.map((r) => `${r.role} (${r.path})`).join(', ')}`,
      documentsRoles: check,
    };
    return { ok: true, output: emitRecord(record, opts), record };
  }

  // mode === 'operator'
  const pos = checkOperatorPositioning(repoDir);
  const invariant = checkDirectionInvariant(pack, profileDir, repoDir);
  let action: DirectionAction;
  let detail: string;
  if (pos.readable.length > 0) {
    action = 'no-action-needed';
    detail = `no action needed — this repo already has readable positioning: ${pos.readable.map((f) => `${f.path} (${f.chars} chars)`).join(', ')}. The planner (TE.5) will read ${pos.readable.length === 1 ? 'it' : 'these'} directly; this tool authors nothing.`;
  } else if (pos.candidates.length > 0) {
    const best = [...pos.candidates].sort((a, b) => b.chars - a.chars)[0]!;
    action = 'anchor-needed-role-map';
    detail = `anchor needed — no candidate doc clears the readable-positioning bar. Existing candidate(s): ${pos.candidates.map((f) => `${f.path} (${f.reason})`).join('; ')}. Per hardening #3, PREFER role-mapping the best existing candidate ("${best.path}") as the direction anchor over authoring a new docs/VISION.md. This tool does not author or role-map anything itself — that is the install agent's/human's job (TE.5).`;
  } else {
    action = 'anchor-needed-author';
    detail = `anchor needed — no readable positioning AND no candidate doc(s) at all (no README.md/AGENTS.md/docs/*.md found under ${repoDir}). A minimal anchor must be authored. This tool does not author it itself — that is the install agent's/human's job (TE.5).`;
  }
  const record: DirectionRecord = {
    profile: sel.profile,
    mode,
    repoDirChecked: repoDir,
    action,
    invariant,
    detail,
    positioning: pos,
  };
  return { ok: true, output: emitRecord(record, opts), record };
}

// =========================================================================================================
// Standalone CLI.
// =========================================================================================================
if (import.meta.main) {
  const result = run(process.argv.slice(2), bundledProfilesRoot);
  process.stdout.write(result.output + '\n');
  process.exit(result.ok ? 0 : 1);
}
