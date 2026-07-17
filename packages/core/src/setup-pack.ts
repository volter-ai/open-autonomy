// SetupPack — the common install scaffold's input contract (TS.1, OA-INSTALL-IMPLEMENTATION-TASKS.md).
// Two-layer shape (DESIGN §Q0): Layer 1 (the recommender, `oa maturity`, the install agent — none of
// which are built by this unit) reads ONE small declarative interface per profile instead of re-deriving
// parameters or branching on a literal profile name. Layer 2 is THIS: one SetupPack per profile.
//
// Most fields are a VIEW derived mechanically from the profile's `ir.yml` (+ optional `provision.json`) —
// they already exist as compiled facts and re-declaring them by hand would just be a second, drift-prone
// copy. A small set of fields cannot be derived — they are a JUDGMENT CALL about how the profile's
// merge/board/maturity machinery is meant to be read (e.g. `landing_mode` is IMPLIED today by
// `agent-review` presence + `merge_policy` + `codeHost`, not stated anywhere as one three-valued fact) —
// so those live in a small hand-authored per-profile file, `profiles/<name>/setup-pack.yml`.
//
// PACK HOME rationale (one-line, per the task's "your call"): colocated at `profiles/<name>/setup-pack.yml`,
// sitting beside that profile's own `ir.yml`/`provision.json` — the same "one file, one profile-relative
// concern" precedent those two already set, rather than a single keyed section (e.g. a top-level
// `setup-packs.yml` covering all profiles) that would force every profile's hand-authored facts through one
// shared file and make `getSetupPack` need to know the full profile roster instead of just its own dir.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { parseIr } from './ir-yaml';
import type { AutonomyIR, Trigger } from './ir';

// --- the three-valued merge gate (DESIGN §Q0's "one shape-tension the scaffold must model honestly") ---
// EXACTLY three values. `human-approval` (self-driving) is a required_check, never a fourth mode — see
// the drift guard in bin/check-setup-pack.ts, which enforces this stays true against the ir/provision facts.
export type LandingMode = 'auto-merge' | 'manual-after-review' | 'pr-free';

// How a required check actually POSTS its status — names don't self-realize (DESIGN §Q0):
//  - 'propose_dispatch_checks' — the proposer's effect sends a default-branch-only repository_dispatch
//     event derived from the workflow named in `policy.box['gh-actions'].propose_dispatch_checks`
//     (e.g. security-gate.yml). A caller-selectable workflow_dispatch ref is forbidden for status writers.
//  - 'authored-workflow' — a real, standing workflow file the repo must carry for the name to ever post at
//     all (e.g. `ci`, `human-approval` — TA.3's "a required check with no workflow behind it wedges every
//     PR forever").
//  - 'native' — realized by the substrate's own actor-run path, with no separately authored/dispatched
//     workflow (e.g. hosted `agent-review`: the reviewer returns a bound judgment and the substrate-injected
//     trusted effect posts it; a weaker local substrate may publish directly from the shared-credential run).
export type CheckRealizationVia = 'propose_dispatch_checks' | 'authored-workflow' | 'native';
export interface CheckRealization {
  check: string;
  via: CheckRealizationVia;
}

// How a profile's board gets its first (and ongoing) work items, and how those items land.
export interface BoardSeedRecipe {
  originator_skill: string; // the skill that files/derives new board items (e.g. 'planner', 'draft')
  // What actually promotes an item from filed to dispatchable:
  //  - 'label'             — a GitHub label toggle (e.g. simple-gh-sdlc's `ready` label)
  //  - 'state'              — a ztrack workflow-state transition (e.g. simple-gh's/simple-sdlc's `ready` state)
  //  - 'upstream-ratified'  — the item arrives ALREADY promotable because its roadmap parent was already
  //     ratified (strategist -> strategy_reviewer -> planner, a merged+reviewed roadmap PR) — self-driving's
  //     "ready-from-birth" (profiles/self-driving/skills/pm/SKILL.md: "ready is set by draft, the planner,
  //     or a maintainer" for roadmap-originated issues, filed already `ready`).
  promotion_fence: 'label' | 'state' | 'upstream-ratified';
  import_verb: string; // the mechanical act that files an item (e.g. 'tasks:author', 'ztrack import --register')
  // Whether seeding lands directly (e.g. task-service issue creation), through an ordinary reviewed PR,
  // or through a legacy scoped board-state carve-out. The installer needs the distinction because a
  // committed task backing cannot be made durable by mutating the default branch directly.
  landing_path: 'direct' | 'reviewed-pr' | 'board-pr-carveout';
}

