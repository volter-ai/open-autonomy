import { json } from './errors.js';
import type { SessionTurn } from './session-capture.js';
import type { RunClaims, UsageEvent } from './types.js';

interface RunState {
  claims: RunClaims | null;
  revoked: boolean;
  consumed_usd_cents: number;
  reserved_usd_cents: number;
  request_count: number;
  reservations: Record<string, { amount: number; expires_at_ms: number }>;
  events: UsageEvent[];
  // Rolling redacted window of the run's live session (recent model turns + tool calls), refreshed on each
  // proxied request. The only way to observe a run's interior WHILE it runs — read by the live page + the PM.
  session: { updated_at: string; turns: SessionTurn[] } | null;
  created_at: string;
  updated_at: string;
}

export class RunBudget implements DurableObject {
  private loaded = false;
  private state: RunState = emptyState();

  constructor(private readonly ctx: DurableObjectState) {}

  async fetch(req: Request): Promise<Response> {
    await this.load();
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const op = body.op;

    if (op === 'init') return json(await this.init(body.claims as RunClaims));
    if (op === 'status') return json(this.snapshot());
    if (op === 'revoke') return json(await this.revoke());
    if (op === 'reserve') {
      return json(await this.reserve(String(body.request_id), Number(body.amount_usd_cents)));
    }
    if (op === 'consume') {
      await this.consume(String(body.request_id), Number(body.actual_usd_cents), body.event as UsageEvent);
      return json({ ok: true });
    }
    if (op === 'release') {
      await this.release(String(body.request_id), body.reached === true);
      return json({ ok: true });
    }
    if (op === 'record_session') {
      await this.recordSession((body.turns as SessionTurn[]) ?? []);
      return json({ ok: true });
    }
    return json({ ok: false, error: 'unknown_op' }, { status: 400 });
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    const stored = await this.ctx.storage.get<RunState>('state');
    if (stored) this.state = stored;
    this.gcReservations();
    this.loaded = true;
  }

  private async save(): Promise<void> {
    this.state.updated_at = new Date().toISOString();
    await this.ctx.storage.put('state', this.state);
  }

  private async init(claims: RunClaims): Promise<{ ok: true; run: ReturnType<RunBudget['snapshot']> } | { ok: false; error: 'run_already_exists' }> {
    if (this.state.claims) {
      return { ok: false, error: 'run_already_exists' };
    }
    this.state.claims = claims;
    this.state.created_at = new Date().toISOString();
    await this.save();
    return { ok: true, run: this.snapshot() };
  }

  private async revoke(): Promise<{ ok: true }> {
    this.state.revoked = true;
    await this.save();
    return { ok: true };
  }

  private async reserve(requestId: string, amount: number): Promise<Record<string, unknown>> {
    this.gcReservations();
    const claims = this.state.claims;
    if (!claims) return { ok: false, error: 'run_not_found' };
    if (this.state.revoked) return { ok: false, error: 'run_revoked' };
    if (Date.parse(claims.expires_at) <= Date.now()) return { ok: false, error: 'run_expired' };
    if (this.state.request_count >= claims.max_requests) {
      return { ok: false, error: 'request_limit_reached', request_count: this.state.request_count, max_requests: claims.max_requests };
    }

    const available = claims.max_usd_cents - this.state.consumed_usd_cents - this.state.reserved_usd_cents;
    if (amount > available) {
      return {
        ok: false,
        error: 'spend_limit_reached',
        consumed_usd_cents: this.state.consumed_usd_cents,
        reserved_usd_cents: this.state.reserved_usd_cents,
        max_usd_cents: claims.max_usd_cents,
      };
    }

    this.state.request_count += 1;
    this.state.reserved_usd_cents += amount;
    this.state.reservations[requestId] = { amount, expires_at_ms: Date.now() + 10 * 60_000 };
    await this.save();
    return { ok: true, remaining_usd_cents: available - amount, request_count: this.state.request_count };
  }

