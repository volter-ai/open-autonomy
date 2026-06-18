import type { DirectoryEntry, Flow, Patron, ProjectView } from './limit-ledger.js';

// Server-rendered HTML for the funding platform — a Patreon-style storefront over the ledger.
// Two pages: the explore grid (GET /) and the creator page (GET /p/:account). No client JS beyond
// a plain form POST for coupon redemption; everything else is rendered from ledger state. The look
// is a bright, warm, premium creator-platform aesthetic (light theme, coral accent, Inter, generous
// whitespace, overlapping avatars, soft shadows).

const C = {
  bg: '#ffffff',
  wash: '#f6f5f3',
  panel: '#ffffff',
  ink: '#16171a',
  body: '#3d3f44',
  muted: '#76787d',
  faint: '#9a9ca1',
  line: '#ece9e4',
  accent: '#ff424d',
  accentDark: '#e2333d',
  green: '#0a8754',
  amber: '#c77700',
  gray: '#9a9ca1',
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
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

const STATUS = {
  funded: { color: C.green, label: 'Funded' },
  low: { color: C.amber, label: 'Low' },
  unfunded: { color: C.gray, label: 'Unfunded' },
} as const;

function ownerOf(account: string): string {
  return account.split('/')[0];
}

function nameOf(account: string): string {
  return account.split('/')[1] ?? account;
}

// Deterministic warm gradient so coverless projects still look intentional, not blank.
function coverStyle(url: string | undefined, seed = ''): string {
  if (url) return `background-image:url('${escapeHtml(url)}')`;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return `background:linear-gradient(135deg,hsl(${h} 48% 64%),hsl(${(h + 40) % 360} 52% 54%))`;
}

function avatar(url: string | undefined, size: number, cls = ''): string {
  if (url) return `<img class="avatar ${cls}" src="${escapeHtml(url)}" width="${size}" height="${size}" alt="" loading="lazy" style="width:${size}px;height:${size}px">`;
  return `<span class="avatar ph ${cls}" style="width:${size}px;height:${size}px"></span>`;
}

function goalLine(e: DirectoryEntry): { label: string; frac: number } {
  if (!e.funded || e.balance_usd_cents <= 0) return { label: 'Awaiting funding', frac: 0 };
  const raw = e.runway_days !== null ? Math.max(0, Math.round(e.runway_days)) : 0;
  const shown = raw > 9999 ? '9,999+' : raw.toLocaleString();
  const label = raw >= e.goal_days ? `${shown} days funded · goal met` : `${shown} of ${e.goal_days} days funded`;
  return { label, frac: Math.min(1, raw / Math.max(1, e.goal_days)) };
}

function progress(frac: number, color: string): string {
  const pct = Math.round(Math.max(0, Math.min(1, frac)) * 100);
  return `<div class="track"><div class="fill" style="width:${pct}%;background:${color}"></div></div>`;
}

function statusDot(status: 'funded' | 'low' | 'unfunded'): string {
  const s = STATUS[status];
  return `<span class="status"><span class="dot" style="background:${s.color}"></span>${s.label}</span>`;
}

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<title>${escapeHtml(title)}</title>
<style>
  *{box-sizing:border-box;}
  html{-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;}
  body{margin:0;background:${C.bg};color:${C.ink};font:16px/1.6 'Inter',-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;}
  a{color:inherit;text-decoration:none;}
  .wrap{max-width:1080px;margin:0 auto;padding:0 24px 96px;}
  .nav{display:flex;align-items:center;height:68px;border-bottom:1px solid ${C.line};margin-bottom:48px;position:sticky;top:0;background:rgba(255,255,255,.85);backdrop-filter:saturate(180%) blur(12px);z-index:10;}
  .nav .inner{display:flex;align-items:center;gap:20px;width:100%;max-width:1080px;margin:0 auto;padding:0 24px;}
  .nav .brand{font-weight:800;font-size:19px;letter-spacing:-.02em;}
  .nav .links a{color:${C.muted};font-weight:600;font-size:15px;}
  .nav .links a:hover{color:${C.ink};}
  .nav .spacer{flex:1;}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:${C.accent};color:#fff;font-weight:700;font-size:15px;padding:11px 20px;border-radius:999px;border:0;cursor:pointer;line-height:1;transition:background .15s ease,transform .15s ease;white-space:nowrap;}
  .btn:hover{background:${C.accentDark};text-decoration:none;}
  .btn:active{transform:scale(.98);}
  .btn.block{width:100%;padding:13px 20px;}
  .btn.ghost{background:#fff;color:${C.ink};border:1.5px solid #d4d1cb;}
  .btn.ghost:hover{background:${C.wash};border-color:#c4c1ba;}
  .btn.outline{background:#fff;color:${C.accent};border:1.5px solid #ffd0d3;}
  .btn.outline:hover{background:#fff5f5;border-color:${C.accent};}
  .display{font-size:46px;line-height:1.05;font-weight:800;letter-spacing:-.03em;margin:8px 0 14px;}
  .lede{color:${C.muted};font-size:19px;line-height:1.5;max-width:600px;margin:0 0 28px;}
  .stripe{display:flex;gap:36px;flex-wrap:wrap;padding:18px 0 0;border-top:1px solid ${C.line};margin-top:8px;}
  .stripe .n{font-size:24px;font-weight:800;letter-spacing:-.02em;display:block;}
  .stripe .k{color:${C.muted};font-size:14px;font-weight:500;}
  .sectionhdr{display:flex;align-items:baseline;justify-content:space-between;margin:48px 0 20px;}
  .sectionhdr h2{font-size:22px;font-weight:800;letter-spacing:-.02em;margin:0;}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(312px,1fr));gap:24px;}
  .card{background:${C.panel};border:1px solid ${C.line};border-radius:18px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 2px 8px rgba(36,40,47,.04),0 4px 12px rgba(36,40,47,.06);transition:transform .18s ease,box-shadow .18s ease;}
  .card:hover{transform:translateY(-4px);box-shadow:0 18px 40px -12px rgba(16,17,26,.18);}
  .card .cover{height:104px;background-size:cover;background-position:center;}
  .card .cbody{padding:0 24px 24px;display:flex;flex-direction:column;gap:8px;flex:1;}
  .card .av{margin-top:-30px;margin-bottom:2px;}
  .avatar{border-radius:50%;background:${C.wash};object-fit:cover;display:inline-block;}
  .avatar.ring{border:4px solid #fff;box-shadow:0 2px 6px rgba(16,17,26,.12);}
  .avatar.ph{background:linear-gradient(135deg,#cfd2d6,#a9adb3);}
  .pname{font-weight:800;font-size:18px;letter-spacing:-.01em;}
  .ptag{color:#575e6a;font-size:14.5px;line-height:1.55;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:44px;}
  .pmeta{color:${C.body};font-size:14px;font-weight:500;}
  .pmeta b{font-weight:700;}
  .goalrow{display:flex;justify-content:space-between;align-items:center;font-size:13.5px;color:${C.muted};margin-top:4px;}
  .track{height:8px;background:${C.wash};border-radius:999px;overflow:hidden;margin-top:6px;}
  .fill{height:100%;border-radius:999px;}
  .status{display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:${C.body};}
  .dot{width:9px;height:9px;border-radius:50%;display:inline-block;}
  .cardfoot{margin-top:auto;padding-top:14px;}
  .cover-hero{height:200px;border-radius:20px;background-size:cover;background-position:center;border:1px solid ${C.line};}
  .phead{display:flex;gap:22px;align-items:flex-end;margin:-56px 0 32px 8px;}
  @media(max-width:640px){.phead{flex-direction:column;align-items:flex-start;gap:12px;margin-top:-48px;}}
  .phead .htext{padding-bottom:6px;}
  .phead h1{font-size:34px;font-weight:800;letter-spacing:-.03em;margin:0 0 4px;}
  .phead .tag{color:${C.muted};font-size:17px;margin:0 0 12px;}
  .metarow{display:flex;gap:16px;align-items:center;flex-wrap:wrap;color:${C.body};font-size:15px;}
  .metarow b{font-weight:800;}
  .metarow .sep{color:${C.line};}
  .cols{display:grid;grid-template-columns:1fr 360px;gap:32px;align-items:start;}
  @media(max-width:880px){.cols{grid-template-columns:1fr;}}
  .side{position:sticky;top:92px;}
  @media(max-width:880px){.side{position:static;}}
  .panel{background:${C.panel};border:1px solid ${C.line};border-radius:18px;padding:24px;margin-bottom:24px;box-shadow:0 2px 8px rgba(36,40,47,.04),0 4px 12px rgba(36,40,47,.06);}
  .panel h3{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${C.faint};margin:0 0 16px;}
  .sub{color:${C.muted};font-size:14px;margin-top:4px;}
  .feed{list-style:none;margin:0;padding:0;}
  .feed li{display:flex;justify-content:space-between;gap:14px;align-items:center;padding:12px 0;border-bottom:1px solid ${C.line};font-size:15px;}
  .feed li:last-child{border-bottom:0;}
  .feed .who{color:${C.body};}
  .feed .amt{font-weight:700;font-variant-numeric:tabular-nums;}
  .feed .amt.pos{color:${C.green};}
  .feed .amt.neg{color:${C.muted};}
  .ledger{display:flex;flex-wrap:wrap;gap:18px 28px;margin-top:16px;}
  .ledger .item .v{font-weight:700;font-size:17px;font-variant-numeric:tabular-nums;}
  .ledger .item .l{color:${C.muted};font-size:13px;}
  .patrons{display:flex;flex-wrap:wrap;gap:10px;}
  .patron{display:inline-flex;align-items:center;gap:9px;background:${C.wash};border-radius:999px;padding:6px 14px 6px 6px;font-size:14px;font-weight:600;color:${C.ink};}
  .patron .tag{color:${C.muted};font-weight:500;}
  .tier{border:1.5px solid ${C.line};border-radius:16px;padding:20px;margin-bottom:14px;position:relative;transition:transform .18s ease,border-color .15s ease,box-shadow .18s ease;}
  .tier:hover{border-color:#dcd8d2;transform:translateY(-3px);}
  .tier.feat{border-color:${C.accent};box-shadow:0 8px 28px -14px rgba(255,66,77,.5);}
  .tier .badge{position:absolute;top:-10px;left:18px;background:${C.accent};color:#fff;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:3px 10px;border-radius:999px;}
  .tier .th{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;}
  .tier .tn{font-weight:800;font-size:16px;}
  .tier .tp{font-weight:800;font-size:20px;letter-spacing:-.02em;}
  .tier .tp span{font-weight:500;font-size:13px;color:${C.muted};}
  .tier ul{margin:0 0 16px;padding:0;list-style:none;}
  .tier li{color:${C.body};font-size:14px;padding:4px 0 4px 24px;position:relative;}
  .tier li:before{content:'✓';position:absolute;left:0;color:${C.accent};font-weight:800;}
  .coupon{display:flex;gap:10px;margin-top:6px;}
  .coupon input{flex:1;min-width:0;background:${C.bg};border:1.5px solid ${C.line};border-radius:12px;color:${C.ink};padding:11px 14px;font:14px 'Inter',ui-monospace,Menlo,monospace;letter-spacing:.04em;}
  .coupon input:focus{outline:none;border-color:${C.accent};}
  .note{color:${C.faint};font-size:13px;line-height:1.5;margin-top:10px;}
  .empty{color:${C.muted};text-align:center;padding:72px 0;border:1px dashed ${C.line};border-radius:18px;}
  .legend{color:${C.faint};font-size:13px;margin-top:28px;}
</style>
</head><body>${body}</body></html>`;
}

function nav(): string {
  return `<div class="nav"><div class="inner">
    <a href="/" class="brand">⛽ open-autonomy</a>
    <span class="links"><a href="/">Explore</a></span>
    <span class="spacer"></span>
    <a class="btn" href="https://github.com/sponsors/volter-ai">Become a patron</a>
  </div></div>`;
}

export function renderExplore(entries: DirectoryEntry[]): string {
  const listed = entries.filter((e) => e.listed);
  // Net money into listed projects: granted_in − granted_out cancels internal redistribution.
  const totalIn = listed.reduce((s, e) => s + (e.granted_in_usd_cents - e.granted_out_usd_cents), 0);
  const totalSpent = listed.reduce((s, e) => s + e.consumed_usd_cents, 0);
  const patrons = listed.reduce((s, e) => s + e.patron_count, 0);

  const cards = listed.map((e) => {
    const g = goalLine(e);
    const color = STATUS[e.status].color;
    const href = `/p/${encodeURIComponent(e.account)}`;
    const monthly = e.monthly_usd_cents ? `${usd0(e.monthly_usd_cents)}/mo` : '$0/mo';
    return `<div class="card">
      <a href="${href}"><div class="cover" style="${coverStyle(e.profile.cover_url, e.account)}"></div></a>
      <div class="cbody">
        <div class="av">${avatar(e.profile.avatar_url, 60, 'ring')}</div>
        <a href="${href}" class="pname">${escapeHtml(nameOf(e.account))}</a>
        <div class="ptag">${escapeHtml(e.profile.tagline ?? '')}</div>
        <div class="pmeta"><b>${e.patron_count}</b> patron${e.patron_count === 1 ? '' : 's'} · <b>${monthly}</b></div>
        <div class="goalrow"><span>${escapeHtml(g.label)}</span>${statusDot(e.status)}</div>
        ${progress(g.frac, color)}
        <div class="cardfoot"><a class="btn block" href="https://github.com/sponsors/${escapeHtml(ownerOf(e.account))}">Join</a></div>
      </div>
    </div>`;
  }).join('\n');

  const body = `${nav()}<div class="wrap">
    <h1 class="display">Fund a self-driving repo.</h1>
    <p class="lede">Self-coding projects that pay their own way. Back one monthly — the agents do the work, and you watch every dollar burn down in the open.</p>
    <div class="stripe">
      <div><span class="n">${usd0(totalIn)}</span><span class="k">funded</span></div>
      <div><span class="n">${usd0(totalSpent)}</span><span class="k">spent by agents</span></div>
      <div><span class="n">${listed.length}</span><span class="k">project${listed.length === 1 ? '' : 's'}</span></div>
      <div><span class="n">${patrons}</span><span class="k">patron${patrons === 1 ? '' : 's'}</span></div>
    </div>
    <div class="sectionhdr"><h2>Projects</h2></div>
    ${listed.length ? `<div class="grid">${cards}</div>` : `<div class="empty">No projects funded yet. A repo appears here the first time it runs an open-autonomy agent.</div>`}
    <div class="legend">A project self-lists the first time it runs an agent and its public repo is synced.</div>
  </div>`;
  return shell('Fund a self-driving repo · open-autonomy', body);
}

function feedItem(f: Flow): string {
  if (f.kind === 'consume') {
    const who = f.actor ? ` by @${escapeHtml(f.actor)}` : '';
    const where = f.issue ? ` · issue #${f.issue}` : '';
    return `<li><span class="who">Agent run${where}${who}</span><span class="amt neg">−${usd(f.amount_usd_cents)}</span></li>`;
  }
  if (f.kind === 'grant') {
    const fromProj = f.from?.includes('/');
    const label = fromProj ? `Granted by ${escapeHtml(f.from!)}` : `Granted from ${escapeHtml(f.from ?? '')}`;
    return `<li><span class="who">${label}</span><span class="amt pos">+${usd(f.amount_usd_cents)}</span></li>`;
  }
  const src = f.sponsor_login ? `Sponsored by @${escapeHtml(f.sponsor_login)}` : 'Funded';
  return `<li><span class="who">${src}</span><span class="amt pos">+${usd(f.amount_usd_cents)}</span></li>`;
}

function patronChip(p: Patron): string {
  const inner = `${avatar(p.avatar_url, 26)}<span>${escapeHtml(p.name ?? p.login)}${p.kind === 'project' ? ' <span class="tag">project</span>' : ''}</span>`;
  return p.url ? `<a class="patron" href="${escapeHtml(p.url)}">${inner}</a>` : `<span class="patron">${inner}</span>`;
}

export function renderProject(v: ProjectView): string {
  const owner = ownerOf(v.account);
  const color = STATUS[v.status].color;
  const g = goalLine(v);
  const monthly = v.monthly_usd_cents ? `${usd0(v.monthly_usd_cents)}/mo` : '$0/mo';
  const enc = encodeURIComponent(v.account);

  const tiers = v.tiers.map((t, i) => {
    const feat = i === 1;
    return `<div class="tier${feat ? ' feat' : ''}">
      ${feat ? '<span class="badge">Popular</span>' : ''}
      <div class="th"><span class="tn">${escapeHtml(t.name)}</span><span class="tp">${usd0(t.usd_cents)} <span>/mo</span></span></div>
      <ul>${t.perks.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>
      <a class="btn block ${feat ? '' : 'outline'}" href="https://github.com/sponsors/${escapeHtml(owner)}">Join</a>
    </div>`;
  }).join('\n');

  const feed = v.feed.length ? `<ul class="feed">${v.feed.map(feedItem).join('')}</ul>` : `<p class="sub">No activity yet.</p>`;
  const patrons = v.patrons.length ? `<div class="patrons">${v.patrons.map(patronChip).join('')}</div>` : `<p class="sub">No patrons yet — be the first.</p>`;

  const body = `${nav()}<div class="wrap">
    <div class="cover-hero" style="${coverStyle(v.profile.cover_url, v.account)}"></div>
    <div class="phead">
      ${avatar(v.profile.avatar_url, 104, 'ring')}
      <div class="htext">
        <h1>${escapeHtml(nameOf(v.account))}</h1>
        <p class="tag">${escapeHtml(v.profile.tagline ?? `${owner}/${nameOf(v.account)}`)}</p>
        <div class="metarow"><span><b>${v.patron_count}</b> patrons</span><span class="sep">|</span><span><b>${monthly}</b></span><span class="sep">|</span>${statusDot(v.status)}</div>
      </div>
    </div>
    <div class="cols">
      <div>
        <div class="panel">
          <h3>Goal</h3>
          <div class="goalrow" style="margin-bottom:2px"><span style="font-size:15px;color:${C.body};font-weight:600">${escapeHtml(g.label)}</span></div>
          ${progress(g.frac, color)}
          <p class="note">Keep ${v.goal_days} days of agent runway funded. Days remaining is a Bayesian estimate of daily spend.</p>
        </div>
        <div class="panel">
          <h3>Recent activity</h3>
          ${feed}
        </div>
        <div class="panel">
          <h3>Transparency</h3>
          <img src="/v1/accounts/${enc}/runway.svg" width="460" height="116" style="max-width:100%;border-radius:12px;border:1px solid ${C.line}" alt="funding runway">
          <div class="ledger">
            <div class="item"><div class="v">${usd(v.granted_in_usd_cents)}</div><div class="l">received</div></div>
            ${v.granted_out_usd_cents > 0 ? `<div class="item"><div class="v">${usd(v.granted_out_usd_cents)}</div><div class="l">funded onward</div></div>` : ''}
            <div class="item"><div class="v">${usd(v.consumed_usd_cents)}</div><div class="l">spent</div></div>
            <div class="item"><div class="v">${usd(v.balance_usd_cents)}</div><div class="l">balance</div></div>
          </div>
        </div>
        <div class="panel">
          <h3>Patrons</h3>
          ${patrons}
        </div>
      </div>
      <div class="side">
        <div class="panel">
          <h3>Become a patron</h3>
          ${tiers}
        </div>
        <div class="panel">
          <h3>Have a sponsor coupon?</h3>
          <form class="coupon" method="POST" action="/p/${enc}/redeem">
            <input name="code" placeholder="SPON-XXXX-XXXX-XXXX" autocomplete="off">
            <button class="btn" type="submit">Redeem</button>
          </form>
          <p class="note">Funds this project's real token + CI costs. At $0, the agents stop.</p>
        </div>
      </div>
    </div>
  </div>`;
  return shell(`${nameOf(v.account)} · open-autonomy`, body);
}

export function renderRedeemResult(account: string, ok: boolean, message: string): string {
  const enc = encodeURIComponent(account);
  const body = `${nav()}<div class="wrap">
    <div class="panel" style="max-width:540px;margin:56px auto;text-align:center;padding:44px 40px">
      <div style="font-size:44px;margin-bottom:8px">${ok ? '🎉' : '😕'}</div>
      <h1 style="font-size:26px;font-weight:800;letter-spacing:-.02em;margin:0 0 10px">${ok ? 'Coupon redeemed' : 'Coupon not redeemed'}</h1>
      <p style="color:${C.muted};font-size:16px;margin:0 0 24px">${escapeHtml(message)}</p>
      <a class="btn ghost" href="/p/${enc}">← Back to ${escapeHtml(account)}</a>
    </div>
  </div>`;
  return shell('Coupon · open-autonomy', body);
}
