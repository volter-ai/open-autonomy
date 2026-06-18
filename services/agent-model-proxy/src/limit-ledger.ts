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
  // Daily global spend (resets at rollover) + outstanding reservations — a runaway safety rail that
  // is independent of, and complementary to, per-account balances.
  consumed_usd_cents: number;
  reserved_usd_cents: number;
  reservations: Record<string, { amount: number; expires_at_ms: number; account?: string }>;
  runs: Record<string, { repo: string; issue: number; actor: string; active: boolean }>;
  // The funding tree. Every project (repo slug) and named root (e.g. "volter") is an account.
  // balance = granted_in - granted_out - consumed. mint adds money at a node (the only way credits
  // enter the system); grant transfers between nodes (conserves total); spend consumes (leaves).
  accounts: Record<string, Account>;
  // Idempotency keys already applied by mint/grant/coupon, so retries don't double-apply.
  applied_keys: string[];
  // Issued coupons keyed by code (bearer/deferred grants).
  coupons: Record<string, Coupon>;
}

export interface Account {
  granted_in_usd_cents: number;
  granted_out_usd_cents: number;
  consumed_usd_cents: number;
  // Per-account daily spend (capped trailing window) used to derive a burn rate and runway.
  daily_spend: Record<string, number>;
  // Sponsors attributed to this account for display (set by mint/grant/coupon with a sponsor).
  sponsors: Sponsor[];
  // Active recurring sponsors keyed by login (GitHub Sponsors webhook); summed by accrue().
  sponsors_active: Record<string, Sponsor>;
}

export interface Sponsor {
  login: string;
  name?: string;
  tagline?: string;
  url?: string;
  avatar_url?: string;
  monthly_usd_cents?: number;
}

// A coupon is a bearer/deferred grant: a code worth a fixed amount that, when redeemed against an
// account, either transfers from an issuer account (`from` set) or mints (no `from`).
export interface Coupon {
  code: string;
  amount_usd_cents: number;
  from?: string;
  sponsor?: Sponsor;
  expires_at?: string;
  redeemed_at?: string | null;
  redeemed_to?: string | null;
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
  // When true, agent spend is hard-stopped on the spending account's balance. Default false so the
  // account model can be deployed and bootstrapped (mint root, grant to active repos) BEFORE the
  // gate turns on — otherwise every unfunded repo would stop the moment this ships.
  enforce_account_balance: boolean;
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
    if (op === 'mint') return json(await this.mint(String(body.account), Number(body.amount_usd_cents), body.key ? String(body.key) : undefined, body.sponsor as Sponsor | undefined));
    if (op === 'grant') return json(await this.grant(String(body.from), String(body.to), Number(body.amount_usd_cents), body.key ? String(body.key) : undefined));
    if (op === 'sponsor_upsert') return json(await this.sponsorUpsert(String(body.account), body.sponsor as Sponsor));
    if (op === 'sponsor_remove') return json(await this.sponsorRemove(String(body.account), String(body.login)));
    if (op === 'accrue') return json(await this.accrue(String(body.account), String(body.key)));
    if (op === 'coupon_create') return json(await this.couponCreate(body as Partial<Coupon>));
    if (op === 'coupon_list') return json({ ok: true, coupons: Object.values(this.state.coupons) });
    if (op === 'coupon_redeem') return json(await this.couponRedeem(String(body.code), String(body.account)));
    if (op === 'funding') return json(this.fundingSnapshot(String(body.account)));
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

  // ---- accounts -------------------------------------------------------------

  private acct(id: string): Account | undefined {
    return this.state.accounts[id];
  }

  private ensureAcct(id: string): Account {
    return (this.state.accounts[id] ??= emptyAccount());
  }

  private balanceOf(id: string): number {
    const a = this.acct(id);
    return a ? a.granted_in_usd_cents - a.granted_out_usd_cents - a.consumed_usd_cents : 0;
  }

  // In-flight reservations charged to an account (not yet consumed), so concurrent requests can't
  // over-reserve past the balance.
  private reservedFor(id: string): number {
    let total = 0;
    for (const r of Object.values(this.state.reservations)) if (r.account === id) total += r.amount;
    return total;
  }

  private applyKey(key?: string): boolean {
    if (!key) return false;
    if (this.state.applied_keys.includes(key)) return true;
    this.state.applied_keys.push(key);
    this.state.applied_keys = this.state.applied_keys.slice(-500);
    return false;
  }