  private async consume(requestId: string, actual: number, event: UsageEvent): Promise<void> {
    const reservation = this.state.reservations[requestId];
    if (reservation) {
      this.state.reserved_usd_cents = Math.max(0, this.state.reserved_usd_cents - reservation.amount);
      delete this.state.reservations[requestId];
    }
    // Guard non-finite charges (a malformed upstream cost_usd → settleCents can return NaN): NaN would poison
    // consumed_usd_cents permanently and disable the per-run cap (the ledger guards this the same way).
    this.state.consumed_usd_cents += Number.isFinite(actual) ? Math.max(0, actual) : 0;
    this.state.events.push(event);
    this.state.events = this.state.events.slice(-200);
    await this.save();
  }

  // Overwrite the live session window with the latest request's recent turns (already redacted + capped by
  // the caller). Replace, not append — each request carries the full conversation so far, so the newest one
  // is the freshest complete window. Bounded so the DO stays small regardless of run length.
  private async recordSession(turns: SessionTurn[]): Promise<void> {
    this.state.session = { updated_at: new Date().toISOString(), turns: turns.slice(-20) };
    await this.save();
  }

  private async release(requestId: string, reached: boolean): Promise<void> {
    const reservation = this.state.reservations[requestId];
    if (!reservation) return;
    this.state.reserved_usd_cents = Math.max(0, this.state.reserved_usd_cents - reservation.amount);
    // Refund the request slot ONLY when the provider was never reached (pre-fetch cap rejection or a
    // network error) — otherwise reserve()'s increment leaks and a run hits request_limit_reached before
    // max_requests real calls. A reached request (any provider response, incl. non-2xx) MUST keep its slot,
    // or a run that reliably triggers 4xx/5xx could loop unbounded outbound fetches at $0. consume() keeps
    // the count too. gcReservations deliberately does NOT refund (a swept reservation is treated as reached
    // — refunding on expiry would re-open the unbounded-fetch path via deliberate hangs).
    if (!reached) this.state.request_count = Math.max(0, this.state.request_count - 1);
    delete this.state.reservations[requestId];
    await this.save();
  }

  private snapshot() {
    return {
      claims: this.state.claims,
      revoked: this.state.revoked,
      consumed_usd_cents: this.state.consumed_usd_cents,
      reserved_usd_cents: this.state.reserved_usd_cents,
      request_count: this.state.request_count,
      recent_events: this.state.events,
      session: this.state.session,
      created_at: this.state.created_at,
      updated_at: this.state.updated_at,
    };
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

function emptyState(): RunState {
  const now = new Date().toISOString();
  return {
    claims: null,
    revoked: false,
    consumed_usd_cents: 0,
    reserved_usd_cents: 0,
    request_count: 0,
    reservations: {},
    events: [],
    session: null,
    created_at: now,
    updated_at: now,
  };
}

export class RunBudgetClient {
  constructor(private readonly ns: DurableObjectNamespace, private readonly runId: string) {}

  private async rpc<T>(op: string, args: Record<string, unknown> = {}): Promise<T> {
    const stub = this.ns.get(this.ns.idFromName(this.runId));
    const res = await stub.fetch('https://run-budget.local/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op, ...args }),
    });
    return await res.json() as T;
  }

  init(claims: RunClaims) {
    return this.rpc<{ ok: true; run: unknown } | { ok: false; error: string }>('init', { claims });
  }

  status() {
    return this.rpc<unknown>('status');
  }

  revoke() {
    return this.rpc<{ ok: true }>('revoke');
  }

  reserve(requestId: string, amountUsdCents: number) {
    return this.rpc<{ ok: true; remaining_usd_cents: number; request_count: number } | { ok: false; error: string }>(
      'reserve',
      { request_id: requestId, amount_usd_cents: amountUsdCents },
    );
  }

  consume(requestId: string, actualUsdCents: number, event: UsageEvent) {
    return this.rpc<{ ok: true }>('consume', { request_id: requestId, actual_usd_cents: actualUsdCents, event });
  }

  release(requestId: string, reached: boolean) {
    return this.rpc<{ ok: true }>('release', { request_id: requestId, reached });
  }

  recordSession(turns: SessionTurn[]) {
    return this.rpc<{ ok: true }>('record_session', { turns });
  }
}
