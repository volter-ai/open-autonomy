// The github surface of the model-token contract — the bounded model credential a deterministic agent
// consumes to make one short, budget-capped reasoning call. The agent expresses INTENT ("give me a
// bounded token for this work item"); how github realizes it (an OIDC-bounded mint against the deployed
// model proxy, with the admin creds the deterministic job supplies in env) is hidden here. A different
// substrate ships a different model-token.ts with the same interface (e.g. a direct token from the local
// environment); the agent code does not change. Like the runner, the proxy/mint machinery is a substrate
// concern — never an agent concern.
import { $ } from 'bun';

export interface MintOptions {
  /** Path to the issue.json the spend is attributed to. */
  issue: string;
  /** Comma-separated model allowlist for this token. */
  models: string;
  /** Per-token spend cap (cents). */
  maxUsdCents?: number;
  /** Per-token request cap. */
  maxRequests?: number;
  /** What the token is for (spend attribution). */
  purpose?: 'pm' | 'review';
}

export interface ModelToken {
  /** Whether a usable token was provisioned. */
  ok: boolean;
  /** The provisioning run id (passed back to revoke); empty when the substrate has nothing to revoke. */
  runId: string;
  /** The bearer token the model call consumes via MODEL_PROXY_TOKEN. */
  token: string;
  /** Substrate-neutral signal that the lifetime budget is terminally exhausted (agent should pause). */
  budgetExhausted: boolean;
}

/** Mint a bounded model token for one agent reasoning call. */
export async function mintModelToken(opts: MintOptions): Promise<ModelToken> {
  const args = ['--issue', opts.issue, '--models', opts.models, '--max-requests', String(opts.maxRequests ?? 2)];
  if (opts.maxUsdCents != null) args.push('--max-usd-cents', String(opts.maxUsdCents));
  if (opts.purpose) args.push('--purpose', opts.purpose);
  const res = await $`bun scripts/model-proxy-mint.ts ${args}`.nothrow().quiet();
  const out = res.stdout.toString() + res.stderr.toString();
  return {
    ok: res.exitCode === 0,
    runId: out.match(/^run_id=(.*)$/m)?.[1] ?? '',
    token: out.match(/^token=(.*)$/m)?.[1] ?? '',
    budgetExhausted: out.includes('repo_lifetime_budget_exhausted'),
  };
}

/** Release a previously minted token (no-op when there is no run to revoke). */
export async function revokeModelToken(runId: string): Promise<void> {
  if (!runId) return;
  await $`bun scripts/model-proxy-revoke.ts --run-id ${runId}`.nothrow();
}
