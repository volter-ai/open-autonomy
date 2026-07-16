#!/usr/bin/env bun
// The `break-glass` gate — a maintainer's DELIBERATE, AUDITED path past the required `agent-review` check
// for a direct fix PR that has no linked issue (framework issue #234). Normal work flows through a tracked
// issue and stays the default; this is the recorded exception, not a way around it.
//
// A maintainer comments `/agent break-glass <head-sha> <reason>` on the PR. This gate posts
// `agent-review=success` on the CURRENT head SHA — with an audit note recording the actor + reason — ONLY
// when ALL hold:
//   (a) the commenter has REAL repo write+ permission (admin/write/maintain via the permissions API — the
//       exact check human-approval-gate.ts uses; author_association is NEVER consulted: under a bot token an
//       org member shows as CONTRIBUTOR and a read-only collaborator must not clear a security gate);
//   (b) the explicit 40-hex SHA in the command equals the PR's current head (per-SHA — a new push re-opens
//       the gate, so a stale break-glass never covers unseen code — mirroring `/agent approve <sha>`);
//   (c) the reason is non-empty.
// Anything else — non-maintainer, unreadable permission, stale/wrong SHA, missing reason — changes NO
// status and is logged to stderr as a refusal. Fail-closed everywhere.
//
// It NEVER touches PR code (the workflow runs default-branch code, never checks out the PR) and NEVER
// weakens `human-approval`, which independently continues to require the maintainer's exact-head
// authorization: break-glass clears ONLY agent-review, never the human sign-off gate.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// The one authoritative command shape: `/agent break-glass <40-hex head sha> <non-empty reason>`. Whitespace
// is exact (no leading/trailing trim) so the parser matches the workflow's `startsWith('/agent break-glass ')`
// trigger — the same strictness /agent approve uses. `(.+\S)$` requires a real, single-line reason and (with
// no `m` flag) anchors to the end of the body, so an empty or whitespace-only reason fails to parse (bg/04).
export const BREAK_GLASS_RE = /^\/agent break-glass ([0-9a-fA-F]{40})\s+(.+\S)$/;

/** Parse only the explicit, full-SHA command carrying a non-empty reason. Returns undefined otherwise. */
export function parseBreakGlass(body: string | undefined): { sha: string; reason: string } | undefined {
  const m = body?.match(BREAK_GLASS_RE);
  if (!m) return undefined;
  return { sha: m[1].toLowerCase(), reason: m[2] };
}

// Which repo permissions count as maintainer (write+) for the gate — identical to human-approval-gate.ts.
export const isMaintainerPermission = (perm: string): boolean =>
  perm === 'admin' || perm === 'write' || perm === 'maintain';

export type BreakGlassComment = { id?: number; body?: string; user?: { login?: string }; author?: { login?: string } };

/**
 * A break-glass comment clears agent-review ONLY when it parses, its SHA is the current head, and its author
 * still has write+ permission. Returns the actor login + reason for the audit note, or undefined to refuse.
 */
export function breakGlassQualifies(
  command: BreakGlassComment,
  headSha: string,
  isMaintainer: (login: string) => boolean,
): { login: string; reason: string } | undefined {
  const parsed = parseBreakGlass(command.body);
  if (!parsed) return undefined;
  if (parsed.sha !== headSha.toLowerCase()) return undefined; // per-SHA: stale/wrong SHA never covers this head
  const login = command.user?.login ?? command.author?.login ?? '';
  if (!login || !isMaintainer(login)) return undefined;
  return { login, reason: parsed.reason };
}

/** The audit description posted on the agent-review status, truncated to stay within GitHub's 140-char limit. */
export function breakGlassDescription(login: string, reason: string, max = 140): string {
  const prefix = `break-glass by @${login}: `;
  const room = max - prefix.length;
  if (room <= 0) return prefix.slice(0, max);
  const trimmed = reason.length > room ? `${reason.slice(0, Math.max(0, room - 1))}…` : reason;
  return `${prefix}${trimmed}`.slice(0, max);
}

