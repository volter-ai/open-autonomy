#!/usr/bin/env bun
// bin/dispatch-audit.ts — TC.3's end-of-install dispatch HOOK: a thin wrapper around TC.2's already-real,
// paused-safe primitive that TE.5 (the install agent's Phase 5 VALIDATE, not yet built) will call to
// dispatch the setup-completion audit at end-of-install.
//
// The primitive itself needs NO new code — it already exists, documented in every profile's
// profiles/*/skills/audit/SKILL.md § SETUP-COMPLETION MODE "PRIMARY" channel:
//
//   MODE=setup AUTONOMY_FORWARD=MODE AUTONOMY_AGENT=audit node scripts/run-agent.mjs
//
// (paused-safe: the run-agent.mjs -> autonomy-runner.mjs adapter chain contains no `.open-autonomy/paused`
// check, so it launches on a still-paused install — exactly TE.5's Phase 5 VALIDATE case, which runs
// BEFORE G4's unpause). TE.5 could shell out to that exact line with zero new code. What it CANNOT do
// without re-deriving the audit skill's own § Output doctrine by hand is know WHERE the resulting report
// will land, so it can record that path in its own IMM stage report / .open-autonomy/install.json. That
// lookup — not the launch itself — is the real value this wrapper adds:
//
//   1. Validates the target is actually a compiled install with a run-agent adapter and a declared
//      `audit` actor (fails fast, with named reasons, instead of a confusing downstream crash).
//   2. Resolves the DETERMINISTIC report path the skill's own dated-filename convention promises
//      (`docs/audits/oa-audit-setup-<ISO-date>.md` for MODE=setup, `docs/audits/oa-audit-<ISO-date>.md`
//      for drift — skills/audit/SKILL.md § Output / § Output (setup-completion mode)).
//   3. In --live mode, launches the primitive and diffs docs/audits/ before/after to report which file
//      is actually new (never just assumes the deterministic guess landed — a launch that fails, or that
//      crosses midnight, must not be silently misreported as having produced today's file).
//
// This script invents NONE of the audit skill's own judgment (which checks pass/fail, how a finding is
// worded) — per CLAUDE.md "never script what an agent can do," that stays entirely inside the skill. It
// only wraps the mechanical launch + the mechanical "where did the report land" lookup — the same
// scripts-only-for-security-or-precision posture bin/recommend-profile.ts documents for TD.2.
//
// SAFETY: defaults to --dry-run — no process is spawned, no agent is launched. This unit's own standing
// rule ("no agent launches, no providers, no real GitHub repos") means --live is documented and
// implemented for TE.5's eventual real use, but is never exercised by this unit's own tests/evidence.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

export type Mode = 'setup' | 'drift';

export interface DispatchAuditOptions {
  root: string;
  mode: Mode;
  live: boolean;
  /** ISO date override (YYYY-MM-DD) — lets tests be deterministic without mocking Date. Defaults to the
   *  real current date (UTC), matching the skill's own "ISO date, e.g. oa-audit-2026-07-10.md" doctrine. */
  today?: string;
}

export interface DispatchAuditResult {
  ok: boolean;
  launched: boolean;
  dryRun: boolean;
  root: string;
  mode: Mode;
  command: string;
  env: Record<string, string>;
  expectedReportPath: string;
  existingReportForToday: boolean;
  priorReports: string[];
  /** Only populated after a REAL (--live) launch — the report file the diff actually found, never guessed. */
  reportPath?: string;
  notes: string[];
}

const REPORT_DIR = 'docs/audits';

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function reportFileFor(mode: Mode, date: string): string {
  return mode === 'setup' ? `oa-audit-setup-${date}.md` : `oa-audit-${date}.md`;
}

/** Every existing report on disk that matches THIS mode's own filename pattern — never the other mode's.
 *  Drift (`oa-audit-<date>.md`) and setup-completion (`oa-audit-setup-<date>.md`) reports are named
 *  distinctly by the skill's own § Output doctrine specifically so a directory listing never conflates
 *  them; this lookup honors that same distinction so a drift dispatch never mistakes a setup report for
 *  "already ran today," and vice versa. */
