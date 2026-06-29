# Subprocessor / vendor inventory

> **Owner:** [OWNER] · **Reviewed:** [DATE] · **Cadence:** ≥ annually and on any new vendor (CC9).

Pre-filled with the `soc2-baseline` stack. For each: confirm the SOC 2 report, data shared, and risk rank.
Sign a DPA with each subprocessor that processes your data (see `policies/vendor-management-policy.md`).

| Subprocessor | Role | Data it processes | SOC 2 report? | Risk | DPA |
|---|---|---|---|---|---|
| **GitHub** (Microsoft) | Code host, CI/CD, Actions runners, secret store | Source code, issues/PRs, Actions secrets, run logs | Yes — request via GitHub Trust Center | Med | [link] |
| **Open Autonomy model proxy** | Gates all agent model spend; mints bounded run tokens; holds provider keys | Model requests/responses **transit** it (source code + prompts); spend ledger (repo/issue/actor) | **Verify with the proxy operator** — this is a key dependency (it sees your code in-flight) | **High** | [link] |
| **Cloudflare** | Hosts the model proxy (Workers + Durable Objects) | Same as the proxy (it runs there); at-rest ledger | Yes — Cloudflare Trust Hub | Med | [link] |
| **OpenRouter** | Upstream model routing (the proxy forwards to it) | Model requests/responses (source code + prompts) | **Verify** | **High** | [link] |
| **Model provider(s)** (e.g. DeepSeek/Anthropic via OpenRouter) | LLM inference | Model requests/responses | **Verify per provider** | High | [link] |
| **npm registry** | Dependency source | none (read-only fetch) | n/a (integrity enforced by `check-supply-chain.ts`) | Low | n/a |
| _[your compliance platform — Vanta/Drata]_ | Continuous control monitoring | Repo/control metadata | Yes | Low | [link] |

## Notes

- The **proxy + OpenRouter + provider** chain is where your source code leaves your repo boundary in-flight.
  It is the highest-value vendor-management item: confirm each link's data handling and retention. The proxy
  itself does **not persist** request/response bodies, but it is still a processor of that data in transit.
- GitHub Actions runners execute your code with capability-scoped tokens under an egress allowlist (C3).
