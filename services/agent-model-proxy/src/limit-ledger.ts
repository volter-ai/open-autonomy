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
  };
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

  status() {
    return this.rpc<unknown>('status');
  }
}
