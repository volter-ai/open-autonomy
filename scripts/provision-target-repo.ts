#!/usr/bin/env bun
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

// Provisions (and idempotently reconciles) a GitHub repository for open-autonomy from a committed
// declarative manifest: repo existence, initial content, repo variables, labels, and branch
// protection. Secrets are never set here; the manifest's required_secrets are reported as manual
// follow-up. Safe to re-run: variables/labels/branch-protection are reconciled, and content is only
// pushed to an empty repo unless --force-content is given.

export interface ProvisionManifest {
  description?: string;
  private: boolean;
  required_secrets: string[];
  variables: Array<{ name: string; value: string }>;
  labels: Array<{ name: string; color?: string; description?: string }>;
  branch_protection?: {
    branch: string;
    required_checks: string[];
    // SOC 2-grade hardening knobs (all OPTIONAL — omitted ⇒ the original permissive defaults below, so
    // existing manifests like bench/self-driving are unchanged). A profile like soc2-baseline ships these
    // set, making branch protection PROFILE-DERIVED (resolves design-doc gap G1).
    enforce_admins?: boolean; // default false (only human admins direct-push); soc2-baseline sets true
    required_reviews?: number; // required_approving_review_count; default 0; soc2-baseline sets >=1
    require_code_owner_reviews?: boolean; // default false
    required_signatures?: boolean; // require signed commits; default false (see G3/C6 note in profile README)
  };
  // Repo security settings applied via the repo API (GitHub Advanced Security; free on public repos, a
  // paid add-on on private repos — see profile README gap G3). Omitted ⇒ not touched.
  security?: { secret_scanning?: boolean; secret_scanning_push_protection?: boolean };
}

export interface VariablePlan {
  name: string;
  value: string;
  action: 'create' | 'update' | 'unchanged';
}

export interface LabelPlan {
  name: string;
  action: 'create' | 'exists';
}

export function parseManifest(text: string): ProvisionManifest {
  const raw = JSON.parse(text) as Partial<ProvisionManifest>;
  if (!Array.isArray(raw.variables)) throw new Error('manifest.variables must be an array');
  if (!Array.isArray(raw.labels)) throw new Error('manifest.labels must be an array');
  for (const variable of raw.variables) {
    if (!variable?.name || typeof variable.value !== 'string') {
      throw new Error('each manifest variable needs a name and string value');
    }
  }
  return {
    description: raw.description,
    private: raw.private ?? true,
    required_secrets: raw.required_secrets ?? [],
    variables: raw.variables,
    labels: raw.labels,
    branch_protection: raw.branch_protection,
    security: raw.security,
  };
}

export function planVariables(
  desired: ProvisionManifest['variables'],
  existing: Record<string, string>,
): VariablePlan[] {
  return desired.map((variable) => {
    if (!(variable.name in existing)) return { ...variable, action: 'create' as const };
    if (existing[variable.name] !== variable.value) return { ...variable, action: 'update' as const };
    return { ...variable, action: 'unchanged' as const };
  });
}

export function planLabels(desired: ProvisionManifest['labels'], existing: string[]): LabelPlan[] {
  const have = new Set(existing);
  return desired.map((label) => ({ name: label.name, action: have.has(label.name) ? 'exists' : 'create' }));
}

export function missingSecrets(required: string[], present: string[]): string[] {
  const have = new Set(present);
  return required.filter((name) => !have.has(name));
}

export function formatReport(input: {
  repo: string;
  created: boolean;
  pushed: boolean;
  variables: VariablePlan[];
  labels: LabelPlan[];
  branchProtection: 'configured' | 'skipped' | 'failed' | 'none';
  missingSecrets: string[];
  dryRun: boolean;
}): string {
  const lines: string[] = [];
  const tag = input.dryRun ? '[dry-run] ' : '';
  lines.push(`${tag}repo ${input.repo}: ${input.created ? 'created' : 'already exists'}`);
  lines.push(`${tag}content: ${input.pushed ? 'pushed initial commit' : 'left existing history untouched'}`);
  const changed = input.variables.filter((v) => v.action !== 'unchanged');
  lines.push(`${tag}variables: ${changed.length} to apply, ${input.variables.length - changed.length} unchanged`);
  for (const v of changed) lines.push(`  - ${v.action} ${v.name}`);
  const created = input.labels.filter((l) => l.action === 'create');
  lines.push(`${tag}labels: ${created.length} to create, ${input.labels.length - created.length} present`);
  for (const l of created) lines.push(`  - create ${l.name}`);
  lines.push(`${tag}branch protection: ${input.branchProtection}`);
  if (input.missingSecrets.length > 0) {
    lines.push(`${tag}MANUAL: set these secrets (not handled by this script):`);
    for (const name of input.missingSecrets) lines.push(`  - ${name}`);
  } else {
    lines.push(`${tag}secrets: all required secrets present`);
  }
  return lines.join('\n');
}

