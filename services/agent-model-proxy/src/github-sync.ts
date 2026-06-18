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
    // Prefer the first real image in the README (a proper banner); fall back to the OG social card.
    const cover = (await firstReadmeImage(env, account)) ?? `https://opengraph.githubassets.com/oa/${account}`;
    await new LimitLedgerClient(env.LIMITS).setProfile(account, {
      tagline: repo.description ?? undefined,
      avatar_url: repo.owner?.avatar_url ?? undefined,
      cover_url: cover,
      homepage: repo.homepage || repo.html_url || undefined,
      synced_at: new Date().toISOString(),
    });
    return true;
  } catch {
    return false;
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
