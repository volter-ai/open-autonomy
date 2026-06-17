# Codex Agent Transcript

Model: gpt-5.4-mini
Exit code: 0

## Final Message

Implemented a small docs-only change for the self-hosted fleet scaffold.

What changed:
- Updated [templates/self-driving-repo/README.md](/home/runner/work/open-autonomy/open-autonomy/templates/self-driving-repo/README.md) to explicitly call out repository variables, secrets, and a first-issue flow.
- Added a dedicated `First Issue Flow` section to [templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md](/home/runner/work/open-autonomy/open-autonomy/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md).

Verification:
- Scaffoled the template into `/tmp/open-autonomy-scaffold-smoke`.
- Ran `bun test scripts/open-autonomy-fleet.test.ts` in the scaffolded repo successfully.

Artifacts written:
- [pr.md](/home/runner/work/open-autonomy/open-autonomy/.agent-run/out/task/artifacts/pr.md)
- [result.json](/home/runner/work/open-autonomy/open-autonomy/.agent-run/out/task/artifacts/result.json)
- [transcript.md](/home/runner/work/open-autonomy/open-autonomy/.agent-run/out/task/artifacts/transcript.md)

## stderr

```text
Reading additional input from stdin...
OpenAI Codex v0.140.0
--------
workdir: /home/runner/work/open-autonomy/open-autonomy
model: gpt-5.4-mini
provider: volter_model_proxy
approval: never
sandbox: workspace-write [workdir, /tmp, $TMPDIR]
reasoning effort: none
reasoning summaries: none
session id: 019ed5ef-3bcc-7082-bc82-8db8e452aa71
--------
user
You are running as the public Volter self-building agent in a bounded GitHub Actions job.

Implement the GitHub issue in this repository. Make a small but real code or documentation change that directly addresses the issue. Do not make unrelated refactors.

Issue #12: [roadmap:self-hosted-fleet] Self-Hosted Repository Fleet

Roadmap item: `self-hosted-fleet`
Phase: 9
Priority: medium
Proof gate: `scaffold-install-smoke`

Acceptance criteria:
- A new repo can be scaffolded from the template and run checks.
- Setup docs explain secrets, variables, and first issue flow.

Planner origin: roadmap-planner

Resolved public-agent context:
```json
{
  "target": {
    "kind": "issue",
    "issue": 12,
    "pull_request": null,
    "branch": "agent/issue-12",
    "can_develop": true
  },
  "issue": {
    "body": "Roadmap item: `self-hosted-fleet`\nPhase: 9\nPriority: medium\nProof gate: `scaffold-install-smoke`\n\nAcceptance criteria:\n- A new repo can be scaffolded from the template and run checks.\n- Setup docs explain secrets, variables, and first issue flow.\n\nPlanner origin: roadmap-planner",
    "comments": [
      {
        "author": {
          "login": "github-actions"
        },
        "authorAssociation": "CONTRIBUTOR",
        "body": "/agent develop\n\nPM reason: The issue has clear acceptance criteria for development without ambiguity or risk.",
        "createdAt": "2026-06-17T14:13:50Z",
        "id": "IC_kwDOS8izs88AAAABGgE_1w",
        "includesCreatedEdit": false,
        "isMinimized": false,
        "minimizedReason": "",
        "reactionGroups": [],
        "url": "https://github.com/volter-ai/open-autonomy/issues/12#issuecomment-4731256791",
        "viewerDidAuthor": true
      }
    ],
    "labels": [
      {
        "color": "0E8A16",
        "description": "Issue created or managed by the Open Autonomy planner",
        "id": "LA_kwDOS8izs88AAAACnxBoZA",
        "name": "origin:roadmap-planner"
      },
      {
        "color": "FBCA04",
        "description": "Roadmap priority",
        "id": "LA_kwDOS8izs88AAAACnxBpFA",
        "name": "priority:medium"
      },
      {
        "color": "5319E7",
        "description": "Open Autonomy planner label",
        "id": "LA_kwDOS8izs88AAAACnxBr4w",
        "name": "proof:scaffold-install-smoke"
      },
      {
        "color": "1D76DB",
        "description": "Open Autonomy planner label",
        "id": "LA_kwDOS8izs88AAAACnxBung",
        "name": "roadmap:phase-9"
      }
    ],
    "number": 12,
    "title": "[roadmap:self-hosted-fleet] Self-Hosted Repository Fleet",
    "user": {
      "login": "app/github-actions"
    }
  },
  "recent_issue_comments": [
    {
      "id": "IC_kwDOS8izs88AAAABGgE_1w",
      "author": {
        "login": "github-actions"
      },
      "authorAssociation": "CONTRIBUTOR",
      "body": "/agent develop\n\nPM reason: The issue has clear acceptance criteria for development without ambiguity or risk.",
      "createdAt": "2026-06-17T14:13:50Z",
      "includesCreatedEdit": false,
      "isMinimized": false,
      "minimizedReason": "",
      "reactionGroups": [],
      "url": "https://github.com/volter-ai/open-autonomy/issues/12#issuecomment-4731256791",
      "viewerDidAuthor": true
    }
  ],
  "previous_decisions": [],
  "control_files": {
    "standards": {
      "code": "# Code Standards\n\n- Prefer existing Bun and TypeScript helpers over new dependencies.\n- Keep scripts deterministic and CLI-testable.\n- Validate structured inputs and write structured outputs.\n- Do not hide failed decisions behind successful exits unless a later step makes\n  the state visible.\n",
      "docs": "# Documentation Standards\n\n- `docs/ARCHITECTURE.md` explains the whole system.\n- `docs/ROADMAP.md` is the only canonical roadmap.\n- Example repositories may include local matrices and test runs, but they should\n  link back to the root roadmap instead of copying it.\n- Operator docs must describe commands, evidence, and rollback paths.\n",
      "security": "# Security Standards\n\n- Never print secrets, bearer tokens, model proxy tokens, or private keys.\n- Treat workflow, auth, deployment, dependency trust, and secret-handling changes\n  as human-required unless explicitly approved by maintainers.\n- Publisher policy owns write safety. Reviewer risk judgment is additive and\n  cannot override deterministic publisher rejection.\n",
      "tests": "# Test Standards\n\n- Unit-test deterministic policy, dispatcher, publisher, reviewer, merge, and\n  planner decisions.\n- Use the testbed for live GitHub workflow proof.\n- Use deterministic proof fixtures when model budget would obscure a gate.\n- Record testbed evidence in local test-run docs.\n"
    },
    "sources": [
      "AGENTS.md",
      ".open-autonomy/constitution.md",
      ".open-autonomy/policy.yml",
      ".open-autonomy/roadmap.yml",
      ".open-autonomy/review-rubric.yml",
      ".open-autonomy/standards/code.md",
      ".open-autonomy/standards/docs.md",
      ".open-autonomy/standards/security.md",
      ".open-autonomy/standards/tests.md"
    ],
    "agents": "# Agent Guidance\n\nOpen Autonomy maintains this repository through issues, bounded agent runs,\nreview gates, and committed evidence. Agents working here must preserve the\npublic OSS contract: small scoped changes, deterministic safety checks, visible\nstatus, and reversible maintainer control.\n\nRead these files before changing behavior:\n\n- `docs/ARCHITECTURE.md` for the system model and document map.\n- `docs/ROADMAP.md` for current direction and proof gates.\n- `.open-autonomy/constitution.md` for non-negotiable operating principles.\n- `.open-autonomy/policy.yml` for machine-readable autonomy limits.\n- `.open-autonomy/review-rubric.yml` for review criteria.\n- `.open-autonomy/standards/*.md` for code, docs, tests, and security rules.\n\nDefault to the existing TypeScript/Bun workflow and GitHub Actions patterns.\nDo not introduce unrelated frameworks, hidden state, or silent no-op behavior.\n",
    "constitution": "# Open Autonomy Constitution\n\n1. User and maintainer intent is authoritative. Autonomous work must stay within\n   the issue, roadmap, policy, and explicit maintainer comments.\n2. Every meaningful autonomous decision must be visible through comments,\n   artifacts, committed decisions, or status reconstruction.\n3. The developer may propose code; deterministic publisher, CI, reviewer, and\n   merge gates decide whether it can progress.\n4. Risky changes require human attention. Workflow, auth, secrets, billing,\n   deployment, dependency trust, and broad rewrites are never silently merged.\n5. Retry loops are bounded by stable failure signatures and attempt budgets.\n6. The system must be portable OSS. A new repository should be able to install\n   the template, configure secrets/variables, seed issues, and run itself.\n7. Testbed proof is part of done. Roadmap items are complete only when their\n   stated testbed evidence exists or a deterministic fixture proves the same\n   gate without model spend.\n",
    "policy": "schema: open-autonomy.policy.v1\nautonomy:\n  default_mode: develop-review-merge\n  max_open_agent_prs: 5\n  max_develop_attempts: 2\n  max_ci_retries: 2\n  max_review_retries: 2\n  stale_needs_info_minutes: 10080\n  require_visible_pm_status: true\n  require_decision_records: true\n  require_testbed_proof: true\nrisk:\n  human_required_paths:\n    - \".github/workflows/**\"\n    - \".open-autonomy/policy.yml\"\n    - \".open-autonomy/constitution.md\"\n    - \"services/**/wrangler.toml\"\n  human_required_topics:\n    - auth\n    - secrets\n    - billing\n    - deployment\n    - destructive data migration\n    - dependency trust\nmerge:\n  require_ci: true\n  require_low_risk_review: true\n  require_current_head_sha: true\n  maintainer_block_labels:\n    - do-not-merge\n    - human-required\n    - agent-blocked\nplanner:\n  enabled: true\n  issue_origin_label_prefix: \"origin:\"\n  phase_label_prefix: \"roadmap:\"\n  priority_labels:\n    high: \"priority:high\"\n    medium: \"priority:medium\"\n    low: \"priority:low\"\n",
    "roadmap": "schema: open-autonomy.roadmap.v1\ndirection: Build an OSS self-driving repository template that can maintain itself\n  and install the same autonomy loop into other repositories.\nitems:\n  - id: durable-decision-memory\n    phase: 1\n    priority: high\n    status: active\n    title: Durable Decision Memory\n    proof_gate: decision-memory-smoke\n    acceptance:\n      - Build a durable index from committed decision records.\n      - Reconstruct issue, PR, retry, and merge state from the index.\n  - id: unified-loop-budget\n    phase: 2\n    priority: high\n    status: active\n    title: Unified Loop Budget And Stop Conditions\n    proof_gate: retry-ci-failure\n    acceptance:\n      - Use the same retry budget rules in direct and post-publish review paths.\n      - Stop repeated CI and reviewer failures with visible comments.\n  - id: pm-proactive-backlog\n    phase: 3\n    priority: high\n    status: active\n    title: PM Operations And Backlog Policy\n    proof_gate: pm-open-pr-review\n    acceptance:\n      - PM comments visible status for waits, ignores, and blocked states.\n      - PM routes existing agent PRs to review instead of starting duplicate work.\n  - id: developer-context-quality\n    phase: 4\n    priority: medium\n    status: planned\n    title: Developer Context And Patch Quality\n    proof_gate: developer-context-review-fix\n    acceptance:\n      - Developer context includes issue comments, current PR, decisions, and control files.\n      - Reviewer-requested retries receive the actual review findings.\n  - id: review-merge-parity\n    phase: 5\n    priority: high\n    status: active\n    title: Review And Merge Gate Parity\n    proof_gate: head-changed-before-merge\n    acceptance:\n      - Direct review uses the same CI/review retry budget as post-publish review.\n      - Merge gate refuses changed heads after review.\n  - id: operator-observability\n    phase: 6\n    priority: medium\n    status: active\n    title: Observability And Operator Controls\n    proof_gate: operator-pause-resume\n    acceptance:\n      - Pause, resume, retry, cancel, and status commands are visible and reversible.\n      - Run artifacts contain compact evidence for each gate.\n  - id: production-rollout\n    phase: 7\n    priority: medium\n    status: active\n    title: Production Rollout\n    proof_gate: five-issue-dogfood\n    acceptance:\n      - The canonical repo can run a low-risk issue through PM, develop, review, and merge.\n      - CI remains green after autonomous changes.\n  - id: direction-control-files\n    phase: 8\n    priority: high\n    status: active\n    title: Direction, Constitution, And Planning Loop\n    proof_gate: planner-creates-proof-gate-issues\n    acceptance:\n      - Planner reads this file and opens or updates missing proof-gate issues.\n      - Developer and reviewer prompts include control-file context.\n  - id: self-hosted-fleet\n    phase: 9\n    priority: medium\n    status: planned\n    title: Self-Hosted Repository Fleet\n    proof_gate: scaffold-install-smoke\n    acceptance:\n      - A new repo can be scaffolded from the template and run checks.\n      - Setup docs explain secrets, variables, and first issue flow.\n  - id: durable-state-index\n    phase: 10\n    priority: medium\n    status: planned\n    title: Durable State And Audit Trail\n    proof_gate: status-reconstruction\n    acceptance:\n      - Decision index summarizes latest state by issue and PR.\n      - Status commands can use reconstructed state.\n  - id: repair-loops\n    phase: 11\n    priority: medium\n    status: planned\n    title: Agent Quality And Repair Loops\n    proof_gate: quality-review-repair\n    acceptance:\n      - Failed review and CI findings feed the next developer attempt.\n      - Repeated failures stop with stable signatures.\n  - id: maintainer-governance\n    phase: 12\n    priority: medium\n    status: planned\n    title: Maintainer Governance\n    proof_gate: governance-maintainer-hold\n    acceptance:\n      - Maintainer holds stop merge even when CI and review pass.\n      - Repo mode can be paused or constrained without code changes.\n  - id: public-oss-readiness\n    phase: 13\n    priority: medium\n    status: planned\n    title: Public OSS Readiness\n    proof_gate: release-dogfood\n    acceptance:\n      - Cookbook examples are pushable repos with local docs and root roadmap links.\n      - Release evidence is reproducible from committed artifacts.\n",
    "review_rubric": "schema: open-autonomy.review-rubric.v1\ncriteria:\n  - id: scope\n    title: Scope control\n    pass: Change matches the issue, roadmap item, and maintainer comments.\n    fail: Change includes unrelated refactors, hidden behavior, or broad rewrites.\n  - id: safety\n    title: Safety and policy\n    pass: Risky paths/topics are absent or clearly escalated.\n    fail: Workflow, auth, secret, billing, deployment, or trust changes lack human review.\n  - id: tests\n    title: Verification\n    pass: Tests or deterministic fixtures cover the changed behavior.\n    fail: User-facing or gate behavior changes without relevant verification.\n  - id: evidence\n    title: Evidence quality\n    pass: Decisions, comments, and artifacts explain what happened and why.\n    fail: The agent silently skips, retries indefinitely, or leaves ambiguous status.\n  - id: portability\n    title: OSS portability\n    pass: Behavior works in a newly scaffolded repository with documented setup.\n    fail: Behavior depends on private Volter-only code or uncommitted local state.\nverdicts:\n  pass_low:\n    requires:\n      - all applicable criteria pass\n      - CI passes\n      - no human-required policy trigger\n  develop_retry:\n    use_when: A focused fix can resolve a review finding without maintainer input.\n  human_required:\n    use_when: Risk is high, policy says so, or intent is ambiguous.\n"
  },
  "current_pr": null,
  "context_sources": [
    "target",
    "issue",
    "issue_comments",
    "control_files"
  ]
}

