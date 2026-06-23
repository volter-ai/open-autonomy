import { error } from './errors.js';
import { LimitLedgerClient, type LimitConfig } from './limit-ledger.js';
import { RunBudgetClient } from './run-budget.js';
import type { Env, UsageEvent } from './types.js';

export interface BudgetReservation {
  requestId: string;
  remainingRunUsdCents: number;
  remainingGlobalUsdCents: number;
  consume(actualUsdCents: number, event: UsageEvent): Promise<void>;
  // `reached` = did the request actually reach the provider? A provider response (even a non-2xx error)
  // counts against max_requests; only a request that never touched the provider (pre-fetch cap rejection,
  // network error) refunds its request slot. Refunding a reached request would let failing calls loop
  // unboundedly (max_requests is the ONLY outbound-fetch cap — a failed call bills $0).
  release(reached: boolean): Promise<void>;
}

export async function reserveBudget(
  env: Env,
  runId: string,
  amountUsdCents: number,
  limitConfig: LimitConfig,
): Promise<BudgetReservation | Response> {
  const requestId = crypto.randomUUID();
  const runBudget = new RunBudgetClient(env.RUNS, runId);
  const ledger = new LimitLedgerClient(env.LIMITS);

  const runReservation = await runBudget.reserve(requestId, amountUsdCents);
  if (!runReservation.ok) return error(runReservation.error, 402);

  const globalReservation = await ledger.reserve(requestId, amountUsdCents, limitConfig, runId);
  if (!globalReservation.ok) {
    await runBudget.release(requestId, false); // rejected before any provider fetch — refund the slot
    return error(globalReservation.error, 402);
  }

  return {
    requestId,
    remainingRunUsdCents: runReservation.remaining_usd_cents,
    remainingGlobalUsdCents: globalReservation.remaining_global_usd_cents,
    async consume(actualUsdCents: number, event: UsageEvent): Promise<void> {
      await Promise.all([
        runBudget.consume(requestId, actualUsdCents, event),
        ledger.consume(requestId, actualUsdCents),
      ]);
    },
    async release(reached: boolean): Promise<void> {
      await Promise.all([
        runBudget.release(requestId, reached),
        ledger.release(requestId),
      ]);
    },
  };
}
