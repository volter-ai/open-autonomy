// A project's identity documents — its constitution (north star), roadmap, and changelog — fetched
// from its own repo and rendered into the funding page. These are PURE functions (no network, no DOM)
// so they are testable in isolation: parse the raw doc text the repo ships, then render it into the
// page's existing panel styles. The repo is the source of truth; the page is just a faithful window
// onto what the project says it is and is doing.
import { Icon } from './ui/Icon.js';
import { render } from './ui/render.js';

export interface RoadmapItem {
  id: string;
  title: string;
  // v2 (two-layer model): the roadmap is a parking lot of intents at any granularity. `proposed` marks an
  // item still awaiting the strategy gate; `planned` marks one the planner has fully decomposed into issues.
  // Execution status (in progress / done) is NOT stored here — it is DERIVED from the item's child issues
  // (see roadmapItemState). `status` is the legacy single-layer field, kept only for back-compat rendering.
  proposed?: boolean;
  planned?: boolean;
  status?: string;
  phase?: string;
  priority?: string;
}

// One child issue of a roadmap item (number, title, closed) — the layer-2 execution unit beneath the intent.
export interface IssueRef {
  n: number;
  t: string;
  c: boolean;
}

// Child-issue rollup for one roadmap item (issues labelled `roadmap:<id>`), used to derive execution status
// and to expand the item into its actual issues. `issues` is a bounded slice (the full tally lives in total/done).
export interface RoadmapCounts {
  total: number;
  done: number;
  issues?: IssueRef[];
}

export type RoadmapState = 'proposed' | 'parked' | 'in_progress' | 'done';

// The two-layer truth: a roadmap item's execution state is a function of its planning flag and its child
// issues — never hand-stored. parked = ratified but not yet decomposed; in_progress = decomposed with open
// issues; done = decomposed and every child issue closed. Adding an issue to a "done" item flips it back to
// in_progress automatically (the state is derived), so nothing is ever frozen.
export function roadmapItemState(item: RoadmapItem, counts?: RoadmapCounts): RoadmapState {
  const total = counts?.total ?? 0;
  const done = counts?.done ?? 0;
  // Execution status is DERIVED: once an item has child issues, the issues are the truth — open work means
  // in progress, all-closed means done — regardless of any hand-written `status`/`planned` flag. This is the
  // whole two-layer point, and it also self-heals (reopen/add an issue and the item flips back automatically).
  if (total > 0) return done >= total ? 'done' : 'in_progress';
  // No child issues yet → fall back to the planning signal. A proposal is still at the strategy gate; a
  // `planned: true` item is decomposition-in-progress (issues imminent); everything else is parked/queued.
  if (item.proposed) return 'proposed';
  if (item.planned) return 'in_progress';
  // Legacy single-layer items (stored status, no v2 flags) keep their old meaning when they have no issues.
  if (item.proposed === undefined && item.planned === undefined && item.status) {
    if (item.status === 'proposed') return 'proposed';
    if (item.status === 'done') return 'done';
    if (item.status === 'active') return 'in_progress';
    return 'parked'; // legacy 'planned' → parked
  }
  return 'parked';
}

// Parse the synced `roadmap-status.json` (id → {total, done}) into a lookup. Tolerant: returns an empty map
// for absent/garbage input so the panel still renders (every item simply falls back to parked/derived-empty).
export function parseRoadmapStatus(json: string | undefined): Map<string, RoadmapCounts> {
  const map = new Map<string, RoadmapCounts>();
  if (!json) return map;
  try {
    const parsed = JSON.parse(json) as { items?: Record<string, { total?: number; done?: number; issues?: Array<{ n?: number; t?: string; c?: boolean }> }> };
    for (const [id, c] of Object.entries(parsed.items ?? {})) {
      const issues = Array.isArray(c.issues)
        ? c.issues.map((i) => ({ n: Number(i.n) || 0, t: String(i.t ?? ''), c: Boolean(i.c) })).filter((i) => i.n > 0)
        : undefined;
      map.set(id, { total: Math.max(0, Number(c.total) || 0), done: Math.max(0, Number(c.done) || 0), issues });
    }
  } catch {
    /* malformed cache — degrade to empty */
  }
  return map;
}

export interface ChangelogEntry {
  heading: string;
  lines: string[];
}

function esc(s: string): string {
  return String(s).replace(/[<>&'"]/g, (c) => (
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&#39;' : '&quot;'
  ));
}