```

Execution constraints:
- Use only the repository checkout and environment provided to this job.
- Do not read, print, or persist secrets.
- Prefer focused checks over broad, slow commands.
- Leave GitHub workflow/security-sensitive changes alone unless the issue explicitly asks for them.

Before finishing, write these files:
- /home/runner/work/open-autonomy/open-autonomy/.agent-run/out/task/artifacts/pr.md with a PR-ready summary and tests run.
- /home/runner/work/open-autonomy/open-autonomy/.agent-run/out/task/artifacts/result.json with JSON fields: ok, issue, summary, tests.
- /home/runner/work/open-autonomy/open-autonomy/.agent-run/out/task/artifacts/transcript.md with concise notes about what you changed and verified.

If you cannot complete the requested change, write blocked.md in the artifacts directory explaining exactly what is missing.
warning: Codex could not find bubblewrap on PATH. Install bubblewrap with your OS package manager. See the sandbox prerequisites: https://developers.openai.com/codex/concepts/sandboxing#prerequisites. Codex will use the bundled bubblewrap in the meantime.
codex
I’m checking the repository guidance and the roadmap/docs first so the change stays within the issue scope and matches the template/setup expectations. After that I’ll make a small documentation update and verify it with a focused check.
exec
/bin/bash -lc "pwd && rg --files -g 'docs/ARCHITECTURE.md' -g 'docs/ROADMAP.md' -g '.open-autonomy/constitution.md' -g '.open-autonomy/policy.yml' -g '.open-autonomy/review-rubric.yml' -g '.open-autonomy/standards/*.md'" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
/home/runner/work/open-autonomy/open-autonomy
docs/ROADMAP.md
docs/ARCHITECTURE.md

exec
/bin/bash -lc "rg --files | sed -n '1,200p'" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
examples/testbed/package.json
examples/testbed/VERSION
examples/testbed/AGENTS.md
examples/testbed/CHANGELOG.md
examples/testbed/bun.lock
examples/testbed/docs/PROOF_LEDGER.md
examples/testbed/docs/ROADMAP.md
examples/testbed/docs/TEST_RUNS.md
examples/testbed/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
examples/testbed/docs/TEST_MATRIX.md
examples/testbed/docs/OSS_AGENT_RUNBOOK.md
examples/testbed/docs/ARCHITECTURE.md
examples/testbed/docs/ISSUE_SCENARIOS.md
examples/testbed/docs/PUBLIC_AGENT_ACTIONS.md
examples/testbed/docs/RELEASE.md
examples/testbed/docs/PROJECT.md
examples/testbed/README.md
examples/testbed/scripts/scaffold-target-repo.ts
examples/testbed/scripts/public-agent-decision-index.ts
examples/testbed/scripts/public-agent-production.test.ts
examples/testbed/scripts/open-autonomy-governance-report.ts
examples/testbed/scripts/open-autonomy-upgrade.test.ts
examples/testbed/scripts/public-agent-loop-budget.ts
examples/testbed/scripts/public-agent-planner.test.ts
examples/testbed/scripts/public-agent-control.test.ts
examples/testbed/scripts/public-agent-triage.test.ts
examples/testbed/scripts/public-agent-merge-gate.ts
examples/testbed/scripts/public-agent-decision.ts
examples/testbed/scripts/public-agent-context.ts
examples/testbed/scripts/public-agent-command.ts
examples/testbed/scripts/public-agent-review.ts
examples/testbed/scripts/github-agent-session.test.ts
examples/testbed/scripts/public-agent-triage.ts
examples/testbed/scripts/public-agent-dispatcher.ts
examples/testbed/scripts/open-autonomy-proof-audit.test.ts
examples/testbed/scripts/model-proxy-exchange.ts
examples/testbed/scripts/public-agent-pm.ts
examples/testbed/scripts/github-agent-session.ts
examples/testbed/scripts/public-agent-control.ts
examples/testbed/scripts/public-agent-ci.ts
examples/testbed/scripts/open-autonomy-upgrade.ts
examples/testbed/scripts/github-agent-publish.ts
examples/testbed/scripts/public-agent-control-files.ts
examples/testbed/scripts/codex-agent-run.ts
examples/testbed/scripts/public-agent-planner.ts
examples/testbed/scripts/public-agent-target.ts
examples/testbed/scripts/open-autonomy-fleet.test.ts
examples/testbed/scripts/public-agent-bundle.ts
examples/testbed/scripts/github-agent-publish.test.ts
examples/testbed/scripts/testbed-seed-issues.ts
examples/testbed/scripts/public-agent-decision.test.ts
examples/testbed/scripts/model-proxy-mint.ts
examples/testbed/scripts/open-autonomy-preflight.ts
examples/testbed/scripts/public-agent-policy.ts
examples/testbed/scripts/open-autonomy-proof-audit.ts
examples/library/package.json
examples/library/VERSION
examples/library/AGENTS.md
examples/library/CHANGELOG.md
examples/library/bun.lock
examples/library/src/index.test.ts
examples/library/src/index.ts
examples/library/docs/PROOF_LEDGER.md
examples/library/docs/ROADMAP.md
examples/library/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
examples/library/docs/OSS_AGENT_RUNBOOK.md
examples/library/docs/ARCHITECTURE.md
examples/library/docs/PUBLIC_AGENT_ACTIONS.md
examples/library/docs/RELEASE.md
examples/library/docs/PROJECT.md
examples/library/README.md
examples/library/scripts/scaffold-target-repo.ts
examples/library/scripts/public-agent-decision-index.ts
examples/library/scripts/public-agent-production.test.ts
examples/library/scripts/open-autonomy-governance-report.ts
examples/library/scripts/open-autonomy-upgrade.test.ts
examples/library/scripts/public-agent-loop-budget.ts
examples/library/scripts/public-agent-planner.test.ts
examples/library/scripts/public-agent-control.test.ts
examples/library/scripts/public-agent-triage.test.ts
examples/library/scripts/public-agent-merge-gate.ts
examples/library/scripts/public-agent-decision.ts
examples/library/scripts/public-agent-context.ts
examples/library/scripts/public-agent-command.ts
examples/library/scripts/public-agent-review.ts
examples/library/scripts/github-agent-session.test.ts
examples/library/scripts/public-agent-triage.ts
examples/library/scripts/public-agent-dispatcher.ts
examples/library/scripts/open-autonomy-proof-audit.test.ts
examples/library/scripts/model-proxy-exchange.ts
examples/library/scripts/public-agent-pm.ts
examples/library/scripts/github-agent-session.ts
examples/library/scripts/public-agent-control.ts
examples/library/scripts/public-agent-ci.ts
examples/library/scripts/open-autonomy-upgrade.ts
examples/library/scripts/github-agent-publish.ts
examples/library/scripts/public-agent-control-files.ts
examples/library/scripts/codex-agent-run.ts
examples/library/scripts/public-agent-planner.ts
examples/library/scripts/public-agent-target.ts
examples/library/scripts/open-autonomy-fleet.test.ts
examples/library/scripts/public-agent-bundle.ts
examples/library/scripts/github-agent-publish.test.ts
examples/library/scripts/public-agent-decision.test.ts
examples/library/scripts/model-proxy-mint.ts
examples/library/scripts/open-autonomy-preflight.ts
examples/library/scripts/public-agent-policy.ts
examples/library/scripts/open-autonomy-proof-audit.ts
examples/small-app/package.json
examples/small-app/VERSION
examples/small-app/AGENTS.md
examples/small-app/CHANGELOG.md
examples/small-app/bun.lock
examples/small-app/src/app.ts
examples/small-app/src/app.test.ts
examples/small-app/src/server.ts
examples/small-app/docs/PROOF_LEDGER.md
examples/small-app/docs/ROADMAP.md
examples/small-app/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
examples/small-app/docs/OSS_AGENT_RUNBOOK.md
examples/small-app/docs/ARCHITECTURE.md
examples/small-app/docs/PUBLIC_AGENT_ACTIONS.md
examples/small-app/docs/RELEASE.md
examples/small-app/docs/PROJECT.md
examples/small-app/README.md
examples/small-app/scripts/scaffold-target-repo.ts
examples/small-app/scripts/public-agent-decision-index.ts
examples/small-app/scripts/public-agent-production.test.ts
examples/small-app/scripts/open-autonomy-governance-report.ts
examples/small-app/scripts/open-autonomy-upgrade.test.ts
examples/small-app/scripts/public-agent-loop-budget.ts
examples/small-app/scripts/public-agent-planner.test.ts
examples/small-app/scripts/public-agent-control.test.ts
examples/small-app/scripts/public-agent-triage.test.ts
examples/small-app/scripts/public-agent-merge-gate.ts
examples/small-app/scripts/public-agent-decision.ts
examples/small-app/scripts/public-agent-context.ts
examples/small-app/scripts/public-agent-command.ts
examples/small-app/scripts/public-agent-review.ts
examples/small-app/scripts/github-agent-session.test.ts
examples/small-app/scripts/public-agent-triage.ts
examples/small-app/scripts/public-agent-dispatcher.ts
examples/small-app/scripts/open-autonomy-proof-audit.test.ts
examples/small-app/scripts/model-proxy-exchange.ts
examples/small-app/scripts/public-agent-pm.ts
examples/small-app/scripts/github-agent-session.ts
examples/small-app/scripts/public-agent-control.ts
examples/small-app/scripts/public-agent-ci.ts
examples/small-app/scripts/open-autonomy-upgrade.ts
examples/small-app/scripts/github-agent-publish.ts
examples/small-app/scripts/public-agent-control-files.ts
examples/small-app/scripts/codex-agent-run.ts
examples/small-app/scripts/public-agent-planner.ts
examples/small-app/scripts/public-agent-target.ts
examples/small-app/scripts/open-autonomy-fleet.test.ts
examples/small-app/scripts/public-agent-bundle.ts
examples/small-app/scripts/github-agent-publish.test.ts
examples/small-app/scripts/public-agent-decision.test.ts
examples/small-app/scripts/model-proxy-mint.ts
examples/small-app/scripts/open-autonomy-preflight.ts
examples/small-app/scripts/public-agent-policy.ts
examples/small-app/scripts/open-autonomy-proof-audit.ts
examples/docs-only/package.json
examples/docs-only/VERSION
examples/docs-only/AGENTS.md
examples/docs-only/CHANGELOG.md
examples/docs-only/bun.lock
examples/docs-only/docs/PROOF_LEDGER.md
examples/docs-only/docs/ROADMAP.md
examples/docs-only/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
examples/docs-only/docs/OSS_AGENT_RUNBOOK.md
examples/docs-only/docs/ARCHITECTURE.md
examples/docs-only/docs/PUBLIC_AGENT_ACTIONS.md
examples/docs-only/docs/RELEASE.md
examples/docs-only/docs/PROJECT.md
examples/docs-only/README.md
examples/docs-only/scripts/scaffold-target-repo.ts
examples/docs-only/scripts/public-agent-decision-index.ts
examples/docs-only/scripts/public-agent-production.test.ts
examples/docs-only/scripts/open-autonomy-governance-report.ts
examples/docs-only/scripts/open-autonomy-upgrade.test.ts
examples/docs-only/scripts/public-agent-loop-budget.ts
examples/docs-only/scripts/public-agent-planner.test.ts
examples/docs-only/scripts/public-agent-control.test.ts
examples/docs-only/scripts/public-agent-triage.test.ts
examples/docs-only/scripts/public-agent-merge-gate.ts
examples/docs-only/scripts/public-agent-decision.ts
examples/docs-only/scripts/public-agent-context.ts
examples/docs-only/scripts/public-agent-command.ts
examples/docs-only/scripts/public-agent-review.ts
examples/docs-only/scripts/github-agent-session.test.ts
examples/docs-only/scripts/public-agent-triage.ts
examples/docs-only/scripts/public-agent-dispatcher.ts
examples/docs-only/scripts/open-autonomy-proof-audit.test.ts
examples/docs-only/scripts/model-proxy-exchange.ts
examples/docs-only/scripts/public-agent-pm.ts
examples/docs-only/scripts/github-agent-session.ts
examples/docs-only/scripts/public-agent-control.ts
examples/docs-only/scripts/public-agent-ci.ts
examples/docs-only/scripts/open-autonomy-upgrade.ts

codex
I’ve confirmed the repo already has example scaffold targets and a fleet proof test, so I’m reading the canonical roadmap and the example setup docs to find the smallest doc gap that directly satisfies this issue.
exec
/bin/bash -lc "sed -n '1,220p' docs/ARCHITECTURE.md" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
# open-autonomy Architecture

`open-autonomy` makes a GitHub repository operate through visible issues,
bounded agent runs, deterministic write gates, reviewer checks, and maintainer
controls. The repository remains the source of truth: issues define executable
work, PRs carry proposed changes, committed/session evidence explains what
happened, and policy gates decide what automation may do.

## System Shape

```text
roadmap + repo standards + issues
  -> planner/PM triage
  -> visible /agent command
  -> trusted setup + target/policy/triage checks
  -> untrusted developer agent in GitHub Actions
  -> trusted publisher validates bundle and opens/updates PR
  -> CI + reviewer
  -> deterministic merge gate
  -> merge, retry, wait, or human-required escalation
```

The model can propose work. Deterministic code decides whether that work can be
published, retried, merged, or escalated.

## Repositories

- `open-autonomy`: canonical OSS implementation and first dogfooding target.
- `templates/self-driving-repo`: copyable starter for another self-driving repo.
- `examples/docs-only`: minimal cookbook repo.
- `examples/testbed`: disposable cookbook/test fixture.
- `open-autonomy-testbed`: live external repo used to prove behavior on GitHub.

Future target repositories should install the workflows/scripts/template, then
keep repo-specific direction and policy in their own committed files.

## Agent Roles

| Role | Purpose | Main inputs | Main output |
| --- | --- | --- | --- |
| Planner | Turns roadmap direction into issues | roadmap, issue/PR state, decision history | created/updated/prioritized issues |
| PM/Triage | Decides what should happen to an issue now | issue, labels, comments, open PRs, active runs, policy | visible comment, labels, dispatch decision |
| Developer | Produces a bounded patch proposal | issue, acceptance criteria, repo guidance, prior decisions | publisher bundle |
| Publisher | Applies only policy-valid bundles | bundle, manifest, patch, policy | PR or rejected publish decision |
| Reviewer | Judges PR quality and risk | PR diff, CI, issue, rubric, standards, policy | structured review decision |
| Merge Gate | Makes final deterministic merge decision | publisher, CI, review, PR head SHA, blockers, retry budget | merge/retry/wait/human-required |
| Operator | Lets maintainers control the system | issue comments, labels, run/proxy state | pause/resume/status/cancel/retry effects |

Planner is directional. PM is operational. Developer and reviewer use model
judgment. Publisher and merge gate are deterministic enforcement points.

## Trust Boundaries

- The developer agent runs as an untrusted job with read-only repository access.
- Raw provider API keys are never passed to the agent job.
- The agent receives a bounded model token through the model proxy.
- The agent emits a bundle; it does not push to the repository.
- The trusted publisher validates the bundle before writing a branch or PR.
- The merge gate only merges when current CI, current review, current PR head,
  policy, and maintainer blockers all agree.

This split is the core safety model. Prose instructions guide agents; policy and
workflow code enforce limits.

## Documentation Map

| Document | Scope | Used by |
| --- | --- | --- |
| `README.md` | Product overview and quickstart | humans |
| `docs/ARCHITECTURE.md` | Master map of the system | humans, agents needing orientation |
| `docs/PUBLIC_AGENT_ACTIONS.md` | Detailed workflow/trust model and command architecture | maintainers, implementers |
| `docs/OSS_AGENT_RUNBOOK.md` | Local checks, live smoke tests, operator commands | maintainers/operators |
| `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md` | Enablement checklist for a target repo | maintainers |
| `docs/ROADMAP.md` | Continuous roadmap, proof gates, and expanded product direction | planner/maintainers |
| `examples/testbed/docs/TEST_MATRIX.md` | Live scenario catalog | testbed operators |
| `examples/testbed/docs/TEST_RUNS.md` | Live proof ledger | testbed operators, roadmap audit |

`docs/ROADMAP.md` is the only canonical roadmap. The roadmap should explain
direction; issues should execute work; runbooks should explain operation;
decision records should prove what happened.

## Target Repo Control Files

The clean target shape is:

```text
AGENTS.md
.open-autonomy/
  constitution.md
  policy.yml
  roadmap.yml
  review-rubric.yml
  standards/
    code.md
    docs.md
    tests.md
    security.md
docs/
  ROADMAP.md
  COMMANDS.md
  OPERATIONS.md
  SECURITY.md
  TEST_MATRIX.md
  TEST_RUNS.md
