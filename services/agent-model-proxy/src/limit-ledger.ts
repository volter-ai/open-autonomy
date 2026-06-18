import { json } from './errors.js';
import type { RunClaims } from './types.js';

interface LedgerState {
  day_key: string;
  active_global: number;
  active_by_repo: Record<string, number>;
  active_by_actor: Record<string, number>;
  runs_by_repo_day: Record<string, number>;
  runs_by_actor_day: Record<string, number>;
  runs_by_issue_day: Record<string, number>;
  consumed_usd_cents: number;
  reserved_usd_cents: number;
  // Cumulative spend per repo. Unlike the daily counters, this is NEVER reset by rollover — it is
  // the lifetime total a repo has spent, enforced against its lifetime budget so a repo stops for
  // good when its allotment is gone (rather than spending the daily cap forever).
  lifetime_usd_by_repo: Record<string, number>;
  // Per-repo lifetime budget override. Absent => the config default applies. Sponsorship funding
  // raises a repo's allotment by setting this higher (which also lets a paused repo resume).
  budget_by_repo: Record<string, number>;
  reservations: Record<string, { amount: number; expires_at_ms: number; repo?: string }>;
  runs: Record<string, { repo: string; issue: number; actor: string; active: boolean }>;
  // Org-wide sponsorship pool. global_budget_usd_cents is the cumulative amount funded by
  // sponsorships; null => the pool gate is disabled (unfunded but open, preserving prior behavior)
  // and is only enabled once a sponsorship credit lands. lifetime_consumed_usd_cents is cumulative
  // spend across ALL repos and never resets, so the fleet hard-stops once the pool is exhausted.
  global_budget_usd_cents: number | null;
  lifetime_consumed_usd_cents: number;
  // Idempotency keys already applied via credit (e.g. "2026-06"), so a re-run of the monthly
  // sponsors sync does not double-credit. Capped to the most recent entries.
  applied_credit_keys: string[];
  // Cumulative spend per UTC day, capped to a short trailing window, used to derive a burn rate
  // (and from it the funding runway) for display.
  daily_spend_history: Record<string, number>;
  // Snapshot of active sponsors for the funding display (legacy/manual; set via credit).
  sponsors: Sponsor[];
  // Active recurring sponsors keyed by login, maintained incrementally by the GitHub Sponsors
  // webhook (created/tier_changed/edited upsert; cancelled removes). The monthly accrue() sums these.
  sponsors_active: Record<string, Sponsor>;
  // Issued sponsorship coupons keyed by code, and the sponsors attributed via redeemed coupons.
  coupons: Record<string, Coupon>;
  sponsors_coupon: Sponsor[];
}

export interface Sponsor {
  login: string;
  name?: string;
  tagline?: string;
  url?: string;
  avatar_url?: string;
  monthly_usd_cents?: number;
}

// A sponsorship coupon: a code worth a fixed amount that, when redeemed, credits the pool and
// attributes the sponsor — decoupling "granting funding" from how/whether money was actually paid.
export interface Coupon {
  code: string;
  amount_usd_cents: number;
  sponsor?: Sponsor;
  expires_at?: string;
  redeemed_at?: string | null;
  created_at: string;
}

export interface LimitConfig {
  max_active_runs_global: number;
  max_active_runs_per_repo: number;
  max_active_runs_per_actor: number;
  max_runs_per_repo_per_day: number;
  max_runs_per_actor_per_day: number;
  max_runs_per_issue_per_day: number;
  max_global_daily_usd_cents: number;
  // Default lifetime (cumulative) budget per repo. A future per-repo override (e.g. funded by
  // sponsorships) can raise an individual repo's allotment above this default.
  max_repo_lifetime_usd_cents: number;
}

export class LimitLedger implements DurableObject {
  private loaded = false;
  private state: LedgerState = emptyState();

  constructor(private readonly ctx: DurableObjectState) {}