interface Options {
  repo: string;
  source: string;
  manifest: string;
  private?: boolean;
  forceContent: boolean;
  dryRun: boolean;
  // Arms GitHub's native auto-merge (repos/<repo> PATCH allow_auto_merge=true) as part of this
  // provisioning run. OFF BY DEFAULT (safety fix, TE.10): this used to fire unconditionally, which meant
  // `oa install`'s automated EXECUTE phase (bin/install-execute.ts's stepCiAndProvision, invoked with no
  // human checkpoint in between) silently pre-armed auto-merge before any human had watched a single PR
  // merge — a direct regression against this program's own already-ratified doctrine: TE.6's G4b runbook
  // (this file's sibling `bin/install-handoff.ts`'s G4B_RUNBOOK constant, mirrored into
  // docs/OSS_AGENT_RUNBOOK.md's "Phase 6 Hand-Off" section) and docs/INSTALL-AGENT.md's own
  // "supervised first merge (then arm auto-merge)" playbook both document arming auto-merge as a
  // DELIBERATE, LATER, human-gated step — never something provisioning does for you. The runbook's own
  // step 5 (`gh repo edit <owner>/<repo> --enable-auto-merge`) already covers the manual arm; no new
  // command needed.
  //
  // Kept as an explicit opt-in (not just deleted) for `bin/bench.ts`'s live-testing harness
  // (docs/LIVE_TESTING_STRATEGY.md), which provisions a DISPOSABLE fixture repo and deliberately proves
  // the fully unattended merge boundary end-to-end with no human in the loop by design — "merging a
  // low-risk PR that native auto-merge is supposed to land" is explicitly FORBIDDEN operator behavior
  // there, so bench must keep arming eagerly. `bin/bench.ts` passes `--arm-auto-merge` to preserve its
  // pre-existing behavior; every other caller (`bin/install-execute.ts`'s stepCiAndProvision, the manual
  // `soc2-baseline`/`self-driving` provisioning commands in profiles/soc2-baseline/README.md,
  // compliance/ONBOARDING.md, docs/OPERATIONS.md's "GitHub production rollout" checklist) never passed a
  // flag before and gets the safe default now.
  armAutoMerge: boolean;
}

function usage(): never {
  throw new Error(`Usage:
  bun scripts/provision-target-repo.ts --repo owner/name --source <build-dir> [--manifest path] [--private] [--force-content] [--dry-run] [--arm-auto-merge]`);
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const repo = value('--repo');
  const source = value('--source');
  if (!repo || !source) usage();
  return {
    repo,
    source: resolve(source),
    manifest: value('--manifest') ?? join(resolve(source), 'provision.json'),
    private: argv.includes('--private') ? true : undefined,
    forceContent: argv.includes('--force-content'),
    dryRun: argv.includes('--dry-run'),
    armAutoMerge: argv.includes('--arm-auto-merge'),
  };
}

// The one process-spawning seam this script goes through (gh/git) — mirrors the ProcRunner seam
// packages/local-runner-cli/src/types.ts documents for the rest of the CLI ("a proc/sessions seam on
// every verb that shells out ... so the test suite can stub gh ... without needing real binaries"). Kept
// local (rather than importing that package) since scripts/ has no existing dependency on
// packages/local-runner-cli and this shape needs stdin `input` support the shared type doesn't carry.
// Default impl wraps execFileSync exactly as the old inline `run`/`tryRun` did; tests inject a stub so
// provisioning logic — including whether the allow_auto_merge PATCH fires — is verifiable without a real
// `gh` binary.
export interface ProcResult {
  status: number;
  stdout: string;
  stderr: string;
}

