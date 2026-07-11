// TF.1 — Gate-and-linkage-aware M6 "mission-advancing" signal (DESIGN build-plan #6;
// OA-INSTALL-IMPLEMENTATION-TASKS.md Track F). DESIGN §Q1's M6 row: "a gate-passed, merged PR closed a
// mission-linked work item — the loop is *advancing the mission*, not merely ticking."
//
// Today's TWO shipped proxies are both weaker than that definition:
//   - `scripts/reconcile-merged-issues.ts:25-29` closes an issue on ANY merged PR whose branch is
//     `agent/issue-<n>` — a docs-only PR qualifies, no gate check, no linkage check at all.
//   - `services/agent-model-proxy/src/github-sync.ts:111-124`'s `roadmap:<id>` rollup counts ANY CLOSED
//     roadmap issue as `done` — an issue closed by hand (no merged PR behind it at all — the "roadmap
//     reconciliation" administrative close this repo's own history contains several of) increments it too.
//
// This module builds the REAL, profile-specific check, reading the two facts each profile's
// `setup-pack.yml` (TS.1, `packages/core/src/setup-pack.ts`) already declares:
//   - `landing_mode` — PR-free (simple-sdlc: no merged PR exists at all, check ztrack AC-evidence instead)
//     vs PR-based (simple-gh / simple-gh-sdlc / self-driving: gate + linkage check against a merged PR).
//   - `maturity_signals.m6_signal` — HOW the "linked to the vision/roadmap" half derives on a PR-based
//     profile: `roadmap-rollup` (self-driving: a `roadmap:<id>` label) vs `pr-close` (simple-gh-sdlc: no
//     roadmap trio on this profile, so linkage is the issue's own `## Acceptance Criteria` body — the
//     profile's actual board grammar, `docs/standards/issue-and-evidence.md`) vs `per-issue` (simple-gh: the
//     board is a LOCAL ztrack store even though its PRs land on GitHub — `profiles/simple-gh/setup-pack.yml`
//     — so linkage is the ztrack item's own registered plan-doc `source`, `skills/manager/SKILL.md`'s
//     plans-as-docs recipe).
//
// SHAPE (matches TB.1's `imm-signals.ts` `SignalFn` convention EXACTLY — same `{present, evidence}`
// contract, same `(installDir, ctx?) -> Promise<Signal>` shape, same evidence-must-cite-a-fact discipline —
// so a future TB.2 composer can import both files' functions side by side): `missionAdvancingSignal
// (installDir, ctx) -> Promise<Signal>`.
//
// STANDALONE BY DESIGN: TB.1 (`packages/local-runner-cli/src/imm-signals.ts`) is mid fix-round on PR #148
// at the time this unit was built — this file does NOT import anything from it, and TB.1 does not import
// anything from this file. TB.2 (the future `oa maturity` composer, not built by either unit) is expected
// to import `collectImmSignals` from imm-signals.ts AND `missionAdvancingSignal` from this file and compose
// both into one M0..M6 verdict. Reused here (pre-existing package infra, not TB.1-owned — `board-readiness.
// ts`/TA.2 already depends on both): `./proc.ts` (`defaultProc`/`firstLine`) and `./types.ts` (`ProcRunner`).
//
// NO-CORE-IMPORTS RULE (mirrors `board-readiness.ts`'s header + TB.1's own header): this package
// (`@volter/oa`) is designed to be independently publishable — `@open-autonomy/core` is a private,
// unpublished monorepo workspace package, so nothing here imports it. `setup-pack.yml`/`provision.json` are
// read with a plain `yaml`/`JSON.parse`, the exact fields needed, never `getSetupPack`'s full VIEW
// derivation.
//
// EVIDENCE HONESTY: every `present:true` cites the concrete issue/PR number + head sha + which required
// checks were found + the specific linkage fact (label / AC section / ztrack source). Every `present:false`
// names what was checked and what was missing. `gh`/`ztrack` unavailable or unauthenticated ->
// `unverifiable: <why>` — NEVER a guessed verdict (mirrors TB.1's A13 branch-protection-404 handling: a
// bare 404/403/401 is reported as its own distinguishable reason, never silently read as a definite "no").

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { defaultProc, firstLine } from './proc.ts';
import type { ProcRunner } from './types.ts';