  async fetch(req: Request): Promise<Response> {
    await this.load();
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const op = body.op;

    if (op === 'register') return json(await this.register(body.claims as RunClaims, body.config as LimitConfig));
    if (op === 'complete') return json(await this.complete(String(body.run_id)));
    if (op === 'reserve') return json(await this.reserve(String(body.request_id), Number(body.amount_usd_cents), body.config as LimitConfig, body.run_id ? String(body.run_id) : undefined));
    if (op === 'consume') {
      await this.consume(String(body.request_id), Number(body.actual_usd_cents));
      return json({ ok: true });
    }
    if (op === 'release') {
      await this.release(String(body.request_id));
      return json({ ok: true });
    }
    if (op === 'set_budget') return json(await this.setBudget(String(body.repo), Number(body.budget_usd_cents)));
    if (op === 'credit') return json(await this.credit(Number(body.amount_usd_cents), body.key ? String(body.key) : undefined, body.sponsors as Sponsor[] | undefined));
    if (op === 'set_global_budget') return json(await this.setGlobalBudget(Number(body.budget_usd_cents)));
    if (op === 'sponsor_upsert') return json(await this.sponsorUpsert(body.sponsor as Sponsor));
    if (op === 'sponsor_remove') return json(await this.sponsorRemove(String(body.login)));
    if (op === 'accrue') return json(await this.accrue(String(body.key)));
    if (op === 'coupon_create') return json(await this.couponCreate(body as Partial<Coupon>));
    if (op === 'coupon_list') return json({ ok: true, coupons: Object.values(this.state.coupons) });
    if (op === 'coupon_redeem') return json(await this.couponRedeem(String(body.code)));
    if (op === 'funding') return json(this.fundingSnapshot());
    if (op === 'status') return json(this.snapshot());
    return json({ ok: false, error: 'unknown_op' }, { status: 400 });
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    const stored = await this.ctx.storage.get<LedgerState>('state');
    if (stored) this.state = stored;
    this.normalizeState();
    this.rolloverIfNeeded();
    this.gcReservations();
    this.loaded = true;
  }

  private async save(): Promise<void> {
    await this.ctx.storage.put('state', this.state);
  }

  private async register(claims: RunClaims, config: LimitConfig): Promise<Record<string, unknown>> {
    this.rolloverIfNeeded();
    if (this.state.runs[claims.run_id]) return { ok: false, error: 'run_already_registered' };

    const issueKey = issueKeyFor(claims);
    const repoRuns = this.state.runs_by_repo_day[claims.repo] ?? 0;
    const actorRuns = this.state.runs_by_actor_day[claims.actor] ?? 0;
    const issueRuns = this.state.runs_by_issue_day[issueKey] ?? 0;
    const repoActive = this.state.active_by_repo[claims.repo] ?? 0;
    const actorActive = this.state.active_by_actor[claims.actor] ?? 0;

    if (this.state.active_global >= config.max_active_runs_global) return { ok: false, error: 'global_active_run_limit_reached' };
    if (repoActive >= config.max_active_runs_per_repo) return { ok: false, error: 'repo_active_run_limit_reached' };
    if (actorActive >= config.max_active_runs_per_actor) return { ok: false, error: 'actor_active_run_limit_reached' };
    if (repoRuns >= config.max_runs_per_repo_per_day) return { ok: false, error: 'repo_daily_run_limit_reached' };
    if (actorRuns >= config.max_runs_per_actor_per_day) return { ok: false, error: 'actor_daily_run_limit_reached' };
    if (issueRuns >= config.max_runs_per_issue_per_day) return { ok: false, error: 'issue_daily_run_limit_reached' };
    if ((this.state.lifetime_usd_by_repo[claims.repo] ?? 0) >= this.repoBudget(claims.repo, config)) {
      return { ok: false, error: 'repo_lifetime_budget_exhausted' };
    }
    if (this.poolExhausted()) {
      return { ok: false, error: 'sponsorship_pool_exhausted' };
    }

    this.state.active_global += 1;
    this.state.active_by_repo[claims.repo] = repoActive + 1;
    this.state.active_by_actor[claims.actor] = actorActive + 1;
    this.state.runs_by_repo_day[claims.repo] = repoRuns + 1;
    this.state.runs_by_actor_day[claims.actor] = actorRuns + 1;
    this.state.runs_by_issue_day[issueKey] = issueRuns + 1;
    this.state.runs[claims.run_id] = { repo: claims.repo, issue: claims.issue, actor: claims.actor, active: true };
    await this.save();
    return { ok: true };
  }

