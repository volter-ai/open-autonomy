import { raw } from 'hono/html';
import type { DirectoryEntry, Flow, LiveRun, Patron, ProjectView } from './limit-ledger.js';
import { CharterPanel, RoadmapPanel, ChangelogPanel } from './project-docs.js';
import { icon } from './icons.js';
import { Icon } from './ui/Icon.js';
import { render } from './ui/render.js';

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

// Brand mark (Gemini-designed): an open loop ending in an arrow — autonomy + forward motion.
// Coral so it reads on both light and dark. Used in the nav and served as the favicon.
export const LOGO_SVG = '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" fill="#ff424d" d="M50 0C22.3858 0 0 22.3858 0 50C0 77.6142 22.3858 100 50 100C77.6142 100 100 77.6142 100 50C100 38.0426 95.539 27.0133 88.0381 18.6863L76.9881 30.056C81.8211 36.192 84.2105 44.0927 84.2105 50C84.2105 68.9431 68.9431 84.2105 50 84.2105C31.0569 84.2105 15.7895 68.9431 15.7895 50C15.7895 31.0569 31.0569 15.7895 50 15.7895C55.9073 15.7895 62.1927 18.1789 67.2243 22.564L78.6923 11.458C70.9867 4.30074 61.0266 0 50 0Z"/></svg>';

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

// Only accept http(s) image URLs with no characters that could break out of an HTML attribute or a
// CSS url('…') context. cover_url/avatar_url come from untrusted sources (a repo's README image, the
// GitHub avatar, an operator override), so an unsanitized URL containing a quote/paren could inject
// CSS into the style attribute (HTML-escaping the quote is decoded back inside the attribute, so the
// CSS parser still sees it). Reject anything outside the safe set → falls back to the gradient.
function safeUrl(url: string | undefined): string | undefined {
  return url && /^https:\/\/[^\s'"()<>\\]+$/.test(url) ? url : undefined;
}

// Deterministic warm gradient so coverless projects still look intentional, not blank.
function coverStyle(url: string | undefined, seed = ''): string {
  const safe = safeUrl(url);
  if (safe) return `background-image:url('${safe}')`;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return `background:linear-gradient(135deg,hsl(${h} 48% 64%),hsl(${(h + 40) % 360} 52% 54%))`;
}

function Avatar({ url, size, cls = '' }: { url?: string; size: number; cls?: string }) {
  const safe = safeUrl(url);
  return safe
    ? <img class={`avatar ${cls}`} src={safe} width={size} height={size} alt="" loading="lazy" style={`width:${size}px;height:${size}px`} />
    : <span class={`avatar ph ${cls}`} style={`width:${size}px;height:${size}px`} />;
}

function goalLine(e: DirectoryEntry): { label: string; frac: number } {
  if (!e.funded || e.balance_usd_cents <= 0) return { label: 'Awaiting funding', frac: 0 };
  const days = e.runway_days !== null ? Math.max(0, Math.round(e.runway_days)) : 0;
  const shown = days > 9999 ? '9,999+' : days.toLocaleString();
  const label = days >= e.goal_days ? `${shown} days funded · goal met` : `${shown} of ${e.goal_days} days funded`;
  return { label, frac: Math.min(1, days / Math.max(1, e.goal_days)) };
}

function Progress({ frac, color }: { frac: number; color: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, frac)) * 100);
  return <div class="track"><div class="fill" style={`width:${pct}%;background:${color}`} /></div>;
}

function StatusDot({ status }: { status: 'funded' | 'low' | 'unfunded' }) {
  const s = STATUS[status];
  return <span class="status"><span class="dot" style={`background:${s.color}`} />{s.label}</span>;
}

