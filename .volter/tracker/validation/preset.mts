// The simple-sdlc preset — the lean, standards-following baseline (`ztrack init` installs this;
// `default` is an alias for it). One AC type (dev), commit+proof evidence (image optional), five
// issue states, every issue assigned, an opt-in dependency (block) graph. Built exactly on the
// architecture: ONE strict Zod schema, mdast fills it, rules validate it against the injected git world.
//
// PR-FREE by design: it never requires a pull request, so it runs on a private/local repo with no
// remote. Acceptance is the review's VERDICT over commit-evidence — done = every AC passed-with-evidence
// (an independent reviewer flips the state; that independence is the orchestrator's concern, not a gate).
// For the PR-based process (review on a PR, world + sources), see simple-gh-sdlc.ts.
//
// Lifecycle gates (the process):
//   draft        — nothing required yet
//   ready        — at least one dev AC exists
//   in-progress  — at least one dev AC exists
//   in-review    — every AC passed; every passed AC has fresh commit-evidence
//   done         — terminal (all ACs passed; the reviewer's verdict moved it here)

// A STANDALONE preset: imports ONLY the public mechanism from `ztrack/preset-kit`
// (no `../core/*`, no `mdast-*`, no `zod`). Its OWN schema, parser, and rules live here.
import {
  z, toMdast, nodeText, type MdNode,
  check as runCheck, rule, gitWorld, gitFileExistsAtCommit, gitCommitFiles, relevanceMode, formatRef, BlockRefSchema,
  normalizeBlockRefs, parseBlockToken,
  type BlockerFact, type BlockRef, type CompletionFact, type Context, type CycleFact,
  type DerivedModel, type Finding, type IssueColumns, type IssueRecord, type ParseDiagnostic, type Preset, type PresetContextInput, type RawBlockRef,
} from 'ztrack/preset-kit';

// ── the hard schema (core + preset-specific, all strict) ────────────────────
export const DefaultEvidenceSchema = z.object({
  id: z.string().min(1),                              // core
  // OPTIONAL: the backbone of evidence is commit + proof. An image/artifact is an optional
  // attachment — a repo PATH (verified to exist at the commit), a `sha256:` blob ref, or a URL
  // (a tracker attachment / release asset, pinned by `sha256` below and fetch-verified by
  // `ztrack evidence verify`, not on every check — keeps the gate offline/deterministic).
  image: z.string().regex(/^\S+$/, 'image must be a single whitespace-free token').optional(),
  sha256: z.string().regex(/^sha256:[0-9a-f]{64}$/, 'sha256 must be sha256:<64-hex>').optional(), // digest pin for a URL/external image
  commit: z.string().regex(/^[0-9a-f]{7,40}$/),       // preset: captured at this commit
  acVersion: z.number().int().min(1),                 // preset: against this AC version
}).strict();

// proof primitive — explanation of how the cited evidence demonstrates the AC
export const DefaultProofSchema = z.object({
  explanation: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)),
}).strict();

export const DefaultAcStatusSchema = z.enum(['pending', 'passed', 'failed']);
export const DefaultAcSchema = z.object({
  id: z.string().min(1),                              // core
  status: DefaultAcStatusSchema,                       // core (preset narrows)
  checked: z.boolean(),                                // preset: the GFM checkbox (guarded vs status)
  text: z.string().min(1),                            // preset
  version: z.number().int().min(1),                   // preset: bumps when AC text changes
  evidence: z.array(DefaultEvidenceSchema),           // core
  proof: DefaultProofSchema.optional(),               // primitive (rule requires it for passed)
  blockedBy: z.array(BlockRefSchema).optional(),      // primitive: nodes that gate this one
  blocks: z.array(BlockRefSchema).optional(),         // primitive: nodes this one gates
  // OPTIONAL relevance anchor: the repo paths this AC's work concerns (globs ok: *, **). When set,
  // a passed AC's cited commit must TOUCH one of them — so an unrelated real commit can't pass.
  paths: z.array(z.string().min(1)).optional(),
}).strict();

// primitives the default SDLC implements (issue-level)
export const DefaultRelationSchema = z.object({
  type: z.enum(['blocks', 'blocked-by', 'relates']),
  issueId: z.string().min(1),
}).strict();
export const DefaultIssueStatusSchema = z.enum(['draft', 'ready', 'in-progress', 'in-review', 'done']);
export const DefaultIssueSchema = z.object({
  id: z.string().min(1),                              // core
  title: z.string().min(1),                           // core
  summary: z.string(),                                // core
  status: DefaultIssueStatusSchema,                    // core (narrowed)
  assignee: z.string(),                               // preset (rule enforces non-empty)
  acceptanceCriteria: z.array(DefaultAcSchema),       // core
  labels: z.array(z.string().min(1)).optional(),               // primitive
  relations: z.array(DefaultRelationSchema).optional(),         // primitive
  children: z.array(z.string().min(1)).optional(),             // primitive
  // unknown `## X` body sections (not Acceptance Criteria / Waivers) are CARRIED verbatim so
  // a patch/fmt round-trip never silently drops human-authored prose. (This preset CHOOSES to
  // carry; another could reject.) Each entry is the raw `## …` section markdown — kept split by
  // POSITION (before vs after "## Acceptance Criteria"), not just content, so `serializeIssue`
  // re-emits each where it originally sat instead of pushing everything to the end (ZTB-5).
  notes: z.array(z.string().min(1)).optional(),          // unknown sections AFTER "## Acceptance Criteria"
  notesBefore: z.array(z.string().min(1)).optional(),    // unknown sections BEFORE "## Acceptance Criteria"
  // BARE LEADING PROSE: content before the FIRST "## " heading of any kind that is not a
  // recognized metadata line (Summary:/Children:/Blocks:/Blocked by:/Relates:) is CARRIED
  // verbatim — same rationale as notes/notesBefore above: this preset CHOOSES to carry so a
  // patch/fmt round-trip never silently drops human-authored prose. This is the
  // pre-first-"##"-heading complement of notes/notesBefore: notesBefore carries unknown `## X`
  // sections that sit before "## Acceptance Criteria"; `prose` carries whatever plain preamble
  // (paragraphs, a stray checkbox, a `###` sub-heading, a code fence, …) sits before even the
  // first `## ` heading, i.e. before notesBefore's sections begin.
  prose: z.string().min(1).optional(),
}).strict();

