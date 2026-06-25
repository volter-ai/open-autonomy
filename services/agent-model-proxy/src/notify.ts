// Out-of-band push for the health monitor. The proxy is the org's external watcher, so its alert channel
// must NOT depend on the fleet it watches (no GitHub Actions, no in-repo workflow). Email via Resend is a
// direct API call the Worker makes itself — it reaches the maintainer even when the repo's automation is
// dead. Gated on config: with no RESEND_API_KEY / recipient, this is a logged no-op (the monitor still
// detects + exposes silence via GET /health; it just can't push until a channel is configured).
import type { Env } from './types.js';

export interface NotifyResult {
  sent: boolean;
  reason?: string;
}

export async function sendHealthEmail(env: Env, subject: string, text: string): Promise<NotifyResult> {
  const key = env.RESEND_API_KEY;
  const to = env.HEALTH_ALERT_EMAIL;
  if (!key || !to) return { sent: false, reason: 'not_configured' };
  const from = env.HEALTH_ALERT_FROM ?? 'open-autonomy <alerts@send.runhuman.com>';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: to.split(/[\s,]+/).filter(Boolean), subject, text }),
    });
    if (!res.ok) return { sent: false, reason: `resend_${res.status}` };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : 'fetch_failed' };
  }
}
