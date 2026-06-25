// Org health monitor — DETECT and SURFACE when an autonomy loop has gone dark (#66).
//
// The proxy is the right watcher: it is external to the fleet (survives a GitHub/Actions outage) and already
// sees every run. It stamps each org's `last_activity_ms` on run register, so silence past a threshold means
// the loop isn't sweeping. Three bands keep it from crying wolf:
//   healthy : age ≤ silence
//   down    : silence < age ≤ dead   — was active, has now gone quiet
//   dormant : age > dead             — long idle / retired; not an outage
//
// This is purely the detect-and-surface signal (read by GET /health). It does NOT notify: reaching a human
// is the substrate runner's `engage` avenue (the HumanRunner realization — assign/@mention on github), an
// implementation detail of the runner, not of this watcher.

export interface OrgActivity {
  account: string;
  last_activity_ms: number;
}

export interface HealthOpts {
  silenceMs: number; // quiet longer than this → down
  deadMs: number; // quiet longer than this → dormant (not an outage)
  nowMs: number;
}

export type HealthBand = 'healthy' | 'down' | 'dormant';

export interface HealthVerdict {
  account: string;
  band: HealthBand;
  age_ms: number;
  age_minutes: number;
  last_activity_ms: number;
}

export interface HealthResult {
  verdicts: HealthVerdict[];
  monitored: number; // accounts considered (healthy or down — excludes dormant)
  down: number; // currently in the down band
}

function band(ageMs: number, o: HealthOpts): HealthBand {
  if (ageMs <= o.silenceMs) return 'healthy';
  if (ageMs <= o.deadMs) return 'down';
  return 'dormant';
}

/** Pure classifier: bucket each org by how long it's been silent. Read-only — no state, no side effects. */
export function classifyHealth(orgs: OrgActivity[], opts: HealthOpts): HealthResult {
  const verdicts: HealthVerdict[] = [];
  let monitored = 0;
  let down = 0;
  for (const org of orgs) {
    const ageMs = Math.max(0, opts.nowMs - org.last_activity_ms);
    const b = band(ageMs, opts);
    verdicts.push({ account: org.account, band: b, age_ms: ageMs, age_minutes: Math.round(ageMs / 60_000), last_activity_ms: org.last_activity_ms });
    if (b !== 'dormant') monitored++;
    if (b === 'down') down++;
  }
  return { verdicts, monitored, down };
}
