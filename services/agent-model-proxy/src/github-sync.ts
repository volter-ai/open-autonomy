import { LimitLedgerClient } from './limit-ledger.js';
import type { Env } from './types.js';

// Pull a project's display metadata from its own GitHub repo (description, owner avatar, social
// preview, homepage) and cache it on the account. The project is self-describing: editing its repo
// description updates the funding page. Unauthenticated read → only public repos sync, which is
// exactly the gate for appearing on the public storefront. Best-effort: failures are swallowed.

const STALE_MS = 24 * 60 * 60 * 1000;

interface GitHubRepo {
  description?: string | null;
  homepage?: string | null;
  html_url?: string;
  private?: boolean;
  owner?: { avatar_url?: string };
}

export function isStale(syncedAt?: string): boolean {
  if (!syncedAt) return true;
  const t = Date.parse(syncedAt);
  return !Number.isFinite(t) || Date.now() - t > STALE_MS;
}

export async function syncProfile(env: Env, account: string): Promise<boolean> {
  if (!account.includes('/')) return false; // named roots are internal funding nodes, not repos
  const base = env.GITHUB_API_BASE ?? 'https://api.github.com';
  try {
    const res = await fetch(`${base}/repos/${account}`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'open-autonomy-funding' },
    });
    if (!res.ok) return false; // 404 (incl. private) → not eligible for the public storefront
    const repo = await res.json() as GitHubRepo;
    if (repo.private) return false;
    // Cover = the first real image in the README (a proper banner) if the repo has one; otherwise leave
    // it empty so the page renders a clean, deterministic coral gradient (the GitHub OG social card is
    // a busy link-preview card with its own text, so it makes a poor banner).
    const cover = (await firstReadmeImage(env, account)) ?? '';
    // The project's identity docs, read from its own repo. A repo that ships none simply has empty
    // panels — the page degrades cleanly. Size-capped so the cached profile record stays small.
    const [charter, roadmap, changelog, roadmapStatus] = await Promise.all([
      fetchRepoText(env, account, 'docs/CONSTITUTION.md'),
      fetchRepoText(env, account, '.open-autonomy/roadmap.yml'),
      fetchRepoText(env, account, 'CHANGELOG.md'),
      fetchRoadmapStatus(env, account),
    ]);
    await new LimitLedgerClient(env.LIMITS).setProfile(account, {
      tagline: repo.description ?? undefined,
      avatar_url: repo.owner?.avatar_url ?? undefined,
      cover_url: cover,
      homepage: repo.homepage || repo.html_url || undefined,
      synced_at: new Date().toISOString(),
      charter_md: charter ?? '',
      roadmap_yml: roadmap ?? '',
      changelog_md: changelog ?? '',
      roadmap_status_json: roadmapStatus ?? '',
    });
    return true;
  } catch {
    return false;
  }
}

// Fetch a UTF-8 text file from the repo (default branch) via the contents API, decoded and size-capped.
// Returns undefined when the file is absent (so the page omits that panel). Best-effort; never throws.
async function fetchRepoText(env: Env, account: string, path: string, maxBytes = 24_000): Promise<string | undefined> {
  const base = env.GITHUB_API_BASE ?? 'https://api.github.com';
  try {
    const res = await fetch(`${base}/repos/${account}/contents/${path}`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'open-autonomy-funding' },
    });
    if (!res.ok) return undefined;
    const j = await res.json() as { content?: string; encoding?: string };
    if (!j.content || j.encoding !== 'base64') return undefined;
    const bin = atob(j.content.replace(/\s/g, ''));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes).slice(0, maxBytes);
  } catch {
    return undefined;
  }
}

// Roll up each roadmap item's child issues in ONE API call → {id → {total, done, issues[]}}. Tracking issues
// all carry `origin:roadmap-planner` and the parent link label `roadmap:<id>` (1 item → many issues). We bucket
// every `roadmap:*` label seen; the page looks up by item id, so unrelated labels (e.g. a phase label) just
// never match. This is the two-layer roadmap's execution source — no status is stored in roadmap.yml: the
// counts derive item state and the per-issue list lets the panel expand an item into its actual child issues.
// We keep a bounded slice of issues per item (open first, so the actionable work shows); `total`/`done` still
// reflect the FULL count, and the panel links to GitHub for the rest. Best-effort: undefined on any failure.
const ROADMAP_ISSUES_PER_ITEM = 8;

// GitHub paginates the issues endpoint at 100/page; follow the `Link: <…>; rel="next"` header so the rollup's
// total/done counts stay correct past 100 tracking issues (without it the roadmap silently truncated). Bounded
// to MAX_ROADMAP_PAGES so a pathological repo can't make the funding page hang.
const MAX_ROADMAP_PAGES = 10;
function nextPageUrl(linkHeader: string | null): string | undefined {
  if (!linkHeader) return undefined;
  const m = linkHeader.match(/<([^>]+)>\s*;\s*rel="next"/);
  return m ? m[1] : undefined;
}

// A raw GitHub issue as returned by the issues endpoint — only the fields the rollup reads.
export type RawRoadmapIssue = { number?: number; title?: string; state?: string; pull_request?: unknown; labels?: Array<{ name?: string }> };

