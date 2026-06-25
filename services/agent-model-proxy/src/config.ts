import type { HealthOpts } from './health.js';
import type { LimitConfig } from './limit-ledger.js';
import type { Env } from './types.js';

/** Health thresholds from env (minutes → ms). Defaults: down after 3h silent, dormant after 7d. */
export function healthOptsFromEnv(env: Env, nowMs: number): HealthOpts {
  const min = (v: string | undefined, d: number) => (Number(v) > 0 ? Number(v) : d) * 60_000;
  return {
    silenceMs: min(env.HEALTH_SILENCE_MINUTES, 180),
    deadMs: min(env.HEALTH_DEAD_MINUTES, 7 * 24 * 60),
    nowMs,
  };
}

export function limitsFromEnv(env: Env): LimitConfig {
  return {
    max_active_runs_global: Number(env.MAX_ACTIVE_RUNS_GLOBAL ?? 10),
    max_active_runs_per_repo: Number(env.MAX_ACTIVE_RUNS_PER_REPO ?? 3),
    max_active_runs_per_actor: Number(env.MAX_ACTIVE_RUNS_PER_ACTOR ?? 1),
    max_active_runs_system: Number(env.MAX_ACTIVE_RUNS_SYSTEM ?? 4),
    max_runs_per_repo_per_day: Number(env.MAX_RUNS_PER_REPO_PER_DAY ?? 500),
    max_runs_per_actor_per_day: Number(env.MAX_RUNS_PER_ACTOR_PER_DAY ?? 200),
    max_runs_per_issue_per_day: Number(env.MAX_RUNS_PER_ISSUE_PER_DAY ?? 50),
    max_global_daily_usd_cents: Number(env.MAX_GLOBAL_DAILY_USD_CENTS ?? 5000),
    enforce_account_balance: (env.ENFORCE_ACCOUNT_BALANCE ?? 'false') === 'true',
  };
}