export const DefaultRootSchema = z.object({ issues: z.array(DefaultIssueSchema) }).strict();
export type DefaultRoot = z.infer<typeof DefaultRootSchema>;

// ── mdast parse: markdown -> the schema shape (designated-position, no mining) ─
// MdNode / toMdast / nodeText are rented from the kit (shared mdast mechanism).
function firstParagraphText(item: MdNode): string {
  const p = (item.children ?? []).find((c) => c.type === 'paragraph');
  // Take the AC's first line only: the single-line `parseAcLine` regexes can't span a
  // soft-wrapped continuation line, which would otherwise swallow the whole wrapped
  // text into the id and lose the version (matches spec.ts behavior).
  return p ? (nodeText(p).trim().split('\n')[0] ?? '') : '';
}
function splitIdTitle(headingText: string): { id: string; title: string } {
  const m = /^(\S+):\s*(.+)$/.exec(headingText.trim());
  return m ? { id: m[1]!, title: m[2]!.trim() } : { id: headingText.trim(), title: headingText.trim() };
}
function splitList(s: string): string[] {
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

// the AC line: "<id> v<version> <text>"  (version optional -> schema flags absence)
// Evidence line: `evidence <id>: [image=…] [sha256=…] commit=<sha> acv=<n>`, fields in ANY order.
// Order-independence is a SECURITY property, not a nicety: if an `image=` written AFTER `commit=`
// were dropped (as an ordered regex would), a fabricated screenshot in that order would sail
// through the gate unverified — exactly the tampering this preset exists to catch. So tokenize.
function parseEvidenceLine(line: string): { id: string; image?: string; sha256?: string; commit: string; acVersion: number } | null {
  const head = /^evidence\s+(\S+):\s*(.+)$/i.exec(line);
  if (!head) return null;
  const f: Record<string, string> = {};
  for (const tok of head[2]!.trim().split(/\s+/)) {
    const eq = tok.indexOf('=');
    if (eq > 0) f[tok.slice(0, eq).toLowerCase()] = tok.slice(eq + 1);
  }
  if (!f.commit || !/^[0-9a-fA-F]+$/.test(f.commit) || f.acv === undefined || !/^\d+$/.test(f.acv)) return null;
  return { id: head[1]!, ...(f.image ? { image: f.image } : {}), ...(f.sha256 ? { sha256: f.sha256 } : {}), commit: f.commit.toLowerCase(), acVersion: Number(f.acv) };
}

// `malformed: true` marks the whole-line fallback: neither AC grammar matched, so the entire
// line became the id — unaddressable by `ac patch` and unable to match a `blocked-by:` ref.
// The caller emits `ac_id_malformed` when it sees this flag.
function parseAcLine(line: string): { id: string; version?: number; text: string; malformed?: boolean } {
  const withV = /^(\S+)\s+v(\d+)\s+(.+)$/.exec(line);
  if (withV) return { id: withV[1]!, version: Number(withV[2]), text: withV[3]!.trim() };
  const noV = /^(\S+)\s+(.+)$/.exec(line);
  if (noV) return { id: noV[1]!, text: noV[2]!.trim() };
  return { id: line, text: line, malformed: true };
}

// mdast's runtime nodes carry `position` (line/column) though the kit's MdNode type doesn't
// declare it (kept minimal); read it defensively for diagnostic messages only.
function nodeLine(node: MdNode): number | undefined {
  return (node as { position?: { start?: { line?: number } } }).position?.start?.line;
}

// A non-checkbox content node (a bare paragraph, a blockquote, or a plain — non-checkbox — list
// item) sitting INSIDE a recognized "## Acceptance Criteria" section is not modeled as an AC:
// ZTB-1 made a checkbox item OUTSIDE the section loud (`ac_outside_section`); this is the
// section's own interior blind spot — such content had no diagnostic and no model trace at all
// (verified live 2026-07-02). `ac patch`/`issue edit`/`fmt` refuse to write an issue carrying this
// diagnostic (see modelEdit.ts's `parseOneIssue`) rather than silently drop the content on
// reserialize (ZTB-15's round-trip fix: fail closed, not grow the model to track interior-prose
// position — see the module-level note there for why).
function proseInSectionMessage(issueId: string, text: string, line?: number): string {
  const excerpt = (text.trim().split('\n')[0] ?? '').slice(0, 60);
  return `Issue ${issueId} has content inside a "## Acceptance Criteria" section that is not a checkbox AC item${line ? ` (line ${line})` : ''}: "${excerpt}" — \`ac patch\`/\`issue edit\`/\`fmt\` refuse to write this issue until it is moved out of the AC section or turned into a checkbox AC line ("- [ ] <id> v<version> <text>").`;
}

// Carve out unknown top-level `## X` sections (anything but Acceptance Criteria / the core
// Waivers section) so the known structure parses normally and the rest round-trips verbatim —
// AND record whether each carved section sat BEFORE or AFTER "## Acceptance Criteria" in the
// original body, so `serializeIssue` can put it back where it was instead of always appending
// it at the end (ZTB-5: position, not just content, must survive an unmodified round trip).
function splitNotes(body: string): { known: string; notesBefore: string[]; notesAfter: string[] } {
  const known: string[] = [];
  const notesBefore: string[] = [];
  const notesAfter: string[] = [];
  let cur: string[] | null = null;
  let sawAc = false; // has the (first) "## Acceptance Criteria" heading been emitted into `known` yet?
  const flush = () => { if (cur) { (sawAc ? notesAfter : notesBefore).push(cur.join('\n').trim()); cur = null; } };
  for (const line of body.split('\n')) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      flush();
      const name = h[1]!.toLowerCase();
      if (/^acceptance criteria/.test(name)) { known.push(line); sawAc = true; continue; }
      if (/^waivers\b/.test(name)) { known.push(line); continue; }
      cur = [line]; // start carrying an unknown section
      continue;
    }
    if (cur) cur.push(line); else known.push(line);
  }
  flush();
  return { known: known.join('\n'), notesBefore: notesBefore.filter(Boolean), notesAfter: notesAfter.filter(Boolean) };
}

