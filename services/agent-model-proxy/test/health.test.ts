import { describe, expect, test } from 'bun:test';
import { evaluateHealth, type HealthAlert, type HealthOpts } from '../src/health.js';

const MIN = 60_000;
const opts = (nowMs: number): HealthOpts => ({ silenceMs: 180 * MIN, deadMs: 7 * 24 * 60 * MIN, renotifyMs: 720 * MIN, nowMs });
const at = (minutesAgo: number, now: number) => now - minutesAgo * MIN;

describe('evaluateHealth — silence detection + bands', () => {
  const now = 1_000_000_000_000;
  test('recently-active org is healthy, emits nothing', () => {
    const r = evaluateHealth([{ account: 'a', last_activity_ms: at(10, now) }], {}, opts(now), true);
    expect(r.verdicts[0].band).toBe('healthy');
    expect(r.notices).toEqual([]);
    expect(r.down).toBe(0);
    expect(r.monitored).toBe(1);
  });

  test('silent past SILENCE is down; long-silent past DEAD is dormant (not an outage)', () => {
    const r = evaluateHealth(
      [
        { account: 'down', last_activity_ms: at(200, now) }, // > 180m
        { account: 'dormant', last_activity_ms: at(8 * 24 * 60, now) }, // > 7d
      ],
      {},
      opts(now),
      false,
    );
    const byAcct = Object.fromEntries(r.verdicts.map((v) => [v.account, v.band]));
    expect(byAcct.down).toBe('down');
    expect(byAcct.dormant).toBe('dormant');
    expect(r.monitored).toBe(1); // dormant excluded
  });
});

describe('evaluateHealth — dedup + transitions (mark=true)', () => {
  const now = 1_000_000_000_000;

  test('healthy→down emits one down notice and records alert state', () => {
    const r = evaluateHealth([{ account: 'a', last_activity_ms: at(200, now) }], {}, opts(now), true);
    expect(r.notices).toEqual([{ account: 'a', kind: 'down', age_minutes: 200 }]);
    expect(r.nextAlerts.a.down).toBe(true);
    expect(r.nextAlerts.a.last_notified_ms).toBe(now);
  });

  test('still down within the renotify window emits nothing (no spam)', () => {
    const prev: Record<string, HealthAlert> = { a: { down: true, since_ms: now - 60 * MIN, last_notified_ms: now - 60 * MIN } };
    const r = evaluateHealth([{ account: 'a', last_activity_ms: at(240, now) }], prev, opts(now), true);
    expect(r.notices).toEqual([]);
    expect(r.nextAlerts.a.down).toBe(true);
  });

  test('still down past the renotify window re-alerts', () => {
    const prev: Record<string, HealthAlert> = { a: { down: true, since_ms: now - 800 * MIN, last_notified_ms: now - 800 * MIN } };
    const r = evaluateHealth([{ account: 'a', last_activity_ms: at(800, now) }], prev, opts(now), true);
    expect(r.notices[0].account).toBe('a');
    expect(r.notices[0].kind).toBe('down');
    expect(r.nextAlerts.a.last_notified_ms).toBe(now);
  });

  test('down→healthy emits a recovery notice and clears alert state', () => {
    const prev: Record<string, HealthAlert> = { a: { down: true, since_ms: now - 300 * MIN, last_notified_ms: now - 300 * MIN } };
    const r = evaluateHealth([{ account: 'a', last_activity_ms: at(5, now) }], prev, opts(now), true);
    expect(r.notices).toEqual([{ account: 'a', kind: 'recovered', age_minutes: 5 }]);
    expect(r.nextAlerts.a).toBe(undefined);
  });

  test('mark=false never mutates state or emits notices (the GET /health read path)', () => {
    const prev: Record<string, HealthAlert> = { a: { down: true, since_ms: now, last_notified_ms: now } };
    const r = evaluateHealth([{ account: 'a', last_activity_ms: at(200, now) }], prev, opts(now), false);
    expect(r.notices).toEqual([]);
    expect(r.nextAlerts).toEqual(prev);
  });
});