if (import.meta.main) {
  const repo = process.env.GITHUB_REPOSITORY;
  const pr = process.env.PR_NUMBER;
  if (!repo || !pr) {
    process.stderr.write('break-glass: missing GITHUB_REPOSITORY/PR_NUMBER — skipping\n');
    process.exit(0);
  }
  const gh = (args: string[]): string => {
    try {
      return execFileSync('gh', args, { encoding: 'utf8' }).trim();
    } catch (e) {
      process.stderr.write(`break-glass: gh ${args.join(' ')} failed: ${e instanceof Error ? e.message : String(e)}\n`);
      return '';
    }
  };

  // The triggering comment is authoritative. The workflow already filters to PR comments beginning with the
  // command; this second check keeps the gate fail-closed if it is ever invoked with a non-PR / deleted event.
  const readEvent = (): { action?: string; isPr: boolean; comment?: BreakGlassComment } | undefined => {
    const p = process.env.GITHUB_EVENT_PATH;
    if (!p) return undefined;
    try {
      const event = JSON.parse(readFileSync(p, 'utf8')) as {
        action?: string;
        issue?: { pull_request?: unknown };
        comment?: BreakGlassComment;
      };
      return { action: event.action, isPr: Boolean(event.issue?.pull_request), comment: event.comment };
    } catch (e) {
      process.stderr.write(`break-glass: could not read event (${e instanceof Error ? e.message : String(e)})\n`);
      return undefined;
    }
  };

  const event = readEvent();
  if (!event || !event.isPr) {
    process.stderr.write('break-glass: not a PR comment event — no status posted\n');
    process.exit(0);
  }
  if (event.action === 'deleted') {
    process.stderr.write('break-glass: triggering comment was deleted — no status posted\n');
    process.exit(0);
  }
  const parsed = parseBreakGlass(event.comment?.body);
  if (!parsed) {
    // Covers a missing/empty reason and any malformed command (bg/04) — a break-glass must be on the record
    // with a stated reason and an explicit head SHA.
    process.stderr.write('break-glass: comment is not a valid `/agent break-glass <head-sha> <reason>` command (empty reason or malformed) — refused, no status posted\n');
    process.exit(0);
  }

  const view = JSON.parse(gh(['pr', 'view', pr, '-R', repo, '--json', 'headRefOid,state']) || '{}') as {
    headRefOid?: string;
    state?: string;
  };
  const headSha = view.headRefOid;
  if (!headSha) {
    process.stderr.write('break-glass: could not resolve current head SHA — refused, no status posted\n');
    process.exit(0);
  }

  // Real repo permission is the ONLY maintainer signal (see the header note). Fail-closed: an unreadable
  // lookup (gh() maps failure to '') resolves to non-maintainer.
  const permissionCache = new Map<string, boolean>();
  const isMaintainer = (login: string): boolean => {
    if (!login) return false;
    if (permissionCache.has(login)) return permissionCache.get(login)!;
    const perm = gh(['api', `repos/${repo}/collaborators/${login}/permission`, '--jq', '.permission']);
    const result = isMaintainerPermission(perm);
    permissionCache.set(login, result);
    return result;
  };

  const qualified = breakGlassQualifies(event.comment ?? {}, headSha, isMaintainer);
  if (!qualified) {
    const login = event.comment?.user?.login ?? event.comment?.author?.login ?? '(unknown)';
    if (parsed.sha !== headSha.toLowerCase()) {
      process.stderr.write(`break-glass: refused — command SHA ${parsed.sha} is not the current head ${headSha.toLowerCase()} (a new push re-opens the gate); no status posted\n`);
    } else {
      process.stderr.write(`break-glass: refused — @${login} is not a repo maintainer (write+ required; unreadable permission is treated as non-maintainer); no status posted\n`);
    }
    process.exit(0);
  }

  const description = breakGlassDescription(qualified.login, qualified.reason);
  gh(['api', '-X', 'POST', `repos/${repo}/statuses/${headSha}`, '-f', 'state=success', '-f', 'context=agent-review', '-f', `description=${description}`]);
  process.stdout.write(`break-glass: agent-review=success on ${headSha.slice(0, 7)} by @${qualified.login} — ${qualified.reason}\n`);
}
