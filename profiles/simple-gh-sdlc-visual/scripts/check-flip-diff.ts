#!/usr/bin/env bun
// THE SECURITY BOUNDARY for auto-approving a `flip/<id>` bookkeeping PR. A flip PR gets `agent-review`
// auto-posted + native auto-merge armed WITHOUT a human or the `reviewer` agent ever looking at it — so this
// check is what stands between "mechanical done-flip" and "arbitrary code lands on main with no review".
// It must be IMPOSSIBLE to abuse: if the diff is anything other than exactly what a done-flip produces, this
// REJECTS (loud, non-zero exit) and the caller must not approve.
//
// A flip PR's diff must be STRICTLY:
//   1. Exactly ONE file touched: `.volter/tracker/markdown/<id>.md` (the id parsed from the branch name
//      `flip/<id>` — never trusted from the diff itself, so a diff can't smuggle a second store file under a
//      different id and call it "the same kind of change").
//   2. Within that file, the ONLY semantic change is:
//        - the frontmatter `state:` field moving to `"done"` (from whatever it was), plus the COMPANION
//          `stateType:` field ztrack itself always writes alongside it (verified live: `ztrack issue edit
//          --state done` always pairs `state: "done"` with `stateType: "completed"` — never independently
//          settable, so this gate requires the pairing be EXACTLY that, not just "changed"), and
//        - the body `PR:` line's value changing to the real merge sha of the just-merged agent PR (passed in
//          explicitly by the caller — never inferred from the diff, so a flip PR can't invent its own
//          "real" merge sha).
//      `updatedAt:` is allowed to change (ztrack itself always bumps it on any edit). ztrack's own patch/edit
//      also re-serializes the body — verified live it can REORDER existing lines (e.g. `PR:` moves to the
//      top) without changing their content, so this gate compares the body as a MULTISET of lines (order-
//      insensitive) rather than requiring line-position stability — order is not semantic content. Nothing
//      else (title, assignees, priority, every body line's CONTENT — prose, every AC's status/plan/evidence/
//      proof/paths) may differ at all.
//
// If the diff touches a second file, or changes anything in the one allowed file beyond `state:`/
// `stateType:`/`PR:`/`updatedAt:`, this REJECTS — never silently, always with the exact reason.
import { execFileSync } from 'node:child_process';

const STORE_DIR = '.volter/tracker/markdown';

export interface GateInput {
  issueId: string;
  expectedMergeSha: string;
  changedFiles: string[];
  beforeText: string | null; // null = file did not exist on the base (a flip must never CREATE the store file)
  afterText: string;
}

export type GateResult = { ok: true } | { ok: false; reason: string };

function frontmatterField(text: string, field: string): string | undefined {
  const re = new RegExp(`^${field}:\\s*"?([^"\\n]*?)"?\\s*$`, 'm');
  return re.exec(text)?.[1];
}

function prLine(text: string): string | undefined {
  return /^PR:\s*(\S+)/m.exec(text)?.[1];
}

// Split a store file into its two documents (YAML frontmatter + markdown body), the same shape the ztrack
// backend itself writes (`---\n<frontmatter>\n---\n<body>`).
function splitDocument(text: string): { frontmatter: string; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!m) return { frontmatter: '', body: text };
  return { frontmatter: m[1] ?? '', body: m[2] ?? '' };
}

// Strip the frontmatter fields a flip is ALLOWED to change (state/stateType/updatedAt), then require the
// REST of the frontmatter to be byte-identical. Allowlist, not denylist — the safer direction for a
// security boundary: anything not explicitly permitted is by construction rejected.
function stripAllowedFrontmatterFields(frontmatter: string): string {
  return frontmatter
    .replace(/^state:\s*"?[^"\n]*?"?\s*$/m, 'state: <redacted>')
    .replace(/^stateType:\s*"?[^"\n]*?"?\s*$/m, 'stateType: <redacted>')
    .replace(/^updatedAt:\s*"?[^"\n]*?"?\s*$/m, 'updatedAt: <redacted>');
}