const STYLES = `
  *{box-sizing:border-box;}
  html{-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;}
  body{margin:0;background:${C.bg};color:${C.ink};font:16px/1.6 'Inter',-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;}
  a{color:inherit;text-decoration:none;}
  .wrap{max-width:1080px;margin:0 auto;padding:0 24px 96px;}
  .nav{display:flex;align-items:center;height:68px;border-bottom:1px solid ${C.line};margin-bottom:48px;position:sticky;top:0;background:rgba(255,255,255,.85);backdrop-filter:saturate(180%) blur(12px);z-index:10;}
  .nav .inner{display:flex;align-items:center;gap:20px;width:100%;max-width:1080px;margin:0 auto;padding:0 24px;}
  .nav .brand{display:inline-flex;align-items:center;gap:9px;font-weight:800;font-size:19px;letter-spacing:-.02em;}
  .nav .brand svg{width:26px;height:26px;display:block;}
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
  .cardfoot .join{margin-top:14px;}
  .cover-hero{height:200px;border-radius:20px;background-size:cover;background-position:center;border:1px solid ${C.line};}
  .phead{margin:-52px 0 48px 8px;}
  .phead .avatar{display:block;position:relative;z-index:1;}
  .phead .htext{margin-top:18px;}
  .phead h1{font-size:38px;font-weight:800;letter-spacing:-.03em;margin:0 0 4px;}
  .phead .tag{color:${C.muted};font-size:17px;margin:0 0 12px;}
  .metarow{display:flex;gap:16px;align-items:center;flex-wrap:wrap;color:${C.body};font-size:15px;}
  .metarow b{font-weight:800;}
  .metarow .sep{color:${C.line};}
  .repo-pill{display:inline-flex;align-items:center;gap:7px;background:${C.wash};border:1px solid ${C.line};border-radius:999px;padding:5px 12px;font-size:13.5px;font-weight:600;color:${C.ink};line-height:1;}
  .repo-pill:hover{border-color:${C.accent};color:${C.accent};}
  .repo-pill .ext{color:${C.faint};margin-left:-2px;}
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
  .prose{color:${C.body};font-size:15px;line-height:1.65;}
  .prose p{margin:0 0 12px;}
  .prose p:last-child{margin-bottom:0;}
  .prose strong{font-weight:700;color:${C.ink};}
  .prose code{background:${C.wash};border-radius:5px;padding:1px 5px;font:13px ui-monospace,Menlo,monospace;}
  .docmore{display:inline-block;margin-top:14px;color:${C.accent};font-weight:600;font-size:14px;}
  .docmore:hover{color:${C.accentDark};text-decoration:underline;}
  .rm-momentum{margin-bottom:24px;}
  .rm-stats{display:flex;gap:16px;font-size:14px;color:${C.muted};margin-bottom:8px;}
  .rm-stats span{display:flex;align-items:baseline;gap:5px;}
  .rm-stats b{font-weight:700;color:${C.ink};}
  .rm-stats .act b{color:${C.accent};}
  .rm-track{height:6px;background:${C.wash};border-radius:999px;overflow:hidden;}
  .rm-fill{height:100%;background:${C.accent};border-radius:999px;}
  /* Roadmap = intents ABOVE issues. Each item is an epic row; decomposed ones expand into their child issues. */
  .rm-group{margin-bottom:18px;}
  .rm-group:last-of-type{margin-bottom:0;}
  .rm-group-hdr{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${C.faint};margin:0 0 8px;}
  .rm-group-hdr .n{background:${C.wash};color:${C.muted};font-size:11px;font-weight:700;line-height:1;padding:3px 7px;border-radius:999px;}
  .rm-epics{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;}
  .rm-epic{border:1px solid ${C.line};border-radius:12px;background:${C.bg};overflow:hidden;}
  .rm-epic>details>summary{list-style:none;cursor:pointer;}
  .rm-epic>details>summary::-webkit-details-marker{display:none;}
  .rm-ehead{display:flex;align-items:center;gap:10px;padding:12px 14px;}
  .rm-caret{flex:none;width:0;height:0;border-left:5px solid ${C.faint};border-top:4px solid transparent;border-bottom:4px solid transparent;transition:transform .15s ease;}
  .rm-epic.flat .rm-caret{visibility:hidden;}
  .rm-epic>details[open] .rm-caret{transform:rotate(90deg);}
  .rm-etitle{flex:1;min-width:0;font-size:14px;font-weight:600;color:${C.ink};line-height:1.35;}
  .rm-ephase{flex:none;font-size:11px;font-weight:600;color:${C.faint};}
  .rm-estatus{flex:none;font-size:12px;font-weight:700;color:${C.muted};font-variant-numeric:tabular-nums;}
  .rm-epic.active{border-color:${C.accent};box-shadow:0 4px 14px -8px rgba(255,66,77,.4);}
  .rm-epic.active .rm-etitle{color:${C.accentDark};}
  .rm-epic.active .rm-estatus{color:${C.accent};}
  .rm-epic.proposed{border-style:dashed;background:transparent;}
  .rm-epic.proposed .rm-etitle{font-weight:500;color:${C.body};}
  .rm-epic.done .rm-etitle{color:${C.muted};font-weight:500;}
  .rm-ebar{height:4px;background:${C.wash};border-radius:999px;overflow:hidden;margin:0 14px 12px;}
  .rm-efill{height:100%;background:${C.accent};border-radius:999px;}
  .rm-epic.done .rm-efill{background:${C.green};}
  .rm-issues{padding:2px 14px 13px;}
  .rm-issues ul{list-style:none;margin:0;padding:0;border-top:1px solid ${C.line};}
  .rm-issues li{font-size:13px;line-height:1.4;}
  .rm-issues li a,.rm-issues li>span{display:flex;align-items:baseline;gap:8px;padding:7px 2px;color:${C.body};}
  .rm-issues li a:hover{color:${C.accent};}
  .rm-issues li a:hover .rm-it{text-decoration:underline;}
  .rm-ic{flex:none;font-size:12px;font-weight:700;width:13px;text-align:center;}
  .rm-ic.open{color:${C.amber};}
  .rm-ic.closed{color:${C.green};}
  .rm-inum{flex:none;color:${C.faint};font-variant-numeric:tabular-nums;font-weight:600;}
  .rm-it{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .rm-more{display:inline-block;margin-top:9px;font-size:12px;font-weight:600;color:${C.accent};}
  .rm-more:hover{text-decoration:underline;}
  .rm-fold{margin-top:14px;}
  .rm-fold>summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px;padding:11px 0 9px;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:${C.faint};border-top:1px solid ${C.line};}
  .rm-fold>summary::-webkit-details-marker{display:none;}
  .rm-fold>summary::before{content:'▸';color:${C.muted};font-size:11px;transition:transform .15s ease;}
  .rm-fold[open]>summary::before{transform:rotate(90deg);}
  .rm-fold>summary:hover{color:${C.ink};}
  .release{margin-bottom:18px;}
  .release:last-child{margin-bottom:0;}
  .rel-head{font-weight:800;font-size:14px;color:${C.ink};margin-bottom:8px;letter-spacing:-.01em;}
  .changelog{list-style:none;margin:0;padding:0;}
  .changelog li{color:${C.body};font-size:14px;line-height:1.55;padding:5px 0 5px 18px;position:relative;}
  .changelog li:before{content:'';position:absolute;left:2px;top:11px;width:5px;height:5px;border-radius:50%;background:${C.accent};}
  .empty{color:${C.muted};text-align:center;padding:72px 0;border:1px dashed ${C.line};border-radius:18px;}
  .legend{color:${C.faint};font-size:13px;margin-top:28px;}
  .panel h3 .live{display:inline-flex;align-items:center;gap:6px;float:right;color:${C.green};font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;}
  .pulse{width:8px;height:8px;border-radius:50%;background:${C.green};box-shadow:0 0 0 0 rgba(10,135,84,.5);animation:pulse 1.8s infinite;}
  @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(10,135,84,.5);}70%{box-shadow:0 0 0 7px rgba(10,135,84,0);}100%{box-shadow:0 0 0 0 rgba(10,135,84,0);}}
  .runs{list-style:none;margin:0;padding:0;}
  .runs li{display:flex;align-items:center;gap:12px;padding:13px 0;border-bottom:1px solid ${C.line};}
  .runs li:last-child{border-bottom:0;}
  .runs .rd{flex:1;min-width:0;}
  .runs .rrole{font-weight:700;font-size:15px;color:${C.ink};letter-spacing:-.01em;}
  .runs .rrole .badge{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:${C.muted};background:${C.wash};border-radius:999px;padding:2px 8px;margin-left:8px;vertical-align:middle;}
  .runs .rsub{color:${C.muted};font-size:13.5px;margin-top:2px;}
  .runs .rsub a{color:${C.body};font-weight:600;}
  .runs .rsub a:hover{color:${C.accent};}
  .runs .rspend{text-align:right;white-space:nowrap;}
  .runs .rspend .v{font-weight:700;font-variant-numeric:tabular-nums;font-size:15px;}
  .runs .rspend .l{color:${C.faint};font-size:12px;}
  .runs .watch{display:inline-flex;align-items:center;gap:5px;white-space:nowrap;color:${C.accent};font-weight:700;font-size:13.5px;border:1.5px solid #ffd0d3;border-radius:999px;padding:7px 13px;}
  .runs .watch:hover{background:#fff5f5;border-color:${C.accent};}
  .sess-head{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:8px 0 6px;}
  .sess-head .role{font-weight:800;font-size:22px;letter-spacing:-.02em;}
  .sess-head .meta{color:${C.muted};font-size:14px;}
  .sess-head .meta a{color:${C.body};font-weight:600;}
  .sess-live{display:inline-flex;align-items:center;gap:6px;color:${C.green};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;}
  .turns{list-style:none;margin:18px 0 0;padding:0;}
  .turn{border:1px solid ${C.line};border-radius:12px;padding:12px 14px;margin-bottom:12px;background:${C.panel};}
  .turn .who{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:${C.faint};margin-bottom:6px;}
  .turn.assistant{border-left:3px solid ${C.accent};}
  .turn.user{border-left:3px solid #c9ccd1;}
  .turn pre{margin:0;white-space:pre-wrap;word-break:break-word;font:13px/1.55 ui-monospace,Menlo,monospace;color:${C.body};}
  /* Slide-in session drawer (LangSmith-style) — progressive enhancement over the full-page session view. */
  #run-backdrop{position:fixed;inset:0;background:rgba(16,17,26,.38);opacity:0;pointer-events:none;transition:opacity .2s ease;z-index:40;}
  #run-backdrop.open{opacity:1;pointer-events:auto;}
  #run-drawer{position:fixed;top:0;right:0;height:100vh;width:min(620px,94vw);background:#fff;box-shadow:-16px 0 48px -12px rgba(16,17,26,.28);transform:translateX(100%);transition:transform .26s cubic-bezier(.4,0,.2,1);z-index:41;display:flex;flex-direction:column;}
  #run-drawer.open{transform:translateX(0);}
  #run-drawer .rd-head{padding:18px 22px 16px;border-bottom:1px solid ${C.line};position:relative;}
  #run-drawer .rd-title{font-weight:800;font-size:20px;letter-spacing:-.02em;}
  #run-drawer .rd-meta{color:${C.muted};font-size:13.5px;margin-top:3px;}
  #run-drawer .rd-links{margin-top:9px;font-size:13px;}
  #run-drawer .rd-links a{color:${C.accent};font-weight:600;}
  #run-drawer .rd-close{position:absolute;top:14px;right:18px;font-size:24px;line-height:1;color:${C.faint};cursor:pointer;text-decoration:none;}
  #run-drawer .rd-close:hover{color:${C.ink};}
  #run-drawer .rd-body{flex:1;overflow-y:auto;padding:16px 22px 48px;background:${C.wash};}
  .rd-turn{border:1px solid ${C.line};border-radius:10px;padding:10px 12px;margin-bottom:10px;background:#fff;}
  .rd-turn.assistant{border-left:3px solid ${C.accent};}
  .rd-turn.user{border-left:3px solid #c9ccd1;}
  .rd-who{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:${C.faint};margin-bottom:5px;}
  .rd-turn pre{margin:0;white-space:pre-wrap;word-break:break-word;font:12.5px/1.5 ui-monospace,Menlo,monospace;color:${C.body};}
  .rd-empty{color:${C.muted};text-align:center;padding:44px 0;}
  /* Unified activity feed (runs + funding), paginated. */
  .act-list{list-style:none;margin:0;padding:0;}
  .act{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid ${C.line};}
  .act:last-child{border-bottom:0;}
  .act-dot{width:9px;height:9px;border-radius:50%;flex:none;}
  .act-dot.running{background:${C.green};box-shadow:0 0 0 0 rgba(10,135,84,.5);animation:pulse 1.8s infinite;}
  .act-dot.done{background:#cfd2d6;}
  .act-dot.fund{width:auto;height:auto;border-radius:0;background:none;color:${C.green};font-weight:800;}
  .act-main{flex:1;min-width:0;}
  .act-title{font-weight:700;font-size:15px;color:${C.ink};letter-spacing:-.01em;}
  .act-title .badge{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:${C.muted};background:${C.wash};border-radius:999px;padding:2px 8px;margin-left:8px;vertical-align:middle;}
  .act-sub{color:${C.muted};font-size:13.5px;margin-top:2px;}
  .act-sub a{color:${C.body};font-weight:600;}
  .act-sub a:hover{color:${C.accent};}
  .act-right{display:flex;align-items:center;gap:13px;white-space:nowrap;}
  .act-amt{font-weight:700;font-variant-numeric:tabular-nums;font-size:14.5px;color:${C.body};}
  .act-amt.pos{color:${C.green};}
  .act .watch{display:inline-flex;align-items:center;gap:5px;color:${C.accent};font-weight:700;font-size:13px;border:1.5px solid #ffd0d3;border-radius:999px;padding:6px 12px;}
  .act .watch:hover{background:#fff5f5;border-color:${C.accent};}
  .act-page{display:flex;justify-content:space-between;align-items:center;margin-top:16px;padding-top:14px;border-top:1px solid ${C.line};font-size:13.5px;}
  .act-page a{color:${C.accent};font-weight:600;}
  .act-page .dim{color:${C.faint};}
`;