export interface Signal {
  present: boolean;
  /** A cited fact — issue/PR numbers, sha, check names, label/AC/source text. Never a bare restatement of
   *  `present`. */
  evidence: string;
}

export type MissionAdvancingSignalFn = (installDir: string, ctx?: MissionAdvancingContext) => Promise<Signal>;

export interface MissionAdvancingContext {
  /** injectable subprocess seam (gh/ztrack probes) — tests stub this; default shells out for real. */
  proc?: ProcRunner;
  /** ambient env override (default process.env). */
  env?: NodeJS.ProcessEnv;
  /** the SOURCE profile directory (e.g. `profiles/self-driving`) — required to read `setup-pack.yml`
   *  (`landing_mode`, `maturity_signals.{m6_signal,m4_predicate}`) and, for a PR-based profile,
   *  `provision.json`'s `branch_protection.required_checks`. Not copied into a compiled install by
   *  `compile` — must be supplied out-of-band, the same convention as TB.1's `SignalContext.profileDir`. */
  profileDir?: string;
  /** `owner/name` override for the GitHub-hosted legs — skips the `gh repo view` autodetect probe. */
  repo?: string;
  /** Check ONE specific work item (a GitHub issue number for a gh-issues board, a ztrack identifier for a
   *  ztrack board) instead of scanning the board's most-recently-closed items. Used by both the live proof
   *  (pin a known real issue/PR) and fixture tests (avoid needing a full board-scan stub). */
  workItemId?: string;
  /** Bound on how many recently-closed items a board-wide scan reads when `workItemId` is omitted
   *  (default 20). */
  scanLimit?: number;
}

// --- pack facts (dependency-free yaml read, mirrors board-readiness.ts's readMaturitySignals) ------------

interface RawSetupPack {
  landing_mode?: string;
  maturity_signals?: { m4_predicate?: string; m6_signal?: string };
}

interface PackFacts {
  landingMode: string;
  m6Signal: string;
  m4Predicate?: string;
}

function readPackFacts(profileDir: string): PackFacts | undefined {
  const p = join(profileDir, 'setup-pack.yml');
  if (!existsSync(p)) return undefined;
  let parsed: RawSetupPack;
  try {
    parsed = parseYaml(readFileSync(p, 'utf8')) as RawSetupPack;
  } catch {
    return undefined;
  }
  const landingMode = parsed?.landing_mode;
  const m6Signal = parsed?.maturity_signals?.m6_signal;
  if (!landingMode || !m6Signal) return undefined;
  const out: PackFacts = { landingMode, m6Signal };
  if (parsed.maturity_signals?.m4_predicate) out.m4Predicate = parsed.maturity_signals.m4_predicate;
  return out;
}

// --- required checks (dependency-free JSON read, mirrors TB.1 A13's readProvisionJson) --------------------

interface ProvisionJsonShape {
  branch_protection?: { required_checks?: string[] };
}

function readRequiredChecks(profileDir: string): string[] | undefined {
  const p = join(profileDir, 'provision.json');
  if (!existsSync(p)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8')) as ProvisionJsonShape;
    const checks = parsed.branch_protection?.required_checks;
    return Array.isArray(checks) ? checks : undefined;
  } catch {
    return undefined;
  }
}

// --- shared gh helpers --------------------------------------------------------------------------------

function isAuthError(stderr: string | undefined): boolean {
  return /not logged in|authentication|HTTP 401|gh auth login/i.test(stderr || '');
}

