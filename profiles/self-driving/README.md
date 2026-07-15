# Self-Driving Repository Template

Copy this directory into a GitHub repository to enable open-autonomy.

## Setup

1. Copy these files to the target repo root.
2. Run `bun install`.
3. Edit `AGENTS.md` and `.open-autonomy/*` for the target repository.
4. Set the model proxy URL, model names, and budget variables. No repository
   secrets are required: in-cell agents mint bounded, per-run model tokens via
   GitHub OIDC (`id-token: write`), which the proxy authorizes by trusting this
   repo's `public-agent.yml` workflow.
5. Confirm `bun run check` passes.
6. Run the planner workflow in dry mode.
7. Smoke `/agent pause`, paused `/agent develop`, `/agent status`, and
   `/agent resume`.

Native GitHub approving reviews are optional and disabled unless the
`OPEN_AUTONOMY_NATIVE_APPROVAL_TOKEN` secret is set. If branch protection also requires native reviews, use
a distinct write-capable identity and enable stale-review dismissal as documented in
[`docs/NATIVE-APPROVAL.md`](docs/NATIVE-APPROVAL.md). This never replaces `agent-review` or the
sensitive-scope `human-approval` gate.

## First Issue Flow

Use the first low-risk issue to prove the template works in the new repository:

1. Open a small docs-only issue with clear acceptance criteria.
2. Confirm repository variables and secrets are configured before enabling
   agent runs.
3. Comment `/agent develop` on the issue and verify the direct develop loop
   starts.
4. Run `Public Agent PM` with a small limit and verify PM either dispatches a
   clear issue or writes a visible status such as `needs-info`.
5. Confirm the resulting PR or status comment reflects the issue context and
   the repository checks still pass.

This template assumes the target repo keeps the agent scripts in `scripts/` and
the workflows in `.github/workflows/`.
