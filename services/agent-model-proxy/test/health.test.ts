import { describe, expect, test } from 'bun:test';
import { classifyHealth, type HealthOpts } from '../src/health.js';

const MIN = 60_000;
const opts = (nowMs: number): HealthOpts => ({ silenceMs: 180 * MIN, deadMs: 7 * 24 * 60 * MIN, nowMs });
const at = (minutesAgo: number, now: number) => now - minutesAgo * MIN;

describe('classifyHealth — detect + surface (silence bands)', () => {
  const now = 1_000_000_000_000;

  test('recently-active org is healthy', () => {
    const r = classifyHealth([{ account: 'a', last_activity_ms: at(10, now) }], opts(now));
    expect(r.verdicts[0].band).toBe('healthy');
    expect(r.down).toBe(0);
    expect(r.monitored).toBe(1);
  });

  test('silent past SILENCE is down; reports its age', () => {
    const r = classifyHealth([{ account: 'a', last_activity_ms: at(200, now) }], opts(now));
    expect(r.verdicts[0].band).toBe('down');
    expect(r.verdicts[0].age_minutes).toBe(200);
    expect(r.down).toBe(1);
    expect(r.monitored).toBe(1);
  });

  test('long-silent past DEAD is dormant (not an outage) and excluded from monitored', () => {
    const r = classifyHealth([{ account: 'a', last_activity_ms: at(8 * 24 * 60, now) }], opts(now));
    expect(r.verdicts[0].band).toBe('dormant');
    expect(r.down).toBe(0);
    expect(r.monitored).toBe(0);
  });

  test('mixed fleet: counts only the down band, excludes dormant', () => {
    const r = classifyHealth(
      [
        { account: 'ok', last_activity_ms: at(5, now) },
        { account: 'down', last_activity_ms: at(240, now) },
        { account: 'retired', last_activity_ms: at(30 * 24 * 60, now) },
      ],
      opts(now),
    );
    expect(r.monitored).toBe(2); // ok + down (retired is dormant)
    expect(r.down).toBe(1);
  });
});