async function resolveRepo(installDir: string, ctx: MissionAdvancingContext, proc: ProcRunner): Promise<string | Signal> {
  if (ctx.repo) return ctx.repo;
  const r = proc('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], { cwd: installDir, env: ctx.env });
  if (r.status !== 0) {
    if (isAuthError(r.stderr)) return { present: false, evidence: `unverifiable: gh not authenticated (gh repo view: ${firstLine(r.stderr)})` };
    return { present: false, evidence: `unverifiable: cannot determine the target repo (gh repo view --json nameWithOwner failed: ${firstLine(r.stderr)})` };
  }
  const repo = r.stdout.trim();
  if (!repo) return { present: false, evidence: 'unverifiable: gh repo view returned an empty nameWithOwner' };
  return repo;
}

interface CheckEntry {
  name: string;
  ok: boolean;
  /** how the gate detail cites this context: 'success' | 'PENDING' (not yet concluded) | 'FAIL'. */
  label: string;
}

// Normalizes `gh pr view/list --json statusCheckRollup` entries. GitHub reports two different shapes on
// the same array: a real workflow check-run (`{name, conclusion}`) and a directly-posted commit status
// (`{context, state}`, e.g. `agent-review`/`human-approval`, which post via the effect step's dispatched
// `gh api statuses`, not a workflow — CLAUDE.md's "GITHUB_TOKEN anti-recursion" note). Both are "a required
// context is green" the same way to a required-status-checks gate, so both normalize into one CheckEntry.
// A still-running/not-yet-posted context (StatusContext PENDING/EXPECTED, a check-run still QUEUED/
// IN_PROGRESS with a null conclusion) is labeled PENDING in the gate detail, not FAIL — the gate verdict is
// the same (not green), but the evidence must not claim a check failed when it merely hasn't concluded.
const PENDING_STATES = new Set(['PENDING', 'EXPECTED', 'QUEUED', 'IN_PROGRESS', '']);

function normalizeStatusRollup(raw: unknown): CheckEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((e) => {
    const entry = e as { context?: string; name?: string; state?: string; conclusion?: string };
    const name = entry.context ?? entry.name ?? '(unnamed)';
    const state = (entry.state ?? entry.conclusion ?? '').toString().toUpperCase();
    return { name, ok: state === 'SUCCESS', label: state === 'SUCCESS' ? 'success' : PENDING_STATES.has(state) ? 'PENDING' : 'FAIL' };
  });
}

function evaluateGate(requiredChecks: string[], checks: CheckEntry[]): { ok: boolean; detail: string } {
  const byName = new Map(checks.map((c) => [c.name, c]));
  const results = requiredChecks.map((rc) => `${rc}=${byName.has(rc) ? byName.get(rc)!.label : 'MISSING'}`);
  const ok = requiredChecks.length > 0 && requiredChecks.every((rc) => byName.get(rc)?.ok === true);
  return { ok, detail: `required=[${requiredChecks.join(',')}] found=[${results.join(',')}]` };
}

// --- gh-issues board legs (simple-gh-sdlc: pr-close · self-driving: roadmap-rollup) ------------------------

interface ClosingPr {
  number: number;
  headSha: string;
  checks: CheckEntry[];
}
interface AuthErr {
  authError: string;
}
/** A PR was named as the closer (by a comment marker / body line) but is NOT actually MERGED — a green-but-
 *  open PR (the normal pre-auto-merge state) or a closed-without-merge PR must never read as a merged one. */
interface NotMergedPr {
  notMergedNumber: number;
  prState: string;
}

/** Find the merged PR that closed `issueNumber`, mirroring THIS REPO'S OWN linking convention exactly
 *  (`scripts/reconcile-merged-issues.ts:24-26`: GitHub's `closedByPullRequestsReferences` does NOT reliably
 *  include a MERGED PR, so the branch-name convention `agent/issue-<n>` is the primary, robust link).
 *  Falls back to the reconcile sweep's own durable audit trail — its `Resolved by #<N> (merged)` comment
 *  (`reconcile-merged-issues.ts:51`) — for an issue closed before/without that branch convention. Returns
 *  `undefined` (not an error) when genuinely no merged PR closed the issue at all — the exact weak-proxy
 *  failure mode this unit exists to catch (an issue closed by administrative/roadmap-reconciliation
 *  prose, no gated merge behind it). */
