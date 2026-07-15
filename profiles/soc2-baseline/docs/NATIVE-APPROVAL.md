# Optional native GitHub approval adapter

Open Autonomy's authoritative agent decision is the exact-head `agent-review` commit status. Some GitHub
repositories additionally require a native approving PR review. The `native-approval.yml` code-host resource
can materialize that second control through a separately configured GitHub identity.

These controls remain independent:

| control | means | produced by |
|---|---|---|
| `agent-review` | an independent reviewer agent approved this exact head | trusted reviewer effect |
| native `APPROVED` review | GitHub branch protection has an approving-review record | optional adapter identity |
| `human-approval` | a write-capable maintainer authorized sensitive scope on this exact head | human gate |

Native approval never posts either status and does not satisfy a human-approval hold. In particular, do not
enable the adapter where a required native review is intended to be a human change-management control.

## Enable it

The GitHub-targeting `self-driving`, `simple-gh-sdlc`, and `soc2-baseline` profiles carry the workflow and
script as dormant resources. Enabling it is an installation decision:

1. Create or choose a dedicated GitHub user identity distinct from every identity that authors agent PRs.
2. Grant it `write`, `maintain`, or `admin` repository permission. Use a fine-grained personal access token
   with repository metadata read and pull-request read/write access (or an equivalent user token).
3. Store the token as the Actions secret `OPEN_AUTONOMY_NATIVE_APPROVAL_TOKEN`.
4. If native approval is to be required, set `branch_protection.required_reviews` to at least `1` and
   `branch_protection.dismiss_stale_reviews` to `true` in `provision.json`, then re-run provisioning.

Example:

```json
{
  "branch_protection": {
    "branch": "main",
    "required_checks": ["ci", "agent-review"],
    "required_reviews": 1,
    "dismiss_stale_reviews": true
  }
}
```

Do not require native reviews without `dismiss_stale_reviews`: GitHub could otherwise continue counting an
approval after the PR head changes. Existing manifests remain backward-compatible; the provisioning default
is `false` until an installation opts in.

## Security and failure behavior

- `workflow_run` executes the adapter from the default branch after the generated `reviewer` workflow
  completes successfully. It downloads that exact run's typed result artifact; it never checks out PR code.
- A manual retry requires one PR number and one full head SHA. The adapter never lists PRs or discovers other
  PRs sharing a SHA.
- Before approving, it re-reads the one PR, resolves the token's actual identity, verifies current write+
  permission, rejects self-approval, and requires authoritative `agent-review=success` on the bound SHA.
- An exact-head approval already posted by that identity is an idempotent success. The PR and recorded review
  are re-read after a new approval so a concurrent push cannot be reported as success.
- With no token, the optional workflow emits a notice and creates no approval. If native reviews are required,
  GitHub therefore keeps the PR blocked. Invalid, revoked, self, or under-privileged credentials fail the run
  with an actionable error and create no approval.

The credential is deliberately a code-host installation capability. No login, repository, agent behavior,
runner substrate, or Ponder convention is encoded in the IR, scheduler, or profile doctrine.