export type ProcFn = (cmd: string, args: string[], opts?: { input?: string; cwd?: string }) => ProcResult;

export const defaultProc: ProcFn = (cmd, args, opts = {}) => {
  try {
    const out = execFileSync(cmd, args, {
      encoding: 'utf8',
      input: opts.input,
      cwd: opts.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { status: 0, stdout: out, stderr: '' };
  } catch (error) {
    const err = error as { status?: number | null; stdout?: Buffer | string; stderr?: Buffer | string };
    return { status: err.status ?? 1, stdout: String(err.stdout ?? ''), stderr: String(err.stderr ?? '') };
  }
};

function run(proc: ProcFn, cmd: string, args: string[], opts: { input?: string; cwd?: string } = {}): string {
  const r = proc(cmd, args, opts);
  if (r.status !== 0) {
    throw Object.assign(new Error(r.stderr || r.stdout || `${cmd} ${args.join(' ')} exited ${r.status}`), {
      stdout: r.stdout,
      stderr: r.stderr,
    });
  }
  return r.stdout;
}

function tryRun(proc: ProcFn, cmd: string, args: string[], opts: { input?: string; cwd?: string } = {}): { ok: boolean; out: string } {
  const r = proc(cmd, args, opts);
  return r.status === 0 ? { ok: true, out: r.stdout } : { ok: false, out: r.stderr || r.stdout };
}

function repoExists(proc: ProcFn, repo: string): boolean {
  return tryRun(proc, 'gh', ['repo', 'view', repo, '--json', 'name']).ok;
}

function mainHasCommits(proc: ProcFn, repo: string): boolean {
  const result = tryRun(proc, 'gh', ['api', `repos/${repo}/commits`, '--jq', '.[0].sha']);
  return result.ok && result.out.trim().length > 0;
}

const ALWAYS_EXCLUDE = new Set(['.git', 'node_modules', '.agent-run']);

// Enumerate the files to push, relative to `source`. Works whether `source` is a directory inside
// a git repo (a committed workload seed like bench/workload/<name>/seed) or a standalone build dir
// assembled by bench --live (compile + overlay). Git enumeration respects .gitignore (excludes node_modules); the
// filesystem-walk fallback applies when the source is not a git tree.
export function sourceFiles(source: string, proc: ProcFn = defaultProc): string[] {
  const tracked = tryRun(proc, 'git', ['-C', source, 'ls-files', '--cached', '--others', '--exclude-standard']);
  if (tracked.ok) {
    const files = tracked.out.split('\n').map((line) => line.trim()).filter(Boolean);
    if (files.length > 0) return files;
  }
  const out: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (ALWAYS_EXCLUDE.has(entry.name)) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel);
      else if (entry.isFile()) out.push(rel);
    }
  };
  walk(source, '');
  return out.sort();
}

