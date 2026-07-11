// TF.1 acceptance tests — packages/local-runner-cli/src/m6-signal.ts. Run via `bun run check:core`
// (`bun test packages/*/src/*.test.ts`), cwd = repo root, so `profiles/<name>` paths below are
// repo-root-relative — same convention as board-readiness.test.ts / setup-pack.test.ts.
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { missionAdvancingSignal } from './m6-signal.ts';
import { StubProc, fail, ok } from './test-support/stub-proc.ts';

const CWD = '/fake/install';

// A merged PR whose statusCheckRollup carries every context in `pass` as SUCCESS, nothing else.
function rollupAllPass(names: string[]): string {
  return JSON.stringify(names.map((n) => ({ context: n, state: 'SUCCESS' })));
}

// --- profileDir / pack resolution -------------------------------------------------------------------------

describe('missionAdvancingSignal — pack resolution (never guesses)', () => {
  test('no ctx.profileDir -> unverifiable', async () => {
    const s = await missionAdvancingSignal(CWD, {});
    expect(s.present).toBe(false);
    expect(s.evidence).toMatch(/unverifiable: no ctx\.profileDir/);
  });

  test('profileDir with no setup-pack.yml -> unverifiable', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'm6-nopack-'));
    try {
      const s = await missionAdvancingSignal(CWD, { profileDir: dir });
      expect(s.present).toBe(false);
      expect(s.evidence).toMatch(/unverifiable:.*setup-pack\.yml/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('setup-pack.yml missing maturity_signals.m6_signal -> unverifiable', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'm6-incomplete-'));
    try {
      writeFileSync(join(dir, 'setup-pack.yml'), 'landing_mode: auto-merge\n');
      const s = await missionAdvancingSignal(CWD, { profileDir: dir });
      expect(s.present).toBe(false);
      expect(s.evidence).toMatch(/unverifiable:.*setup-pack\.yml/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('PR-based pack but no provision.json required_checks -> unverifiable', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'm6-norequired-'));
    try {
      writeFileSync(join(dir, 'setup-pack.yml'), 'landing_mode: auto-merge\nmaturity_signals:\n  m4_predicate: gh-issues\n  m6_signal: pr-close\n');
      const s = await missionAdvancingSignal(CWD, { profileDir: dir });
      expect(s.present).toBe(false);
      expect(s.evidence).toMatch(/unverifiable:.*provision\.json/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('PR-based pack, required_checks present, but no m4_predicate -> unverifiable', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'm6-nom4-'));
    try {
      writeFileSync(join(dir, 'setup-pack.yml'), 'landing_mode: auto-merge\nmaturity_signals:\n  m6_signal: pr-close\n');
      writeFileSync(join(dir, 'provision.json'), JSON.stringify({ branch_protection: { required_checks: ['ci'] } }));
      const s = await missionAdvancingSignal(CWD, { profileDir: dir });
      expect(s.present).toBe(false);
      expect(s.evidence).toMatch(/unverifiable:.*m4_predicate/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// --- pr-free leg (simple-sdlc: landing_mode=pr-free, no merged PR exists on this profile at all) -----------

describe('missionAdvancingSignal — pr-free leg (simple-sdlc: ztrack done + AC-evidence trace)', () => {
  test('a done item whose AC-evidence trace is green -> true, evidence cites the exit-0 check', async () => {
    const stub = new StubProc().onArgs('npx', ['ztrack', 'check', 'SUP-1'], () => ok('all checks passed'));
    const s = await missionAdvancingSignal(CWD, { profileDir: 'profiles/simple-sdlc', workItemId: 'SUP-1', proc: stub.runner });
    expect(s.present).toBe(true);
    expect(s.evidence).toMatch(/SUP-1.*AC-evidence trace green/);
  });

  test('a done item with no evidence (ztrack check fails) -> false, evidence cites the failure', async () => {
    const stub = new StubProc().onArgs('npx', ['ztrack', 'check', 'SUP-2'], () => fail('checked_ac_no_evidence', 1));
    const s = await missionAdvancingSignal(CWD, { profileDir: 'profiles/simple-sdlc', workItemId: 'SUP-2', proc: stub.runner });
    expect(s.present).toBe(false);
    expect(s.evidence).toMatch(/SUP-2/);
    expect(s.evidence).toMatch(/checked_ac_no_evidence/);
  });

  test('no done item at all -> false, "nothing to prove M6 against yet"', async () => {
    const stub = new StubProc().onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'done'], () => ok('[]'));
    const s = await missionAdvancingSignal(CWD, { profileDir: 'profiles/simple-sdlc', proc: stub.runner });
    expect(s.present).toBe(false);
    expect(s.evidence).toMatch(/nothing to prove M6/);
  });

  test('board scan: first done item fails, second passes -> true, citing the second', async () => {
    const stub = new StubProc()
      .onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'done'], () => ok(JSON.stringify([{ identifier: 'SUP-3' }, { identifier: 'SUP-4' }])))
      .onArgs('npx', ['ztrack', 'check', 'SUP-3'], () => fail('checked_ac_no_evidence', 1))
      .onArgs('npx', ['ztrack', 'check', 'SUP-4'], () => ok('all checks passed'));
    const s = await missionAdvancingSignal(CWD, { profileDir: 'profiles/simple-sdlc', proc: stub.runner });
    expect(s.present).toBe(true);
    expect(s.evidence).toMatch(/SUP-4/);
  });
});

// --- gh-issues board — roadmap-rollup (self-driving) --------------------------------------------------------

const SELF_DRIVING_REPO = 'volter-ai/open-autonomy';
const SELF_DRIVING_CHECKS = ['ci', 'agent-review', 'security', 'human-approval'];

function stubRepoView(stub: StubProc, repo = SELF_DRIVING_REPO): StubProc {
  return stub.onArgs('gh', ['repo', 'view', '--json', 'nameWithOwner'], () => ok(repo));
}

describe('missionAdvancingSignal — gh-issues board, roadmap-rollup linkage (self-driving)', () => {
  test('REAL NEGATIVE #1 (this repo\'s own history, issue #114/PR #118): roadmap-linked but the current required "security" check is MISSING at merge time -> false', async () => {
    const stub = stubRepoView(new StubProc())
      .onArgs('gh', ['issue', 'view', '114'], () => ok(JSON.stringify({ number: 114, state: 'CLOSED', labels: [{ name: 'roadmap:phase-3' }, { name: 'roadmap:pm-proactive-backlog' }], body: '' })))
      .on(
        (c, a) => c === 'gh' && a[0] === 'pr' && a[1] === 'list' && a.includes('agent/issue-114'),
        () => ok(JSON.stringify([{ number: 118, headRefOid: 'ef1f12654ad26bc8297cb765e2beb13a708fb7f6', statusCheckRollup: [{ context: 'ci', state: 'SUCCESS' }, { context: 'agent-review', state: 'SUCCESS' }, { context: 'human-approval', state: 'SUCCESS' }] }])),
      );
    const s = await missionAdvancingSignal(CWD, { profileDir: 'profiles/self-driving', workItemId: '114', proc: stub.runner });
    expect(s.present).toBe(false);
    expect(s.evidence).toMatch(/gate FAILED/);
    expect(s.evidence).toMatch(/security=MISSING/);
    expect(s.evidence).toMatch(/linkage PRESENT/);
  });

  test('REAL NEGATIVE #2 (this repo\'s own history, issue #132/PR #133): gate-complete (all 4 checks pass) but NOT roadmap-linked -> false', async () => {
    const stub = stubRepoView(new StubProc())
      .onArgs('gh', ['issue', 'view', '132'], () => ok(JSON.stringify({ number: 132, state: 'CLOSED', labels: [], body: '' })))
      .on(
        (c, a) => c === 'gh' && a[0] === 'pr' && a[1] === 'list' && a.includes('agent/issue-132'),
        () => ok(JSON.stringify([{ number: 133, headRefOid: 'abcdefabcdefabcdefabcdefabcdefabcdefabcd', statusCheckRollup: SELF_DRIVING_CHECKS.map((n) => ({ context: n, state: 'SUCCESS' })) }])),
      );
    const s = await missionAdvancingSignal(CWD, { profileDir: 'profiles/self-driving', workItemId: '132', proc: stub.runner });
    expect(s.present).toBe(false);
    expect(s.evidence).toMatch(/gate PASSED/);
    expect(s.evidence).toMatch(/linkage ABSENT/);
    expect(s.evidence).toMatch(/no roadmap:<id> label/);
  });

  test('TRUE (fixture — no real history instance exists yet, see PR body): gate-complete AND roadmap-linked -> true', async () => {
    const stub = stubRepoView(new StubProc())
      .onArgs('gh', ['issue', 'view', '999'], () => ok(JSON.stringify({ number: 999, state: 'CLOSED', labels: [{ name: 'roadmap:phase-99' }, { name: 'roadmap:fixture-item' }], body: '' })))
      .on(
        (c, a) => c === 'gh' && a[0] === 'pr' && a[1] === 'list' && a.includes('agent/issue-999'),
        () => ok(JSON.stringify([{ number: 1000, headRefOid: '1111111111111111111111111111111111111a', statusCheckRollup: SELF_DRIVING_CHECKS.map((n) => ({ context: n, state: 'SUCCESS' })) }])),
      );
    const s = await missionAdvancingSignal(CWD, { profileDir: 'profiles/self-driving', workItemId: '999', proc: stub.runner });
    expect(s.present).toBe(true);
    expect(s.evidence).toMatch(/gate PASSED/);
    expect(s.evidence).toMatch(/linkage PRESENT/);
    expect(s.evidence).toMatch(/roadmap:fixture-item/);
  });

  test('a `roadmap:phase-N` label ALONE does not count as linkage (mirrors github-sync.ts\'s own phase-label skip)', async () => {
    const stub = stubRepoView(new StubProc())
      .onArgs('gh', ['issue', 'view', '77'], () => ok(JSON.stringify({ number: 77, state: 'CLOSED', labels: [{ name: 'roadmap:phase-4' }], body: '' })))
      .on(
        (c, a) => c === 'gh' && a[0] === 'pr' && a[1] === 'list' && a.includes('agent/issue-77'),
        () => ok(JSON.stringify([{ number: 78, headRefOid: '2222222222222222222222222222222222222b', statusCheckRollup: SELF_DRIVING_CHECKS.map((n) => ({ context: n, state: 'SUCCESS' })) }])),
      );
    const s = await missionAdvancingSignal(CWD, { profileDir: 'profiles/self-driving', workItemId: '77', proc: stub.runner });
    expect(s.present).toBe(false);
    expect(s.evidence).toMatch(/linkage ABSENT/);
  });

  test('REAL NEGATIVE #3 (this repo\'s own history shape, e.g. issues #4/#5/#8/#9/#14/#15: "Shipped — closing per roadmap reconciliation"): closed roadmap issue with NO merged PR behind it at all -> false, names the weak-proxy failure mode', async () => {
    const stub = stubRepoView(new StubProc())
      .onArgs('gh', ['issue', 'view', '15'], () => ok(JSON.stringify({ number: 15, state: 'CLOSED', labels: [{ name: 'roadmap:maintainer-governance' }], body: '' })))
      .on(
        (c, a) => c === 'gh' && a[0] === 'pr' && a[1] === 'list' && a.includes('agent/issue-15'),
        () => ok('[]'),
      )
      .onArgs('gh', ['issue', 'view', '15', '-R', SELF_DRIVING_REPO, '--json', 'comments'], () => ok(JSON.stringify({ comments: [{ body: 'Shipped — closing per roadmap reconciliation.' }] })));
    const s = await missionAdvancingSignal(CWD, { profileDir: 'profiles/self-driving', workItemId: '15', proc: stub.runner });
    expect(s.present).toBe(false);
    expect(s.evidence).toMatch(/no merged PR was found closing it/);
    expect(s.evidence).toMatch(/weak-proxy/);
  });

  test('reconcile-comment fallback: no agent/issue-<n> branch found, but the reconcile sweep\'s "Resolved by #N (merged)" comment names the PR -> resolved via the fallback', async () => {
    const stub = stubRepoView(new StubProc())
      .onArgs('gh', ['issue', 'view', '55'], () => ok(JSON.stringify({ number: 55, state: 'CLOSED', labels: [{ name: 'roadmap:fallback-item' }], body: '' })))
      .on(
        (c, a) => c === 'gh' && a[0] === 'pr' && a[1] === 'list' && a.includes('agent/issue-55'),
        () => ok('[]'),
      )
      .onArgs('gh', ['issue', 'view', '55', '-R', SELF_DRIVING_REPO, '--json', 'comments'], () => ok(JSON.stringify({ comments: [{ body: 'Resolved by #56 (merged). Closed by the deterministic reconcile.' }] })))
      .onArgs('gh', ['pr', 'view', '56'], () => ok(JSON.stringify({ number: 56, headRefOid: '3333333333333333333333333333333333333c', statusCheckRollup: SELF_DRIVING_CHECKS.map((n) => ({ context: n, state: 'SUCCESS' })) })));
    const s = await missionAdvancingSignal(CWD, { profileDir: 'profiles/self-driving', workItemId: '55', proc: stub.runner });
    expect(s.present).toBe(true);
    expect(s.evidence).toMatch(/PR #56/);
  });

  test('gh unauthenticated on repo view -> unverifiable, never a guessed verdict', async () => {
    const stub = new StubProc().onArgs('gh', ['repo', 'view'], () => fail('gh: To use GitHub CLI in a GitHub Actions workflow, set the GH_TOKEN... not logged in to github.com', 1));
    const s = await missionAdvancingSignal(CWD, { profileDir: 'profiles/self-driving', workItemId: '1', proc: stub.runner });
    expect(s.present).toBe(false);
    expect(s.evidence).toMatch(/^unverifiable: gh not authenticated/);
  });

  test('gh unauthenticated mid-scan (on issue view) -> unverifiable, scan aborts rather than reporting a false negative', async () => {
    const stub = stubRepoView(new StubProc()).onArgs('gh', ['issue', 'view', '1'], () => fail('HTTP 401: Bad credentials (not logged in)', 1));
    const s = await missionAdvancingSignal(CWD, { profileDir: 'profiles/self-driving', workItemId: '1', proc: stub.runner });
    expect(s.present).toBe(false);
    expect(s.evidence).toMatch(/^unverifiable: gh not authenticated/);
  });

  test('a bare 404 on the closing-PR branch lookup is NOT read as a hard negative by itself — falls through to the comment fallback, then genuinely reports "no merged PR"', async () => {
    // (KNOWN GITHUB FACT guard: admin-ish 404s must be distinguished from a real negative; here the 404 is
    // simply "gh pr list found nothing", which the code already treats as "try the fallback" — this test
    // pins that a non-auth failure never short-circuits into unverifiable, it degrades to the next probe.)
    const stub = stubRepoView(new StubProc())
      .onArgs('gh', ['issue', 'view', '200'], () => ok(JSON.stringify({ number: 200, state: 'CLOSED', labels: [], body: '' })))
      .on(
        (c, a) => c === 'gh' && a[0] === 'pr' && a[1] === 'list' && a.includes('agent/issue-200'),
        () => fail('HTTP 404: Not Found', 1),
      )
      .onArgs('gh', ['issue', 'view', '200', '-R', SELF_DRIVING_REPO, '--json', 'comments'], () => ok(JSON.stringify({ comments: [] })));
    const s = await missionAdvancingSignal(CWD, { profileDir: 'profiles/self-driving', workItemId: '200', proc: stub.runner });
    expect(s.present).toBe(false);
    expect(s.evidence).toMatch(/no merged PR was found closing it/);
  });

  test('board scan (no workItemId): most-recently-closed first, skips a non-qualifying issue, finds a qualifying one', async () => {
    const stub = stubRepoView(new StubProc())
      .onArgs('gh', ['issue', 'list', '-R', SELF_DRIVING_REPO, '--state', 'closed'], () =>
        ok(JSON.stringify([
          { number: 301, closedAt: '2026-07-01T00:00:00Z' },
          { number: 302, closedAt: '2026-07-02T00:00:00Z' },
        ])),
      )
      // 302 is the most-recently-closed -> checked first, and it does NOT qualify (no roadmap label).
      .onArgs('gh', ['issue', 'view', '302'], () => ok(JSON.stringify({ number: 302, state: 'CLOSED', labels: [], body: '' })))
      .on(
        (c, a) => c === 'gh' && a[0] === 'pr' && a[1] === 'list' && a.includes('agent/issue-302'),
        () => ok(JSON.stringify([{ number: 302, headRefOid: '4444444444444444444444444444444444444d', statusCheckRollup: SELF_DRIVING_CHECKS.map((n) => ({ context: n, state: 'SUCCESS' })) }])),
      )
      .onArgs('gh', ['issue', 'view', '301'], () => ok(JSON.stringify({ number: 301, state: 'CLOSED', labels: [{ name: 'roadmap:scan-item' }], body: '' })))
      .on(
        (c, a) => c === 'gh' && a[0] === 'pr' && a[1] === 'list' && a.includes('agent/issue-301'),
        () => ok(JSON.stringify([{ number: 301, headRefOid: '5555555555555555555555555555555555555e', statusCheckRollup: SELF_DRIVING_CHECKS.map((n) => ({ context: n, state: 'SUCCESS' })) }])),
      );
    const s = await missionAdvancingSignal(CWD, { profileDir: 'profiles/self-driving', proc: stub.runner });
    expect(s.present).toBe(true);
    expect(s.evidence).toMatch(/roadmap:scan-item/);
  });
});

// --- gh-issues board — pr-close linkage (simple-gh-sdlc: no roadmap trio on this profile) ------------------

const SIMPLE_GH_SDLC_REPO = 'acme/widgets';
const SIMPLE_GH_SDLC_CHECKS = ['ci', 'agent-review', 'security'];

describe('missionAdvancingSignal — gh-issues board, pr-close/AC linkage (simple-gh-sdlc)', () => {
  test('gated merge + a real ## Acceptance Criteria body -> true', async () => {
    const stub = stubRepoView(new StubProc(), SIMPLE_GH_SDLC_REPO)
      .onArgs('gh', ['issue', 'view', '10'], () =>
        ok(JSON.stringify({ number: 10, state: 'CLOSED', labels: [], body: '## Acceptance Criteria\n\n- [x] SUP-1/01 requests over the limit return 429\n' })),
      )
      .on(
        (c, a) => c === 'gh' && a[0] === 'pr' && a[1] === 'list' && a.includes('agent/issue-10'),
        () => ok(JSON.stringify([{ number: 11, headRefOid: '6666666666666666666666666666666666666f', statusCheckRollup: SIMPLE_GH_SDLC_CHECKS.map((n) => ({ context: n, state: 'SUCCESS' })) }])),
      );
    const s = await missionAdvancingSignal(CWD, { profileDir: 'profiles/simple-gh-sdlc', workItemId: '10', proc: stub.runner });
    expect(s.present).toBe(true);
    expect(s.evidence).toMatch(/linkage PRESENT/);
  });

  test('a docs-only close (gate passes, but the body carries no real ## Acceptance Criteria section) -> false', async () => {
    const stub = stubRepoView(new StubProc(), SIMPLE_GH_SDLC_REPO)
      .onArgs('gh', ['issue', 'view', '20'], () => ok(JSON.stringify({ number: 20, state: 'CLOSED', labels: [], body: 'fixed a typo in the README' })))
      .on(
        (c, a) => c === 'gh' && a[0] === 'pr' && a[1] === 'list' && a.includes('agent/issue-20'),
        () => ok(JSON.stringify([{ number: 21, headRefOid: '7777777777777777777777777777777777777a', statusCheckRollup: SIMPLE_GH_SDLC_CHECKS.map((n) => ({ context: n, state: 'SUCCESS' })) }])),
      );
    const s = await missionAdvancingSignal(CWD, { profileDir: 'profiles/simple-gh-sdlc', workItemId: '20', proc: stub.runner });
    expect(s.present).toBe(false);
    expect(s.evidence).toMatch(/gate PASSED/);
    expect(s.evidence).toMatch(/linkage ABSENT/);
    expect(s.evidence).toMatch(/docs-only\/ad hoc close/);
  });

  test('a linked issue whose PR is missing a required check (e.g. security never dispatched) -> false', async () => {
    const stub = stubRepoView(new StubProc(), SIMPLE_GH_SDLC_REPO)
      .onArgs('gh', ['issue', 'view', '30'], () =>
        ok(JSON.stringify({ number: 30, state: 'CLOSED', labels: [], body: '## Acceptance Criteria\n\n- [x] SUP-2/01 real AC\n' })),
      )
      .on(
        (c, a) => c === 'gh' && a[0] === 'pr' && a[1] === 'list' && a.includes('agent/issue-30'),
        () => ok(JSON.stringify([{ number: 31, headRefOid: '8888888888888888888888888888888888888b', statusCheckRollup: [{ context: 'ci', state: 'SUCCESS' }, { context: 'agent-review', state: 'SUCCESS' }] }])),
      );
    const s = await missionAdvancingSignal(CWD, { profileDir: 'profiles/simple-gh-sdlc', workItemId: '30', proc: stub.runner });
    expect(s.present).toBe(false);
    expect(s.evidence).toMatch(/security=MISSING/);
  });
});

// --- ztrack board — per-issue / plan-doc linkage (simple-gh: board is ztrack even though PRs land on GitHub)

describe('missionAdvancingSignal — ztrack board, plan-doc linkage (simple-gh)', () => {
  test('a done item, plan-doc-linked (real source), gated merge -> true', async () => {
    const stub = stubRepoView(new StubProc(), 'acme/widgets')
      .onArgs('npx', ['ztrack', 'issue', 'view', 'SUP-14'], () =>
        ok(JSON.stringify({ identifier: 'SUP-14', body: 'PR: #42\n', source: 'docs/plans/rate-limiting.md', state: 'done' })),
      )
      .onArgs('gh', ['pr', 'view', '42'], () => ok(JSON.stringify({ number: 42, headRefOid: '9999999999999999999999999999999999999c', statusCheckRollup: [{ context: 'ci', state: 'SUCCESS' }] })));
    const s = await missionAdvancingSignal(CWD, { profileDir: 'profiles/simple-gh', workItemId: 'SUP-14', proc: stub.runner });
    expect(s.present).toBe(true);
    expect(s.evidence).toMatch(/plan-doc-linked/);
    expect(s.evidence).toMatch(/PR #42/);
  });

  test('a done item with ztrack\'s own un-registered fallback source ("default") -> NOT plan-doc-linked -> false', async () => {
    const stub = stubRepoView(new StubProc(), 'acme/widgets')
      .onArgs('npx', ['ztrack', 'issue', 'view', 'SUP-15'], () => ok(JSON.stringify({ identifier: 'SUP-15', body: 'PR: #43\n', source: 'default', state: 'done' })))
      .onArgs('gh', ['pr', 'view', '43'], () => ok(JSON.stringify({ number: 43, headRefOid: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaad', statusCheckRollup: [{ context: 'ci', state: 'SUCCESS' }] })));
    const s = await missionAdvancingSignal(CWD, { profileDir: 'profiles/simple-gh', workItemId: 'SUP-15', proc: stub.runner });
    expect(s.present).toBe(false);
    expect(s.evidence).toMatch(/not plan-doc-linked \(source="default"\)/);
  });

  test('a done item with no "PR:" line in its body -> cannot verify a gated merge -> false', async () => {
    const stub = stubRepoView(new StubProc(), 'acme/widgets').onArgs('npx', ['ztrack', 'issue', 'view', 'SUP-16'], () =>
      ok(JSON.stringify({ identifier: 'SUP-16', body: 'no landing reference yet', source: 'docs/plans/x.md', state: 'done' })),
    );
    const s = await missionAdvancingSignal(CWD, { profileDir: 'profiles/simple-gh', workItemId: 'SUP-16', proc: stub.runner });
    expect(s.present).toBe(false);
    expect(s.evidence).toMatch(/no 'PR:' line/);
  });

  test('plan-doc-linked but the PR is missing the required "ci" check -> false', async () => {
    const stub = stubRepoView(new StubProc(), 'acme/widgets')
      .onArgs('npx', ['ztrack', 'issue', 'view', 'SUP-17'], () => ok(JSON.stringify({ identifier: 'SUP-17', body: 'PR: #44\n', source: 'docs/plans/y.md', state: 'done' })))
      .onArgs('gh', ['pr', 'view', '44'], () => ok(JSON.stringify({ number: 44, headRefOid: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbe', statusCheckRollup: [] })));
    const s = await missionAdvancingSignal(CWD, { profileDir: 'profiles/simple-gh', workItemId: 'SUP-17', proc: stub.runner });
    expect(s.present).toBe(false);
    expect(s.evidence).toMatch(/ci=MISSING/);
  });
});
