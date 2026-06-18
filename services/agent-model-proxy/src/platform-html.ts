import type { DirectoryEntry, Flow, Patron, ProjectView } from './limit-ledger.js';

// Server-rendered HTML for the funding platform — a Patreon-style storefront over the ledger.
// Two pages: the explore grid (GET /) and the creator page (GET /p/:account). No client JS beyond
// a plain form POST for coupon redemption; everything else is rendered from ledger state.

const C = {
  bg: '#0d1117',
  panel: '#161b22',
  border: '#30363d',
  track: '#21262d',
  text: '#e6edf3',
  muted: '#8b949e',
  faint: '#6e7681',
  green: '#3fb950',
  amber: '#d29922',
  red: '#f85149',
  link: '#58a6ff',
};

export function escapeHtml(s: string): string {
  return String(s).replace(/[<>&'"]/g, (c) => (
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&#39;' : '&quot;'
  ));
}

function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function usd0(cents: number): string {
  return `$${Math.round(cents / 100)}`;
}

const STATUS_COLOR = { funded: C.green, low: C.amber, unfunded: C.faint } as const;
const STATUS_LABEL = { funded: 'funded', low: 'low', unfunded: 'unfunded' } as const;

function ownerOf(account: string): string {
  return account.split('/')[0];
}

function avatar(p: { avatar_url?: string }, size: number): string {
  if (!p.avatar_url) return `<span class="avatar ph" style="width:${size}px;height:${size}px"></span>`;
  return `<img class="avatar" src="${escapeHtml(p.avatar_url)}" width="${size}" height="${size}" alt="" loading="lazy">`;
}

function goalLine(e: DirectoryEntry): { label: string; frac: number } {
  if (e.runway_confident && e.runway_days !== null) {
    const days = Math.max(0, Math.round(e.runway_days));
    return { label: `${days} of ${e.goal_days} days funded`, frac: Math.min(1, days / e.goal_days) };
  }
  if (!e.funded || e.balance_usd_cents <= 0) return { label: `0 of ${e.goal_days} days funded`, frac: 0 };
  return { label: `estimating runway…`, frac: 0 };
}

