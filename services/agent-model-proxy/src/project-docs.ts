// A project's identity documents — its constitution (north star), roadmap, and changelog — fetched
// from its own repo and rendered into the funding page. These are PURE functions (no network, no DOM)
// so they are testable in isolation: parse the raw doc text the repo ships, then render it into the
// page's existing panel styles. The repo is the source of truth; the page is just a faithful window
// onto what the project says it is and is doing.

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

// The GitHub mark (octocat), inline so a link can carry a recognizable "open on GitHub" affordance.
// `currentColor` so it inherits the link colour. Shared by the roadmap links + the activity feed.
export const GITHUB_ICON = '<svg class="ghi" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" style="vertical-align:-2px"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>';

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

export function renderCharterPanel(constitutionMd: string | undefined, repoUrl: string | undefined): string {
  const excerpt = constitutionExcerpt(constitutionMd ?? '');
  if (!excerpt) return '';
  const more = repoUrl ? `<a class="docmore" href="${esc(repoUrl)}/blob/HEAD/docs/CONSTITUTION.md">Read the full charter →</a>` : '';
  return `<div class="panel">
    <h3>Charter</h3>
    <div class="prose">${mdToSafeHtml(excerpt)}</div>
    ${more}
  </div>`;
}

// State → CSS class (reuse the existing node colours): in_progress reads as "active", parked as "planned".
const STATE_CLASS: Record<RoadmapState, string> = {
  in_progress: 'active',
  parked: 'planned',
  proposed: 'proposed',
  done: 'done',
};

export function renderRoadmapPanel(roadmapYml: string | undefined, repoUrl: string | undefined, statusJson?: string): string {
  const items = parseRoadmap(roadmapYml ?? '');
  if (!items.length) return '';
  const counts = parseRoadmapStatus(statusJson);

  // Derive each item's execution state from its planning flag + child issues (two-layer model). The item
  // carries its own rollup so a row can show "3/5 issues" without re-deriving.
  type Row = { item: RoadmapItem; state: RoadmapState; c: RoadmapCounts };
  const rows: Row[] = items.map((item) => ({ item, state: roadmapItemState(item, counts.get(item.id)), c: counts.get(item.id) ?? { total: 0, done: 0 } }));

  const phaseNum = (i: RoadmapItem): number => {
    const n = parseInt(i.phase ?? '', 10);
    return isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
  };
  const byPhase = (a: Row, b: Row): number => phaseNum(a.item) - phaseNum(b.item);
  const of = (s: RoadmapState): Row[] => rows.filter((r) => r.state === s).sort(byPhase);

  const inProgress = of('in_progress');
  const parked = of('parked');
  const proposed = of('proposed');
  const done = of('done');

  // Momentum: progress over the committed work (proposed candidates aren't committed yet, so they're excluded).
  const committed = inProgress.length + parked.length + done.length;
  const pct = committed > 0 ? Math.round((done.length / committed) * 100) : 0;
  const momentumHtml = `<div class="rm-momentum">
    <div class="rm-stats">
      <span class="act"><b>${inProgress.length}</b> in progress</span>
      <span><b>${parked.length}</b> queued</span>
      <span><b>${done.length}</b> shipped</span>
    </div>
    <div class="rm-track"><div class="rm-fill" style="width:${pct}%"></div></div>
  </div>`;

  const more = repoUrl ? `<a class="docmore" href="${esc(repoUrl)}/blob/HEAD/.open-autonomy/roadmap.yml">Full roadmap →</a>` : '';

  // Now / Next / Later — center on the current steps. IN PROGRESS leads (with a per-item issue tally), then a
  // few UP NEXT from the parked backlog; the rest of the backlog, the proposed candidates, and the shipped
  // history fold into native <details> (no client JS). If nothing is in progress, surface more of the queue.
  const nextCount = inProgress.length ? 3 : 5;
  const next = parked.slice(0, nextCount);
  const laterParked = parked.slice(next.length);

  const sections: string[] = [];
  if (inProgress.length) sections.push(roadmapSection('In progress', inProgress, repoUrl));
  if (next.length) sections.push(roadmapSection('Up next', next, repoUrl));
  // Nothing committed yet (only proposals) → show the proposals rather than an empty panel.
  if (!sections.length && proposed.length) sections.push(roadmapSection('Proposed', proposed, repoUrl));

  const folds: string[] = [];
  if (laterParked.length) folds.push(roadmapFold(`${laterParked.length} more queued`, laterParked, repoUrl));
  if (sections.length && proposed.length) folds.push(roadmapFold(`${proposed.length} proposed`, proposed, repoUrl));
  if (done.length) {
    if (sections.length) folds.push(roadmapFold(`✓ ${done.length} shipped`, done, repoUrl));
    else sections.push(roadmapSection('Shipped', done, repoUrl));
  }

  return `<div class="panel roadmap-panel">
    <h3>Roadmap</h3>
    ${momentumHtml}
    <ul class="roadmap">${sections.join('')}</ul>
    ${folds.join('')}
    ${more}
  </div>`;
}

