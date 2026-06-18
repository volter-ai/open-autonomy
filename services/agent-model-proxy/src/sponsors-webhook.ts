import { error, json } from './errors.js';
import { LimitLedgerClient, type Sponsor } from './limit-ledger.js';
import { constantTimeEqual } from './token.js';
import type { Env } from './types.js';

// GitHub Sponsors webhook intake. The webhook (configured once in the org's Sponsors settings with a
// shared secret) keeps the active recurring-sponsor list current with NO GitHub token: created /
// tier_changed / edited upsert, cancelled removes. One-time sponsorships are credited immediately.
// Recurring sponsorships are turned into pool funding by the monthly accrue() cron (see index.ts),
// because GitHub fires no per-renewal webhook event.
// https://docs.github.com/en/webhooks/webhook-events-and-payloads#sponsorship

interface SponsorshipPayload {
  action?: string;
  sponsorship?: {
    node_id?: string;
    created_at?: string;
    privacy_level?: string;
    sponsor?: { login?: string; avatar_url?: string };
    tier?: { monthly_price_in_cents?: number; is_one_time?: boolean };
  };
}

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function verifySignature(secret: string, body: string, header: string | null): Promise<boolean> {
  if (!header) return false;
  const expected = `sha256=${await hmacHex(secret, body)}`;
  return constantTimeEqual(header, expected);
}

export async function handleSponsorsWebhook(req: Request, env: Env, account: string): Promise<Response> {
  if (req.method !== 'POST') return error('method_not_allowed', 405);
  if (!env.GITHUB_SPONSORS_WEBHOOK_SECRET) return error('webhook_not_configured', 503);

  const event = req.headers.get('x-github-event');
  const body = await req.text();
  if (!(await verifySignature(env.GITHUB_SPONSORS_WEBHOOK_SECRET, body, req.headers.get('x-hub-signature-256')))) {
    return error('invalid_signature', 401);
  }

  // GitHub sends a `ping` when the webhook is first created.
  if (event === 'ping') return json({ ok: true, pong: true });
  if (event !== 'sponsorship') return json({ ok: true, ignored: event });

  const payload = JSON.parse(body) as SponsorshipPayload;
  const action = payload.action;
  const s = payload.sponsorship;
  const login = s?.sponsor?.login;
  if (!login || !s?.tier) return error('invalid_payload', 400);

  const amount = s.tier.monthly_price_in_cents ?? 0;
  const sponsor: Sponsor = {
    login,
    avatar_url: s.sponsor?.avatar_url,
    monthly_usd_cents: amount,
  };
  const ledger = new LimitLedgerClient(env.LIMITS);

  switch (action) {
    case 'created':
      if (s.tier.is_one_time) {
        // One-time gifts are funding right now; idempotent on the sponsorship identity.
        const key = `onetime:${s.node_id ?? `${login}:${s.created_at ?? ''}`}`;
        await ledger.mint(account, amount, key, sponsor);
      } else {
        await ledger.sponsorUpsert(account, sponsor);
      }
      break;
    case 'tier_changed':
    case 'edited':
      if (!s.tier.is_one_time) await ledger.sponsorUpsert(account, sponsor);
      break;
    case 'cancelled':
      await ledger.sponsorRemove(account, login);
      break;
    default:
      // pending_cancellation / pending_tier_change and anything else: acknowledge, no state change.
      break;
  }

  return json({ ok: true, action });
}
