import { describe, expect, test } from 'bun:test';
import { estimateRunway } from '../src/burn-estimate.js';

describe('bayesian runway estimate', () => {
  test('with no data the prior dominates and it is not confident', () => {
    const e = estimateRunway(20000, []);
    expect(e.burn_per_day_usd_cents).toBe(50); // prior mean $0.50/day
    expect(e.confident).toBe(false);
    expect(e.runway_days).toBe(400); // 20000 / 50
  });

  test('one or two days is still not confident', () => {
    expect(estimateRunway(20000, [50]).confident).toBe(false);
    expect(estimateRunway(20000, [50, 50]).confident).toBe(false);
  });

  test('several steady days yield a confident estimate near the empirical rate', () => {
    const e = estimateRunway(20000, [50, 50, 50, 50, 50]);
    expect(e.burn_per_day_usd_cents).toBe(50);
    expect(e.confident).toBe(true);
    expect(e.runway_days).toBe(400);
    // conservative (lower) bound uses the higher burn, so it's a shorter runway than the median
    expect(e.runway_lo_days as number).toBeLessThan(400);
    expect(e.runway_hi_days as number).toBeGreaterThan(400);
  });

  test('idle days pull the rate down (counted as $0)', () => {
    const e = estimateRunway(20000, [120, 0, 0, 0, 0]);
    expect(e.burn_per_day_usd_cents).toBeLessThan(60); // not the 120 of the one busy day
    expect(e.burn_per_day_usd_cents).toBeGreaterThan(15);
  });

  test('high day-to-day variance widens the band and withholds confidence', () => {
    const e = estimateRunway(20000, [0, 0, 500, 0, 0]); // very bursty
    expect(e.confident).toBe(false);
  });

  test('an unfunded account has no runway', () => {
    const e = estimateRunway(0, [50, 50, 50]);
    expect(e.runway_days).toBe(null);
  });

  test('more steady days tighten the credible interval', () => {
    const few = estimateRunway(20000, [50, 50, 50]);
    const many = estimateRunway(20000, Array(14).fill(50));
    const widthFew = (few.burn_hi_usd_cents - few.burn_lo_usd_cents);
    const widthMany = (many.burn_hi_usd_cents - many.burn_lo_usd_cents);
    expect(widthMany).toBeLessThan(widthFew);
  });
});