  private repoBudget(repo: string, config: LimitConfig): number {
    return this.state.budget_by_repo[repo] ?? config.max_repo_lifetime_usd_cents;
  }

  // Set a repo's lifetime budget (sponsorship funding). Raising it above current spend lets a
  // repo that auto-paused on exhaustion resume.
  private async setBudget(repo: string, budgetUsdCents: number): Promise<Record<string, unknown>> {
    if (!repo || !Number.isFinite(budgetUsdCents) || budgetUsdCents < 0) return { ok: false, error: 'invalid_budget' };
    this.state.budget_by_repo[repo] = Math.floor(budgetUsdCents);
    await this.save();
    return {
      ok: true,
      repo,
      budget_usd_cents: this.state.budget_by_repo[repo],
      lifetime_usd_cents: this.state.lifetime_usd_by_repo[repo] ?? 0,
    };
  }

  // Add sponsorship funding to the org-wide pool. Idempotent on `key` (e.g. the billing month) so a
  // re-run of the monthly sync does not double-credit. The first credit enables the pool gate.
  private async credit(amountUsdCents: number, key?: string, sponsors?: Sponsor[]): Promise<Record<string, unknown>> {
    if (!Number.isFinite(amountUsdCents) || amountUsdCents <= 0) return { ok: false, error: 'invalid_amount' };
    if (key && this.state.applied_credit_keys.includes(key)) {
      if (sponsors) { this.state.sponsors = sponsors; await this.save(); }
      return { ok: true, idempotent: true, global_budget_usd_cents: this.state.global_budget_usd_cents ?? 0 };
    }
    this.state.global_budget_usd_cents = (this.state.global_budget_usd_cents ?? 0) + Math.floor(amountUsdCents);
    if (key) {
      this.state.applied_credit_keys.push(key);
      this.state.applied_credit_keys = this.state.applied_credit_keys.slice(-100);
    }
    if (sponsors) this.state.sponsors = sponsors;
    await this.save();
    return { ok: true, global_budget_usd_cents: this.state.global_budget_usd_cents };
  }

  // Set the pool to an absolute amount (admin override / correction). null clears the gate.
  private async setGlobalBudget(budgetUsdCents: number): Promise<Record<string, unknown>> {
    if (!Number.isFinite(budgetUsdCents) || budgetUsdCents < 0) return { ok: false, error: 'invalid_amount' };
    this.state.global_budget_usd_cents = Math.floor(budgetUsdCents);
    await this.save();
    return { ok: true, global_budget_usd_cents: this.state.global_budget_usd_cents };
  }

  // Upsert/remove an active recurring sponsor (driven by the GitHub Sponsors webhook). The funding
  // display reflects this list immediately; the monthly accrue() turns it into pool funding.
  private async sponsorUpsert(sponsor: Sponsor): Promise<Record<string, unknown>> {
    if (!sponsor?.login || !Number.isFinite(sponsor.monthly_usd_cents)) return { ok: false, error: 'invalid_sponsor' };
    this.state.sponsors_active[sponsor.login] = {
      login: sponsor.login,
      avatar_url: sponsor.avatar_url,
      monthly_usd_cents: Math.max(0, Math.floor(sponsor.monthly_usd_cents ?? 0)),
    };
    await this.save();
    return { ok: true, active_sponsors: Object.keys(this.state.sponsors_active).length };
  }