async function findClosingMergedPr(repo: string, issueNumber: string, proc: ProcRunner, env: NodeJS.ProcessEnv | undefined): Promise<ClosingPr | AuthErr | NotMergedPr | undefined> {
  const byBranch = proc('gh', ['pr', 'list', '-R', repo, '--head', `agent/issue-${issueNumber}`, '--state', 'merged', '--json', 'number,statusCheckRollup,headRefOid'], { env });
  if (byBranch.status !== 0) {
    if (isAuthError(byBranch.stderr)) return { authError: firstLine(byBranch.stderr) };
  } else {
    try {
      const rows = JSON.parse(byBranch.stdout || '[]') as Array<{ number: number; statusCheckRollup?: unknown; headRefOid?: string }>;
      if (Array.isArray(rows) && rows.length > 0 && rows[0]) {
        const row = rows[0];
        return { number: row.number, headSha: row.headRefOid ?? '(unknown)', checks: normalizeStatusRollup(row.statusCheckRollup) };
      }
    } catch {
      /* fall through to the comment-marker fallback */
    }
  }

  const comments = proc('gh', ['issue', 'view', issueNumber, '-R', repo, '--json', 'comments'], { env });
  if (comments.status !== 0) {
    if (isAuthError(comments.stderr)) return { authError: firstLine(comments.stderr) };
    return undefined;
  }
  let joined = '';
  try {
    const parsed = JSON.parse(comments.stdout) as { comments?: Array<{ body?: string }> };
    joined = (parsed.comments ?? []).map((c) => c.body ?? '').join('\n');
  } catch {
    return undefined;
  }
  const m = /Resolved by #(\d+) \(merged\)/.exec(joined);
  if (!m || !m[1]) return undefined;
  const prNumber = m[1];
  // The comment marker is prose ANY commenter could have written — never trust it as proof of a merge.
  // Verify state==MERGED on the PR itself; a green-but-OPEN PR (the normal pre-auto-merge state) or a
  // closed-without-merge PR must be reported as not-merged, not counted as the closing merged PR.
  const pv = proc('gh', ['pr', 'view', prNumber, '-R', repo, '--json', 'number,state,mergedAt,statusCheckRollup,headRefOid'], { env });
  if (pv.status !== 0) {
    if (isAuthError(pv.stderr)) return { authError: firstLine(pv.stderr) };
    return undefined;
  }
  try {
    const row = JSON.parse(pv.stdout) as { number: number; state?: string; mergedAt?: string | null; statusCheckRollup?: unknown; headRefOid?: string };
    if ((row.state ?? '').toUpperCase() !== 'MERGED') {
      return { notMergedNumber: row.number, prState: (row.state ?? '(unknown)').toUpperCase() };
    }
    return { number: row.number, headSha: row.headRefOid ?? '(unknown)', checks: normalizeStatusRollup(row.statusCheckRollup) };
  } catch {
    return undefined;
  }
}

async function listClosedIssueNumbers(repo: string, proc: ProcRunner, env: NodeJS.ProcessEnv | undefined, limit: number): Promise<string[]> {
  const r = proc('gh', ['issue', 'list', '-R', repo, '--state', 'closed', '--limit', String(limit), '--json', 'number,closedAt'], { env });
  if (r.status !== 0) return [];
  try {
    const rows = JSON.parse(r.stdout || '[]') as Array<{ number?: number; closedAt?: string }>;
    return rows
      .filter((row): row is { number: number; closedAt?: string } => row.number !== undefined)
      .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? '')) // most-recently-closed first
      .map((row) => String(row.number));
  } catch {
    return [];
  }
}

interface EvalResult extends Signal {
  authAbort?: boolean;
}

