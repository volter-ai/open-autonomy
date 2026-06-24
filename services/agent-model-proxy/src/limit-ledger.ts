import { estimateRunway } from './burn-estimate.js';
import { json } from './errors.js';
import type { RunClaims } from './types.js';

// How many days of runway a project aims to keep funded (the goal bar) unless it overrides it.
const FLEET_GOAL_DAYS = 30;
// The shared membership ladder shown on every project unless an operator overrides it.
const FLEET_TIERS: Tier[] = [
  { usd_cents: 500, name: 'Supporter', perks: ['Your name in BACKERS.md'] },
  { usd_cents: 2500, name: 'Sponsor', perks: ['Logo + tagline on the README'] },
  { usd_cents: 10000, name: 'Backer', perks: ['Top-of-README placement', 'Sponsor wall'] },
];
const MAX_FLOWS = 200;
const FEED_LIMIT = 24;
const MAX_GRANTS_PER_FROM_PER_DAY = 50;

// User/event-triggered purposes — the externally-triggerable, abusable surface that the active-run
// and daily-count caps exist to throttle. Anything NOT in this set (e.g. `pm`, and future cron
// purposes like planner/strategist) is a trusted, self-scheduled SYSTEM agent that runs in a reserved
// lane instead (see register()). A run with no purpose defaults to `agent`, i.e. the strict user rail.
const USER_PURPOSES = new Set(['agent', 'review', 'triage']);

interface LedgerState {
  day_key: string;
  active_global: number;
  // Reserved cron/system lane: trusted, self-paced agents (pm, planner, strategist) are bounded HERE,
  // separately from the user/event caps, so an (abusable) user-triggered leak can never starve the
  // heartbeat — and a runaway system agent still can't fork-bomb past max_active_runs_system.
  active_system: number;
  active_by_repo: Record<string, number>;
  active_by_actor: Record<string, number>;
  runs_by_repo_day: Record<string, number>;
  runs_by_actor_day: Record<string, number>;
  runs_by_issue_day: Record<string, number>;
  // Daily global spend (resets at rollover) + outstanding reservations — a runaway safety rail that
  // is independent of, and complementary to, per-account balances.
  consumed_usd_cents: number;
  reserved_usd_cents: number;
  reservations: Record<string, { amount: number; expires_at_ms: number; account?: string; issue?: number; actor?: string; run_id?: string }>;
  // `expires_at_ms` is the run token's own expiry. An active run whose token has expired can no
  // longer spend, so it must not keep holding an active-run slot — reapExpiredRuns() frees it. This
  // is the safety net for the leak case: a workflow that dies before its release step would otherwise
  // pin the actor/repo/global active counters forever (see actor_active_run_limit_reached).
  // The extra fields beyond the active-slot accounting (github_run_id/purpose/started_at_ms +
  // consumed/request_count) exist only to power the public "live agents" panel: they let the project
  // page show what's running right now and deep-link to each run's live GitHub Actions log. They never
  // gate spend (the RunBudget DO is the per-run source of truth); they are a denormalized read cache.
  runs: Record<string, { repo: string; issue: number; actor: string; active: boolean; system?: boolean; expires_at_ms?: number; github_run_id?: string; purpose?: string; started_at_ms?: number; consumed_usd_cents?: number; request_count?: number }>;
  // The funding tree. Every project (repo slug) and named root (e.g. "volter") is an account.
  // balance = granted_in - granted_out - consumed. mint adds money at a node (the only way credits
  // enter the system); grant transfers between nodes (conserves total); spend consumes (leaves).
  accounts: Record<string, Account>;
  // Idempotency keys already applied by mint/grant/coupon, so retries don't double-apply.
  applied_keys: string[];
  // Issued coupons keyed by code (bearer/deferred grants).
  coupons: Record<string, Coupon>;
  // Append-only money-movement log (capped trailing window). Powers the platform activity feed and
  // the funding graph; a `grant` flow whose `from` is an account is how a project shows up as another
  // project's patron.
  flows: Flow[];
  // Per-source grant count for the day (resets at rollover) — a runaway backstop on autonomous
  // project→project redistribution.
  grants_by_from_day: Record<string, number>;
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
  // Patreon-style display profile. tagline/avatar/cover/homepage are a CACHE of the project's own
  // GitHub repo metadata (synced, not hand-entered) — `synced_at` set means the public sync
  // succeeded, which is also the signal the project is a public repo eligible for the storefront.
  // goal_days + tiers are ours (fleet defaults unless overridden). *_override let an operator pin
  // curated copy over the attacker-controlled synced strings.
  profile?: AccountProfile;
  goal_days?: number;
  tiers?: Tier[];
  // Operator moderation. listed = normal; hidden = off the explore grid (page + ledger still work);
  // banned = abuse hard-stop (register/reserve refuse, so the repo can't spend through the proxy).
  moderation?: Moderation;
  moderation_reason?: string;
}