function unquote(s: string): string {
  const t = s.trim();
  return t.replace(/^['"]/, '').replace(/['"]$/, '').trim();
}

// Minimal, safe Markdown → HTML for short prose blocks (the constitution excerpt): escape first, then
// paragraphs, `**bold**`, inline `code`, and `- ` bullet lists. Deliberately tiny — anything fancier is
// out of scope for a doc excerpt and would just be attack surface.
export function mdToSafeHtml(md: string): string {
  const inline = (s: string): string =>
    esc(s)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  const blocks = md.trim().split(/\n{2,}/);
  const out: string[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.every((l) => /^\s*-\s+/.test(l))) {
      out.push(`<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*-\s+/, ''))}</li>`).join('')}</ul>`);
    } else {
      out.push(`<p>${inline(block).replace(/\n/g, ' ')}</p>`);
    }
  }
  return out.join('\n');
}

// Pull the constitution's lead section (the North Star — the project's reason to exist) as the charter
// excerpt. Falls back to the first prose paragraph after the H1 so any constitution shape yields something.
export function constitutionExcerpt(md: string): string {
  if (!md) return '';
  const lines = md.split('\n');
  const start = lines.findIndex((l) => /^##\s+north star/i.test(l));
  if (start >= 0) {
    const rest = lines.slice(start + 1);
    const end = rest.findIndex((l) => /^##\s/.test(l));
    return rest.slice(0, end < 0 ? undefined : end).join('\n').trim();
  }
  // Fallback: first non-heading paragraph.
  const body = lines.filter((l) => !/^#/.test(l)).join('\n').trim();
  return body.split(/\n{2,}/)[0]?.trim() ?? '';
}

// Tolerant line parser for `.open-autonomy/roadmap.yml` — we only read the handful of fields we render
// (no need for a YAML dependency in the worker). An item starts at `- id:`; its scalar fields follow
// until the next item. Nested `acceptance:` bullets never start with `id:`, so they are ignored.
export function parseRoadmap(yml: string): RoadmapItem[] {
  const items: RoadmapItem[] = [];
  let cur: RoadmapItem | null = null;
  for (const line of yml.split('\n')) {
    const idm = line.match(/^\s*-\s+id:\s*(.+?)\s*$/);
    if (idm) {
      if (cur) items.push(cur);
      cur = { id: unquote(idm[1]), title: '', status: '' };
      continue;
    }
    if (!cur) continue;
    const fm = line.match(/^\s+(phase|priority|status|title|proposed|planned):\s*(.+?)\s*$/);
    if (fm) {
      const [, key, val] = fm;
      if (key === 'phase') cur.phase = unquote(val);
      else if (key === 'priority') cur.priority = unquote(val);
      else if (key === 'status') cur.status = unquote(val);
      else if (key === 'title') cur.title = unquote(val);
      else if (key === 'proposed') cur.proposed = unquote(val) === 'true';
      else if (key === 'planned') cur.planned = unquote(val) === 'true';
    }
  }
  if (cur) items.push(cur);
  return items.filter((i) => i.id && i.title);
}

// Parse a Keep-a-Changelog file into its top-level version sections (`## …`) and their bullet lines.
// Sub-headings (`### …`) are flattened away; we keep the first few bullets of the most recent sections.
export function parseChangelog(md: string, maxSections = 2, maxLines = 6): ChangelogEntry[] {
  const sections: ChangelogEntry[] = [];
  let cur: ChangelogEntry | null = null;
  for (const line of md.split('\n')) {
    const hm = line.match(/^##\s+(.+?)\s*$/);
    if (hm) {
      if (cur) sections.push(cur);
      cur = { heading: hm[1].trim(), lines: [] };
      continue;
    }
    if (!cur) continue;
    const bm = line.match(/^\s*-\s+(.+?)\s*$/);
    if (bm) cur.lines.push(bm[1].trim());
  }
  if (cur) sections.push(cur);
  return sections.slice(0, maxSections).map((s) => ({ heading: s.heading, lines: s.lines.slice(0, maxLines) }));
}

// ── Render (into the page's existing `.panel` styling) ──────────────────────────────────────────────
// Each returns '' when the doc is absent, so the page simply omits the panel for a repo that ships none.

export function CharterPanel({ md, repoUrl }: { md?: string; repoUrl?: string }) {
  const excerpt = constitutionExcerpt(md ?? '');
  if (!excerpt) return null;
  return (
    <div class="panel">
      <h3>Charter</h3>
      <div class="prose" dangerouslySetInnerHTML={{ __html: mdToSafeHtml(excerpt) }} />
      {repoUrl ? <a class="docmore" href={`${repoUrl}/blob/HEAD/docs/CONSTITUTION.md`}>Read the full charter →</a> : null}
    </div>
  );
}

export function renderCharterPanel(md: string | undefined, repoUrl: string | undefined): string {
  return render(<CharterPanel md={md} repoUrl={repoUrl} />);
}

// State → CSS class (reuse the existing node colours): in_progress reads as "active", parked as "planned".
const STATE_CLASS: Record<RoadmapState, string> = {
  in_progress: 'active',
  parked: 'planned',
  proposed: 'proposed',
  done: 'done',
};

type Row = { item: RoadmapItem; state: RoadmapState; c: RoadmapCounts };

// How many child issues we list inside an expanded item before linking out to GitHub for the rest.
const ISSUE_PREVIEW = 6;

// The status word shown on an item's right edge: in-flight items get their issue tally, others a plain label.
function stateLabel(state: RoadmapState, c: RoadmapCounts): string {
  if (state === 'in_progress') return c.total > 0 ? `${c.done}/${c.total}` : 'in progress';
  if (state === 'done') return c.total > 0 ? `${c.total} done` : 'shipped';
  if (state === 'proposed') return 'proposed';
  return 'queued';
}

// The child-issue list revealed when an item is expanded — layer 2 beneath the intent. Each issue links to
// itself on GitHub (open ○ / closed ✓); the bounded slice ends in a "+N more on GitHub →" link to the rest.
function IssueList({ row, repoUrl }: { row: Row; repoUrl?: string }) {
  const issues = row.c.issues ?? [];
  const shown = issues.slice(0, ISSUE_PREVIEW);
  const moreHref = repoUrl ? `${repoUrl}/issues?q=${encodeURIComponent(`label:roadmap:${row.item.id}`)}` : undefined;
  const remaining = row.c.total - shown.length;
  // The planner names tracking issues `[roadmap:<id>] <title>`; strip that machine prefix so the issue reads
  // as the work, not the label that wires it. (Defensive — a hand-filed issue without the prefix is untouched.)
  const cleanTitle = (t: string): string => t.replace(/^\s*\[roadmap:[^\]]*\]\s*/i, '').trim() || t;
  return (
    <div class="rm-issues">
      <ul>
        {shown.map((is) => {
          const label = <><span class={`rm-ic ${is.c ? 'closed' : 'open'}`}>{is.c ? '✓' : '○'}</span><span class="rm-inum">{`#${is.n}`}</span><span class="rm-it">{cleanTitle(is.t)}</span></>;
          return <li>{repoUrl ? <a href={`${repoUrl}/issues/${is.n}`}>{label}</a> : <span>{label}</span>}</li>;
        })}
      </ul>
      {remaining > 0 && moreHref ? <a class="rm-more" href={moreHref}>{`+${remaining} more on GitHub →`}</a> : null}
      {shown.length === 0 && moreHref ? <a class="rm-more" href={moreHref}>{`View ${row.c.total} issue${row.c.total === 1 ? '' : 's'} on GitHub →`}</a> : null}
    </div>
  );
}

// One roadmap item — an intent sitting ABOVE its issues. When it has been decomposed (has child issues), it
// renders as a native <details> the reader can expand into those issues; the summary always carries the
// derived progress (a thin bar + tally). Items not yet decomposed (parked/proposed) are flat, unexpandable
// rows with a status word — there's nothing beneath them to open yet.
function RoadmapEpic({ row, repoUrl }: { row: Row; repoUrl?: string }) {
  const { item: it, state, c } = row;
  const phase = it.phase ? (isNaN(parseInt(it.phase, 10)) ? it.phase : `P${it.phase}`) : '';
  const frac = c.total > 0 ? Math.min(1, c.done / c.total) : 0;
  const expandable = c.total > 0;
  const head = (
    <>
      <span class="rm-caret" aria-hidden="true" />
      <span class="rm-etitle">{it.title}</span>
      {phase ? <span class="rm-ephase">{phase}</span> : null}
      <span class="rm-estatus">{stateLabel(state, c)}</span>
    </>
  );
  const bar = expandable ? <div class="rm-ebar"><div class="rm-efill" style={`width:${Math.round(frac * 100)}%`} /></div> : null;
  if (!expandable) {
    // Not yet decomposed — nothing to open beneath it; a flat row with its status word.
    return <li class={`rm-epic flat ${STATE_CLASS[state]}`}><div class="rm-ehead">{head}{bar}</div></li>;
  }
  // The bar lives inside <summary> so it stays visible whether the item is collapsed or expanded.
  return (
    <li class={`rm-epic ${STATE_CLASS[state]}`}>
      <details open={state === 'in_progress'}>
        <summary><div class="rm-ehead">{head}</div>{bar}</summary>
        <IssueList row={row} repoUrl={repoUrl} />
      </details>
    </li>
  );
}

// A labelled group of epics ("In progress" / "Up next" / "Proposed") — a small header then the item tree.
function RoadmapGroup({ label, rows, repoUrl }: { label: string; rows: Row[]; repoUrl?: string }) {
  return (
    <div class="rm-group">
      <div class="rm-group-hdr">{label}<span class="n">{rows.length}</span></div>
      <ul class="rm-epics">{rows.map((r) => <RoadmapEpic row={r} repoUrl={repoUrl} />)}</ul>
    </div>
  );
}

// A collapsed-by-default group (proposed candidates / shipped history) — native <details>, no JS.
function RoadmapFold({ label, rows, repoUrl }: { label: string; rows: Row[]; repoUrl?: string }) {
  return <details class="rm-fold"><summary>{label}</summary><ul class="rm-epics">{rows.map((r) => <RoadmapEpic row={r} repoUrl={repoUrl} />)}</ul></details>;
}

// A Roadmap-above-Issues tree. Each item is an intent; the ones the planner has decomposed expand into their
// actual child issues (layer 2). In-progress items lead (open by default); the ratified queue and proposed
// candidates follow; shipped history folds away. Bounded by collapsing everything but the current work — the
// panel reads as "what we're building and how far along," with the issues one click beneath each item.
export function RoadmapPanel({ yml, repoUrl, statusJson }: { yml?: string; repoUrl?: string; statusJson?: string }) {
  const items = parseRoadmap(yml ?? '');
  if (!items.length) return null;
  const counts = parseRoadmapStatus(statusJson);
  const rows: Row[] = items.map((item) => ({ item, state: roadmapItemState(item, counts.get(item.id)), c: counts.get(item.id) ?? { total: 0, done: 0 } }));
  const phaseNum = (i: RoadmapItem): number => { const n = parseInt(i.phase ?? '', 10); return isNaN(n) ? Number.MAX_SAFE_INTEGER : n; };
  const byPhase = (a: Row, b: Row): number => phaseNum(a.item) - phaseNum(b.item);
  const of = (s: RoadmapState): Row[] => rows.filter((r) => r.state === s).sort(byPhase);
  const inProgress = of('in_progress');
  const parked = of('parked');
  const proposed = of('proposed');
  const done = of('done');
  const committed = inProgress.length + parked.length + done.length;
  const pct = committed > 0 ? Math.round((done.length / committed) * 100) : 0;
  const roadmapUrl = repoUrl ? `${repoUrl}/blob/HEAD/.open-autonomy/roadmap.yml` : undefined;
  const hasCommitted = inProgress.length > 0 || parked.length > 0;

  return (
    <div class="panel roadmap-panel">
      <h3>Roadmap</h3>
      <div class="rm-momentum">
        <div class="rm-stats">
          <span class="act"><b>{inProgress.length}</b> in progress</span>
          <span><b>{parked.length}</b> queued</span>
          <span><b>{done.length}</b> shipped</span>
        </div>
        <div class="rm-track"><div class="rm-fill" style={`width:${pct}%`} /></div>
      </div>
      {inProgress.length ? <RoadmapGroup label="In progress" rows={inProgress} repoUrl={repoUrl} /> : null}
      {parked.length ? <RoadmapGroup label="Up next" rows={parked} repoUrl={repoUrl} /> : null}
      {!hasCommitted && proposed.length ? <RoadmapGroup label="Proposed" rows={proposed} repoUrl={repoUrl} /> : null}
      {hasCommitted && proposed.length ? <RoadmapFold label={`${proposed.length} proposed`} rows={proposed} repoUrl={repoUrl} /> : null}
      {done.length ? <RoadmapFold label={`✓ ${done.length} shipped`} rows={done} repoUrl={repoUrl} /> : null}
      {roadmapUrl ? <a class="docmore" href={roadmapUrl}>Full roadmap →</a> : null}
    </div>
  );
}

export function renderRoadmapPanel(yml: string | undefined, repoUrl: string | undefined, statusJson?: string): string {
  return render(<RoadmapPanel yml={yml} repoUrl={repoUrl} statusJson={statusJson} />);
}

export function ChangelogPanel({ md, repoUrl }: { md?: string; repoUrl?: string }) {
  const withLines = parseChangelog(md ?? '').filter((s) => s.lines.length);
  if (!withLines.length) return null;
  return (
    <div class="panel">
      <h3>What's shipped</h3>
      {withLines.map((s) => (
        <div class="release">
          <div class="rel-head">{s.heading}</div>
          <ul class="changelog">{s.lines.map((l) => <li>{l}</li>)}</ul>
        </div>
      ))}
      {repoUrl ? <a class="docmore" href={`${repoUrl}/blob/HEAD/CHANGELOG.md`}>Full changelog →</a> : null}
    </div>
  );
}

export function renderChangelogPanel(md: string | undefined, repoUrl: string | undefined): string {
  return render(<ChangelogPanel md={md} repoUrl={repoUrl} />);
}