// The body as a MULTISET of non-blank lines with the `PR:` line redacted — order-insensitive, because
// ztrack's own patch/edit verifiably reorders existing body lines (e.g. moves `PR:` to the top) without
// changing their CONTENT. Redacting `PR:`'s value (not removing the line) still requires the line to exist
// exactly once pre- and post-flip — only its value may differ.
function bodyLineMultiset(body: string): string[] {
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (/^PR:\s*\S+/.test(l) ? 'PR: <redacted>' : l))
    .sort();
}

// ztrack's OWN serializer (node_modules/ztrack/dist/src/backends/markdown.js's serializeIssue) ALWAYS
// re-appends a trailing `<!--tracker:comments\n<JSON array>\n-->` block on EVERY write, whether or not the
// pre-flip file already had one (verified live: patching a comments-less store file adds the block for the
// first time, with the actual current comments array — `[]` if there are none). This block is real,
// security-relevant content (a non-empty comments array carries free-form text) — it must NEVER be treated
// as an inert marker a flip is free to introduce or change. So it is extracted and required to be BYTE-
// IDENTICAL in content before/after (whether present, absent, or newly appended by ztrack's own re-
// serialization), and stripped from the multiset body comparison so its own presence/formatting doesn't
// confuse that check.
const COMMENTS_BLOCK_RE = /<!--tracker:comments\r?\n([\s\S]*?)\r?\n-->\s*$/;
function extractComments(body: string): { rest: string; commentsJson: string | null } {
  const m = COMMENTS_BLOCK_RE.exec(body);
  if (!m) return { rest: body, commentsJson: null };
  return { rest: body.slice(0, m.index), commentsJson: m[1] ?? '' };
}
// Compares comments CONTENT (the parsed array, not raw JSON text) so ztrack re-serializing `[]` vs `[ ]` (or
// any other whitespace-only JSON difference) isn't mistaken for a real change — but any actual difference in
// the comments themselves (added, removed, or edited) is rejected.
function commentsEqual(before: string | null, after: string | null): boolean {
  const parse = (s: string | null) => {
    if (s == null) return [];
    try {
      return JSON.parse(s);
    } catch {
      return s; // unparseable — compare the raw text so a malformed block can't slip through as "equal"
    }
  };
  return JSON.stringify(parse(before)) === JSON.stringify(parse(after));
}

export function checkFlipDiff(input: GateInput): GateResult {
  // 1. Path scope — exactly one file, and it must be the store file for the id parsed from the branch name.
  const expectedPath = `${STORE_DIR}/${input.issueId}.md`;
  const extra = input.changedFiles.filter((f) => f !== expectedPath);
  if (extra.length > 0) {
    return {
      ok: false,
      reason: `diff touches file(s) outside the one allowed store file: ${extra.join(', ')} (expected only ${expectedPath})`,
    };
  }
  if (!input.changedFiles.includes(expectedPath)) {
    return { ok: false, reason: `diff does not touch the expected store file ${expectedPath} at all — nothing to flip` };
  }

  // 2. The flip must never CREATE the store file — it can only edit an existing one.
  if (input.beforeText == null) {
    return { ok: false, reason: `${expectedPath} does not exist on the base branch — a flip PR must edit an existing store file, never create one` };
  }

  // 3. `state:` must land on exactly "done", paired with the ONE companion value ztrack itself always
  // writes for it (`stateType: "completed"`) — never independently settable, so requiring the exact pairing
  // (not just "changed") closes off a state/stateType-mismatch smuggling attempt.
  const afterState = frontmatterField(input.afterText, 'state');
  if (afterState !== 'done') {
    return { ok: false, reason: `after-state is "${afterState}", expected "done"` };
  }
  const afterStateType = frontmatterField(input.afterText, 'stateType');
  if (afterStateType !== 'completed') {
    return { ok: false, reason: `after-stateType is "${afterStateType}", expected "completed" (the one value ztrack pairs with state: "done")` };
  }

  // 4. `PR:` must land on exactly the real merge sha of the just-merged agent PR — never anything else
  // (never a branch name, never a different sha, never a URL).
  const afterPr = prLine(input.afterText);
  if (afterPr !== input.expectedMergeSha) {
    return { ok: false, reason: `PR: line is "${afterPr}", expected the real merge sha "${input.expectedMergeSha}"` };
  }

  // 5. Nothing else may differ.
  //   - Frontmatter: strip state:/stateType:/updatedAt:, require the rest byte-identical (title, assignees,
  //     priority, identifier, createdAt, url, devProgress, …).
  //   - Comments block: ztrack's serializer always re-appends this on every write (see extractComments) —
  //     its CONTENT (the actual comments array) must be identical before/after; a flip never touches
  //     comments.
  //   - Body (comments block stripped): compare as a redacted, order-insensitive multiset of lines (see
  //     bodyLineMultiset) — this catches an AC line edit, a body-prose edit, an evidence/proof forgery, an
  //     added/removed line, or literally anything else, because none of those are in the allowlist above,
  //     while still tolerating ztrack's own harmless line-reordering on write.
  const { frontmatter: beforeFm, body: beforeBodyRaw } = splitDocument(input.beforeText);
  const { frontmatter: afterFm, body: afterBodyRaw } = splitDocument(input.afterText);
  if (stripAllowedFrontmatterFields(beforeFm) !== stripAllowedFrontmatterFields(afterFm)) {
    return {
      ok: false,
      reason: `${expectedPath} frontmatter changed something beyond state:/stateType:/updatedAt: — rejecting (this is the exact abuse vector this gate exists to close)`,
    };
  }

  const { rest: beforeBody, commentsJson: beforeComments } = extractComments(beforeBodyRaw);
  const { rest: afterBody, commentsJson: afterComments } = extractComments(afterBodyRaw);
  if (!commentsEqual(beforeComments, afterComments)) {
    return {
      ok: false,
      reason: `${expectedPath} comments changed — a flip must never touch comments (before=${JSON.stringify(beforeComments)}, after=${JSON.stringify(afterComments)})`,
    };
  }

  const beforeLines = bodyLineMultiset(beforeBody);
  const afterLines = bodyLineMultiset(afterBody);
  if (JSON.stringify(beforeLines) !== JSON.stringify(afterLines)) {
    return {
      ok: false,
      reason: `${expectedPath} body changed something beyond the PR: line's value — rejecting (this is the exact abuse vector this gate exists to close)`,
    };
  }

  return { ok: true };
}