function bar(frac: number, color: string): string {
  const pct = Math.round(Math.max(0, Math.min(1, frac)) * 100);
  return `<div class="track"><div class="fill" style="width:${pct}%;background:${color}"></div></div>`;
}

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; background:${C.bg}; color:${C.text}; font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif; }
  a { color:${C.link}; text-decoration:none; } a:hover { text-decoration:underline; }
  .wrap { max-width:1040px; margin:0 auto; padding:0 20px 64px; }
  .topbar { display:flex; align-items:center; gap:16px; padding:18px 0; border-bottom:1px solid ${C.border}; margin-bottom:28px; }
  .topbar .brand { font-weight:700; font-size:16px; }
  .topbar .spacer { flex:1; }
  .btn { display:inline-block; background:${C.green}; color:#04260f; font-weight:600; padding:7px 14px; border-radius:7px; border:0; cursor:pointer; font-size:14px; }
  .btn.secondary { background:${C.track}; color:${C.text}; border:1px solid ${C.border}; }
  h1 { font-size:26px; margin:8px 0 6px; } .lede { color:${C.muted}; max-width:640px; margin:0 0 28px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:18px; }
  .card { background:${C.panel}; border:1px solid ${C.border}; border-radius:12px; overflow:hidden; display:flex; flex-direction:column; }
  .cover { height:84px; background:${C.track} center/cover no-repeat; border-bottom:1px solid ${C.border}; }
  .card .body { padding:14px 16px 16px; display:flex; flex-direction:column; gap:8px; flex:1; }
  .row { display:flex; align-items:center; gap:10px; }
  .avatar { border-radius:50%; background:${C.track}; object-fit:cover; } .avatar.ph { display:inline-block; border:1px solid ${C.border}; }
  .name { font-weight:700; } .tagline { color:${C.muted}; font-size:13.5px; min-height:20px; }
  .meta { color:${C.muted}; font-size:13px; }
  .track { height:9px; background:${C.track}; border-radius:6px; overflow:hidden; }
  .fill { height:100%; border-radius:6px; }
  .dot { width:9px; height:9px; border-radius:50%; display:inline-block; }
  .pill { font-size:12px; color:${C.muted}; }
  .cols { display:grid; grid-template-columns:1fr 320px; gap:22px; } @media (max-width:840px){ .cols{ grid-template-columns:1fr; } }
  .panel { background:${C.panel}; border:1px solid ${C.border}; border-radius:12px; padding:16px 18px; margin-bottom:18px; }
  .panel h2 { font-size:13px; text-transform:uppercase; letter-spacing:.06em; color:${C.muted}; margin:0 0 12px; }
  .feed { list-style:none; margin:0; padding:0; } .feed li { display:flex; justify-content:space-between; gap:12px; padding:7px 0; border-bottom:1px solid ${C.border}; font-size:14px; } .feed li:last-child{border-bottom:0;}
  .feed .amt.pos { color:${C.green}; } .feed .amt.neg { color:${C.muted}; } .feed time { color:${C.faint}; font-size:12px; }
  .tier { border:1px solid ${C.border}; border-radius:10px; padding:12px 14px; margin-bottom:12px; }
  .tier .h { display:flex; justify-content:space-between; align-items:baseline; } .tier .price { font-weight:700; }
  .tier ul { margin:8px 0 12px; padding-left:18px; color:${C.muted}; font-size:13.5px; } .tier li{ margin:2px 0; }
  .patrons { display:flex; flex-wrap:wrap; gap:10px; } .patron { display:flex; align-items:center; gap:7px; background:${C.track}; border:1px solid ${C.border}; border-radius:20px; padding:4px 10px 4px 4px; font-size:13px; }
  .hero { display:flex; gap:16px; align-items:flex-end; margin:-44px 0 18px 4px; } .hero .avatar { border:3px solid ${C.bg}; }
  .heroband { height:120px; border-radius:12px 12px 0 0; background:${C.track} center/cover no-repeat; border:1px solid ${C.border}; }
  .stat { font-weight:700; } .stats { display:flex; gap:22px; flex-wrap:wrap; margin:4px 0 0; color:${C.muted}; font-size:14px; }
  .codebox { display:flex; gap:8px; margin-top:8px; } .codebox input { flex:1; background:${C.bg}; border:1px solid ${C.border}; border-radius:7px; color:${C.text}; padding:7px 10px; font:13px ui-monospace,Menlo,monospace; }
  .empty { color:${C.muted}; padding:40px 0; text-align:center; }
  .note { color:${C.faint}; font-size:12px; margin-top:6px; }
</style>
</head><body><div class="wrap">${body}</div></body></html>`;
}

function topbar(): string {
  return `<div class="topbar">
    <span class="brand">⛽ open-autonomy</span>
    <a href="/" class="meta">Explore</a>
    <span class="spacer"></span>
    <a class="btn" href="https://github.com/sponsors/volter-ai">Become a patron</a>
  </div>`;
}

export function renderExplore(entries: DirectoryEntry[]): string {
  const listed = entries.filter((e) => e.listed);
  const totalIn = listed.reduce((s, e) => s + e.granted_in_usd_cents, 0);
  const totalSpent = listed.reduce((s, e) => s + e.consumed_usd_cents, 0);
  const patrons = listed.reduce((s, e) => s + e.patron_count, 0);

  const cards = listed.map((e) => {
    const g = goalLine(e);
    const color = STATUS_COLOR[e.status];
    const href = `/p/${encodeURIComponent(e.account)}`;
    const cover = e.profile.cover_url ? ` style="background-image:url('${escapeHtml(e.profile.cover_url)}')"` : '';
    const monthly = e.monthly_usd_cents ? `${usd0(e.monthly_usd_cents)}/mo` : '$0/mo';
    return `<div class="card">
      <a href="${href}"><div class="cover"${cover}></div></a>
      <div class="body">
        <div class="row">${avatar(e.profile, 34)}<div><div class="name"><a href="${href}">${escapeHtml(e.account.split('/')[1] ?? e.account)}</a></div></div></div>
        <div class="tagline">${escapeHtml(e.profile.tagline ?? '')}</div>
        <div class="meta">${e.patron_count} patron${e.patron_count === 1 ? '' : 's'} · ${monthly}</div>
        <div class="meta">${escapeHtml(g.label)}</div>
        ${bar(g.frac, color)}
        <div class="row" style="justify-content:space-between;margin-top:4px">
          <span class="pill"><span class="dot" style="background:${color}"></span> ${STATUS_LABEL[e.status]}</span>
          <a class="btn" href="https://github.com/sponsors/${escapeHtml(ownerOf(e.account))}">Join</a>
        </div>
      </div>
    </div>`;
  }).join('\n');

  const body = `${topbar()}
    <h1>Fund a self-driving repo</h1>
    <p class="lede">Self-coding projects that pay their own way. Back one monthly — the agents do the work, and you can watch every dollar burn down in the open.</p>
    <div class="stats" style="margin-bottom:22px">
      <span><span class="stat">${usd0(totalIn)}</span> funded</span>
      <span><span class="stat">${usd0(totalSpent)}</span> spent</span>
      <span><span class="stat">${listed.length}</span> project${listed.length === 1 ? '' : 's'}</span>
      <span><span class="stat">${patrons}</span> patron${patrons === 1 ? '' : 's'}</span>
    </div>
    ${listed.length ? `<div class="grid">${cards}</div>` : `<div class="empty">No projects funded yet. A repo appears here the first time it runs an open-autonomy agent.</div>`}
    <p class="note" style="margin-top:24px">● funded&nbsp;&nbsp;◐ low (&lt;7 days)&nbsp;&nbsp;○ unfunded — projects self-list when they run an agent and their public repo is synced.</p>`;
  return shell('Fund a self-driving repo · open-autonomy', body);
}

function feedItem(f: Flow): string {
  if (f.kind === 'consume') {
    const who = f.actor ? ` by @${escapeHtml(f.actor)}` : '';
    const where = f.issue ? ` · issue #${f.issue}` : '';
    return `<li><span>agent run${where}${who}</span><span class="amt neg">−${usd(f.amount_usd_cents)}</span></li>`;
  }
  if (f.kind === 'grant') {
    const fromProj = f.from?.includes('/');
    const label = fromProj ? `granted by ${escapeHtml(f.from!)}` : `granted from ${escapeHtml(f.from ?? '')}`;
    return `<li><span>${label} ⇄</span><span class="amt pos">+${usd(f.amount_usd_cents)}</span></li>`;
  }
  const src = f.sponsor_login ? `sponsored by @${escapeHtml(f.sponsor_login)}` : 'funded';
  return `<li><span>${src}</span><span class="amt pos">+${usd(f.amount_usd_cents)}</span></li>`;
}

