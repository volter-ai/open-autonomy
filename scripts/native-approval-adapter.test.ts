import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  applyNativeApproval,
  resolveNativeApprovalBinding,
  type GhApi,
} from './native-approval-adapter';

const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);

function fixture(overrides: {
  author?: string;
  actor?: string;
  permission?: string;
  status?: string;
  initialReviews?: unknown[];
  afterHead?: string;
  recordApproval?: boolean;
} = {}): { api: GhApi; calls: string[][] } {
  const calls: string[][] = [];
  let posted = false;
  let pullReads = 0;
  const actor = overrides.actor ?? 'approval-bot';
  const api: GhApi = (token, args) => {
    calls.push([token, ...args]);
    const path = args.find((arg) => arg.startsWith('repos/')) ?? '';
    if (args[1] === 'user') return JSON.stringify({ login: actor });
    if (path.endsWith(`/collaborators/${actor}/permission`)) {
      return JSON.stringify({ permission: overrides.permission ?? 'write' });
    }
    if (path.endsWith(`/commits/${SHA}/status`)) {
      return JSON.stringify({ statuses: [{ context: 'agent-review', state: overrides.status ?? 'success' }] });
    }
    if (path === 'repos/acme/repo/pulls/42') {
      pullReads++;
      return JSON.stringify({ number: 42, state: 'open', draft: false,
        head: { sha: pullReads > 1 ? overrides.afterHead ?? SHA : SHA }, user: { login: overrides.author ?? 'author-bot' } });
    }
    if (path.endsWith('/pulls/42/reviews?per_page=100')) {
      const reviews = [...(overrides.initialReviews ?? [])];
      if (posted && overrides.recordApproval !== false) {
        reviews.push({ state: 'APPROVED', commit_id: SHA, user: { login: actor } });
      }
      return JSON.stringify(reviews);
    }
    if (args.includes('POST') && path.endsWith('/pulls/42/reviews')) { posted = true; return '{}'; }
    throw new Error(`unexpected API call: ${args.join(' ')}`);
  };
  return { api, calls };
}

const run = (api: GhApi, over: Partial<Parameters<typeof applyNativeApproval>[0]> = {}) => applyNativeApproval({
  repo: 'acme/repo', pr: 42, sha: SHA, readToken: 'read-token', approvalToken: 'approval-token', ...over,
}, api);

describe('native approval exact binding', () => {
  test('accepts only an approved standard reviewer artifact and binds its exact PR + SHA', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-native-approval-'));
    const result = join(dir, 'result.json');
    try {
      writeFileSync(result, JSON.stringify({ schema: 'open-autonomy.review.v1', pr: 42, headSha: SHA,
        verdict: 'success', outcome: 'approved', summary: 'pass', findings: [], humanApprovalRequired: false }));
      expect(resolveNativeApprovalBinding({ resultPath: result })).toEqual({ pr: 42, sha: SHA });
      expect(() => resolveNativeApprovalBinding({ resultPath: result, expectedPr: '43', expectedSha: SHA }))
        .toThrow('does not match');
      writeFileSync(result, JSON.stringify({ schema: 'open-autonomy.review.v1', pr: 42, headSha: SHA,
        verdict: 'failure', outcome: 'changes-requested', summary: 'fail', findings: [], humanApprovalRequired: false }));
      expect(() => resolveNativeApprovalBinding({ resultPath: result })).toThrow('not an approved success');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('manual retry requires one complete exact binding', () => {
    expect(resolveNativeApprovalBinding({ expectedPr: '42', expectedSha: SHA })).toEqual({ pr: 42, sha: SHA });
    expect(() => resolveNativeApprovalBinding({ expectedPr: '42' })).toThrow('supplied together');
    expect(() => resolveNativeApprovalBinding({ expectedPr: '42', expectedSha: 'short' })).toThrow('full head SHA');
  });
});

describe('native approval identity and control separation', () => {
  test('a distinct write+ actor materializes the native review only after agent-review success', () => {
    const { api, calls } = fixture();
    expect(run(api)).toEqual({ outcome: 'approved', actor: 'approval-bot' });
    expect(calls.some((call) => call.includes('POST') && call.some((arg) => arg.endsWith('/pulls/42/reviews')))).toBe(true);
    expect(calls.some((call) => call.some((arg) => arg.includes('/statuses/')))).toBe(false);
    expect(calls.some((call) => call.some((arg) => arg.includes('human-approval')))).toBe(false);
  });

  test('missing, self, or insufficient approval identity fails closed before posting', () => {
    const missing = fixture();
    expect(() => run(missing.api, { approvalToken: '' })).toThrow('is not configured');
    const self = fixture({ author: 'approval-bot' });
    expect(() => run(self.api)).toThrow('cannot approve its own PR');
    const unauthorized = fixture({ permission: 'read' });
    expect(() => run(unauthorized.api)).toThrow("has 'read' permission");
    for (const f of [missing, self, unauthorized]) expect(f.calls.some((call) => call.includes('POST'))).toBe(false);
  });

  test('a revoked or unreadable configured identity fails with actionable context', () => {
    const { api: base, calls } = fixture();
    const revoked: GhApi = (token, args) => {
      if (args[1] === 'user') throw new Error('HTTP 401 Bad credentials');
      return base(token, args);
    };
    expect(() => run(revoked)).toThrow('resolving configured approval identity failed');
    expect(calls.some((call) => call.includes('POST'))).toBe(false);
  });

  test('an attempt before authoritative agent-review success fails closed', () => {
    for (const status of ['pending', 'failure']) {
      const { api, calls } = fixture({ status });
      expect(() => run(api)).toThrow('agent-review is not successful');
      expect(calls.some((call) => call.includes('POST'))).toBe(false);
    }
  });

  test('an exact-head approval by the configured actor is idempotent', () => {
    const { api, calls } = fixture({ initialReviews: [{ state: 'APPROVED', commit_id: SHA, user: { login: 'approval-bot' } }] });
    expect(run(api)).toEqual({ outcome: 'already-approved', actor: 'approval-bot' });
    expect(calls.some((call) => call.includes('POST'))).toBe(false);
  });
});

describe('native approval race and fan-out regressions', () => {
  test('a stale head before the attempt fails without posting', () => {
    const { api, calls } = fixture();
    expect(() => run(api, { sha: OTHER_SHA })).toThrow('closed, draft, or no longer');
    expect(calls.some((call) => call.includes('POST'))).toBe(false);
  });

  test('a concurrent head change after posting is detected and fails', () => {
    const { api } = fixture({ afterHead: OTHER_SHA });
    expect(() => run(api)).toThrow('changed while approval was being recorded');
  });

  test('an unrecorded review fails closed', () => {
    const { api } = fixture({ recordApproval: false });
    expect(() => run(api)).toThrow('did not record');
  });

  test('only the supplied PR is queried — duplicate-SHA PR discovery/fan-out is impossible', () => {
    const { api, calls } = fixture();
    run(api);
    expect(calls.every((call) => !call.includes('pr') && !call.includes('list'))).toBe(true);
    const pullPaths = calls.flat().filter((arg) => arg.includes('/pulls/'));
    expect(pullPaths.every((path) => path.includes('/pulls/42'))).toBe(true);
  });
});