// Bucket planner tracking issues into per-item {total, done, issues[]} keyed by their `roadmap:<id>` label.
// PURE (no network) so it's unit-testable; fetchRoadmapStatus just feeds it the fetched pages.
export function rollupRoadmapStatus(issues: RawRoadmapIssue[]): string {
  type Ref = { n: number; t: string; c: boolean }; // number, title, closed — short keys to keep the payload small
  const items: Record<string, { total: number; done: number; issues: Ref[] }> = {};
  for (const issue of issues) {
    if (issue.pull_request) continue; // the issues endpoint also returns PRs — skip them
    const closed = issue.state === 'closed';
    const ref: Ref = { n: issue.number ?? 0, t: (issue.title ?? '').slice(0, 140), c: closed };
    for (const l of issue.labels ?? []) {
      const name = l.name ?? '';
      if (!name.startsWith('roadmap:')) continue;
      const id = name.slice('roadmap:'.length);
      // `roadmap:<id>` links an issue to its roadmap item. Legacy phase labels were `roadmap:phase-N`
      // (the prefix is now `phase:`), which collide with this rollup namespace — an issue carrying only
      // `roadmap:phase-1` would otherwise strand its count in a phantom `phase-1` bucket that matches no
      // item, leaving the real item showing zero issues. Skip phase labels: they are not item ids.
      if (/^phase-\d+$/.test(id)) continue;
      const row = items[id] ?? (items[id] = { total: 0, done: 0, issues: [] });
      row.total += 1;
      if (closed) row.done += 1;
      row.issues.push(ref);
    }
  }
  // Open issues first (the actionable work), then closed; within each, lowest number first. Keep a bounded slice.
  for (const row of Object.values(items)) {
    row.issues.sort((a, b) => (Number(a.c) - Number(b.c)) || (a.n - b.n));
    row.issues = row.issues.slice(0, ROADMAP_ISSUES_PER_ITEM);
  }
  return JSON.stringify({ items });
}

async function fetchRoadmapStatus(env: Env, account: string): Promise<string | undefined> {
  const base = env.GITHUB_API_BASE ?? 'https://api.github.com';
  try {
    const issues: RawRoadmapIssue[] = [];
    let url: string | undefined = `${base}/repos/${account}/issues?labels=origin:roadmap-planner&state=all&per_page=100`;
    for (let page = 0; url && page < MAX_ROADMAP_PAGES; page++) {
      const res: Response = await fetch(url, {
        headers: { accept: 'application/vnd.github+json', 'user-agent': 'open-autonomy-funding' },
      });
      if (!res.ok) { if (page === 0) return undefined; break; } // first page fails → nothing; later page → use partial
      issues.push(...(await res.json() as RawRoadmapIssue[]));
      url = nextPageUrl(res.headers.get('link'));
    }
    return rollupRoadmapStatus(issues);
  } catch {
    return undefined;
  }
}

// Find the first non-badge image referenced in the repo's README and resolve it to an absolute URL.
async function firstReadmeImage(env: Env, account: string): Promise<string | undefined> {
  const base = env.GITHUB_API_BASE ?? 'https://api.github.com';
  try {
    const res = await fetch(`${base}/repos/${account}/readme`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'open-autonomy-funding' },
    });
    if (!res.ok) return undefined;
    const j = await res.json() as { content?: string; encoding?: string; download_url?: string };
    if (!j.content) return undefined;
    const bin = atob(j.content.replace(/\s/g, ''));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const md = new TextDecoder().decode(bytes);
    const found = extractFirstImage(md);
    return found ? resolveImageUrl(found, j.download_url) : undefined;
  } catch {
    return undefined;
  }
}

// Skip badges / status shields — they're images but make terrible cover banners.
function isBadge(url: string): boolean {
  return /shields\.io|badgen|img\.shields|\/badge|badge\.|\/workflows\/|actions\/workflow|coveralls|codecov|circleci|travis-ci|app\.netlify\.com\/.*\/deploys|herokucdn|gitpod|opencollective\.com\/.*\/badge|data:/i.test(url);
}

function extractFirstImage(md: string): string | undefined {
  const candidates: Array<[number, string]> = [];
  const mdImg = /!\[[^\]]*\]\(\s*<?([^)>\s]+)>?(?:\s+"[^"]*")?\s*\)/g;
  const htmlImg = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = mdImg.exec(md)) !== null) candidates.push([m.index, m[1]]);
  while ((m = htmlImg.exec(md)) !== null) candidates.push([m.index, m[1]]);
  candidates.sort((a, b) => a[0] - b[0]);
  for (const [, url] of candidates) if (!isBadge(url)) return url;
  return undefined;
}

function resolveImageUrl(url: string, readmeDownloadUrl?: string): string | undefined {
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('//')) return `https:${url}`;
  if (!readmeDownloadUrl) return undefined;
  try {
    // readmeDownloadUrl is the raw README URL (…/{branch}/README.md); relative paths resolve against it.
    return new URL(url, readmeDownloadUrl).toString();
  } catch {
    return undefined;
  }
}

// Cron: refresh every known public project's metadata.
export async function syncAllStale(env: Env): Promise<number> {
  const { entries } = await new LimitLedgerClient(env.LIMITS).directory();
  let synced = 0;
  for (const e of entries) {
    if (e.is_project && isStale(e.profile.synced_at)) {
      if (await syncProfile(env, e.account)) synced += 1;
    }
  }
  return synced;
}