  // Money enters the system: add credits to an account. The only operation that increases the total.
  private async mint(account: string, amount: number, key?: string, sponsor?: Sponsor): Promise<Record<string, unknown>> {
    if (!account || !Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'invalid_amount' };
    if (key && this.applyKey(key)) return { ok: true, idempotent: true, account, balance_usd_cents: this.balanceOf(account) };
    const a = this.ensureAcct(account);
    a.granted_in_usd_cents += Math.floor(amount);
    if (sponsor?.login) upsertSponsor(a.sponsors, sponsor);
    await this.save();
    return { ok: true, account, balance_usd_cents: this.balanceOf(account) };
  }

  // Credits move down the tree: transfer from one account to another. Conserves the total; refused
  // if the source lacks the balance.
  private async grant(from: string, to: string, amount: number, key?: string): Promise<Record<string, unknown>> {
    if (!from || !to || from === to || !Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'invalid_grant' };
    if (key && this.applyKey(key)) {
      return { ok: true, idempotent: true, from_balance_usd_cents: this.balanceOf(from), to_balance_usd_cents: this.balanceOf(to) };
    }
    if (this.balanceOf(from) < amount) {
      return { ok: false, error: 'insufficient_balance', from_balance_usd_cents: this.balanceOf(from) };
    }
    const af = this.ensureAcct(from);
    const at = this.ensureAcct(to);
    af.granted_out_usd_cents += Math.floor(amount);
    at.granted_in_usd_cents += Math.floor(amount);
    await this.save();
    return { ok: true, from, to, amount_usd_cents: Math.floor(amount), from_balance_usd_cents: this.balanceOf(from), to_balance_usd_cents: this.balanceOf(to) };
  }

  private async sponsorUpsert(account: string, sponsor: Sponsor): Promise<Record<string, unknown>> {
    if (!account || !sponsor?.login) return { ok: false, error: 'invalid_sponsor' };
    const a = this.ensureAcct(account);
    a.sponsors_active[sponsor.login] = {
      login: sponsor.login,
      name: sponsor.name,
      tagline: sponsor.tagline,
      url: sponsor.url,
      avatar_url: sponsor.avatar_url,
      monthly_usd_cents: Math.max(0, Math.floor(sponsor.monthly_usd_cents ?? 0)),
    };
    await this.save();
    return { ok: true, active_sponsors: Object.keys(a.sponsors_active).length };
  }

  private async sponsorRemove(account: string, login: string): Promise<Record<string, unknown>> {
    const a = this.acct(account);
    if (a) { delete a.sponsors_active[login]; await this.save(); }
    return { ok: true };
  }

  // Mint an account with its active recurring sponsors' combined monthly amount. Idempotent on `key`
  // (the billing month). This is the recurring path GitHub's webhook can't provide (no renewal event).
  private async accrue(account: string, key: string): Promise<Record<string, unknown>> {
    const a = this.acct(account);
    const total = a ? Object.values(a.sponsors_active).reduce((sum, s) => sum + (s.monthly_usd_cents ?? 0), 0) : 0;
    if (total <= 0) return { ok: true, credited: false, monthly_total_usd_cents: 0 };
    const sponsors = Object.values(a!.sponsors_active);
    const result = await this.mint(account, total, key);
    // Reflect the recurring sponsors in the display list too.
    if (!result.idempotent) for (const s of sponsors) upsertSponsor(this.ensureAcct(account).sponsors, s);
    await this.save();
    return { ...result, monthly_total_usd_cents: total };
  }

  // ---- coupons --------------------------------------------------------------

  private async couponCreate(input: Partial<Coupon>): Promise<Record<string, unknown>> {
    if (!Number.isFinite(input.amount_usd_cents) || (input.amount_usd_cents as number) <= 0) return { ok: false, error: 'invalid_amount' };
    const code = (input.code && String(input.code).trim()) || generateCouponCode();
    if (this.state.coupons[code]) return { ok: false, error: 'coupon_exists' };
    const coupon: Coupon = {
      code,
      amount_usd_cents: Math.floor(input.amount_usd_cents as number),
      from: input.from,
      sponsor: input.sponsor,
      expires_at: input.expires_at,
      redeemed_at: null,
      redeemed_to: null,
      created_at: new Date().toISOString(),
    };
    this.state.coupons[code] = coupon;
    await this.save();
    return { ok: true, coupon };
  }

