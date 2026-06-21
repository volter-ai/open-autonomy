export type Provider = 'anthropic' | 'openai';

export interface Env {
  AGENT_PROXY_ADMIN_TOKEN: string;
  AGENT_PROXY_HMAC_SECRET: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  DEFAULT_MAX_USD_CENTS?: string;
  DEFAULT_MAX_REQUESTS?: string;
  DEFAULT_EXPIRES_SECONDS?: string;
  MAX_BODY_BYTES?: string;
  MODEL_PRICES_JSON?: string;
  MAX_RUN_USD_CENTS?: string;
  MAX_RUN_REQUESTS?: string;
  MAX_ACTIVE_RUNS_GLOBAL?: string;
  MAX_ACTIVE_RUNS_PER_REPO?: string;
  MAX_ACTIVE_RUNS_PER_ACTOR?: string;
  MAX_ACTIVE_RUNS_SYSTEM?: string;
  MAX_RUNS_PER_REPO_PER_DAY?: string;
  MAX_RUNS_PER_ACTOR_PER_DAY?: string;
  MAX_RUNS_PER_ISSUE_PER_DAY?: string;
  MAX_GLOBAL_DAILY_USD_CENTS?: string;
  ENFORCE_ACCOUNT_BALANCE?: string;
  DEFAULT_FUNDING_ACCOUNT?: string;
  DEFAULT_SPONSOR_ACCOUNT?: string;
  GITHUB_SPONSORS_WEBHOOK_SECRET?: string;
  GITHUB_OIDC_AUDIENCE?: string;
  GITHUB_OIDC_ALLOWED_WORKFLOW?: string;
  GITHUB_OIDC_OPENID_CONFIGURATION_URL?: string;
  GITHUB_OIDC_JWKS_URL?: string;
  GITHUB_API_BASE?: string;
  RUNS: DurableObjectNamespace;
  LIMITS: DurableObjectNamespace;
}

export interface RunClaims {
  run_id: string;
  repo: string;
  issue: number;
  actor: string;
  max_usd_cents: number;
  max_requests: number;
  models: string[];
  expires_at: string;
  purpose?: 'triage' | 'agent' | 'review' | 'pm';
  github_run_id?: string;
  github_run_attempt?: string;
  github_workflow_ref?: string;
}

export interface MintRunRequest {
  run_id?: string;
  repo: string;
  issue: number;
  actor: string;
  max_usd_cents?: number;
  max_usd?: number;
  max_requests?: number;
  models: string[];
  expires_in_seconds?: number;
  purpose?: 'triage' | 'agent' | 'review' | 'pm';
  github_run_id?: string;
  github_run_attempt?: string;
  github_workflow_ref?: string;
}

export interface UsageEvent {
  request_id: string;
  provider: Provider;
  model: string;
  route: string;
  reserved_usd_cents: number;
  actual_usd_cents: number;
  input_tokens?: number;
  output_tokens?: number;
  outcome: 'ok' | 'upstream_error' | 'rejected' | 'metering_error';
  created_at: string;
}
