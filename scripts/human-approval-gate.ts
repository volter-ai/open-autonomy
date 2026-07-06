#!/usr/bin/env bun
// The `human-approval` gate — a DETERMINISTIC, ADDITIONAL required check (alongside ci + agent-review). It is
// the github realization of the actor model's human REVIEW task: a maintainer Approve on the CURRENT head SHA,
// required ONLY for PRs that touch human-required scope (sensitive paths, or the `human-required` label).
//
// Why deterministic/script (vs an agent): it IS a security boundary — "did a maintainer approve this exact
// head?" must not be a model judgment. AI review stays required separately (agent-review); this only adds the
// human sign-off for sensitive changes. Routine agent PRs auto-pass so the autonomous loop is never blocked.
//
// The status flipping to `success` completes `completion: 'maintainer Approve on current SHA'`. Re-earned per
// SHA: an Approve counts only if its commit_id == the current head, so a new push re-opens the gate.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// A qualifying sign-off: APPROVED, by a maintainer, on the CURRENT head (per-SHA re-earn via commit_id). The
// reviews API returns state UPPERCASE ('APPROVED'); the pull_request_review event payload returns it lowercase
// ('approved') — normalize. Maintainership is verified by ACTUAL repo permission only — `author_association`
// is never consulted: under the workflow's GitHub App token an org member shows as CONTRIBUTOR (a PAT sees
// MEMBER), and the association says nothing about write access (a read-only collaborator must not satisfy a
// security gate).
export type Review = { state?: string; author_association?: string; commit_id?: string; user?: { login?: string } };
export const qualifies = (r: Review, headSha: string, isMaintainer: (login: string) => boolean): boolean => {
  if ((r.state ?? '').toUpperCase() !== 'APPROVED' || r.commit_id !== headSha) return false;
  return isMaintainer(r.user?.login ?? '');
};

// Which repo permissions count as maintainer (write+) for the gate.
export const isMaintainerPermission = (perm: string): boolean => perm === 'admin' || perm === 'write' || perm === 'maintain';

// `agent-develop-only` on a PR's LINKED ISSUE means "develop + review, but hold the merge for maintainer
// approval" — human-approval semantics, so THIS gate owns it (not agent-review: failing the review status for
// a governance hold would conflate "review found defects" with "merge is held"). The gate treats it exactly
// like `human-required` on the PR itself.
export const DEVELOP_ONLY_LABEL = 'agent-develop-only';

// The develop-only decision from one linked issue's label lookup. FAILS CLOSED: this gate is a security
// boundary, so an UNREADABLE label set (null — e.g. the workflow token lacks issues:read) scopes the PR
// rather than waving it through. Live-proven necessary (BL-5 dev/03): with the swallowed-error path,
// every develop-only PR auto-passed because the failed lookup looked identical to "no labels".
export const developOnlyFromLookup = (labelsCsv: string | null): boolean =>
  labelsCsv === null ? true : labelsCsv.split(',').includes(DEVELOP_ONLY_LABEL);

// Resolve which issues a PR closes: prefer the code host's own link graph (closingIssuesReferences — populated
// from close keywords at PR creation), fall back to parsing the body for "Closes #N"-style keywords when the
// field is empty/unavailable.
export function linkedIssueNumbers(refs: { number?: number }[] | undefined, body: string | undefined): number[] {
  const fromRefs = (refs ?? []).map((r) => r.number).filter((n): n is number => typeof n === 'number');
  if (fromRefs.length) return [...new Set(fromRefs)];
  const out = new Set<number>();
  for (const m of (body ?? '').matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi)) out.add(Number(m[1]));
  return [...out];
}

// human-required scope is DATA, not hardcode: the install carries the profile's declared
// policy.box.risk.human_required_paths, projected VERBATIM at compile into
// .open-autonomy/human-required-paths.json (no substrate defaults are added — the substrate owns no
// scope vocabulary). The gate enforces whatever policy declares — no project structure baked into the
// engine. Missing/unreadable file → no path scope (labels still gate).
export function loadHumanRequiredGlobs(root = '.'): Bun.Glob[] {
  try {
    const patterns = JSON.parse(readFileSync(`${root}/.open-autonomy/human-required-paths.json`, 'utf8')) as string[];
    return patterns.map((p) => new Bun.Glob(p));
  } catch {
    return [] as Bun.Glob[];
  }
}
// `.open-autonomy/history/**` (proposer transcripts) never counts as scope.
export function isSensitivePath(f: string, globs: Bun.Glob[]): boolean {
  if (f.startsWith('.open-autonomy/history/')) return false;
  return globs.some((g) => g.match(f));
}