async function evaluateGhIssue(repo: string, issueNumber: string, facts: PackFacts, requiredChecks: string[], proc: ProcRunner, env: NodeJS.ProcessEnv | undefined): Promise<EvalResult> {
  const iv = proc('gh', ['issue', 'view', issueNumber, '-R', repo, '--json', 'number,state,labels,body'], { env });
  if (iv.status !== 0) {
    if (isAuthError(iv.stderr)) return { present: false, evidence: `unverifiable: gh not authenticated (gh issue view #${issueNumber}: ${firstLine(iv.stderr)})`, authAbort: true };
    return { present: false, evidence: `#${issueNumber}: gh issue view failed (${firstLine(iv.stderr)})` };
  }
  let issue: { number?: number; state?: string; labels?: Array<{ name?: string }>; body?: string };
  try {
    issue = JSON.parse(iv.stdout);
  } catch {
    return { present: false, evidence: `#${issueNumber}: unparseable gh issue view output` };
  }
  if ((issue.state ?? '').toUpperCase() !== 'CLOSED') {
    return { present: false, evidence: `#${issueNumber}: not closed (state=${issue.state ?? '(unknown)'})` };
  }

  const pr = await findClosingMergedPr(repo, issueNumber, proc, env);
  if (pr && 'authError' in pr) {
    return { present: false, evidence: `unverifiable: gh not authenticated (${pr.authError})`, authAbort: true };
  }
  if (pr && 'notMergedNumber' in pr) {
    return {
      present: false,
      evidence: `#${issueNumber}: closed, and a reconcile comment names PR #${pr.notMergedNumber} — but PR #${pr.notMergedNumber} is ${pr.prState}, not merged; no gated merge stands behind this close`,
    };
  }
  if (!pr) {
    return {
      present: false,
      evidence: `#${issueNumber}: closed, but no merged PR was found closing it (checked branch agent/issue-${issueNumber} + the reconcile sweep's 'Resolved by #' comment marker) — this is the exact weak-proxy failure mode (services/agent-model-proxy/src/github-sync.ts:111-124 would still count this closed issue as "done")`,
    };
  }

  const gate = evaluateGate(requiredChecks, pr.checks);

  let linkageOk: boolean;
  let linkageDetail: string;
  if (facts.m6Signal === 'roadmap-rollup') {
    const labels = (issue.labels ?? []).map((l) => l.name ?? '');
    // Mirror github-sync.ts's OWN phase-label skip (`rollupRoadmapStatus`'s `/^phase-\d+$/` guard): a
    // `roadmap:phase-N` label is a phase marker, not an item id — it must not count as mission-linkage.
    const roadmapLabel = labels.find((l) => /^roadmap:/.test(l) && !/^roadmap:phase-\d+$/.test(l));
    linkageOk = !!roadmapLabel;
    linkageDetail = roadmapLabel ? `roadmap:<id> label "${roadmapLabel}"` : `no roadmap:<id> label (labels=[${labels.join(',')}])`;
  } else {
    // pr-close (simple-gh-sdlc, no roadmap trio on this profile — DESIGN §Q1) and a fallback for any other
    // gh-issues profile: linkage is the issue's own real, checkable `## Acceptance Criteria` body
    // (`docs/standards/issue-and-evidence.md`'s "Bodies include `## Acceptance Criteria`") — the profile's
    // actual board grammar for "this traces back to planned work," not an ad hoc/docs-only close.
    const body = issue.body ?? '';
    const hasAcHeading = /^##\s*Acceptance Criteria/im.test(body);
    const hasAcItem = /-\s*\[[ xX]\]/.test(body);
    linkageOk = hasAcHeading && hasAcItem;
    linkageDetail = linkageOk ? 'body carries a real ## Acceptance Criteria section with >=1 item' : 'body lacks a real ## Acceptance Criteria section (docs-only/ad hoc close)';
  }

  const present = gate.ok && linkageOk;
  return {
    present,
    evidence: `#${issueNumber} closed by merged PR #${pr.number} (sha=${pr.headSha.slice(0, 10)}): gate ${gate.ok ? 'PASSED' : 'FAILED'} (${gate.detail}); linkage ${linkageOk ? 'PRESENT' : 'ABSENT'} (${linkageDetail})`,
  };
}