function pushInitialContent(proc: ProcFn, repo: string, source: string): void {
  const tmp = mkdtempSync(join(tmpdir(), 'provision-'));
  try {
    for (const rel of sourceFiles(source, proc)) {
      const abs = join(source, rel);
      if (!existsSync(abs)) continue;
      const target = join(tmp, rel);
      mkdirSync(dirname(target), { recursive: true });
      cpSync(abs, target);
    }
    run(proc, 'git', ['init', '-b', 'main'], { cwd: tmp });
    run(proc, 'git', ['add', '-A'], { cwd: tmp });
    run(proc, 'git', ['commit', '-m', 'Initial open-autonomy content'], { cwd: tmp });
    run(proc, 'git', ['remote', 'add', 'origin', `https://github.com/${repo}.git`], { cwd: tmp });
    run(proc, 'git', ['push', '-u', '--force', 'origin', 'main'], { cwd: tmp });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// The provisioning logic itself, factored out of `main()` so tests can drive it with an injected `proc`
// (no real `gh`/`git` binaries) and assert on the exact call log — in particular, that the
// allow_auto_merge PATCH (see `options.armAutoMerge` above) only ever fires when explicitly requested.
export async function provisionTargetRepo(options: Options, proc: ProcFn = defaultProc): Promise<string> {
  const manifest = parseManifest(readFileSync(options.manifest, 'utf8'));
  const isPrivate = options.private ?? manifest.private;

  const exists = repoExists(proc, options.repo);
  if (!exists && !options.dryRun) {
    const visibility = isPrivate ? '--private' : '--public';
    run(proc, 'gh', ['repo', 'create', options.repo, visibility, ...(manifest.description ? ['--description', manifest.description] : [])]);
  }

  const hasCommits = exists ? mainHasCommits(proc, options.repo) : false;
  const shouldPush = (!hasCommits || options.forceContent) && !options.dryRun;
  if (shouldPush) {
    // A force-push to an existing protected branch is rejected, so drop protection before pushing;
    // the branch-protection step below re-adds it. Keeps re-provisioning idempotent and hands-free.
    if (exists && manifest.branch_protection) {
      tryRun(proc, 'gh', ['api', '-X', 'DELETE', `repos/${options.repo}/branches/${manifest.branch_protection.branch}/protection`]);
    }
    pushInitialContent(proc, options.repo, options.source);
  }

  const existingVars: Record<string, string> = {};
  if (exists || shouldPush) {
    const result = tryRun(proc, 'gh', ['variable', 'list', '-R', options.repo, '--json', 'name,value']);
    if (result.ok) {
      for (const item of JSON.parse(result.out) as Array<{ name: string; value: string }>) {
        existingVars[item.name] = item.value;
      }
    }
  }
  const variablePlan = planVariables(manifest.variables, existingVars);
  if (!options.dryRun) {
    for (const v of variablePlan) {
      if (v.action === 'unchanged') continue;
      run(proc, 'gh', ['variable', 'set', v.name, '-R', options.repo, '--body', v.value]);
    }
  }

  let existingLabels: string[] = [];
  const labelList = tryRun(proc, 'gh', ['label', 'list', '-R', options.repo, '--json', 'name', '--limit', '200']);
  if (labelList.ok) existingLabels = (JSON.parse(labelList.out) as Array<{ name: string }>).map((l) => l.name);
  const labelPlan = planLabels(manifest.labels, existingLabels);
  if (!options.dryRun) {
    for (const label of manifest.labels) {
      if (labelPlan.find((l) => l.name === label.name)?.action !== 'create') continue;
      run(proc, 'gh', [
        'label', 'create', label.name, '-R', options.repo, '--force',
        ...(label.color ? ['--color', label.color] : []),
        ...(label.description ? ['--description', label.description] : []),
      ]);
    }
  }

  let branchProtection: 'configured' | 'skipped' | 'failed' | 'none' = 'none';
  if (manifest.branch_protection) {
    if (options.dryRun || !(hasCommits || shouldPush)) {
      branchProtection = 'skipped';
    } else {
      // Arm native auto-merge ONLY when explicitly requested (options.armAutoMerge — see the Options
      // field doc above for the TE.10 safety rationale). Best-effort; non-fatal if the API rejects it.
      // NEVER unconditional — `oa install`'s automated EXECUTE phase must never pre-arm this; the G4b
      // runbook's own step (`gh repo edit <owner>/<repo> --enable-auto-merge`) is the human-gated way to
      // arm it after a supervised first merge.
      if (options.armAutoMerge) {
        tryRun(proc, 'gh', ['api', '-X', 'PATCH', `repos/${options.repo}`, '-F', 'allow_auto_merge=true']);
      }
      const bp = manifest.branch_protection;
      const body = JSON.stringify({
        // Require a PR (no direct push to main, even for a contents:write agent) + the status checks that
        // gate a merge (e.g. `ci` + `agent-review`, or the SOC 2 set). By default 0 approvals — the
        // agent-review status is the gate (the reviewer can't post a PR approval), and a proposer can't
        // publish agent-review through the trusted review effect, so no agent can land unreviewed code. strict:false avoids
        // the up-to-date-with-base deadlock. A hardened profile (soc2-baseline) overrides enforce_admins +
        // required_reviews + required_signatures via the manifest (gap G1 — branch protection is profile-derived).
        required_status_checks: { strict: false, contexts: bp.required_checks },
        enforce_admins: bp.enforce_admins ?? false,
        required_pull_request_reviews: {
          required_approving_review_count: bp.required_reviews ?? 0,
          require_code_owner_reviews: bp.require_code_owner_reviews ?? false,
        },
        restrictions: null,
      });
      const result = tryRun(proc, 'gh', [
        'api', '-X', 'PUT',
        `repos/${options.repo}/branches/${manifest.branch_protection.branch}/protection`,
        '--input', '-',
      ], { input: body });
      branchProtection = result.ok ? 'configured' : 'failed';
      if (!result.ok) process.stderr.write(`branch protection not applied: ${result.out.trim()}\n`);
      // Require signed commits via a repository RULESET, NOT the classic
      // /branches/<b>/protection/required_signatures sub-resource — that endpoint 404s on many repos/plans
      // (verified live), so the control would silently fail to apply. A ruleset enforces it reliably on the
      // default branch. Idempotent: reconcile a named ruleset (create/keep when true, delete when false).
      // Only enable on a profile whose propose effect produces GitHub-VERIFIED commits (soc2-baseline's
      // commit_signing: verified-api) — otherwise every agent merge wedges. Best-effort + non-fatal.
      if (bp.required_signatures !== undefined) {
        const rsName = 'open-autonomy-required-signatures';
        const found = tryRun(proc, 'gh', ['api', `repos/${options.repo}/rulesets`, '--jq', `.[] | select(.name=="${rsName}") | .id`]);
        const rsId = found.ok ? found.out.trim().split('\n')[0] : '';
        if (bp.required_signatures) {
          const rsBody = JSON.stringify({
            name: rsName, target: 'branch', enforcement: 'active',
            conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
            rules: [{ type: 'required_signatures' }],
          });
          if (rsId) tryRun(proc, 'gh', ['api', '-X', 'PUT', `repos/${options.repo}/rulesets/${rsId}`, '--input', '-'], { input: rsBody });
          else tryRun(proc, 'gh', ['api', '-X', 'POST', `repos/${options.repo}/rulesets`, '--input', '-'], { input: rsBody });
        } else if (rsId) {
          tryRun(proc, 'gh', ['api', '-X', 'DELETE', `repos/${options.repo}/rulesets/${rsId}`]);
        }
      }
    }
  }

  // Repo security settings (GitHub Advanced Security). Best-effort + non-fatal — secret scanning and
  // push protection are free on PUBLIC repos but a paid add-on on PRIVATE repos (gap G3); on a private
  // repo without GHAS this PATCH is simply rejected and the rest of provisioning proceeds.
  if (manifest.security && !options.dryRun && (hasCommits || shouldPush)) {
    const sec: Record<string, unknown> = {};
    if (manifest.security.secret_scanning !== undefined)
      sec.secret_scanning = { status: manifest.security.secret_scanning ? 'enabled' : 'disabled' };
    if (manifest.security.secret_scanning_push_protection !== undefined)
      sec.secret_scanning_push_protection = { status: manifest.security.secret_scanning_push_protection ? 'enabled' : 'disabled' };
    if (Object.keys(sec).length > 0) {
      tryRun(proc, 'gh', ['api', '-X', 'PATCH', `repos/${options.repo}`, '--input', '-'], {
        input: JSON.stringify({ security_and_analysis: sec }),
      });
    }
  }

  let presentSecrets: string[] = [];
  const secretList = tryRun(proc, 'gh', ['secret', 'list', '-R', options.repo, '--json', 'name']);
  if (secretList.ok) presentSecrets = (JSON.parse(secretList.out) as Array<{ name: string }>).map((s) => s.name);

  return formatReport({
    repo: options.repo,
    created: !exists,
    pushed: shouldPush,
    variables: variablePlan,
    labels: labelPlan,
    branchProtection,
    missingSecrets: missingSecrets(manifest.required_secrets, presentSecrets),
    dryRun: options.dryRun,
  });
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const report = await provisionTargetRepo(options, defaultProc);
  process.stdout.write(`${report}\n`);
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
