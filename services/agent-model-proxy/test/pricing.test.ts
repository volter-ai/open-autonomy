import { describe, expect, test } from 'bun:test';
import { actualCents, settleCents, openrouterReservePrice, type ModelPrice } from '../src/pricing.js';

// Regression for the billing over-count: settlement must keep sub-cent precision, NOT floor every request
// to a whole cent. A deepseek-v4-flash request really costs a fraction of a cent; agents fire thousands of
// requests, so a 1¢-per-request floor inflated the proxy's accounting ~3× over real spend — draining account
// balances and tripping the global daily cap at a third of true spend (which took the whole fleet down).
describe('settlement keeps sub-cent precision (no 1¢-per-request floor)', () => {
  const RESERVE = openrouterReservePrice(30);

  test('a sub-cent provider cost settles to sub-cent, not 1¢', () => {
    // Measured live: a tiny deepseek request reported cost $0.0000119 → 0.00119¢, must not become 1¢.
    const c = settleCents(RESERVE, { cost_usd: 0.0000119 }, 5);
    expect(c).toBeGreaterThan(0.001);
    expect(c).toBeLessThan(0.002);
  });

  test('5,000 sub-cent requests read ~real spend, not ~50× inflated', () => {
    const perReq = 0.0000119; // USD
    let total = 0;
    for (let i = 0; i < 5000; i++) total += settleCents(RESERVE, { cost_usd: perReq }, 5);
    // True spend ≈ 5000 × $0.0000119 = $0.0595 → ~5.95¢. The old floor gave 5000¢ = $50.
    expect(total).toBeLessThan(10); // cents
    expect(total).toBeGreaterThan(5);
  });

  test('whole-cent provider costs are still exact', () => {
    expect(settleCents(RESERVE, { cost_usd: 0.07 }, 5)).toBe(7);
    expect(settleCents(RESERVE, { cost_usd: 0.09 }, 5)).toBe(9);
  });

  test('token-metered fallback (no reported cost) is also sub-cent, not floored to 1¢', () => {
    const price: ModelPrice = { provider: 'openrouter', input_usd_per_mtok: 0.27, output_usd_per_mtok: 1.1 };
    const c = actualCents(price, { input_tokens: 7, output_tokens: 39 }, 5);
    expect(c).toBeGreaterThan(0);
    expect(c).toBeLessThan(1); // sub-cent; the old code floored this to 1
  });

  test('missing usage still falls back to the conservative reserve', () => {
    const price: ModelPrice = { provider: 'openrouter', input_usd_per_mtok: 0.27, output_usd_per_mtok: 1.1 };
    expect(actualCents(price, {}, 42)).toBe(42);
  });
});