function existingReports(root: string, mode: Mode): string[] {
  const dir = join(root, REPORT_DIR);
  if (!existsSync(dir)) return [];
  const pattern = mode === 'setup' ? /^oa-audit-setup-\d{4}-\d{2}-\d{2}\.md$/ : /^oa-audit-\d{4}-\d{2}-\d{2}\.md$/;
  return readdirSync(dir)
    .filter((f) => pattern.test(f))
    .sort();
}

/** Named, fail-fast reasons this root isn't a dispatchable install — never a bare crash downstream. */
export function validateRoot(root: string): string[] {
  const problems: string[] = [];
  if (!existsSync(root)) {
    problems.push(`root does not exist: ${root}`);
    return problems; // nothing further to check
  }
  const manifestPath = join(root, '.open-autonomy', 'autonomy.yml');
  if (!existsSync(manifestPath)) {
    problems.push(`not a compiled install — missing .open-autonomy/autonomy.yml under ${root}`);
  } else {
    const manifest = readFileSync(manifestPath, 'utf8');
    // The compiled manifest names an actor's behavior via `skill: <name>` under its own `agents.<role>:`
    // block (emitAutonomy's serialization — NOT the profile-source ir.yml's `behavior:` key, which never
    // survives compile verbatim). A dedicated `audit:` role happens to also carry `skill: audit`
    // (behavior == role name for this actor on every profile), so this one substring check is sufficient
    // without a full YAML parse.
    if (!/^\s*skill:\s*audit\s*$/m.test(manifest)) {
      problems.push(`this install's autonomy.yml declares no 'audit' actor (no "skill: audit" entry under agents:) — nothing to dispatch`);
    }
  }
  if (!existsSync(join(root, 'scripts', 'run-agent.mjs'))) {
    problems.push(`missing scripts/run-agent.mjs under ${root} — this install has no run-agent adapter (a gh-actions-only compile, or an uncompiled profile source tree, has none)`);
  }
  return problems;
}

/** The exact env + command the TC.2-documented PRIMARY channel names, unchanged. Mode-general (not
 *  setup-only): TE.5's own use case is always MODE=setup (Phase 5 VALIDATE runs before G4's unpause,
 *  exactly the paused case this channel exists for — skills/audit/SKILL.md § Which mode), but `drift` is
 *  supported too so this stays a general dispatch-audit primitive, not a setup-only script. */
export function buildInvocation(mode: Mode): { command: string; env: Record<string, string> } {
  return { command: 'node scripts/run-agent.mjs', env: { MODE: mode, AUTONOMY_FORWARD: 'MODE', AUTONOMY_AGENT: 'audit' } };
}