  private async sponsorRemove(login: string): Promise<Record<string, unknown>> {
    delete this.state.sponsors_active[login];
    await this.save();
    return { ok: true, active_sponsors: Object.keys(this.state.sponsors_active).length };
  }

  // Credit the pool with the combined monthly amount of the active recurring sponsors. Idempotent on
  // `key` (the billing month), so the monthly cron is safe to fire more than once.
  private async accrue(key: string): Promise<Record<string, unknown>> {
    const monthlyTotal = Object.values(this.state.sponsors_active).reduce((sum, s) => sum + (s.monthly_usd_cents ?? 0), 0);
    if (monthlyTotal <= 0) return { ok: true, credited: false, monthly_total_usd_cents: 0 };
    const result = await this.credit(monthlyTotal, key, Object.values(this.state.sponsors_active));
    return { ...result, monthly_total_usd_cents: monthlyTotal };
  }

  // Issue a sponsorship coupon. Generates a code if none is supplied.
  private async couponCreate(input: Partial<Coupon>): Promise<Record<string, unknown>> {
    if (!Number.isFinite(input.amount_usd_cents) || (input.amount_usd_cents as number) <= 0) return { ok: false, error: 'invalid_amount' };
    const code = (input.code && String(input.code).trim()) || generateCouponCode();
    if (this.state.coupons[code]) return { ok: false, error: 'coupon_exists' };
    const coupon: Coupon = {
      code,
      amount_usd_cents: Math.floor(input.amount_usd_cents as number),
      sponsor: input.sponsor,
      expires_at: input.expires_at,
      redeemed_at: null,
      created_at: new Date().toISOString(),
    };
    this.state.coupons[code] = coupon;
    await this.save();
    return { ok: true, coupon };
  }

  // Redeem a coupon: credit the pool by its amount (idempotent on the coupon code) and attribute the
  // sponsor for display. One-time — a redeemed or expired coupon is refused.
  private async couponRedeem(code: string): Promise<Record<string, unknown>> {
    const coupon = this.state.coupons[code];
    if (!coupon) return { ok: false, error: 'coupon_not_found' };
    if (coupon.redeemed_at) return { ok: false, error: 'coupon_already_redeemed' };
    if (coupon.expires_at && Date.parse(coupon.expires_at) <= Date.now()) return { ok: false, error: 'coupon_expired' };

    await this.credit(coupon.amount_usd_cents, `coupon:${code}`, undefined);
    coupon.redeemed_at = new Date().toISOString();
    if (coupon.sponsor?.login) {
      this.state.sponsors_coupon = this.state.sponsors_coupon.filter((s) => s.login !== coupon.sponsor!.login);
      this.state.sponsors_coupon.push(coupon.sponsor);
    }
    await this.save();
    return { ok: true, amount_usd_cents: coupon.amount_usd_cents, sponsor: coupon.sponsor ?? null };
  }

  private poolExhausted(): boolean {
    return this.state.global_budget_usd_cents !== null
      && this.state.lifetime_consumed_usd_cents >= this.state.global_budget_usd_cents;
  }

  private recordDailySpend(amount: number): void {
    const today = dayKey();
    this.state.daily_spend_history[today] = (this.state.daily_spend_history[today] ?? 0) + amount;
    const days = Object.keys(this.state.daily_spend_history).sort();
    while (days.length > 14) delete this.state.daily_spend_history[days.shift() as string];
  }

  // Average daily spend over the trailing recorded window (most recent 7 days with activity).
  private burnPerDay(): number {
    const amounts = Object.entries(this.state.daily_spend_history)
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .slice(0, 7)
      .map(([, v]) => v);
    if (!amounts.length) return 0;
    return amounts.reduce((sum, v) => sum + v, 0) / amounts.length;
  }

