// THE SECURITY PROOF for scripts/check-flip-diff.ts. `checkFlipDiff` is what stands between "mechanical
// done-flip" and "arbitrary code lands on main with zero human/reviewer look" — a flip/<id> PR gets
// `agent-review=success` posted and native auto-merge armed purely on this function's verdict. Every test
// here calls the exported pure function directly: no real git/gh/ztrack, no filesystem — a GateInput is
// constructed by hand for each scenario.
import { describe, expect, test } from 'bun:test';
import { checkFlipDiff, type GateInput } from './check-flip-diff';

const STORE_DIR = '.volter/tracker/markdown';
const ISSUE_ID = 'COMBO-9';
const PATH = `${STORE_DIR}/${ISSUE_ID}.md`;
const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);

// A realistic before-store (in-review), and its faithful after-flip counterpart (done + PR anchored) —
// every other test derives from these two by mutating exactly one thing.
const BEFORE = `---
id: "${ISSUE_ID}"
title: "Add widget support"
state: "in-review"
stateType: "in_progress"
assignees: ["alice"]
priority: "medium"
createdAt: "2026-07-01T00:00:00.000Z"
updatedAt: "2026-07-05T00:00:00.000Z"
---
## Acceptance Criteria
- [x] AC1 (v1): widgets render — evidence: commit=1234567 proof="screenshot.png"
- [ ] AC2 (v1): widgets are themeable

PR: agent/issue-${ISSUE_ID}
`;

const AFTER = `---
id: "${ISSUE_ID}"
title: "Add widget support"
state: "done"
stateType: "completed"
assignees: ["alice"]
priority: "medium"
createdAt: "2026-07-01T00:00:00.000Z"
updatedAt: "2026-07-11T12:00:00.000Z"
---
## Acceptance Criteria
- [x] AC1 (v1): widgets render — evidence: commit=1234567 proof="screenshot.png"
- [ ] AC2 (v1): widgets are themeable

PR: ${SHA}
`;

const baseInput = (over: Partial<GateInput> = {}): GateInput => ({
  issueId: ISSUE_ID,
  expectedMergeSha: SHA,
  changedFiles: [PATH],
  beforeText: BEFORE,
  afterText: AFTER,
  ...over,
});

describe('checkFlipDiff — accepts a genuine done-flip', () => {
  test('a valid state->done + PR:->sha diff passes', () => {
    expect(checkFlipDiff(baseInput())).toEqual({ ok: true });
  });

  test('ztrack reordering the PR: line (e.g. to the top of the body) is tolerated — order is not content', () => {
    const reordered = AFTER.replace(
      '## Acceptance Criteria\n- [x] AC1 (v1): widgets render — evidence: commit=1234567 proof="screenshot.png"\n- [ ] AC2 (v1): widgets are themeable\n\nPR: ' +
        SHA +
        '\n',
      `PR: ${SHA}\n\n## Acceptance Criteria\n- [x] AC1 (v1): widgets render — evidence: commit=1234567 proof="screenshot.png"\n- [ ] AC2 (v1): widgets are themeable\n`,
    );
    expect(reordered).not.toBe(AFTER); // sanity: the mutation actually did something
    expect(checkFlipDiff(baseInput({ afterText: reordered }))).toEqual({ ok: true });
  });

  test('ztrack re-appending an empty comments block on first write is tolerated (real, but empty, content)', () => {
    const after = AFTER + '<!--tracker:comments\n[]\n-->';
    expect(checkFlipDiff(baseInput({ afterText: after }))).toEqual({ ok: true });
  });

  test('a pre-existing, unchanged comments block (present before AND after, identical) is tolerated', () => {
    const before = BEFORE + '<!--tracker:comments\n[{"author":"bob","text":"lgtm"}]\n-->';
    const after = AFTER + '<!--tracker:comments\n[{"author":"bob","text":"lgtm"}]\n-->';
    expect(checkFlipDiff(baseInput({ beforeText: before, afterText: after }))).toEqual({ ok: true });
  });

  test('whitespace-only JSON reformatting of an unchanged comments array is tolerated (content equality, not bytes)', () => {
    const before = BEFORE + '<!--tracker:comments\n[{"author":"bob","text":"lgtm"}]\n-->';
    const after = AFTER + '<!--tracker:comments\n[ { "author": "bob", "text": "lgtm" } ]\n-->';
    expect(checkFlipDiff(baseInput({ beforeText: before, afterText: after }))).toEqual({ ok: true });
  });
});