export function dispatchAudit(opts: DispatchAuditOptions): DispatchAuditResult {
  const { root, mode, live } = opts;
  const today = opts.today ?? isoDate(new Date());
  const notes: string[] = [];
  const problems = validateRoot(root);
  const { command, env } = buildInvocation(mode);
  const fullCommand = `${Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ')} ${command}`;
  const expectedReportPath = join(REPORT_DIR, reportFileFor(mode, today));
  const priorReports = problems.length === 0 ? existingReports(root, mode) : [];
  const existingReportForToday = priorReports.includes(reportFileFor(mode, today));

  if (existingReportForToday) {
    notes.push(
      `a ${mode} report for today (${today}) already exists at ${expectedReportPath} — a fresh run would re-author the same dated file; git history (not the filename) distinguishes same-day runs.`,
    );
  }
  if (priorReports.length) {
    notes.push(`${priorReports.length} prior ${mode} report(s) already on disk under ${REPORT_DIR}/ (newest: ${priorReports[priorReports.length - 1]}).`);
  }

  if (problems.length) {
    return {
      ok: false,
      launched: false,
      dryRun: !live,
      root,
      mode,
      command: fullCommand,
      env,
      expectedReportPath,
      existingReportForToday,
      priorReports,
      notes: [...notes, ...problems],
    };
  }

  if (!live) {
    notes.push('DRY RUN — no agent launched. Pass --live to actually dispatch (spawns `node scripts/run-agent.mjs` against this root).');
    return { ok: true, launched: false, dryRun: true, root, mode, command: fullCommand, env, expectedReportPath, existingReportForToday, priorReports, notes };
  }

  // --live: actually spawn the primitive, then diff docs/audits/ to find what's genuinely new — never
  // just trust the deterministic guess landed (a launch can fail, or cross midnight).
  const before = new Set(existingReports(root, mode));
  const r = spawnSync('node', ['scripts/run-agent.mjs'], { cwd: root, env: { ...process.env, ...env }, stdio: 'inherit' });
  const after = existingReports(root, mode);
  const fresh = after.filter((f) => !before.has(f));
  const reportPath = fresh.length ? join(REPORT_DIR, fresh[fresh.length - 1]) : after.includes(reportFileFor(mode, today)) ? expectedReportPath : undefined;
  if (!reportPath) notes.push('launch completed but no new/expected report file was found under docs/audits/ — inspect the launched session output directly.');
  return {
    ok: (r.status ?? 1) === 0 && !!reportPath,
    launched: true,
    dryRun: false,
    root,
    mode,
    command: fullCommand,
    env,
    expectedReportPath,
    existingReportForToday,
    priorReports: after,
    reportPath,
    notes,
  };
}

// --- CLI -----------------------------------------------------------------------------------------------

interface CliOptions {
  root?: string;
  mode: Mode;
  live: boolean;
  json: boolean;
}

export function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { mode: 'setup', live: false, json: false };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--mode':
        opts.mode = argv[++i] as Mode;
        break;
      case '--live':
        opts.live = true;
        break;
      case '--dry-run':
        opts.live = false;
        break;
      case '--json':
        opts.json = true;
        break;
      default:
        if (!a.startsWith('--')) positional.push(a);
        break;
    }
  }
  opts.root = positional[0];
  return opts;
}

const USAGE = [
  'usage: bun bin/dispatch-audit.ts <root> [--mode setup|drift] [--live|--dry-run] [--json]',
  '',
  'Wraps the TC.2 paused-safe primitive (MODE=<mode> AUTONOMY_FORWARD=MODE AUTONOMY_AGENT=audit node',
  "scripts/run-agent.mjs) that TE.5 (the install agent, Phase 5 VALIDATE) dispatches the setup-completion",
  'audit through, and resolves the deterministic report path it will produce. Defaults to --dry-run:',
  'prints the resolved command + expected report path, launches nothing. Pass --live to actually spawn',
  'the launch and resolve the report it produced from a before/after diff of docs/audits/.',
].join('\n');

function formatResult(r: DispatchAuditResult): string {
  const lines: string[] = [];
  lines.push(r.dryRun ? 'DRY RUN (no agent launched)' : r.launched ? (r.ok ? 'LAUNCHED' : 'LAUNCHED (but did not resolve a report)') : 'FAILED (validation)');
  lines.push(`root:    ${r.root}`);
  lines.push(`mode:    ${r.mode}`);
  lines.push(`command: ${r.command}`);
  lines.push(`expected report path: ${r.expectedReportPath}`);
  if (r.reportPath) lines.push(`actual report path:   ${r.reportPath}`);
  if (r.notes.length) {
    lines.push('notes:');
    for (const n of r.notes) lines.push(`  - ${n}`);
  }
  return lines.join('\n');
}

if (import.meta.main) {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.root) {
    process.stdout.write(USAGE + '\n');
    process.exit(1);
  }
  if (opts.mode !== 'setup' && opts.mode !== 'drift') {
    process.stderr.write(`error: --mode must be 'setup' or 'drift', got "${opts.mode}"\n\n${USAGE}\n`);
    process.exit(1);
  }
  const result = dispatchAudit({ root: opts.root, mode: opts.mode, live: opts.live });
  process.stdout.write((opts.json ? JSON.stringify(result, null, 2) : formatResult(result)) + '\n');
  process.exit(result.ok ? 0 : 1);
}
