// The LOCAL substrate's model-token seam — the same interface the agents import on github
// (`mintModelToken`/`revokeModelToken`), realized WITHOUT the model proxy. On a trusted local machine
// there is no OIDC mint and no per-issue spend wall: the runner's environment supplies the model
// credential directly (MODEL_PROXY_TOKEN), and there is nothing to revoke. The agent code is identical
// across substrates; only THIS file differs. Emitted verbatim by compileLocal as scripts/model-token.ts
// so an agent's `import './model-token.js'` resolves.

export interface MintOptions {
  issue: string;
  models: string;
  maxUsdCents?: number;
  maxRequests?: number;
  purpose?: 'pm' | 'review';
}

export interface ModelToken {
  ok: boolean;
  runId: string;
  token: string;
  budgetExhausted: boolean;
}

/** Hand back the environment-provided model token (the local runner provisions it; nothing is minted). */
export async function mintModelToken(_opts: MintOptions): Promise<ModelToken> {
  const token = process.env.MODEL_PROXY_TOKEN ?? '';
  return { ok: token.length > 0, runId: '', token, budgetExhausted: false };
}

/** No proxy run to release on local. */
export async function revokeModelToken(_runId: string): Promise<void> {
  /* nothing to revoke */
}