function git(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

// CLI entrypoint: `bun scripts/check-flip-diff.ts <issueId> <expectedMergeSha> <baseRef> <headRef>`
// Diffs `baseRef...headRef` (git's triple-dot = changes on headRef since it diverged from baseRef — the
// PR's own diff, exactly what GitHub would show), reads before/after content of the one store file, and
// applies checkFlipDiff. Exits non-zero + prints `::error::` on any rejection — the caller (flip-done.yml)
// must treat any non-zero exit as "do not approve", full stop.
async function main() {
  const [issueId, expectedMergeSha, baseRef, headRef] = process.argv.slice(2);
  if (!issueId || !expectedMergeSha || !baseRef || !headRef) {
    console.error('usage: check-flip-diff.ts <issueId> <expectedMergeSha> <baseRef> <headRef>');
    process.exit(2);
  }

  const mergeBase = git(['merge-base', baseRef, headRef]);
  const changedFiles = git(['diff', '--name-only', `${mergeBase}..${headRef}`])
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const expectedPath = `${STORE_DIR}/${issueId}.md`;
  const beforeText = (() => {
    try {
      return execFileSync('git', ['show', `${mergeBase}:${expectedPath}`], { encoding: 'utf8' });
    } catch {
      return null;
    }
  })();
  const afterText = (() => {
    try {
      return execFileSync('git', ['show', `${headRef}:${expectedPath}`], { encoding: 'utf8' });
    } catch {
      return '';
    }
  })();

  const result = checkFlipDiff({ issueId, expectedMergeSha, changedFiles, beforeText, afterText });
  // `'reason' in result` (not `!result.ok`): this repo's check:public-agent tsc invocation runs WITHOUT
  // --strict/--strictNullChecks, under which plain `if (!result.ok)` does not narrow the discriminated
  // union (TS2339 on `.reason`) — the `in` operator narrows regardless of strictNullChecks.
  if ('reason' in result) {
    console.error(`::error::check-flip-diff: REJECTED — ${result.reason}`);
    process.exit(1);
  }
  console.log(`check-flip-diff: OK — ${expectedPath} changed only state:->done + PR:->${expectedMergeSha}`);
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(`::error::check-flip-diff: fatal — ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
