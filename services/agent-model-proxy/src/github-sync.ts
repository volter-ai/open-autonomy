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
    await new LimitLedgerClient(env.LIMITS).setProfile(account, {
      tagline: repo.description ?? undefined,
      avatar_url: repo.owner?.avatar_url ?? undefined,
      cover_url: `https://opengraph.githubassets.com/oa/${account}`,
      homepage: repo.homepage || repo.html_url || undefined,
      synced_at: new Date().toISOString(),
    });
    return true;
  } catch {
    return false;
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