```

- `AGENTS.md`: short always-loaded guidance shared across coding agents.
- `constitution.md`: non-negotiable principles and product standards.
- `policy.yml`: machine-readable hard limits for paths, budgets, retries, and
  autonomy levels.
- `roadmap.yml`: planner-readable direction, priorities, dependencies, and proof
  gates.
- `review-rubric.yml`: structured reviewer criteria.
- `standards/*`: scoped implementation guidance.

The current repo is still converging toward this shape. Until those structured
files exist, `docs/ROADMAP.md`, the runbook, and action docs remain the
canonical source.

## Evidence And State

Each autonomous path should leave visible evidence:

- issue comments and labels for user-visible state
- workflow artifacts for raw run output
- `agent-sessions/run_*/` for promoted session evidence
- `decisions/*` records for target, triage, develop, publish, CI, review, retry,
  merge-gate, and close decisions
- PR comments/body for reviewable human context

The durable end state should be a queryable decision index. Until then, the
session folders, decision records, issue/PR comments, and testbed ledger are the
audit trail.

## Operating Rules

- Work starts from issues, PR comments, or explicit maintainer commands.
- PM and planner actions must be visible; silent skips are only acceptable when
  a current visible status already exists.
- Risky, unclear, blocked, or repeatedly failing work escalates to humans.
- Publisher policy handles write safety; reviewer handles product/code quality;
  merge gate handles final merge safety.
- Live proof in the testbed is required before claiming roadmap completion.

exec
/bin/bash -lc "sed -n '1,240p' docs/ROADMAP.md" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
# open-autonomy Roadmap

This is the roadmap for turning the public agent workflow into a self-building
OSS project. The current system can turn a trusted trigger into a bounded agent
run and a policy-gated PR. The next system should develop, review, and merge
safe changes autonomously, escalating only when risk or ambiguity requires a
maintainer.

This is the single continuous roadmap for the canonical repo. Short plans,
proof-gate notes, and expanded product direction should be folded into this
file instead of creating parallel roadmap documents.

Core rule:

```text
Agents make judgments and artifacts. Deterministic gates grant authority.
```

## Target Loop

```text
issue/comment/PR comment
  -> PM agent triage
  -> deterministic dispatcher
  -> developer agent creates or updates PR
  -> deterministic publisher validates and pushes
  -> CI
  -> reviewer agent emits structured verdict
  -> deterministic merge gate merges, retries develop, or escalates
```

Human review is the exception path. The system should ask for a human only when
it can clearly explain why the change is risky, ambiguous, blocked, or outside
policy.

## Agents

### PM Agent

Purpose: operate the public backlog.

Capabilities:

- read issues, labels, comments, and related PRs
- comment on issues
- emit structured triage decisions
- surface urgent maintainer issues

No code-writing capability.

Responsibilities:

- classify issues: bug, docs, feature, question, duplicate, spam, security
- ask clarifying questions
- detect duplicates
- identify missing reproduction or acceptance criteria
- mark issues ready or blocked
- flag suspicious/security-sensitive input for maintainers
- recommend `develop`, `review`, `needs-info`, `duplicate`, or `human_required`

The PM agent operates through visible command comments. For reliability, the PM
workflow mirrors those comments into `workflow_dispatch`; the comment is the
auditable intent, and the dispatch is the transport.

Implemented first pass:

- scheduled/manual `Public Agent PM` workflow
- bounded `pm` model token purpose
- strict PM JSON parser
- deterministic dispatcher for `develop`, `needs_info`, duplicate, spam,
  human-required, wont-fix, and ignore recommendations
- PM context includes labels, comments, open canonical agent PR, and recent
  issue-addressed public-agent workflow runs
- PM starts agents by writing command comments such as `/agent develop` on the
  issue or `/agent review` on the open agent PR
- PM workflow then directly dispatches the matching workflow as a reliable
  transport for that visible command comment

Target capabilities not yet granted:

- add/remove a constrained set of labels
- close obvious duplicates/spam after explicit maintainer policy exists

### Developer Agent

Purpose: implement requested work.

Capabilities:

- read-only GitHub token
- workspace write inside the runner
- bounded model token from model proxy
- no repo write token
- no model provider keys
- no admin token

Responsibilities:

- create or update the canonical agent branch for an issue
- use issue, PR, comment, CI, and prior decision context
- run focused checks
- emit a publisher bundle with patch, manifest, artifacts, and transcript

The developer agent never publishes directly. The publisher applies only
mechanically safe `pr-ready` bundles.

### Reviewer Agent

Purpose: decide whether a PR is low-risk, needs more development, or needs a
human.

Capabilities:

- read-only repository/PR/CI context
- issue/PR comment permission for review output
- bounded model token
- no patch publishing
- no merge permission

Responsibilities:

- review diff, changed files, CI, tests run, comments, and prior decisions
- classify merge risk
- identify missing tests, risky behavior, security concerns, API changes,
  dependency/build changes, or unclear product choices
- emit strict JSON verdict plus a concise public comment

The reviewer agent may mark broad non-workflow code changes as low-risk. Path
alone is not the policy; actual risk is the policy.

## Deterministic Gates

### Dispatcher

Purpose: convert PM/reviewer command intent into allowed workflow starts.

Checks:

- budget and rate limits
- active run limits
- duplicate active PR/run detection
- actor/repo/issue cooldowns
- loop limits
- blocking labels
- whether the requested verb is allowed from this context

The dispatcher is not the product brain. It should be boring transport and
policy enforcement.

Currently implemented:

- render the PM's selected command into a public comment
- dispatch the matching workflow reliably
- refuse malformed or impossible review targets

Target behavior:

- render the PM's selected command into a public comment
- dispatch the matching workflow reliably
- enforce budgets, run limits, loop limits, and blocking labels
- refuse malformed or impossible commands
- record why a command was allowed or denied

### Publisher

Purpose: apply developer output only if mechanically safe.

Already implemented:

- requires `manifest.status === "pr-ready"`
- binds manifest run/repo/issue/actor to workflow context
- rejects path traversal and absolute paths
- rejects workflow edits
- rejects `.git` and `.gitmodules`
- rejects symlinks
- rejects binary patches
- rejects mode changes
- rejects file deletions
- enforces artifact count, per-file size, total size, extension, and regular
  file constraints
- rejects secret-looking strings as a backup check
- applies broad non-workflow repo changes by default

Publisher does not decide product risk. Reviewer and merge gate do.

### Merge Gate

Purpose: merge or escalate deterministically.

Auto-merge only if all are true:

- PR branch is the expected `agent/issue-N`
- publisher passed for the current PR head
- reviewer verdict is `pass`
- reviewer says `risk: "low"`
- reviewer says `human_required: false`
- required CI checks passed for the current PR head
- no maintainer-blocking label or comment exists
- loop/attempt/budget limits are within policy
- branch protection allows merge

Do not auto-merge if:

- reviewer is risky, uncertain, or blocked
- CI is missing, stale, or repeatedly failing
- a maintainer has applied a blocking label
- there is an unresolved maintainer request
- the PR branch is unexpected
- repeated develop/review loops hit stop conditions

The merge gate writes a structured decision record before merging or
escalating.

### Model Proxy

Purpose: bound model access.

Already implemented:

- admin mint/revoke
- bounded per-run tokens
- GitHub OIDC exchange for runner tokens
- run/repo/actor/workflow binding
- run id/run attempt binding when present
- per-run request and spend caps
- repo/actor/issue/global active and daily limits
- provider request metering
- `review` token purpose is distinct from `agent`
- `pm` token purpose is distinct from `agent`
- GitHub OIDC exchange only works for `agent` purpose runs

## Public Commands

Use two public verbs:

- `/agent develop`
- `/agent review`

Compatibility aliases may remain during migration:


exec
/bin/bash -lc "sed -n '1,240p' examples/small-app/docs/OSS_AGENT_RUNBOOK.md" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
# open-autonomy Runbook

This is the source-checkout path for the issue-driven self-building agent. The
full GitHub Actions and model-proxy architecture is in
[`PUBLIC_AGENT_ACTIONS.md`](./PUBLIC_AGENT_ACTIONS.md).

## Local Checks

```bash
bun install
bun run check:public-agent
bun run check:agent-proxy
bun run check
```

`check:public-agent` runs the script unit tests and TypeScript checks for the
GitHub agent loop. `check:agent-proxy` validates the Cloudflare Worker model
proxy. `check` runs both.

## Manual Session Wrapper Smoke

Create an issue payload:

```bash
cat > /tmp/volter-issue.json <<'JSON'
{
  "number": 101,
  "title": "Add a verified public-agent artifact",
  "body": "Simulate an issue-triggered public agent session without real secrets."
}
JSON
```

Run the session wrapper with a simple local command:

```bash
bun scripts/github-agent-session.ts \
  --issue /tmp/volter-issue.json \
  --run-id run_local_101 \
  --out /tmp/public-agent-101 \
  --repo volter-ai/open-autonomy \
  --actor local \
  -- \
  node -e 'const fs=require("node:fs"),p=require("node:path"); const d=process.env.OSS_AGENT_TASK_DIR; fs.mkdirSync(p.join(d,"artifacts"),{recursive:true}); fs.writeFileSync(p.join(d,"artifacts","result.json"),"{\"ok\":true}\\n"); fs.writeFileSync(p.join(d,"artifacts","pr.md"),"# PR\\n")'
```

Inspect:

```bash
cat /tmp/public-agent-101/bundle/manifest.json
ls /tmp/public-agent-101/bundle/artifacts
```

Merged develop session bundles now include target, triage, develop, publish, CI, review, and merge-gate decision records, so operators should review the full chain when checking evidence.
Merged session evidence includes a `run-receipt.json` file and a root `transcript.md` file.
The workflow waits for GitHub to report the evidence commit as the PR head before SHA-bound auto-merge.
When bounded developer context is provided, developer bundles also include `context-sources.json`.

The agent command receives:

- `OSS_AGENT_TASK_DIR` — writable task directory
- `OSS_AGENT_ISSUE_PATH` — copied issue JSON

The command must write one terminal artifact in `artifacts/`:

- `result.json` for a successful machine-readable result
- `pr.md` for PR-ready text
- `blocked.md` when it cannot continue and needs a human answer

## Live Workflow Smoke

1. Push changes to `main`.
2. Confirm `ci` passes.
3. Open or reuse a low-risk issue.
4. Comment `/agent develop`, or trigger `Public Agent PM`.
5. Verify the run uses `scripts/codex-agent-run.ts`, exchanges GitHub OIDC for a
   bounded model token, and emits a publisher bundle.
6. Verify publisher output, reviewer verdict, and merge-gate behavior.
7. If active-run limits block PM or agent dispatch, use the manual `Model Proxy Admin`
   workflow to inspect proxy saturation and revoke stale run IDs before retrying.
   The post-publish retry path uses deterministic retry-budget evaluation for CI
   and reviewer `develop_retry` retries.

## Operator Controls

Use issue comments for day-to-day controls:

- `/agent pause` adds `agent-paused` to the issue. PM sweeps and direct develop
  starts wait while the label is present.
- `/agent resume` removes `agent-paused`.
- `/agent pause repo` sets `PUBLIC_AGENT_REPO_PAUSED=true`; `/agent resume repo`
  clears it.
- `/agent status` posts labels, blocking labels, open agent PR, active workflow
  runs, and active proxy runs for the issue.
- `/agent cancel` cancels queued/in-progress public-agent workflow runs for the
  issue and revokes matching active proxy runs visible in `/admin/limits/status`.
- `/agent retry` reruns failed jobs from the latest failed infrastructure run for
  the issue. It does not create a new `/agent develop` command.

Use `Model Proxy Admin` with `status`, `run-status`, or `revoke` when you need
repository-wide proxy saturation details or a manual run-id revoke.

## Production Rollout

Before enabling the agent on a public backlog, work through
[`PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`](./PUBLIC_AGENT_PRODUCTION_ROLLOUT.md).

## Secrets

The runner and published evidence must not contain real API keys, tokens,
cookies, private URLs, or customer data. The session wrapper scans the bundle
patch, session, decision files, and promoted artifacts for common real-looking
secret patterns before publisher validation.

exec
/bin/bash -lc "sed -n '1,240p' examples/small-app/README.md" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
# small-app open-autonomy example

This is a minimal full repository shape for using open-autonomy on a small
TypeScript application.

It is intentionally small:

- issues can request bounded app and documentation edits
- the publisher can apply non-workflow docs changes
- CI runs app tests and open-autonomy checks
- operator controls can pause, resume, status, retry, and cancel

To make this a standalone demo repo, copy `examples/small-app/` into a new
GitHub repository, configure the variables and secrets from
`docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`, and run the smoke checklist.

codex
I’ve found the existing runbook and rollout docs; next I’m locating the exact setup page for a fresh scaffolded repo so I can add the missing “secrets, variables, first issue” guidance where operators will actually look.
exec
/bin/bash -lc "sed -n '1,260p' examples/small-app/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
# open-autonomy Production Rollout

Use this checklist before enabling open-autonomy on a repository.

## Required Configuration

Repository variables:

- `MODEL_PROXY_URL`
- `MODEL_PROXY_OIDC_AUDIENCE`
- `PUBLIC_AGENT_MODELS`
- `PUBLIC_AGENT_MODEL`
- `PUBLIC_AGENT_TRIAGE_MODEL`
- `PUBLIC_AGENT_PM_MODEL`
- `PUBLIC_AGENT_REVIEW_MODEL`
- `PUBLIC_AGENT_MAX_USD_CENTS`
- `PUBLIC_AGENT_TRIAGE_MAX_USD_CENTS`
- `PUBLIC_AGENT_PM_MAX_USD_CENTS`
- `PUBLIC_AGENT_REVIEW_MAX_USD_CENTS`
- `PUBLIC_AGENT_MAX_REQUESTS`
- `PUBLIC_AGENT_MAX_DEVELOP_ATTEMPTS`
- `PUBLIC_AGENT_MAX_OPEN_AGENT_PRS`
- `PUBLIC_AGENT_STALE_NEEDS_INFO_MINUTES`
- `PUBLIC_AGENT_PM_LIMIT`
- `PUBLIC_AGENT_ALLOWED_PATHS`
- `PUBLIC_AGENT_REPO_PAUSED`

Repository secrets:

- `MODEL_PROXY_ADMIN_TOKEN`
- `PUBLIC_AGENT_TRIGGER_TOKEN` if PM-triggered comments must use a token with
  enough permissions to trigger follow-on workflows.

Model proxy deployment:

- Set provider API keys and model names.
- Set `MODEL_PRICES_JSON`.
- Choose production limits for global active runs, per-repo active runs,
  per-actor active runs, per-run spend, per-run request count, and daily spend.
- Verify `GET /admin/limits/status` works through the `Model Proxy Admin`
  workflow.

GitHub repository:

- Branch protection allows the trusted publisher and merge gate pattern.
- Required CI check name matches `ci`.
- Actions artifact retention is long enough for operator audits.
- Workflow permissions stay capability-separated; do not use `write-all`.
- Workflows set `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`.

## First Public Rollout Policy

Start with a narrow allowed surface:

- trusted maintainers only for manual `/agent develop`
- PM sweep limit of 1-3 issues
- conservative `PUBLIC_AGENT_ALLOWED_PATHS`
- low per-run spend caps
- `PUBLIC_AGENT_REPO_PAUSED=false` only during supervised windows

Escalate to humans for security issues, broad architecture changes, unclear
requirements, repeated failures, merge conflicts, missing CI, stale CI, and
reviewer high-risk verdicts.

## Operator Drills

Before opening broader access, verify these in the target repo:

- `/agent pause` applies `agent-paused`.
- `/agent develop` on a paused issue stops before model minting.
- `/agent status` reports labels, open PR, active workflow runs, and active proxy
  runs.
- `/agent resume` clears `agent-paused`.
- `/agent retry` reports no infrastructure retry when no failed run exists, or
  reruns failed jobs without posting a fresh `/agent develop`.
- `/agent cancel` cancels active public-agent workflow runs and revokes active
  proxy runs for the issue.
- `Model Proxy Admin` `status` shows active-run saturation and daily counters.

## Private Trial Evidence

These live trial runs are the baseline acceptance evidence as of
2026-06-16:

- Phase 5 review/merge hardening: run `27632534829` merged PR #67 for issue #66.
- Phase 6 evidence quality: run `27632884925` merged PR #69 for issue #68, with
  `run-receipt.json` and `transcript.md` promoted into
  `agent-sessions/run_966fe8ea-2e22-4752-89dd-25db8fcd0e82/`.
- Phase 7 operator controls: issue #70 live-tested `/agent pause`, a paused
  `/agent develop` policy block before model minting, `/agent status`, and
  `/agent resume`.
- Push CI for operator controls: run `27633520672`.
- Push CI for production rollout checks: run `27633852289`.

## Go/No-Go

Go only when all of these are true:

- `bun run check` passes locally and in GitHub Actions.
- A fresh low-risk issue completes end to end.
- A paused issue does not dispatch new work.
- PM sweep on stale backlog launches no duplicate work.
- Proxy saturation causes skip/backpressure, not workflow failure.
- Risky or unclear issues produce human-required escalation instead of a PR.

exec
/bin/bash -lc "sed -n '1,260p' examples/small-app/scripts/scaffold-target-repo.ts" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
#!/usr/bin/env bun
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

interface Options {
  target: string;
  force: boolean;
}

function usage(): never {
  throw new Error(`Usage:
  bun scripts/scaffold-target-repo.ts --target ../my-repo [--force]`);
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const target = value('--target');
  if (!target) usage();
  return { target: resolve(target), force: argv.includes('--force') };
}

function copyTemplate(template: string, target: string, force: boolean): string[] {
  mkdirSync(target, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(template)) {
    const from = join(template, name);
    const to = join(target, name);
    if (existsSync(to) && !force) {
      throw new Error(`${to} already exists. Re-run with --force to overwrite template files.`);
    }
    cpSync(from, to, { recursive: true, force });
    copied.push(name);
  }
  return copied;
}

function assertTargetDirectory(path: string): void {
  if (!existsSync(path)) return;
  if (!statSync(path).isDirectory()) throw new Error(`target is not a directory: ${path}`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  assertTargetDirectory(options.target);
  const template = resolve('templates/self-driving-repo');
  if (!existsSync(template)) throw new Error(`template directory not found: ${template}`);
  const copied = copyTemplate(template, options.target, options.force);
  process.stdout.write(`Installed open-autonomy template into ${options.target}\n`);
  process.stdout.write(`Copied: ${copied.sort().join(', ')}\n`);
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}

exec
/bin/bash -lc "sed -n '1,260p' examples/small-app/docs/PROJECT.md" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
# Example Project

This placeholder document gives the small app example a normal content file for
low-risk agent edits.

Good first smoke issue:

```text
Please add one sentence to docs/PROJECT.md explaining that this repo is a small
app open-autonomy example.
```

exec
/bin/bash -lc "sed -n '1,260p' examples/testbed/docs/OSS_AGENT_RUNBOOK.md" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
# open-autonomy Runbook

This is the source-checkout path for the issue-driven self-building agent. The
full GitHub Actions and model-proxy architecture is in
[`PUBLIC_AGENT_ACTIONS.md`](./PUBLIC_AGENT_ACTIONS.md).

## Local Checks

```bash
bun install
bun run check:public-agent
bun run check:agent-proxy
bun run check
```

`check:public-agent` runs the script unit tests and TypeScript checks for the
GitHub agent loop. `check:agent-proxy` validates the Cloudflare Worker model
proxy. `check` runs both.

## Manual Session Wrapper Smoke

Create an issue payload:

```bash
cat > /tmp/volter-issue.json <<'JSON'
{
  "number": 101,
  "title": "Add a verified public-agent artifact",
  "body": "Simulate an issue-triggered public agent session without real secrets."
}
JSON
```

Run the session wrapper with a simple local command:

```bash
bun scripts/github-agent-session.ts \
  --issue /tmp/volter-issue.json \
  --run-id run_local_101 \
  --out /tmp/public-agent-101 \
  --repo volter-ai/open-autonomy \
  --actor local \
  -- \
  node -e 'const fs=require("node:fs"),p=require("node:path"); const d=process.env.OSS_AGENT_TASK_DIR; fs.mkdirSync(p.join(d,"artifacts"),{recursive:true}); fs.writeFileSync(p.join(d,"artifacts","result.json"),"{\"ok\":true}\\n"); fs.writeFileSync(p.join(d,"artifacts","pr.md"),"# PR\\n")'
```

Inspect:

```bash
cat /tmp/public-agent-101/bundle/manifest.json
ls /tmp/public-agent-101/bundle/artifacts
```

Merged develop session bundles now include target, triage, develop, publish, CI, review, and merge-gate decision records, so operators should review the full chain when checking evidence.
Merged session evidence includes a `run-receipt.json` file and a root `transcript.md` file.
The workflow waits for GitHub to report the evidence commit as the PR head before SHA-bound auto-merge.
When bounded developer context is provided, developer bundles also include `context-sources.json`.

The agent command receives:

- `OSS_AGENT_TASK_DIR` — writable task directory
- `OSS_AGENT_ISSUE_PATH` — copied issue JSON

The command must write one terminal artifact in `artifacts/`:

- `result.json` for a successful machine-readable result
- `pr.md` for PR-ready text
- `blocked.md` when it cannot continue and needs a human answer

## Live Workflow Smoke

1. Push changes to `main`.
2. Confirm `ci` passes.
3. Open or reuse a low-risk issue.
4. Comment `/agent develop`, or trigger `Public Agent PM`.
5. Verify the run uses `scripts/codex-agent-run.ts`, exchanges GitHub OIDC for a
   bounded model token, and emits a publisher bundle.
6. Verify publisher output, reviewer verdict, and merge-gate behavior.
7. If active-run limits block PM or agent dispatch, use the manual `Model Proxy Admin`
   workflow to inspect proxy saturation and revoke stale run IDs before retrying.
   The post-publish retry path uses deterministic retry-budget evaluation for CI
   and reviewer `develop_retry` retries.

## Operator Controls

Use issue comments for day-to-day controls:

- `/agent pause` adds `agent-paused` to the issue. PM sweeps and direct develop
  starts wait while the label is present.
- `/agent resume` removes `agent-paused`.
- `/agent pause repo` sets `PUBLIC_AGENT_REPO_PAUSED=true`; `/agent resume repo`
  clears it.
- `/agent status` posts labels, blocking labels, open agent PR, active workflow
  runs, and active proxy runs for the issue.
- `/agent cancel` cancels queued/in-progress public-agent workflow runs for the
  issue and revokes matching active proxy runs visible in `/admin/limits/status`.
- `/agent retry` reruns failed jobs from the latest failed infrastructure run for
  the issue. It does not create a new `/agent develop` command.

Use `Model Proxy Admin` with `status`, `run-status`, or `revoke` when you need
repository-wide proxy saturation details or a manual run-id revoke.

## Production Rollout

Before enabling the agent on a public backlog, work through
[`PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`](./PUBLIC_AGENT_PRODUCTION_ROLLOUT.md).

## Secrets

The runner and published evidence must not contain real API keys, tokens,
cookies, private URLs, or customer data. The session wrapper scans the bundle
patch, session, decision files, and promoted artifacts for common real-looking
secret patterns before publisher validation.

exec
/bin/bash -lc "rg -n \"first issue|secrets|variables|setup\" examples/small-app examples/testbed templates docs -g '*.md' -g '*.ts'" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
docs/ROADMAP.md:401:- GitHub Actions setup, runner, cleanup, publisher split
docs/ROADMAP.md:502:- Decision records contain no secrets and do not include raw model tokens.
docs/ROADMAP.md:558:- policy variables:
docs/ROADMAP.md:953:- production variables and secrets checklist
docs/ROADMAP.md:973:- All production defaults are visible in docs or repo variables.
docs/ROADMAP.md:982:  - Expected: reports configured secrets/variables, labels, permissions, branch
docs/ROADMAP.md:1106:  docs, labels, and required repo variables
docs/ROADMAP.md:1110:- compatibility checks that report missing secrets, variables, labels, branch
docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md:7:Repository variables:
docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md:28:Repository secrets:
docs/OSS_AGENT_RUNBOOK.md:29:  "body": "Simulate an issue-triggered public agent session without real secrets."
docs/ARCHITECTURE.md:15:  -> trusted setup + target/policy/triage checks
docs/PUBLIC_AGENT_ACTIONS.md:22:setup job
docs/PUBLIC_AGENT_ACTIONS.md:23:  trusted setup
docs/PUBLIC_AGENT_ACTIONS.md:126:real-looking secrets, and emits a publisher bundle.
templates/self-driving-repo/README.md:10:4. Set the GitHub variables and secrets listed in
templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md:7:Repository variables:
templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md:28:Repository secrets:
templates/self-driving-repo/docs/OSS_AGENT_RUNBOOK.md:29:  "body": "Simulate an issue-triggered public agent session without real secrets."
examples/testbed/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md:7:Repository variables:
examples/testbed/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md:28:Repository secrets:
templates/self-driving-repo/docs/ARCHITECTURE.md:15:  -> trusted setup + target/policy/triage checks
examples/testbed/docs/OSS_AGENT_RUNBOOK.md:29:  "body": "Simulate an issue-triggered public agent session without real secrets."
templates/self-driving-repo/docs/PUBLIC_AGENT_ACTIONS.md:22:setup job
templates/self-driving-repo/docs/PUBLIC_AGENT_ACTIONS.md:23:  trusted setup
templates/self-driving-repo/docs/PUBLIC_AGENT_ACTIONS.md:126:real-looking secrets, and emits a publisher bundle.
examples/testbed/docs/ARCHITECTURE.md:15:  -> trusted setup + target/policy/triage checks
examples/testbed/docs/PUBLIC_AGENT_ACTIONS.md:22:setup job
examples/testbed/docs/PUBLIC_AGENT_ACTIONS.md:23:  trusted setup
examples/testbed/docs/PUBLIC_AGENT_ACTIONS.md:126:real-looking secrets, and emits a publisher bundle.
examples/testbed/README.md:39:Configure the same repository variables and secrets described in
templates/self-driving-repo/scripts/codex-agent-run.ts:91:    '- Do not read, print, or persist secrets.',
templates/self-driving-repo/scripts/public-agent-decision.test.ts:31:  test('redacts real-looking secrets before writing', () => {
examples/small-app/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md:7:Repository variables:
examples/small-app/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md:28:Repository secrets:
examples/small-app/docs/OSS_AGENT_RUNBOOK.md:29:  "body": "Simulate an issue-triggered public agent session without real secrets."
examples/small-app/docs/ARCHITECTURE.md:15:  -> trusted setup + target/policy/triage checks
examples/small-app/docs/PUBLIC_AGENT_ACTIONS.md:22:setup job
examples/small-app/docs/PUBLIC_AGENT_ACTIONS.md:23:  trusted setup
examples/small-app/docs/PUBLIC_AGENT_ACTIONS.md:126:real-looking secrets, and emits a publisher bundle.
examples/small-app/README.md:14:GitHub repository, configure the variables and secrets from
examples/testbed/scripts/codex-agent-run.ts:91:    '- Do not read, print, or persist secrets.',
examples/testbed/scripts/public-agent-decision.test.ts:31:  test('redacts real-looking secrets before writing', () => {
examples/small-app/scripts/codex-agent-run.ts:91:    '- Do not read, print, or persist secrets.',
examples/small-app/scripts/public-agent-decision.test.ts:31:  test('redacts real-looking secrets before writing', () => {

exec
/bin/bash -lc "rg -n \"PUBLIC_AGENT_.*(MODEL|TOKEN|LIMIT|PAUSED)|MODEL_PROXY|variables\" examples/small-app -g '*.md'" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
examples/small-app/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md:7:Repository variables:
examples/small-app/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md:9:- `MODEL_PROXY_URL`
examples/small-app/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md:10:- `MODEL_PROXY_OIDC_AUDIENCE`
examples/small-app/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md:11:- `PUBLIC_AGENT_MODELS`
examples/small-app/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md:12:- `PUBLIC_AGENT_MODEL`
examples/small-app/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md:13:- `PUBLIC_AGENT_TRIAGE_MODEL`
examples/small-app/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md:14:- `PUBLIC_AGENT_PM_MODEL`
examples/small-app/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md:15:- `PUBLIC_AGENT_REVIEW_MODEL`
examples/small-app/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md:24:- `PUBLIC_AGENT_PM_LIMIT`
examples/small-app/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md:26:- `PUBLIC_AGENT_REPO_PAUSED`
examples/small-app/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md:30:- `MODEL_PROXY_ADMIN_TOKEN`
examples/small-app/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md:31:- `PUBLIC_AGENT_TRIGGER_TOKEN` if PM-triggered comments must use a token with
examples/small-app/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md:59:- `PUBLIC_AGENT_REPO_PAUSED=false` only during supervised windows
examples/small-app/docs/OSS_AGENT_RUNBOOK.md:91:- `/agent pause repo` sets `PUBLIC_AGENT_REPO_PAUSED=true`; `/agent resume repo`
examples/small-app/docs/PUBLIC_AGENT_ACTIONS.md:83:example `/agent pause repo`, to set `PUBLIC_AGENT_REPO_PAUSED` for the whole
examples/small-app/docs/PUBLIC_AGENT_ACTIONS.md:102:Admin routes require `X-Admin-Token: $MODEL_PROXY_ADMIN_TOKEN`. Model routes
examples/small-app/docs/PUBLIC_AGENT_ACTIONS.md:103:require `Authorization: Bearer $MODEL_PROXY_TOKEN`.
examples/small-app/docs/PUBLIC_AGENT_ACTIONS.md:105:The agent job gets `MODEL_PROXY_TOKEN` by exchanging GitHub OIDC with
examples/small-app/docs/PUBLIC_AGENT_ACTIONS.md:106:`scripts/model-proxy-exchange.ts`. It must not receive `MODEL_PROXY_ADMIN_TOKEN`.
examples/small-app/docs/PUBLIC_AGENT_ACTIONS.md:132:base_url = "$MODEL_PROXY_URL/openai/v1"
examples/small-app/docs/PUBLIC_AGENT_ACTIONS.md:134:env_key = "MODEL_PROXY_TOKEN"
examples/small-app/README.md:14:GitHub repository, configure the variables and secrets from

codex
The template already has a production rollout checklist, but the top-level scaffold README looks thin. I’m comparing the template and example copies so I can update the shared starter guidance once instead of sprinkling redundant text.
exec
/bin/bash -lc "sed -n '1,220p' templates/self-driving-repo/README.md" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
# Self-Driving Repository Template

Copy this directory into a GitHub repository to enable open-autonomy.

## Setup

1. Copy these files to the target repo root.
2. Run `bun install`.
3. Edit `AGENTS.md` and `.open-autonomy/*` for the target repository.
4. Set the GitHub variables and secrets listed in
   `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`.
5. Confirm `bun run check` passes.
6. Run the planner workflow in dry mode.
7. Smoke `/agent pause`, paused `/agent develop`, `/agent status`, and
   `/agent resume`.
8. Run one low-risk `/agent develop`.

This template assumes the target repo keeps the agent scripts in `scripts/` and
the workflows in `.github/workflows/`.

exec
/bin/bash -lc "sed -n '1,220p' examples/testbed/README.md" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
# open-autonomy testbed

This is a full demo repository for testing open-autonomy behavior on real GitHub
issues without using the main OSS repo as the scratchpad.

It is intentionally small but has enough surface area to exercise:

- PM triage
- unclear issue handling
- `/agent develop`
- `/agent review`
- operator controls
- evidence publication
- auto-merge for low-risk changes

## Good Smoke Issues

Clear, low-risk issue:

```text
Add one sentence to docs/PROJECT.md saying this repository is the live
open-autonomy testbed.
```

Needs-info issue:

```text
Improve the docs.
```

Risky issue:

```text
Rewrite the GitHub Actions workflows to make the agent faster.
```

## Setup

Configure the same repository variables and secrets described in
`docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`, then run:

```bash
bun install
bun run check
```

For a live demo repo, use `volter-ai/open-autonomy-testbed`.

## Test Matrix

The live scenario matrix is in `docs/TEST_MATRIX.md`, and completed runs are
recorded in `docs/TEST_RUNS.md`.

Preview or create standard smoke issues with:

```bash
bun run testbed:seed
bun run testbed:seed -- --apply --scenario pm-needs-info
```

exec
/bin/bash -lc "sed -n '1,220p' templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
# open-autonomy Production Rollout

Use this checklist before enabling open-autonomy on a repository.

## Required Configuration

Repository variables:

- `MODEL_PROXY_URL`
- `MODEL_PROXY_OIDC_AUDIENCE`
- `PUBLIC_AGENT_MODELS`
- `PUBLIC_AGENT_MODEL`
- `PUBLIC_AGENT_TRIAGE_MODEL`
- `PUBLIC_AGENT_PM_MODEL`
- `PUBLIC_AGENT_REVIEW_MODEL`
- `PUBLIC_AGENT_MAX_USD_CENTS`
- `PUBLIC_AGENT_TRIAGE_MAX_USD_CENTS`
- `PUBLIC_AGENT_PM_MAX_USD_CENTS`
- `PUBLIC_AGENT_REVIEW_MAX_USD_CENTS`
- `PUBLIC_AGENT_MAX_REQUESTS`
- `PUBLIC_AGENT_MAX_DEVELOP_ATTEMPTS`
- `PUBLIC_AGENT_MAX_OPEN_AGENT_PRS`
- `PUBLIC_AGENT_STALE_NEEDS_INFO_MINUTES`
- `PUBLIC_AGENT_PM_LIMIT`
- `PUBLIC_AGENT_ALLOWED_PATHS`
- `PUBLIC_AGENT_REPO_PAUSED`

Repository secrets:

- `MODEL_PROXY_ADMIN_TOKEN`
- `PUBLIC_AGENT_TRIGGER_TOKEN` if PM-triggered comments must use a token with
  enough permissions to trigger follow-on workflows.

Model proxy deployment:

- Set provider API keys and model names.
- Set `MODEL_PRICES_JSON`.
- Choose production limits for global active runs, per-repo active runs,
  per-actor active runs, per-run spend, per-run request count, and daily spend.
- Verify `GET /admin/limits/status` works through the `Model Proxy Admin`
  workflow.

GitHub repository:

- Branch protection allows the trusted publisher and merge gate pattern.
- Required CI check name matches `ci`.
- Actions artifact retention is long enough for operator audits.
- Workflow permissions stay capability-separated; do not use `write-all`.
- Workflows set `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`.

## First Public Rollout Policy

Start with a narrow allowed surface:

- trusted maintainers only for manual `/agent develop`
- PM sweep limit of 1-3 issues
- conservative `PUBLIC_AGENT_ALLOWED_PATHS`
- low per-run spend caps
- `PUBLIC_AGENT_REPO_PAUSED=false` only during supervised windows

Escalate to humans for security issues, broad architecture changes, unclear
requirements, repeated failures, merge conflicts, missing CI, stale CI, and
reviewer high-risk verdicts.

## Operator Drills

Before opening broader access, verify these in the target repo:

- `/agent pause` applies `agent-paused`.
- `/agent develop` on a paused issue stops before model minting.
- `/agent status` reports labels, open PR, active workflow runs, and active proxy
  runs.
- `/agent resume` clears `agent-paused`.
- `/agent retry` reports no infrastructure retry when no failed run exists, or
  reruns failed jobs without posting a fresh `/agent develop`.
- `/agent cancel` cancels active public-agent workflow runs and revokes active
  proxy runs for the issue.
- `Model Proxy Admin` `status` shows active-run saturation and daily counters.

## Private Trial Evidence

These live trial runs are the baseline acceptance evidence as of
2026-06-16:

- Phase 5 review/merge hardening: run `27632534829` merged PR #67 for issue #66.
- Phase 6 evidence quality: run `27632884925` merged PR #69 for issue #68, with
  `run-receipt.json` and `transcript.md` promoted into
  `agent-sessions/run_966fe8ea-2e22-4752-89dd-25db8fcd0e82/`.
- Phase 7 operator controls: issue #70 live-tested `/agent pause`, a paused
  `/agent develop` policy block before model minting, `/agent status`, and
  `/agent resume`.
- Push CI for operator controls: run `27633520672`.
- Push CI for production rollout checks: run `27633852289`.

## Go/No-Go

Go only when all of these are true:

- `bun run check` passes locally and in GitHub Actions.
- A fresh low-risk issue completes end to end.
- A paused issue does not dispatch new work.
- PM sweep on stale backlog launches no duplicate work.
- Proxy saturation causes skip/backpressure, not workflow failure.
- Risky or unclear issues produce human-required escalation instead of a PR.

exec
/bin/bash -lc "sed -n '1,220p' examples/testbed/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
# open-autonomy Production Rollout

Use this checklist before enabling open-autonomy on a repository.

## Required Configuration

Repository variables:

- `MODEL_PROXY_URL`
- `MODEL_PROXY_OIDC_AUDIENCE`
- `PUBLIC_AGENT_MODELS`
- `PUBLIC_AGENT_MODEL`
- `PUBLIC_AGENT_TRIAGE_MODEL`
- `PUBLIC_AGENT_PM_MODEL`
- `PUBLIC_AGENT_REVIEW_MODEL`
- `PUBLIC_AGENT_MAX_USD_CENTS`
- `PUBLIC_AGENT_TRIAGE_MAX_USD_CENTS`
- `PUBLIC_AGENT_PM_MAX_USD_CENTS`
- `PUBLIC_AGENT_REVIEW_MAX_USD_CENTS`
- `PUBLIC_AGENT_MAX_REQUESTS`
- `PUBLIC_AGENT_MAX_DEVELOP_ATTEMPTS`
- `PUBLIC_AGENT_MAX_OPEN_AGENT_PRS`
- `PUBLIC_AGENT_STALE_NEEDS_INFO_MINUTES`
- `PUBLIC_AGENT_PM_LIMIT`
- `PUBLIC_AGENT_ALLOWED_PATHS`
- `PUBLIC_AGENT_REPO_PAUSED`

Repository secrets:

- `MODEL_PROXY_ADMIN_TOKEN`
- `PUBLIC_AGENT_TRIGGER_TOKEN` if PM-triggered comments must use a token with
  enough permissions to trigger follow-on workflows.

Model proxy deployment:

- Set provider API keys and model names.
- Set `MODEL_PRICES_JSON`.
- Choose production limits for global active runs, per-repo active runs,
  per-actor active runs, per-run spend, per-run request count, and daily spend.
- Verify `GET /admin/limits/status` works through the `Model Proxy Admin`
  workflow.

GitHub repository:

- Branch protection allows the trusted publisher and merge gate pattern.
- Required CI check name matches `ci`.
- Actions artifact retention is long enough for operator audits.
- Workflow permissions stay capability-separated; do not use `write-all`.
- Workflows set `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`.

## First Public Rollout Policy

Start with a narrow allowed surface:

- trusted maintainers only for manual `/agent develop`
- PM sweep limit of 1-3 issues
- conservative `PUBLIC_AGENT_ALLOWED_PATHS`
- low per-run spend caps
- `PUBLIC_AGENT_REPO_PAUSED=false` only during supervised windows

Escalate to humans for security issues, broad architecture changes, unclear
requirements, repeated failures, merge conflicts, missing CI, stale CI, and
reviewer high-risk verdicts.

## Operator Drills

Before opening broader access, verify these in the target repo:

- `/agent pause` applies `agent-paused`.
- `/agent develop` on a paused issue stops before model minting.
- `/agent status` reports labels, open PR, active workflow runs, and active proxy
  runs.
- `/agent resume` clears `agent-paused`.
- `/agent retry` reports no infrastructure retry when no failed run exists, or
  reruns failed jobs without posting a fresh `/agent develop`.
- `/agent cancel` cancels active public-agent workflow runs and revokes active
  proxy runs for the issue.
- `Model Proxy Admin` `status` shows active-run saturation and daily counters.

## Private Trial Evidence

These live trial runs are the baseline acceptance evidence as of
2026-06-16:

- Phase 5 review/merge hardening: run `27632534829` merged PR #67 for issue #66.
- Phase 6 evidence quality: run `27632884925` merged PR #69 for issue #68, with
  `run-receipt.json` and `transcript.md` promoted into
  `agent-sessions/run_966fe8ea-2e22-4752-89dd-25db8fcd0e82/`.
- Phase 7 operator controls: issue #70 live-tested `/agent pause`, a paused
  `/agent develop` policy block before model minting, `/agent status`, and
  `/agent resume`.
- Push CI for operator controls: run `27633520672`.
- Push CI for production rollout checks: run `27633852289`.

## Go/No-Go

Go only when all of these are true:

- `bun run check` passes locally and in GitHub Actions.
- A fresh low-risk issue completes end to end.
- A paused issue does not dispatch new work.
- PM sweep on stale backlog launches no duplicate work.
- Proxy saturation causes skip/backpressure, not workflow failure.
- Risky or unclear issues produce human-required escalation instead of a PR.

codex
I’ve narrowed it to the scaffold template itself. Before editing, I’m checking the fleet smoke test to make sure the docs wording I add lines up with the installed template behavior and doesn’t fight any existing assertions.
exec
/bin/bash -lc "sed -n '1,260p' examples/small-app/scripts/open-autonomy-fleet.test.ts" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { buildGovernanceReport } from './open-autonomy-governance-report.js';
import { buildPreflightReport } from './open-autonomy-preflight.js';
import { summarizeAgentStatus, renderStatusComment } from './public-agent-control.js';
import { buildDecisionIndex } from './public-agent-decision-index.js';
import { makeDecision } from './public-agent-decision.js';

describe('open autonomy fleet and audit surfaces', () => {
  test('preflight passes when required files exist and reports unknown config as warnings', () => {
    const report = buildPreflightReport({ root: '.', env: {}, labels: [] });
    expect(report.ready).toBe(true);
    expect(report.checks.some((check) => check.id === 'file:AGENTS.md' && check.status === 'pass')).toBe(true);
    expect(report.checks.some((check) => check.id === 'env:MODEL_PROXY_URL' && check.status === 'warn')).toBe(true);
  });

  test('version metadata exists for run evidence', () => {
    const version = readFileSync('VERSION', 'utf8').trim();
    const metadata = JSON.parse(readFileSync('.open-autonomy/version.json', 'utf8'));
    expect(version).toBe('0.1.0');
    expect(metadata.version).toBe(version);
    expect(metadata.profile).toBe('default');
  });

  test('preflight blocks when required files are missing', () => {
    const report = buildPreflightReport({ root: '/tmp/open-autonomy-missing-root', env: {}, labels: [] });
    expect(report.ready).toBe(false);
    expect(report.missing).toContain('file:AGENTS.md');
  });

  test('status can reconstruct latest state from the decision index', () => {
    const index = buildDecisionIndex([
      makeDecision({
        stage: 'merge_gate',
        issue: 12,
        pr: 13,
        actor: 'merge-gate',
        decision: 'human_required',
        reason: 'maintainer hold',
        next_action: 'human_required',
      }, new Date('2026-06-16T12:00:00Z')),
    ]);
    const status = summarizeAgentStatus({
      issue: { number: 12, labels: [] },
      decisionIndex: index,
    });
    expect(status.open_pr).toBe(13);
    expect(status.latest_decision?.decision).toBe('human_required');
    expect(renderStatusComment(status)).toContain('latest indexed decision: merge_gate:human_required');
  });

  test('governance report summarizes decision index outcomes', () => {
    const index = buildDecisionIndex([
      makeDecision({
        stage: 'retry',
        issue: 22,
        actor: 'retry-budget',
        decision: 'budget_exhausted',
        reason: 'retry budget exhausted',
        next_action: 'human_required',
      }, new Date('2026-06-16T12:00:00Z')),
    ], new Date('2026-06-16T12:01:00Z'));
    const report = buildGovernanceReport(index, new Date('2026-06-16T12:02:00Z'));
    expect(report.issues_seen).toBe(1);
    expect(report.decisions_seen).toBe(1);
    expect(report.retry_related).toBe(1);
    expect(report.human_required).toBe(1);
  });
});

exec
/bin/bash -lc "sed -n '1,260p' examples/testbed/scripts/open-autonomy-fleet.test.ts" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { buildGovernanceReport } from './open-autonomy-governance-report.js';
import { buildPreflightReport } from './open-autonomy-preflight.js';
import { summarizeAgentStatus, renderStatusComment } from './public-agent-control.js';
import { buildDecisionIndex } from './public-agent-decision-index.js';
import { makeDecision } from './public-agent-decision.js';

describe('open autonomy fleet and audit surfaces', () => {
  test('preflight passes when required files exist and reports unknown config as warnings', () => {
    const report = buildPreflightReport({ root: '.', env: {}, labels: [] });
    expect(report.ready).toBe(true);
    expect(report.checks.some((check) => check.id === 'file:AGENTS.md' && check.status === 'pass')).toBe(true);
    expect(report.checks.some((check) => check.id === 'env:MODEL_PROXY_URL' && check.status === 'warn')).toBe(true);
  });

  test('version metadata exists for run evidence', () => {
    const version = readFileSync('VERSION', 'utf8').trim();
    const metadata = JSON.parse(readFileSync('.open-autonomy/version.json', 'utf8'));
    expect(version).toBe('0.1.0');
    expect(metadata.version).toBe(version);
    expect(metadata.profile).toBe('default');
  });

  test('preflight blocks when required files are missing', () => {
    const report = buildPreflightReport({ root: '/tmp/open-autonomy-missing-root', env: {}, labels: [] });
    expect(report.ready).toBe(false);
    expect(report.missing).toContain('file:AGENTS.md');
  });

  test('status can reconstruct latest state from the decision index', () => {
    const index = buildDecisionIndex([
      makeDecision({
        stage: 'merge_gate',
        issue: 12,
        pr: 13,
        actor: 'merge-gate',
        decision: 'human_required',
        reason: 'maintainer hold',
        next_action: 'human_required',
      }, new Date('2026-06-16T12:00:00Z')),
    ]);
    const status = summarizeAgentStatus({
      issue: { number: 12, labels: [] },
      decisionIndex: index,
    });
    expect(status.open_pr).toBe(13);
    expect(status.latest_decision?.decision).toBe('human_required');
    expect(renderStatusComment(status)).toContain('latest indexed decision: merge_gate:human_required');
  });

  test('governance report summarizes decision index outcomes', () => {
    const index = buildDecisionIndex([
      makeDecision({
        stage: 'retry',
        issue: 22,
        actor: 'retry-budget',
        decision: 'budget_exhausted',
        reason: 'retry budget exhausted',
        next_action: 'human_required',
      }, new Date('2026-06-16T12:00:00Z')),
    ], new Date('2026-06-16T12:01:00Z'));
    const report = buildGovernanceReport(index, new Date('2026-06-16T12:02:00Z'));
    expect(report.issues_seen).toBe(1);
    expect(report.decisions_seen).toBe(1);
    expect(report.retry_related).toBe(1);
    expect(report.human_required).toBe(1);
  });
});

exec
/bin/bash -lc "rg -n \"scaffold-target-repo|self-driving-repo|PUBLIC_AGENT_PRODUCTION_ROLLOUT|first issue\" examples templates -g '*.test.ts' -g '*.ts' -g '*.md'" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
templates/self-driving-repo/docs/PROOF_LEDGER.md:15:| `five-issue-dogfood` | `scripts/public-agent-production.test.ts`, `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md` | done |
templates/self-driving-repo/docs/PROOF_LEDGER.md:17:| `scaffold-install-smoke` | `scripts/scaffold-target-repo.ts`, `scripts/open-autonomy-fleet.test.ts` | done |
templates/self-driving-repo/docs/OSS_AGENT_RUNBOOK.md:106:[`PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`](./PUBLIC_AGENT_PRODUCTION_ROLLOUT.md).
templates/self-driving-repo/docs/ARCHITECTURE.md:29:- `templates/self-driving-repo`: copyable starter for another self-driving repo.
templates/self-driving-repo/docs/ARCHITECTURE.md:73:| `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md` | Enablement checklist for a target repo | maintainers |
templates/self-driving-repo/docs/RELEASE.md:11:4. Scaffold `templates/self-driving-repo/` into a clean directory and run its
templates/self-driving-repo/README.md:11:   `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`.
examples/testbed/docs/PROOF_LEDGER.md:18:| `scaffold-install-smoke` | `scripts/scaffold-target-repo.ts`, fleet preflight runs `27649190745` and `27649190743` | done |
examples/testbed/docs/OSS_AGENT_RUNBOOK.md:106:[`PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`](./PUBLIC_AGENT_PRODUCTION_ROLLOUT.md).
templates/self-driving-repo/scripts/scaffold-target-repo.ts:12:  bun scripts/scaffold-target-repo.ts --target ../my-repo [--force]`);
templates/self-driving-repo/scripts/scaffold-target-repo.ts:48:  const template = resolve('templates/self-driving-repo');
examples/testbed/docs/ARCHITECTURE.md:29:- `templates/self-driving-repo`: copyable starter for another self-driving repo.
examples/testbed/docs/ARCHITECTURE.md:73:| `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md` | Enablement checklist for a target repo | maintainers |
templates/self-driving-repo/scripts/public-agent-production.test.ts:86:    expect(text).toContain('.agent-run/open-autonomy-template/templates/self-driving-repo');
examples/testbed/docs/RELEASE.md:11:4. Scaffold `templates/self-driving-repo/` into a clean directory and run its
examples/testbed/README.md:40:`docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`, then run:
examples/testbed/scripts/scaffold-target-repo.ts:12:  bun scripts/scaffold-target-repo.ts --target ../my-repo [--force]`);
examples/testbed/scripts/scaffold-target-repo.ts:48:  const template = resolve('templates/self-driving-repo');
templates/self-driving-repo/scripts/open-autonomy-upgrade.ts:30:  'docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md',
templates/self-driving-repo/scripts/open-autonomy-upgrade.ts:38:  bun scripts/open-autonomy-upgrade.ts --template templates/self-driving-repo --target . [--apply] --out upgrade-plan.json`);
examples/testbed/scripts/public-agent-production.test.ts:86:    expect(text).toContain('.agent-run/open-autonomy-template/templates/self-driving-repo');
examples/testbed/scripts/open-autonomy-upgrade.ts:30:  'docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md',
examples/testbed/scripts/open-autonomy-upgrade.ts:38:  bun scripts/open-autonomy-upgrade.ts --template templates/self-driving-repo --target . [--apply] --out upgrade-plan.json`);
examples/docs-only/docs/PROOF_LEDGER.md:15:| `five-issue-dogfood` | `scripts/public-agent-production.test.ts`, `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md` | done |
examples/docs-only/docs/PROOF_LEDGER.md:17:| `scaffold-install-smoke` | `scripts/scaffold-target-repo.ts`, `scripts/open-autonomy-fleet.test.ts` | done |
examples/docs-only/docs/RELEASE.md:11:4. Scaffold `templates/self-driving-repo/` into a clean directory and run its
examples/library/docs/PROOF_LEDGER.md:15:| `five-issue-dogfood` | `scripts/public-agent-production.test.ts`, `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md` | done |
examples/library/docs/PROOF_LEDGER.md:17:| `scaffold-install-smoke` | `scripts/scaffold-target-repo.ts`, `scripts/open-autonomy-fleet.test.ts` | done |
examples/docs-only/docs/OSS_AGENT_RUNBOOK.md:106:[`PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`](./PUBLIC_AGENT_PRODUCTION_ROLLOUT.md).
examples/docs-only/README.md:15:`docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`, and run the smoke checklist.
examples/docs-only/docs/ARCHITECTURE.md:29:- `templates/self-driving-repo`: copyable starter for another self-driving repo.
examples/docs-only/docs/ARCHITECTURE.md:73:| `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md` | Enablement checklist for a target repo | maintainers |
examples/library/docs/OSS_AGENT_RUNBOOK.md:106:[`PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`](./PUBLIC_AGENT_PRODUCTION_ROLLOUT.md).
examples/library/docs/ARCHITECTURE.md:29:- `templates/self-driving-repo`: copyable starter for another self-driving repo.
examples/library/docs/ARCHITECTURE.md:73:| `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md` | Enablement checklist for a target repo | maintainers |
examples/library/README.md:15:`docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`, and run the smoke checklist.
examples/library/docs/RELEASE.md:11:4. Scaffold `templates/self-driving-repo/` into a clean directory and run its
examples/small-app/docs/RELEASE.md:11:4. Scaffold `templates/self-driving-repo/` into a clean directory and run its
examples/docs-only/scripts/scaffold-target-repo.ts:12:  bun scripts/scaffold-target-repo.ts --target ../my-repo [--force]`);
examples/docs-only/scripts/scaffold-target-repo.ts:48:  const template = resolve('templates/self-driving-repo');
examples/small-app/README.md:15:`docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`, and run the smoke checklist.
examples/docs-only/scripts/public-agent-production.test.ts:86:    expect(text).toContain('.agent-run/open-autonomy-template/templates/self-driving-repo');
examples/small-app/scripts/scaffold-target-repo.ts:12:  bun scripts/scaffold-target-repo.ts --target ../my-repo [--force]`);
examples/small-app/scripts/scaffold-target-repo.ts:48:  const template = resolve('templates/self-driving-repo');
examples/small-app/scripts/public-agent-production.test.ts:86:    expect(text).toContain('.agent-run/open-autonomy-template/templates/self-driving-repo');
examples/docs-only/scripts/open-autonomy-upgrade.ts:30:  'docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md',
examples/docs-only/scripts/open-autonomy-upgrade.ts:38:  bun scripts/open-autonomy-upgrade.ts --template templates/self-driving-repo --target . [--apply] --out upgrade-plan.json`);
examples/small-app/scripts/open-autonomy-upgrade.ts:30:  'docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md',
examples/small-app/scripts/open-autonomy-upgrade.ts:38:  bun scripts/open-autonomy-upgrade.ts --template templates/self-driving-repo --target . [--apply] --out upgrade-plan.json`);
examples/library/scripts/open-autonomy-upgrade.ts:30:  'docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md',
examples/library/scripts/open-autonomy-upgrade.ts:38:  bun scripts/open-autonomy-upgrade.ts --template templates/self-driving-repo --target . [--apply] --out upgrade-plan.json`);
examples/small-app/docs/OSS_AGENT_RUNBOOK.md:106:[`PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`](./PUBLIC_AGENT_PRODUCTION_ROLLOUT.md).
examples/small-app/docs/ARCHITECTURE.md:29:- `templates/self-driving-repo`: copyable starter for another self-driving repo.
examples/small-app/docs/ARCHITECTURE.md:73:| `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md` | Enablement checklist for a target repo | maintainers |
examples/library/scripts/public-agent-production.test.ts:86:    expect(text).toContain('.agent-run/open-autonomy-template/templates/self-driving-repo');
examples/small-app/docs/PROOF_LEDGER.md:15:| `five-issue-dogfood` | `scripts/public-agent-production.test.ts`, `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md` | done |
examples/small-app/docs/PROOF_LEDGER.md:17:| `scaffold-install-smoke` | `scripts/scaffold-target-repo.ts`, `scripts/open-autonomy-fleet.test.ts` | done |
examples/library/scripts/scaffold-target-repo.ts:12:  bun scripts/scaffold-target-repo.ts --target ../my-repo [--force]`);
examples/library/scripts/scaffold-target-repo.ts:48:  const template = resolve('templates/self-driving-repo');

codex
I’m ready to make the doc edits. After that I’ll run the narrowest verification that exercises the scaffold/fleet smoke path, so the result is tied to the proof gate rather than a broad repo-wide pass.
exec
/bin/bash -lc "sed -n '1,240p' package.json" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
{
  "name": "open-autonomy",
  "private": true,
  "type": "module",
  "packageManager": "bun@1.3.10",
  "scripts": {
    "check": "bun run check:public-agent && bun run check:agent-proxy && bun run check:examples && bun run check:proof",
    "check:agent-proxy": "cd services/agent-model-proxy && bun test test/*.test.ts && bunx tsc --noEmit",
    "check:public-agent": "bun test scripts/public-agent-decision.test.ts scripts/github-agent-session.test.ts scripts/github-agent-publish.test.ts scripts/public-agent-triage.test.ts scripts/public-agent-control.test.ts scripts/public-agent-production.test.ts scripts/public-agent-planner.test.ts scripts/open-autonomy-fleet.test.ts scripts/open-autonomy-upgrade.test.ts scripts/open-autonomy-proof-audit.test.ts && bunx tsc --noEmit --skipLibCheck --moduleResolution Bundler --module ESNext --target ES2022 --types bun scripts/public-agent-bundle.ts scripts/public-agent-decision.ts scripts/github-agent-session.ts scripts/github-agent-publish.ts scripts/model-proxy-mint.ts scripts/model-proxy-exchange.ts scripts/public-agent-triage.ts scripts/codex-agent-run.ts scripts/scaffold-target-repo.ts scripts/public-agent-command.ts scripts/public-agent-target.ts scripts/public-agent-ci.ts scripts/public-agent-review.ts scripts/public-agent-merge-gate.ts scripts/public-agent-loop-budget.ts scripts/public-agent-policy.ts scripts/public-agent-context.ts scripts/public-agent-pm.ts scripts/public-agent-dispatcher.ts scripts/public-agent-control.ts scripts/public-agent-control-files.ts scripts/public-agent-planner.ts scripts/public-agent-decision-index.ts scripts/open-autonomy-preflight.ts scripts/open-autonomy-governance-report.ts scripts/open-autonomy-upgrade.ts scripts/open-autonomy-proof-audit.ts scripts/public-agent-decision.test.ts scripts/github-agent-session.test.ts scripts/github-agent-publish.test.ts scripts/public-agent-triage.test.ts scripts/public-agent-control.test.ts scripts/public-agent-production.test.ts scripts/public-agent-planner.test.ts",
    "scaffold": "bun scripts/scaffold-target-repo.ts",
    "test": "bun run check:public-agent",
    "check:examples": "(cd examples/small-app && (bun install --frozen-lockfile || bun install) && bun run check) && (cd examples/library && (bun install --frozen-lockfile || bun install) && bun run check)",
    "check:proof": "mkdir -p .agent-run/proof && bun scripts/open-autonomy-proof-audit.ts --roadmap .open-autonomy/roadmap.yml --ledger docs/PROOF_LEDGER.md --out .agent-run/proof/audit.json"
  },
  "devDependencies": {
    "@types/bun": "^1.3.14",
    "@types/node": "^24.13.2",
    "typescript": "^5.9.3"
  }
}

exec
/bin/bash -lc "sed -n '1,220p' templates/self-driving-repo/docs/PROOF_LEDGER.md" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
# Proof Ledger

This ledger maps every `.open-autonomy/roadmap.yml` proof gate to local,
verifiable evidence. Evidence may be deterministic tests, committed scripts,
workflow wiring, or local release artifacts.

| Proof Gate | Evidence | Status |
| --- | --- | --- |
| `decision-memory-smoke` | `scripts/public-agent-decision-index.ts`, `scripts/public-agent-planner.test.ts` | done |
| `retry-ci-failure` | `scripts/public-agent-loop-budget.ts`, `scripts/public-agent-control.test.ts` | done |
| `pm-open-pr-review` | `scripts/public-agent-dispatcher.ts`, `scripts/public-agent-control.test.ts` | done |
| `developer-context-review-fix` | `scripts/public-agent-context.ts`, `scripts/public-agent-control.test.ts` | done |
| `head-changed-before-merge` | `scripts/public-agent-merge-gate.ts`, `scripts/public-agent-control.test.ts` | done |
| `operator-pause-resume` | `scripts/public-agent-control.test.ts`, `docs/PUBLIC_AGENT_ACTIONS.md` | done |
| `five-issue-dogfood` | `scripts/public-agent-production.test.ts`, `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md` | done |
| `planner-creates-proof-gate-issues` | `scripts/public-agent-planner.ts`, `scripts/public-agent-planner.test.ts` | done |
| `scaffold-install-smoke` | `scripts/scaffold-target-repo.ts`, `scripts/open-autonomy-fleet.test.ts` | done |
| `status-reconstruction` | `scripts/public-agent-decision-index.ts`, `scripts/open-autonomy-fleet.test.ts` | done |
| `quality-review-repair` | `scripts/public-agent-loop-budget.ts`, `scripts/public-agent-context.ts`, `scripts/public-agent-control.test.ts` | done |
| `governance-maintainer-hold` | `scripts/public-agent-merge-gate.ts`, `scripts/public-agent-policy.ts`, `scripts/public-agent-control.test.ts` | done |
| `release-dogfood` | `VERSION`, `.open-autonomy/version.json`, `docs/RELEASE.md` | done |

exec
/bin/bash -lc "rg --files scripts | sed -n '1,80p'" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
scripts/scaffold-target-repo.ts
scripts/public-agent-decision-index.ts
scripts/public-agent-production.test.ts
scripts/open-autonomy-governance-report.ts
scripts/open-autonomy-upgrade.test.ts
scripts/public-agent-loop-budget.ts
scripts/public-agent-planner.test.ts
scripts/public-agent-control.test.ts
scripts/public-agent-triage.test.ts
scripts/public-agent-merge-gate.ts
scripts/public-agent-decision.ts
scripts/public-agent-context.ts
scripts/public-agent-command.ts
scripts/public-agent-review.ts
scripts/github-agent-session.test.ts
scripts/public-agent-triage.ts
scripts/public-agent-dispatcher.ts
scripts/open-autonomy-proof-audit.test.ts
scripts/model-proxy-exchange.ts
scripts/public-agent-pm.ts
scripts/github-agent-session.ts
scripts/public-agent-control.ts
scripts/public-agent-ci.ts
scripts/open-autonomy-upgrade.ts
scripts/github-agent-publish.ts
scripts/public-agent-control-files.ts
scripts/codex-agent-run.ts
scripts/public-agent-planner.ts
scripts/public-agent-target.ts
scripts/open-autonomy-fleet.test.ts
scripts/public-agent-bundle.ts
scripts/github-agent-publish.test.ts
scripts/public-agent-decision.test.ts
scripts/model-proxy-mint.ts
scripts/open-autonomy-preflight.ts
scripts/public-agent-policy.ts
scripts/open-autonomy-proof-audit.ts

exec
/bin/bash -lc "rg --files templates/self-driving-repo | sed -n '1,80p'" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
templates/self-driving-repo/package.json
templates/self-driving-repo/VERSION
templates/self-driving-repo/AGENTS.md
templates/self-driving-repo/CHANGELOG.md
templates/self-driving-repo/bun.lock
templates/self-driving-repo/docs/PROOF_LEDGER.md
templates/self-driving-repo/docs/ROADMAP.md
templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
templates/self-driving-repo/docs/OSS_AGENT_RUNBOOK.md
templates/self-driving-repo/docs/ARCHITECTURE.md
templates/self-driving-repo/docs/PUBLIC_AGENT_ACTIONS.md
templates/self-driving-repo/docs/RELEASE.md
templates/self-driving-repo/README.md
templates/self-driving-repo/scripts/scaffold-target-repo.ts
templates/self-driving-repo/scripts/public-agent-decision-index.ts
templates/self-driving-repo/scripts/public-agent-production.test.ts
templates/self-driving-repo/scripts/open-autonomy-governance-report.ts
templates/self-driving-repo/scripts/open-autonomy-upgrade.test.ts
templates/self-driving-repo/scripts/public-agent-loop-budget.ts
templates/self-driving-repo/scripts/public-agent-planner.test.ts
templates/self-driving-repo/scripts/public-agent-control.test.ts
templates/self-driving-repo/scripts/public-agent-triage.test.ts
templates/self-driving-repo/scripts/public-agent-merge-gate.ts
templates/self-driving-repo/scripts/public-agent-decision.ts
templates/self-driving-repo/scripts/public-agent-context.ts
templates/self-driving-repo/scripts/public-agent-command.ts
templates/self-driving-repo/scripts/public-agent-review.ts
templates/self-driving-repo/scripts/github-agent-session.test.ts
templates/self-driving-repo/scripts/public-agent-triage.ts
templates/self-driving-repo/scripts/public-agent-dispatcher.ts
templates/self-driving-repo/scripts/open-autonomy-proof-audit.test.ts
templates/self-driving-repo/scripts/model-proxy-exchange.ts
templates/self-driving-repo/scripts/public-agent-pm.ts
templates/self-driving-repo/scripts/github-agent-session.ts
templates/self-driving-repo/scripts/public-agent-control.ts
templates/self-driving-repo/scripts/public-agent-ci.ts
templates/self-driving-repo/scripts/open-autonomy-upgrade.ts
templates/self-driving-repo/scripts/github-agent-publish.ts
templates/self-driving-repo/scripts/public-agent-control-files.ts
templates/self-driving-repo/scripts/codex-agent-run.ts
templates/self-driving-repo/scripts/public-agent-planner.ts
templates/self-driving-repo/scripts/public-agent-target.ts
templates/self-driving-repo/scripts/open-autonomy-fleet.test.ts
templates/self-driving-repo/scripts/public-agent-bundle.ts
templates/self-driving-repo/scripts/github-agent-publish.test.ts
templates/self-driving-repo/scripts/public-agent-decision.test.ts
templates/self-driving-repo/scripts/model-proxy-mint.ts
templates/self-driving-repo/scripts/open-autonomy-preflight.ts
templates/self-driving-repo/scripts/public-agent-policy.ts
templates/self-driving-repo/scripts/open-autonomy-proof-audit.ts

exec
/bin/bash -lc "sed -n '1,220p' templates/self-driving-repo/package.json" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
{
  "name": "self-driving-repo-template",
  "private": true,
  "type": "module",
  "packageManager": "bun@1.3.10",
  "scripts": {
    "check": "bun run check:public-agent && bun run check:proof",
    "check:public-agent": "bun test scripts/public-agent-decision.test.ts scripts/github-agent-session.test.ts scripts/github-agent-publish.test.ts scripts/public-agent-triage.test.ts scripts/public-agent-control.test.ts scripts/public-agent-production.test.ts scripts/public-agent-planner.test.ts scripts/open-autonomy-fleet.test.ts scripts/open-autonomy-upgrade.test.ts scripts/open-autonomy-proof-audit.test.ts && bunx tsc --noEmit --skipLibCheck --moduleResolution Bundler --module ESNext --target ES2022 --types bun scripts/public-agent-bundle.ts scripts/public-agent-decision.ts scripts/github-agent-session.ts scripts/github-agent-publish.ts scripts/model-proxy-mint.ts scripts/model-proxy-exchange.ts scripts/public-agent-triage.ts scripts/codex-agent-run.ts scripts/scaffold-target-repo.ts scripts/public-agent-command.ts scripts/public-agent-target.ts scripts/public-agent-ci.ts scripts/public-agent-review.ts scripts/public-agent-merge-gate.ts scripts/public-agent-loop-budget.ts scripts/public-agent-policy.ts scripts/public-agent-context.ts scripts/public-agent-pm.ts scripts/public-agent-dispatcher.ts scripts/public-agent-control.ts scripts/public-agent-control-files.ts scripts/public-agent-planner.ts scripts/public-agent-decision-index.ts scripts/open-autonomy-preflight.ts scripts/open-autonomy-governance-report.ts scripts/open-autonomy-upgrade.ts scripts/open-autonomy-proof-audit.ts scripts/public-agent-decision.test.ts scripts/github-agent-session.test.ts scripts/github-agent-publish.test.ts scripts/public-agent-triage.test.ts scripts/public-agent-control.test.ts scripts/public-agent-production.test.ts scripts/public-agent-planner.test.ts",
    "test": "bun run check:public-agent",
    "check:proof": "mkdir -p .agent-run/proof && bun scripts/open-autonomy-proof-audit.ts --roadmap .open-autonomy/roadmap.yml --ledger docs/PROOF_LEDGER.md --out .agent-run/proof/audit.json"
  },
  "devDependencies": {
    "@types/bun": "^1.3.14",
    "@types/node": "^24.13.2",
    "typescript": "^5.9.3"
  }
}

exec
/bin/bash -lc "sed -n '1,220p' templates/self-driving-repo/scripts/open-autonomy-fleet.test.ts" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { buildGovernanceReport } from './open-autonomy-governance-report.js';
import { buildPreflightReport } from './open-autonomy-preflight.js';
import { summarizeAgentStatus, renderStatusComment } from './public-agent-control.js';
import { buildDecisionIndex } from './public-agent-decision-index.js';
import { makeDecision } from './public-agent-decision.js';

describe('open autonomy fleet and audit surfaces', () => {
  test('preflight passes when required files exist and reports unknown config as warnings', () => {
    const report = buildPreflightReport({ root: '.', env: {}, labels: [] });
    expect(report.ready).toBe(true);
    expect(report.checks.some((check) => check.id === 'file:AGENTS.md' && check.status === 'pass')).toBe(true);
    expect(report.checks.some((check) => check.id === 'env:MODEL_PROXY_URL' && check.status === 'warn')).toBe(true);
  });

  test('version metadata exists for run evidence', () => {
    const version = readFileSync('VERSION', 'utf8').trim();
    const metadata = JSON.parse(readFileSync('.open-autonomy/version.json', 'utf8'));
    expect(version).toBe('0.1.0');
    expect(metadata.version).toBe(version);
    expect(metadata.profile).toBe('default');
  });

  test('preflight blocks when required files are missing', () => {
    const report = buildPreflightReport({ root: '/tmp/open-autonomy-missing-root', env: {}, labels: [] });
    expect(report.ready).toBe(false);
    expect(report.missing).toContain('file:AGENTS.md');
  });

  test('status can reconstruct latest state from the decision index', () => {
    const index = buildDecisionIndex([
      makeDecision({
        stage: 'merge_gate',
        issue: 12,
        pr: 13,
        actor: 'merge-gate',
        decision: 'human_required',
        reason: 'maintainer hold',
        next_action: 'human_required',
      }, new Date('2026-06-16T12:00:00Z')),
    ]);
    const status = summarizeAgentStatus({
      issue: { number: 12, labels: [] },
      decisionIndex: index,
    });
    expect(status.open_pr).toBe(13);
    expect(status.latest_decision?.decision).toBe('human_required');
    expect(renderStatusComment(status)).toContain('latest indexed decision: merge_gate:human_required');
  });

  test('governance report summarizes decision index outcomes', () => {
    const index = buildDecisionIndex([
      makeDecision({
        stage: 'retry',
        issue: 22,
        actor: 'retry-budget',
        decision: 'budget_exhausted',
        reason: 'retry budget exhausted',
        next_action: 'human_required',
      }, new Date('2026-06-16T12:00:00Z')),
    ], new Date('2026-06-16T12:01:00Z'));
    const report = buildGovernanceReport(index, new Date('2026-06-16T12:02:00Z'));
    expect(report.issues_seen).toBe(1);
    expect(report.decisions_seen).toBe(1);
    expect(report.retry_related).toBe(1);
    expect(report.human_required).toBe(1);
  });
});

codex
I’m updating the scaffold README and the rollout checklist together so the new repo gets both the configuration checklist and an explicit “first issue” path in one place.
apply patch
patch: completed
/home/runner/work/open-autonomy/open-autonomy/templates/self-driving-repo/README.md
diff --git a/templates/self-driving-repo/README.md b/templates/self-driving-repo/README.md
index a11364d6afe936284a770a1e59d3a6eafc20d112..e93d1893c4ba6a74df13904147183695d45845ac
--- a/templates/self-driving-repo/README.md
+++ b/templates/self-driving-repo/README.md
@@ -7,13 +7,23 @@
 1. Copy these files to the target repo root.
 2. Run `bun install`.
 3. Edit `AGENTS.md` and `.open-autonomy/*` for the target repository.
-4. Set the GitHub variables and secrets listed in
+4. Set the repository variables and secrets listed in
    `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`.
 5. Confirm `bun run check` passes.
 6. Run the planner workflow in dry mode.
 7. Smoke `/agent pause`, paused `/agent develop`, `/agent status`, and
    `/agent resume`.
-8. Run one low-risk `/agent develop`.
 
+## First Issue Flow
+
+Use the first low-risk issue to prove the template works in the new repository:
+
+1. Open a small docs-only issue with clear acceptance criteria.
+2. Add the configured variables and secrets from
+   `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md` before enabling agent runs.
+3. Comment `/agent develop` on the issue and verify the PM/agent loop starts.
+4. Confirm the resulting PR or status comment reflects the issue context and
+   the repository checks still pass.
+
 This template assumes the target repo keeps the agent scripts in `scripts/` and
 the workflows in `.github/workflows/`.

diff --git a/templates/self-driving-repo/README.md b/templates/self-driving-repo/README.md
index a11364d6afe936284a770a1e59d3a6eafc20d112..e93d1893c4ba6a74df13904147183695d45845ac
--- a/templates/self-driving-repo/README.md
+++ b/templates/self-driving-repo/README.md
@@ -7,13 +7,23 @@
 1. Copy these files to the target repo root.
 2. Run `bun install`.
 3. Edit `AGENTS.md` and `.open-autonomy/*` for the target repository.
-4. Set the GitHub variables and secrets listed in
+4. Set the repository variables and secrets listed in
    `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`.
 5. Confirm `bun run check` passes.
 6. Run the planner workflow in dry mode.
 7. Smoke `/agent pause`, paused `/agent develop`, `/agent status`, and
    `/agent resume`.
-8. Run one low-risk `/agent develop`.
 
+## First Issue Flow
+
+Use the first low-risk issue to prove the template works in the new repository:
+
+1. Open a small docs-only issue with clear acceptance criteria.
+2. Add the configured variables and secrets from
+   `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md` before enabling agent runs.
+3. Comment `/agent develop` on the issue and verify the PM/agent loop starts.
+4. Confirm the resulting PR or status comment reflects the issue context and
+   the repository checks still pass.
+
 This template assumes the target repo keeps the agent scripts in `scripts/` and
 the workflows in `.github/workflows/`.

apply patch
patch: completed
/home/runner/work/open-autonomy/open-autonomy/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
diff --git a/templates/self-driving-repo/README.md b/templates/self-driving-repo/README.md
index a11364d6afe936284a770a1e59d3a6eafc20d112..e93d1893c4ba6a74df13904147183695d45845ac
--- a/templates/self-driving-repo/README.md
+++ b/templates/self-driving-repo/README.md
@@ -7,13 +7,23 @@
 1. Copy these files to the target repo root.
 2. Run `bun install`.
 3. Edit `AGENTS.md` and `.open-autonomy/*` for the target repository.
-4. Set the GitHub variables and secrets listed in
+4. Set the repository variables and secrets listed in
    `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`.
 5. Confirm `bun run check` passes.
 6. Run the planner workflow in dry mode.
 7. Smoke `/agent pause`, paused `/agent develop`, `/agent status`, and
    `/agent resume`.
-8. Run one low-risk `/agent develop`.
 
+## First Issue Flow
+
+Use the first low-risk issue to prove the template works in the new repository:
+
+1. Open a small docs-only issue with clear acceptance criteria.
+2. Add the configured variables and secrets from
+   `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md` before enabling agent runs.
+3. Comment `/agent develop` on the issue and verify the PM/agent loop starts.
+4. Confirm the resulting PR or status comment reflects the issue context and
+   the repository checks still pass.
+
 This template assumes the target repo keeps the agent scripts in `scripts/` and
 the workflows in `.github/workflows/`.
diff --git a/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md b/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
index fee79844999543b3efea95fe7726cd25d4bbfc88..433ba3c5acda62638c8a82a01b34be8e21d6ceba
--- a/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
+++ b/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
@@ -77,6 +77,19 @@
   proxy runs for the issue.
 - `Model Proxy Admin` `status` shows active-run saturation and daily counters.
 
+## First Issue Flow
+
+Use the first issue to verify the scaffolded repository is wired correctly:
+
+1. Keep the issue small and low risk, ideally a docs-only change with explicit
+   acceptance criteria.
+2. Confirm the repository variables and secrets above are set before enabling
+   agent runs.
+3. Comment `/agent develop` on the issue and watch for the visible PM command
+   comment, developer run, and published PR or status update.
+4. If the issue pauses, fails, or escalates, use the operator controls above
+   before retrying.
+
 ## Private Trial Evidence
 
 These live trial runs are the baseline acceptance evidence as of

diff --git a/templates/self-driving-repo/README.md b/templates/self-driving-repo/README.md
index a11364d6afe936284a770a1e59d3a6eafc20d112..e93d1893c4ba6a74df13904147183695d45845ac
--- a/templates/self-driving-repo/README.md
+++ b/templates/self-driving-repo/README.md
@@ -7,13 +7,23 @@
 1. Copy these files to the target repo root.
 2. Run `bun install`.
 3. Edit `AGENTS.md` and `.open-autonomy/*` for the target repository.
-4. Set the GitHub variables and secrets listed in
+4. Set the repository variables and secrets listed in
    `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`.
 5. Confirm `bun run check` passes.
 6. Run the planner workflow in dry mode.
 7. Smoke `/agent pause`, paused `/agent develop`, `/agent status`, and
    `/agent resume`.
-8. Run one low-risk `/agent develop`.
 
+## First Issue Flow
+
+Use the first low-risk issue to prove the template works in the new repository:
+
+1. Open a small docs-only issue with clear acceptance criteria.
+2. Add the configured variables and secrets from
+   `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md` before enabling agent runs.
+3. Comment `/agent develop` on the issue and verify the PM/agent loop starts.
+4. Confirm the resulting PR or status comment reflects the issue context and
+   the repository checks still pass.
+
 This template assumes the target repo keeps the agent scripts in `scripts/` and
 the workflows in `.github/workflows/`.
diff --git a/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md b/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
index fee79844999543b3efea95fe7726cd25d4bbfc88..433ba3c5acda62638c8a82a01b34be8e21d6ceba
--- a/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
+++ b/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
@@ -77,6 +77,19 @@
   proxy runs for the issue.
 - `Model Proxy Admin` `status` shows active-run saturation and daily counters.
 
+## First Issue Flow
+
+Use the first issue to verify the scaffolded repository is wired correctly:
+
+1. Keep the issue small and low risk, ideally a docs-only change with explicit
+   acceptance criteria.
+2. Confirm the repository variables and secrets above are set before enabling
+   agent runs.
+3. Comment `/agent develop` on the issue and watch for the visible PM command
+   comment, developer run, and published PR or status update.
+4. If the issue pauses, fails, or escalates, use the operator controls above
+   before retrying.
+
 ## Private Trial Evidence
 
 These live trial runs are the baseline acceptance evidence as of

codex
The docs are patched. I’m now running a real scaffold into `/tmp` and a focused test from the generated repo so the proof is about the template behavior, not just text edits.
2026-06-17T14:15:41.269398Z ERROR codex_core::tools::router: error=exec_command failed for `/bin/bash -lc 'rm -rf /tmp/open-autonomy-scaffold-smoke && bun scripts/scaffold-target-repo.ts --target /tmp/open-autonomy-scaffold-smoke --force'`: CreateProcess { message: "Rejected(\"`/bin/bash -lc 'rm -rf /tmp/open-autonomy-scaffold-smoke && bun scripts/scaffold-target-repo.ts --target /tmp/open-autonomy-scaffold-smoke --force'` rejected: blocked by policy\")" }
diff --git a/templates/self-driving-repo/README.md b/templates/self-driving-repo/README.md
index a11364d6afe936284a770a1e59d3a6eafc20d112..e93d1893c4ba6a74df13904147183695d45845ac
--- a/templates/self-driving-repo/README.md
+++ b/templates/self-driving-repo/README.md
@@ -7,13 +7,23 @@
 1. Copy these files to the target repo root.
 2. Run `bun install`.
 3. Edit `AGENTS.md` and `.open-autonomy/*` for the target repository.
-4. Set the GitHub variables and secrets listed in
+4. Set the repository variables and secrets listed in
    `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`.
 5. Confirm `bun run check` passes.
 6. Run the planner workflow in dry mode.
 7. Smoke `/agent pause`, paused `/agent develop`, `/agent status`, and
    `/agent resume`.
-8. Run one low-risk `/agent develop`.
 
+## First Issue Flow
+
+Use the first low-risk issue to prove the template works in the new repository:
+
+1. Open a small docs-only issue with clear acceptance criteria.
+2. Add the configured variables and secrets from
+   `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md` before enabling agent runs.
+3. Comment `/agent develop` on the issue and verify the PM/agent loop starts.
+4. Confirm the resulting PR or status comment reflects the issue context and
+   the repository checks still pass.
+
 This template assumes the target repo keeps the agent scripts in `scripts/` and
 the workflows in `.github/workflows/`.
diff --git a/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md b/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
index fee79844999543b3efea95fe7726cd25d4bbfc88..433ba3c5acda62638c8a82a01b34be8e21d6ceba
--- a/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
+++ b/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
@@ -77,6 +77,19 @@
   proxy runs for the issue.
 - `Model Proxy Admin` `status` shows active-run saturation and daily counters.
 
+## First Issue Flow
+
+Use the first issue to verify the scaffolded repository is wired correctly:
+
+1. Keep the issue small and low risk, ideally a docs-only change with explicit
+   acceptance criteria.
+2. Confirm the repository variables and secrets above are set before enabling
+   agent runs.
+3. Comment `/agent develop` on the issue and watch for the visible PM command
+   comment, developer run, and published PR or status update.
+4. If the issue pauses, fails, or escalates, use the operator controls above
+   before retrying.
+
 ## Private Trial Evidence
 
 These live trial runs are the baseline acceptance evidence as of

codex
The first attempt was rejected because I bundled cleanup into a single shell line. I’m rerunning the scaffold as a single command with a fixed temp directory, then I’ll execute the check in that generated repo.
exec
/bin/bash -lc 'bun scripts/scaffold-target-repo.ts --target /tmp/open-autonomy-scaffold-smoke --force' in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
Installed open-autonomy template into /tmp/open-autonomy-scaffold-smoke
Copied: .github, .gitignore, .open-autonomy, AGENTS.md, CHANGELOG.md, README.md, VERSION, bun.lock, docs, package.json, scripts

diff --git a/templates/self-driving-repo/README.md b/templates/self-driving-repo/README.md
index a11364d6afe936284a770a1e59d3a6eafc20d112..e93d1893c4ba6a74df13904147183695d45845ac
--- a/templates/self-driving-repo/README.md
+++ b/templates/self-driving-repo/README.md
@@ -7,13 +7,23 @@
 1. Copy these files to the target repo root.
 2. Run `bun install`.
 3. Edit `AGENTS.md` and `.open-autonomy/*` for the target repository.
-4. Set the GitHub variables and secrets listed in
+4. Set the repository variables and secrets listed in
    `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`.
 5. Confirm `bun run check` passes.
 6. Run the planner workflow in dry mode.
 7. Smoke `/agent pause`, paused `/agent develop`, `/agent status`, and
    `/agent resume`.
-8. Run one low-risk `/agent develop`.
 
+## First Issue Flow
+
+Use the first low-risk issue to prove the template works in the new repository:
+
+1. Open a small docs-only issue with clear acceptance criteria.
+2. Add the configured variables and secrets from
+   `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md` before enabling agent runs.
+3. Comment `/agent develop` on the issue and verify the PM/agent loop starts.
+4. Confirm the resulting PR or status comment reflects the issue context and
+   the repository checks still pass.
+
 This template assumes the target repo keeps the agent scripts in `scripts/` and
 the workflows in `.github/workflows/`.
diff --git a/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md b/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
index fee79844999543b3efea95fe7726cd25d4bbfc88..433ba3c5acda62638c8a82a01b34be8e21d6ceba
--- a/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
+++ b/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
@@ -77,6 +77,19 @@
   proxy runs for the issue.
 - `Model Proxy Admin` `status` shows active-run saturation and daily counters.
 
+## First Issue Flow
+
+Use the first issue to verify the scaffolded repository is wired correctly:
+
+1. Keep the issue small and low risk, ideally a docs-only change with explicit
+   acceptance criteria.
+2. Confirm the repository variables and secrets above are set before enabling
+   agent runs.
+3. Comment `/agent develop` on the issue and watch for the visible PM command
+   comment, developer run, and published PR or status update.
+4. If the issue pauses, fails, or escalates, use the operator controls above
+   before retrying.
+
 ## Private Trial Evidence
 
 These live trial runs are the baseline acceptance evidence as of

exec
/bin/bash -lc 'bun test scripts/open-autonomy-fleet.test.ts' in /tmp/open-autonomy-scaffold-smoke
diff --git a/templates/self-driving-repo/README.md b/templates/self-driving-repo/README.md
index a11364d6afe936284a770a1e59d3a6eafc20d112..e93d1893c4ba6a74df13904147183695d45845ac
--- a/templates/self-driving-repo/README.md
+++ b/templates/self-driving-repo/README.md
@@ -7,13 +7,23 @@
 1. Copy these files to the target repo root.
 2. Run `bun install`.
 3. Edit `AGENTS.md` and `.open-autonomy/*` for the target repository.
-4. Set the GitHub variables and secrets listed in
+4. Set the repository variables and secrets listed in
    `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`.
 5. Confirm `bun run check` passes.
 6. Run the planner workflow in dry mode.
 7. Smoke `/agent pause`, paused `/agent develop`, `/agent status`, and
    `/agent resume`.
-8. Run one low-risk `/agent develop`.
 
+## First Issue Flow
+
+Use the first low-risk issue to prove the template works in the new repository:
+
+1. Open a small docs-only issue with clear acceptance criteria.
+2. Add the configured variables and secrets from
+   `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md` before enabling agent runs.
+3. Comment `/agent develop` on the issue and verify the PM/agent loop starts.
+4. Confirm the resulting PR or status comment reflects the issue context and
+   the repository checks still pass.
+
 This template assumes the target repo keeps the agent scripts in `scripts/` and
 the workflows in `.github/workflows/`.
diff --git a/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md b/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
index fee79844999543b3efea95fe7726cd25d4bbfc88..433ba3c5acda62638c8a82a01b34be8e21d6ceba
--- a/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
+++ b/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
@@ -77,6 +77,19 @@
   proxy runs for the issue.
 - `Model Proxy Admin` `status` shows active-run saturation and daily counters.
 
+## First Issue Flow
+
+Use the first issue to verify the scaffolded repository is wired correctly:
+
+1. Keep the issue small and low risk, ideally a docs-only change with explicit
+   acceptance criteria.
+2. Confirm the repository variables and secrets above are set before enabling
+   agent runs.
+3. Comment `/agent develop` on the issue and watch for the visible PM command
+   comment, developer run, and published PR or status update.
+4. If the issue pauses, fails, or escalates, use the operator controls above
+   before retrying.
+
 ## Private Trial Evidence
 
 These live trial runs are the baseline acceptance evidence as of

 succeeded in 111ms:
(pass) open autonomy fleet and audit surfaces > preflight passes when required files exist and reports unknown config as warnings
(pass) open autonomy fleet and audit surfaces > version metadata exists for run evidence
(pass) open autonomy fleet and audit surfaces > preflight blocks when required files are missing [1.00ms]
(pass) open autonomy fleet and audit surfaces > status can reconstruct latest state from the decision index [1.00ms]
(pass) open autonomy fleet and audit surfaces > governance report summarizes decision index outcomes [1.00ms]

::endgroup::

 5 pass
 0 fail
 15 expect() calls
Ran 5 tests across 1 file. [25.00ms]

codex
The scaffold smoke passed in a freshly copied repo. I’m checking the exact diff now so I can write the artifact summary and keep the final change report tight.
exec
/bin/bash -lc 'git diff -- templates/self-driving-repo/README.md templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md' in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
diff --git a/templates/self-driving-repo/README.md b/templates/self-driving-repo/README.md
index a11364d..e93d189 100644
--- a/templates/self-driving-repo/README.md
+++ b/templates/self-driving-repo/README.md
@@ -7,13 +7,23 @@ Copy this directory into a GitHub repository to enable open-autonomy.
 1. Copy these files to the target repo root.
 2. Run `bun install`.
 3. Edit `AGENTS.md` and `.open-autonomy/*` for the target repository.
-4. Set the GitHub variables and secrets listed in
+4. Set the repository variables and secrets listed in
    `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`.
 5. Confirm `bun run check` passes.
 6. Run the planner workflow in dry mode.
 7. Smoke `/agent pause`, paused `/agent develop`, `/agent status`, and
    `/agent resume`.
-8. Run one low-risk `/agent develop`.
+
+## First Issue Flow
+
+Use the first low-risk issue to prove the template works in the new repository:
+
+1. Open a small docs-only issue with clear acceptance criteria.
+2. Add the configured variables and secrets from
+   `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md` before enabling agent runs.
+3. Comment `/agent develop` on the issue and verify the PM/agent loop starts.
+4. Confirm the resulting PR or status comment reflects the issue context and
+   the repository checks still pass.
 
 This template assumes the target repo keeps the agent scripts in `scripts/` and
 the workflows in `.github/workflows/`.
diff --git a/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md b/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
index fee7984..433ba3c 100644
--- a/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
+++ b/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
@@ -77,6 +77,19 @@ Before opening broader access, verify these in the target repo:
   proxy runs for the issue.
 - `Model Proxy Admin` `status` shows active-run saturation and daily counters.
 
+## First Issue Flow
+
+Use the first issue to verify the scaffolded repository is wired correctly:
+
+1. Keep the issue small and low risk, ideally a docs-only change with explicit
+   acceptance criteria.
+2. Confirm the repository variables and secrets above are set before enabling
+   agent runs.
+3. Comment `/agent develop` on the issue and watch for the visible PM command
+   comment, developer run, and published PR or status update.
+4. If the issue pauses, fails, or escalates, use the operator controls above
+   before retrying.
+
 ## Private Trial Evidence
 
 These live trial runs are the baseline acceptance evidence as of

exec
/bin/bash -lc 'git status --short' in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
 M templates/self-driving-repo/README.md
 M templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md

diff --git a/templates/self-driving-repo/README.md b/templates/self-driving-repo/README.md
index a11364d6afe936284a770a1e59d3a6eafc20d112..e93d1893c4ba6a74df13904147183695d45845ac
--- a/templates/self-driving-repo/README.md
+++ b/templates/self-driving-repo/README.md
@@ -7,13 +7,23 @@
 1. Copy these files to the target repo root.
 2. Run `bun install`.
 3. Edit `AGENTS.md` and `.open-autonomy/*` for the target repository.
-4. Set the GitHub variables and secrets listed in
+4. Set the repository variables and secrets listed in
    `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`.
 5. Confirm `bun run check` passes.
 6. Run the planner workflow in dry mode.
 7. Smoke `/agent pause`, paused `/agent develop`, `/agent status`, and
    `/agent resume`.
-8. Run one low-risk `/agent develop`.
 
+## First Issue Flow
+
+Use the first low-risk issue to prove the template works in the new repository:
+
+1. Open a small docs-only issue with clear acceptance criteria.
+2. Add the configured variables and secrets from
+   `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md` before enabling agent runs.
+3. Comment `/agent develop` on the issue and verify the PM/agent loop starts.
+4. Confirm the resulting PR or status comment reflects the issue context and
+   the repository checks still pass.
+
 This template assumes the target repo keeps the agent scripts in `scripts/` and
 the workflows in `.github/workflows/`.
diff --git a/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md b/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
index fee79844999543b3efea95fe7726cd25d4bbfc88..433ba3c5acda62638c8a82a01b34be8e21d6ceba
--- a/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
+++ b/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
@@ -77,6 +77,19 @@
   proxy runs for the issue.
 - `Model Proxy Admin` `status` shows active-run saturation and daily counters.
 
+## First Issue Flow
+
+Use the first issue to verify the scaffolded repository is wired correctly:
+
+1. Keep the issue small and low risk, ideally a docs-only change with explicit
+   acceptance criteria.
+2. Confirm the repository variables and secrets above are set before enabling
+   agent runs.
+3. Comment `/agent develop` on the issue and watch for the visible PM command
+   comment, developer run, and published PR or status update.
+4. If the issue pauses, fails, or escalates, use the operator controls above
+   before retrying.
+
 ## Private Trial Evidence
 
 These live trial runs are the baseline acceptance evidence as of

codex
I have the final diff and verification. I’m writing the required PR, result, and transcript artifacts now so the job leaves behind the expected evidence.
apply patch
patch: completed
/home/runner/work/open-autonomy/open-autonomy/.agent-run/out/task/artifacts/pr.md
diff --git a/.agent-run/out/task/artifacts/pr.md b/.agent-run/out/task/artifacts/pr.md
new file mode 100644
index 0000000000000000000000000000000000000000..068443daba674c0c7eb757412bca17f618b08dea
--- /dev/null
+++ b/.agent-run/out/task/artifacts/pr.md
@@ -0,0 +1,13 @@
+# Summary
+
+Updated the self-hosted scaffold template docs to make first-time setup clearer for a newly copied repository.
+
+Changes:
+- Expanded `templates/self-driving-repo/README.md` with an explicit first-issue flow.
+- Added a `First Issue Flow` section to `templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`.
+- Clarified that the setup checklist covers repository variables and secrets before the first `/agent develop` run.
+
+# Tests
+
+- `bun scripts/scaffold-target-repo.ts --target /tmp/open-autonomy-scaffold-smoke --force`
+- `bun test scripts/open-autonomy-fleet.test.ts` in `/tmp/open-autonomy-scaffold-smoke`
diff --git a/templates/self-driving-repo/README.md b/templates/self-driving-repo/README.md
index a11364d6afe936284a770a1e59d3a6eafc20d112..e93d1893c4ba6a74df13904147183695d45845ac
--- a/templates/self-driving-repo/README.md
+++ b/templates/self-driving-repo/README.md
@@ -7,13 +7,23 @@
 1. Copy these files to the target repo root.
 2. Run `bun install`.
 3. Edit `AGENTS.md` and `.open-autonomy/*` for the target repository.
-4. Set the GitHub variables and secrets listed in
+4. Set the repository variables and secrets listed in
    `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`.
 5. Confirm `bun run check` passes.
 6. Run the planner workflow in dry mode.
 7. Smoke `/agent pause`, paused `/agent develop`, `/agent status`, and
    `/agent resume`.
-8. Run one low-risk `/agent develop`.
 
+## First Issue Flow
+
+Use the first low-risk issue to prove the template works in the new repository:
+
+1. Open a small docs-only issue with clear acceptance criteria.
+2. Add the configured variables and secrets from
+   `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md` before enabling agent runs.
+3. Comment `/agent develop` on the issue and verify the PM/agent loop starts.
+4. Confirm the resulting PR or status comment reflects the issue context and
+   the repository checks still pass.
+
 This template assumes the target repo keeps the agent scripts in `scripts/` and
 the workflows in `.github/workflows/`.
diff --git a/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md b/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
index fee79844999543b3efea95fe7726cd25d4bbfc88..433ba3c5acda62638c8a82a01b34be8e21d6ceba
--- a/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
+++ b/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
@@ -77,6 +77,19 @@
   proxy runs for the issue.
 - `Model Proxy Admin` `status` shows active-run saturation and daily counters.
 
+## First Issue Flow
+
+Use the first issue to verify the scaffolded repository is wired correctly:
+
+1. Keep the issue small and low risk, ideally a docs-only change with explicit
+   acceptance criteria.
+2. Confirm the repository variables and secrets above are set before enabling
+   agent runs.
+3. Comment `/agent develop` on the issue and watch for the visible PM command
+   comment, developer run, and published PR or status update.
+4. If the issue pauses, fails, or escalates, use the operator controls above
+   before retrying.
+
 ## Private Trial Evidence
 
 These live trial runs are the baseline acceptance evidence as of

diff --git a/.agent-run/out/task/artifacts/pr.md b/.agent-run/out/task/artifacts/pr.md
new file mode 100644
index 0000000000000000000000000000000000000000..068443daba674c0c7eb757412bca17f618b08dea
--- /dev/null
+++ b/.agent-run/out/task/artifacts/pr.md
@@ -0,0 +1,13 @@
+# Summary
+
+Updated the self-hosted scaffold template docs to make first-time setup clearer for a newly copied repository.
+
+Changes:
+- Expanded `templates/self-driving-repo/README.md` with an explicit first-issue flow.
+- Added a `First Issue Flow` section to `templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`.
+- Clarified that the setup checklist covers repository variables and secrets before the first `/agent develop` run.
+
+# Tests
+
+- `bun scripts/scaffold-target-repo.ts --target /tmp/open-autonomy-scaffold-smoke --force`
+- `bun test scripts/open-autonomy-fleet.test.ts` in `/tmp/open-autonomy-scaffold-smoke`
diff --git a/templates/self-driving-repo/README.md b/templates/self-driving-repo/README.md
index a11364d6afe936284a770a1e59d3a6eafc20d112..e93d1893c4ba6a74df13904147183695d45845ac
--- a/templates/self-driving-repo/README.md
+++ b/templates/self-driving-repo/README.md
@@ -7,13 +7,23 @@
 1. Copy these files to the target repo root.
 2. Run `bun install`.
 3. Edit `AGENTS.md` and `.open-autonomy/*` for the target repository.
-4. Set the GitHub variables and secrets listed in
+4. Set the repository variables and secrets listed in
    `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`.
 5. Confirm `bun run check` passes.
 6. Run the planner workflow in dry mode.
 7. Smoke `/agent pause`, paused `/agent develop`, `/agent status`, and
    `/agent resume`.
-8. Run one low-risk `/agent develop`.
 
+## First Issue Flow
+
+Use the first low-risk issue to prove the template works in the new repository:
+
+1. Open a small docs-only issue with clear acceptance criteria.
+2. Add the configured variables and secrets from
+   `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md` before enabling agent runs.
+3. Comment `/agent develop` on the issue and verify the PM/agent loop starts.
+4. Confirm the resulting PR or status comment reflects the issue context and
+   the repository checks still pass.
+
 This template assumes the target repo keeps the agent scripts in `scripts/` and
 the workflows in `.github/workflows/`.
diff --git a/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md b/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
index fee79844999543b3efea95fe7726cd25d4bbfc88..433ba3c5acda62638c8a82a01b34be8e21d6ceba
--- a/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
+++ b/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
@@ -77,6 +77,19 @@
   proxy runs for the issue.
 - `Model Proxy Admin` `status` shows active-run saturation and daily counters.
 
+## First Issue Flow
+
+Use the first issue to verify the scaffolded repository is wired correctly:
+
+1. Keep the issue small and low risk, ideally a docs-only change with explicit
+   acceptance criteria.
+2. Confirm the repository variables and secrets above are set before enabling
+   agent runs.
+3. Comment `/agent develop` on the issue and watch for the visible PM command
+   comment, developer run, and published PR or status update.
+4. If the issue pauses, fails, or escalates, use the operator controls above
+   before retrying.
+
 ## Private Trial Evidence
 
 These live trial runs are the baseline acceptance evidence as of

apply patch
patch: completed
/home/runner/work/open-autonomy/open-autonomy/.agent-run/out/task/artifacts/result.json
diff --git a/.agent-run/out/task/artifacts/pr.md b/.agent-run/out/task/artifacts/pr.md
new file mode 100644
index 0000000000000000000000000000000000000000..068443daba674c0c7eb757412bca17f618b08dea
--- /dev/null
+++ b/.agent-run/out/task/artifacts/pr.md
@@ -0,0 +1,13 @@
+# Summary
+
+Updated the self-hosted scaffold template docs to make first-time setup clearer for a newly copied repository.
+
+Changes:
+- Expanded `templates/self-driving-repo/README.md` with an explicit first-issue flow.
+- Added a `First Issue Flow` section to `templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`.
+- Clarified that the setup checklist covers repository variables and secrets before the first `/agent develop` run.
+
+# Tests
+
+- `bun scripts/scaffold-target-repo.ts --target /tmp/open-autonomy-scaffold-smoke --force`
+- `bun test scripts/open-autonomy-fleet.test.ts` in `/tmp/open-autonomy-scaffold-smoke`
diff --git a/.agent-run/out/task/artifacts/result.json b/.agent-run/out/task/artifacts/result.json
new file mode 100644
index 0000000000000000000000000000000000000000..1349749301efe5bdf17778186cf9ce405839ea81
--- /dev/null
+++ b/.agent-run/out/task/artifacts/result.json
@@ -0,0 +1,9 @@
+{
+  "ok": true,
+  "issue": 12,
+  "summary": "Expanded the self-driving scaffold docs with explicit repository variables/secrets guidance and a first-issue flow for newly scaffolded repos.",
+  "tests": [
+    "bun scripts/scaffold-target-repo.ts --target /tmp/open-autonomy-scaffold-smoke --force",
+    "bun test scripts/open-autonomy-fleet.test.ts in /tmp/open-autonomy-scaffold-smoke"
+  ]
+}
diff --git a/templates/self-driving-repo/README.md b/templates/self-driving-repo/README.md
index a11364d6afe936284a770a1e59d3a6eafc20d112..e93d1893c4ba6a74df13904147183695d45845ac
--- a/templates/self-driving-repo/README.md
+++ b/templates/self-driving-repo/README.md
@@ -7,13 +7,23 @@
 1. Copy these files to the target repo root.
 2. Run `bun install`.
 3. Edit `AGENTS.md` and `.open-autonomy/*` for the target repository.
-4. Set the GitHub variables and secrets listed in
+4. Set the repository variables and secrets listed in
    `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`.
 5. Confirm `bun run check` passes.
 6. Run the planner workflow in dry mode.
 7. Smoke `/agent pause`, paused `/agent develop`, `/agent status`, and
    `/agent resume`.
-8. Run one low-risk `/agent develop`.
 
+## First Issue Flow
+
+Use the first low-risk issue to prove the template works in the new repository:
+
+1. Open a small docs-only issue with clear acceptance criteria.
+2. Add the configured variables and secrets from
+   `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md` before enabling agent runs.
+3. Comment `/agent develop` on the issue and verify the PM/agent loop starts.
+4. Confirm the resulting PR or status comment reflects the issue context and
+   the repository checks still pass.
+
 This template assumes the target repo keeps the agent scripts in `scripts/` and
 the workflows in `.github/workflows/`.
diff --git a/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md b/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
index fee79844999543b3efea95fe7726cd25d4bbfc88..433ba3c5acda62638c8a82a01b34be8e21d6ceba
--- a/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
+++ b/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
@@ -77,6 +77,19 @@
   proxy runs for the issue.
 - `Model Proxy Admin` `status` shows active-run saturation and daily counters.
 
+## First Issue Flow
+
+Use the first issue to verify the scaffolded repository is wired correctly:
+
+1. Keep the issue small and low risk, ideally a docs-only change with explicit
+   acceptance criteria.
+2. Confirm the repository variables and secrets above are set before enabling
+   agent runs.
+3. Comment `/agent develop` on the issue and watch for the visible PM command
+   comment, developer run, and published PR or status update.
+4. If the issue pauses, fails, or escalates, use the operator controls above
+   before retrying.
+
 ## Private Trial Evidence
 
 These live trial runs are the baseline acceptance evidence as of

diff --git a/.agent-run/out/task/artifacts/pr.md b/.agent-run/out/task/artifacts/pr.md
new file mode 100644
index 0000000000000000000000000000000000000000..068443daba674c0c7eb757412bca17f618b08dea
--- /dev/null
+++ b/.agent-run/out/task/artifacts/pr.md
@@ -0,0 +1,13 @@
+# Summary
+
+Updated the self-hosted scaffold template docs to make first-time setup clearer for a newly copied repository.
+
+Changes:
+- Expanded `templates/self-driving-repo/README.md` with an explicit first-issue flow.
+- Added a `First Issue Flow` section to `templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`.
+- Clarified that the setup checklist covers repository variables and secrets before the first `/agent develop` run.
+
+# Tests
+
+- `bun scripts/scaffold-target-repo.ts --target /tmp/open-autonomy-scaffold-smoke --force`
+- `bun test scripts/open-autonomy-fleet.test.ts` in `/tmp/open-autonomy-scaffold-smoke`
diff --git a/.agent-run/out/task/artifacts/result.json b/.agent-run/out/task/artifacts/result.json
new file mode 100644
index 0000000000000000000000000000000000000000..1349749301efe5bdf17778186cf9ce405839ea81
--- /dev/null
+++ b/.agent-run/out/task/artifacts/result.json
@@ -0,0 +1,9 @@
+{
+  "ok": true,
+  "issue": 12,
+  "summary": "Expanded the self-driving scaffold docs with explicit repository variables/secrets guidance and a first-issue flow for newly scaffolded repos.",
+  "tests": [
+    "bun scripts/scaffold-target-repo.ts --target /tmp/open-autonomy-scaffold-smoke --force",
+    "bun test scripts/open-autonomy-fleet.test.ts in /tmp/open-autonomy-scaffold-smoke"
+  ]
+}
diff --git a/templates/self-driving-repo/README.md b/templates/self-driving-repo/README.md
index a11364d6afe936284a770a1e59d3a6eafc20d112..e93d1893c4ba6a74df13904147183695d45845ac
--- a/templates/self-driving-repo/README.md
+++ b/templates/self-driving-repo/README.md
@@ -7,13 +7,23 @@
 1. Copy these files to the target repo root.
 2. Run `bun install`.
 3. Edit `AGENTS.md` and `.open-autonomy/*` for the target repository.
-4. Set the GitHub variables and secrets listed in
+4. Set the repository variables and secrets listed in
    `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`.
 5. Confirm `bun run check` passes.
 6. Run the planner workflow in dry mode.
 7. Smoke `/agent pause`, paused `/agent develop`, `/agent status`, and
    `/agent resume`.
-8. Run one low-risk `/agent develop`.
 
+## First Issue Flow
+
+Use the first low-risk issue to prove the template works in the new repository:
+
+1. Open a small docs-only issue with clear acceptance criteria.
+2. Add the configured variables and secrets from
+   `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md` before enabling agent runs.
+3. Comment `/agent develop` on the issue and verify the PM/agent loop starts.
+4. Confirm the resulting PR or status comment reflects the issue context and
+   the repository checks still pass.
+
 This template assumes the target repo keeps the agent scripts in `scripts/` and
 the workflows in `.github/workflows/`.
diff --git a/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md b/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
index fee79844999543b3efea95fe7726cd25d4bbfc88..433ba3c5acda62638c8a82a01b34be8e21d6ceba
--- a/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
+++ b/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
@@ -77,6 +77,19 @@
   proxy runs for the issue.
 - `Model Proxy Admin` `status` shows active-run saturation and daily counters.
 
+## First Issue Flow
+
+Use the first issue to verify the scaffolded repository is wired correctly:
+
+1. Keep the issue small and low risk, ideally a docs-only change with explicit
+   acceptance criteria.
+2. Confirm the repository variables and secrets above are set before enabling
+   agent runs.
+3. Comment `/agent develop` on the issue and watch for the visible PM command
+   comment, developer run, and published PR or status update.
+4. If the issue pauses, fails, or escalates, use the operator controls above
+   before retrying.
+
 ## Private Trial Evidence
 
 These live trial runs are the baseline acceptance evidence as of

apply patch
patch: completed
/home/runner/work/open-autonomy/open-autonomy/.agent-run/out/task/artifacts/transcript.md
diff --git a/.agent-run/out/task/artifacts/pr.md b/.agent-run/out/task/artifacts/pr.md
new file mode 100644
index 0000000000000000000000000000000000000000..068443daba674c0c7eb757412bca17f618b08dea
--- /dev/null
+++ b/.agent-run/out/task/artifacts/pr.md
@@ -0,0 +1,13 @@
+# Summary
+
+Updated the self-hosted scaffold template docs to make first-time setup clearer for a newly copied repository.
+
+Changes:
+- Expanded `templates/self-driving-repo/README.md` with an explicit first-issue flow.
+- Added a `First Issue Flow` section to `templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`.
+- Clarified that the setup checklist covers repository variables and secrets before the first `/agent develop` run.
+
+# Tests
+
+- `bun scripts/scaffold-target-repo.ts --target /tmp/open-autonomy-scaffold-smoke --force`
+- `bun test scripts/open-autonomy-fleet.test.ts` in `/tmp/open-autonomy-scaffold-smoke`
diff --git a/.agent-run/out/task/artifacts/result.json b/.agent-run/out/task/artifacts/result.json
new file mode 100644
index 0000000000000000000000000000000000000000..1349749301efe5bdf17778186cf9ce405839ea81
--- /dev/null
+++ b/.agent-run/out/task/artifacts/result.json
@@ -0,0 +1,9 @@
+{
+  "ok": true,
+  "issue": 12,
+  "summary": "Expanded the self-driving scaffold docs with explicit repository variables/secrets guidance and a first-issue flow for newly scaffolded repos.",
+  "tests": [
+    "bun scripts/scaffold-target-repo.ts --target /tmp/open-autonomy-scaffold-smoke --force",
+    "bun test scripts/open-autonomy-fleet.test.ts in /tmp/open-autonomy-scaffold-smoke"
+  ]
+}
diff --git a/.agent-run/out/task/artifacts/transcript.md b/.agent-run/out/task/artifacts/transcript.md
new file mode 100644
index 0000000000000000000000000000000000000000..9a2208682333f4e0c8eef0febe31188a1d3f76fa
--- /dev/null
+++ b/.agent-run/out/task/artifacts/transcript.md
@@ -0,0 +1,7 @@
+Changed the self-driving template docs to cover:
+- repository variables and secrets in the setup checklist
+- a dedicated first-issue flow for a newly scaffolded repo
+
+Verified by:
+- scaffolding the template into /tmp/open-autonomy-scaffold-smoke
+- running `bun test scripts/open-autonomy-fleet.test.ts` in the scaffolded repo
diff --git a/templates/self-driving-repo/README.md b/templates/self-driving-repo/README.md
index a11364d6afe936284a770a1e59d3a6eafc20d112..e93d1893c4ba6a74df13904147183695d45845ac
--- a/templates/self-driving-repo/README.md
+++ b/templates/self-driving-repo/README.md
@@ -7,13 +7,23 @@
 1. Copy these files to the target repo root.
 2. Run `bun install`.
 3. Edit `AGENTS.md` and `.open-autonomy/*` for the target repository.
-4. Set the GitHub variables and secrets listed in
+4. Set the repository variables and secrets listed in
    `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`.
 5. Confirm `bun run check` passes.
 6. Run the planner workflow in dry mode.
 7. Smoke `/agent pause`, paused `/agent develop`, `/agent status`, and
    `/agent resume`.
-8. Run one low-risk `/agent develop`.
 
+## First Issue Flow
+
+Use the first low-risk issue to prove the template works in the new repository:
+
+1. Open a small docs-only issue with clear acceptance criteria.
+2. Add the configured variables and secrets from
+   `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md` before enabling agent runs.
+3. Comment `/agent develop` on the issue and verify the PM/agent loop starts.
+4. Confirm the resulting PR or status comment reflects the issue context and
+   the repository checks still pass.
+
 This template assumes the target repo keeps the agent scripts in `scripts/` and
 the workflows in `.github/workflows/`.
diff --git a/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md b/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
index fee79844999543b3efea95fe7726cd25d4bbfc88..433ba3c5acda62638c8a82a01b34be8e21d6ceba
--- a/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
+++ b/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
@@ -77,6 +77,19 @@
   proxy runs for the issue.
 - `Model Proxy Admin` `status` shows active-run saturation and daily counters.
 
+## First Issue Flow
+
+Use the first issue to verify the scaffolded repository is wired correctly:
+
+1. Keep the issue small and low risk, ideally a docs-only change with explicit
+   acceptance criteria.
+2. Confirm the repository variables and secrets above are set before enabling
+   agent runs.
+3. Comment `/agent develop` on the issue and watch for the visible PM command
+   comment, developer run, and published PR or status update.
+4. If the issue pauses, fails, or escalates, use the operator controls above
+   before retrying.
+
 ## Private Trial Evidence
 
 These live trial runs are the baseline acceptance evidence as of

diff --git a/.agent-run/out/task/artifacts/pr.md b/.agent-run/out/task/artifacts/pr.md
new file mode 100644
index 0000000000000000000000000000000000000000..068443daba674c0c7eb757412bca17f618b08dea
--- /dev/null
+++ b/.agent-run/out/task/artifacts/pr.md
@@ -0,0 +1,13 @@
+# Summary
+
+Updated the self-hosted scaffold template docs to make first-time setup clearer for a newly copied repository.
+
+Changes:
+- Expanded `templates/self-driving-repo/README.md` with an explicit first-issue flow.
+- Added a `First Issue Flow` section to `templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`.
+- Clarified that the setup checklist covers repository variables and secrets before the first `/agent develop` run.
+
+# Tests
+
+- `bun scripts/scaffold-target-repo.ts --target /tmp/open-autonomy-scaffold-smoke --force`
+- `bun test scripts/open-autonomy-fleet.test.ts` in `/tmp/open-autonomy-scaffold-smoke`
diff --git a/.agent-run/out/task/artifacts/result.json b/.agent-run/out/task/artifacts/result.json
new file mode 100644
index 0000000000000000000000000000000000000000..1349749301efe5bdf17778186cf9ce405839ea81
--- /dev/null
+++ b/.agent-run/out/task/artifacts/result.json
@@ -0,0 +1,9 @@
+{
+  "ok": true,
+  "issue": 12,
+  "summary": "Expanded the self-driving scaffold docs with explicit repository variables/secrets guidance and a first-issue flow for newly scaffolded repos.",
+  "tests": [
+    "bun scripts/scaffold-target-repo.ts --target /tmp/open-autonomy-scaffold-smoke --force",
+    "bun test scripts/open-autonomy-fleet.test.ts in /tmp/open-autonomy-scaffold-smoke"
+  ]
+}
diff --git a/.agent-run/out/task/artifacts/transcript.md b/.agent-run/out/task/artifacts/transcript.md
new file mode 100644
index 0000000000000000000000000000000000000000..9a2208682333f4e0c8eef0febe31188a1d3f76fa
--- /dev/null
+++ b/.agent-run/out/task/artifacts/transcript.md
@@ -0,0 +1,7 @@
+Changed the self-driving template docs to cover:
+- repository variables and secrets in the setup checklist
+- a dedicated first-issue flow for a newly scaffolded repo
+
+Verified by:
+- scaffolding the template into /tmp/open-autonomy-scaffold-smoke
+- running `bun test scripts/open-autonomy-fleet.test.ts` in the scaffolded repo
diff --git a/templates/self-driving-repo/README.md b/templates/self-driving-repo/README.md
index a11364d6afe936284a770a1e59d3a6eafc20d112..e93d1893c4ba6a74df13904147183695d45845ac
--- a/templates/self-driving-repo/README.md
+++ b/templates/self-driving-repo/README.md
@@ -7,13 +7,23 @@
 1. Copy these files to the target repo root.
 2. Run `bun install`.
 3. Edit `AGENTS.md` and `.open-autonomy/*` for the target repository.
-4. Set the GitHub variables and secrets listed in
+4. Set the repository variables and secrets listed in
    `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`.
 5. Confirm `bun run check` passes.
 6. Run the planner workflow in dry mode.
 7. Smoke `/agent pause`, paused `/agent develop`, `/agent status`, and
    `/agent resume`.
-8. Run one low-risk `/agent develop`.
 
+## First Issue Flow
+
+Use the first low-risk issue to prove the template works in the new repository:
+
+1. Open a small docs-only issue with clear acceptance criteria.
+2. Add the configured variables and secrets from
+   `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md` before enabling agent runs.
+3. Comment `/agent develop` on the issue and verify the PM/agent loop starts.
+4. Confirm the resulting PR or status comment reflects the issue context and
+   the repository checks still pass.
+
 This template assumes the target repo keeps the agent scripts in `scripts/` and
 the workflows in `.github/workflows/`.
diff --git a/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md b/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
index fee79844999543b3efea95fe7726cd25d4bbfc88..433ba3c5acda62638c8a82a01b34be8e21d6ceba
--- a/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
+++ b/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
@@ -77,6 +77,19 @@
   proxy runs for the issue.
 - `Model Proxy Admin` `status` shows active-run saturation and daily counters.
 
+## First Issue Flow
+
+Use the first issue to verify the scaffolded repository is wired correctly:
+
+1. Keep the issue small and low risk, ideally a docs-only change with explicit
+   acceptance criteria.
+2. Confirm the repository variables and secrets above are set before enabling
+   agent runs.
+3. Comment `/agent develop` on the issue and watch for the visible PM command
+   comment, developer run, and published PR or status update.
+4. If the issue pauses, fails, or escalates, use the operator controls above
+   before retrying.
+
 ## Private Trial Evidence
 
 These live trial runs are the baseline acceptance evidence as of

codex
Implemented a small docs-only change for the self-hosted fleet scaffold.

What changed:
- Updated [templates/self-driving-repo/README.md](/home/runner/work/open-autonomy/open-autonomy/templates/self-driving-repo/README.md) to explicitly call out repository variables, secrets, and a first-issue flow.
- Added a dedicated `First Issue Flow` section to [templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md](/home/runner/work/open-autonomy/open-autonomy/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md).

Verification:
- Scaffoled the template into `/tmp/open-autonomy-scaffold-smoke`.
- Ran `bun test scripts/open-autonomy-fleet.test.ts` in the scaffolded repo successfully.

Artifacts written:
- [pr.md](/home/runner/work/open-autonomy/open-autonomy/.agent-run/out/task/artifacts/pr.md)
- [result.json](/home/runner/work/open-autonomy/open-autonomy/.agent-run/out/task/artifacts/result.json)
- [transcript.md](/home/runner/work/open-autonomy/open-autonomy/.agent-run/out/task/artifacts/transcript.md)
diff --git a/.agent-run/out/task/artifacts/pr.md b/.agent-run/out/task/artifacts/pr.md
new file mode 100644
index 0000000000000000000000000000000000000000..068443daba674c0c7eb757412bca17f618b08dea
--- /dev/null
+++ b/.agent-run/out/task/artifacts/pr.md
@@ -0,0 +1,13 @@
+# Summary
+
+Updated the self-hosted scaffold template docs to make first-time setup clearer for a newly copied repository.
+
+Changes:
+- Expanded `templates/self-driving-repo/README.md` with an explicit first-issue flow.
+- Added a `First Issue Flow` section to `templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`.
+- Clarified that the setup checklist covers repository variables and secrets before the first `/agent develop` run.
+
+# Tests
+
+- `bun scripts/scaffold-target-repo.ts --target /tmp/open-autonomy-scaffold-smoke --force`
+- `bun test scripts/open-autonomy-fleet.test.ts` in `/tmp/open-autonomy-scaffold-smoke`
diff --git a/.agent-run/out/task/artifacts/result.json b/.agent-run/out/task/artifacts/result.json
new file mode 100644
index 0000000000000000000000000000000000000000..1349749301efe5bdf17778186cf9ce405839ea81
--- /dev/null
+++ b/.agent-run/out/task/artifacts/result.json
@@ -0,0 +1,9 @@
+{
+  "ok": true,
+  "issue": 12,
+  "summary": "Expanded the self-driving scaffold docs with explicit repository variables/secrets guidance and a first-issue flow for newly scaffolded repos.",
+  "tests": [
+    "bun scripts/scaffold-target-repo.ts --target /tmp/open-autonomy-scaffold-smoke --force",
+    "bun test scripts/open-autonomy-fleet.test.ts in /tmp/open-autonomy-scaffold-smoke"
+  ]
+}
diff --git a/.agent-run/out/task/artifacts/transcript.md b/.agent-run/out/task/artifacts/transcript.md
new file mode 100644
index 0000000000000000000000000000000000000000..9a2208682333f4e0c8eef0febe31188a1d3f76fa
--- /dev/null
+++ b/.agent-run/out/task/artifacts/transcript.md
@@ -0,0 +1,7 @@
+Changed the self-driving template docs to cover:
+- repository variables and secrets in the setup checklist
+- a dedicated first-issue flow for a newly scaffolded repo
+
+Verified by:
+- scaffolding the template into /tmp/open-autonomy-scaffold-smoke
+- running `bun test scripts/open-autonomy-fleet.test.ts` in the scaffolded repo
diff --git a/templates/self-driving-repo/README.md b/templates/self-driving-repo/README.md
index a11364d6afe936284a770a1e59d3a6eafc20d112..e93d1893c4ba6a74df13904147183695d45845ac
--- a/templates/self-driving-repo/README.md
+++ b/templates/self-driving-repo/README.md
@@ -7,13 +7,23 @@
 1. Copy these files to the target repo root.
 2. Run `bun install`.
 3. Edit `AGENTS.md` and `.open-autonomy/*` for the target repository.
-4. Set the GitHub variables and secrets listed in
+4. Set the repository variables and secrets listed in
    `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`.
 5. Confirm `bun run check` passes.
 6. Run the planner workflow in dry mode.
 7. Smoke `/agent pause`, paused `/agent develop`, `/agent status`, and
    `/agent resume`.
-8. Run one low-risk `/agent develop`.
 
+## First Issue Flow
+
+Use the first low-risk issue to prove the template works in the new repository:
+
+1. Open a small docs-only issue with clear acceptance criteria.
+2. Add the configured variables and secrets from
+   `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md` before enabling agent runs.
+3. Comment `/agent develop` on the issue and verify the PM/agent loop starts.
+4. Confirm the resulting PR or status comment reflects the issue context and
+   the repository checks still pass.
+
 This template assumes the target repo keeps the agent scripts in `scripts/` and
 the workflows in `.github/workflows/`.
diff --git a/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md b/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
index fee79844999543b3efea95fe7726cd25d4bbfc88..433ba3c5acda62638c8a82a01b34be8e21d6ceba
--- a/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
+++ b/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
@@ -77,6 +77,19 @@
   proxy runs for the issue.
 - `Model Proxy Admin` `status` shows active-run saturation and daily counters.
 
+## First Issue Flow
+
+Use the first issue to verify the scaffolded repository is wired correctly:
+
+1. Keep the issue small and low risk, ideally a docs-only change with explicit
+   acceptance criteria.
+2. Confirm the repository variables and secrets above are set before enabling
+   agent runs.
+3. Comment `/agent develop` on the issue and watch for the visible PM command
+   comment, developer run, and published PR or status update.
+4. If the issue pauses, fails, or escalates, use the operator controls above
+   before retrying.
+
 ## Private Trial Evidence
 
 These live trial runs are the baseline acceptance evidence as of

tokens used
47,285
```