async function ghIssuesBoardPrSignal(installDir: string, ctx: MissionAdvancingContext, facts: PackFacts, requiredChecks: string[], proc: ProcRunner): Promise<Signal> {
  const repo = await resolveRepo(installDir, ctx, proc);
  if (typeof repo !== 'string') return repo;

  const scanLimit = ctx.scanLimit ?? 20;
  const candidates = ctx.workItemId ? [ctx.workItemId] : await listClosedIssueNumbers(repo, proc, ctx.env, scanLimit);
  if (candidates.length === 0) {
    return {
      present: false,
      evidence: `no closed issue found on ${repo} (checked ${ctx.workItemId ? `#${ctx.workItemId}` : `up to ${scanLimit} recently-closed issues`}) — nothing to prove M6 against yet`,
    };
  }

  const checked: string[] = [];
  for (const num of candidates) {
    const verdict = await evaluateGhIssue(repo, num, facts, requiredChecks, proc, ctx.env);
    if (verdict.authAbort) return { present: false, evidence: verdict.evidence };
    if (verdict.present) return verdict;
    checked.push(verdict.evidence);
  }
  return {
    present: false,
    evidence: `no closed issue on ${repo} passed both the gate check and the ${facts.m6Signal} linkage check — checked ${checked.length}: ${checked.join(' | ')}`,
  };
}

// --- ztrack board leg (simple-gh: PR-based, but the BOARD is a local ztrack store — m6_signal=per-issue) --

interface ZtrackDoneItem {
  id: string;
  source: string;
}

/** List `done` items WITH their owning `source` — the source is only emitted by `issue list --json`
 *  (probed against the vendored ztrack@1.0.0: `issue view` IGNORES its `--json` field list and its output
 *  object has NO `source` key at all, so source MUST come from the list call, never from view). Order note
 *  (see the callers' evidence wording): ztrack's list order is store/filesystem order, NOT recency — its
 *  `updatedAt` is empty (`""`) for document-source items, so a client-side recency sort would be a lie too;
 *  the scan is bounded, not most-recent-first, and the evidence says exactly that. */
async function listZtrackDone(installDir: string, proc: ProcRunner, env: NodeJS.ProcessEnv | undefined, limit: number): Promise<ZtrackDoneItem[]> {
  const r = proc('npx', ['ztrack', 'issue', 'list', '--state', 'done', '--json', 'identifier,source', '--limit', String(limit)], { cwd: installDir, env });
  if (r.status !== 0) return [];
  try {
    const rows = JSON.parse(r.stdout || '[]') as Array<{ identifier?: string; source?: string }>;
    return rows.filter((row): row is { identifier: string; source?: string } => !!row.identifier).map((row) => ({ id: row.identifier, source: row.source ?? '' }));
  } catch {
    return [];
  }
}

