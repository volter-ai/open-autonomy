import type { FundingSnapshot } from './limit-ledger.js';

// Renders the funding "runway" as a self-contained, Camo-safe SVG (no scripts, no animation, no
// external references) suitable for embedding directly in a GitHub README as an <img>. This is the
// only visible surface of the funding system.

const W = 460;
const H = 96;

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

export function renderRunwaySvg(f: FundingSnapshot): string {
  const budget = f.global_budget_usd_cents;
  const remaining = f.remaining_usd_cents;

  // State -> color + fill fraction + sub-line.
  let color = COLORS.gray;
  let frac = 0;
  let headline: string;
  let sub: string;

  if (!f.funded || budget === null || remaining === null) {
    color = COLORS.gray;
    frac = 0;
    headline = 'Not yet funded';
    sub = 'Sponsor to start funding the agents';
  } else if (f.paused || remaining <= 0) {
    color = COLORS.red;
    frac = 0;
    headline = 'Funding needed — agents paused';
    sub = `${usd(0)} left of ${usd(budget)} sponsored`;
  } else {
    frac = Math.max(0.02, Math.min(1, remaining / budget));
    color = frac > 0.25 ? COLORS.green : COLORS.amber;
    const days = f.runway_days === null ? null : Math.max(0, Math.round(f.runway_days));
    const runway = days === null ? 'runway: steady' : `~${days} day${days === 1 ? '' : 's'} of runway`;
    const burn = f.burn_per_day_usd_cents > 0 ? ` · ${usd(f.burn_per_day_usd_cents)}/day burn` : '';
    headline = `${usd(remaining)} left of ${usd(budget)}`;
    sub = `${runway}${burn}`;
  }

  const padX = 16;
  const barY = 60;
  const barW = W - padX * 2;
  const fillW = Math.round(barW * frac);
  const dotColor = color;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Funding: ${escapeXml(headline)}">
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="11" fill="${COLORS.bg}" stroke="${COLORS.border}"/>
  <circle cx="${padX + 5}" cy="24" r="5" fill="${dotColor}"/>
  <text x="${padX + 18}" y="28" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif" font-size="14" font-weight="700" fill="${COLORS.text}">${escapeXml(headline)}</text>
  <text x="${W - padX}" y="28" text-anchor="end" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif" font-size="11" font-weight="600" fill="${COLORS.muted}">⛽ funding</text>
  <rect x="${padX}" y="${barY}" width="${barW}" height="12" rx="6" fill="${COLORS.track}"/>
  ${fillW > 0 ? `<rect x="${padX}" y="${barY}" width="${fillW}" height="12" rx="6" fill="${color}"/>` : ''}
  <text x="${padX}" y="${barY + 28}" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="11" fill="${COLORS.muted}">${escapeXml(sub)}</text>
</svg>`;
}
