import type { FundingSnapshot } from './limit-ledger.js';

// Renders the funding "runway" as a self-contained, Camo-safe SVG (no scripts, no animation, no
// external references) suitable for embedding directly in a GitHub README as an <img>. This is the
// only visible surface of the funding system.

const W = 460;
const H = 116;

const COLORS = {
  bg: '#0d1117',
  border: '#30363d',
  track: '#21262d',
  text: '#e6edf3',
  muted: '#8b949e',
  green: '#3fb950',
  amber: '#d29922',
  red: '#f85149',
  gray: '#6e7681',
};

function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => (
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&apos;' : '&quot;'
  ));
}

const fmtDays = (d: number) => (d > 9999 ? '9999+' : String(Math.max(0, Math.round(d))));

export function renderRunwaySvg(f: FundingSnapshot): string {
  const budget = f.granted_in_usd_cents;
  const remaining = f.balance_usd_cents;

  // State -> color + fill fraction + line 1 (runway) + line 2 (small-font method note).
  let color = COLORS.gray;
  let frac = 0;
  let headline: string;
  let sub: string;
  let note: string;

  if (!f.funded || budget <= 0) {
    headline = 'Not yet funded';
    sub = 'Sponsor to start funding the agents';
    note = 'runway = balance ÷ a Bayesian estimate of daily spend';
  } else if (f.paused || remaining <= 0) {
    color = COLORS.red;
    headline = 'Funding needed — agents paused';
    sub = `${usd(0)} left of ${usd(budget)} sponsored`;
    note = 'add funds to resume';
  } else {
    frac = Math.max(0.02, Math.min(1, remaining / budget));
    color = frac > 0.25 ? COLORS.green : COLORS.amber;
    headline = `${usd(remaining)} left of ${usd(budget)}`;
    if (f.runway_confident && f.runway_days !== null) {
      sub = `~${fmtDays(f.runway_days)} days of runway · ~${usd(f.burn_per_day_usd_cents)}/day`;
      const lo = f.runway_lo_days !== null ? fmtDays(f.runway_lo_days) : '?';
      const hi = f.runway_hi_days !== null ? fmtDays(f.runway_hi_days) : '?';
      note = `Bayesian: posterior $/day from ${f.days_observed}d + prior · 80% CI ${lo}–${hi} days`;
    } else {
      sub = 'estimating runway…';
      note = `Bayesian: weak prior + ${f.days_observed}d of spend — interval too wide to project yet`;
    }
  }

  const padX = 16;
  const barY = 52;
  const barW = W - padX * 2;
  const fillW = Math.round(barW * frac);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Funding: ${escapeXml(headline)}">
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="11" fill="${COLORS.bg}" stroke="${COLORS.border}"/>
  <circle cx="${padX + 5}" cy="22" r="5" fill="${color}"/>
  <text x="${padX + 18}" y="26" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif" font-size="14" font-weight="700" fill="${COLORS.text}">${escapeXml(headline)}</text>
  <text x="${W - padX}" y="26" text-anchor="end" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif" font-size="11" font-weight="600" fill="${COLORS.muted}">⛽ funding</text>
  <rect x="${padX}" y="${barY}" width="${barW}" height="12" rx="6" fill="${COLORS.track}"/>
  ${fillW > 0 ? `<rect x="${padX}" y="${barY}" width="${fillW}" height="12" rx="6" fill="${color}"/>` : ''}
  <text x="${padX}" y="${barY + 28}" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="11" fill="${COLORS.muted}">${escapeXml(sub)}</text>
  <text x="${padX}" y="${barY + 46}" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="9" fill="${COLORS.gray}">${escapeXml(note)}</text>
</svg>`;
}