async function ztrackBoardPrSignal(installDir: string, ctx: MissionAdvancingContext, requiredChecks: string[], proc: ProcRunner): Promise<Signal> {
  // Even though the BOARD is ztrack, the PRs still land on GitHub (simple-gh's landing_mode is
  // manual-after-review, not pr-free) — resolve the repo the same way the gh-issues leg does.
  const repo = await resolveRepo(installDir, ctx, proc);
  if (typeof repo !== 'string') return repo;

  const scanLimit = ctx.scanLimit ?? 20;
  // The done list is ALSO the source-of-truth for each item's `source` (see listZtrackDone's header), so
  // even a pinned workItemId goes through it — which additionally verifies the item really is `done`.
  const done = await listZtrackDone(installDir, proc, ctx.env, scanLimit);
  const candidates = ctx.workItemId ? done.filter((d) => d.id === ctx.workItemId) : done;
  if (candidates.length === 0) {
    if (ctx.workItemId) {
      return { present: false, evidence: `ztrack item '${ctx.workItemId}' is not in the 'done' list (${done.length} done item(s) found in ${installDir}) — only a done item can prove M6` };
    }
    return { present: false, evidence: `no ztrack 'done' item found in ${installDir} (checked up to ${scanLimit} done items, store order) — nothing to prove M6 against yet` };
  }

  const checked: string[] = [];
  for (const { id, source } of candidates) {
    // The body (for the `PR:` line) still comes from `issue view` — the real CLI emits the full issue
    // object (including `body`) regardless of the field list; only `source` is missing from it.
    const view = proc('npx', ['ztrack', 'issue', 'view', id, '--json', 'identifier,body,state'], { cwd: installDir, env: ctx.env });
    if (view.status !== 0) {
      checked.push(`${id}: ztrack issue view failed (${firstLine(view.stderr)})`);
      continue;
    }
    let parsed: { body?: string };
    try {
      parsed = JSON.parse(view.stdout);
    } catch {
      checked.push(`${id}: unparseable ztrack issue view output`);
      continue;
    }
    const body = parsed.body ?? '';

    // linkage: the item's declared plan-doc source (from the LIST call, above). board_seed_recipe.
    // originator_skill=planner, import_verb='ztrack import --register' (profiles/simple-gh/setup-pack.yml) —
    // a plan doc registered from the vision (docs/plans/<topic>.md, skills/manager/SKILL.md's "Plans-as-docs
    // recipe"). ztrack's own un-registered fallback source name is literally 'default' — that does NOT count
    // as plan-doc-linked (an issue with no declared source is an ad hoc one, not one traced back to a
    // vision-derived plan).
    const linked = source !== '' && source !== 'default';
    const linkageDetail = linked ? `plan-doc-linked (source="${source}")` : `not plan-doc-linked (source="${source || '(none)'}")`;

    // gate target: the "PR:" line the manager writes into the body on merge (skills/manager/SKILL.md:166:
    // "Done = merged PR. Once merged: set the issue's `PR:` line and flip its ztrack state yourself").
    const prMatch = /PR:\s*#?(\d+)/.exec(body);
    if (!prMatch || !prMatch[1]) {
      checked.push(`${id}: 'done' but no 'PR:' line in body — cannot verify a gated merge behind it`);
      continue;
    }
    const prNumber = prMatch[1];
    const pv = proc('gh', ['pr', 'view', prNumber, '-R', repo, '--json', 'number,state,mergedAt,statusCheckRollup,headRefOid'], { env: ctx.env });
    if (pv.status !== 0) {
      if (isAuthError(pv.stderr)) return { present: false, evidence: `unverifiable: gh not authenticated (gh pr view #${prNumber}: ${firstLine(pv.stderr)})` };
      checked.push(`${id}: gh pr view #${prNumber} failed (${firstLine(pv.stderr)})`);
      continue;
    }
    let prRow: { number: number; state?: string; mergedAt?: string | null; statusCheckRollup?: unknown; headRefOid?: string };
    try {
      prRow = JSON.parse(pv.stdout);
    } catch {
      checked.push(`${id}: unparseable gh pr view #${prNumber} output`);
      continue;
    }
    // The `PR:` body line is prose the manager wrote — never trust it as proof of a merge. Require
    // state==MERGED: a done item pointing at a green-but-OPEN PR (the normal pre-merge state) or a
    // closed-without-merge PR has no gated merge behind it.
    const prState = (prRow.state ?? '(unknown)').toUpperCase();
    if (prState !== 'MERGED') {
      checked.push(`${id}: body names PR #${prNumber}, but PR #${prNumber} is ${prState}, not merged — no gated merge stands behind this done state`);
      continue;
    }
    const gate = evaluateGate(requiredChecks, normalizeStatusRollup(prRow.statusCheckRollup));
    const present = gate.ok && linked;
    if (present) {
      return {
        present: true,
        evidence: `ztrack '${id}' done, closed by merged PR #${prNumber} (sha=${(prRow.headRefOid ?? '(unknown)').slice(0, 10)}, mergedAt=${prRow.mergedAt ?? '(unknown)'}): gate PASSED (${gate.detail}); ${linkageDetail}`,
      };
    }
    checked.push(`${id}: merged PR #${prNumber} gate ${gate.ok ? 'PASSED' : 'FAILED'} (${gate.detail}); ${linkageDetail}`);
  }
  return {
    present: false,
    evidence: `no done ztrack item passed both the gate check and plan-doc linkage — checked ${checked.length}: ${checked.join(' | ')}`,
  };
}

