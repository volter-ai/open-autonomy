import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  breakGlassDescription,
  breakGlassQualifies,
  isMaintainerPermission,
  parseBreakGlass,
  type BreakGlassComment,
} from './break-glass-gate';

const HEAD = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const REASON = 'hotfix the dead ztrack loop-hook path (PR #225); no tracked issue';
// A permission oracle keyed by login — what the live gate resolves via repos/{repo}/collaborators/{login}/permission.
const permissionOf = (perms: Record<string, string>) => (login: string) => isMaintainerPermission(perms[login] ?? 'none');

describe('parseBreakGlass — the one authoritative command shape (bg/04, parsing)', () => {
  test('an explicit 40-hex SHA + a non-empty reason parses, SHA lowercased and reason captured verbatim', () => {
    expect(parseBreakGlass(`/agent break-glass ${HEAD} ${REASON}`)).toEqual({ sha: HEAD, reason: REASON });
    expect(parseBreakGlass(`/agent break-glass ${HEAD.toUpperCase()} ${REASON}`)).toEqual({ sha: HEAD, reason: REASON });
  });

  test('a missing or whitespace-only reason is rejected (bg/04 — break-glass must be on the record with a reason)', () => {
    for (const body of [
      `/agent break-glass ${HEAD}`,
      `/agent break-glass ${HEAD} `,
      `/agent break-glass ${HEAD}    `,
      `/agent break-glass ${HEAD}\t`,
    ]) {
      expect(parseBreakGlass(body)).toBeUndefined();
    }
  });

  test('a bare command, a short SHA, a non-hex SHA, or a wrong verb never parses', () => {
    for (const body of [
      '/agent break-glass',
      `/agent break-glass ${'a'.repeat(39)} reason`,
      `/agent break-glass ${'z'.repeat(40)} reason`,
      `/agent approve ${HEAD}`,
      `/agent breakglass ${HEAD} reason`,
      undefined,
    ]) {
      expect(parseBreakGlass(body)).toBeUndefined();
    }
  });

  test('whitespace is exact so the parser matches the workflow trigger (no leading trim, exact single space)', () => {
    expect(parseBreakGlass(`  /agent break-glass ${HEAD} ${REASON}`)).toBeUndefined();
    expect(parseBreakGlass(`/agent  break-glass ${HEAD} ${REASON}`)).toBeUndefined();
    expect(parseBreakGlass(`/AGENT break-glass ${HEAD} ${REASON}`)).toBeUndefined();
  });
});

describe('isMaintainerPermission — write+ only (same as human-approval-gate)', () => {
  test('write / maintain / admin qualify; read / triage / none / empty do not', () => {
    for (const perm of ['write', 'maintain', 'admin']) expect(isMaintainerPermission(perm)).toBe(true);
    for (const perm of ['read', 'triage', 'none', '']) expect(isMaintainerPermission(perm)).toBe(false);
  });
});

describe('breakGlassQualifies — maintainer + current head + reason, or refuse', () => {
  const command = (over: Partial<BreakGlassComment>): BreakGlassComment => ({
    body: `/agent break-glass ${HEAD} ${REASON}`,
    user: { login: 'alice' },
    ...over,
  });

  test('bg/01: a write+ maintainer on the exact current head qualifies, returning actor + reason', () => {
    for (const perm of ['write', 'maintain', 'admin']) {
      expect(breakGlassQualifies(command({}), HEAD, permissionOf({ alice: perm }))).toEqual({ login: 'alice', reason: REASON });
    }
    // the GraphQL author.{login} shape is also accepted
    expect(breakGlassQualifies(
      { body: `/agent break-glass ${HEAD} ${REASON}`, author: { login: 'alice' } },
      HEAD,
      permissionOf({ alice: 'admin' }),
    )).toEqual({ login: 'alice', reason: REASON });
  });

  test('bg/02: a non-maintainer (read-only collaborator) does NOT qualify — no matter the SHA/reason', () => {
    expect(breakGlassQualifies(command({ user: { login: 'mallory' } }), HEAD, permissionOf({ mallory: 'read' }))).toBeUndefined();
  });

  test('bg/02: an unreadable permission is treated as non-maintainer (fail-closed)', () => {
    // permissionOf defaults an unknown login to 'none' — the live gate maps an errored lookup to '' the same way.
    expect(breakGlassQualifies(command({ user: { login: 'ghost' } }), HEAD, permissionOf({}))).toBeUndefined();
  });

  test('bg/03: per-SHA — a break-glass bound to a stale/other SHA never covers the current head', () => {
    expect(breakGlassQualifies(
      { body: `/agent break-glass ${OTHER} ${REASON}`, user: { login: 'alice' } },
      HEAD,
      permissionOf({ alice: 'admin' }),
    )).toBeUndefined();
  });

  test('bg/04: a maintainer with an empty reason does NOT qualify', () => {
    expect(breakGlassQualifies({ body: `/agent break-glass ${HEAD}`, user: { login: 'alice' } }, HEAD, permissionOf({ alice: 'admin' }))).toBeUndefined();
  });
});