// How a profile captures its "why" (DESIGN §Phase 2). 'none' is a legitimate value (a profile that
// declares no vision/constitution and has no operator-anchor step either) even though none of the four
// baseline profiles use it today — kept in the enum for a future profile that genuinely has no direction
// capture (DESIGN's own three-valued set).
export type DirectionMode = 'none' | 'operator' | 'documents.roles';
export interface DirectionSpec {
  mode: DirectionMode;
  templates?: string[]; // only meaningful for 'documents.roles' — the REPLACE-THIS-seeded doc paths
}

export type M3Tool = 'doctor' | 'gh-preflight';
export type M4Predicate = 'ztrack' | 'gh-issues';
export type M6Signal = 'per-issue' | 'pr-close' | 'roadmap-rollup';
export interface MaturitySignals {
  m3_tool: M3Tool;
  m4_predicate: M4Predicate;
  m4_allowlist_label?: string; // e.g. simple-sdlc's `oa-approved` day-one dispatch fence
  m6_signal: M6Signal;
}

export type TerminalStage = 'M5' | 'M6';

// One roster entry — a VIEW over the profile's own `ir.yml` agents map (never re-authored by hand).
export interface RosterEntry {
  name: string;
  kind: 'agent' | 'human';
  behavior: string;
  trigger: Trigger[];
  capabilities: string[];
}

// The common scaffold's input contract (TS.1). GitHub-only fields are OPTIONAL — a `pr-free`/local-git
// profile (simple-sdlc) ships no `provision.json` and validates with all of them absent.
export interface SetupPack {
  targets: string[];
  codeHost: 'github' | 'local-git';
  roster: RosterEntry[];

  // --- the one field DESIGN calls out as "the one field that must be declared" ---
  landing_mode: LandingMode;

  // --- GitHub-only, optional ---
  // `required_checks` (TP.2 reconciliation, task list "Reconcile honestly"): this is a VIEW over the
  // profile's OWN `provision.json` — i.e. what THIS PROFILE PRESCRIBES as its merge gate (e.g. simple-gh's
  // shipped `["ci"]`). On a profile whose `provision.json` still carries a placeholder name (simple-gh's own
  // provision.json comment: "replace 'ci' with your repo's actual PR CI check-run name(s)"), the pack is
  // NOT claiming that placeholder is what any real target repo's CI actually posts — it is documenting the
  // profile's prescription. The adopter's REAL check names are an INSTALL-TIME fact, discovered by TE.4's
  // throwaway-probe-PR step (OA-INSTALL-IMPLEMENTATION-TASKS.md TE.4 — "do NOT guess required-check names on
  // a PR-less repo; open a probe PR, read the actual check contexts GitHub reports") and then OVERRIDE this
  // field's value before `provision-target-repo` ever runs against that repo. So: pack-declared
  // `required_checks` = the profile's prescription (this VIEW, mechanically re-derivable, drift-guarded
  // against provision.json by bin/check-setup-pack.ts); the adopter's live required checks = TE.4's
  // discovery, which is a DIFFERENT, later, install-time act this field does not and cannot perform.
  required_checks?: string[];
  check_realizations?: CheckRealization[];
  enforce_admins?: boolean;
  labels?: string[];

  // --- hand-authored (prose mirrors; drift-guarded — see bin/check-setup-pack.ts) ---
  board_seed_recipe: BoardSeedRecipe;
  direction_spec: DirectionSpec;
  human_gates: string[]; // extra human_required_paths beyond the common core (a VIEW: the profile's declared list)
  maturity_signals: MaturitySignals;
  extra_rungs: string[]; // e.g. self-driving: ['proxy-ready', 'direction-present', 'human-seam-wired']
  terminal_stage: TerminalStage;
}

// The hand-authored per-profile file's shape — exactly the fields DESIGN says cannot be derived. Deliberately
// a SUBSET of SetupPack: everything else (targets, codeHost, roster, required_checks, enforce_admins, labels)
// is always computed from ir.yml/provision.json, never duplicated here (a hand-copy would just be a second,
// driftable source for a fact the compile already knows).
export interface SetupPackAuthored {
  landing_mode: LandingMode;
  check_realizations?: CheckRealization[];
  board_seed_recipe: BoardSeedRecipe;
  direction_spec?: DirectionSpec; // optional to author: derivable from ir.documents.roles when omitted
  maturity_signals: MaturitySignals;
  extra_rungs?: string[];
  terminal_stage: TerminalStage;
}

export const SETUP_PACK_FILE = 'setup-pack.yml';

interface ProvisionManifest {
  variables?: Array<{ name: string }>;
  labels?: Array<{ name: string }>;
  branch_protection?: { branch?: string; required_checks?: string[]; enforce_admins?: boolean };
}

function readProvision(profileDir: string): ProvisionManifest | undefined {
  const p = join(profileDir, 'provision.json');
  if (!existsSync(p)) return undefined;
  return JSON.parse(readFileSync(p, 'utf8')) as ProvisionManifest;
}

