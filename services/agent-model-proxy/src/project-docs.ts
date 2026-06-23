// A project's identity documents — its constitution (north star), roadmap, and changelog — fetched
// from its own repo and rendered into the funding page. These are PURE functions (no network, no DOM)
// so they are testable in isolation: parse the raw doc text the repo ships, then render it into the
// page's existing panel styles. The repo is the source of truth; the page is just a faithful window
// onto what the project says it is and is doing.

export interface RoadmapItem {
  id: string;
  title: string;
  status: string;
  phase?: string;
  priority?: string;
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
    const fm = line.match(/^\s+(phase|priority|status|title):\s*(.+?)\s*$/);
    if (fm) {
      const [, key, val] = fm;
      if (key === 'phase') cur.phase = unquote(val);
      else if (key === 'priority') cur.priority = unquote(val);
      else if (key === 'status') cur.status = unquote(val);
      else if (key === 'title') cur.title = unquote(val);
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

export function renderRoadmapPanel(roadmapYml: string | undefined, repoUrl: string | undefined): string {
  const items = parseRoadmap(roadmapYml ?? '');
  if (!items.length) return '';

  let activeCount = 0;
  let plannedCount = 0;
  let proposedCount = 0;
  let doneCount = 0;
  for (const it of items) {
    if (it.status === 'active') activeCount++;
    else if (it.status === 'planned') plannedCount++;
    else if (it.status === 'proposed') proposedCount++;
    else if (it.status === 'done') doneCount++;
  }
  const total = items.length;
  const unlocked = activeCount + doneCount;
  const pct = total > 0 ? Math.round((unlocked / total) * 100) : 0;

  const momentumHtml = `<div class="rm-momentum">
    <div class="rm-stats">
      <span class="act"><b>${activeCount}</b> active</span>
      <span><b>${plannedCount}</b> planned</span>
      <span><b>${doneCount}</b> shipped</span>
    </div>
    <div class="rm-track"><div class="rm-fill" style="width:${pct}%"></div></div>
  </div>`;

  const rank = (s: string): number => (s === 'active' ? 0 : s === 'planned' ? 1 : s === 'proposed' ? 2 : 3);
  const phasesMap = new Map<string, RoadmapItem[]>();
  for (const it of items) {
    const p = it.phase || 'Upcoming';
    if (!phasesMap.has(p)) phasesMap.set(p, []);
    phasesMap.get(p)!.push(it);
  }

  const sortedPhases = Array.from(phasesMap.keys()).sort((a, b) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });

  let rows = '';
  for (const p of sortedPhases) {
    const phaseItems = phasesMap.get(p)!;
    phaseItems.sort((a, b) => rank(a.status) - rank(b.status));

    const titlePrefix = !isNaN(parseInt(p, 10)) ? 'Phase ' : '';
    rows += `<li class="rm-phase-hdr"><div class="rm-phase-label">${titlePrefix}${esc(p)}</div></li>`;

    rows += phaseItems.map((it) => {
      const isLive = it.status === 'active' || it.status === 'done';
      const meta = [it.priority ? esc(it.priority) : ''].filter(Boolean).join(' · ');
      return `<li class="rm-item ${esc(it.status)}">
        <div class="rm-node"></div>
        <div class="rm-content">
          <div class="rtitle">${esc(it.title)}</div>
          ${meta ? `<div class="rmeta">${meta}</div>` : ''}
        </div>
      </li>`;
    }).join('');
  }

  const more = repoUrl ? `<a class="docmore" href="${esc(repoUrl)}/blob/HEAD/.open-autonomy/roadmap.yml">Full roadmap →</a>` : '';
  return `<div class="panel roadmap-panel">
    <h3>Roadmap</h3>
    ${momentumHtml}
    <ul class="roadmap">${rows}</ul>
    ${more}
  </div>`;
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