// --- pr-free leg (simple-sdlc: no merged PR exists on this profile at all) ---------------------------------

async function prFreeSignal(installDir: string, ctx: MissionAdvancingContext, proc: ProcRunner): Promise<Signal> {
  const scanLimit = ctx.scanLimit ?? 20;
  const candidates = ctx.workItemId ? [ctx.workItemId] : (await listZtrackDone(installDir, proc, ctx.env, scanLimit)).map((d) => d.id);
  if (candidates.length === 0) {
    return {
      present: false,
      evidence: `no ztrack 'done' item found in ${installDir} (checked ${ctx.workItemId ? `item '${ctx.workItemId}'` : `up to ${scanLimit} done items, store order`}) — nothing to prove M6 against yet`,
    };
  }

  const checked: string[] = [];
  for (const id of candidates) {
    const r = proc('npx', ['ztrack', 'check', id, '--json'], { cwd: installDir, env: ctx.env });
    const digest = r.stdout.trim() ? firstLine(r.stdout) : firstLine(r.stderr);
    if (r.status === 0) {
      return { present: true, evidence: `ztrack '${id}': done + AC-evidence trace green (\`npx ztrack check ${id} --json\` exit 0: "${digest}")` };
    }
    checked.push(`${id} (\`npx ztrack check ${id} --json\` exit ${r.status}: "${digest}")`);
  }
  return {
    present: false,
    evidence: `no 'done' ztrack item's AC-evidence trace verified green — checked ${checked.length}: ${checked.join(' | ')}`,
  };
}

// --- the entry point --------------------------------------------------------------------------------------

/** TF.1 — `missionAdvancingSignal`: the real, profile-specific M6 check (DESIGN §Q1's missing top rung).
 *  Branches on the profile's OWN declared `setup-pack.yml` facts — never on a literal profile name (the
 *  TS.2 two-layer discipline: `landing_mode === 'pr-free'` selects the AC-evidence leg; otherwise
 *  `maturity_signals.m4_predicate` selects which board a PR-based profile's closed items live on, and
 *  `maturity_signals.m6_signal` selects how the linkage half of the check is derived on that board. */
export async function missionAdvancingSignal(installDir: string, ctx: MissionAdvancingContext = {}): Promise<Signal> {
  const proc = ctx.proc ?? defaultProc;

  if (!ctx.profileDir) {
    return { present: false, evidence: "unverifiable: no ctx.profileDir supplied — cannot locate the source profile's setup-pack.yml (not copied into a compiled install)" };
  }
  const facts = readPackFacts(ctx.profileDir);
  if (!facts) {
    return { present: false, evidence: `unverifiable: ${join(ctx.profileDir, 'setup-pack.yml')} missing/unreadable or lacks landing_mode/maturity_signals.m6_signal` };
  }

  if (facts.landingMode === 'pr-free') {
    return prFreeSignal(installDir, ctx, proc);
  }

  const requiredChecks = readRequiredChecks(ctx.profileDir);
  if (!requiredChecks || requiredChecks.length === 0) {
    return {
      present: false,
      evidence: `unverifiable: ${join(ctx.profileDir, 'provision.json')} declares no branch_protection.required_checks — cannot verify this PR-based profile's required gates`,
    };
  }

  if (facts.m4Predicate === 'ztrack') {
    return ztrackBoardPrSignal(installDir, ctx, requiredChecks, proc);
  }
  if (facts.m4Predicate === 'gh-issues') {
    return ghIssuesBoardPrSignal(installDir, ctx, facts, requiredChecks, proc);
  }
  return {
    present: false,
    evidence: `unverifiable: ${join(ctx.profileDir, 'setup-pack.yml')} is PR-based (landing_mode="${facts.landingMode}") but declares no maturity_signals.m4_predicate — cannot determine which board its closed items live on`,
  };
}