// Per-line metadata patterns recognized in the preamble paragraph scan below (kept in sync with
// the mdast metadata regexes in `parseDefaultIssue`'s paragraph branch — Summary/Children/
// Blocks/Blocked by/Relates). Used ONLY to decide which preamble lines are metadata (and so
// excluded from `prose`); the mdast scan itself is untouched.
const PREAMBLE_METADATA_PATTERNS: RegExp[] = [
  /^Summary:\s*(.+)$/i,
  /^Children:\s*(.+)$/i,
  /^Blocks:\s*(.+)$/i,
  /^Blocked by:\s*(.+)$/i,
  /^Relates:\s*(.+)$/i,
];

// Bare leading prose: the lines of `known` BEFORE its first "## " heading (or the whole of
// `known` if it has none), with recognized metadata lines dropped and leading/trailing blank
// lines trimmed — internal structure (blank lines, indentation) is otherwise preserved verbatim.
function extractProse(known: string, metadataPatterns: RegExp[]): string | undefined {
  const lines = known.split('\n');
  const headingIdx = lines.findIndex((line) => /^##\s/.test(line));
  const preamble = headingIdx === -1 ? lines : lines.slice(0, headingIdx);
  const kept = preamble.filter((line) => !metadataPatterns.some((re) => re.test(line)));
  let start = 0;
  let end = kept.length;
  while (start < end && kept[start]!.trim() === '') start++;
  while (end > start && kept[end - 1]!.trim() === '') end--;
  const trimmed = kept.slice(start, end);
  return trimmed.length ? trimmed.join('\n') : undefined;
}

function parseDefaultIssue(record: IssueRecord, diagnostics?: ParseDiagnostic[]): Record<string, unknown> {
  // Metadata comes STRUCTURED from the record's columns; only the content (summary, pr,
  // relations, ACs) is parsed out of the body markdown. id/title/status/assignee/labels are
  // never re-derived from synthesized markdown. Unknown `## X` sections and bare leading
  // prose are carried verbatim.
  const issue: Record<string, unknown> = {
    id: record.id, title: record.title, status: record.status || 'draft',
    assignee: record.assignee ?? '', summary: '', acceptanceCriteria: [],
    ...(record.labels?.length ? { labels: record.labels } : {}),
  };
  const { known, notesBefore, notesAfter } = splitNotes(record.body);
  if (notesBefore.length) issue.notesBefore = notesBefore;
  if (notesAfter.length) issue.notes = notesAfter;
  const prose = extractProse(known, PREAMBLE_METADATA_PATTERNS);
  if (prose) issue.prose = prose;
  const tree = toMdast(known);
  let inAc = false;
  let sawAcSection = false;
  // Accumulated across EVERY AC-matching heading/list encountered — append, not assign, so a
  // second `## Acceptance Criteria` section merges instead of silently replacing the first.
  const acs: unknown[] = [];

  for (const node of tree.children ?? []) {
    if (node.type === 'heading') {
      const isAc = /acceptance criteria/i.test(nodeText(node));
      if (isAc && sawAcSection) {
        diagnostics?.push({
          code: 'ac_sections_multiple', issueId: record.id,
          message: `Issue ${record.id} has more than one "## Acceptance Criteria" heading; ACs from every section are merged (append) — none are discarded.`,
        });
      }
      if (isAc) sawAcSection = true;
      inAc = isAc;
      continue;
    }
    if (node.type === 'paragraph') {
      const text = nodeText(node);
      const summary = /^Summary:\s*(.+)$/im.exec(text)?.[1]?.trim();
      if (summary) issue.summary = summary;
      const children = /^Children:\s*(.+)$/im.exec(text)?.[1];
      if (children) issue.children = splitList(children);
      const relations: unknown[] = [];
      for (const m of text.matchAll(/^Blocks:\s*(.+)$/gim)) for (const id of splitList(m[1]!)) relations.push({ type: 'blocks', issueId: id });
      for (const m of text.matchAll(/^Blocked by:\s*(.+)$/gim)) for (const id of splitList(m[1]!)) relations.push({ type: 'blocked-by', issueId: id });
      for (const m of text.matchAll(/^Relates:\s*(.+)$/gim)) for (const id of splitList(m[1]!)) relations.push({ type: 'relates', issueId: id });
      if (relations.length) issue.relations = relations;
      if (inAc) {
        diagnostics?.push({
          code: 'ac_prose_in_section', issueId: record.id,
          message: proseInSectionMessage(record.id, text, nodeLine(node)),
        });
      }
      continue;
    }
    if (node.type === 'blockquote' && inAc) {
      diagnostics?.push({
        code: 'ac_prose_in_section', issueId: record.id,
        message: proseInSectionMessage(record.id, nodeText(node), nodeLine(node)),
      });
      continue;
    }
    if (node.type === 'list' && !inAc) {
      // A checkbox item outside any recognized AC section vanishes from the model with no
      // trace today — loud it instead of silent.
      for (const item of node.children ?? []) {
        if (item.type !== 'listItem' || item.checked == null) continue;
        const text = firstParagraphText(item);
        const line = nodeLine(item);
        diagnostics?.push({
          code: 'ac_outside_section', issueId: record.id,
          message: `Issue ${record.id} has a checkbox item outside any "## Acceptance Criteria" section${line ? ` (line ${line})` : ''}: "${text.slice(0, 60)}"`,
        });
      }
      continue;
    }
    if (node.type === 'list' && inAc) {
      for (const item of node.children ?? []) {
        if (item.type !== 'listItem') continue;
        if (item.checked == null) {
          // A plain (non-checkbox) list item inside a recognized AC section is prose, not an
          // AC — loud it instead of silently mangling it into a bogus AC id/text (ZTB-15).
          diagnostics?.push({
            code: 'ac_prose_in_section', issueId: record.id,
            message: proseInSectionMessage(record.id, firstParagraphText(item), nodeLine(item)),
          });
          continue;
        }
        const { id, version, text, malformed } = parseAcLine(firstParagraphText(item));
        if (malformed) {
          diagnostics?.push({
            code: 'ac_id_malformed', issueId: record.id,
            message: `Issue ${record.id}: AC line matched neither "<id> v<version> <text>" nor "<id> <text>", so the whole line became the id "${id.slice(0, 80)}" — unaddressable by \`ac patch\` and unable to match a \`blocked-by:\` ref.`,
          });
        }
        const checked = item.checked === true;
        let status: string | undefined;
        let proof: unknown;
        const evidence: unknown[] = [];
        const paths: string[] = [];
        const blockedBy: RawBlockRef[] = [];
        const blocks: RawBlockRef[] = [];
        const rawList = (raw: string): RawBlockRef[] =>
          splitList(raw).map((t) => parseBlockToken(t, issue.id as string)).filter((r): r is RawBlockRef => r !== null);
        const nested = (item.children ?? []).find((c) => c.type === 'list');
        for (const sub of nested?.children ?? []) {
          const line = firstParagraphText(sub);
          const st = /^status:\s*([\w-]+)/i.exec(line)?.[1];
          if (st) { status = st.toLowerCase(); continue; }
          const ev = parseEvidenceLine(line);
          if (ev) { evidence.push(ev); continue; }
          // proof: "<explanation>" -> ev1, ev2 — match the QUOTED explanation greedily so a
          // '->' (or a quote) inside the explanation survives; fall back to an unquoted form.
          const pf = /^proof:\s*"(.*)"\s*->\s*(.+)$/i.exec(line) ?? /^proof:\s*(.+?)\s*->\s*(.+)$/i.exec(line);
          if (pf) { proof = { explanation: pf[1]!.trim().replace(/^"|"$/g, ''), evidenceRefs: splitList(pf[2]!) }; continue; }
          // blocking: bare id (this issue's AC, or an issue) or `issue:ac`, comma-listed
          const bb = /^blocked-by:\s*(.+)$/i.exec(line);
          if (bb) { blockedBy.push(...rawList(bb[1]!)); continue; }
          const bk = /^blocks:\s*(.+)$/i.exec(line);
          if (bk) { blocks.push(...rawList(bk[1]!)); continue; }
          const pa = /^paths:\s*(.+)$/i.exec(line);
          if (pa) { paths.push(...splitList(pa[1]!)); continue; }
        }
        // status defaults from the checkbox; an explicit line can override (and is then guarded by a rule)
        if (!status) status = checked ? 'passed' : 'pending';
        const ac: Record<string, unknown> = { id, status, checked, text, evidence };
        if (version !== undefined) ac.version = version;
        if (proof !== undefined) ac.proof = proof;
        if (paths.length) ac.paths = paths;
        if (blockedBy.length) ac.blockedBy = blockedBy;
        if (blocks.length) ac.blocks = blocks;
        acs.push(ac);
      }
      continue;
    }
  }
  issue.acceptanceCriteria = acs;
  return issue;
}

// The root: each issue's metadata is structured (its record's columns); content is parsed
// from its body. Takes all records so bare blocking refs are classified once the whole
// tracker is known.
export function parseDefault(records: IssueRecord[]): unknown {
  const diagnostics: ParseDiagnostic[] = [];
  const issues = records.map((r) => parseDefaultIssue(r, diagnostics));
  normalizeBlockRefs(issues as unknown as Parameters<typeof normalizeBlockRefs>[0]);
  // No `diagnostics` key at all when empty — a preset returning none behaves exactly as today
  // (see engine.ts's `check()`, which strips the key before schema validation when present).
  return diagnostics.length ? { issues, diagnostics } : { issues };
}

// ── serialize: the validated issue -> its STORED form (inverse of parse) ─────
// The metadata (id/title/status/assignee/labels) goes to the backend `columns`; only the
// content (summary, pr, relations, children, ACs) is rendered into the `body`. Mutations
// parse -> change the object -> serialize -> write {body, columns}, so the body never carries
// a duplicate copy of the metadata (no split-brain) and the columns stay authoritative.
export function serializeIssue(issue: DefaultRoot['issues'][number]): { body: string; columns: IssueColumns } {
  const out: string[] = [];
  if (issue.summary) out.push(`Summary: ${issue.summary}`);
  if (issue.children?.length) out.push(`Children: ${issue.children.join(', ')}`);
  const rel = (t: string) => (issue.relations ?? []).filter((r) => r.type === t).map((r) => r.issueId);
  if (rel('blocks').length) out.push(`Blocks: ${rel('blocks').join(', ')}`);
  if (rel('blocked-by').length) out.push(`Blocked by: ${rel('blocked-by').join(', ')}`);
  if (rel('relates').length) out.push(`Relates: ${rel('relates').join(', ')}`);
  // bare leading prose (see the `prose` schema comment) is re-emitted right after the metadata
  // lines and before notesBefore's sections — the same canonical-spacing pattern as the
  // notesBefore loop below, so it round-trips without churn.
  if (issue.prose) { if (out.length) out.push(''); out.push(issue.prose); }
  // unknown sections that sat BEFORE "## Acceptance Criteria" go back there — separated by
  // exactly one blank line (the canonical spacing `splitNotes` normalizes everything to), so
  // POSITION survives an unmodified round trip, not just content (ZTB-5).
  for (const note of issue.notesBefore ?? []) { if (out.length) out.push(''); out.push(note); }
  if (out.length) out.push('');
  out.push('## Acceptance Criteria', '');
  for (const ac of issue.acceptanceCriteria) {
    out.push(`- [${ac.checked ? 'x' : ' '}] ${ac.id} v${ac.version} ${ac.text}`);
    out.push(`  - status: ${ac.status}`);
    for (const ev of ac.evidence) out.push(`  - evidence ${ev.id}: ${ev.image ? `image=${ev.image} ` : ''}${ev.sha256 ? `sha256=${ev.sha256} ` : ''}commit=${ev.commit} acv=${ev.acVersion}`);
    if (ac.proof) out.push(`  - proof: "${ac.proof.explanation}" -> ${ac.proof.evidenceRefs.join(', ')}`);
    // render refs relatively (bare) when they target this issue's own AC, absolutely
    // otherwise; an issue-level ref (no `ac`) is just the issue id.
    const renderRef = (r: BlockRef) => (r.ac !== undefined && r.issue === issue.id ? r.ac : formatRef(r));
    if (ac.paths?.length) out.push(`  - paths: ${ac.paths.join(', ')}`);
    if (ac.blockedBy?.length) out.push(`  - blocked-by: ${ac.blockedBy.map(renderRef).join(', ')}`);
    if (ac.blocks?.length) out.push(`  - blocks: ${ac.blocks.map(renderRef).join(', ')}`);
  }
  // unknown sections that sat AFTER "## Acceptance Criteria" (the common case: appendices/notes) stay after it.
  for (const note of issue.notes ?? []) out.push('', note);
  const columns: IssueColumns = {
    title: issue.title, status: issue.status,
    ...(issue.assignee ? { assignee: issue.assignee } : {}),
    ...(issue.labels ? { labels: issue.labels } : {}),
  };
  return { body: out.join('\n') + '\n', columns };
}

// ── rules: declarative records over the engine's derived model ───────────────
// Each rule SELECTS a list off the analyzed model — a per-item scope (issues / acs /
// evidence), a universal aggregate (duplicate ids), an engine-derived graph fact, or
// one of THIS preset's own derived facts — and DESCRIBES each match. The block-graph
// algorithms and id aggregates are computed once by the engine; this preset adds only
// relation reciprocity and dangling proof references (see deriveDefault).
const STATE_RANK: Record<DefaultRoot['issues'][number]['status'], number> = {
  draft: 0, ready: 1, 'in-progress': 2, 'in-review': 3, done: 4,
};

type Issue = DefaultRoot['issues'][number];
type AC = Issue['acceptanceCriteria'][number];
type Evidence = AC['evidence'][number];

// shas may be short (7+) or full (40); a match is either being a prefix of the other
const shaMatches = (a: string, b: string) => a.startsWith(b) || b.startsWith(a);

interface RelationProblem { issueId: string; kind: 'missing' | 'reciprocal'; relType: string; target: string }
interface ProofRefProblem { issueId: string; acId: string; ref: string }

// This preset's OWN analyzed facts. Everything universal — duplicate ids, the unified
// block graph (cycles, blocker problems, completion violations) — already arrives on the
// core model; only cross-issue relation reciprocity and dangling proof references are
// default-specific, so they are derived here.
function deriveDefault(model: DerivedModel<DefaultRoot>): { relationProblems: RelationProblem[]; proofRefProblems: ProofRefProblem[] } {
  const ids = new Set(model.root.issues.map((i) => i.id));
  const has = (id: string, type: string, target: string) =>
    (model.root.issues.find((i) => i.id === id)?.relations ?? []).some((r) => r.type === type && r.issueId === target);
  const relationProblems: RelationProblem[] = [];
  for (const i of model.root.issues) {
    for (const r of i.relations ?? []) {
      if (!ids.has(r.issueId)) { relationProblems.push({ issueId: i.id, kind: 'missing', relType: r.type, target: r.issueId }); continue; }
      if (r.type === 'blocks' && !has(r.issueId, 'blocked-by', i.id)) relationProblems.push({ issueId: i.id, kind: 'reciprocal', relType: 'blocks', target: r.issueId });
      if (r.type === 'blocked-by' && !has(r.issueId, 'blocks', i.id)) relationProblems.push({ issueId: i.id, kind: 'reciprocal', relType: 'blocked-by', target: r.issueId });
    }
  }
  const proofRefProblems: ProofRefProblem[] = [];
  for (const issue of model.root.issues) {
    for (const ac of issue.acceptanceCriteria) {
      if (ac.status !== 'passed' || !ac.proof || ac.proof.explanation.trim() === '' || ac.proof.evidenceRefs.length === 0) continue;
      const evIds = new Set(ac.evidence.map((e) => e.id));
      for (const ref of ac.proof.evidenceRefs.filter((r) => !evIds.has(r))) proofRefProblems.push({ issueId: issue.id, acId: ac.id, ref });
    }
  }
  return { relationProblems, proofRefProblems };
}
// Typed view of this preset's derived facts — the one place the engine's open
// `derived` bag is narrowed to what deriveDefault produced; selects stay cast-free.
type DefaultFacts = { relationProblems: RelationProblem[]; proofRefProblems: ProofRefProblem[] };
const facts = (m: DerivedModel<DefaultRoot>): DefaultFacts => m.derived as unknown as DefaultFacts;

const DEFAULT_RULES = [
  // wellformedness over single items + universal id aggregates
  rule<DefaultRoot, { issueId: string; issue: Issue }>({
    code: 'issue_missing_assignee', select: (m) => m.issues,
    when: ({ issue }) => issue.assignee.trim() === '',
    message: ({ issue }) => `Issue ${issue.id} has no assignee.`,
  }),
  rule<DefaultRoot, { issueId: string; acId: string; ac: AC }>({
    code: 'ac_checkbox_status_mismatch', select: (m) => m.acs,
    when: ({ ac }) => (ac.checked && ac.status !== 'passed') || (!ac.checked && ac.status === 'passed'),
    message: ({ ac }) => `AC ${ac.id} checkbox (${ac.checked ? '[x]' : '[ ]'}) disagrees with status "${ac.status}".`,
  }),
  rule<DefaultRoot, { issueId: string; acId: string }>({
    code: 'duplicate_ac_id', select: (m) => m.duplicateAcIds,
    message: ({ acId }) => `Duplicate AC id ${acId}.`,
  }),
  rule<DefaultRoot, { issueId: string }>({
    code: 'duplicate_issue_id', select: (m) => m.duplicateIssueIds,
    message: ({ issueId }) => `Duplicate issue id ${issueId}.`,
  }),

  // evidence + proof
  rule<DefaultRoot, { issueId: string; acId: string; ac: AC }>({
    code: 'passed_ac_missing_evidence', select: (m) => m.acs,
    when: ({ ac }) => ac.status === 'passed' && ac.evidence.length === 0,
    message: ({ ac }) => `AC ${ac.id} is passed but has no evidence (cite a commit, optionally an image, and a proof).`,
  }),
  rule<DefaultRoot, { issueId: string; acId: string; ac: AC }>({
    // RELEVANCE (opt-in via `paths`): a passed AC's cited commit(s) must TOUCH one of the paths the
    // AC declares — a deterministic partial close of the relevance gap (an unrelated real commit
    // touches none of them). Only fires when paths are declared AND the commit's files resolved
    // (so a missing commit is reported once, by evidence_commit_not_found, not double-flagged).
    code: 'evidence_commit_unrelated', select: (m) => m.acs,
    when: ({ ac }, m) => {
      if (ac.status !== 'passed' || !ac.paths?.length || !ac.evidence.length) return false;
      const cf = m.context.git?.commitFiles;
      if (!cf) return false;
      const touched = ac.evidence.flatMap((ev) => cf[ev.commit] ?? []);
      if (!touched.length) return false;   // no resolved file info → don't false-flag
      return !touched.some((f) => ac.paths!.some((p) => pathMatches(p, f)));
    },
    message: ({ ac }) => `AC ${ac.id} is passed, but its cited commit touches none of its declared paths (${ac.paths!.join(', ')}) — the commit is unrelated to the claimed work.`,
  }),
  rule<DefaultRoot, { issueId: string; acId: string; ac: AC }>({
    // RELEVANCE ENFORCEMENT (config.relevance: required): turn the opt-in `paths` anchor into a
    // mandate, so EVERY passed AC is relevance-checked (not just ones that opted in). Off by
    // default (ctx.relevance === undefined/'optional') → never fires; existing repos unaffected.
    code: 'passed_ac_missing_paths', select: (m) => m.acs,
    when: ({ ac }, m) => m.context.relevance === 'required' && ac.status === 'passed' && !ac.paths?.length,
    message: ({ ac }) => `AC ${ac.id} is passed but declares no \`paths:\` — relevance enforcement is on (config.relevance: required); declare the repo paths this AC's work touches so its commit is relevance-checked.`,
  }),
  rule<DefaultRoot, { issueId: string; acId: string; ac: AC }>({
    code: 'passed_ac_missing_proof', select: (m) => m.acs,
    when: ({ ac }) => ac.status === 'passed' && (!ac.proof || ac.proof.explanation.trim() === ''),
    message: ({ ac }) => `AC ${ac.id} is passed but has no proof explaining how its evidence demonstrates it.`,
  }),
  rule<DefaultRoot, { issueId: string; acId: string; ac: AC }>({
    code: 'proof_cites_no_evidence', select: (m) => m.acs,
    when: ({ ac }) => ac.status === 'passed' && !!ac.proof && ac.proof.explanation.trim() !== '' && ac.proof.evidenceRefs.length === 0,
    message: ({ ac }) => `AC ${ac.id} proof cites no evidence.`,
  }),
  rule<DefaultRoot, ProofRefProblem>({
    code: 'proof_evidence_ref_missing', select: (m) => facts(m).proofRefProblems,
    message: ({ acId, ref }) => `AC ${acId} proof references evidence "${ref}", which does not exist on the AC.`,
  }),
  rule<DefaultRoot, { issueId: string; acId: string; evidenceId: string; ev: Evidence }>({
    code: 'evidence_commit_not_found', select: (m) => m.evidence,
    when: ({ ev }, m) => { const c = m.context.git?.existingCommits; return !!c && !c.some((x) => shaMatches(x, ev.commit)); },
    message: ({ ev }) => `Evidence ${ev.id} cites commit ${ev.commit}, which does not exist.`,
    subject: ({ ev }) => ev.commit,  // the missing sha — a `ref:` waiver pins to exactly this occurrence
  }),
  rule<DefaultRoot, { issueId: string; acId: string; evidenceId: string; ev: Evidence }>({
    // A cited image PATH must actually be in the tree at the commit it claims — not just a string.
    // Only fires when the commit EXISTS (a missing commit is `evidence_commit_not_found`) and the
    // file was resolved as absent; `sha256:` blob refs and image-less evidence are untouched.
    code: 'evidence_file_not_found', select: (m) => m.evidence,
    when: ({ ev }, m) => {
      const blobs = m.context.git?.evidenceBlobs; const commits = m.context.git?.existingCommits;
      if (!ev.image || /^(sha256:|https?:\/\/)/i.test(ev.image) || !blobs || !commits || !commits.some((x) => shaMatches(x, ev.commit))) return false;
      return blobs[`${ev.commit}:${ev.image}`] === false;
    },
    message: ({ ev }) => `Evidence ${ev.id} cites file "${ev.image}" at commit ${ev.commit}, but that file is not in the tree at that commit.`,
  }),
  rule<DefaultRoot, { issueId: string; acId: string; evidenceId: string; ac: AC; ev: Evidence }>({
    code: 'evidence_ac_version_stale', select: (m) => m.evidence,
    when: ({ ac, ev }) => ev.acVersion !== ac.version,
    message: ({ ac, ev }) => `Evidence ${ev.id} is for AC ${ac.id} v${ev.acVersion}, but the AC is now v${ac.version}.`,
  }),

  // lifecycle gates — the omnibus state_gates rule, decomposed into named records
  rule<DefaultRoot, { issueId: string; issue: Issue }>({
    code: 'ready_requires_dev_ac', select: (m) => m.issues,
    when: ({ issue }) => STATE_RANK[issue.status] >= STATE_RANK.ready && issue.acceptanceCriteria.length === 0,
    message: ({ issue }) => `Issue ${issue.id} is "${issue.status}" but has no dev ACs.`,
  }),
  rule<DefaultRoot, { issueId: string; issue: Issue }>({
    code: 'review_requires_all_acs_passed', select: (m) => m.issues,
    when: ({ issue }) => STATE_RANK[issue.status] >= STATE_RANK['in-review'] && issue.acceptanceCriteria.some((ac) => ac.status !== 'passed'),
    message: ({ issue }) => `Issue ${issue.id} is "${issue.status}" but not all ACs are passed.`,
  }),

  // relations (cross-issue, derived by this preset) — select the source, filter with when
  rule<DefaultRoot, RelationProblem>({
    code: 'relation_target_missing', select: (m) => facts(m).relationProblems, when: (p) => p.kind === 'missing',
    message: ({ issueId, relType, target }) => `Issue ${issueId} ${relType} ${target}, which does not exist.`,
  }),
  rule<DefaultRoot, RelationProblem>({
    code: 'relation_not_reciprocal', severity: 'warning', select: (m) => facts(m).relationProblems, when: (p) => p.kind === 'reciprocal',
    message: ({ issueId, relType, target }) => relType === 'blocks'
      ? `Issue ${issueId} blocks ${target} but ${target} does not list "Blocked by: ${issueId}".`
      : `Issue ${issueId} is blocked by ${target} but ${target} does not list "Blocks: ${issueId}".`,
  }),

  // blocking graph — analyzed once by the engine, declared here over its fact types
  rule<DefaultRoot, BlockerFact>({
    code: 'ac_self_block', select: (m) => m.graph.blockerProblems, when: (b) => b.kind === 'self',
    message: (b) => `AC ${formatRef({ issue: b.issueId, ac: b.acId })} lists itself as a blocker.`,
  }),
  rule<DefaultRoot, BlockerFact>({
    code: 'ac_blocker_missing', select: (m) => m.graph.blockerProblems, when: (b) => b.kind !== 'self',
    message: (b) => `AC ${formatRef({ issue: b.issueId, ac: b.acId })} references ${b.refText}, which does not exist.`,
  }),
  rule<DefaultRoot, CycleFact>({
    code: 'ac_block_cycle', select: (m) => m.graph.cycles,
    message: ({ cycle }) => `Blocking cycle: ${cycle.join(' → ')} → ${cycle[0]} can never be satisfied.`,
  }),
  rule<DefaultRoot, CompletionFact>({
    code: 'ac_blocked_by_unpassed', select: (m) => m.graph.completionViolations,
    message: ({ nodeKey, depKey, depStatus }) => `${nodeKey} is done but depends on ${depKey} (status "${depStatus}").`,
  }),
];

// ZTB-38: `input.root` is untrusted here — `checkTrackerRoot` (src/check.ts) hands `loadContext`
// the raw `--input` JSON before `checkRoot`'s own schema validation ever sees it (the live path is
// safe by construction: it hands loadContext a loader-built bundle, never a raw root). Facts are
// extracted BEST-EFFORT: anything not shaped as expected is treated as absent, never thrown on —
// schema validation is what reports the real shape problem. One shared walk backs both helpers
// below rather than sprinkling optional chains through each.
function rootEvidenceBestEffort(root: unknown): Evidence[] {
  const issues = (root as { issues?: unknown } | null)?.issues;
  if (!Array.isArray(issues)) return [];
  return issues.flatMap((i) => {
    if (!i || typeof i !== 'object') return [];
    const acs = (i as { acceptanceCriteria?: unknown }).acceptanceCriteria;
    if (!Array.isArray(acs)) return [];
    return acs.flatMap((ac) => {
      if (!ac || typeof ac !== 'object') return [];
      const evidence = (ac as { evidence?: unknown }).evidence;
      if (!Array.isArray(evidence)) return [];
      return evidence.filter((ev): ev is Evidence => !!ev && typeof ev === 'object' && typeof (ev as { commit?: unknown }).commit === 'string');
    });
  });
}

// Cited (commit, image-path) pairs to resolve — only PATH images (a `sha256:` blob ref is the
// blob store's job, not a tree path). From the parsed root when present, else scanned from the bundle.
function citedEvidenceFiles(input: PresetContextInput): { commit: string; image: string }[] {
  const isPath = (img: string | undefined): img is string => !!img && !/^(sha256:|https?:\/\/)/i.test(img);
  if (input.root) {
    return rootEvidenceBestEffort(input.root).filter((ev) => isPath(ev.image)).map((ev) => ({ commit: ev.commit, image: ev.image! }));
  }
  if (!input.bundle) return [];
  // Order-independent (matches parseEvidenceLine): an `image=` after `commit=` must still resolve,
  // or the blob check below would skip a fabricated screenshot written in that order.
  return [...input.bundle.matchAll(/^\s*-?\s*(evidence\s+\S+:.*)$/gim)]
    .map((m) => parseEvidenceLine(m[1]!))
    .filter((ev): ev is NonNullable<typeof ev> => !!ev && isPath(ev.image))
    .map((ev) => ({ image: ev.image!, commit: ev.commit }));
}

// Every cited evidence commit (from the parsed root, else scanned from the bundle — loadContext is
// handed the bundle in the live path). Their touched-files are resolved so the relevance rule, which
// reads the AC's declared `paths` off the model, can check them.
function citedCommits(input: PresetContextInput): string[] {
  if (input.root) {
    return rootEvidenceBestEffort(input.root).map((ev) => ev.commit);
  }
  if (!input.bundle) return [];
  return [...input.bundle.matchAll(/^\s*-?\s*evidence\s+\S+:.*?commit=([0-9a-fA-F]{7,40})/gim)].map((m) => m[1]!.toLowerCase());
}

// Does a declared path (glob: `*` within a segment, `**` across segments, else exact/dir-prefix)
// match a repo-relative file a commit touched?
function pathMatches(pattern: string, file: string): boolean {
  const p = pattern.replace(/\/+$/, '');
  if (file === p || file.startsWith(`${p}/`)) return true;          // exact or directory prefix
  if (!/[*?]/.test(p)) return false;
  let rx = '';
  for (let i = 0; i < p.length; i++) {
    const c = p[i]!;
    if (c === '*') { if (p[i + 1] === '*') { rx += '.*'; i++; } else rx += '[^/]*'; }
    else if (c === '?') rx += '[^/]';
    else if ('.+^${}()|[]\\/'.includes(c)) rx += '\\' + c;
    else rx += c;
  }
  try { return new RegExp(`^${rx}$`).test(file); } catch { return false; }
}

// Per-finding REMEDIATION: the exact action that turns this finding green. The agent fills the
// real values (the sha it just committed, the image path); the hint supplies the command + the
// schema shape, and points at `ztrack ac --help` / `ztrack issue view` for the full grammar.
function defaultFixHint(f: Finding): string | undefined {
  const issue = f.issueId ?? '<issue>';
  const ac = f.acId ?? '<acId>';
  const acPatch = (shape: string, note = '') => `Fix: ztrack ac patch ${issue} ${ac} --json '${shape}'${note}  (\`ztrack ac --help\` / \`ztrack issue view ${issue}\` for the AC schema)`;
  switch (f.code) {
    case 'passed_ac_missing_evidence':
      return acPatch('{"evidence":[{"id":"ev1","commit":"<sha>","acVersion":1}]}', ' — cite the commit that makes this AC true (add "image":"<committed-path>" only if you have a real screenshot)');
    case 'evidence_file_not_found':
      return acPatch('{"evidence":[{"id":"ev1","image":"<path-committed-at-the-sha>","commit":"<sha>","acVersion":1}]}', ' — commit the image so it resolves at the cited commit (`git cat-file -e <sha>:<path>`), or drop the image and keep commit+proof');
    case 'passed_ac_missing_proof':
    case 'proof_cites_no_evidence':
    case 'proof_evidence_ref_missing':
      return acPatch('{"proof":{"explanation":"how the evidence shows this AC is met","evidenceRefs":["ev1"]}}');
    case 'evidence_commit_not_found':
    case 'evidence_ac_version_stale':
      return acPatch('{"evidence":[{"id":"ev1","commit":"<real-sha>","acVersion":1}]}', ' — cite a commit that exists in git (and the AC version)');
    case 'evidence_commit_unrelated':
      return acPatch('{"evidence":[{"id":"ev1","commit":"<sha-that-touches-the-declared-paths>","acVersion":1}]}', ' — cite the commit that actually changed this AC\'s `paths` (or correct the `paths:` line to the area you really changed)');
    case 'passed_ac_missing_paths':
      return acPatch('{"paths":["src/area/**"]}', ' — declare the repo paths this AC\'s work touches (relevance enforcement is on); its cited commit must then change one of them');
    case 'ac_checkbox_status_mismatch':
      return acPatch('{"checked":true,"status":"passed"}', ' — make the [x] checkbox and status agree (or {"checked":false,"status":"pending"})');
    case 'issue_missing_assignee':
      // ZTB-23 dev/03: a document-sourced issue (many issues in one file, ZTB-4) has no home for
      // an assignee edit through the CLI — DocumentSource.write fails closed on ANY assignee
      // change (assigneeNotImplementedError, backends/documentSource.ts) — so telling the agent
      // to run `issue edit --assignee` here just trades this finding for a second, different
      // error. `f.origin.line` is present ONLY for a document-sourced issue's own section (an
      // issue-per-file record's origin never carries a line — see core/engine.ts's
      // toFindingOrigin); route those to the one remediation that actually works: editing the
      // file's `assignee:` header line directly.
      return f.origin?.line !== undefined
        ? `Fix: ${issue} is a document-sourced issue — \`ztrack issue edit --assignee\` does not work on it (write-back has no assignee splice yet). Add or edit the \`assignee:\` header line under ${issue}'s heading in ${f.origin.path} directly.`
        : `Fix: assign an owner — \`ztrack issue edit ${issue} --assignee <you>\` for a stored issue, or add an \`Assignee: <you>\` line to the top of the body for a loose file.`;
    case 'ready_requires_dev_ac':
      return `Fix: give ${issue} at least one acceptance criterion (a \`## Acceptance Criteria\` item), or move it back to draft`;
    case 'review_requires_all_acs_passed':
      return `Fix: every AC of ${issue} must be passed-with-evidence (ztrack ac patch …) before in-review`;
    default:
      return undefined; // fall through to the core universal floor (inspect + waiver escape)
  }
}

export const DefaultPreset: Preset<DefaultRoot> = {
  name: 'simple-sdlc',
  fixHint: defaultFixHint,
  schema: DefaultRootSchema,
  // this preset's observed facts: the git world (commits). No PR branches — simple-sdlc is PR-free.
  loadContext: (input) => {
    const ctx = gitWorld(input.projectRoot, [], { verifyCommits: input.verifyCommits });
    // Resolve cited evidence FILES at their commits, so the gate can reject a screenshot/artifact
    // that isn't actually committed at the commit it claims. Skipped when commit verification is
    // off (the same escape hatch shallow/CI checkouts already use).
    if (input.verifyCommits !== false && ctx.git) {
      const blobs: Record<string, boolean> = {};
      for (const ev of citedEvidenceFiles(input)) {
        const key = `${ev.commit}:${ev.image}`;
        if (!(key in blobs)) blobs[key] = gitFileExistsAtCommit(input.projectRoot, ev.commit, ev.image);
      }
      ctx.git.evidenceBlobs = blobs;
      // For relevance: resolve the files each cited commit touched, so a rule can require a passed
      // AC's commit to land in the AC's declared `paths`.
      const files: Record<string, string[]> = {};
      for (const commit of citedCommits(input)) {
        if (!(commit in files)) files[commit] = gitCommitFiles(input.projectRoot, commit);
      }
      ctx.git.commitFiles = files;
    }
    // Relevance-anchor policy (config.relevance): 'required' makes passed_ac_missing_paths enforce
    // that every passed AC declares `paths`. Default 'optional' (anchors opt-in) — non-breaking.
    ctx.relevance = relevanceMode(input.projectRoot);
    return ctx;
  },
  parse: parseDefault,
  serialize: serializeIssue, // issue -> { body, columns }; the inverse of parse
  // an AC-less issue counts as done (for the block graph's completion gate) only at the terminal state.
  isIssueDone: (i) => i.status === 'done',
  // relation reciprocity + dangling proof refs; the block graph + id aggregates are core.
  derive: deriveDefault,
  rules: DEFAULT_RULES,
  // `ztrack issue scaffold` starter: a draft issue with one pending dev AC (green to begin —
  // nothing is claimed yet). Fill in the work, then mark it passed + cite evidence + proof.
  scaffold: (_title) => `Summary: One or two sentences describing the work.\n\n## Acceptance Criteria\n\n- [ ] dev/01 v1 Describe one observable, testable outcome.\n  - status: pending\n\n<!-- To mark an AC done: check the [x] box, set status: passed, and cite real proof —\n  - [x] dev/01 v1 …\n    - status: passed\n    - evidence ev1: commit=<real-git-sha> acv=1   # optional: add image=<file-committed-at-the-sha>\n    - proof: "how the commit shows this AC is met" -> ev1\nThe commit must EXIST in git (verified by default). An image is optional, but if you cite one it must be committed at that sha. \`ztrack ac patch <issue> dev/01 --json '{"status":"passed","checked":true,"evidence":[{"id":"ev1","commit":"<real-git-sha>","acVersion":1}],"proof":{"explanation":"how the commit shows this AC is met","evidenceRefs":["ev1"]}}'\` writes this for you — proof is a JSON OBJECT \`{explanation: string, evidenceRefs: string[]}\`, not the prose line above; \`ztrack ac --help\` shows the schema. -->\n`,
  // which standard primitives this SDLC implements. (audit is NOT declared here:
  // it is a core, always-on capability — recorded automatically on any change.)
  primitives: {
    proof: true, labels: true, relations: true, children: true,
    blocking: true, sources: false, category: false,
  },
};

export function checkDefault(records: IssueRecord[], ctx?: Context) {
  return runCheck(DefaultPreset, records, ctx);
}

// The installed entrypoint: the resolver reads the preset off `default`.
export default DefaultPreset;