function patronChip(p: Patron): string {
  const inner = `${avatar(p, 22)}<span>${escapeHtml(p.name ?? p.login)}${p.kind === 'project' ? ' <span class="pill">(project)</span>' : ''}</span>`;
  return p.url ? `<a class="patron" href="${escapeHtml(p.url)}">${inner}</a>` : `<span class="patron">${inner}</span>`;
}

export function renderProject(v: ProjectView): string {
  const owner = ownerOf(v.account);
  const name = v.account.split('/')[1] ?? v.account;
  const color = STATUS_COLOR[v.status];
  const g = goalLine(v);
  const cover = v.profile.cover_url ? ` style="background-image:url('${escapeHtml(v.profile.cover_url)}')"` : '';
  const monthly = v.monthly_usd_cents ? `${usd0(v.monthly_usd_cents)}/mo` : '$0/mo';
  const enc = encodeURIComponent(v.account);

  const tiers = v.tiers.map((t, i) => `<div class="tier">
    <div class="h"><strong>${escapeHtml(t.name)}${i === 1 ? ' ★' : ''}</strong><span class="price">${usd0(t.usd_cents)} / mo</span></div>
    <ul>${t.perks.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>
    <a class="btn" href="https://github.com/sponsors/${escapeHtml(owner)}">Join</a>
  </div>`).join('\n');

  const feed = v.feed.length
    ? `<ul class="feed">${v.feed.map(feedItem).join('')}</ul>`
    : `<p class="meta">No activity yet.</p>`;

  const patrons = v.patrons.length
    ? `<div class="patrons">${v.patrons.map(patronChip).join('')}</div>`
    : `<p class="meta">No patrons yet — be the first.</p>`;

  const body = `${topbar()}
    <div class="heroband"${cover}></div>
    <div class="hero">${avatar(v.profile, 76)}
      <div>
        <h1 style="margin:0">${escapeHtml(name)}</h1>
        <div class="meta">${escapeHtml(v.profile.tagline ?? `${owner}/${name}`)}</div>
        <div class="stats"><span><span class="stat">${v.patron_count}</span> patrons</span><span><span class="stat">${monthly}</span></span><span><span class="dot" style="background:${color}"></span> ${STATUS_LABEL[v.status]}</span></div>
      </div>
    </div>
    <div class="cols">
      <div>
        <div class="panel">
          <h2>Goal</h2>
          <div class="meta" style="margin-bottom:8px">${escapeHtml(g.label)}</div>
          ${bar(g.frac, color)}
          <p class="note">Keep ${v.goal_days} days of agent runway. Progress uses a Bayesian estimate of daily spend.</p>
        </div>
        <div class="panel">
          <h2>Recent activity</h2>
          ${feed}
        </div>
        <div class="panel">
          <h2>Transparency</h2>
          <img src="/v1/accounts/${enc}/runway.svg" width="460" height="116" style="max-width:100%;border-radius:8px" alt="runway">
          <div class="stats" style="margin-top:10px"><span>in ${usd(v.granted_in_usd_cents)}</span><span>spent ${usd(v.consumed_usd_cents)}</span><span>balance ${usd(v.balance_usd_cents)}</span></div>
        </div>
        <div class="panel">
          <h2>Patrons</h2>
          ${patrons}
        </div>
      </div>
      <div>
        <div class="panel">
          <h2>Membership</h2>
          ${tiers}
        </div>
        <div class="panel">
          <h2>Have a sponsor coupon?</h2>
          <form class="codebox" method="POST" action="/p/${enc}/redeem">
            <input name="code" placeholder="SPON-XXXX-XXXX-XXXX" autocomplete="off">
            <button class="btn" type="submit">↵</button>
          </form>
          <p class="note">Funds this project's real token + CI costs. At $0 the agents stop.</p>
        </div>
      </div>
    </div>`;
  return shell(`${name} · open-autonomy funding`, body);
}

export function renderRedeemResult(account: string, ok: boolean, message: string): string {
  const enc = encodeURIComponent(account);
  const body = `${topbar()}
    <div class="panel" style="max-width:520px;margin:40px auto;text-align:center">
      <h1>${ok ? '🎉 Coupon redeemed' : 'Coupon not redeemed'}</h1>
      <p class="${ok ? '' : 'meta'}">${escapeHtml(message)}</p>
      <p><a class="btn secondary" href="/p/${enc}">← back to ${escapeHtml(account)}</a></p>
    </div>`;
  return shell('Coupon · open-autonomy funding', body);
}