// Page chrome (head + global CSS + body wrapper) as a TSX component. The CSS lives in STYLES (one big block,
// injected raw). Pages render their body to a string and pass it via the shell() bridge below until they're
// fully TSX, at which point they can use <Shell> directly.
function Shell({ title, refreshSeconds, children }: { title: string; refreshSeconds?: number; children?: unknown }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {refreshSeconds ? <meta http-equiv="refresh" content={String(refreshSeconds)} /> : null}
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        <title>{title}</title>
        <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

function Nav() {
  return (
    <div class="nav"><div class="inner">
      <a href="/" class="brand">{raw(LOGO_SVG)}<span>open-autonomy</span></a>
      <span class="links"><a href="/">Explore</a></span>
      <span class="spacer"></span>
      <a class="btn" href="https://github.com/sponsors/volter-ai">Become a patron</a>
    </div></div>
  );
}

function ProjectCard({ e }: { e: DirectoryEntry }) {
  const g = goalLine(e);
  const href = `/p/${encodeURIComponent(e.account)}`;
  const monthly = e.monthly_usd_cents ? `${usd0(e.monthly_usd_cents)}/mo` : '$0/mo';
  return (
    <div class="card">
      <a href={href}><div class="cover" style={coverStyle(e.profile.cover_url, e.account)} /></a>
      <div class="cbody">
        <div class="av"><Avatar url={e.profile.avatar_url} size={60} cls="ring" /></div>
        <a href={href} class="pname">{nameOf(e.account)}</a>
        <div class="ptag">{e.profile.tagline ?? ''}</div>
        <div class="pmeta"><b>{e.patron_count}</b>{` patron${e.patron_count === 1 ? '' : 's'} · `}<b>{monthly}</b></div>
        <div class="cardfoot">
          <div class="goalrow"><span>{g.label}</span><StatusDot status={e.status} /></div>
          <Progress frac={g.frac} color={STATUS[e.status].color} />
          <a class="btn block join" href={`https://github.com/sponsors/${ownerOf(e.account)}`}>Join</a>
        </div>
      </div>
    </div>
  );
}

export function renderExplore(entries: DirectoryEntry[]): string {
  const listed = entries.filter((e) => e.listed);
  // Net money into listed projects: granted_in − granted_out cancels internal redistribution.
  const totalIn = listed.reduce((s, e) => s + (e.granted_in_usd_cents - e.granted_out_usd_cents), 0);
  const totalSpent = listed.reduce((s, e) => s + e.consumed_usd_cents, 0);
  const patrons = listed.reduce((s, e) => s + e.patron_count, 0);
  return render(
    <Shell title="Fund a self-driving repo · open-autonomy">
      <Nav />
      <div class="wrap">
        <h1 class="display">Fund a self-driving repo.</h1>
        <p class="lede">Self-coding projects that pay their own way. Back one monthly — the agents do the work, and you watch every dollar burn down in the open.</p>
        <div class="stripe">
          <div><span class="n">{usd0(totalIn)}</span><span class="k">funded</span></div>
          <div><span class="n">{usd0(totalSpent)}</span><span class="k">spent by agents</span></div>
          <div><span class="n">{listed.length}</span><span class="k">{`project${listed.length === 1 ? '' : 's'}`}</span></div>
          <div><span class="n">{patrons}</span><span class="k">{`patron${patrons === 1 ? '' : 's'}`}</span></div>
        </div>
        <div class="sectionhdr"><h2>Projects</h2></div>
        {listed.length
          ? <div class="grid">{listed.map((e) => <ProjectCard e={e} />)}</div>
          : <div class="empty">No projects funded yet. A repo appears here the first time it runs an open-autonomy agent.</div>}
        <div class="legend">A project self-lists the first time it runs an agent and its public repo is synced.</div>
      </div>
    </Shell>,
  );
}

function PatronChip({ p }: { p: Patron }) {
  const inner = <><Avatar url={p.avatar_url} size={26} /><span>{p.name ?? p.login}{p.kind === 'project' ? <span class="tag"> project</span> : null}</span></>;
  return p.url ? <a class="patron" href={p.url}>{inner}</a> : <span class="patron">{inner}</span>;
}

// Map a run's `purpose` (the role the agent is playing) to a human label for the live panel.
const PURPOSE_LABEL: Record<string, string> = {
  agent: 'Developer',
  develop: 'Developer',
  review: 'Reviewer',
  triage: 'Triage',
  pm: 'Project manager',
  planner: 'Planner',
  strategist: 'Strategist',
};

function relTime(fromMs: number | undefined, now: number): string {
  if (!fromMs) return '';
  const s = Math.max(0, Math.round((now - fromMs) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

const ACT_PAGE = 12;

// One agent-run row: status dot, role + issue/actor, when, spend, a "Watch live"/"View session" drawer
// trigger, and a GitHub-mark link to the raw Actions run.
function RunRow({ r, now }: { r: LiveRun; now: number }) {
  const role = PURPOSE_LABEL[r.purpose] ?? (r.purpose.charAt(0).toUpperCase() + r.purpose.slice(1));
  const ghRepo = `https://github.com/${r.repo}`;
  const elapsed = relTime(r.started_at_ms, now);
  const when = r.active ? (elapsed ? `running ${elapsed}` : 'running') : (elapsed ? `${elapsed} ago` : 'recently');
  return (
    <li class="act run">
      <span class={`act-dot ${r.active ? 'running' : 'done'}`} />
      <div class="act-main">
        <div class="act-title">{role}{r.system ? <span class="badge">system</span> : null}</div>
        <div class="act-sub">
          {r.issue > 0 ? <a href={`${ghRepo}/issues/${r.issue}`}>#{r.issue}</a> : 'autonomous'}
          {` · @${r.actor} · ${when} · ${r.request_count} call${r.request_count === 1 ? '' : 's'}`}
        </div>
      </div>
      <div class="act-right">
        <span class="act-amt">{usd(r.consumed_usd_cents)}</span>
        <a class="watch" href={`/p/${encodeURIComponent(r.repo)}/runs/${encodeURIComponent(r.run_id)}`} data-run={r.run_id} data-repo={r.repo}>{r.active ? 'Watch live ›' : 'View session ›'}</a>
      </div>
    </li>
  );
}

// One funding event row (money IN — grant / sponsor / mint). Consume flows are omitted: an agent's spend is
// already shown on its run row, so listing it again would double-count the activity.
function FundRow({ f, now }: { f: Flow; now: number }) {
  const label = f.kind === 'grant'
    ? `Granted from ${f.from ?? ''}`
    : f.sponsor_login ? `Sponsored by @${f.sponsor_login}` : 'Funded';
  const when = relTime(Date.parse(f.ts) || undefined, now);
  return (
    <li class="act fund">
      <span class="act-dot fund"><Icon name="heart" /></span>
      <div class="act-main"><div class="act-title">{label}</div><div class="act-sub">{when ? `${when} ago` : ''}</div></div>
      <div class="act-right"><span class="act-amt pos">+{usd(f.amount_usd_cents)}</span></div>
    </li>
  );
}

// The unified, time-sorted, paginated activity feed: recent agent runs (running + finished, with "when" +
// status + a live session drawer) interleaved with funding events.
function Activity({ runs, feed, page, now }: { runs: LiveRun[]; feed: Flow[]; page: number; now: number }) {
  const items = [
    ...runs.map((r) => ({ ts: r.started_at_ms ?? 0, node: <RunRow r={r} now={now} /> })),
    // Only money-IN events; consume flows are represented by their run rows.
    ...feed.filter((f) => f.kind === 'grant' || f.kind === 'mint').map((f) => ({ ts: Date.parse(f.ts) || 0, node: <FundRow f={f} now={now} /> })),
  ].sort((a, b) => b.ts - a.ts);
  const running = runs.filter((r) => r.active).length;
  const head = <h3 id="activity">Recent activity{running ? <span class="live"><span class="pulse" />{`${running} running`}</span> : null}</h3>;
  if (!items.length) {
    return <div class="panel">{head}<p class="sub">No activity yet. When this repo runs an agent or receives funding, it shows up here.</p></div>;
  }
  const pages = Math.max(1, Math.ceil(items.length / ACT_PAGE));
  const p = Math.min(Math.max(0, page), pages - 1);
  const slice = items.slice(p * ACT_PAGE, p * ACT_PAGE + ACT_PAGE);
  return (
    <div class="panel">
      {head}
      <ul class="act-list">{slice.map((i) => i.node)}</ul>
      {pages > 1 ? (
        <div class="act-page">
          {p > 0 ? <a href={`?p=${p - 1}#activity`}>← newer</a> : <span class="dim">← newer</span>}
          <span class="dim">{`page ${p + 1} of ${pages}`}</span>
          {p < pages - 1 ? <a href={`?p=${p + 1}#activity`}>older →</a> : <span class="dim">older →</span>}
        </div>
      ) : null}
    </div>
  );
}

function renderActivity(runs: LiveRun[], feed: Flow[], page: number, now: number): string {
  return render(<Activity runs={runs} feed={feed} page={page} now={now} />);
}

export interface RunSessionView {
  run_id: string;
  repo: string;
  issue: number;
  actor: string;
  purpose: string;
  github_run_id?: string;
  consumed_usd_cents: number;
  request_count: number;
  revoked: boolean;
  updated_at?: string;
  turns: Array<{ role: string; text: string }>;
}

function roleLabel(purpose: string): string {
  return PURPOSE_LABEL[purpose] ?? (purpose ? purpose.charAt(0).toUpperCase() + purpose.slice(1) : 'Agent');
}

function sessionActive(v: RunSessionView, now: number): boolean {
  const updatedMs = v.updated_at ? Date.parse(v.updated_at) : 0;
  return !v.revoked && updatedMs > 0 && now - updatedMs < 10 * 60 * 1000;
}

// The live session page behind "Watch live →": a redacted, rolling window of the agent's actual turns (model
// reasoning + tool calls), captured at the proxy as they happen. Auto-refreshes while the run is active. This
// is the in-progress view GitHub can't give (it buffers the step + serves no in-progress logs).
function RunSessionBody({ v, now }: { v: RunSessionView; now: number }) {
  const active = sessionActive(v, now);
  const ago = v.updated_at ? relTime(Date.parse(v.updated_at) || undefined, now) : '';
  return (
    <div class="wrap">
      <a class="docmore" href={`/p/${encodeURIComponent(v.repo)}`}>← {v.repo}</a>
      <div class="sess-head">
        <span class="role">{roleLabel(v.purpose)}</span>
        {active ? <span class="sess-live"><span class="pulse" />{`live${ago && ago !== 'just now' ? ` · updated ${ago} ago` : ''}`}</span> : null}
      </div>
      <div class="metarow"><span>
        {v.issue > 0 ? <a href={`https://github.com/${v.repo}/issues/${v.issue}`}>#{v.issue}</a> : 'autonomous'}
        {` · @${v.actor} · `}<b>{v.request_count}</b>{` call${v.request_count === 1 ? '' : 's'} · `}<b>{usd(v.consumed_usd_cents)}</b>{' spent'}
        {v.github_run_id ? <> · <a href={`https://github.com/${v.repo}/actions/runs/${v.github_run_id}`}><Icon name="github" /> raw Actions log ›</a></> : null}
      </span></div>
      <p class="note">A redacted, rolling window of the agent's live session — recent model turns and tool calls, captured at the model proxy as they happen.</p>
      {v.turns.length
        ? <ul class="turns">{v.turns.map((t) => (
            <li class={`turn ${t.role === 'assistant' ? 'assistant' : t.role === 'user' ? 'user' : ''}`}>
              <div class="who">{t.role}</div><pre>{t.text}</pre>
            </li>
          ))}</ul>
        : <div class="empty">{`No session captured yet — the agent hasn't called the model.${active ? ' This page refreshes automatically.' : ''}`}</div>}
    </div>
  );
}

export function renderRunSession(v: RunSessionView, nowMs: number): string {
  const active = sessionActive(v, nowMs);
  return render(
    <Shell title={`${roleLabel(v.purpose)} · ${nameOf(v.repo)} · open-autonomy`} refreshSeconds={active ? 8 : undefined}>
      <Nav />
      <RunSessionBody v={v} now={nowMs} />
    </Shell>,
  );
}

// The slide-in drawer's behavior. Vanilla, dependency-free, no template literals inside (so the outer
// template literal that embeds it doesn't try to interpolate). Clicking any [data-run] link opens the
// drawer and polls the public session.json every 4s; Esc / × / backdrop closes it. Without JS, the
// [data-run] anchor is a normal link to the full-page session view — progressive enhancement.
const DRAWER_JS = `
(function(){
  var drawer=document.getElementById('run-drawer'),backdrop=document.getElementById('run-backdrop');
  if(!drawer)return;
  var titleEl=drawer.querySelector('.rd-title'),metaEl=drawer.querySelector('.rd-meta'),linksEl=drawer.querySelector('.rd-links'),bodyEl=drawer.querySelector('.rd-body'),timer=null;
  function esc(s){var d=document.createElement('div');d.textContent=(s==null?'':String(s));return d.innerHTML;}
  function usd(c){return '$'+((Number(c)||0)/100).toFixed(2);}
  function gh(repo){return 'https://github.com/'+repo.split('/').map(encodeURIComponent).join('/');}
  function render(d){
    var role=String(d.purpose||'agent');
    titleEl.textContent=role.charAt(0).toUpperCase()+role.slice(1);
    var iss=d.issue>0?('<a target="_blank" href="'+gh(d.repo)+'/issues/'+d.issue+'">#'+d.issue+'</a>'):'autonomous';
    metaEl.innerHTML=iss+' \\u00b7 @'+esc(d.actor)+' \\u00b7 '+(d.request_count||0)+' calls \\u00b7 '+usd(d.consumed_usd_cents)+' spent'+(d.revoked?' \\u00b7 ended':'');
    var links=[];
    if(d.github_run_id)links.push('<a target="_blank" href="'+gh(d.repo)+'/actions/runs/'+esc(d.github_run_id)+'">'+OI_GH+' Open in GitHub Actions</a>');
    links.push('<a target="_blank" href="/p/'+encodeURIComponent(d.repo)+'/runs/'+encodeURIComponent(d.run_id)+'">'+OI_EXT+' Full page</a>');
    linksEl.innerHTML=links.join(' \\u00b7 ');
    var turns=(d.session&&d.session.turns)||[];
    bodyEl.innerHTML=turns.length?turns.map(function(t){return '<div class="rd-turn '+esc(t.role)+'"><div class="rd-who">'+esc(t.role)+'</div><pre>'+esc(t.text)+'</pre></div>';}).join(''):'<div class="rd-empty">No session captured yet \\u2014 the agent has not called the model.</div>';
  }
  function poll(repo,id){fetch('/p/'+encodeURIComponent(repo)+'/runs/'+encodeURIComponent(id)+'/session.json',{cache:'no-store'}).then(function(r){return r.json();}).then(render).catch(function(){});}
  function open(repo,id){drawer.classList.add('open');backdrop.classList.add('open');drawer.setAttribute('aria-hidden','false');bodyEl.innerHTML='<div class="rd-empty">Loading\\u2026</div>';poll(repo,id);clearInterval(timer);timer=setInterval(function(){poll(repo,id);},4000);}
  function close(){drawer.classList.remove('open');backdrop.classList.remove('open');drawer.setAttribute('aria-hidden','true');clearInterval(timer);timer=null;}
  document.addEventListener('click',function(e){var t=e.target.closest('[data-run]');if(t){e.preventDefault();open(t.getAttribute('data-repo'),t.getAttribute('data-run'));return;}if(e.target.closest('[data-rd-close]')){e.preventDefault();close();}});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')close();});
})();
`;

function Drawer() {
  const boot = `var OI_GH=${JSON.stringify(icon('github'))},OI_EXT=${JSON.stringify(icon('linkExternal'))};${DRAWER_JS}`;
  return (
    <>
      <div id="run-backdrop" data-rd-close="" />
      <aside id="run-drawer" aria-hidden="true">
        <div class="rd-head"><a class="rd-close" href="#" data-rd-close="" aria-label="Close">×</a><div class="rd-title">—</div><div class="rd-meta" /><div class="rd-links" /></div>
        <div class="rd-body" />
      </aside>
      <script dangerouslySetInnerHTML={{ __html: boot }} />
    </>
  );
}

function TierCard({ t, feat, owner }: { t: ProjectView['tiers'][number]; feat: boolean; owner: string }) {
  return (
    <div class={`tier${feat ? ' feat' : ''}`}>
      {feat ? <span class="badge">Popular</span> : null}
      <div class="th"><span class="tn">{t.name}</span><span class="tp">{usd0(t.usd_cents)} <span>/mo</span></span></div>
      <ul>{t.perks.map((p) => <li>{p}</li>)}</ul>
      <a class={`btn block ${feat ? '' : 'outline'}`} href={`https://github.com/sponsors/${owner}`}>Join</a>
    </div>
  );
}

function Project({ v, page }: { v: ProjectView; page: number }) {
  const owner = ownerOf(v.account);
  const color = STATUS[v.status].color;
  const g = goalLine(v);
  const monthly = v.monthly_usd_cents ? `${usd0(v.monthly_usd_cents)}/mo` : '$0/mo';
  const enc = encodeURIComponent(v.account);
  const now = Date.now();
  // The project's own identity, read from its repo (charter / roadmap / changelog). Each is '' when absent.
  // These panels are still string builders (in project-docs) — embedded via raw() until they migrate too.
  const repoUrl = v.account.includes('/') ? `https://github.com/${v.account}` : undefined;
  return (
    <>
      <Nav />
      <div class="wrap">
        <div class="cover-hero" style={coverStyle(v.profile.cover_url, v.account)} />
        <div class="phead">
          <Avatar url={v.profile.avatar_url} size={104} cls="ring" />
          <div class="htext">
            <h1>{nameOf(v.account)}</h1>
            <p class="tag">{v.profile.tagline ?? `${owner}/${nameOf(v.account)}`}</p>
            <div class="metarow">
              <span><b>{v.patron_count}</b> patrons</span><span class="sep">|</span>
              <span><b>{monthly}</b></span><span class="sep">|</span>
              <StatusDot status={v.status} />
              {repoUrl ? <><span class="sep">|</span><a class="repo-pill" href={repoUrl} target="_blank" rel="noopener"><Icon name="github" size={15} />{v.account}<span class="ext"><Icon name="linkExternal" size={11} /></span></a></> : null}
            </div>
          </div>
        </div>
        <div class="cols">
          <div>
            <CharterPanel md={v.profile.charter_md} repoUrl={repoUrl} />
            <RoadmapPanel yml={v.profile.roadmap_yml} repoUrl={repoUrl} statusJson={v.profile.roadmap_status_json} />
            <ChangelogPanel md={v.profile.changelog_md} repoUrl={repoUrl} />
            <div class="panel">
              <h3>Goal</h3>
              <div class="goalrow" style="margin-bottom:2px"><span style={`font-size:15px;color:${C.body};font-weight:600`}>{g.label}</span></div>
              <Progress frac={g.frac} color={color} />
              <p class="note">{`Keep ${v.goal_days} days of agent runway funded. Days remaining is a Bayesian estimate of daily spend.`}</p>
            </div>
            <Activity runs={v.recent_runs} feed={v.feed} page={page} now={now} />
            <div class="panel">
              <h3>Funding</h3>
              <img src={`/v1/accounts/${enc}/runway.svg`} width="460" height="116" style={`max-width:100%;border-radius:12px;border:1px solid ${C.line}`} alt="funding runway" />
              <div class="ledger">
                <div class="item"><div class="v">{usd(v.granted_in_usd_cents)}</div><div class="l">received</div></div>
                {v.granted_out_usd_cents > 0 ? <div class="item"><div class="v">{usd(v.granted_out_usd_cents)}</div><div class="l">funded onward</div></div> : null}
                <div class="item"><div class="v">{usd(v.consumed_usd_cents)}</div><div class="l">spent</div></div>
                <div class="item"><div class="v">{usd(v.balance_usd_cents)}</div><div class="l">balance</div></div>
              </div>
            </div>
            <div class="panel"><h3>Patrons</h3>{v.patrons.length ? <div class="patrons">{v.patrons.map((p) => <PatronChip p={p} />)}</div> : <p class="sub">No patrons yet — be the first.</p>}</div>
          </div>
          <div class="side">
            <div class="panel">
              <h3>Become a patron</h3>
              {v.tiers.map((t, i) => <TierCard t={t} feat={i === 1} owner={owner} />)}
            </div>
            <div class="panel">
              <h3>Have a sponsor coupon?</h3>
              <form class="coupon" method="post" action={`/p/${enc}/redeem`}>
                <input name="code" placeholder="SPON-XXXX-XXXX-XXXX" autocomplete="off" />
                <button class="btn" type="submit">Redeem</button>
              </form>
              <p class="note">Funds this project's real token + CI costs. At $0, the agents stop.</p>
            </div>
          </div>
        </div>
      </div>
      {v.recent_runs.some((r) => r.active) ? <Drawer /> : null}
    </>
  );
}

// No page-level auto-refresh: the live surface is the drawer (polls session.json; a meta-refresh would close
// an open drawer). The panel refreshes on navigation.
export function renderProject(v: ProjectView, page = 0): string {
  return render(<Shell title={`${nameOf(v.account)} · open-autonomy`}><Project v={v} page={page} /></Shell>);
}

export function renderRedeemResult(account: string, ok: boolean, message: string): string {
  return render(
    <Shell title="Coupon · open-autonomy">
      <Nav />
      <div class="wrap">
        <div class="panel" style="max-width:540px;margin:56px auto;text-align:center;padding:44px 40px">
          <div style="font-size:44px;margin-bottom:8px">{ok ? '🎉' : '😕'}</div>
          <h1 style="font-size:26px;font-weight:800;letter-spacing:-.02em;margin:0 0 10px">{ok ? 'Coupon redeemed' : 'Coupon not redeemed'}</h1>
          <p style={`color:${C.muted};font-size:16px;margin:0 0 24px`}>{message}</p>
          <a class="btn ghost" href={`/p/${encodeURIComponent(account)}`}>← Back to {account}</a>
        </div>
      </div>
    </Shell>,
  );
}
