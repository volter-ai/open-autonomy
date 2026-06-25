// Org health monitor — detect when an autonomy loop has gone DARK and surface it out-of-band.
//
// The human seam (docs/SPEC.md#handoffs) reaches a maintainer when an agent hits its authority limit — but
// only while the fleet is RUNNING. If the loop itself stops (cron wedged, repo paused, proxy trust broken,
// every run failing), nothing escalates: the org goes dark silently. The proxy is the right watcher because
// it is external to the fleet (survives a GitHub/Actions outage) and already sees every run's activity.
//
// Signal: the proxy stamps each account's `last_activity_ms` when a run registers. Silence past a threshold =
// the loop is not sweeping. Three bands keep it from crying wolf:
//   healthy : age ≤ silence            — running normally
//   down    : silence < age ≤ dead     — was active, has now gone quiet → ALERT (push, out-of-band)
//   dormant : age > dead               — long idle / retired; not an outage, never alert
// Dedup: alert once on the healthy→down transition, then re-alert at most every `renotifyMs`; send one
// recovery notice on down→healthy. This is the pure decision core — the DO supplies state, the worker sends.

export interface OrgActivity {
  account: string;
  last_activity_ms: number;
}

// Per-account alert bookkeeping the DO persists across ticks (the dedup memory).
export interface HealthAlert {
  down: boolean; // currently in the alerting (down) band
  since_ms: number; // when the current band began
  last_notified_ms?: number; // when we last pushed an alert for this account
}

export interface HealthOpts {
  silenceMs: number; // quiet longer than this → down
  deadMs: number; // quiet longer than this → dormant (not an outage)
  renotifyMs: number; // while down, re-alert at most this often
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

export interface HealthNotice {
  account: string;
  kind: 'down' | 'recovered';
  age_minutes: number;
}

export interface HealthResult {
  verdicts: HealthVerdict[];
  nextAlerts: Record<string, HealthAlert>;
  notices: HealthNotice[];
  monitored: number; // accounts considered (healthy or down — excludes dormant)
  down: number; // currently in the down band
}

function band(ageMs: number, o: HealthOpts): HealthBand {
  if (ageMs <= o.silenceMs) return 'healthy';
  if (ageMs <= o.deadMs) return 'down';
  return 'dormant';
}

/**
 * Pure health evaluation. `mark` distinguishes the scheduled sweep (mark=true → updates dedup state and emits
 * notices to push) from a read-only query (mark=false → verdicts only, no state change, no notices).
 */
export function evaluateHealth(
  orgs: OrgActivity[],
  prevAlerts: Record<string, HealthAlert>,
  opts: HealthOpts,
  mark: boolean,
): HealthResult {
  const verdicts: HealthVerdict[] = [];
  const nextAlerts: Record<string, HealthAlert> = { ...prevAlerts };
  const notices: HealthNotice[] = [];
  let monitored = 0;
  let down = 0;

  for (const org of orgs) {
    const ageMs = Math.max(0, opts.nowMs - org.last_activity_ms);
    const b = band(ageMs, opts);
    const ageMinutes = Math.round(ageMs / 60_000);
    verdicts.push({ account: org.account, band: b, age_ms: ageMs, age_minutes: ageMinutes, last_activity_ms: org.last_activity_ms });
    if (b !== 'dormant') monitored++;
    if (b === 'down') down++;

    if (!mark) continue;

    const prev = prevAlerts[org.account];
    if (b === 'down') {
      const wasDown = prev?.down === true;
      const renotifyDue = wasDown && opts.nowMs - (prev?.last_notified_ms ?? 0) >= opts.renotifyMs;
      if (!wasDown || renotifyDue) {
        notices.push({ account: org.account, kind: 'down', age_minutes: ageMinutes });
        nextAlerts[org.account] = { down: true, since_ms: wasDown ? (prev?.since_ms ?? opts.nowMs) : opts.nowMs, last_notified_ms: opts.nowMs };
      } else {
        nextAlerts[org.account] = { down: true, since_ms: prev?.since_ms ?? opts.nowMs, last_notified_ms: prev?.last_notified_ms };
      }
    } else if (b === 'healthy') {
      if (prev?.down) notices.push({ account: org.account, kind: 'recovered', age_minutes: ageMinutes });
      delete nextAlerts[org.account]; // back to normal — forget the alert state
    } else {
      // dormant: not an outage. Drop any stale alert state so a retired org doesn't re-alert.
      delete nextAlerts[org.account];
    }
  }

  return { verdicts, nextAlerts, notices, monitored, down };
}
