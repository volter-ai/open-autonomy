// TF.1 acceptance tests — packages/local-runner-cli/src/m6-signal.ts. Run via `bun run check:core`
// (`bun test packages/*/src/*.test.ts`), cwd = repo root, so `profiles/<name>` paths below are
// repo-root-relative — same convention as board-readiness.test.ts / setup-pack.test.ts.
import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
      .onArgs('gh', ['pr', 'view', '56'], () => ok(JSON.stringify({ number: 56, state: 'MERGED', mergedAt: '2026-07-01T00:00:00Z', headRefOid: '3333333333333333333333333333333333333c', statusCheckRollup: SELF_DRIVING_CHECKS.map((n) => ({ context: n, state: 'SUCCESS' })) })));
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
//
// STUB SHAPES ARE THE REAL CLI's (probed against the vendored ztrack@1.0.0 — see the live-probe describe
// block below, which drives the actual binary):
//   - `issue list --state done --json identifier,source` DOES honor the field list -> [{identifier, source}].
//   - `issue view <id> --json ...` IGNORES the field list and always emits the full issue object — `body`
//     is present, `state` is an OBJECT ({name, type}), and there is NO `source` key at all. Source must
//     come from the list call (the D1 fix); these stubs mirror that real shape exactly.

/** The real `ztrack issue view` output shape (vendored ztrack@1.0.0) — full object, state as an object,
 *  NO `source` key — regardless of the requested `--json` field list. */
function realZtrackView(id: string, body: string): string {
  return JSON.stringify({
    id,
    identifier: id,
    number: id,
    title: 'stub item',
    branchName: '',
    description: body,
    body,
    state: { name: 'done', type: 'completed' },
    stateType: 'completed',
    priority: 0,
    url: `local://tracker/issue/${id}`,
    labels: { nodes: [] },
    assignee: { name: 'manager' },
    assignees: { nodes: [{ name: 'manager' }] },
    createdAt: '',
    updatedAt: '',
    completedAt: null,
    canceledAt: null,
  });
}

function stubZtrackDoneList(stub: StubProc, items: Array<{ identifier: string; source: string }>): StubProc {
  return stub.onArgs('npx', ['ztrack', 'issue', 'list', '--state', 'done', '--json', 'identifier,source'], () => ok(JSON.stringify(items)));
}