  // Redeem a coupon into the recipient account. Issuer-backed coupons grant (transfer); otherwise
  // mint. One-time — a redeemed or expired coupon is refused.
  private async couponRedeem(code: string, to: string): Promise<Record<string, unknown>> {
    const coupon = this.state.coupons[code];
    if (!to) return { ok: false, error: 'redeem_account_required' };
    if (!coupon) return { ok: false, error: 'coupon_not_found' };
    if (coupon.redeemed_at) return { ok: false, error: 'coupon_already_redeemed' };
    if (coupon.expires_at && Date.parse(coupon.expires_at) <= Date.now()) return { ok: false, error: 'coupon_expired' };

    if (coupon.from) {
      const result = await this.grant(coupon.from, to, coupon.amount_usd_cents, `coupon:${code}`);
      if (!result.ok) return result; // e.g. issuer ran out of balance
    } else {
      await this.mint(to, coupon.amount_usd_cents, `coupon:${code}`, coupon.sponsor);
    }
    coupon.redeemed_at = new Date().toISOString();
    coupon.redeemed_to = to;
    if (coupon.sponsor?.login) upsertSponsor(this.ensureAcct(to).sponsors, coupon.sponsor);
    await this.save();
    return { ok: true, amount_usd_cents: coupon.amount_usd_cents, account: to, sponsor: coupon.sponsor ?? null };
  }

  // ---- runs / spend ---------------------------------------------------------

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
    // Funding gate: don't start a run for a project whose account is empty.
    if (config.enforce_account_balance && this.balanceOf(claims.repo) <= 0) {
      return { ok: false, error: 'account_unfunded', account: claims.repo, balance_usd_cents: this.balanceOf(claims.repo) };
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

    const account = runId ? this.state.runs[runId]?.repo : undefined;

    // Per-account balance gate (the funding hard-stop). Cumulative spend + in-flight reservations on
    // this account may not exceed its balance.
    if (config.enforce_account_balance && account) {
      const available = this.balanceOf(account) - this.reservedFor(account);
      if (amount > available) {
        return { ok: false, error: 'account_balance_exhausted', account, balance_usd_cents: this.balanceOf(account) };
      }
    }

    // Daily global cap — runaway safety, independent of funding.
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
    this.state.reservations[requestId] = { amount, expires_at_ms: Date.now() + 10 * 60_000, account };
    await this.save();
    return { ok: true, remaining_global_usd_cents: available - amount };
  }

  private async consume(requestId: string, actual: number): Promise<void> {
    const reservation = this.state.reservations[requestId];
    const spent = Math.max(0, actual);
    if (reservation) {
      this.state.reserved_usd_cents = Math.max(0, this.state.reserved_usd_cents - reservation.amount);
      if (reservation.account) {
        const a = this.ensureAcct(reservation.account);
        a.consumed_usd_cents += spent;
        recordDailySpend(a, spent);
      }
      delete this.state.reservations[requestId];
    }
    this.state.consumed_usd_cents += spent;
    await this.save();
  }

  private async release(requestId: string): Promise<void> {
    const reservation = this.state.reservations[requestId];
    if (!reservation) return;
    this.state.reserved_usd_cents = Math.max(0, this.state.reserved_usd_cents - reservation.amount);
    delete this.state.reservations[requestId];
    await this.save();
  }

  // ---- read models ----------------------------------------------------------