  fundingSnapshot() {
    const budget = this.state.global_budget_usd_cents;
    const consumed = this.state.lifetime_consumed_usd_cents;
    const remaining = budget === null ? null : Math.max(0, budget - consumed);
    const burn = this.burnPerDay();
    const runwayDays = remaining === null || burn <= 0 ? null : remaining / burn;
    return {
      funded: budget !== null,
      paused: this.poolExhausted(),
      global_budget_usd_cents: budget,
      lifetime_consumed_usd_cents: consumed,
      remaining_usd_cents: remaining,
      burn_per_day_usd_cents: Math.round(burn),
      runway_days: runwayDays,
      sponsors: this.activeSponsors(),
    };
  }

  private activeSponsors(): Sponsor[] {
    const merged = [...Object.values(this.state.sponsors_active), ...this.state.sponsors_coupon];
    return merged.length ? merged : this.state.sponsors;
  }

  private async complete(runId: string): Promise<{ ok: true }> {
    const run = this.state.runs[runId];
    if (!run || !run.active) return { ok: true };
    run.active = false;
    this.state.active_global = Math.max(0, this.state.active_global - 1);
    this.state.active_by_repo[run.repo] = Math.max(0, (this.state.active_by_repo[run.repo] ?? 0) - 1);
    this.state.active_by_actor[run.actor] = Math.max(0, (this.state.active_by_actor[run.actor] ?? 0) - 1);
    await this.save();
    return { ok: true };
  }

  private async reserve(requestId: string, amount: number, config: LimitConfig, runId?: string): Promise<Record<string, unknown>> {
    this.rolloverIfNeeded();
    this.gcReservations();

    // Lifetime (cumulative) per-repo budget — never resets, so a repo stops permanently once spent.
    const repo = runId ? this.state.runs[runId]?.repo : undefined;
    if (repo) {
      const repoLifetime = this.state.lifetime_usd_by_repo[repo] ?? 0;
      const budget = this.repoBudget(repo, config);
      if (repoLifetime + amount > budget) {
        return {
          ok: false,
          error: 'repo_lifetime_budget_exhausted',
          lifetime_usd_cents: repoLifetime,
          max_repo_lifetime_usd_cents: budget,
        };
      }
    }

    // Org-wide sponsorship pool: cumulative spend (+ in-flight reservations) may not exceed the
    // funded budget. Once enabled (non-null), this hard-stops the whole fleet when the pool is dry.
    if (this.state.global_budget_usd_cents !== null) {
      const poolAvailable = this.state.global_budget_usd_cents - this.state.lifetime_consumed_usd_cents - this.state.reserved_usd_cents;
      if (amount > poolAvailable) {
        return {
          ok: false,
          error: 'sponsorship_pool_exhausted',
          lifetime_consumed_usd_cents: this.state.lifetime_consumed_usd_cents,
          global_budget_usd_cents: this.state.global_budget_usd_cents,
        };
      }
    }

    const available = config.max_global_daily_usd_cents - this.state.consumed_usd_cents - this.state.reserved_usd_cents;
    if (amount > available) {
      return {
        ok: false,
        error: 'global_daily_spend_limit_reached',
        consumed_usd_cents: this.state.consumed_usd_cents,
        reserved_usd_cents: this.state.reserved_usd_cents,
        max_global_daily_usd_cents: config.max_global_daily_usd_cents,
      };
    }

    this.state.reserved_usd_cents += amount;
    this.state.reservations[requestId] = { amount, expires_at_ms: Date.now() + 10 * 60_000, repo };
    await this.save();
    return { ok: true, remaining_global_usd_cents: available - amount };
  }