describe('breakGlassDescription — audit note, safely truncated to the 140-char status limit', () => {
  test('records the actor and reason', () => {
    expect(breakGlassDescription('alice', 'quick reason')).toBe('break-glass by @alice: quick reason');
  });

  test('a long reason is truncated with an ellipsis and never exceeds 140 chars', () => {
    const d = breakGlassDescription('alice', 'x'.repeat(400));
    expect(d.length).toBeLessThanOrEqual(140);
    expect(d.startsWith('break-glass by @alice: ')).toBe(true);
    expect(d.endsWith('…')).toBe(true);
  });
});

// The live gate: parses the triggering comment from GITHUB_EVENT_PATH, resolves the current head, verifies
// real permission, and posts agent-review=success ONLY when everything holds. Everything else posts NO status.
describe('break-glass gate — end-to-end status posting (bg/01–bg/04, bg/06 privilege posture)', () => {
  const runGate = (opts: {
    head: string;
    permission: string;
    commentBody: string;
    login?: string;
    action?: string;
    isPr?: boolean;
  }): { status: number | null; log: string; stdout: string; stderr: string } => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-break-glass-'));
    const gh = join(dir, 'gh');
    const log = join(dir, 'gh.log');
    const eventPath = join(dir, 'event.json');
    writeFileSync(log, ''); // some refusals exit before any gh call, so ensure the log always exists
    writeFileSync(gh, `#!/usr/bin/env bash
set -eu
printf '%s\\n' "$*" >> "$GH_LOG"
case "$*" in
  *"--json headRefOid,state"*) printf '{"headRefOid":"%s","state":"OPEN"}\\n' "$GH_HEAD" ;;
  *"/permission"*) printf '%s\\n' "$GH_PERMISSION" ;;
  *) printf '\\n' ;;
esac
`);
    chmodSync(gh, 0o755);
    writeFileSync(eventPath, JSON.stringify({
      action: opts.action ?? 'created',
      issue: (opts.isPr ?? true) ? { number: 42, pull_request: { url: 'x' } } : { number: 42 },
      comment: { id: 7, body: opts.commentBody, user: { login: opts.login ?? 'alice' } },
    }));
    try {
      const run = spawnSync(process.execPath, [join(import.meta.dir, 'break-glass-gate.ts')], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH}`,
          GH_LOG: log,
          GH_HEAD: opts.head,
          GH_PERMISSION: opts.permission,
          GITHUB_REPOSITORY: 'acme/repo',
          GITHUB_EVENT_PATH: eventPath,
          PR_NUMBER: '42',
        },
      });
      return { status: run.status, log: readFileSync(log, 'utf8'), stdout: run.stdout, stderr: run.stderr };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  test('bg/01: maintainer + valid command on the current head posts agent-review=success on that head', () => {
    const run = runGate({ head: HEAD, permission: 'admin', commentBody: `/agent break-glass ${HEAD} ${REASON}` });
    expect(run.status).toBe(0);
    expect(run.log).toContain(`statuses/${HEAD}`);
    expect(run.log).toContain('state=success');
    expect(run.log).toContain('context=agent-review');
    expect(run.stdout).toContain('agent-review=success');
  });

  test('bg/02: a non-maintainer comment posts NO status and is recorded as refused on stderr', () => {
    const run = runGate({ head: HEAD, permission: 'read', login: 'mallory', commentBody: `/agent break-glass ${HEAD} ${REASON}` });
    expect(run.status).toBe(0);
    expect(run.log).not.toContain('state=success');
    expect(run.log).not.toContain(`statuses/${HEAD}`);
    expect(run.stderr).toContain('refused');
  });

  test('bg/03: a stale/wrong SHA (current head advanced) posts NO status and is refused', () => {
    // Command names OTHER, but the PR's current head is HEAD — the stale break-glass must not cover it.
    const run = runGate({ head: HEAD, permission: 'admin', commentBody: `/agent break-glass ${OTHER} ${REASON}` });
    expect(run.status).toBe(0);
    expect(run.log).not.toContain('state=success');
    expect(run.stderr).toContain('not the current head');
  });

  test('bg/04: an empty reason posts NO status (rejected before any permission lookup)', () => {
    const run = runGate({ head: HEAD, permission: 'admin', commentBody: `/agent break-glass ${HEAD}` });
    expect(run.status).toBe(0);
    expect(run.log).not.toContain('state=success');
    expect(run.log).not.toContain('/permission'); // rejected on parse, before spending a permission call
    expect(run.stderr).toContain('refused');
  });

  test('a non-PR comment (issue only) posts NO status', () => {
    const run = runGate({ head: HEAD, permission: 'admin', commentBody: `/agent break-glass ${HEAD} ${REASON}`, isPr: false });
    expect(run.status).toBe(0);
    expect(run.log).not.toContain('state=success');
  });
});

// BREAK_GLASS_RE is DUPLICATED by design: the code-host gate (break-glass-gate.ts) and finalize
// (finalize-agent-review.ts) each own a copy, and finalize is MIRRORED into a generic runtime that cannot
// import the code-host gate script (packages/substrate-github/src/runtime/finalize-agent-review.ts) — so the
// literal lives in three places. If they drift, a break-glass comment could be honored by one side and
// rejected by the other (an agent-review posted that finalize won't re-accept, or vice versa), silently
// breaking the audited bypass. This guard reads every file that defines BREAK_GLASS_RE, extracts the regex
// LITERAL SOURCE, and asserts all copies are byte-identical. It fails if someone edits one copy and not the
// rest — the sync obligation is enforced here, not left to reviewer vigilance.
describe('BREAK_GLASS_RE — the duplicated literal stays byte-identical across all definers (drift guard)', () => {
  // Every file that defines BREAK_GLASS_RE. Keep in lockstep with the copies (scripts/finalize + its runtime
  // mirror). Paths are relative to the repo root (scripts/'s parent).
  const REPO_ROOT = join(import.meta.dir, '..');
  const DEFINERS = [
    'scripts/break-glass-gate.ts',
    'scripts/finalize-agent-review.ts',
    'packages/substrate-github/src/runtime/finalize-agent-review.ts',
  ];

  // Extract the regex LITERAL SOURCE from a single-line `[export] const BREAK_GLASS_RE = /…/flags;`
  // definition. The greedy `.*` runs to the last `/`+flags before the trailing `;`, so an escaped `\/`
  // inside the pattern (there is one) is captured verbatim rather than mistaken for the closing delimiter.
  const extractRegexSource = (src: string): string | undefined => {
    const m = src.match(/\bBREAK_GLASS_RE\s*=\s*(\/.*\/[a-z]*)\s*;/);
    return m?.[1];
  };

  const sources = DEFINERS.map((rel) => ({
    rel,
    literal: extractRegexSource(readFileSync(join(REPO_ROOT, rel), 'utf8')),
  }));

  test('every listed file actually defines BREAK_GLASS_RE (a removed/renamed copy fails loudly)', () => {
    for (const { rel, literal } of sources) {
      expect(literal, `no BREAK_GLASS_RE literal found in ${rel} — did it move or get renamed?`).toBeDefined();
    }
    // Sanity-check the extractor against the known shape, so a broken extractor can't make everything
    // trivially "equal" by extracting nothing/garbage.
    expect(sources[0].literal).toBe(String.raw`/^\/agent break-glass ([0-9a-fA-F]{40})\s+(.+\S)$/`);
  });

  test('all copies are byte-identical', () => {
    const canonical = sources[0];
    for (const other of sources.slice(1)) {
      expect(other.literal, `BREAK_GLASS_RE drift: ${other.rel} != ${canonical.rel}`).toBe(canonical.literal);
    }
    // A single distinct-value assertion too, so the failure message shows the whole set on drift.
    expect(new Set(sources.map((s) => s.literal)).size).toBe(1);
  });
});