if (import.meta.main) {
  const repo = process.env.GITHUB_REPOSITORY;
  const pr = process.env.PR_NUMBER;
  if (!repo || !pr) {
    process.stderr.write('human-approval: missing GITHUB_REPOSITORY/PR_NUMBER — skipping\n');
    process.exit(0);
  }
  const gh = (args: string[]): string => {
    try {
      return execFileSync('gh', args, { encoding: 'utf8' }).trim();
    } catch (e) {
      process.stderr.write(`human-approval: gh ${args.join(' ')} failed: ${e instanceof Error ? e.message : String(e)}\n`);
      return '';
    }
  };

  // Who to ENGAGE when a PR parks in human-required scope: the logins in the repo's maintainers variable
  // (the profile's `human.maintainers_var` policy → PUBLIC_AGENT_MAINTAINERS), passed in as $MAINTAINERS. Falls back to the
  // repo owner. github-native engage (assign + request-review) routes the ask to them so GitHub notifies them
  // out-of-band — this is the gh runner's OWN human realization (each substrate owns its engage).
  function maintainerLogins(): string[] {
    const fromVar = (process.env.MAINTAINERS ?? '')
      .split(/[\s,]+/)
      .map((s) => s.trim().replace(/^@/, ''))
      .filter(Boolean);
    if (fromVar.length) return fromVar;
    const owner = (repo ?? '').split('/')[0];
    return owner ? [owner] : []; // best-effort fallback; if the owner is an org login the gh call simply no-ops
  }

  // A PR in scope needs a maintainer Approve; everything else auto-passes.
  const HUMAN_REQUIRED_GLOBS = loadHumanRequiredGlobs();

  const view = JSON.parse(gh(['pr', 'view', pr, '-R', repo, '--json', 'headRefOid,labels,files,body,closingIssuesReferences']) || '{}') as {
    headRefOid?: string;
    labels?: { name: string }[];
    files?: { path: string }[];
    body?: string;
    closingIssuesReferences?: { number?: number }[];
  };
  const headSha = view.headRefOid;
  if (!headSha) {
    process.stderr.write('human-approval: could not resolve head SHA — skipping (no status posted)\n');
    process.exit(0);
  }
  const labels = (view.labels ?? []).map((l) => l.name);
  const files = (view.files ?? []).map((f) => f.path);
  // A linked issue marked develop-only puts the PR in human-required scope (see DEVELOP_ONLY_LABEL).
  // gh() maps failure to '' — indistinguishable from an issue with no labels — so this lookup catches
  // its own errors and hands developOnlyFromLookup a null to fail CLOSED on (see its note).
  const developOnly = linkedIssueNumbers(view.closingIssuesReferences, view.body).some((n) => {
    let issueLabels: string | null;
    try {
      issueLabels = execFileSync(
        'gh',
        ['issue', 'view', String(n), '-R', repo, '--json', 'labels', '--jq', '[.labels[].name]|join(",")'],
        { encoding: 'utf8' },
      ).trim();
    } catch (e) {
      process.stderr.write(
        `human-approval: could not read labels of linked issue #${n} (${e instanceof Error ? e.message : String(e)}) — failing CLOSED (scoped)\n`,
      );
      issueLabels = null;
    }
    return developOnlyFromLookup(issueLabels);
  });
  const scoped =
    labels.includes('human-required') || developOnly || files.some((f) => isSensitivePath(f, HUMAN_REQUIRED_GLOBS));

  // Does this login have maintainer (write+) permission on the repo? Verified per review event — one extra API
  // call, and the only trustworthy signal (see the qualifies() note on author_association).
  function isMaintainer(login: string): boolean {
    if (!login) return false;
    const perm = gh(['api', `repos/${repo}/collaborators/${login}/permission`, '--jq', '.permission']);
    return isMaintainerPermission(perm);
  }

  // The review that fired a `pull_request_review` event is in the event payload. Use it FIRST: it's
  // authoritative, immune to the reviews-API read returning empty under GITHUB_TOKEN, and free of the
  // review-just-submitted eventual-consistency lag. (This is the path a human Approve takes.)
  function eventReview(): Review | undefined {
    const p = process.env.GITHUB_EVENT_PATH;
    if (!p) return undefined;
    try {
      return (JSON.parse(readFileSync(p, 'utf8')) as { review?: Review }).review;
    } catch {
      return undefined;
    }
  }

  // For a scoped PR, look for a maintainer Approve on the current head.
  let approved = false;
  if (scoped) {
    const er = eventReview();
    if (er && qualifies(er, headSha, isMaintainer)) approved = true; // primary: the review carried by this event
    if (!approved) {
      // Backstop for the synchronize / re-dispatch paths (no event.review). The GITHUB_TOKEN sometimes returns
      // an empty reviews list, so this can only ADD an approval, never the sole gate — and we never silently
      // mis-parse it.
      const raw = gh(['api', `repos/${repo}/pulls/${pr}/reviews`, '--paginate']);
      if (raw) {
        try {
          approved = (JSON.parse(raw) as Review[]).some((r) => qualifies(r, headSha, isMaintainer));
        } catch (e) {
          process.stderr.write(`human-approval: could not parse reviews list (${e instanceof Error ? e.message : String(e)})\n`);
        }
      }
    }
  }

  const state = !scoped || approved ? 'success' : 'pending';
  const description = !scoped
    ? 'no human-required scope — auto-passed'
    : approved
      ? 'maintainer approved the current head'
      : developOnly
        ? 'awaiting a maintainer Approve on the current commit (linked issue is agent-develop-only)'
        : 'awaiting a maintainer Approve on the current commit (human-required scope)';

  gh(['api', '-X', 'POST', `repos/${repo}/statuses/${headSha}`, '-f', `state=${state}`, '-f', 'context=human-approval', '-f', `description=${description}`]);
  process.stdout.write(`human-approval: #${pr} scoped=${scoped} approved=${approved} → ${state} (${headSha.slice(0, 7)})\n`);

  // Engage the maintainer on a scoped PR awaiting approval — the gh runner's github-native human realization.
  if (scoped && !approved) {
    // 1) Out-of-band reach: assign + request review from the maintainer(s) so GitHub notifies them (their
    //    notifications/email) and the PR shows in their `assignee:@me` / review-requested worklist. Idempotent —
    //    only add whoever is missing, so re-runs on each push/review don't re-notify.
    const who = maintainerLogins();
    if (who.length) {
      const pv = JSON.parse(gh(['pr', 'view', pr, '-R', repo, '--json', 'assignees,reviewRequests']) || '{}') as {
        assignees?: { login?: string }[];
        reviewRequests?: { login?: string }[];
      };
      const assigned = new Set((pv.assignees ?? []).map((a) => a.login).filter(Boolean));
      const requested = new Set((pv.reviewRequests ?? []).map((r) => r.login).filter(Boolean));
      const toAssign = who.filter((u) => !assigned.has(u));
      const toReview = who.filter((u) => !requested.has(u));
      if (toAssign.length) gh(['pr', 'edit', pr, '-R', repo, '--add-assignee', toAssign.join(',')]);
      if (toReview.length) gh(['pr', 'edit', pr, '-R', repo, '--add-reviewer', toReview.join(',')]);
    }
    // 2) In-band note: ONE visible explanation so the ask isn't silent. Idempotent via a hidden marker.
    const marker = '<!-- human-approval-gate -->';
    const existing = gh(['pr', 'view', pr, '-R', repo, '--json', 'comments']) || '{}';
    if (!existing.includes(marker)) {
      const cc = who.length ? ` ${who.map((u) => `@${u}`).join(' ')}` : '';
      gh(['pr', 'comment', pr, '-R', repo, '--body', `${marker}\n⏳ **Maintainer approval required.**${cc} This PR touches human-required scope, so beyond \`ci\` + \`agent-review\` it needs a maintainer **Approve** on the current commit before it can merge. Re-approve after any new push (the gate is per-commit).`]);
    }
  }
}