  private async consume(requestId: string, actual: number): Promise<void> {
    const reservation = this.state.reservations[requestId];
    if (reservation) {
      this.state.reserved_usd_cents = Math.max(0, this.state.reserved_usd_cents - reservation.amount);
      if (reservation.repo) {
        this.state.lifetime_usd_by_repo[reservation.repo] = (this.state.lifetime_usd_by_repo[reservation.repo] ?? 0) + Math.max(0, actual);
      }
      delete this.state.reservations[requestId];
    }
    this.state.consumed_usd_cents += Math.max(0, actual);
    this.state.lifetime_consumed_usd_cents += Math.max(0, actual);
    this.recordDailySpend(Math.max(0, actual));
    await this.save();
  }

  private async release(requestId: string): Promise<void> {
    const reservation = this.state.reservations[requestId];
    if (!reservation) return;
    this.state.reserved_usd_cents = Math.max(0, this.state.reserved_usd_cents - reservation.amount);
    delete this.state.reservations[requestId];
    await this.save();
  }

  private snapshot() {
    return {
      day_key: this.state.day_key,
      active_global: this.state.active_global,
      active_by_repo: this.state.active_by_repo,
      active_by_actor: this.state.active_by_actor,
      runs_by_repo_day: this.state.runs_by_repo_day,
      runs_by_actor_day: this.state.runs_by_actor_day,
      runs_by_issue_day: this.state.runs_by_issue_day,
      consumed_usd_cents: this.state.consumed_usd_cents,
      reserved_usd_cents: this.state.reserved_usd_cents,
      lifetime_usd_by_repo: this.state.lifetime_usd_by_repo,
      budget_by_repo: this.state.budget_by_repo,
      runs: this.state.runs,
      global_budget_usd_cents: this.state.global_budget_usd_cents,
      lifetime_consumed_usd_cents: this.state.lifetime_consumed_usd_cents,
    };
  }

  private rolloverIfNeeded(): void {
    const today = dayKey();
    if (this.state.day_key === today) return;
    this.state.day_key = today;
    this.state.runs_by_repo_day = {};
    this.state.runs_by_actor_day = {};
    this.state.runs_by_issue_day = {};
    this.state.consumed_usd_cents = 0;
    this.state.reserved_usd_cents = 0;
    this.state.reservations = {};
  }

  private normalizeState(): void {
    this.state.runs_by_repo_day ??= {};
    this.state.runs_by_actor_day ??= {};
    this.state.runs_by_issue_day ??= {};
    this.state.lifetime_usd_by_repo ??= {};
    this.state.budget_by_repo ??= {};
    this.state.runs ??= {};
    this.state.global_budget_usd_cents ??= null;
    this.state.lifetime_consumed_usd_cents ??= 0;
    this.state.applied_credit_keys ??= [];
    this.state.daily_spend_history ??= {};
    this.state.sponsors ??= [];
    this.state.sponsors_active ??= {};
    this.state.coupons ??= {};
    this.state.sponsors_coupon ??= [];
  }

  private gcReservations(): void {
    const now = Date.now();
    for (const [id, reservation] of Object.entries(this.state.reservations)) {
      if (reservation.expires_at_ms < now) {
        this.state.reserved_usd_cents = Math.max(0, this.state.reserved_usd_cents - reservation.amount);
        delete this.state.reservations[id];
      }
    }
  }
}

function emptyState(): LedgerState {
  return {
    day_key: dayKey(),
    active_global: 0,
    active_by_repo: {},
    active_by_actor: {},
    runs_by_repo_day: {},
    runs_by_actor_day: {},
    runs_by_issue_day: {},
    consumed_usd_cents: 0,
    reserved_usd_cents: 0,
    lifetime_usd_by_repo: {},
    budget_by_repo: {},
    reservations: {},
    runs: {},
    global_budget_usd_cents: null,
    lifetime_consumed_usd_cents: 0,
    applied_credit_keys: [],
    daily_spend_history: {},
    sponsors: [],
    sponsors_active: {},
    coupons: {},
    sponsors_coupon: [],
  };
}

function generateCouponCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]);
  return `SPON-${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`;
}