function rosterOf(ir: AutonomyIR): RosterEntry[] {
  return Object.entries(ir.agents ?? {})
    .map(([name, a]) => ({
      name,
      kind: a.kind ?? ('agent' as const),
      behavior: a.behavior,
      trigger: a.triggers ?? [],
      capabilities: a.capabilities ?? [],
    }))
    .sort((x, y) => x.name.localeCompare(y.name));
}

function deriveDirectionSpec(ir: AutonomyIR): DirectionSpec {
  const roles = ir.documents?.roles;
  if (roles) {
    const templates = [roles.vision, roles.constitution, roles.roadmap].filter((p): p is string => typeof p === 'string' && p.length > 0);
    return { mode: 'documents.roles', templates };
  }
  return { mode: 'operator' };
}

/** getSetupPack — the scaffold's ONE read path. Loads `<profileDir>/ir.yml` (+ optional `provision.json`)
 *  for the derived VIEW, then `<profileDir>/setup-pack.yml` for the hand-authored facts, and composes+
 *  validates the result. Throws on missing/invalid `setup-pack.yml` or a validation failure — a profile
 *  the install scaffold is meant to drive must have a complete pack; there is no silent partial pack. */
export function getSetupPack(profileDir: string): SetupPack {
  const ir = parseIr(readFileSync(join(profileDir, 'ir.yml'), 'utf8'));
  const provision = readProvision(profileDir);
  const authoredPath = join(profileDir, SETUP_PACK_FILE);
  if (!existsSync(authoredPath)) throw new Error(`${SETUP_PACK_FILE} missing under ${profileDir} — every profile the install scaffold drives needs a hand-authored pack (see packages/core/src/setup-pack.ts)`);
  const authored = parseYaml(readFileSync(authoredPath, 'utf8')) as SetupPackAuthored;

  const pack: SetupPack = {
    targets: ir.targets ?? [],
    codeHost: ir.codeHost ?? 'local-git',
    roster: rosterOf(ir),
    landing_mode: authored?.landing_mode as LandingMode,
    required_checks: provision?.branch_protection?.required_checks,
    check_realizations: authored?.check_realizations,
    enforce_admins: provision?.branch_protection?.enforce_admins,
    labels: provision?.labels?.map((l) => l.name),
    board_seed_recipe: authored?.board_seed_recipe as BoardSeedRecipe,
    direction_spec: authored?.direction_spec ?? deriveDirectionSpec(ir),
    // The full declared list is exposed as the view; computing the true "beyond the common core" DIFF
    // (subtracting a cross-profile shared baseline) needs the whole profile roster, which a single
    // profileDir call doesn't have — left as a documented extension point for TS.2's consumer wiring.
    human_gates: ((ir.policy?.box as Record<string, unknown> | undefined)?.risk as { human_required_paths?: string[] } | undefined)?.human_required_paths ?? [],
    maturity_signals: authored?.maturity_signals as MaturitySignals,
    extra_rungs: authored?.extra_rungs ?? [],
    terminal_stage: authored?.terminal_stage as TerminalStage,
  };

  const errors = validateSetupPack(pack);
  if (errors.length) throw new Error(`invalid SetupPack for ${profileDir}:\n  ${errors.join('\n  ')}`);
  return pack;
}

const LANDING_MODES = new Set<LandingMode>(['auto-merge', 'manual-after-review', 'pr-free']);
const PROMOTION_FENCES = new Set(['label', 'state', 'upstream-ratified']);
const LANDING_PATHS = new Set(['direct', 'reviewed-pr', 'board-pr-carveout']);
const DIRECTION_MODES = new Set<DirectionMode>(['none', 'operator', 'documents.roles']);
const M3_TOOLS = new Set<M3Tool>(['doctor', 'gh-preflight']);
const M4_PREDICATES = new Set<M4Predicate>(['ztrack', 'gh-issues']);
const M6_SIGNALS = new Set<M6Signal>(['per-issue', 'pr-close', 'roadmap-rollup']);
const TERMINAL_STAGES = new Set<TerminalStage>(['M5', 'M6']);
const CHECK_REALIZATION_VIAS = new Set<CheckRealizationVia>(['propose_dispatch_checks', 'authored-workflow', 'native']);

/** Returns a list of validation errors; empty array means valid. Pure structural validation — no file
 *  reads, no cross-checking against ir/SKILL prose (that's the DRIFT GUARD, bin/check-setup-pack.ts). */