export type Moderation = 'listed' | 'hidden' | 'banned';

export interface AccountProfile {
  tagline?: string;
  avatar_url?: string;
  cover_url?: string;
  homepage?: string;
  synced_at?: string;
  tagline_override?: string;
  cover_override?: string;
  // Cached raw text of the project's identity docs, synced from its repo (see github-sync). The page
  // parses + renders these; storing the raw doc keeps the ledger ignorant of presentation.
  charter_md?: string;
  roadmap_yml?: string;
  changelog_md?: string;
}

export interface Tier {
  usd_cents: number;
  name: string;
  perks: string[];
}

export interface Flow {
  kind: 'mint' | 'grant' | 'consume';
  to: string;
  from?: string;
  amount_usd_cents: number;
  sponsor_login?: string;
  coupon?: boolean;
  issue?: number;
  actor?: string;
  ts: string;
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
  // The reserved cron/system lane size (pm/planner/strategist). Bounds runaway cron without ever
  // letting user-triggered runs consume it.
  max_active_runs_system: number;
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
    if (op === 'set_profile') return json(await this.setProfile(String(body.account), body.profile as Partial<AccountProfile>, body.goal_days as number | undefined, body.tiers as Tier[] | undefined));
    if (op === 'moderate') return json(await this.moderate(String(body.account), String(body.status) as Moderation, body.reason ? String(body.reason) : undefined, body as Partial<AccountProfile>));
    if (op === 'directory') return json({ ok: true, entries: this.directory() });
    if (op === 'project') return json(this.projectView(String(body.account)));
    if (op === 'grant_surplus') return json(await this.grantSurplus(String(body.from), String(body.to), Number(body.amount_usd_cents)));
    if (op === 'status') return json(this.snapshot());
    if (op === 'reap') return json(await this.reapAdmin());
    if (op === 'reap_repo') return json(await this.reapRepo(String(body.repo)));
    if (op === 'reset_daily') return json(await this.resetDailyAdmin());
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
    this.recordFlow({ kind: 'mint', to: account, amount_usd_cents: Math.floor(amount), sponsor_login: sponsor?.login });
    await this.save();
    return { ok: true, account, balance_usd_cents: this.balanceOf(account) };
  }

  private recordFlow(flow: Omit<Flow, 'ts'>): void {
    this.state.flows.push({ ...flow, ts: new Date().toISOString() });
    if (this.state.flows.length > MAX_FLOWS) this.state.flows = this.state.flows.slice(-MAX_FLOWS);
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
    this.recordFlow({ kind: 'grant', from, to, amount_usd_cents: Math.floor(amount) });
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
    this.reapExpiredRuns();
    if (this.state.runs[claims.run_id]) return { ok: false, error: 'run_already_registered' };

    const issueKey = issueKeyFor(claims);
    const repoRuns = this.state.runs_by_repo_day[claims.repo] ?? 0;
    const actorRuns = this.state.runs_by_actor_day[claims.actor] ?? 0;
    const issueRuns = this.state.runs_by_issue_day[issueKey] ?? 0;
    const repoActive = this.state.active_by_repo[claims.repo] ?? 0;
    const actorActive = this.state.active_by_actor[claims.actor] ?? 0;

    // Cron/system agents (pm, planner, strategist) are trusted and self-paced — their SCHEDULE is their
    // rate limit. They register in a reserved lane, bounded only by max_active_runs_system, so they can
    // never be starved by (abusable) user-triggered runs and a runaway cron still can't fork-bomb. The
    // active-run + daily-count caps are the ABUSE rail for the externally-triggerable surface only.
    const isSystem = !USER_PURPOSES.has(claims.purpose ?? 'agent');
    if (isSystem) {
      if ((this.state.active_system ?? 0) >= config.max_active_runs_system) return { ok: false, error: 'system_active_run_limit_reached' };
    } else {
      if (this.state.active_global >= config.max_active_runs_global) return { ok: false, error: 'global_active_run_limit_reached' };
      if (repoActive >= config.max_active_runs_per_repo) return { ok: false, error: 'repo_active_run_limit_reached' };
      if (actorActive >= config.max_active_runs_per_actor) return { ok: false, error: 'actor_active_run_limit_reached' };
      if (repoRuns >= config.max_runs_per_repo_per_day) return { ok: false, error: 'repo_daily_run_limit_reached' };
      if (actorRuns >= config.max_runs_per_actor_per_day) return { ok: false, error: 'actor_daily_run_limit_reached' };
      if (issueRuns >= config.max_runs_per_issue_per_day) return { ok: false, error: 'issue_daily_run_limit_reached' };
    }
    // Abuse hard-stop: a banned repo can't spend through the proxy regardless of balance.
    if (this.acct(claims.repo)?.moderation === 'banned') {
      return { ok: false, error: 'account_banned', account: claims.repo };
    }
    // Funding gate: don't start a run for a project whose account is empty. Each repo is funded explicitly
    // (an owner grants it a bounded budget at bootstrap), so a runaway can only drain its own grant.
    if (config.enforce_account_balance && this.balanceOf(claims.repo) <= 0) {
      return { ok: false, error: 'account_unfunded', account: claims.repo, balance_usd_cents: this.balanceOf(claims.repo) };
    }
    // Permissionless discovery: materialize the account on first sight so the funding gate, the
    // public page, and (once GitHub-synced) the explore listing all work without any registration step.
    this.ensureAcct(claims.repo);

    if (isSystem) {
      this.state.active_system = (this.state.active_system ?? 0) + 1;
    } else {
      this.state.active_global += 1;
      this.state.active_by_repo[claims.repo] = repoActive + 1;
      this.state.active_by_actor[claims.actor] = actorActive + 1;
    }
    // Daily counters track every run for observability; gating on them is user-only (above).
    this.state.runs_by_repo_day[claims.repo] = repoRuns + 1;
    this.state.runs_by_actor_day[claims.actor] = actorRuns + 1;
    this.state.runs_by_issue_day[issueKey] = issueRuns + 1;
    this.state.runs[claims.run_id] = {
      repo: claims.repo,
      issue: claims.issue,
      actor: claims.actor,
      active: true,
      system: isSystem,
      expires_at_ms: Date.parse(claims.expires_at) || undefined,
      github_run_id: claims.github_run_id,
      purpose: claims.purpose,
      started_at_ms: Date.now(),
      consumed_usd_cents: 0,
      request_count: 0,
    };
    await this.save();
    return { ok: true };
  }

  private async complete(runId: string): Promise<{ ok: true }> {
    const run = this.state.runs[runId];
    if (!run || !run.active) return { ok: true };
    run.active = false;
    this.releaseActive(run);
    await this.save();
    return { ok: true };
  }

  // Release the active-run slots of EVERY active run for a repo. Used when a disposable cell is torn
  // down (its repo deleted): the cell's in-flight/abandoned runs would otherwise pin the active
  // counters for the full token TTL (~2h), saturating the per-actor/per-repo caps. Unlike
  // reapExpiredRuns this ignores expiry — a deleted cell's runs are abandoned by definition.
  private async reapRepo(repo: string): Promise<Record<string, unknown>> {
    let freed = 0;
    for (const run of Object.values(this.state.runs)) {
      if (run.active && run.repo === repo) {
        run.active = false;
        this.releaseActive(run);
        freed++;
      }
    }
    if (freed) await this.save();
    return { ok: true, repo, freed, active_global: this.state.active_global };
  }

  private async reserve(requestId: string, amount: number, config: LimitConfig, runId?: string): Promise<Record<string, unknown>> {
    this.rolloverIfNeeded();
    this.gcReservations();

    // A non-finite or negative amount would slip past the `>` gates below and poison reserved/balance
    // arithmetic into NaN, permanently disabling enforcement for this Durable Object.
    if (!Number.isFinite(amount) || amount < 0) return { ok: false, error: 'invalid_amount' };

    const run = runId ? this.state.runs[runId] : undefined;
    const account = run?.repo;

    // Abuse hard-stop: a banned account can't spend, even mid-run.
    if (account && this.acct(account)?.moderation === 'banned') {
      return { ok: false, error: 'account_banned', account };
    }

    // Per-account balance gate (the funding hard-stop). Cumulative spend + in-flight reservations on this
    // account may not exceed its balance. Spend is charged to the repo's OWN account — each repo is its own
    // bounded budget, so a runaway in one repo can only drain its own grant, never a shared pool or its
    // siblings. Funding (the owner granting a bounded amount to a repo) is an explicit treasury action.
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
    this.state.reservations[requestId] = { amount, expires_at_ms: Date.now() + 10 * 60_000, account, issue: run?.issue, actor: run?.actor, run_id: runId };
    await this.save();
    return { ok: true, remaining_global_usd_cents: available - amount };
  }

  private async consume(requestId: string, actual: number): Promise<void> {
    const reservation = this.state.reservations[requestId];
    const spent = Number.isFinite(actual) ? Math.max(0, actual) : 0;
    if (reservation) {
      this.state.reserved_usd_cents = Math.max(0, this.state.reserved_usd_cents - reservation.amount);
      if (reservation.account) {
        const a = this.ensureAcct(reservation.account);
        a.consumed_usd_cents += spent;
        recordDailySpend(a, spent);
        if (spent > 0) this.recordFlow({ kind: 'consume', to: reservation.account, amount_usd_cents: spent, issue: reservation.issue, actor: reservation.actor });
      }
      // Attribute the settled spend to the run so the live-agents panel can show per-run burn. A consume
      // always follows a successful reserve (one provider round-trip), so count the request here too.
      const run = reservation.run_id ? this.state.runs[reservation.run_id] : undefined;
      if (run) {
        run.consumed_usd_cents = (run.consumed_usd_cents ?? 0) + spent;
        run.request_count = (run.request_count ?? 0) + 1;
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
    const funded = grantedIn > 0;
    const est = estimateRunway(balance, a ? dailySpendSeries(a.daily_spend) : []);
    return {
      account,
      funded,
      paused: funded && balance <= 0,
      balance_usd_cents: balance,
      granted_in_usd_cents: grantedIn,
      granted_out_usd_cents: grantedOut,
      consumed_usd_cents: consumed,
      burn_per_day_usd_cents: est.burn_per_day_usd_cents,
      runway_days: funded ? est.runway_days : null,
      runway_lo_days: funded ? est.runway_lo_days : null,
      runway_hi_days: funded ? est.runway_hi_days : null,
      days_observed: est.days_observed,
      runway_confident: funded && est.confident,
      sponsors: a ? activeSponsors(a) : [],
    };
  }

  // ---- platform: profile, moderation, directory, project view, redistribution ---------------

  // Cache the project's GitHub-synced display metadata (+ operator-set goal/tiers). Synced fields are
  // only written when present, so a periodic sync never clobbers an operator override with a blank.
  private async setProfile(account: string, profile: Partial<AccountProfile> = {}, goalDays?: number, tiers?: Tier[]): Promise<Record<string, unknown>> {
    if (!account) return { ok: false, error: 'invalid_account' };
    const a = this.ensureAcct(account);
    const p = (a.profile ??= {});
    for (const k of ['tagline', 'avatar_url', 'cover_url', 'homepage', 'synced_at', 'tagline_override', 'cover_override', 'charter_md', 'roadmap_yml', 'changelog_md'] as const) {
      if (profile[k] !== undefined) p[k] = profile[k];
    }
    if (typeof goalDays === 'number' && goalDays > 0) a.goal_days = Math.floor(goalDays);
    if (Array.isArray(tiers)) a.tiers = tiers;
    await this.save();
    return { ok: true, account, profile: p };
  }

  private async moderate(account: string, status: Moderation, reason?: string, overrides: Partial<AccountProfile> = {}): Promise<Record<string, unknown>> {
    if (!account || !['listed', 'hidden', 'banned'].includes(status)) return { ok: false, error: 'invalid_moderation' };
    const a = this.ensureAcct(account);
    a.moderation = status;
    a.moderation_reason = reason;
    const p = (a.profile ??= {});
    if (overrides.tagline_override !== undefined) p.tagline_override = overrides.tagline_override || undefined;
    if (overrides.cover_override !== undefined) p.cover_override = overrides.cover_override || undefined;
    await this.save();
    return { ok: true, account, moderation: status };
  }

  // The explore grid: one entry per discovered project, filtered to public + listed in the renderer.
  private directory(): DirectoryEntry[] {
    return Object.keys(this.state.accounts)
      .map((id) => this.entryFor(id))
      .sort((a, b) => b.balance_usd_cents - a.balance_usd_cents);
  }

  private entryFor(account: string): DirectoryEntry {
    const a = this.acct(account);
    const f = this.fundingSnapshot(account);
    const profile = displayProfile(a);
    // Patrons = recurring/one-time sponsors PLUS other projects that have granted into this one.
    const projectPatrons = projectPatronsOf(this.state.flows, account, () => ({})).length;
    return {
      account,
      is_project: account.includes('/'),
      listed: account.includes('/') && (a?.moderation ?? 'listed') === 'listed' && Boolean(a?.profile?.synced_at),
      moderation: a?.moderation ?? 'listed',
      profile,
      goal_days: a?.goal_days ?? FLEET_GOAL_DAYS,
      funded: f.funded,
      paused: f.paused,
      balance_usd_cents: f.balance_usd_cents,
      granted_in_usd_cents: f.granted_in_usd_cents,
      granted_out_usd_cents: f.granted_out_usd_cents,
      consumed_usd_cents: f.consumed_usd_cents,
      burn_per_day_usd_cents: f.burn_per_day_usd_cents,
      runway_days: f.runway_days,
      runway_confident: f.runway_confident,
      patron_count: patronCount(a) + projectPatrons,
      monthly_usd_cents: monthlyTotal(a),
      status: fundingStatus(f),
    };
  }

  // Everything the creator page needs in one read: directory entry + tiers + recent feed + patron wall
  // (sponsors AND project-patrons derived from incoming grant flows).
  private projectView(account: string): ProjectView {
    const a = this.acct(account);
    const entry = this.entryFor(account);
    const feed = this.state.flows
      .filter((flow) => flow.to === account || flow.from === account)
      .slice(-FEED_LIMIT)
      .reverse();
    const sponsorPatrons: Patron[] = (a ? activeSponsors(a) : []).map((s) => ({
      kind: 'sponsor',
      login: s.login,
      name: s.name,
      avatar_url: s.avatar_url,
      url: s.url,
      tagline: s.tagline,
      amount_label: s.monthly_usd_cents ? `$${(s.monthly_usd_cents / 100).toFixed(0)}/mo` : undefined,
    }));
    const projectPatrons = projectPatronsOf(this.state.flows, account, (id) => displayProfile(this.acct(id)));
    // Runs executing right now for this repo. Filter expired-but-not-yet-reaped runs inline (pure read
    // model — don't mutate/reap here; register() and the cron reap own that), newest first, bounded.
    const now = Date.now();
    const liveRuns: LiveRun[] = Object.entries(this.state.runs)
      .filter(([, r]) => r.active && r.repo === account && (typeof r.expires_at_ms !== 'number' || r.expires_at_ms > now))
      .map(([run_id, r]) => ({
        run_id,
        repo: r.repo,
        issue: r.issue,
        actor: r.actor,
        purpose: r.purpose ?? 'agent',
        system: Boolean(r.system),
        github_run_id: r.github_run_id,
        started_at_ms: r.started_at_ms,
        consumed_usd_cents: r.consumed_usd_cents ?? 0,
        request_count: r.request_count ?? 0,
      }))
      .sort((x, y) => (y.started_at_ms ?? 0) - (x.started_at_ms ?? 0))
      .slice(0, 12);
    return {
      found: Boolean(a),
      ...entry,
      tiers: a?.tiers ?? FLEET_TIERS,
      feed,
      patrons: [...projectPatrons, ...sponsorPatrons],
      live_runs: liveRuns,
    };
  }

  // Autonomous project→project redistribution. A project may grant only the SURPLUS above its own
  // funding goal (floor = goal_days × burn), so it can never strand its own runway; a per-day count
  // caps runaway loops. Identity (that `from` is the caller's own repo) is enforced upstream by OIDC.
  private async grantSurplus(from: string, to: string, amount: number): Promise<Record<string, unknown>> {
    if (!from || !to || from === to || !Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'invalid_grant' };
    if ((this.state.grants_by_from_day[from] ?? 0) >= MAX_GRANTS_PER_FROM_PER_DAY) {
      return { ok: false, error: 'grant_rate_limited' };
    }
    const f = this.fundingSnapshot(from);
    const goalDays = this.acct(from)?.goal_days ?? FLEET_GOAL_DAYS;
    const floor = Math.ceil(goalDays * Math.max(0, f.burn_per_day_usd_cents));
    const surplus = f.balance_usd_cents - floor;
    if (amount > surplus) {
      return { ok: false, error: 'insufficient_surplus', surplus_usd_cents: Math.max(0, surplus), floor_usd_cents: floor, balance_usd_cents: f.balance_usd_cents };
    }
    const result = await this.grant(from, to, amount);
    if (result.ok) {
      this.state.grants_by_from_day[from] = (this.state.grants_by_from_day[from] ?? 0) + 1;
      await this.save();
    }
    return { ...result, floor_usd_cents: floor, surplus_usd_cents: surplus };
  }

  private snapshot() {
    return {
      day_key: this.state.day_key,
      active_global: this.state.active_global,
      active_system: this.state.active_system ?? 0,
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
    this.state.grants_by_from_day = {};
    this.state.consumed_usd_cents = 0;
    this.state.reserved_usd_cents = 0;
    this.state.reservations = {};
  }

  private normalizeState(): void {
    this.state.active_system ??= 0;
    this.state.runs_by_repo_day ??= {};
    this.state.runs_by_actor_day ??= {};
    this.state.runs_by_issue_day ??= {};
    this.state.runs ??= {};
    this.state.accounts ??= {};
    this.state.applied_keys ??= [];
    this.state.coupons ??= {};
    this.state.flows ??= [];
    this.state.grants_by_from_day ??= {};
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

  // Free the active-run slot of any run whose token has already expired. A run token is useless once
  // expired (run-budget and token verification both reject it), so an expired run that is still
  // marked active can only be a leak — a workflow that crashed/cancelled before its release step.
  // Without this the leaked run pins active_global / active_by_repo / active_by_actor forever, which
  // is exactly how the actor cap was reached and every mint started returning 429
  // actor_active_run_limit_reached. Idempotent; mutates state but does not save (callers save).
  private reapExpiredRuns(): void {
    const now = Date.now();
    for (const run of Object.values(this.state.runs)) {
      if (!run.active) continue;
      // No recorded expiry => pre-TTL run record; leave it for an explicit complete/revoke.
      if (typeof run.expires_at_ms !== 'number') continue;
      if (run.expires_at_ms > now) continue;
      run.active = false;
      this.releaseActive(run);
    }
  }

  // Free the active-run slot a run holds, in the correct lane (system vs user). Single source of truth
  // for complete() and reapExpiredRuns() so the two can never drift.
  private releaseActive(run: { repo: string; actor: string; system?: boolean }): void {
    if (run.system) {
      this.state.active_system = Math.max(0, (this.state.active_system ?? 0) - 1);
      return;
    }
    this.state.active_global = Math.max(0, this.state.active_global - 1);
    this.state.active_by_repo[run.repo] = Math.max(0, (this.state.active_by_repo[run.repo] ?? 0) - 1);
    this.state.active_by_actor[run.actor] = Math.max(0, (this.state.active_by_actor[run.actor] ?? 0) - 1);
  }

  // Admin bulk recovery: free active slots for every run whose token has expired, then return what
  // remains active. Surfaces the leak set without enumerating-and-revoking one run at a time, and is
  // the operator escape hatch when active counters drift from reality.
  // Operator escape hatch: zero today's global daily spend rail. The daily counter normally only resets on
  // the UTC rollover, so a metering bug that polluted `consumed_usd_cents` (e.g. an over-count) otherwise pins
  // the cap — and the whole fleet — until midnight. This corrects the rail without waiting. Does not touch
  // account balances or in-flight reservations; it only clears the daily safety counter.
  private async resetDailyAdmin(): Promise<Record<string, unknown>> {
    const before = this.state.consumed_usd_cents;
    this.state.consumed_usd_cents = 0;
    await this.save();
    return { ok: true, day_key: this.state.day_key, cleared_consumed_usd_cents: before, consumed_usd_cents: 0, reserved_usd_cents: this.state.reserved_usd_cents };
  }

  private async reapAdmin(): Promise<Record<string, unknown>> {
    const before = this.state.active_global;
    this.reapExpiredRuns();
    await this.save();
    return {
      ok: true,
      reaped: before - this.state.active_global,
      active_global: this.state.active_global,
      active_system: this.state.active_system ?? 0,
      active_by_actor: this.state.active_by_actor,
      active_by_repo: this.state.active_by_repo,
      still_active: Object.entries(this.state.runs)
        .filter(([, r]) => r.active)
        .map(([run_id, r]) => ({ run_id, repo: r.repo, actor: r.actor, expires_at_ms: r.expires_at_ms ?? null })),
    };
  }
}

function emptyAccount(): Account {
  return { granted_in_usd_cents: 0, granted_out_usd_cents: 0, consumed_usd_cents: 0, daily_spend: {}, sponsors: [], sponsors_active: {} };
}

export interface DirectoryEntry {
  account: string;
  is_project: boolean;
  listed: boolean;
  moderation: Moderation;
  profile: AccountProfile;
  goal_days: number;
  funded: boolean;
  paused: boolean;
  balance_usd_cents: number;
  granted_in_usd_cents: number;
  granted_out_usd_cents: number;
  consumed_usd_cents: number;
  burn_per_day_usd_cents: number;
  runway_days: number | null;
  runway_confident: boolean;
  patron_count: number;
  monthly_usd_cents: number;
  status: 'funded' | 'low' | 'unfunded';
}

export interface Patron {
  kind: 'sponsor' | 'project';
  login: string;
  name?: string;
  avatar_url?: string;
  url?: string;
  tagline?: string;
  amount_label?: string;
}

// A run that is executing RIGHT NOW for this project — the "follow along" surface. The GitHub Actions
// run (public, live-streaming logs) is the real-time view; `github_run_id` + `repo` deep-link to it.
export interface LiveRun {
  run_id: string;
  repo: string;
  issue: number;
  actor: string;
  purpose: string;
  system: boolean;
  github_run_id?: string;
  started_at_ms?: number;
  consumed_usd_cents: number;
  request_count: number;
}

export interface ProjectView extends DirectoryEntry {
  found: boolean;
  tiers: Tier[];
  feed: Flow[];
  patrons: Patron[];
  live_runs: LiveRun[];
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

// Daily spend series (idle days as 0), including today's spend so far, over the recorded window
// capped to the trailing 14 days — the evidence fed to the Bayesian runway estimate. With no spend
// the series is empty and the estimate falls back to the prior (a posterior is never empty).
function dailySpendSeries(daily: Record<string, number>): number[] {
  const keys = Object.keys(daily).sort();
  if (!keys.length) return [];
  const today = dayKey();
  const series: number[] = [];
  for (let d = keys[0]; d <= today; d = nextDay(d)) {
    series.push(daily[d] ?? 0);
    if (series.length > 14) series.shift();
  }
  return series;
}

function nextDay(key: string): string {
  const dt = new Date(`${key}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

function activeSponsors(a: Account): Sponsor[] {
  const merged = [...Object.values(a.sponsors_active), ...a.sponsors.filter((s) => !a.sponsors_active[s.login])];
  return merged;
}

// Resolve the displayed profile: operator overrides win over the GitHub-synced cache.
function displayProfile(a: Account | undefined): AccountProfile {
  const p = a?.profile ?? {};
  return {
    tagline: p.tagline_override ?? p.tagline,
    avatar_url: p.avatar_url,
    cover_url: p.cover_override ?? p.cover_url,
    homepage: p.homepage,
    synced_at: p.synced_at,
    charter_md: p.charter_md,
    roadmap_yml: p.roadmap_yml,
    changelog_md: p.changelog_md,
  };
}

function patronCount(a: Account | undefined): number {
  if (!a) return 0;
  const logins = new Set<string>([...Object.keys(a.sponsors_active), ...a.sponsors.map((s) => s.login)]);
  return logins.size;
}

function monthlyTotal(a: Account | undefined): number {
  if (!a) return 0;
  return Object.values(a.sponsors_active).reduce((sum, s) => sum + (s.monthly_usd_cents ?? 0), 0);
}

function fundingStatus(f: FundingSnapshot): 'funded' | 'low' | 'unfunded' {
  if (!f.funded || f.balance_usd_cents <= 0) return 'unfunded';
  if (f.runway_confident && f.runway_days !== null && f.runway_days < 7) return 'low';
  return 'funded';
}

// Projects that have granted INTO this account show up as patrons whose avatar is another project.
function projectPatronsOf(flows: Flow[], account: string, profileOf: (id: string) => AccountProfile): Patron[] {
  const byFrom = new Map<string, number>();
  for (const flow of flows) {
    if (flow.kind === 'grant' && flow.to === account && flow.from && flow.from.includes('/')) {
      byFrom.set(flow.from, (byFrom.get(flow.from) ?? 0) + flow.amount_usd_cents);
    }
  }
  return [...byFrom.entries()].map(([from, total]) => ({
    kind: 'project',
    login: from,
    name: from,
    avatar_url: profileOf(from).avatar_url,
    url: `/p/${encodeURIComponent(from)}`,
    amount_label: `granted $${(total / 100).toFixed(0)}`,
  }));
}

function emptyState(): LedgerState {
  return {
    day_key: dayKey(),
    active_global: 0,
    active_system: 0,
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
    flows: [],
    grants_by_from_day: {},
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

  setProfile(account: string, profile: Partial<AccountProfile>, goalDays?: number, tiers?: Tier[]) {
    return this.rpc<{ ok: boolean; profile?: AccountProfile; error?: string }>('set_profile', { account, profile, goal_days: goalDays, tiers });
  }

  moderate(account: string, status: Moderation, reason?: string, overrides: Partial<AccountProfile> = {}) {
    return this.rpc<{ ok: boolean; moderation?: Moderation; error?: string }>('moderate', { account, status, reason, ...overrides });
  }

  directory() {
    return this.rpc<{ ok: boolean; entries: DirectoryEntry[] }>('directory');
  }

  project(account: string) {
    return this.rpc<ProjectView>('project', { account });
  }

  grantSurplus(from: string, to: string, amountUsdCents: number) {
    return this.rpc<{ ok: boolean; from?: string; to?: string; amount_usd_cents?: number; from_balance_usd_cents?: number; to_balance_usd_cents?: number; surplus_usd_cents?: number; floor_usd_cents?: number; error?: string }>(
      'grant_surplus',
      { from, to, amount_usd_cents: amountUsdCents },
    );
  }

  status() {
    return this.rpc<unknown>('status');
  }

  reap() {
    return this.rpc<{ ok: true; reaped: number; active_global: number }>('reap');
  }

  resetDaily() {
    return this.rpc<{ ok: true; day_key: string; cleared_consumed_usd_cents: number; consumed_usd_cents: number }>('reset_daily');
  }

  reapRepo(repo: string) {
    return this.rpc<{ ok: true; repo: string; freed: number; active_global: number }>('reap_repo', { repo });
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
  runway_lo_days: number | null;
  runway_hi_days: number | null;
  days_observed: number;
  runway_confident: boolean;
  sponsors: Sponsor[];
}