  fundingSnapshot(account: string): FundingSnapshot {
    const a = this.acct(account);
    const grantedIn = a?.granted_in_usd_cents ?? 0;
    const grantedOut = a?.granted_out_usd_cents ?? 0;
    const consumed = a?.consumed_usd_cents ?? 0;
    const balance = grantedIn - grantedOut - consumed;
    const burn = a ? burnPerDay(a) : 0;
    const funded = grantedIn > 0;
    const runwayDays = !funded || burn <= 0 ? null : balance / burn;
    return {
      account,
      funded,
      paused: funded && balance <= 0,
      balance_usd_cents: balance,
      granted_in_usd_cents: grantedIn,
      granted_out_usd_cents: grantedOut,
      consumed_usd_cents: consumed,
      burn_per_day_usd_cents: Math.round(burn),
      runway_days: runwayDays,
      sponsors: a ? activeSponsors(a) : [],
    };
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
      runs: this.state.runs,
      accounts: Object.fromEntries(
        Object.keys(this.state.accounts).map((id) => [id, { ...this.state.accounts[id], balance_usd_cents: this.balanceOf(id) }]),
      ),
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
    this.state.runs ??= {};
    this.state.accounts ??= {};
    this.state.applied_keys ??= [];
    this.state.coupons ??= {};
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

function emptyAccount(): Account {
  return { granted_in_usd_cents: 0, granted_out_usd_cents: 0, consumed_usd_cents: 0, daily_spend: {}, sponsors: [], sponsors_active: {} };
}

function upsertSponsor(list: Sponsor[], sponsor: Sponsor): void {
  const i = list.findIndex((s) => s.login === sponsor.login);
  if (i >= 0) list[i] = sponsor; else list.push(sponsor);
}

function recordDailySpend(a: Account, amount: number): void {
  const today = dayKey();
  a.daily_spend[today] = (a.daily_spend[today] ?? 0) + amount;
  const days = Object.keys(a.daily_spend).sort();
  while (days.length > 14) delete a.daily_spend[days.shift() as string];
}

function burnPerDay(a: Account): number {
  const amounts = Object.entries(a.daily_spend).sort(([x], [y]) => (x < y ? 1 : -1)).slice(0, 7).map(([, v]) => v);
  if (!amounts.length) return 0;
  return amounts.reduce((sum, v) => sum + v, 0) / amounts.length;
}

function activeSponsors(a: Account): Sponsor[] {
  const merged = [...Object.values(a.sponsors_active), ...a.sponsors.filter((s) => !a.sponsors_active[s.login])];
  return merged;
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
    reservations: {},
    runs: {},
    accounts: {},
    applied_keys: [],
    coupons: {},
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

  mint(account: string, amountUsdCents: number, key?: string, sponsor?: Sponsor) {
    return this.rpc<{ ok: boolean; idempotent?: boolean; account?: string; balance_usd_cents?: number; error?: string }>(
      'mint',
      { account, amount_usd_cents: amountUsdCents, key, sponsor },
    );
  }

  grant(from: string, to: string, amountUsdCents: number, key?: string) {
    return this.rpc<{ ok: boolean; idempotent?: boolean; from?: string; to?: string; amount_usd_cents?: number; from_balance_usd_cents?: number; to_balance_usd_cents?: number; error?: string }>(
      'grant',
      { from, to, amount_usd_cents: amountUsdCents, key },
    );
  }

  sponsorUpsert(account: string, sponsor: Sponsor) {
    return this.rpc<{ ok: boolean; active_sponsors?: number; error?: string }>('sponsor_upsert', { account, sponsor });
  }

  sponsorRemove(account: string, login: string) {
    return this.rpc<{ ok: boolean }>('sponsor_remove', { account, login });
  }

  accrue(account: string, key: string) {
    return this.rpc<{ ok: boolean; credited?: boolean; idempotent?: boolean; balance_usd_cents?: number; monthly_total_usd_cents?: number }>(
      'accrue',
      { account, key },
    );
  }

  couponCreate(input: { amount_usd_cents: number; from?: string; sponsor?: Sponsor; code?: string; expires_at?: string }) {
    return this.rpc<{ ok: boolean; coupon?: Coupon; error?: string }>('coupon_create', input);
  }

  couponList() {
    return this.rpc<{ ok: boolean; coupons: Coupon[] }>('coupon_list');
  }

  couponRedeem(code: string, account: string) {
    return this.rpc<{ ok: boolean; amount_usd_cents?: number; account?: string; sponsor?: Sponsor | null; error?: string }>('coupon_redeem', { code, account });
  }

  funding(account: string) {
    return this.rpc<FundingSnapshot>('funding', { account });
  }

  status() {
    return this.rpc<unknown>('status');
  }
}

export interface FundingSnapshot {
  account: string;
  funded: boolean;
  paused: boolean;
  balance_usd_cents: number;
  granted_in_usd_cents: number;
  granted_out_usd_cents: number;
  consumed_usd_cents: number;
  burn_per_day_usd_cents: number;
  runway_days: number | null;
  sponsors: Sponsor[];
}