function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function issueKeyFor(claims: Pick<RunClaims, 'repo' | 'issue'>): string {
  return `${claims.repo}#${claims.issue}`;
}

export class LimitLedgerClient {
  constructor(private readonly ns: DurableObjectNamespace) {}

  private stub() {
    return this.ns.get(this.ns.idFromName('global'));
  }

  private async rpc<T>(op: string, args: Record<string, unknown> = {}): Promise<T> {
    const res = await this.stub().fetch('https://limit-ledger.local/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op, ...args }),
    });
    return await res.json() as T;
  }

  register(claims: RunClaims, config: LimitConfig) {
    return this.rpc<{ ok: true } | { ok: false; error: string }>('register', { claims, config });
  }

  complete(runId: string) {
    return this.rpc<{ ok: true }>('complete', { run_id: runId });
  }

  reserve(requestId: string, amountUsdCents: number, config: LimitConfig, runId?: string) {
    return this.rpc<{ ok: true; remaining_global_usd_cents: number } | { ok: false; error: string }>(
      'reserve',
      { request_id: requestId, amount_usd_cents: amountUsdCents, config, run_id: runId },
    );
  }

  consume(requestId: string, actualUsdCents: number) {
    return this.rpc<{ ok: true }>('consume', { request_id: requestId, actual_usd_cents: actualUsdCents });
  }

  release(requestId: string) {
    return this.rpc<{ ok: true }>('release', { request_id: requestId });
  }

  setBudget(repo: string, budgetUsdCents: number) {
    return this.rpc<{ ok: boolean; repo?: string; budget_usd_cents?: number; lifetime_usd_cents?: number; error?: string }>(
      'set_budget',
      { repo, budget_usd_cents: budgetUsdCents },
    );
  }

  credit(amountUsdCents: number, key?: string, sponsors?: Sponsor[]) {
    return this.rpc<{ ok: boolean; idempotent?: boolean; global_budget_usd_cents?: number; error?: string }>(
      'credit',
      { amount_usd_cents: amountUsdCents, key, sponsors },
    );
  }

  setGlobalBudget(budgetUsdCents: number) {
    return this.rpc<{ ok: boolean; global_budget_usd_cents?: number; error?: string }>(
      'set_global_budget',
      { budget_usd_cents: budgetUsdCents },
    );
  }

  sponsorUpsert(sponsor: Sponsor) {
    return this.rpc<{ ok: boolean; active_sponsors?: number; error?: string }>('sponsor_upsert', { sponsor });
  }

  sponsorRemove(login: string) {
    return this.rpc<{ ok: boolean; active_sponsors?: number }>('sponsor_remove', { login });
  }

  accrue(key: string) {
    return this.rpc<{ ok: boolean; credited?: boolean; idempotent?: boolean; global_budget_usd_cents?: number; monthly_total_usd_cents?: number }>(
      'accrue',
      { key },
    );
  }

  couponCreate(input: { amount_usd_cents: number; sponsor?: Sponsor; code?: string; expires_at?: string }) {
    return this.rpc<{ ok: boolean; coupon?: Coupon; error?: string }>('coupon_create', input);
  }

  couponList() {
    return this.rpc<{ ok: boolean; coupons: Coupon[] }>('coupon_list');
  }

  couponRedeem(code: string) {
    return this.rpc<{ ok: boolean; amount_usd_cents?: number; sponsor?: Sponsor | null; error?: string }>('coupon_redeem', { code });
  }

  funding() {
    return this.rpc<FundingSnapshot>('funding');
  }

  status() {
    return this.rpc<unknown>('status');
  }
}

export interface FundingSnapshot {
  funded: boolean;
  paused: boolean;
  global_budget_usd_cents: number | null;
  lifetime_consumed_usd_cents: number;
  remaining_usd_cents: number | null;
  burn_per_day_usd_cents: number;
  runway_days: number | null;
  sponsors: Sponsor[];
}
