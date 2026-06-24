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

// Child-issue rollup for one roadmap item (issues labelled `roadmap:<id>`), used to derive execution status.
export interface RoadmapCounts {
  total: number;
  done: number;
}

export type RoadmapState = 'proposed' | 'parked' | 'in_progress' | 'done';

// The two-layer truth: a roadmap item's execution state is a function of its planning flag and its child
// issues — never hand-stored. parked = ratified but not yet decomposed; in_progress = decomposed with open
// issues; done = decomposed and every child issue closed. Adding an issue to a "done" item flips it back to
// in_progress automatically (the state is derived), so nothing is ever frozen.
export function roadmapItemState(item: RoadmapItem, counts?: RoadmapCounts): RoadmapState {
  // Back-compat: a legacy item (old stored status, no v2 flags) keeps rendering from that status.
  if (item.proposed === undefined && item.planned === undefined && item.status) {
    if (item.status === 'proposed') return 'proposed';
    if (item.status === 'done') return 'done';
    if (item.status === 'active') return 'in_progress';
    return 'parked'; // legacy 'planned' → parked
  }
  if (item.proposed) return 'proposed';
  if (!item.planned) return 'parked';
  const total = counts?.total ?? 0;
  const done = counts?.done ?? 0;
  if (total > 0 && done >= total) return 'done';
  return 'in_progress';
}

// Parse the synced `roadmap-status.json` (id → {total, done}) into a lookup. Tolerant: returns an empty map
// for absent/garbage input so the panel still renders (every item simply falls back to parked/derived-empty).
export function parseRoadmapStatus(json: string | undefined): Map<string, RoadmapCounts> {
  const map = new Map<string, RoadmapCounts>();
  if (!json) return map;
  try {
    const parsed = JSON.parse(json) as { items?: Record<string, { total?: number; done?: number }> };
    for (const [id, c] of Object.entries(parsed.items ?? {})) {
      map.set(id, { total: Math.max(0, Number(c.total) || 0), done: Math.max(0, Number(c.done) || 0) });
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

// At most this many items per board column; the rest collapse into a "+N more →" link to the full roadmap.
// Bounds the panel height: it can never grow past three short columns regardless of how big the backlog gets.
const COL_CAP = 6;

// One compact card. A whole item is a single short tile (title, a meta line, and — for in-flight work — a
// thin issue-progress bar), not a tall timeline node. The GitHub mark links to the item's labelled issues.
function RoadmapRow({ row, repoUrl }: { row: Row; repoUrl?: string }) {
  const { item: it, state, c } = row;
  const phase = it.phase ? (isNaN(parseInt(it.phase, 10)) ? it.phase : `P${it.phase}`) : '';
  const tally = state === 'in_progress' && c.total > 0 ? `${c.done}/${c.total} issues`
    : state === 'done' && c.total > 0 ? `${c.total} issue${c.total === 1 ? '' : 's'}`
    : '';
  const meta = [phase, it.priority ?? '', tally].filter(Boolean).join(' · ');
  const frac = state === 'in_progress' && c.total > 0 ? Math.min(1, c.done / c.total) : 0;
  const ghHref = repoUrl && c.total > 0 ? `${repoUrl}/issues?q=${encodeURIComponent(`label:roadmap:${it.id}`)}` : undefined;
  return (
    <li class={`rm-row ${STATE_CLASS[state]}`}>
      <div class="rm-row-head">
        <span class="t">{it.title}</span>
        {ghHref ? <a class="rm-gh" href={ghHref} title="View linked issues on GitHub"><Icon name="github" /></a> : null}
      </div>
      {meta ? <div class="m">{meta}</div> : null}
      {frac > 0 ? <div class="rm-rowtrack"><div class="rm-rowfill" style={`width:${Math.round(frac * 100)}%`} /></div> : null}
    </li>
  );
}

// One board column (Now / Next / Later). Always rendered so the three-lane shape is stable even when a lane
// is empty (an honest "—" rather than a collapsing layout). Overflow past COL_CAP becomes a link, not scroll.
function RoadmapColumn({ label, state, rows, repoUrl, roadmapUrl }: { label: string; state: RoadmapState; rows: Row[]; repoUrl?: string; roadmapUrl?: string }) {
  const shown = rows.slice(0, COL_CAP);
  const extra = rows.length - shown.length;
  return (
    <div class="rm-col">
      <div class="rm-col-hdr"><span class={`rm-col-dot ${STATE_CLASS[state]}`} />{label}<span class="n">{rows.length}</span></div>
      {rows.length
        ? <ul class="rm-list">{shown.map((r) => <RoadmapRow row={r} repoUrl={repoUrl} />)}</ul>
        : <p class="rm-empty">—</p>}
      {extra > 0 && roadmapUrl ? <a class="rm-more" href={roadmapUrl}>{`+${extra} more →`}</a> : null}
    </div>
  );
}

// Shipped history is genuinely archival, so it stays a collapsed <details> below the board (not a fourth lane).
function RoadmapShipped({ rows, repoUrl }: { rows: Row[]; repoUrl?: string }) {
  return (
    <details class="rm-fold rm-shipped">
      <summary>{`✓ ${rows.length} shipped`}</summary>
      <ul class="rm-list">{rows.map((r) => <RoadmapRow row={r} repoUrl={repoUrl} />)}</ul>
    </details>
  );
}

// A Now / Next / Later board — the idiomatic public-roadmap shape. Each lane is a bounded stack of compact
// tiles, so the panel reads at a glance and never sprawls vertically: Now = in flight, Next = ratified queue,
// Later = proposed candidates, with shipped work tucked into a fold beneath.
export function RoadmapPanel({ yml, repoUrl, statusJson }: { yml?: string; repoUrl?: string; statusJson?: string }) {
  const items = parseRoadmap(yml ?? '');
  if (!items.length) return null;
  const counts = parseRoadmapStatus(statusJson);
  // Derive each item's execution state from its planning flag + child issues (two-layer model).
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
      <div class="rm-board">
        <RoadmapColumn label="Now" state="in_progress" rows={inProgress} repoUrl={repoUrl} roadmapUrl={roadmapUrl} />
        <RoadmapColumn label="Next" state="parked" rows={parked} repoUrl={repoUrl} roadmapUrl={roadmapUrl} />
        <RoadmapColumn label="Later" state="proposed" rows={proposed} repoUrl={repoUrl} roadmapUrl={roadmapUrl} />
      </div>
      {done.length ? <RoadmapShipped rows={done} repoUrl={repoUrl} /> : null}
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