export function validateSetupPack(pack: SetupPack): string[] {
  const errors: string[] = [];

  if (!Array.isArray(pack.targets) || pack.targets.length === 0) errors.push('targets must be a non-empty array');
  if (pack.codeHost !== undefined && pack.codeHost !== 'github' && pack.codeHost !== 'local-git')
    errors.push(`codeHost must be 'github' or 'local-git' (got '${String(pack.codeHost)}')`);
  if (!Array.isArray(pack.roster) || pack.roster.length === 0) errors.push('roster must be a non-empty array');
  else
    for (const r of pack.roster) {
      if (!r.name) errors.push('roster entry missing name');
      if (r.kind !== 'agent' && r.kind !== 'human') errors.push(`roster entry '${r.name}': kind must be 'agent' or 'human'`);
      if (!r.behavior) errors.push(`roster entry '${r.name}': missing behavior`);
      if (!Array.isArray(r.capabilities)) errors.push(`roster entry '${r.name}': capabilities must be an array`);
    }

  // landing_mode: EXACTLY three values — this is the one field DESIGN says must be declared, not derived.
  if (pack.landing_mode === undefined || pack.landing_mode === null || pack.landing_mode === ('' as unknown))
    errors.push(`landing_mode is required (one of: ${[...LANDING_MODES].join(', ')}) — missing/invalid landing_mode must fail validation`);
  else if (!LANDING_MODES.has(pack.landing_mode))
    errors.push(`landing_mode '${String(pack.landing_mode)}' is invalid (must be exactly one of: ${[...LANDING_MODES].join(', ')} — 'human-approval' is a required_check, never a landing_mode)`);

  if (pack.required_checks !== undefined && !Array.isArray(pack.required_checks)) errors.push('required_checks must be an array when present');
  if (pack.enforce_admins !== undefined && typeof pack.enforce_admins !== 'boolean') errors.push('enforce_admins must be a boolean when present');
  if (pack.labels !== undefined && !Array.isArray(pack.labels)) errors.push('labels must be an array when present');
  if (pack.check_realizations !== undefined) {
    if (!Array.isArray(pack.check_realizations)) errors.push('check_realizations must be an array when present');
    else
      for (const cr of pack.check_realizations) {
        if (!cr.check) errors.push('check_realizations entry missing check');
        if (!CHECK_REALIZATION_VIAS.has(cr.via)) errors.push(`check_realizations['${cr.check}'].via '${String(cr.via)}' is invalid (must be one of: ${[...CHECK_REALIZATION_VIAS].join(', ')})`);
      }
  }

  if (!pack.board_seed_recipe) errors.push('board_seed_recipe is required');
  else {
    const b = pack.board_seed_recipe;
    if (!b.originator_skill) errors.push('board_seed_recipe.originator_skill is required');
    if (!PROMOTION_FENCES.has(b.promotion_fence)) errors.push(`board_seed_recipe.promotion_fence '${String(b.promotion_fence)}' is invalid (must be one of: ${[...PROMOTION_FENCES].join(', ')})`);
    if (!b.import_verb) errors.push('board_seed_recipe.import_verb is required');
    if (!LANDING_PATHS.has(b.landing_path)) errors.push(`board_seed_recipe.landing_path '${String(b.landing_path)}' is invalid (must be one of: ${[...LANDING_PATHS].join(', ')})`);
  }

  if (!pack.direction_spec) errors.push('direction_spec is required');
  else if (!DIRECTION_MODES.has(pack.direction_spec.mode))
    errors.push(`direction_spec.mode '${String(pack.direction_spec.mode)}' is invalid (must be one of: ${[...DIRECTION_MODES].join(', ')})`);

  if (!Array.isArray(pack.human_gates)) errors.push('human_gates must be an array');

  if (!pack.maturity_signals) errors.push('maturity_signals is required');
  else {
    const m = pack.maturity_signals;
    if (!M3_TOOLS.has(m.m3_tool)) errors.push(`maturity_signals.m3_tool '${String(m.m3_tool)}' is invalid (must be one of: ${[...M3_TOOLS].join(', ')})`);
    if (!M4_PREDICATES.has(m.m4_predicate)) errors.push(`maturity_signals.m4_predicate '${String(m.m4_predicate)}' is invalid (must be one of: ${[...M4_PREDICATES].join(', ')})`);
    if (!M6_SIGNALS.has(m.m6_signal)) errors.push(`maturity_signals.m6_signal '${String(m.m6_signal)}' is invalid (must be one of: ${[...M6_SIGNALS].join(', ')})`);
    if (m.m4_allowlist_label !== undefined && typeof m.m4_allowlist_label !== 'string') errors.push('maturity_signals.m4_allowlist_label must be a string when present');
  }

  if (!Array.isArray(pack.extra_rungs)) errors.push('extra_rungs must be an array');

  if (!TERMINAL_STAGES.has(pack.terminal_stage)) errors.push(`terminal_stage '${String(pack.terminal_stage)}' is invalid (must be one of: ${[...TERMINAL_STAGES].join(', ')})`);

  return errors;
}