// One labelled section ("In progress" / "Up next" / "Proposed" / "Shipped") — a header row then its items.
function roadmapSection(label: string, rows: Array<{ item: RoadmapItem; state: RoadmapState; c: RoadmapCounts }>, repoUrl?: string): string {
  return `<li class="rm-phase-hdr"><div class="rm-phase-label">${esc(label)}</div></li>` + rows.map((r) => roadmapItemRow(r, repoUrl)).join('');
}

function roadmapItemRow(row: { item: RoadmapItem; state: RoadmapState; c: RoadmapCounts }, repoUrl?: string): string {
  const { item: it, state, c } = row;
  const phase = it.phase ? (isNaN(parseInt(it.phase, 10)) ? esc(it.phase) : `Phase ${esc(it.phase)}`) : '';
  // Surface the child-issue tally where it's meaningful: progress while in flight, the count once shipped.
  const tally = state === 'in_progress' && c.total > 0 ? `${c.done}/${c.total} issues`
    : state === 'done' && c.total > 0 ? `${c.total} issue${c.total === 1 ? '' : 's'}`
    : '';
  const meta = [phase, it.priority ? esc(it.priority) : '', tally].filter(Boolean).join(' · ');
  // Pop into GitHub: when an item has linked tracking issues, link to the label-filtered issue list so the
  // roadmap item is one click from its real issues + PRs. (Parked/proposed items have none yet — no link.)
  const ghIssues = repoUrl && c.total > 0
    ? `<a class="rm-gh" href="${esc(repoUrl)}/issues?q=${encodeURIComponent(`label:roadmap:${it.id}`)}" title="View linked issues on GitHub">${GITHUB_ICON} ${c.total} issue${c.total === 1 ? '' : 's'}</a>`
    : '';
  return `<li class="rm-item ${STATE_CLASS[state]}">
    <div class="rm-node"></div>
    <div class="rm-content">
      <div class="rtitle">${esc(it.title)}${ghIssues}</div>
      ${meta ? `<div class="rmeta">${meta}</div>` : ''}
    </div>
  </li>`;
}

// A collapsed-by-default group (overflow backlog / proposals / shipped history) — native <details>, no JS.
function roadmapFold(label: string, rows: Array<{ item: RoadmapItem; state: RoadmapState; c: RoadmapCounts }>, repoUrl?: string): string {
  return `<details class="rm-fold"><summary>${label}</summary><ul class="roadmap">${rows.map((r) => roadmapItemRow(r, repoUrl)).join('')}</ul></details>`;
}

export function renderChangelogPanel(changelogMd: string | undefined, repoUrl: string | undefined): string {
  const sections = parseChangelog(changelogMd ?? '');
  if (!sections.length || sections.every((s) => !s.lines.length)) return '';
  const blocks = sections.filter((s) => s.lines.length).map((s) => `
    <div class="release">
      <div class="rel-head">${esc(s.heading)}</div>
      <ul class="changelog">${s.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    </div>`).join('');
  const more = repoUrl ? `<a class="docmore" href="${esc(repoUrl)}/blob/HEAD/CHANGELOG.md">Full changelog →</a>` : '';
  return `<div class="panel">
    <h3>What's shipped</h3>
    ${blocks}
    ${more}
  </div>`;
}