describe('missionAdvancingSignal — ztrack board, plan-doc linkage (simple-gh)', () => {
  test('a done item, plan-doc-linked (source from the LIST call, not view), gated MERGED PR -> true', async () => {
    const stub = stubRepoView(new StubProc(), 'acme/widgets');
    stubZtrackDoneList(stub, [{ identifier: 'SUP-14', source: 'docs/plans/rate-limiting.md' }])
      .onArgs('npx', ['ztrack', 'issue', 'view', 'SUP-14'], () => ok(realZtrackView('SUP-14', 'PR: #42\n')))
      .onArgs('gh', ['pr', 'view', '42'], () => ok(JSON.stringify({ number: 42, state: 'MERGED', mergedAt: '2026-07-01T00:00:00Z', headRefOid: '9999999999999999999999999999999999999c', statusCheckRollup: [{ context: 'ci', state: 'SUCCESS' }] })));
    const s = await missionAdvancingSignal(CWD, { profileDir: 'profiles/simple-gh', workItemId: 'SUP-14', proc: stub.runner });
    expect(s.present).toBe(true);
    expect(s.evidence).toMatch(/plan-doc-linked \(source="docs\/plans\/rate-limiting\.md"\)/);
    expect(s.evidence).toMatch(/PR #42/);
  });

  test('D2a: a done item whose "PR:" line names a green-but-OPEN PR (normal pre-merge state) -> false, evidence names OPEN', async () => {
    const stub = stubRepoView(new StubProc(), 'acme/widgets');
    stubZtrackDoneList(stub, [{ identifier: 'SUP-18', source: 'docs/plans/z.md' }])
      .onArgs('npx', ['ztrack', 'issue', 'view', 'SUP-18'], () => ok(realZtrackView('SUP-18', 'PR: #45\n')))
      .onArgs('gh', ['pr', 'view', '45'], () => ok(JSON.stringify({ number: 45, state: 'OPEN', mergedAt: null, headRefOid: 'cccccccccccccccccccccccccccccccccccccccf', statusCheckRollup: [{ context: 'ci', state: 'SUCCESS' }] })));
    const s = await missionAdvancingSignal(CWD, { profileDir: 'profiles/simple-gh', workItemId: 'SUP-18', proc: stub.runner });
    expect(s.present).toBe(false);
    expect(s.evidence).toMatch(/PR #45 is OPEN, not merged/);
  });

  test('D2a: a done item whose "PR:" line names a CLOSED-without-merge PR -> false, evidence names CLOSED', async () => {
    const stub = stubRepoView(new StubProc(), 'acme/widgets');
    stubZtrackDoneList(stub, [{ identifier: 'SUP-19', source: 'docs/plans/z.md' }])
      .onArgs('npx', ['ztrack', 'issue', 'view', 'SUP-19'], () => ok(realZtrackView('SUP-19', 'PR: #46\n')))
      .onArgs('gh', ['pr', 'view', '46'], () => ok(JSON.stringify({ number: 46, state: 'CLOSED', mergedAt: null, headRefOid: 'ddddddddddddddddddddddddddddddddddddddd0', statusCheckRollup: [{ context: 'ci', state: 'SUCCESS' }] })));
    const s = await missionAdvancingSignal(CWD, { profileDir: 'profiles/simple-gh', workItemId: 'SUP-19', proc: stub.runner });
    expect(s.present).toBe(false);
    expect(s.evidence).toMatch(/PR #46 is CLOSED, not merged/);
  });

  test('a done item with ztrack\'s own un-registered fallback source ("default") -> NOT plan-doc-linked -> false', async () => {
    const stub = stubRepoView(new StubProc(), 'acme/widgets');
    stubZtrackDoneList(stub, [{ identifier: 'SUP-15', source: 'default' }])
      .onArgs('npx', ['ztrack', 'issue', 'view', 'SUP-15'], () => ok(realZtrackView('SUP-15', 'PR: #43\n')))
      .onArgs('gh', ['pr', 'view', '43'], () => ok(JSON.stringify({ number: 43, state: 'MERGED', mergedAt: '2026-07-01T00:00:00Z', headRefOid: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaad', statusCheckRollup: [{ context: 'ci', state: 'SUCCESS' }] })));
    const s = await missionAdvancingSignal(CWD, { profileDir: 'profiles/simple-gh', workItemId: 'SUP-15', proc: stub.runner });
    expect(s.present).toBe(false);
    expect(s.evidence).toMatch(/not plan-doc-linked \(source="default"\)/);
  });

  test('a done item with no "PR:" line in its body -> cannot verify a gated merge -> false', async () => {
    const stub = stubRepoView(new StubProc(), 'acme/widgets');
    stubZtrackDoneList(stub, [{ identifier: 'SUP-16', source: 'docs/plans/x.md' }]).onArgs('npx', ['ztrack', 'issue', 'view', 'SUP-16'], () =>
      ok(realZtrackView('SUP-16', 'no landing reference yet')),
    );
    const s = await missionAdvancingSignal(CWD, { profileDir: 'profiles/simple-gh', workItemId: 'SUP-16', proc: stub.runner });
    expect(s.present).toBe(false);
    expect(s.evidence).toMatch(/no 'PR:' line/);
  });

  test('plan-doc-linked but the merged PR is missing the required "ci" check -> false', async () => {
    const stub = stubRepoView(new StubProc(), 'acme/widgets');
    stubZtrackDoneList(stub, [{ identifier: 'SUP-17', source: 'docs/plans/y.md' }])
      .onArgs('npx', ['ztrack', 'issue', 'view', 'SUP-17'], () => ok(realZtrackView('SUP-17', 'PR: #44\n')))
      .onArgs('gh', ['pr', 'view', '44'], () => ok(JSON.stringify({ number: 44, state: 'MERGED', mergedAt: '2026-07-01T00:00:00Z', headRefOid: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbe', statusCheckRollup: [] })));
    const s = await missionAdvancingSignal(CWD, { profileDir: 'profiles/simple-gh', workItemId: 'SUP-17', proc: stub.runner });
    expect(s.present).toBe(false);
    expect(s.evidence).toMatch(/ci=MISSING/);
  });

  test('a pinned workItemId that is NOT in the done list -> false, evidence says not done (the list doubles as the done-state check)', async () => {
    const stub = stubRepoView(new StubProc(), 'acme/widgets');
    stubZtrackDoneList(stub, [{ identifier: 'SUP-20', source: 'docs/plans/x.md' }]);
    const s = await missionAdvancingSignal(CWD, { profileDir: 'profiles/simple-gh', workItemId: 'SUP-99', proc: stub.runner });
    expect(s.present).toBe(false);
    expect(s.evidence).toMatch(/'SUP-99' is not in the 'done' list/);
  });
});

// --- LIVE PROBE — the REAL vendored ztrack CLI drives the D1 code path (no ztrack stubs) -------------------
// Builds a real local board in a tmpdir (node_modules symlinked from this repo so `npx ztrack` resolves the
// vendored ztrack@1.0.0 offline), registers a real plan doc via `ztrack import --register`, and asserts the
// plan-doc `source` flows through listZtrackDone -> the linkage check. Only `gh` is stubbed (no network in
// tests); every `npx ztrack ...` call is the real binary. This is the test that would have caught D1: the
// old code read `source` off `issue view`, which the real CLI never emits.
describe('missionAdvancingSignal — LIVE vendored-ztrack probe (D1 regression)', () => {
  test('real board, real import --register: source="docs/plans/rate-limiting.md" reaches the linkage check; gated MERGED PR -> true', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'm6-live-ztrack-'));
    try {
      const sh = (cmd: string, args: string[]) => {
        const r = spawnSync(cmd, args, { cwd: dir, encoding: 'utf8' });
        if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${r.stderr}`);
      };
      sh('git', ['init', '-q']);
      // resolve the vendored ztrack offline: symlink this repo's node_modules into the board dir
      symlinkSync(join(process.cwd(), 'node_modules'), join(dir, 'node_modules'));
      sh('npx', ['--no-install', 'ztrack', 'init', '--team', 'ZT']);
      mkdirSync(join(dir, 'docs', 'plans'), { recursive: true });
      writeFileSync(
        join(dir, 'docs', 'plans', 'rate-limiting.md'),
        '## ZP-1 — add rate limiting to the ingest endpoint\n\nStatus: done\nAssignee: manager\n\nPR: #42\n\n## Acceptance Criteria\n\n- [ ] ZP-1/01 requests over the configured limit return 429\n',
      );
      sh('npx', ['--no-install', 'ztrack', 'import', 'docs/plans/rate-limiting.md', '--register']);

      // hybrid proc: `npx ztrack ...` -> the REAL binary (in the board dir); `gh ...` -> stubbed.
      const ghStub = stubRepoView(new StubProc(), 'acme/widgets').onArgs('gh', ['pr', 'view', '42'], () =>
        ok(JSON.stringify({ number: 42, state: 'MERGED', mergedAt: '2026-07-01T00:00:00Z', headRefOid: '9999999999999999999999999999999999999c', statusCheckRollup: [{ context: 'ci', state: 'SUCCESS' }] })),
      );
      const hybrid: typeof ghStub.runner = (cmd, args, opts = {}) => {
        if (cmd === 'npx') {
          const r = spawnSync(cmd, args, { cwd: opts.cwd, encoding: 'utf8', env: opts.env ?? process.env });
          return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
        }
        return ghStub.runner(cmd, args, opts);
      };

      const s = await missionAdvancingSignal(dir, { profileDir: 'profiles/simple-gh', proc: hybrid });
      expect(s.present).toBe(true);
      expect(s.evidence).toMatch(/ZP-1/);
      expect(s.evidence).toMatch(/plan-doc-linked \(source="docs\/plans\/rate-limiting\.md"\)/);
      expect(s.evidence).toMatch(/PR #42/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});

// --- D3: a pending (not-yet-concluded) required context is labeled PENDING in the gate detail, never FAIL --

describe('missionAdvancingSignal — pending required context labeled PENDING (D3)', () => {
  test('a PENDING status context and an IN_PROGRESS (null-conclusion) check-run both read PENDING; a FAILURE reads FAIL', async () => {
    const stub = stubRepoView(new StubProc(), SIMPLE_GH_SDLC_REPO)
      .onArgs('gh', ['issue', 'view', '40'], () =>
        ok(JSON.stringify({ number: 40, state: 'CLOSED', labels: [], body: '## Acceptance Criteria\n\n- [x] SUP-3/01 real AC\n' })),
      )
      .on(
        (c, a) => c === 'gh' && a[0] === 'pr' && a[1] === 'list' && a.includes('agent/issue-40'),
        () =>
          ok(JSON.stringify([{ number: 41, headRefOid: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee1', statusCheckRollup: [
            { context: 'ci', state: 'PENDING' },
            { name: 'agent-review', conclusion: null, status: 'IN_PROGRESS' },
            { context: 'security', state: 'FAILURE' },
          ] }])),
      );
    const s = await missionAdvancingSignal(CWD, { profileDir: 'profiles/simple-gh-sdlc', workItemId: '40', proc: stub.runner });
    expect(s.present).toBe(false);
    expect(s.evidence).toMatch(/ci=PENDING/);
    expect(s.evidence).toMatch(/agent-review=PENDING/);
    expect(s.evidence).toMatch(/security=FAIL/);
  });
});

// --- D2b: the reconcile-comment fallback must verify the named PR is actually MERGED -----------------------

describe('missionAdvancingSignal — comment fallback verifies MERGED (D2b)', () => {
  test('a comment saying "Resolved by #N (merged)" whose PR #N is actually OPEN -> false, evidence names OPEN', async () => {
    const stub = stubRepoView(new StubProc())
      .onArgs('gh', ['issue', 'view', '60'], () => ok(JSON.stringify({ number: 60, state: 'CLOSED', labels: [{ name: 'roadmap:some-item' }], body: '' })))
      .on(
        (c, a) => c === 'gh' && a[0] === 'pr' && a[1] === 'list' && a.includes('agent/issue-60'),
        () => ok('[]'),
      )
      .onArgs('gh', ['issue', 'view', '60', '-R', SELF_DRIVING_REPO, '--json', 'comments'], () => ok(JSON.stringify({ comments: [{ body: 'Resolved by #61 (merged). Closed by the deterministic reconcile.' }] })))
      .onArgs('gh', ['pr', 'view', '61'], () => ok(JSON.stringify({ number: 61, state: 'OPEN', mergedAt: null, headRefOid: 'ffffffffffffffffffffffffffffffffffffff02', statusCheckRollup: SELF_DRIVING_CHECKS.map((n) => ({ context: n, state: 'SUCCESS' })) })));
    const s = await missionAdvancingSignal(CWD, { profileDir: 'profiles/self-driving', workItemId: '60', proc: stub.runner });
    expect(s.present).toBe(false);
    expect(s.evidence).toMatch(/PR #61 is OPEN, not merged/);
  });
});