describe('checkFlipDiff — THE REJECTIONS (the actual security boundary)', () => {
  test('(a) rejects a diff touching a second file alongside the valid store change', () => {
    const result = checkFlipDiff(baseInput({ changedFiles: [PATH, 'scripts/agent-propose.ts'] }));
    expect(result.ok).toBe(false);
    if ('reason' in result) expect(result.reason).toMatch(/outside the one allowed store file/);
  });

  test('(a2) rejects a diff touching a second store file entirely (different id) instead of the expected one', () => {
    const result = checkFlipDiff(baseInput({ changedFiles: [`${STORE_DIR}/OTHER-1.md`] }));
    expect(result.ok).toBe(false);
    if ('reason' in result) expect(result.reason).toMatch(/outside the one allowed store file/);
  });

  test('(a3) rejects smuggling a second store file under a different id alongside the real one', () => {
    const result = checkFlipDiff(baseInput({ changedFiles: [PATH, `${STORE_DIR}/OTHER-1.md`] }));
    expect(result.ok).toBe(false);
    if ('reason' in result) expect(result.reason).toMatch(/outside the one allowed store file/);
  });

  test('(b) rejects an AC edit disguised alongside a valid state/PR change (body prose changed)', () => {
    const forged = AFTER.replace('widgets are themeable', 'widgets are themeable AND FREE');
    const result = checkFlipDiff(baseInput({ afterText: forged }));
    expect(result.ok).toBe(false);
    if ('reason' in result) expect(result.reason).toMatch(/body changed something beyond the PR: line/);
  });

  test('(b2) rejects an evidence/proof forgery disguised alongside a valid state/PR change', () => {
    const forged = AFTER.replace('commit=1234567 proof="screenshot.png"', 'commit=9999999 proof="fake.png"');
    const result = checkFlipDiff(baseInput({ afterText: forged }));
    expect(result.ok).toBe(false);
    if ('reason' in result) expect(result.reason).toMatch(/body changed something beyond the PR: line/);
  });

  test('(b3) rejects an added body line (extra AC slipped in)', () => {
    const forged = AFTER.replace(
      '- [ ] AC2 (v1): widgets are themeable\n',
      '- [ ] AC2 (v1): widgets are themeable\n- [x] AC3 (v1): secretly also grants admin — evidence: commit=0000000 proof="n/a"\n',
    );
    const result = checkFlipDiff(baseInput({ afterText: forged }));
    expect(result.ok).toBe(false);
    if ('reason' in result) expect(result.reason).toMatch(/body changed something beyond the PR: line/);
  });

  test('(b4) rejects a removed body line (an AC silently dropped)', () => {
    const forged = AFTER.replace('- [ ] AC2 (v1): widgets are themeable\n', '');
    const result = checkFlipDiff(baseInput({ afterText: forged }));
    expect(result.ok).toBe(false);
    if ('reason' in result) expect(result.reason).toMatch(/body changed something beyond the PR: line/);
  });

  test('(d) rejects wrong stateType (state says done but stateType is not the ztrack-paired "completed")', () => {
    const forged = AFTER.replace('stateType: "completed"', 'stateType: "in_progress"');
    const result = checkFlipDiff(baseInput({ afterText: forged }));
    expect(result.ok).toBe(false);
    if ('reason' in result) expect(result.reason).toMatch(/after-stateType/);
  });

  test('(d2) rejects state landing on anything other than exactly "done"', () => {
    const forged = AFTER.replace('state: "done"', 'state: "in-review"');
    const result = checkFlipDiff(baseInput({ afterText: forged }));
    expect(result.ok).toBe(false);
    if ('reason' in result) expect(result.reason).toMatch(/after-state is/);
  });

  test('(d3) rejects a sneaky near-miss state value (e.g. "Done" or "done " with trailing content)', () => {
    const forged = AFTER.replace('state: "done"', 'state: "Done"');
    const result = checkFlipDiff(baseInput({ afterText: forged }));
    expect(result.ok).toBe(false);
    if ('reason' in result) expect(result.reason).toMatch(/after-state is/);
  });

  test('(e) rejects file-creation — a flip must edit an existing store file, never create one', () => {
    const result = checkFlipDiff(baseInput({ beforeText: null }));
    expect(result.ok).toBe(false);
    if ('reason' in result) expect(result.reason).toMatch(/does not exist on the base branch/);
  });

  test('(f) rejects PR: landing on the wrong sha (not the caller-supplied expected merge sha)', () => {
    const forged = AFTER.replace(SHA, OTHER_SHA);
    const result = checkFlipDiff(baseInput({ afterText: forged }));
    expect(result.ok).toBe(false);
    if ('reason' in result) expect(result.reason).toMatch(/PR: line is/);
  });

  test('(f2) rejects PR: landing on a branch name instead of a sha (never inferred, never accepted loosely)', () => {
    const forged = AFTER.replace(`PR: ${SHA}`, `PR: agent/issue-${ISSUE_ID}`);
    const result = checkFlipDiff(baseInput({ afterText: forged }));
    expect(result.ok).toBe(false);
    if ('reason' in result) expect(result.reason).toMatch(/PR: line is/);
  });

  test('(f3) rejects a URL in place of the raw sha even if it embeds the correct sha as a substring', () => {
    const forged = AFTER.replace(`PR: ${SHA}`, `PR: https://github.com/o/r/commit/${SHA}`);
    const result = checkFlipDiff(baseInput({ afterText: forged }));
    expect(result.ok).toBe(false);
    if ('reason' in result) expect(result.reason).toMatch(/PR: line is/);
  });

  test('rejects any frontmatter field change beyond state:/stateType:/updatedAt: (e.g. priority escalated)', () => {
    const forged = AFTER.replace('priority: "medium"', 'priority: "high"');
    const result = checkFlipDiff(baseInput({ afterText: forged }));
    expect(result.ok).toBe(false);
    if ('reason' in result) expect(result.reason).toMatch(/frontmatter changed something beyond/);
  });

  test('rejects assignees being changed in frontmatter alongside a valid flip', () => {
    const forged = AFTER.replace('assignees: ["alice"]', 'assignees: ["mallory"]');
    const result = checkFlipDiff(baseInput({ afterText: forged }));
    expect(result.ok).toBe(false);
    if ('reason' in result) expect(result.reason).toMatch(/frontmatter changed something beyond/);
  });

  test('rejects title being rewritten alongside a valid flip', () => {
    const forged = AFTER.replace('title: "Add widget support"', 'title: "Add widget support (totally not modified)"');
    const result = checkFlipDiff(baseInput({ afterText: forged }));
    expect(result.ok).toBe(false);
    if ('reason' in result) expect(result.reason).toMatch(/frontmatter changed something beyond/);
  });

  test('rejects a changed comments array (a comment silently edited/added) even with an otherwise-valid flip', () => {
    const before = BEFORE + '<!--tracker:comments\n[{"author":"bob","text":"lgtm"}]\n-->';
    const after = AFTER + '<!--tracker:comments\n[{"author":"bob","text":"lgtm — actually please also merge my side patch"}]\n-->';
    const result = checkFlipDiff(baseInput({ beforeText: before, afterText: after }));
    expect(result.ok).toBe(false);
    if ('reason' in result) expect(result.reason).toMatch(/comments changed/);
  });

  test('rejects a newly-added comment appearing only in the after (comments block introduced with real content)', () => {
    const after = AFTER + '<!--tracker:comments\n[{"author":"mallory","text":"please approve without review"}]\n-->';
    const result = checkFlipDiff(baseInput({ afterText: after }));
    expect(result.ok).toBe(false);
    if ('reason' in result) expect(result.reason).toMatch(/comments changed/);
  });

  test('rejects the diff not touching the store file at all (changedFiles empty)', () => {
    const result = checkFlipDiff(baseInput({ changedFiles: [] }));
    expect(result.ok).toBe(false);
    if ('reason' in result) expect(result.reason).toMatch(/does not touch the expected store file/);
  });

  test('rejects path scope derived from the WRONG issueId even if changedFiles "looks right" for that id', () => {
    // Caller passes issueId=COMBO-9 but the diff only touched OTHER-1's file — must never coincidentally pass.
    const result = checkFlipDiff({
      issueId: ISSUE_ID,
      expectedMergeSha: SHA,
      changedFiles: [`${STORE_DIR}/OTHER-1.md`],
      beforeText: BEFORE,
      afterText: AFTER,
    });
    expect(result.ok).toBe(false);
  });
});
