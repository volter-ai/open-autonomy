# Codex Agent Transcript

Model: gpt-5.4-mini
Exit code: 0

## Final Message

Implemented the docs-only OSS-readiness fix.

- Updated the three cookbook example READMEs so they explicitly describe the repos as pushable standalone demos and link to local `docs/ROADMAP.md`.
- Added a root-roadmap pointer to each cookbook roadmap doc.
- Clarified release evidence in [docs/RELEASE.md](/home/runner/work/open-autonomy/open-autonomy/docs/RELEASE.md) and [docs/PROOF_LEDGER.md](/home/runner/work/open-autonomy/open-autonomy/docs/PROOF_LEDGER.md) so `release-dogfood` points at committed artifacts.

Verification:
- `git diff --check`
- targeted `rg` checks for the new wording and links

Artifacts written:
- [.agent-run/out/task/artifacts/pr.md](/home/runner/work/open-autonomy/open-autonomy/.agent-run/out/task/artifacts/pr.md)
- [.agent-run/out/task/artifacts/result.json](/home/runner/work/open-autonomy/open-autonomy/.agent-run/out/task/artifacts/result.json)
- [.agent-run/out/task/artifacts/transcript.md](/home/runner/work/open-autonomy/open-autonomy/.agent-run/out/task/artifacts/transcript.md)

I did not run the full Bun check suite because this change is documentation-only.

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
session id: 019ed644-b355-7142-ad86-91f931ee8bdc
--------
user
You are running as the public Volter self-building agent in a bounded GitHub Actions job.

Implement the GitHub issue in this repository. Make a small but real code or documentation change that directly addresses the issue. Do not make unrelated refactors.

Issue #16: [roadmap:public-oss-readiness] Public OSS Readiness

Roadmap item: `public-oss-readiness`
Phase: 13
Priority: medium
Proof gate: `release-dogfood`

Acceptance criteria:
- Cookbook examples are pushable repos with local docs and root roadmap links.
- Release evidence is reproducible from committed artifacts.

Planner origin: roadmap-planner

Resolved public-agent context:
```json
{
  "target": {
    "kind": "issue",
    "issue": 16,
    "pull_request": null,
    "branch": "agent/issue-16",
    "can_develop": true
  },
  "issue": {
    "body": "Roadmap item: `public-oss-readiness`\nPhase: 13\nPriority: medium\nProof gate: `release-dogfood`\n\nAcceptance criteria:\n- Cookbook examples are pushable repos with local docs and root roadmap links.\n- Release evidence is reproducible from committed artifacts.\n\nPlanner origin: roadmap-planner",
    "comments": [
      {
        "author": {
          "login": "github-actions"
        },
        "authorAssociation": "CONTRIBUTOR",
        "body": "/agent develop\n\nPM reason: The issue includes clear acceptance criteria and is fully scoped for development.",
        "createdAt": "2026-06-17T15:46:58Z",
        "id": "IC_kwDOS8izs88AAAABGhNT_g",
        "includesCreatedEdit": false,
        "isMinimized": false,
        "minimizedReason": "",
        "reactionGroups": [],
        "url": "https://github.com/volter-ai/open-autonomy/issues/16#issuecomment-4732441598",
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
        "id": "LA_kwDOS8izs88AAAACnxBrjA",
        "name": "proof:release-dogfood"
      },
      {
        "color": "1D76DB",
        "description": "Open Autonomy planner label",
        "id": "LA_kwDOS8izs88AAAACnxBtFg",
        "name": "roadmap:phase-13"
      }
    ],
    "number": 16,
    "title": "[roadmap:public-oss-readiness] Public OSS Readiness",
    "user": {
      "login": "app/github-actions"
    }
  },
  "recent_issue_comments": [
    {
      "id": "IC_kwDOS8izs88AAAABGhNT_g",
      "author": {
        "login": "github-actions"
      },
      "authorAssociation": "CONTRIBUTOR",
      "body": "/agent develop\n\nPM reason: The issue includes clear acceptance criteria and is fully scoped for development.",
      "createdAt": "2026-06-17T15:46:58Z",
      "includesCreatedEdit": false,
      "isMinimized": false,
      "minimizedReason": "",
      "reactionGroups": [],
      "url": "https://github.com/volter-ai/open-autonomy/issues/16#issuecomment-4732441598",
      "viewerDidAuthor": true
    }
  ],
  "previous_decisions": [],
  "control_files": {
    "documents": {
      "agents": "# Agent Guidance\n\nOpen Autonomy maintains this repository through issues, bounded agent runs,\nreview gates, and committed evidence. Agents working here must preserve the\npublic OSS contract: small scoped changes, deterministic safety checks, visible\nstatus, and reversible maintainer control.\n\nRead these files before changing behavior:\n\n- `docs/ARCHITECTURE.md` for the system model and document map.\n- `docs/ROADMAP.md` for current direction.\n- `docs/CONSTITUTION.md` for non-negotiable operating principles.\n- `.open-autonomy/review-rubric.yml` for review criteria.\n- `docs/standards/*.md` for code, docs, tests, and security rules.\n- `.codex/skills/open-autonomy-*/SKILL.md` for repo-local agent skills.\n- `.open-autonomy/autonomy.yml` for docs, skills, agents, triggers,\n  capabilities, and enforced policy.\n\nDefault to the existing TypeScript/Bun workflow and GitHub Actions patterns.\nDo not introduce unrelated frameworks, hidden state, or silent no-op behavior.\n",
      "architecture": "# open-autonomy Architecture\n\n`open-autonomy` makes a GitHub repository operate through visible issues,\nbounded agent runs, deterministic write gates, reviewer checks, and maintainer\ncontrols. The repository remains the source of truth: issues define executable\nwork, PRs carry proposed changes, committed/session evidence explains what\nhappened, and committed autonomy config plus workflow gates decide what\nautomation may do.\n\n## System Shape\n\n```text\nroadmap + repo standards + issues\n  -> planner/PM triage\n  -> visible /agent command\n  -> trusted setup + target/autonomy/triage checks\n  -> untrusted developer agent in GitHub Actions\n  -> trusted publisher validates bundle and opens/updates PR\n  -> CI + reviewer\n  -> deterministic merge gate\n  -> merge, retry, wait, or human-required escalation\n```\n\nThe model can propose work. Deterministic code decides whether that work can be\npublished, retried, merged, or escalated.\n\n## Repositories\n\n- `open-autonomy`: canonical OSS implementation and first dogfooding target.\n- `templates/self-driving-repo`: copyable starter for another self-driving repo.\n- `examples/docs-only`: minimal cookbook repo.\n- `examples/testbed`: disposable cookbook/test fixture.\n- `open-autonomy-testbed`: live external repo used to prove behavior on GitHub.\n\nFuture target repositories should install the workflows/scripts/template, then\nkeep repo-specific direction, policy, and standards in their own committed\nfiles.\n\n## Agent Roles\n\n| Role | Purpose | Main inputs | Main output |\n| --- | --- | --- | --- |\n| Planner | Turns roadmap direction into issues | roadmap, issue/PR state, decision history | created/updated/prioritized issues |\n| PM/Triage | Decides what should happen to an issue now | issue, labels, comments, open PRs, active runs, autonomy config | visible comment, labels, dispatch decision |\n| Developer | Produces a bounded patch proposal | issue, acceptance criteria, repo guidance, prior decisions | publisher bundle |\n| Publisher | Applies only valid bundles | bundle, manifest, patch, autonomy config | PR or rejected publish decision |\n| Reviewer | Judges PR quality and risk | PR diff, CI, issue, rubric, standards, autonomy config | structured review decision |\n| Merge Gate | Makes final deterministic merge decision | publisher, CI, review, PR head SHA, blockers, retry budget | merge/retry/wait/human-required |\n| Operator | Lets maintainers control the system | issue comments, labels, run/proxy state | pause/resume/status/cancel/retry effects |\n\nPlanner is directional. PM is operational. Developer and reviewer use model\njudgment. Publisher and merge gate are deterministic enforcement points.\n\n## Trust Boundaries\n\n- The developer agent runs as an untrusted job with read-only repository access.\n- Raw provider API keys are never passed to the agent job.\n- The agent receives a bounded model token through the model proxy.\n- The agent emits a bundle; it does not push to the repository.\n- The trusted publisher validates the bundle before writing a branch or PR.\n- The merge gate only merges when current CI, current review, current PR head,\n  autonomy config, and maintainer blockers all agree.\n\nThis split is the core safety model. Prose instructions guide agents; the\npolicy section of `autonomy.yml` and workflow code enforce limits.\n\n## Documentation Map\n\n| Document | Scope | Used by |\n| --- | --- | --- |\n| `README.md` | Product overview and quickstart | humans |\n| `docs/ARCHITECTURE.md` | Master map of the system | humans, agents needing orientation |\n| `docs/PUBLIC_AGENT_ACTIONS.md` | Detailed workflow/trust model and command architecture | maintainers, implementers |\n| `docs/OSS_AGENT_RUNBOOK.md` | Local checks, live smoke tests, operator commands | maintainers/operators |\n| `docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md` | Enablement checklist for a target repo | maintainers |\n| `docs/ROADMAP.md` | Continuous roadmap, proof gates, and expanded product direction | planner/maintainers |\n| `examples/testbed/docs/TEST_MATRIX.md` | Live scenario catalog | testbed operators |\n| `examples/testbed/docs/TEST_RUNS.md` | Live proof ledger | testbed operators, roadmap audit |\n\n`docs/ROADMAP.md` is the only canonical roadmap. The roadmap should explain\ndirection; issues should execute work; runbooks should explain operation;\ndecision records should prove what happened.\n\n## Target Repo Control Files\n\nThe clean target shape is:\n\n```text\nAGENTS.md\n.codex/\n  skills/\n    open-autonomy-pm/SKILL.md\n    open-autonomy-developer/SKILL.md\n    open-autonomy-reviewer/SKILL.md\n    open-autonomy-planner/SKILL.md\n    open-autonomy-upgrade/SKILL.md\n.open-autonomy/\n  autonomy.yml\n  roadmap.yml\n  review-rubric.yml\ndocs/\n  CONSTITUTION.md\n  PROJECT.md\n  ROADMAP.md\n  ARCHITECTURE.md\n  standards/\n    code.md\n    docs.md\n    tests.md\n    security.md\n```\n\n- `AGENTS.md`: short always-loaded guidance shared across coding agents.\n- `.codex/skills/*/SKILL.md`: repo-local Codex skills for each agent role.\n- `autonomy.yml`: Open Autonomy index of docs, skills, agents, triggers, and\n  capabilities, plus machine-readable path, retry, budget, autonomy, and merge\n  policy.\n- `docs/CONSTITUTION.md`: non-negotiable principles and product standards.\n- `roadmap.yml`: planner-readable direction, priorities, dependencies, and proof\n  gates.\n- `review-rubric.yml`: structured reviewer criteria.\n- `docs/standards/*`: scoped implementation guidance.\n\n## Evidence And State\n\nEach autonomous path should leave visible evidence:\n\n- issue comments and labels for user-visible state\n- workflow artifacts for raw run output\n- `agent-sessions/run_*/` for promoted session evidence\n- `decisions/*` records for target, triage, develop, publish, CI, review, retry,\n  merge-gate, and close decisions\n- PR comments/body for reviewable human context\n\nThe durable end state should be a queryable decision index. Until then, the\nsession folders, decision records, issue/PR comments, and testbed ledger are the\naudit trail.\n\n## Operating Rules\n\n- Work starts from issues, PR comments, or explicit maintainer commands.\n- PM and planner actions must be visible; silent skips are only acceptable when\n  a current visible status already exists.\n- Risky, unclear, blocked, or repeatedly failing work escalates to humans.\n- Publisher policy handles write safety; reviewer handles product/code quality;\n  merge gate handles final merge safety.\n- Live proof in the testbed is required before claiming roadmap completion.\n",
      "autonomy": "schema: open-autonomy.autonomy.v1\ndocuments:\n  autonomy: .open-autonomy/autonomy.yml\n  agents: AGENTS.md\n  architecture: docs/ARCHITECTURE.md\n  constitution: docs/CONSTITUTION.md\n  project: docs/PROJECT.md\n  roadmap: .open-autonomy/roadmap.yml\n  review_rubric: .open-autonomy/review-rubric.yml\n  standards:\n    code: docs/standards/code.md\n    docs: docs/standards/docs.md\n    security: docs/standards/security.md\n    tests: docs/standards/tests.md\nskills:\n  pm: .codex/skills/open-autonomy-pm\n  developer: .codex/skills/open-autonomy-developer\n  reviewer: .codex/skills/open-autonomy-reviewer\n  planner: .codex/skills/open-autonomy-planner\n  upgrade: .codex/skills/open-autonomy-upgrade\nagents:\n  pm:\n    skill: open-autonomy-pm\n    triggers:\n      schedule: \"*/30 * * * *\"\n      workflow_dispatch: true\n      issue_comment: true\n    capabilities:\n      - issue:comment\n      - issue:label\n      - workflow:dispatch\n  developer:\n    skill: open-autonomy-developer\n    capabilities:\n      - branch:write\n      - pr:open\n      - pr:update\n      - issue:comment\n  reviewer:\n    skill: open-autonomy-reviewer\n    capabilities:\n      - pr:comment\n      - pr:review\n      - workflow:dispatch\n  planner:\n    skill: open-autonomy-planner\n    capabilities:\n      - issue:comment\n      - issue:label\n      - issue:create\n      - issue:update\n  upgrade:\n    skill: open-autonomy-upgrade\n    capabilities:\n      - pr:open\n      - pr:update\npolicy:\n  autonomy:\n    max_open_agent_prs: 5\n    max_develop_attempts: 2\n    max_ci_retries: 2\n    max_review_retries: 2\n    stale_needs_info_minutes: 10080\n    require_visible_pm_status: true\n    require_decision_records: true\n    require_acceptance_evidence: true\n  risk:\n    human_required_paths:\n      - \".github/workflows/**\"\n      - \".open-autonomy/autonomy.yml\"\n      - \"docs/CONSTITUTION.md\"\n      - \".codex/skills/**\"\n      - \"services/**/wrangler.toml\"\n    human_required_topics:\n      - auth\n      - secrets\n      - billing\n      - deployment\n      - destructive data migration\n      - dependency trust\n  merge:\n    require_ci: true\n    require_low_risk_review: true\n    require_current_head_sha: true\n    maintainer_block_labels:\n      - do-not-merge\n      - human-required\n      - agent-blocked\n  planner:\n    enabled: true\n    issue_origin_label_prefix: \"origin:\"\n    phase_label_prefix: \"roadmap:\"\n    priority_labels:\n      high: \"priority:high\"\n      medium: \"priority:medium\"\n      low: \"priority:low\"\n",
      "constitution": "# Open Autonomy Constitution\n\n1. User and maintainer intent is authoritative. Autonomous work must stay within\n   the issue, roadmap, policy, and explicit maintainer comments.\n2. Every meaningful autonomous decision must be visible through comments,\n   artifacts, committed decisions, or status reconstruction.\n3. The developer may propose code; deterministic publisher, CI, reviewer, and\n   merge gates decide whether it can progress.\n4. Risky changes require human attention. Workflow, auth, secrets, billing,\n   deployment, dependency trust, and broad rewrites are never silently merged.\n5. Retry loops are bounded by stable failure signatures and attempt budgets.\n6. The system must be portable OSS. A new repository should be able to install\n   the template, configure secrets/variables, seed issues, and run itself.\n7. Testbed proof is part of done. Roadmap items are complete only when their\n   stated testbed evidence exists or a deterministic fixture proves the same\n   gate without model spend.\n",
      "project": "# Open Autonomy Project\n\nOpen Autonomy is an OSS self-driving repository template and runtime. It uses\nrepository-local control files, Codex skills, GitHub workflows, and deterministic\nguards to move issues toward reviewed pull requests.\n\nThe canonical repository dogfoods Open Autonomy, and the live testbed proves\nagent behavior on disposable issues before expanding autonomy.\n",
      "review_rubric": "schema: open-autonomy.review-rubric.v1\ncriteria:\n  - id: scope\n    title: Scope control\n    pass: Change matches the issue, roadmap item, and maintainer comments.\n    fail: Change includes unrelated refactors, hidden behavior, or broad rewrites.\n  - id: safety\n    title: Safety and policy\n    pass: Risky paths/topics are absent or clearly escalated.\n    fail: Workflow, auth, secret, billing, deployment, or trust changes lack human review.\n  - id: tests\n    title: Verification\n    pass: Tests or deterministic fixtures cover the changed behavior.\n    fail: User-facing or gate behavior changes without relevant verification.\n  - id: evidence\n    title: Evidence quality\n    pass: Decisions, comments, and artifacts explain what happened and why.\n    fail: The agent silently skips, retries indefinitely, or leaves ambiguous status.\n  - id: portability\n    title: OSS portability\n    pass: Behavior works in a newly scaffolded repository with documented setup.\n    fail: Behavior depends on private Volter-only code or uncommitted local state.\nverdicts:\n  pass_low:\n    requires:\n      - all applicable criteria pass\n      - CI passes\n      - no human-required policy trigger\n  develop_retry:\n    use_when: A focused fix can resolve a review finding without maintainer input.\n  human_required:\n    use_when: Risk is high, policy says so, or intent is ambiguous.\n",
      "roadmap": "schema: open-autonomy.roadmap.v1\ndirection: Build an OSS self-driving repository template that can maintain itself\n  and install the same autonomy loop into other repositories.\nitems:\n  - id: durable-decision-memory\n    phase: 1\n    priority: high\n    status: active\n    title: Durable Decision Memory\n    proof_gate: decision-memory-audit\n    acceptance:\n      - Build a durable index from committed decision records.\n      - Reconstruct issue, PR, retry, and merge state from the index.\n  - id: unified-loop-budget\n    phase: 2\n    priority: high\n    status: active\n    title: Unified Loop Budget And Stop Conditions\n    proof_gate: retry-ci-failure\n    acceptance:\n      - Use the same retry budget rules in direct and post-publish review paths.\n      - Stop repeated CI and reviewer failures with visible comments.\n  - id: pm-proactive-backlog\n    phase: 3\n    priority: high\n    status: active\n    title: PM Operations And Backlog Policy\n    proof_gate: pm-open-pr-review\n    acceptance:\n      - PM comments visible status for waits, ignores, and blocked states.\n      - PM routes existing agent PRs to review instead of starting duplicate work.\n  - id: developer-context-quality\n    phase: 4\n    priority: medium\n    status: planned\n    title: Developer Context And Patch Quality\n    proof_gate: developer-context-review-fix\n    acceptance:\n      - Developer context includes issue comments, current PR, decisions, and control files.\n      - Reviewer-requested retries receive the actual review findings.\n  - id: review-merge-parity\n    phase: 5\n    priority: high\n    status: active\n    title: Review And Merge Gate Parity\n    proof_gate: head-changed-before-merge\n    acceptance:\n      - Direct review uses the same CI/review retry budget as post-publish review.\n      - Merge gate refuses changed heads after review.\n  - id: operator-observability\n    phase: 6\n    priority: medium\n    status: active\n    title: Observability And Operator Controls\n    proof_gate: operator-pause-resume\n    acceptance:\n      - Pause, resume, retry, cancel, and status commands are visible and reversible.\n      - Run artifacts contain compact evidence for each gate.\n  - id: production-rollout\n    phase: 7\n    priority: medium\n    status: active\n    title: Production Rollout\n    proof_gate: five-issue-dogfood\n    acceptance:\n      - The canonical repo can run a low-risk issue through PM, develop, review, and merge.\n      - CI remains green after autonomous changes.\n  - id: direction-control-files\n    phase: 8\n    priority: high\n    status: active\n    title: Direction, Constitution, And Planning Loop\n    proof_gate: planner-creates-proof-gate-issues\n    acceptance:\n      - Planner reads this file and opens or updates missing proof-gate issues.\n      - Developer and reviewer prompts include control-file context.\n  - id: self-hosted-fleet\n    phase: 9\n    priority: medium\n    status: planned\n    title: Self-Hosted Repository Fleet\n    proof_gate: scaffold-install-check\n    acceptance:\n      - A new repo can be scaffolded from the template and run checks.\n      - Setup docs explain secrets, variables, and first issue flow.\n  - id: durable-state-index\n    phase: 10\n    priority: medium\n    status: planned\n    title: Durable State And Audit Trail\n    proof_gate: status-reconstruction\n    acceptance:\n      - Decision index summarizes latest state by issue and PR.\n      - Status commands can use reconstructed state.\n  - id: repair-loops\n    phase: 11\n    priority: medium\n    status: planned\n    title: Agent Quality And Repair Loops\n    proof_gate: quality-review-repair\n    acceptance:\n      - Failed review and CI findings feed the next developer attempt.\n      - Repeated failures stop with stable signatures.\n  - id: maintainer-governance\n    phase: 12\n    priority: medium\n    status: planned\n    title: Maintainer Governance\n    proof_gate: governance-maintainer-hold\n    acceptance:\n      - Maintainer holds stop merge even when CI and review pass.\n      - Repo mode can be paused or constrained without code changes.\n  - id: public-oss-readiness\n    phase: 13\n    priority: medium\n    status: planned\n    title: Public OSS Readiness\n    proof_gate: release-dogfood\n    acceptance:\n      - Cookbook examples are pushable repos with local docs and root roadmap links.\n      - Release evidence is reproducible from committed artifacts.\n"
    },
    "standards": {
      "code": "# Code Standards\n\n- Prefer existing Bun and TypeScript helpers over new dependencies.\n- Keep scripts deterministic and CLI-testable.\n- Validate structured inputs and write structured outputs.\n- Do not hide failed decisions behind successful exits unless a later step makes\n  the state visible.\n",
      "docs": "# Documentation Standards\n\n- `docs/ARCHITECTURE.md` explains the whole system.\n- `docs/ROADMAP.md` is the only canonical roadmap.\n- Example repositories may include local matrices and test runs, but they should\n  link back to the root roadmap instead of copying it.\n- Operator docs must describe commands, evidence, and rollback paths.\n",
      "security": "# Security Standards\n\n- Never print secrets, bearer tokens, model proxy tokens, or private keys.\n- Treat workflow, auth, deployment, dependency trust, and secret-handling changes\n  as human-required unless explicitly approved by maintainers.\n- Publisher policy owns write safety. Reviewer risk judgment is additive and\n  cannot override deterministic publisher rejection.\n",
      "tests": "# Test Standards\n\n- Unit-test deterministic policy, dispatcher, publisher, reviewer, merge, and\n  planner decisions.\n- Use the testbed for live GitHub workflow proof.\n- Use deterministic proof fixtures when model budget would obscure a gate.\n- Record testbed evidence in local test-run docs.\n"
    },
    "sources": [
      "AGENTS.md",
      "docs/ARCHITECTURE.md",
      ".open-autonomy/autonomy.yml",
      "docs/CONSTITUTION.md",
      "docs/PROJECT.md",
      ".open-autonomy/review-rubric.yml",
      ".open-autonomy/roadmap.yml",
      "docs/standards/code.md",
      "docs/standards/docs.md",
      "docs/standards/security.md",
      "docs/standards/tests.md",
      ".codex/skills/open-autonomy-developer/SKILL.md",
      ".codex/skills/open-autonomy-planner/SKILL.md",
      ".codex/skills/open-autonomy-pm/SKILL.md",
      ".codex/skills/open-autonomy-reviewer/SKILL.md",
      ".codex/skills/open-autonomy-upgrade/SKILL.md"
    ],
    "agents": "# Agent Guidance\n\nOpen Autonomy maintains this repository through issues, bounded agent runs,\nreview gates, and committed evidence. Agents working here must preserve the\npublic OSS contract: small scoped changes, deterministic safety checks, visible\nstatus, and reversible maintainer control.\n\nRead these files before changing behavior:\n\n- `docs/ARCHITECTURE.md` for the system model and document map.\n- `docs/ROADMAP.md` for current direction.\n- `docs/CONSTITUTION.md` for non-negotiable operating principles.\n- `.open-autonomy/review-rubric.yml` for review criteria.\n- `docs/standards/*.md` for code, docs, tests, and security rules.\n- `.codex/skills/open-autonomy-*/SKILL.md` for repo-local agent skills.\n- `.open-autonomy/autonomy.yml` for docs, skills, agents, triggers,\n  capabilities, and enforced policy.\n\nDefault to the existing TypeScript/Bun workflow and GitHub Actions patterns.\nDo not introduce unrelated frameworks, hidden state, or silent no-op behavior.\n",
    "autonomy": "schema: open-autonomy.autonomy.v1\ndocuments:\n  autonomy: .open-autonomy/autonomy.yml\n  agents: AGENTS.md\n  architecture: docs/ARCHITECTURE.md\n  constitution: docs/CONSTITUTION.md\n  project: docs/PROJECT.md\n  roadmap: .open-autonomy/roadmap.yml\n  review_rubric: .open-autonomy/review-rubric.yml\n  standards:\n    code: docs/standards/code.md\n    docs: docs/standards/docs.md\n    security: docs/standards/security.md\n    tests: docs/standards/tests.md\nskills:\n  pm: .codex/skills/open-autonomy-pm\n  developer: .codex/skills/open-autonomy-developer\n  reviewer: .codex/skills/open-autonomy-reviewer\n  planner: .codex/skills/open-autonomy-planner\n  upgrade: .codex/skills/open-autonomy-upgrade\nagents:\n  pm:\n    skill: open-autonomy-pm\n    triggers:\n      schedule: \"*/30 * * * *\"\n      workflow_dispatch: true\n      issue_comment: true\n    capabilities:\n      - issue:comment\n      - issue:label\n      - workflow:dispatch\n  developer:\n    skill: open-autonomy-developer\n    capabilities:\n      - branch:write\n      - pr:open\n      - pr:update\n      - issue:comment\n  reviewer:\n    skill: open-autonomy-reviewer\n    capabilities:\n      - pr:comment\n      - pr:review\n      - workflow:dispatch\n  planner:\n    skill: open-autonomy-planner\n    capabilities:\n      - issue:comment\n      - issue:label\n      - issue:create\n      - issue:update\n  upgrade:\n    skill: open-autonomy-upgrade\n    capabilities:\n      - pr:open\n      - pr:update\npolicy:\n  autonomy:\n    max_open_agent_prs: 5\n    max_develop_attempts: 2\n    max_ci_retries: 2\n    max_review_retries: 2\n    stale_needs_info_minutes: 10080\n    require_visible_pm_status: true\n    require_decision_records: true\n    require_acceptance_evidence: true\n  risk:\n    human_required_paths:\n      - \".github/workflows/**\"\n      - \".open-autonomy/autonomy.yml\"\n      - \"docs/CONSTITUTION.md\"\n      - \".codex/skills/**\"\n      - \"services/**/wrangler.toml\"\n    human_required_topics:\n      - auth\n      - secrets\n      - billing\n      - deployment\n      - destructive data migration\n      - dependency trust\n  merge:\n    require_ci: true\n    require_low_risk_review: true\n    require_current_head_sha: true\n    maintainer_block_labels:\n      - do-not-merge\n      - human-required\n      - agent-blocked\n  planner:\n    enabled: true\n    issue_origin_label_prefix: \"origin:\"\n    phase_label_prefix: \"roadmap:\"\n    priority_labels:\n      high: \"priority:high\"\n      medium: \"priority:medium\"\n      low: \"priority:low\"\n",
    "constitution": "# Open Autonomy Constitution\n\n1. User and maintainer intent is authoritative. Autonomous work must stay within\n   the issue, roadmap, policy, and explicit maintainer comments.\n2. Every meaningful autonomous decision must be visible through comments,\n   artifacts, committed decisions, or status reconstruction.\n3. The developer may propose code; deterministic publisher, CI, reviewer, and\n   merge gates decide whether it can progress.\n4. Risky changes require human attention. Workflow, auth, secrets, billing,\n   deployment, dependency trust, and broad rewrites are never silently merged.\n5. Retry loops are bounded by stable failure signatures and attempt budgets.\n6. The system must be portable OSS. A new repository should be able to install\n   the template, configure secrets/variables, seed issues, and run itself.\n7. Testbed proof is part of done. Roadmap items are complete only when their\n   stated testbed evidence exists or a deterministic fixture proves the same\n   gate without model spend.\n",
    "review_rubric": "schema: open-autonomy.review-rubric.v1\ncriteria:\n  - id: scope\n    title: Scope control\n    pass: Change matches the issue, roadmap item, and maintainer comments.\n    fail: Change includes unrelated refactors, hidden behavior, or broad rewrites.\n  - id: safety\n    title: Safety and policy\n    pass: Risky paths/topics are absent or clearly escalated.\n    fail: Workflow, auth, secret, billing, deployment, or trust changes lack human review.\n  - id: tests\n    title: Verification\n    pass: Tests or deterministic fixtures cover the changed behavior.\n    fail: User-facing or gate behavior changes without relevant verification.\n  - id: evidence\n    title: Evidence quality\n    pass: Decisions, comments, and artifacts explain what happened and why.\n    fail: The agent silently skips, retries indefinitely, or leaves ambiguous status.\n  - id: portability\n    title: OSS portability\n    pass: Behavior works in a newly scaffolded repository with documented setup.\n    fail: Behavior depends on private Volter-only code or uncommitted local state.\nverdicts:\n  pass_low:\n    requires:\n      - all applicable criteria pass\n      - CI passes\n      - no human-required policy trigger\n  develop_retry:\n    use_when: A focused fix can resolve a review finding without maintainer input.\n  human_required:\n    use_when: Risk is high, policy says so, or intent is ambiguous.\n",
    "roadmap": "schema: open-autonomy.roadmap.v1\ndirection: Build an OSS self-driving repository template that can maintain itself\n  and install the same autonomy loop into other repositories.\nitems:\n  - id: durable-decision-memory\n    phase: 1\n    priority: high\n    status: active\n    title: Durable Decision Memory\n    proof_gate: decision-memory-audit\n    acceptance:\n      - Build a durable index from committed decision records.\n      - Reconstruct issue, PR, retry, and merge state from the index.\n  - id: unified-loop-budget\n    phase: 2\n    priority: high\n    status: active\n    title: Unified Loop Budget And Stop Conditions\n    proof_gate: retry-ci-failure\n    acceptance:\n      - Use the same retry budget rules in direct and post-publish review paths.\n      - Stop repeated CI and reviewer failures with visible comments.\n  - id: pm-proactive-backlog\n    phase: 3\n    priority: high\n    status: active\n    title: PM Operations And Backlog Policy\n    proof_gate: pm-open-pr-review\n    acceptance:\n      - PM comments visible status for waits, ignores, and blocked states.\n      - PM routes existing agent PRs to review instead of starting duplicate work.\n  - id: developer-context-quality\n    phase: 4\n    priority: medium\n    status: planned\n    title: Developer Context And Patch Quality\n    proof_gate: developer-context-review-fix\n    acceptance:\n      - Developer context includes issue comments, current PR, decisions, and control files.\n      - Reviewer-requested retries receive the actual review findings.\n  - id: review-merge-parity\n    phase: 5\n    priority: high\n    status: active\n    title: Review And Merge Gate Parity\n    proof_gate: head-changed-before-merge\n    acceptance:\n      - Direct review uses the same CI/review retry budget as post-publish review.\n      - Merge gate refuses changed heads after review.\n  - id: operator-observability\n    phase: 6\n    priority: medium\n    status: active\n    title: Observability And Operator Controls\n    proof_gate: operator-pause-resume\n    acceptance:\n      - Pause, resume, retry, cancel, and status commands are visible and reversible.\n      - Run artifacts contain compact evidence for each gate.\n  - id: production-rollout\n    phase: 7\n    priority: medium\n    status: active\n    title: Production Rollout\n    proof_gate: five-issue-dogfood\n    acceptance:\n      - The canonical repo can run a low-risk issue through PM, develop, review, and merge.\n      - CI remains green after autonomous changes.\n  - id: direction-control-files\n    phase: 8\n    priority: high\n    status: active\n    title: Direction, Constitution, And Planning Loop\n    proof_gate: planner-creates-proof-gate-issues\n    acceptance:\n      - Planner reads this file and opens or updates missing proof-gate issues.\n      - Developer and reviewer prompts include control-file context.\n  - id: self-hosted-fleet\n    phase: 9\n    priority: medium\n    status: planned\n    title: Self-Hosted Repository Fleet\n    proof_gate: scaffold-install-check\n    acceptance:\n      - A new repo can be scaffolded from the template and run checks.\n      - Setup docs explain secrets, variables, and first issue flow.\n  - id: durable-state-index\n    phase: 10\n    priority: medium\n    status: planned\n    title: Durable State And Audit Trail\n    proof_gate: status-reconstruction\n    acceptance:\n      - Decision index summarizes latest state by issue and PR.\n      - Status commands can use reconstructed state.\n  - id: repair-loops\n    phase: 11\n    priority: medium\n    status: planned\n    title: Agent Quality And Repair Loops\n    proof_gate: quality-review-repair\n    acceptance:\n      - Failed review and CI findings feed the next developer attempt.\n      - Repeated failures stop with stable signatures.\n  - id: maintainer-governance\n    phase: 12\n    priority: medium\n    status: planned\n    title: Maintainer Governance\n    proof_gate: governance-maintainer-hold\n    acceptance:\n      - Maintainer holds stop merge even when CI and review pass.\n      - Repo mode can be paused or constrained without code changes.\n  - id: public-oss-readiness\n    phase: 13\n    priority: medium\n    status: planned\n    title: Public OSS Readiness\n    proof_gate: release-dogfood\n    acceptance:\n      - Cookbook examples are pushable repos with local docs and root roadmap links.\n      - Release evidence is reproducible from committed artifacts.\n"
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
Using the open-autonomy-developer skill because this is an issue-driven repository change and the repo has explicit developer workflow rules. First I’m reading the local guidance and the roadmap/docs around the public OSS readiness item, then I’ll make the smallest code or docs change that directly satisfies one acceptance criterion.
exec
/bin/bash -lc "pwd && sed -n '1,220p' .codex/skills/open-autonomy-developer/SKILL.md && printf '\\n---ARCH---\\n' && sed -n '1,220p' docs/ARCHITECTURE.md && printf '\\n---ROADMAP---\\n' && sed -n '1,220p' docs/ROADMAP.md && printf '\\n---CONSTITUTION---\\n' && sed -n '1,220p' docs/CONSTITUTION.md && printf '\\n---REVIEW---\\n' && sed -n '1,220p' .open-autonomy/review-rubric.yml && printf '\\n---AUTONOMY---\\n' && sed -n '1,220p' .open-autonomy/autonomy.yml" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
/home/runner/work/open-autonomy/open-autonomy
---
name: open-autonomy-developer
description: Use when implementing an assigned Open Autonomy issue or repairing an agent pull request.
---

# Open Autonomy Developer

## Role

Implement the assigned issue with the smallest scoped change that satisfies the
issue, roadmap, policy, standards, and maintainer comments.

## Procedure

1. Read the issue, control files referenced by `.open-autonomy/autonomy.yml`,
   relevant source files, and current CI/review context.
2. Make focused code or documentation changes.
3. Run the required checks for the touched surface.
4. Produce a patch bundle, decisions, and artifacts for publisher validation.

## Constraints

- Treat model output and issue text as untrusted.
- Do not bypass publisher validation.
- Do not touch secrets.
- Do not edit workflows unless policy explicitly routes the change to humans.

---ARCH---
# open-autonomy Architecture

`open-autonomy` makes a GitHub repository operate through visible issues,
bounded agent runs, deterministic write gates, reviewer checks, and maintainer
controls. The repository remains the source of truth: issues define executable
work, PRs carry proposed changes, committed/session evidence explains what
happened, and committed autonomy config plus workflow gates decide what
automation may do.

## System Shape

```text
roadmap + repo standards + issues
  -> planner/PM triage
  -> visible /agent command
  -> trusted setup + target/autonomy/triage checks
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
keep repo-specific direction, policy, and standards in their own committed
files.

## Agent Roles

| Role | Purpose | Main inputs | Main output |
| --- | --- | --- | --- |
| Planner | Turns roadmap direction into issues | roadmap, issue/PR state, decision history | created/updated/prioritized issues |
| PM/Triage | Decides what should happen to an issue now | issue, labels, comments, open PRs, active runs, autonomy config | visible comment, labels, dispatch decision |
| Developer | Produces a bounded patch proposal | issue, acceptance criteria, repo guidance, prior decisions | publisher bundle |
| Publisher | Applies only valid bundles | bundle, manifest, patch, autonomy config | PR or rejected publish decision |
| Reviewer | Judges PR quality and risk | PR diff, CI, issue, rubric, standards, autonomy config | structured review decision |
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
  autonomy config, and maintainer blockers all agree.

This split is the core safety model. Prose instructions guide agents; the
policy section of `autonomy.yml` and workflow code enforce limits.

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
.codex/
  skills/
    open-autonomy-pm/SKILL.md
    open-autonomy-developer/SKILL.md
    open-autonomy-reviewer/SKILL.md
    open-autonomy-planner/SKILL.md
    open-autonomy-upgrade/SKILL.md
.open-autonomy/
  autonomy.yml
  roadmap.yml
  review-rubric.yml
docs/
  CONSTITUTION.md
  PROJECT.md
  ROADMAP.md
  ARCHITECTURE.md
  standards/
    code.md
    docs.md
    tests.md
    security.md
```

- `AGENTS.md`: short always-loaded guidance shared across coding agents.
- `.codex/skills/*/SKILL.md`: repo-local Codex skills for each agent role.
- `autonomy.yml`: Open Autonomy index of docs, skills, agents, triggers, and
  capabilities, plus machine-readable path, retry, budget, autonomy, and merge
  policy.
- `docs/CONSTITUTION.md`: non-negotiable principles and product standards.
- `roadmap.yml`: planner-readable direction, priorities, dependencies, and proof
  gates.
- `review-rubric.yml`: structured reviewer criteria.
- `docs/standards/*`: scoped implementation guidance.

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

---ROADMAP---
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

---CONSTITUTION---
# Open Autonomy Constitution

1. User and maintainer intent is authoritative. Autonomous work must stay within
   the issue, roadmap, policy, and explicit maintainer comments.
2. Every meaningful autonomous decision must be visible through comments,
   artifacts, committed decisions, or status reconstruction.
3. The developer may propose code; deterministic publisher, CI, reviewer, and
   merge gates decide whether it can progress.
4. Risky changes require human attention. Workflow, auth, secrets, billing,
   deployment, dependency trust, and broad rewrites are never silently merged.
5. Retry loops are bounded by stable failure signatures and attempt budgets.
6. The system must be portable OSS. A new repository should be able to install
   the template, configure secrets/variables, seed issues, and run itself.
7. Testbed proof is part of done. Roadmap items are complete only when their
   stated testbed evidence exists or a deterministic fixture proves the same
   gate without model spend.

---REVIEW---
schema: open-autonomy.review-rubric.v1
criteria:
  - id: scope
    title: Scope control
    pass: Change matches the issue, roadmap item, and maintainer comments.
    fail: Change includes unrelated refactors, hidden behavior, or broad rewrites.
  - id: safety
    title: Safety and policy
    pass: Risky paths/topics are absent or clearly escalated.
    fail: Workflow, auth, secret, billing, deployment, or trust changes lack human review.
  - id: tests
    title: Verification
    pass: Tests or deterministic fixtures cover the changed behavior.
    fail: User-facing or gate behavior changes without relevant verification.
  - id: evidence
    title: Evidence quality
    pass: Decisions, comments, and artifacts explain what happened and why.
    fail: The agent silently skips, retries indefinitely, or leaves ambiguous status.
  - id: portability
    title: OSS portability
    pass: Behavior works in a newly scaffolded repository with documented setup.
    fail: Behavior depends on private Volter-only code or uncommitted local state.
verdicts:
  pass_low:
    requires:
      - all applicable criteria pass
      - CI passes
      - no human-required policy trigger
  develop_retry:
    use_when: A focused fix can resolve a review finding without maintainer input.
  human_required:
    use_when: Risk is high, policy says so, or intent is ambiguous.

---AUTONOMY---
schema: open-autonomy.autonomy.v1
documents:
  autonomy: .open-autonomy/autonomy.yml
  agents: AGENTS.md
  architecture: docs/ARCHITECTURE.md
  constitution: docs/CONSTITUTION.md
  project: docs/PROJECT.md
  roadmap: .open-autonomy/roadmap.yml
  review_rubric: .open-autonomy/review-rubric.yml
  standards:
    code: docs/standards/code.md
    docs: docs/standards/docs.md
    security: docs/standards/security.md
    tests: docs/standards/tests.md
skills:
  pm: .codex/skills/open-autonomy-pm
  developer: .codex/skills/open-autonomy-developer
  reviewer: .codex/skills/open-autonomy-reviewer
  planner: .codex/skills/open-autonomy-planner
  upgrade: .codex/skills/open-autonomy-upgrade
agents:
  pm:
    skill: open-autonomy-pm
    triggers:
      schedule: "*/30 * * * *"
      workflow_dispatch: true
      issue_comment: true
    capabilities:
      - issue:comment
      - issue:label
      - workflow:dispatch
  developer:
    skill: open-autonomy-developer
    capabilities:
      - branch:write
      - pr:open
      - pr:update
      - issue:comment
  reviewer:
    skill: open-autonomy-reviewer
    capabilities:
      - pr:comment
      - pr:review
      - workflow:dispatch
  planner:
    skill: open-autonomy-planner
    capabilities:
      - issue:comment
      - issue:label
      - issue:create
      - issue:update
  upgrade:
    skill: open-autonomy-upgrade
    capabilities:
      - pr:open
      - pr:update
policy:
  autonomy:
    max_open_agent_prs: 5
    max_develop_attempts: 2
    max_ci_retries: 2
    max_review_retries: 2
    stale_needs_info_minutes: 10080
    require_visible_pm_status: true
    require_decision_records: true
    require_acceptance_evidence: true
  risk:
    human_required_paths:
      - ".github/workflows/**"
      - ".open-autonomy/autonomy.yml"
      - "docs/CONSTITUTION.md"
      - ".codex/skills/**"
      - "services/**/wrangler.toml"
    human_required_topics:
      - auth
      - secrets
      - billing
      - deployment
      - destructive data migration
      - dependency trust
  merge:
    require_ci: true
    require_low_risk_review: true
    require_current_head_sha: true
    maintainer_block_labels:
      - do-not-merge
      - human-required
      - agent-blocked
  planner:
    enabled: true
    issue_origin_label_prefix: "origin:"
    phase_label_prefix: "roadmap:"
    priority_labels:
      high: "priority:high"
      medium: "priority:medium"
      low: "priority:low"

codex
I’ve confirmed the repo rules and the roadmap item. Next I’m locating the cookbook/example docs and any release-evidence artifact paths so I can make one focused change that improves the public OSS readiness surface without touching workflows or policy files.
exec
/bin/bash -lc 'rg -n "cookbook|docs-only|roadmap|release evidence|TEST_RUNS|TEST_MATRIX|pushable" examples docs .open-autonomy README.md' in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
README.md:40:- `examples/docs-only/` - minimal full-repo example.
README.md:41:- `examples/small-app/` - small TypeScript app cookbook.
README.md:42:- `examples/library/` - small TypeScript library cookbook.
README.md:44:- `docs/` - architecture, runbook, rollout, and the continuous roadmap.
README.md:48:Use [`docs/ROADMAP.md`](./docs/ROADMAP.md) as the single source for roadmap,
.open-autonomy/autonomy.yml:8:  roadmap: .open-autonomy/roadmap.yml
.open-autonomy/autonomy.yml:92:    phase_label_prefix: "roadmap:"
.open-autonomy/roadmap.yml:1:schema: open-autonomy.roadmap.v1
.open-autonomy/roadmap.yml:120:      - Cookbook examples are pushable repos with local docs and root roadmap links.
docs/PROOF_LEDGER.md:3:This ledger maps every `.open-autonomy/roadmap.yml` proof gate to evidence.
docs/PROOF_LEDGER.md:15:| `operator-pause-resume` | live testbed runs recorded in `examples/testbed/docs/TEST_RUNS.md` | done |
docs/PROOF_LEDGER.md:16:| `five-issue-dogfood` | live testbed PM/develop/review/merge and operator scenarios recorded in `examples/testbed/docs/TEST_RUNS.md` | done |
.open-autonomy/review-rubric.yml:5:    pass: Change matches the issue, roadmap item, and maintainer comments.
docs/CONSTITUTION.md:4:   the issue, roadmap, policy, and explicit maintainer comments.
docs/ARCHITECTURE.md:13:roadmap + repo standards + issues
docs/ARCHITECTURE.md:31:- `examples/docs-only`: minimal cookbook repo.
docs/ARCHITECTURE.md:32:- `examples/testbed`: disposable cookbook/test fixture.
docs/ARCHITECTURE.md:43:| Planner | Turns roadmap direction into issues | roadmap, issue/PR state, decision history | created/updated/prioritized issues |
docs/ARCHITECTURE.md:76:| `docs/ROADMAP.md` | Continuous roadmap, proof gates, and expanded product direction | planner/maintainers |
docs/ARCHITECTURE.md:77:| `examples/testbed/docs/TEST_MATRIX.md` | Live scenario catalog | testbed operators |
docs/ARCHITECTURE.md:78:| `examples/testbed/docs/TEST_RUNS.md` | Live proof ledger | testbed operators, roadmap audit |
docs/ARCHITECTURE.md:80:`docs/ROADMAP.md` is the only canonical roadmap. The roadmap should explain
docs/ARCHITECTURE.md:99:  roadmap.yml
docs/ARCHITECTURE.md:119:- `roadmap.yml`: planner-readable direction, priorities, dependencies, and proof
docs/ARCHITECTURE.md:147:- Live proof in the testbed is required before claiming roadmap completion.
docs/RELEASE.md:13:5. Verify `examples/docs-only`, `examples/small-app`, `examples/library`, and
examples/testbed/CHANGELOG.md:6:  reporting, durable decision indexing, and cookbook repository structure.
examples/testbed/CHANGELOG.md:9:- Consolidated roadmap direction into `docs/ROADMAP.md`.
docs/ROADMAP.md:3:This is the roadmap for turning the public agent workflow into a self-building
docs/ROADMAP.md:9:This is the single continuous roadmap for the canonical repo. Short plans,
docs/ROADMAP.md:11:file instead of creating parallel roadmap documents.
docs/ROADMAP.md:935:  Model-backed live scenarios remain useful regression demos, but the roadmap
docs/ROADMAP.md:940:- `docs/PROOF_LEDGER.md` maps every `.open-autonomy/roadmap.yml` proof gate to
docs/ROADMAP.md:942:- `scripts/open-autonomy-proof-audit.ts` fails CI if a roadmap proof gate is not
docs/ROADMAP.md:1005:  - Evidence: five issue URLs, PR/run URLs, final states in `TEST_RUNS`.
docs/ROADMAP.md:1036:- `.open-autonomy/roadmap.yml` for planner-readable phases, priorities,
docs/ROADMAP.md:1040:- planner workflow that reads roadmap, policy, open issues, PRs, and decision
docs/ROADMAP.md:1042:- issue-origin metadata for `human`, `roadmap-planner`, `testbed-seed`,
docs/ROADMAP.md:1048:- The architecture doc, roadmap, and target repo control files agree on one
docs/ROADMAP.md:1050:- Planner-created issues include phase, priority, origin, dependency, roadmap
docs/ROADMAP.md:1057:- Maintainers can change direction by editing committed roadmap/constitution
docs/ROADMAP.md:1062:- unit tests for roadmap parsing, issue dedupe, and issue metadata rendering
docs/ROADMAP.md:1064:  `.open-autonomy/roadmap.yml`
docs/ROADMAP.md:1065:- testbed fixture where edited roadmap priority changes PM issue ordering
docs/ROADMAP.md:1078:  - Trigger: planner scans `.open-autonomy/roadmap.yml` with missing proof
docs/ROADMAP.md:1081:    roadmap item, dependencies, and acceptance criteria.
docs/ROADMAP.md:1086:  - Trigger: roadmap item already has an open or closed issue.
docs/ROADMAP.md:1196:- evaluator fixtures for docs-only, code-only, test-fix, and refactor tasks
docs/ROADMAP.md:1283:- cookbook examples for docs-only repo, small app repo, library repo, and the
docs/ROADMAP.md:1290:- A maintainer outside Volter can run the docs-only cookbook and understand the
docs/ROADMAP.md:1298:- `oss-docs-only-cookbook`
docs/ROADMAP.md:1299:  - Trigger: external-style clean clone follows docs-only quickstart.
docs/ROADMAP.md:1310:- `oss-small-app-cookbook`
docs/standards/docs.md:4:- `docs/ROADMAP.md` is the only canonical roadmap.
docs/standards/docs.md:6:  link back to the root roadmap instead of copying it.
examples/testbed/docs/CONSTITUTION.md:4:   the issue, roadmap, policy, and explicit maintainer comments.
examples/testbed/docs/ROADMAP.md:3:This repository is the live proof bed for the root Open Autonomy roadmap.
examples/testbed/docs/ROADMAP.md:7:Use `docs/TEST_MATRIX.md` for scenarios and `docs/TEST_RUNS.md` for evidence.
examples/testbed/docs/TEST_MATRIX.md:52:Use `docs/TEST_RUNS.md` as the ledger.
examples/testbed/docs/standards/docs.md:4:- `docs/ROADMAP.md` is the only canonical roadmap.
examples/testbed/docs/standards/docs.md:6:  link back to the root roadmap instead of copying it.
examples/small-app/CHANGELOG.md:6:  reporting, durable decision indexing, and cookbook repository structure.
examples/small-app/CHANGELOG.md:9:- Consolidated roadmap direction into `docs/ROADMAP.md`.
examples/small-app/bun.lock:6:      "name": "open-autonomy-docs-only-example",
examples/testbed/scripts/public-agent-production.test.ts:65:  test('planner workflow applies roadmap issue plans', () => {
examples/testbed/scripts/public-agent-production.test.ts:68:    expect(text).toContain('origin:roadmap-planner');
examples/testbed/docs/ARCHITECTURE.md:16:  roadmap.yml
examples/testbed/docs/ARCHITECTURE.md:34:| `.open-autonomy/roadmap.yml` | Planner-readable direction and active work areas. |
examples/testbed/docs/ARCHITECTURE.md:39:| `docs/ROADMAP.md` | Human-readable roadmap. |
examples/testbed/docs/ISSUE_SCENARIOS.md:4:The canonical matrix is in `docs/TEST_MATRIX.md`; completed runs are recorded in
examples/testbed/docs/ISSUE_SCENARIOS.md:5:`docs/TEST_RUNS.md`.
examples/testbed/scripts/public-agent-planner.test.ts:8:const roadmap = `
examples/testbed/scripts/public-agent-planner.test.ts:9:schema: open-autonomy.roadmap.v1
examples/testbed/scripts/public-agent-planner.test.ts:48:  test('planner creates missing active roadmap issues and skips done items', () => {
examples/testbed/scripts/public-agent-planner.test.ts:49:    const items = parseRoadmapItems(roadmap);
examples/testbed/scripts/public-agent-planner.test.ts:53:    expect(actions[0]?.title).toContain('[roadmap:pm-proactive-backlog]');
examples/testbed/scripts/public-agent-planner.test.ts:54:    expect(actions[0]?.labels).toContain('origin:roadmap-planner');
examples/testbed/scripts/public-agent-planner.test.ts:58:  test('planner updates existing roadmap issues that are missing labels', () => {
examples/testbed/scripts/public-agent-planner.test.ts:59:    const [item] = parseRoadmapItems(roadmap);
examples/testbed/scripts/public-agent-planner.test.ts:60:    const [action] = planRoadmapIssues([item!], [{ number: 10, title: '[roadmap:pm-proactive-backlog] PM Operations', body: 'old', labels: [] }]);
examples/testbed/scripts/public-agent-planner.test.ts:65:  test('planner dedupes existing roadmap issues with proof labels', () => {
examples/testbed/scripts/public-agent-planner.test.ts:66:    const [item] = parseRoadmapItems(roadmap);
examples/testbed/scripts/public-agent-planner.test.ts:72:        { name: 'roadmap:phase-3' },
examples/testbed/scripts/public-agent-planner.test.ts:74:        { name: 'origin:roadmap-planner' },
examples/testbed/README.md:51:The live scenario matrix is in `docs/TEST_MATRIX.md`, and completed runs are
examples/testbed/README.md:52:recorded in `docs/TEST_RUNS.md`.
examples/small-app/docs/CONSTITUTION.md:4:   the issue, roadmap, policy, and explicit maintainer comments.
examples/small-app/docs/ROADMAP.md:3:This example follows the root Open Autonomy roadmap and keeps only local app
examples/small-app/scripts/public-agent-production.test.ts:65:  test('planner workflow applies roadmap issue plans', () => {
examples/small-app/scripts/public-agent-production.test.ts:68:    expect(text).toContain('origin:roadmap-planner');
examples/testbed/scripts/public-agent-control-files.ts:10:  roadmap?: string;
examples/testbed/scripts/public-agent-control-files.ts:52:      else if (key === 'roadmap') context.roadmap = value;
examples/testbed/scripts/public-agent-control-files.ts:81:  if (context.roadmap) sections.push(section('roadmap.yml', context.roadmap));
examples/testbed/scripts/public-agent-control-files.ts:83:  for (const [name, body] of Object.entries(context.documents).filter(([name]) => !['agents', 'autonomy', 'constitution', 'roadmap', 'review_rubric'].includes(name)).sort(([a], [b]) => a.localeCompare(b))) {
examples/small-app/docs/standards/docs.md:4:- `docs/ROADMAP.md` is the only canonical roadmap.
examples/small-app/docs/standards/docs.md:6:  link back to the root roadmap instead of copying it.
examples/testbed/scripts/public-agent-planner.ts:34:  roadmap: string;
examples/testbed/scripts/public-agent-planner.ts:41:  bun scripts/public-agent-planner.ts --roadmap .open-autonomy/roadmap.yml [--issues issues.json] --out planner.json`);
examples/testbed/scripts/public-agent-planner.ts:49:  const roadmap = value('--roadmap');
examples/testbed/scripts/public-agent-planner.ts:50:  if (!roadmap) usage();
examples/testbed/scripts/public-agent-planner.ts:51:  return { roadmap, issues: value('--issues'), out: value('--out') ?? '.agent-run/planner.json' };
examples/testbed/scripts/public-agent-planner.ts:63:      throw new Error(`roadmap item is incomplete: ${JSON.stringify(current)}`);
examples/testbed/scripts/public-agent-planner.ts:108:      const labels = [`roadmap:phase-${item.phase}`, `priority:${item.priority}`, 'origin:roadmap-planner', `proof:${item.proof_gate}`];
examples/testbed/scripts/public-agent-planner.ts:109:      const title = `[roadmap:${item.id}] ${item.title}`;
examples/testbed/scripts/public-agent-planner.ts:113:        return { action: 'create', reason: 'missing roadmap issue', item, title, body, labels };
examples/testbed/scripts/public-agent-planner.ts:131:        reason: 'existing issue already represents roadmap item',
examples/testbed/scripts/public-agent-planner.ts:151:    'Planner origin: roadmap-planner',
examples/testbed/scripts/public-agent-planner.ts:156:  const marker = `[roadmap:${item.id}]`;
examples/testbed/scripts/public-agent-planner.ts:177:  const items = parseRoadmapItems(readFileSync(options.roadmap, 'utf8'));
examples/small-app/scripts/public-agent-planner.test.ts:8:const roadmap = `
examples/small-app/scripts/public-agent-planner.test.ts:9:schema: open-autonomy.roadmap.v1
examples/small-app/scripts/public-agent-planner.test.ts:48:  test('planner creates missing active roadmap issues and skips done items', () => {
examples/small-app/scripts/public-agent-planner.test.ts:49:    const items = parseRoadmapItems(roadmap);
examples/small-app/scripts/public-agent-planner.test.ts:53:    expect(actions[0]?.title).toContain('[roadmap:pm-proactive-backlog]');
examples/small-app/scripts/public-agent-planner.test.ts:54:    expect(actions[0]?.labels).toContain('origin:roadmap-planner');
examples/small-app/scripts/public-agent-planner.test.ts:58:  test('planner updates existing roadmap issues that are missing labels', () => {
examples/small-app/scripts/public-agent-planner.test.ts:59:    const [item] = parseRoadmapItems(roadmap);
examples/small-app/scripts/public-agent-planner.test.ts:60:    const [action] = planRoadmapIssues([item!], [{ number: 10, title: '[roadmap:pm-proactive-backlog] PM Operations', body: 'old', labels: [] }]);
examples/small-app/scripts/public-agent-planner.test.ts:65:  test('planner dedupes existing roadmap issues with proof labels', () => {
examples/small-app/scripts/public-agent-planner.test.ts:66:    const [item] = parseRoadmapItems(roadmap);
examples/small-app/scripts/public-agent-planner.test.ts:72:        { name: 'roadmap:phase-3' },
examples/small-app/scripts/public-agent-planner.test.ts:74:        { name: 'origin:roadmap-planner' },
examples/testbed/scripts/testbed-seed-issues.ts:144:    title: '[oa-test:planner-creates-proof-gate-issues] Planner should create missing roadmap issues',
examples/testbed/scripts/testbed-seed-issues.ts:147:      'Run the Open Autonomy Planner workflow against `.open-autonomy/roadmap.yml`.',
examples/testbed/scripts/testbed-seed-issues.ts:150:      '- Missing active roadmap items get issues labeled `origin:roadmap-planner`.',
examples/testbed/scripts/open-autonomy-config.ts:15:    roadmap: '.open-autonomy/roadmap.yml',
examples/testbed/scripts/open-autonomy-preflight.ts:35:  '.open-autonomy/roadmap.yml',
examples/testbed/scripts/open-autonomy-preflight.ts:115:  for (const label of ['agent-paused', 'agent-blocked', 'human-required', 'needs-info', 'origin:roadmap-planner']) {
examples/small-app/scripts/public-agent-planner.ts:34:  roadmap: string;
examples/small-app/scripts/public-agent-planner.ts:41:  bun scripts/public-agent-planner.ts --roadmap .open-autonomy/roadmap.yml [--issues issues.json] --out planner.json`);
examples/small-app/scripts/public-agent-planner.ts:49:  const roadmap = value('--roadmap');
examples/small-app/scripts/public-agent-planner.ts:50:  if (!roadmap) usage();
examples/small-app/scripts/public-agent-planner.ts:51:  return { roadmap, issues: value('--issues'), out: value('--out') ?? '.agent-run/planner.json' };
examples/small-app/scripts/public-agent-planner.ts:63:      throw new Error(`roadmap item is incomplete: ${JSON.stringify(current)}`);
examples/small-app/scripts/public-agent-planner.ts:108:      const labels = [`roadmap:phase-${item.phase}`, `priority:${item.priority}`, 'origin:roadmap-planner', `proof:${item.proof_gate}`];
examples/small-app/scripts/public-agent-planner.ts:109:      const title = `[roadmap:${item.id}] ${item.title}`;
examples/small-app/scripts/public-agent-planner.ts:113:        return { action: 'create', reason: 'missing roadmap issue', item, title, body, labels };
examples/small-app/scripts/public-agent-planner.ts:131:        reason: 'existing issue already represents roadmap item',
examples/small-app/scripts/public-agent-planner.ts:151:    'Planner origin: roadmap-planner',
examples/small-app/scripts/public-agent-planner.ts:156:  const marker = `[roadmap:${item.id}]`;
examples/small-app/scripts/public-agent-planner.ts:177:  const items = parseRoadmapItems(readFileSync(options.roadmap, 'utf8'));
examples/small-app/scripts/open-autonomy-config.ts:15:    roadmap: '.open-autonomy/roadmap.yml',
examples/small-app/scripts/public-agent-control-files.ts:10:  roadmap?: string;
examples/small-app/scripts/public-agent-control-files.ts:52:      else if (key === 'roadmap') context.roadmap = value;
examples/small-app/scripts/public-agent-control-files.ts:81:  if (context.roadmap) sections.push(section('roadmap.yml', context.roadmap));
examples/small-app/scripts/public-agent-control-files.ts:83:  for (const [name, body] of Object.entries(context.documents).filter(([name]) => !['agents', 'autonomy', 'constitution', 'roadmap', 'review_rubric'].includes(name)).sort(([a], [b]) => a.localeCompare(b))) {
examples/small-app/scripts/open-autonomy-preflight.ts:35:  '.open-autonomy/roadmap.yml',
examples/small-app/scripts/open-autonomy-preflight.ts:115:  for (const label of ['agent-paused', 'agent-blocked', 'human-required', 'needs-info', 'origin:roadmap-planner']) {
examples/library/CHANGELOG.md:6:  reporting, durable decision indexing, and cookbook repository structure.
examples/library/CHANGELOG.md:9:- Consolidated roadmap direction into `docs/ROADMAP.md`.
examples/docs-only/package.json:2:  "name": "open-autonomy-docs-only-example",
examples/library/bun.lock:6:      "name": "open-autonomy-docs-only-example",
examples/docs-only/CHANGELOG.md:6:  reporting, durable decision indexing, and cookbook repository structure.
examples/docs-only/CHANGELOG.md:9:- Consolidated roadmap direction into `docs/ROADMAP.md`.
examples/docs-only/bun.lock:6:      "name": "open-autonomy-docs-only-example",
examples/docs-only/docs/CONSTITUTION.md:4:   the issue, roadmap, policy, and explicit maintainer comments.
examples/library/docs/CONSTITUTION.md:4:   the issue, roadmap, policy, and explicit maintainer comments.
examples/docs-only/docs/ROADMAP.md:3:This example follows the root Open Autonomy roadmap and keeps only local demo
examples/small-app/docs/ARCHITECTURE.md:16:  roadmap.yml
examples/small-app/docs/ARCHITECTURE.md:34:| `.open-autonomy/roadmap.yml` | Planner-readable direction and active work areas. |
examples/small-app/docs/ARCHITECTURE.md:39:| `docs/ROADMAP.md` | Human-readable roadmap. |
examples/docs-only/README.md:1:# docs-only open-autonomy example
examples/docs-only/README.md:13:To make this a standalone demo repo, copy `examples/docs-only/` into a new
examples/docs-only/docs/standards/docs.md:4:- `docs/ROADMAP.md` is the only canonical roadmap.
examples/docs-only/docs/standards/docs.md:6:  link back to the root roadmap instead of copying it.
examples/docs-only/docs/ARCHITECTURE.md:16:  roadmap.yml
examples/docs-only/docs/ARCHITECTURE.md:34:| `.open-autonomy/roadmap.yml` | Planner-readable direction and active work areas. |
examples/docs-only/docs/ARCHITECTURE.md:39:| `docs/ROADMAP.md` | Human-readable roadmap. |
examples/docs-only/docs/PROJECT.md:3:This placeholder document gives the docs-only example a normal content file for
examples/docs-only/scripts/public-agent-production.test.ts:65:  test('planner workflow applies roadmap issue plans', () => {
examples/docs-only/scripts/public-agent-production.test.ts:68:    expect(text).toContain('origin:roadmap-planner');
examples/library/docs/ROADMAP.md:3:This example follows the root Open Autonomy roadmap and keeps only local library
examples/docs-only/scripts/public-agent-planner.test.ts:8:const roadmap = `
examples/docs-only/scripts/public-agent-planner.test.ts:9:schema: open-autonomy.roadmap.v1
examples/docs-only/scripts/public-agent-planner.test.ts:48:  test('planner creates missing active roadmap issues and skips done items', () => {
examples/docs-only/scripts/public-agent-planner.test.ts:49:    const items = parseRoadmapItems(roadmap);
examples/docs-only/scripts/public-agent-planner.test.ts:53:    expect(actions[0]?.title).toContain('[roadmap:pm-proactive-backlog]');
examples/docs-only/scripts/public-agent-planner.test.ts:54:    expect(actions[0]?.labels).toContain('origin:roadmap-planner');
examples/docs-only/scripts/public-agent-planner.test.ts:58:  test('planner updates existing roadmap issues that are missing labels', () => {
examples/docs-only/scripts/public-agent-planner.test.ts:59:    const [item] = parseRoadmapItems(roadmap);
examples/docs-only/scripts/public-agent-planner.test.ts:60:    const [action] = planRoadmapIssues([item!], [{ number: 10, title: '[roadmap:pm-proactive-backlog] PM Operations', body: 'old', labels: [] }]);
examples/docs-only/scripts/public-agent-planner.test.ts:65:  test('planner dedupes existing roadmap issues with proof labels', () => {
examples/docs-only/scripts/public-agent-planner.test.ts:66:    const [item] = parseRoadmapItems(roadmap);
examples/docs-only/scripts/public-agent-planner.test.ts:72:        { name: 'roadmap:phase-3' },
examples/docs-only/scripts/public-agent-planner.test.ts:74:        { name: 'origin:roadmap-planner' },
examples/library/docs/standards/docs.md:4:- `docs/ROADMAP.md` is the only canonical roadmap.
examples/library/docs/standards/docs.md:6:  link back to the root roadmap instead of copying it.
examples/library/scripts/public-agent-production.test.ts:65:  test('planner workflow applies roadmap issue plans', () => {
examples/library/scripts/public-agent-production.test.ts:68:    expect(text).toContain('origin:roadmap-planner');
examples/library/docs/ARCHITECTURE.md:16:  roadmap.yml
examples/library/docs/ARCHITECTURE.md:34:| `.open-autonomy/roadmap.yml` | Planner-readable direction and active work areas. |
examples/library/docs/ARCHITECTURE.md:39:| `docs/ROADMAP.md` | Human-readable roadmap. |
examples/docs-only/scripts/public-agent-planner.ts:34:  roadmap: string;
examples/docs-only/scripts/public-agent-planner.ts:41:  bun scripts/public-agent-planner.ts --roadmap .open-autonomy/roadmap.yml [--issues issues.json] --out planner.json`);
examples/docs-only/scripts/public-agent-planner.ts:49:  const roadmap = value('--roadmap');
examples/docs-only/scripts/public-agent-planner.ts:50:  if (!roadmap) usage();
examples/docs-only/scripts/public-agent-planner.ts:51:  return { roadmap, issues: value('--issues'), out: value('--out') ?? '.agent-run/planner.json' };
examples/docs-only/scripts/public-agent-planner.ts:63:      throw new Error(`roadmap item is incomplete: ${JSON.stringify(current)}`);
examples/docs-only/scripts/public-agent-planner.ts:108:      const labels = [`roadmap:phase-${item.phase}`, `priority:${item.priority}`, 'origin:roadmap-planner', `proof:${item.proof_gate}`];
examples/docs-only/scripts/public-agent-planner.ts:109:      const title = `[roadmap:${item.id}] ${item.title}`;
examples/docs-only/scripts/public-agent-planner.ts:113:        return { action: 'create', reason: 'missing roadmap issue', item, title, body, labels };
examples/docs-only/scripts/public-agent-planner.ts:131:        reason: 'existing issue already represents roadmap item',
examples/docs-only/scripts/public-agent-planner.ts:151:    'Planner origin: roadmap-planner',
examples/docs-only/scripts/public-agent-planner.ts:156:  const marker = `[roadmap:${item.id}]`;
examples/docs-only/scripts/public-agent-planner.ts:177:  const items = parseRoadmapItems(readFileSync(options.roadmap, 'utf8'));
examples/library/scripts/public-agent-planner.test.ts:8:const roadmap = `
examples/library/scripts/public-agent-planner.test.ts:9:schema: open-autonomy.roadmap.v1
examples/library/scripts/public-agent-planner.test.ts:48:  test('planner creates missing active roadmap issues and skips done items', () => {
examples/library/scripts/public-agent-planner.test.ts:49:    const items = parseRoadmapItems(roadmap);
examples/library/scripts/public-agent-planner.test.ts:53:    expect(actions[0]?.title).toContain('[roadmap:pm-proactive-backlog]');
examples/library/scripts/public-agent-planner.test.ts:54:    expect(actions[0]?.labels).toContain('origin:roadmap-planner');
examples/library/scripts/public-agent-planner.test.ts:58:  test('planner updates existing roadmap issues that are missing labels', () => {
examples/library/scripts/public-agent-planner.test.ts:59:    const [item] = parseRoadmapItems(roadmap);
examples/library/scripts/public-agent-planner.test.ts:60:    const [action] = planRoadmapIssues([item!], [{ number: 10, title: '[roadmap:pm-proactive-backlog] PM Operations', body: 'old', labels: [] }]);
examples/library/scripts/public-agent-planner.test.ts:65:  test('planner dedupes existing roadmap issues with proof labels', () => {
examples/library/scripts/public-agent-planner.test.ts:66:    const [item] = parseRoadmapItems(roadmap);
examples/library/scripts/public-agent-planner.test.ts:72:        { name: 'roadmap:phase-3' },
examples/library/scripts/public-agent-planner.test.ts:74:        { name: 'origin:roadmap-planner' },
examples/docs-only/scripts/open-autonomy-config.ts:15:    roadmap: '.open-autonomy/roadmap.yml',
examples/docs-only/scripts/public-agent-control-files.ts:10:  roadmap?: string;
examples/docs-only/scripts/public-agent-control-files.ts:52:      else if (key === 'roadmap') context.roadmap = value;
examples/docs-only/scripts/public-agent-control-files.ts:81:  if (context.roadmap) sections.push(section('roadmap.yml', context.roadmap));
examples/docs-only/scripts/public-agent-control-files.ts:83:  for (const [name, body] of Object.entries(context.documents).filter(([name]) => !['agents', 'autonomy', 'constitution', 'roadmap', 'review_rubric'].includes(name)).sort(([a], [b]) => a.localeCompare(b))) {
examples/docs-only/scripts/open-autonomy-preflight.ts:35:  '.open-autonomy/roadmap.yml',
examples/docs-only/scripts/open-autonomy-preflight.ts:115:  for (const label of ['agent-paused', 'agent-blocked', 'human-required', 'needs-info', 'origin:roadmap-planner']) {
examples/library/scripts/public-agent-planner.ts:34:  roadmap: string;
examples/library/scripts/public-agent-planner.ts:41:  bun scripts/public-agent-planner.ts --roadmap .open-autonomy/roadmap.yml [--issues issues.json] --out planner.json`);
examples/library/scripts/public-agent-planner.ts:49:  const roadmap = value('--roadmap');
examples/library/scripts/public-agent-planner.ts:50:  if (!roadmap) usage();
examples/library/scripts/public-agent-planner.ts:51:  return { roadmap, issues: value('--issues'), out: value('--out') ?? '.agent-run/planner.json' };
examples/library/scripts/public-agent-planner.ts:63:      throw new Error(`roadmap item is incomplete: ${JSON.stringify(current)}`);
examples/library/scripts/public-agent-planner.ts:108:      const labels = [`roadmap:phase-${item.phase}`, `priority:${item.priority}`, 'origin:roadmap-planner', `proof:${item.proof_gate}`];
examples/library/scripts/public-agent-planner.ts:109:      const title = `[roadmap:${item.id}] ${item.title}`;
examples/library/scripts/public-agent-planner.ts:113:        return { action: 'create', reason: 'missing roadmap issue', item, title, body, labels };
examples/library/scripts/public-agent-planner.ts:131:        reason: 'existing issue already represents roadmap item',
examples/library/scripts/public-agent-planner.ts:151:    'Planner origin: roadmap-planner',
examples/library/scripts/public-agent-planner.ts:156:  const marker = `[roadmap:${item.id}]`;
examples/library/scripts/public-agent-planner.ts:177:  const items = parseRoadmapItems(readFileSync(options.roadmap, 'utf8'));
examples/library/scripts/open-autonomy-config.ts:15:    roadmap: '.open-autonomy/roadmap.yml',
examples/library/scripts/open-autonomy-preflight.ts:35:  '.open-autonomy/roadmap.yml',
examples/library/scripts/open-autonomy-preflight.ts:115:  for (const label of ['agent-paused', 'agent-blocked', 'human-required', 'needs-info', 'origin:roadmap-planner']) {
examples/library/scripts/public-agent-control-files.ts:10:  roadmap?: string;
examples/library/scripts/public-agent-control-files.ts:52:      else if (key === 'roadmap') context.roadmap = value;
examples/library/scripts/public-agent-control-files.ts:81:  if (context.roadmap) sections.push(section('roadmap.yml', context.roadmap));
examples/library/scripts/public-agent-control-files.ts:83:  for (const [name, body] of Object.entries(context.documents).filter(([name]) => !['agents', 'autonomy', 'constitution', 'roadmap', 'review_rubric'].includes(name)).sort(([a], [b]) => a.localeCompare(b))) {

exec
/bin/bash -lc 'rg --files examples docs .open-autonomy | sort' in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
.open-autonomy/autonomy.yml
.open-autonomy/review-rubric.yml
.open-autonomy/roadmap.yml
.open-autonomy/version.json
docs/ARCHITECTURE.md
docs/CONSTITUTION.md
docs/OSS_AGENT_RUNBOOK.md
docs/PROJECT.md
docs/PROOF_LEDGER.md
docs/PUBLIC_AGENT_ACTIONS.md
docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
docs/RELEASE.md
docs/ROADMAP.md
docs/standards/code.md
docs/standards/docs.md
docs/standards/security.md
docs/standards/tests.md
examples/docs-only/AGENTS.md
examples/docs-only/CHANGELOG.md
examples/docs-only/README.md
examples/docs-only/VERSION
examples/docs-only/bun.lock
examples/docs-only/docs/ARCHITECTURE.md
examples/docs-only/docs/CONSTITUTION.md
examples/docs-only/docs/PROJECT.md
examples/docs-only/docs/ROADMAP.md
examples/docs-only/docs/standards/code.md
examples/docs-only/docs/standards/docs.md
examples/docs-only/docs/standards/security.md
examples/docs-only/docs/standards/tests.md
examples/docs-only/package.json
examples/docs-only/scripts/codex-agent-run.ts
examples/docs-only/scripts/github-agent-publish.test.ts
examples/docs-only/scripts/github-agent-publish.ts
examples/docs-only/scripts/github-agent-session.test.ts
examples/docs-only/scripts/github-agent-session.ts
examples/docs-only/scripts/model-proxy-exchange.ts
examples/docs-only/scripts/model-proxy-mint.ts
examples/docs-only/scripts/open-autonomy-config.ts
examples/docs-only/scripts/open-autonomy-fleet.test.ts
examples/docs-only/scripts/open-autonomy-governance-report.ts
examples/docs-only/scripts/open-autonomy-preflight.ts
examples/docs-only/scripts/open-autonomy-upgrade.test.ts
examples/docs-only/scripts/open-autonomy-upgrade.ts
examples/docs-only/scripts/public-agent-bundle.ts
examples/docs-only/scripts/public-agent-ci.ts
examples/docs-only/scripts/public-agent-command.ts
examples/docs-only/scripts/public-agent-context.ts
examples/docs-only/scripts/public-agent-control-files.ts
examples/docs-only/scripts/public-agent-control.test.ts
examples/docs-only/scripts/public-agent-control.ts
examples/docs-only/scripts/public-agent-decision-index.ts
examples/docs-only/scripts/public-agent-decision.test.ts
examples/docs-only/scripts/public-agent-decision.ts
examples/docs-only/scripts/public-agent-dispatcher.ts
examples/docs-only/scripts/public-agent-loop-budget.ts
examples/docs-only/scripts/public-agent-merge-gate.ts
examples/docs-only/scripts/public-agent-planner.test.ts
examples/docs-only/scripts/public-agent-planner.ts
examples/docs-only/scripts/public-agent-pm.ts
examples/docs-only/scripts/public-agent-policy.ts
examples/docs-only/scripts/public-agent-production.test.ts
examples/docs-only/scripts/public-agent-review.ts
examples/docs-only/scripts/public-agent-target.ts
examples/docs-only/scripts/public-agent-triage.test.ts
examples/docs-only/scripts/public-agent-triage.ts
examples/library/AGENTS.md
examples/library/CHANGELOG.md
examples/library/README.md
examples/library/VERSION
examples/library/bun.lock
examples/library/docs/ARCHITECTURE.md
examples/library/docs/CONSTITUTION.md
examples/library/docs/PROJECT.md
examples/library/docs/ROADMAP.md
examples/library/docs/standards/code.md
examples/library/docs/standards/docs.md
examples/library/docs/standards/security.md
examples/library/docs/standards/tests.md
examples/library/package.json
examples/library/scripts/codex-agent-run.ts
examples/library/scripts/github-agent-publish.test.ts
examples/library/scripts/github-agent-publish.ts
examples/library/scripts/github-agent-session.test.ts
examples/library/scripts/github-agent-session.ts
examples/library/scripts/model-proxy-exchange.ts
examples/library/scripts/model-proxy-mint.ts
examples/library/scripts/open-autonomy-config.ts
examples/library/scripts/open-autonomy-fleet.test.ts
examples/library/scripts/open-autonomy-governance-report.ts
examples/library/scripts/open-autonomy-preflight.ts
examples/library/scripts/open-autonomy-upgrade.test.ts
examples/library/scripts/open-autonomy-upgrade.ts
examples/library/scripts/public-agent-bundle.ts
examples/library/scripts/public-agent-ci.ts
examples/library/scripts/public-agent-command.ts
examples/library/scripts/public-agent-context.ts
examples/library/scripts/public-agent-control-files.ts
examples/library/scripts/public-agent-control.test.ts
examples/library/scripts/public-agent-control.ts
examples/library/scripts/public-agent-decision-index.ts
examples/library/scripts/public-agent-decision.test.ts
examples/library/scripts/public-agent-decision.ts
examples/library/scripts/public-agent-dispatcher.ts
examples/library/scripts/public-agent-loop-budget.ts
examples/library/scripts/public-agent-merge-gate.ts
examples/library/scripts/public-agent-planner.test.ts
examples/library/scripts/public-agent-planner.ts
examples/library/scripts/public-agent-pm.ts
examples/library/scripts/public-agent-policy.ts
examples/library/scripts/public-agent-production.test.ts
examples/library/scripts/public-agent-review.ts
examples/library/scripts/public-agent-target.ts
examples/library/scripts/public-agent-triage.test.ts
examples/library/scripts/public-agent-triage.ts
examples/library/src/index.test.ts
examples/library/src/index.ts
examples/small-app/AGENTS.md
examples/small-app/CHANGELOG.md
examples/small-app/README.md
examples/small-app/VERSION
examples/small-app/bun.lock
examples/small-app/docs/ARCHITECTURE.md
examples/small-app/docs/CONSTITUTION.md
examples/small-app/docs/PROJECT.md
examples/small-app/docs/ROADMAP.md
examples/small-app/docs/standards/code.md
examples/small-app/docs/standards/docs.md
examples/small-app/docs/standards/security.md
examples/small-app/docs/standards/tests.md
examples/small-app/package.json
examples/small-app/scripts/codex-agent-run.ts
examples/small-app/scripts/github-agent-publish.test.ts
examples/small-app/scripts/github-agent-publish.ts
examples/small-app/scripts/github-agent-session.test.ts
examples/small-app/scripts/github-agent-session.ts
examples/small-app/scripts/model-proxy-exchange.ts
examples/small-app/scripts/model-proxy-mint.ts
examples/small-app/scripts/open-autonomy-config.ts
examples/small-app/scripts/open-autonomy-fleet.test.ts
examples/small-app/scripts/open-autonomy-governance-report.ts
examples/small-app/scripts/open-autonomy-preflight.ts
examples/small-app/scripts/open-autonomy-upgrade.test.ts
examples/small-app/scripts/open-autonomy-upgrade.ts
examples/small-app/scripts/public-agent-bundle.ts
examples/small-app/scripts/public-agent-ci.ts
examples/small-app/scripts/public-agent-command.ts
examples/small-app/scripts/public-agent-context.ts
examples/small-app/scripts/public-agent-control-files.ts
examples/small-app/scripts/public-agent-control.test.ts
examples/small-app/scripts/public-agent-control.ts
examples/small-app/scripts/public-agent-decision-index.ts
examples/small-app/scripts/public-agent-decision.test.ts
examples/small-app/scripts/public-agent-decision.ts
examples/small-app/scripts/public-agent-dispatcher.ts
examples/small-app/scripts/public-agent-loop-budget.ts
examples/small-app/scripts/public-agent-merge-gate.ts
examples/small-app/scripts/public-agent-planner.test.ts
examples/small-app/scripts/public-agent-planner.ts
examples/small-app/scripts/public-agent-pm.ts
examples/small-app/scripts/public-agent-policy.ts
examples/small-app/scripts/public-agent-production.test.ts
examples/small-app/scripts/public-agent-review.ts
examples/small-app/scripts/public-agent-target.ts
examples/small-app/scripts/public-agent-triage.test.ts
examples/small-app/scripts/public-agent-triage.ts
examples/small-app/src/app.test.ts
examples/small-app/src/app.ts
examples/small-app/src/server.ts
examples/testbed/AGENTS.md
examples/testbed/CHANGELOG.md
examples/testbed/README.md
examples/testbed/VERSION
examples/testbed/bun.lock
examples/testbed/docs/ARCHITECTURE.md
examples/testbed/docs/CONSTITUTION.md
examples/testbed/docs/ISSUE_SCENARIOS.md
examples/testbed/docs/PROJECT.md
examples/testbed/docs/ROADMAP.md
examples/testbed/docs/TEST_MATRIX.md
examples/testbed/docs/TEST_RUNS.md
examples/testbed/docs/standards/code.md
examples/testbed/docs/standards/docs.md
examples/testbed/docs/standards/security.md
examples/testbed/docs/standards/tests.md
examples/testbed/package.json
examples/testbed/scripts/codex-agent-run.ts
examples/testbed/scripts/github-agent-publish.test.ts
examples/testbed/scripts/github-agent-publish.ts
examples/testbed/scripts/github-agent-session.test.ts
examples/testbed/scripts/github-agent-session.ts
examples/testbed/scripts/model-proxy-exchange.ts
examples/testbed/scripts/model-proxy-mint.ts
examples/testbed/scripts/open-autonomy-config.ts
examples/testbed/scripts/open-autonomy-fleet.test.ts
examples/testbed/scripts/open-autonomy-governance-report.ts
examples/testbed/scripts/open-autonomy-preflight.ts
examples/testbed/scripts/open-autonomy-upgrade.test.ts
examples/testbed/scripts/open-autonomy-upgrade.ts
examples/testbed/scripts/public-agent-bundle.ts
examples/testbed/scripts/public-agent-ci.ts
examples/testbed/scripts/public-agent-command.ts
examples/testbed/scripts/public-agent-context.ts
examples/testbed/scripts/public-agent-control-files.ts
examples/testbed/scripts/public-agent-control.test.ts
examples/testbed/scripts/public-agent-control.ts
examples/testbed/scripts/public-agent-decision-index.ts
examples/testbed/scripts/public-agent-decision.test.ts
examples/testbed/scripts/public-agent-decision.ts
examples/testbed/scripts/public-agent-dispatcher.ts
examples/testbed/scripts/public-agent-loop-budget.ts
examples/testbed/scripts/public-agent-merge-gate.ts
examples/testbed/scripts/public-agent-planner.test.ts
examples/testbed/scripts/public-agent-planner.ts
examples/testbed/scripts/public-agent-pm.ts
examples/testbed/scripts/public-agent-policy.ts
examples/testbed/scripts/public-agent-production.test.ts
examples/testbed/scripts/public-agent-review.ts
examples/testbed/scripts/public-agent-target.ts
examples/testbed/scripts/public-agent-triage.test.ts
examples/testbed/scripts/public-agent-triage.ts
examples/testbed/scripts/testbed-seed-issues.ts

codex
I found the likely gap: the example repos already exist, but the docs need to state clearly that they are standalone/pushable repos and point back to the root roadmap, and the release checklist should point at committed artifact evidence instead of implying ad hoc reproduction. I’m reading the example README and release docs now to choose the narrowest edit.
exec
/bin/bash -lc "sed -n '1,220p' examples/docs-only/README.md && printf '\\n---ROADMAP---\\n' && sed -n '1,200p' examples/docs-only/docs/ROADMAP.md && printf '\\n---RELEASE---\\n' && sed -n '1,220p' docs/RELEASE.md" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
# docs-only open-autonomy example

This is a minimal full repository shape for using open-autonomy on a
documentation-only project.

It is intentionally small:

- issues can request documentation edits
- the publisher can apply non-workflow docs changes
- CI runs the open-autonomy checks
- operator controls can pause, resume, status, retry, and cancel

To make this a standalone demo repo, copy `examples/docs-only/` into a new
GitHub repository, configure the model proxy URL, model names, budget variables,
and `MODEL_PROXY_ADMIN_TOKEN` secret used by the workflows, then run
`bun install` and `bun run check`.

---ROADMAP---
# Docs-Only Example Roadmap

This example follows the root Open Autonomy roadmap and keeps only local demo
notes here.

Local proof focus:

- small documentation edits through PM, develop, review, and merge
- needs-info handling for unclear docs requests
- pause, resume, retry, cancel, and status controls

---RELEASE---
# Release Process

Open Autonomy releases are versioned by `VERSION` and
`.open-autonomy/version.json`.

Release checklist:

1. Update `VERSION`, `.open-autonomy/version.json`, and `CHANGELOG.md`.
2. Run `bun run check`.
3. Run planner, preflight, and governance-report workflows on `main`.
4. Scaffold `templates/self-driving-repo/` into a clean directory and run its
   `bun run check`.
5. Verify `examples/docs-only`, `examples/small-app`, `examples/library`, and
   `examples/testbed` can run their local checks.
6. Tag the release as `vX.Y.Z`.
7. Record migration notes for template changes in the changelog.

Generated or upgraded repositories should keep their local
`.open-autonomy/version.json` so runs can record the Open Autonomy version and
profile used for each session.

exec
/bin/bash -lc "sed -n '1,220p' examples/library/README.md && printf '\\n---ROADMAP---\\n' && sed -n '1,200p' examples/library/docs/ROADMAP.md && printf '\\n---TEST_RUNS---\\n' && sed -n '1,220p' examples/testbed/docs/TEST_RUNS.md" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
# library open-autonomy example

This is a minimal full repository shape for using open-autonomy on a small
TypeScript library.

It is intentionally small:

- issues can request bounded library and documentation edits
- the publisher can apply non-workflow docs changes
- CI runs library tests and open-autonomy checks
- operator controls can pause, resume, status, retry, and cancel

To make this a standalone demo repo, copy `examples/library/` into a new
GitHub repository, configure the model proxy URL, model names, budget variables,
and `MODEL_PROXY_ADMIN_TOKEN` secret used by the workflows, then run
`bun install` and `bun run check`.

---ROADMAP---
# Library Example Roadmap

This example follows the root Open Autonomy roadmap and keeps only local library
demo notes here.

Local proof focus:

- small library and documentation edits through PM, develop, review, and merge
- test-fix handling for a bounded TypeScript library
- pause, resume, retry, cancel, and status controls

---TEST_RUNS---
# Test Runs

Use this file as the live-run ledger after pushing the testbed example as its
own repository.

For each completed scenario, record:

- issue URL
- PR URL, if any
- workflow run URL
- final state
- decision artifacts or agent session path
- gaps found


exec
/bin/bash -lc "sed -n '1,220p' examples/small-app/README.md && printf '\\n---ROADMAP---\\n' && sed -n '1,200p' examples/small-app/docs/ROADMAP.md && printf '\\n---PROOF_LEDGER---\\n' && sed -n '1,220p' docs/PROOF_LEDGER.md" in /home/runner/work/open-autonomy/open-autonomy
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
GitHub repository, configure the model proxy URL, model names, budget variables,
and `MODEL_PROXY_ADMIN_TOKEN` secret used by the workflows, then run
`bun install` and `bun run check`.

---ROADMAP---
# Small App Example Roadmap

This example follows the root Open Autonomy roadmap and keeps only local app
demo notes here.

Local proof focus:

- small app and documentation edits through PM, develop, review, and merge
- test-fix handling for a bounded TypeScript app
- pause, resume, retry, cancel, and status controls

---PROOF_LEDGER---
# Proof Ledger

This ledger maps every `.open-autonomy/roadmap.yml` proof gate to evidence.
Evidence may be live GitHub workflow proof, live testbed issue proof, or a
deterministic CI fixture when model budget or external state would make a live
model run less reliable than the gate being tested.

| Proof Gate | Evidence | Status |
| --- | --- | --- |
| `decision-memory-audit` | `scripts/public-agent-decision-index.ts`, `scripts/public-agent-planner.test.ts`, canonical governance run `27649191830` | done |
| `retry-ci-failure` | `scripts/public-agent-loop-budget.ts`, `scripts/public-agent-control.test.ts`, direct review workflow parity tests | done |
| `pm-open-pr-review` | `scripts/public-agent-dispatcher.ts`, PM dispatcher tests for open PR review routing | done |
| `developer-context-review-fix` | `scripts/public-agent-context.ts`, developer-context tests with prior decisions and PR diff | done |
| `head-changed-before-merge` | `scripts/public-agent-merge-gate.ts`, merge-gate changed-head tests | done |
| `operator-pause-resume` | live testbed runs recorded in `examples/testbed/docs/TEST_RUNS.md` | done |
| `five-issue-dogfood` | live testbed PM/develop/review/merge and operator scenarios recorded in `examples/testbed/docs/TEST_RUNS.md` | done |
| `planner-creates-proof-gate-issues` | planner workflow runs `27648929065` and `27648929059`; planner tests | done |
| `scaffold-install-check` | `scripts/scaffold-target-repo.ts`, fleet preflight runs `27649190745` and `27649190743` | done |
| `status-reconstruction` | `scripts/public-agent-decision-index.ts`, status reconstruction tests, governance runs | done |
| `quality-review-repair` | `scripts/public-agent-loop-budget.ts`, `scripts/public-agent-context.ts`, `scripts/public-agent-control.test.ts` | done |
| `governance-maintainer-hold` | `scripts/public-agent-merge-gate.ts`, `scripts/public-agent-policy.ts`, `scripts/public-agent-control.test.ts` | done |
| `release-dogfood` | `VERSION`, `.open-autonomy/version.json`, `CHANGELOG.md`, `docs/RELEASE.md`, manifest version tests | done |

codex
I’ve got the shape of the fix. I’m going to update the example READMEs and their local roadmap docs so each cookbook explicitly says it is a standalone/pushable repo and points to the local roadmap, then I’ll tighten the release docs so release evidence is tied to committed artifacts rather than ad hoc runtime state.
exec
/bin/bash -lc "sed -n '1,140p' README.md" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
# open-autonomy

`open-autonomy` is an open-source kit for making a GitHub repository drive its
own maintenance work through issues, bounded agent runs, review gates, and
operator controls.

This repository is also the first demo target: the `open-autonomy` repo is wired
to run open-autonomy against itself.

## What It Does

```text
issue or PM sweep
  -> visible /agent develop
  -> GitHub Actions setup + policy + triage
  -> bounded Codex runner through the model proxy
  -> trusted publisher validates and opens/updates a PR
  -> CI + reviewer
  -> deterministic merge gate
  -> merge or human-required escalation
```

The agent can propose changes. Deterministic gates decide whether those changes
can be published, reviewed, and merged.

## Repository Layout

- `.github/workflows/` - self-driving workflows for this repo.
- `.open-autonomy/` and `AGENTS.md` - planner-readable direction,
  constitution, policy, rubric, and standards.
- `scripts/public-agent-*` - command parsing, policy, PM dispatch, planner,
  review, CI, merge-gate, status, and control logic.
- `scripts/github-agent-session.ts` - session wrapper that emits publisher
  bundles and evidence.
- `scripts/codex-agent-run.ts` - Codex runner configured for the bounded model
  proxy.
- `services/agent-model-proxy/` - Cloudflare Worker for bounded model access.
- `templates/self-driving-repo/` - copyable starter for another self-driving
  repository.
- `examples/docs-only/` - minimal full-repo example.
- `examples/small-app/` - small TypeScript app cookbook.
- `examples/library/` - small TypeScript library cookbook.
- `examples/testbed/` - full demo repo for live PM/operator/develop testing.
- `docs/` - architecture, runbook, rollout, and the continuous roadmap.

Start with [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the master map
of the system, agent roles, trust boundaries, and how the docs fit together.
Use [`docs/ROADMAP.md`](./docs/ROADMAP.md) as the single source for roadmap,
proof-gate, and next-step planning.

## Checks

```bash
bun install
bun run check:public-agent
bun run check:agent-proxy
bun run check
```

## Commands

- `/agent develop` - ask the agent to work on an issue.
- `/agent review` - run the reviewer on an agent PR.
- `/agent pause` and `/agent resume` - pause or resume issue-level work.
- `/agent pause repo` and `/agent resume repo` - pause or resume the whole repo.
- `/agent status` - show issue agent state.
- `/agent retry` - rerun failed infrastructure jobs without a fresh develop pass.
- `/agent cancel` - cancel active workflow runs and revoke active proxy runs.

## Setup Another Repo

`open-autonomy` is both the reusable kit and its own self-driving repo. To make
another self-driving repo, use `templates/self-driving-repo/` as the starting
point, then follow
[`docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`](./docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md).

The short version:

1. Copy the template into the target repository:
   ```bash
   bun run scaffold -- --target ../my-repo
   ```
2. Edit `AGENTS.md` and `.open-autonomy/*` for that repository's direction,
   policy, rubric, and standards.
3. Deploy or reuse the model proxy.
4. Set GitHub variables and secrets.
5. Run `bun run check`.
6. Smoke `/agent pause`, paused `/agent develop`, `/agent status`, and
   `/agent resume`.
7. Run the planner workflow in dry mode, then create one low-risk issue and run
   `/agent develop`.

## Commercial Boundary

`open-autonomy` is the OSS implementation. `volter-autonomy` can build on it as
a paid hosted product with managed proxy infrastructure, dashboards, org policy,
and support.

## License

Apache-2.0.

apply patch
patch: completed
/home/runner/work/open-autonomy/open-autonomy/docs/PROOF_LEDGER.md
/home/runner/work/open-autonomy/open-autonomy/docs/RELEASE.md
/home/runner/work/open-autonomy/open-autonomy/examples/docs-only/README.md
/home/runner/work/open-autonomy/open-autonomy/examples/docs-only/docs/ROADMAP.md
/home/runner/work/open-autonomy/open-autonomy/examples/library/README.md
/home/runner/work/open-autonomy/open-autonomy/examples/library/docs/ROADMAP.md
/home/runner/work/open-autonomy/open-autonomy/examples/small-app/README.md
/home/runner/work/open-autonomy/open-autonomy/examples/small-app/docs/ROADMAP.md
diff --git a/docs/PROOF_LEDGER.md b/docs/PROOF_LEDGER.md
index c8f671ce082fa6596e567b6d733c580f82cbb1cb..e277fbe5167f8b6dd52d033ed52b065b0a30ba43
--- a/docs/PROOF_LEDGER.md
+++ b/docs/PROOF_LEDGER.md
@@ -19,4 +19,4 @@
 | `status-reconstruction` | `scripts/public-agent-decision-index.ts`, status reconstruction tests, governance runs | done |
 | `quality-review-repair` | `scripts/public-agent-loop-budget.ts`, `scripts/public-agent-context.ts`, `scripts/public-agent-control.test.ts` | done |
 | `governance-maintainer-hold` | `scripts/public-agent-merge-gate.ts`, `scripts/public-agent-policy.ts`, `scripts/public-agent-control.test.ts` | done |
-| `release-dogfood` | `VERSION`, `.open-autonomy/version.json`, `CHANGELOG.md`, `docs/RELEASE.md`, manifest version tests | done |
+| `release-dogfood` | `VERSION`, `.open-autonomy/version.json`, `CHANGELOG.md`, `docs/RELEASE.md`, manifest version tests, and the committed release checklist in `docs/PROOF_LEDGER.md` | done |
diff --git a/docs/RELEASE.md b/docs/RELEASE.md
index 4748b8f647bafe4ee8b031ef2b8c4f7ea9db7149..9885acc6fd1acc9695047e2533acad87032ea752
--- a/docs/RELEASE.md
+++ b/docs/RELEASE.md
@@ -10,8 +10,9 @@
 3. Run planner, preflight, and governance-report workflows on `main`.
 4. Scaffold `templates/self-driving-repo/` into a clean directory and run its
    `bun run check`.
-5. Verify `examples/docs-only`, `examples/small-app`, `examples/library`, and
-   `examples/testbed` can run their local checks.
+5. Verify the committed release evidence in [`docs/PROOF_LEDGER.md`](./PROOF_LEDGER.md)
+   and confirm `examples/docs-only`, `examples/small-app`, `examples/library`,
+   and `examples/testbed` can run their local checks.
 6. Tag the release as `vX.Y.Z`.
 7. Record migration notes for template changes in the changelog.
 
diff --git a/examples/docs-only/README.md b/examples/docs-only/README.md
index aab4327b63080b0c87de5cfa1a80442364232ccd..2165064d1baed1675130bc1e13b0da2e77b0a288
--- a/examples/docs-only/README.md
+++ b/examples/docs-only/README.md
@@ -3,6 +3,10 @@
 This is a minimal full repository shape for using open-autonomy on a
 documentation-only project.
 
+This cookbook is a pushable standalone repo: copy `examples/docs-only/` into a
+new GitHub repository, keep the local docs in `docs/`, and follow the local
+roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
+
 It is intentionally small:
 
 - issues can request documentation edits
diff --git a/examples/docs-only/docs/ROADMAP.md b/examples/docs-only/docs/ROADMAP.md
index b535c785cfabe17d60f358e253b4013495b07948..f2da34f7eb814bc46665ac3b7a34385acd11a885
--- a/examples/docs-only/docs/ROADMAP.md
+++ b/examples/docs-only/docs/ROADMAP.md
@@ -3,6 +3,8 @@
 This example follows the root Open Autonomy roadmap and keeps only local demo
 notes here.
 
+Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
+
 Local proof focus:
 
 - small documentation edits through PM, develop, review, and merge
diff --git a/examples/library/README.md b/examples/library/README.md
index 1c471de4964a2386c1e41f3d98b6442884a44f37..bc168ab2a63923178896e0f4ee8fae3656a7cbf4
--- a/examples/library/README.md
+++ b/examples/library/README.md
@@ -3,6 +3,10 @@
 This is a minimal full repository shape for using open-autonomy on a small
 TypeScript library.
 
+This cookbook is a pushable standalone repo: copy `examples/library/` into a
+new GitHub repository, keep the local docs in `docs/`, and follow the local
+roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
+
 It is intentionally small:
 
 - issues can request bounded library and documentation edits
diff --git a/examples/library/docs/ROADMAP.md b/examples/library/docs/ROADMAP.md
index 84e406a28221cac14c55e3b96e3cfce550cd3a4e..21c6799166c0de1e32e43659ab1b0dcc11026945
--- a/examples/library/docs/ROADMAP.md
+++ b/examples/library/docs/ROADMAP.md
@@ -3,6 +3,8 @@
 This example follows the root Open Autonomy roadmap and keeps only local library
 demo notes here.
 
+Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
+
 Local proof focus:
 
 - small library and documentation edits through PM, develop, review, and merge
diff --git a/examples/small-app/README.md b/examples/small-app/README.md
index ee5dcec969d224386549438719e9777d983f4971..22495505c4f521202f765a8a82dc66c4a33ad16b
--- a/examples/small-app/README.md
+++ b/examples/small-app/README.md
@@ -3,6 +3,10 @@
 This is a minimal full repository shape for using open-autonomy on a small
 TypeScript application.
 
+This cookbook is a pushable standalone repo: copy `examples/small-app/` into a
+new GitHub repository, keep the local docs in `docs/`, and follow the local
+roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
+
 It is intentionally small:
 
 - issues can request bounded app and documentation edits
diff --git a/examples/small-app/docs/ROADMAP.md b/examples/small-app/docs/ROADMAP.md
index d0631a853bb828fa34a26b0bf2c5784e71f9904e..6d0c3dc023bac76ae702174d6ef108fa84d530ae
--- a/examples/small-app/docs/ROADMAP.md
+++ b/examples/small-app/docs/ROADMAP.md
@@ -3,6 +3,8 @@
 This example follows the root Open Autonomy roadmap and keeps only local app
 demo notes here.
 
+Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
+
 Local proof focus:
 
 - small app and documentation edits through PM, develop, review, and merge

diff --git a/docs/PROOF_LEDGER.md b/docs/PROOF_LEDGER.md
index c8f671ce082fa6596e567b6d733c580f82cbb1cb..e277fbe5167f8b6dd52d033ed52b065b0a30ba43
--- a/docs/PROOF_LEDGER.md
+++ b/docs/PROOF_LEDGER.md
@@ -19,4 +19,4 @@
 | `status-reconstruction` | `scripts/public-agent-decision-index.ts`, status reconstruction tests, governance runs | done |
 | `quality-review-repair` | `scripts/public-agent-loop-budget.ts`, `scripts/public-agent-context.ts`, `scripts/public-agent-control.test.ts` | done |
 | `governance-maintainer-hold` | `scripts/public-agent-merge-gate.ts`, `scripts/public-agent-policy.ts`, `scripts/public-agent-control.test.ts` | done |
-| `release-dogfood` | `VERSION`, `.open-autonomy/version.json`, `CHANGELOG.md`, `docs/RELEASE.md`, manifest version tests | done |
+| `release-dogfood` | `VERSION`, `.open-autonomy/version.json`, `CHANGELOG.md`, `docs/RELEASE.md`, manifest version tests, and the committed release checklist in `docs/PROOF_LEDGER.md` | done |
diff --git a/docs/RELEASE.md b/docs/RELEASE.md
index 4748b8f647bafe4ee8b031ef2b8c4f7ea9db7149..9885acc6fd1acc9695047e2533acad87032ea752
--- a/docs/RELEASE.md
+++ b/docs/RELEASE.md
@@ -10,8 +10,9 @@
 3. Run planner, preflight, and governance-report workflows on `main`.
 4. Scaffold `templates/self-driving-repo/` into a clean directory and run its
    `bun run check`.
-5. Verify `examples/docs-only`, `examples/small-app`, `examples/library`, and
-   `examples/testbed` can run their local checks.
+5. Verify the committed release evidence in [`docs/PROOF_LEDGER.md`](./PROOF_LEDGER.md)
+   and confirm `examples/docs-only`, `examples/small-app`, `examples/library`,
+   and `examples/testbed` can run their local checks.
 6. Tag the release as `vX.Y.Z`.
 7. Record migration notes for template changes in the changelog.
 
diff --git a/examples/docs-only/README.md b/examples/docs-only/README.md
index aab4327b63080b0c87de5cfa1a80442364232ccd..2165064d1baed1675130bc1e13b0da2e77b0a288
--- a/examples/docs-only/README.md
+++ b/examples/docs-only/README.md
@@ -3,6 +3,10 @@
 This is a minimal full repository shape for using open-autonomy on a
 documentation-only project.
 
+This cookbook is a pushable standalone repo: copy `examples/docs-only/` into a
+new GitHub repository, keep the local docs in `docs/`, and follow the local
+roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
+
 It is intentionally small:
 
 - issues can request documentation edits
diff --git a/examples/docs-only/docs/ROADMAP.md b/examples/docs-only/docs/ROADMAP.md
index b535c785cfabe17d60f358e253b4013495b07948..f2da34f7eb814bc46665ac3b7a34385acd11a885
--- a/examples/docs-only/docs/ROADMAP.md
+++ b/examples/docs-only/docs/ROADMAP.md
@@ -3,6 +3,8 @@
 This example follows the root Open Autonomy roadmap and keeps only local demo
 notes here.
 
+Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
+
 Local proof focus:
 
 - small documentation edits through PM, develop, review, and merge
diff --git a/examples/library/README.md b/examples/library/README.md
index 1c471de4964a2386c1e41f3d98b6442884a44f37..bc168ab2a63923178896e0f4ee8fae3656a7cbf4
--- a/examples/library/README.md
+++ b/examples/library/README.md
@@ -3,6 +3,10 @@
 This is a minimal full repository shape for using open-autonomy on a small
 TypeScript library.
 
+This cookbook is a pushable standalone repo: copy `examples/library/` into a
+new GitHub repository, keep the local docs in `docs/`, and follow the local
+roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
+
 It is intentionally small:
 
 - issues can request bounded library and documentation edits
diff --git a/examples/library/docs/ROADMAP.md b/examples/library/docs/ROADMAP.md
index 84e406a28221cac14c55e3b96e3cfce550cd3a4e..21c6799166c0de1e32e43659ab1b0dcc11026945
--- a/examples/library/docs/ROADMAP.md
+++ b/examples/library/docs/ROADMAP.md
@@ -3,6 +3,8 @@
 This example follows the root Open Autonomy roadmap and keeps only local library
 demo notes here.
 
+Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
+
 Local proof focus:
 
 - small library and documentation edits through PM, develop, review, and merge
diff --git a/examples/small-app/README.md b/examples/small-app/README.md
index ee5dcec969d224386549438719e9777d983f4971..22495505c4f521202f765a8a82dc66c4a33ad16b
--- a/examples/small-app/README.md
+++ b/examples/small-app/README.md
@@ -3,6 +3,10 @@
 This is a minimal full repository shape for using open-autonomy on a small
 TypeScript application.
 
+This cookbook is a pushable standalone repo: copy `examples/small-app/` into a
+new GitHub repository, keep the local docs in `docs/`, and follow the local
+roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
+
 It is intentionally small:
 
 - issues can request bounded app and documentation edits
diff --git a/examples/small-app/docs/ROADMAP.md b/examples/small-app/docs/ROADMAP.md
index d0631a853bb828fa34a26b0bf2c5784e71f9904e..6d0c3dc023bac76ae702174d6ef108fa84d530ae
--- a/examples/small-app/docs/ROADMAP.md
+++ b/examples/small-app/docs/ROADMAP.md
@@ -3,6 +3,8 @@
 This example follows the root Open Autonomy roadmap and keeps only local app
 demo notes here.
 
+Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
+
 Local proof focus:
 
 - small app and documentation edits through PM, develop, review, and merge

codex
The doc patch is in. I’m doing a quick pass for wording issues and to make sure the new release-evidence text points to the right committed artifact, then I’ll run a lightweight check and write the required artifact files.
exec
/bin/bash -lc 'git diff -- examples/docs-only/README.md examples/docs-only/docs/ROADMAP.md examples/library/README.md examples/library/docs/ROADMAP.md examples/small-app/README.md examples/small-app/docs/ROADMAP.md docs/RELEASE.md docs/PROOF_LEDGER.md' in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
diff --git a/docs/PROOF_LEDGER.md b/docs/PROOF_LEDGER.md
index c8f671c..e277fbe 100644
--- a/docs/PROOF_LEDGER.md
+++ b/docs/PROOF_LEDGER.md
@@ -19,4 +19,4 @@ model run less reliable than the gate being tested.
 | `status-reconstruction` | `scripts/public-agent-decision-index.ts`, status reconstruction tests, governance runs | done |
 | `quality-review-repair` | `scripts/public-agent-loop-budget.ts`, `scripts/public-agent-context.ts`, `scripts/public-agent-control.test.ts` | done |
 | `governance-maintainer-hold` | `scripts/public-agent-merge-gate.ts`, `scripts/public-agent-policy.ts`, `scripts/public-agent-control.test.ts` | done |
-| `release-dogfood` | `VERSION`, `.open-autonomy/version.json`, `CHANGELOG.md`, `docs/RELEASE.md`, manifest version tests | done |
+| `release-dogfood` | `VERSION`, `.open-autonomy/version.json`, `CHANGELOG.md`, `docs/RELEASE.md`, manifest version tests, and the committed release checklist in `docs/PROOF_LEDGER.md` | done |
diff --git a/docs/RELEASE.md b/docs/RELEASE.md
index 4748b8f..9885acc 100644
--- a/docs/RELEASE.md
+++ b/docs/RELEASE.md
@@ -10,8 +10,9 @@ Release checklist:
 3. Run planner, preflight, and governance-report workflows on `main`.
 4. Scaffold `templates/self-driving-repo/` into a clean directory and run its
    `bun run check`.
-5. Verify `examples/docs-only`, `examples/small-app`, `examples/library`, and
-   `examples/testbed` can run their local checks.
+5. Verify the committed release evidence in [`docs/PROOF_LEDGER.md`](./PROOF_LEDGER.md)
+   and confirm `examples/docs-only`, `examples/small-app`, `examples/library`,
+   and `examples/testbed` can run their local checks.
 6. Tag the release as `vX.Y.Z`.
 7. Record migration notes for template changes in the changelog.
 
diff --git a/examples/docs-only/README.md b/examples/docs-only/README.md
index aab4327..2165064 100644
--- a/examples/docs-only/README.md
+++ b/examples/docs-only/README.md
@@ -3,6 +3,10 @@
 This is a minimal full repository shape for using open-autonomy on a
 documentation-only project.
 
+This cookbook is a pushable standalone repo: copy `examples/docs-only/` into a
+new GitHub repository, keep the local docs in `docs/`, and follow the local
+roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
+
 It is intentionally small:
 
 - issues can request documentation edits
diff --git a/examples/docs-only/docs/ROADMAP.md b/examples/docs-only/docs/ROADMAP.md
index b535c78..f2da34f 100644
--- a/examples/docs-only/docs/ROADMAP.md
+++ b/examples/docs-only/docs/ROADMAP.md
@@ -3,6 +3,8 @@
 This example follows the root Open Autonomy roadmap and keeps only local demo
 notes here.
 
+Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
+
 Local proof focus:
 
 - small documentation edits through PM, develop, review, and merge
diff --git a/examples/library/README.md b/examples/library/README.md
index 1c471de..bc168ab 100644
--- a/examples/library/README.md
+++ b/examples/library/README.md
@@ -3,6 +3,10 @@
 This is a minimal full repository shape for using open-autonomy on a small
 TypeScript library.
 
+This cookbook is a pushable standalone repo: copy `examples/library/` into a
+new GitHub repository, keep the local docs in `docs/`, and follow the local
+roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
+
 It is intentionally small:
 
 - issues can request bounded library and documentation edits
diff --git a/examples/library/docs/ROADMAP.md b/examples/library/docs/ROADMAP.md
index 84e406a..21c6799 100644
--- a/examples/library/docs/ROADMAP.md
+++ b/examples/library/docs/ROADMAP.md
@@ -3,6 +3,8 @@
 This example follows the root Open Autonomy roadmap and keeps only local library
 demo notes here.
 
+Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
+
 Local proof focus:
 
 - small library and documentation edits through PM, develop, review, and merge
diff --git a/examples/small-app/README.md b/examples/small-app/README.md
index ee5dcec..2249550 100644
--- a/examples/small-app/README.md
+++ b/examples/small-app/README.md
@@ -3,6 +3,10 @@
 This is a minimal full repository shape for using open-autonomy on a small
 TypeScript application.
 
+This cookbook is a pushable standalone repo: copy `examples/small-app/` into a
+new GitHub repository, keep the local docs in `docs/`, and follow the local
+roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
+
 It is intentionally small:
 
 - issues can request bounded app and documentation edits
diff --git a/examples/small-app/docs/ROADMAP.md b/examples/small-app/docs/ROADMAP.md
index d0631a8..6d0c3dc 100644
--- a/examples/small-app/docs/ROADMAP.md
+++ b/examples/small-app/docs/ROADMAP.md
@@ -3,6 +3,8 @@
 This example follows the root Open Autonomy roadmap and keeps only local app
 demo notes here.
 
+Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
+
 Local proof focus:
 
 - small app and documentation edits through PM, develop, review, and merge

exec
/bin/bash -lc 'git diff --check' in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
diff --git a/docs/PROOF_LEDGER.md b/docs/PROOF_LEDGER.md
index c8f671ce082fa6596e567b6d733c580f82cbb1cb..e277fbe5167f8b6dd52d033ed52b065b0a30ba43
--- a/docs/PROOF_LEDGER.md
+++ b/docs/PROOF_LEDGER.md
@@ -19,4 +19,4 @@
 | `status-reconstruction` | `scripts/public-agent-decision-index.ts`, status reconstruction tests, governance runs | done |
 | `quality-review-repair` | `scripts/public-agent-loop-budget.ts`, `scripts/public-agent-context.ts`, `scripts/public-agent-control.test.ts` | done |
 | `governance-maintainer-hold` | `scripts/public-agent-merge-gate.ts`, `scripts/public-agent-policy.ts`, `scripts/public-agent-control.test.ts` | done |
-| `release-dogfood` | `VERSION`, `.open-autonomy/version.json`, `CHANGELOG.md`, `docs/RELEASE.md`, manifest version tests | done |
+| `release-dogfood` | `VERSION`, `.open-autonomy/version.json`, `CHANGELOG.md`, `docs/RELEASE.md`, manifest version tests, and the committed release checklist in `docs/PROOF_LEDGER.md` | done |
diff --git a/docs/RELEASE.md b/docs/RELEASE.md
index 4748b8f647bafe4ee8b031ef2b8c4f7ea9db7149..9885acc6fd1acc9695047e2533acad87032ea752
--- a/docs/RELEASE.md
+++ b/docs/RELEASE.md
@@ -10,8 +10,9 @@
 3. Run planner, preflight, and governance-report workflows on `main`.
 4. Scaffold `templates/self-driving-repo/` into a clean directory and run its
    `bun run check`.
-5. Verify `examples/docs-only`, `examples/small-app`, `examples/library`, and
-   `examples/testbed` can run their local checks.
+5. Verify the committed release evidence in [`docs/PROOF_LEDGER.md`](./PROOF_LEDGER.md)
+   and confirm `examples/docs-only`, `examples/small-app`, `examples/library`,
+   and `examples/testbed` can run their local checks.
 6. Tag the release as `vX.Y.Z`.
 7. Record migration notes for template changes in the changelog.
 
diff --git a/examples/docs-only/README.md b/examples/docs-only/README.md
index aab4327b63080b0c87de5cfa1a80442364232ccd..2165064d1baed1675130bc1e13b0da2e77b0a288
--- a/examples/docs-only/README.md
+++ b/examples/docs-only/README.md
@@ -3,6 +3,10 @@
 This is a minimal full repository shape for using open-autonomy on a
 documentation-only project.
 
+This cookbook is a pushable standalone repo: copy `examples/docs-only/` into a
+new GitHub repository, keep the local docs in `docs/`, and follow the local
+roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
+
 It is intentionally small:
 
 - issues can request documentation edits
diff --git a/examples/docs-only/docs/ROADMAP.md b/examples/docs-only/docs/ROADMAP.md
index b535c785cfabe17d60f358e253b4013495b07948..f2da34f7eb814bc46665ac3b7a34385acd11a885
--- a/examples/docs-only/docs/ROADMAP.md
+++ b/examples/docs-only/docs/ROADMAP.md
@@ -3,6 +3,8 @@
 This example follows the root Open Autonomy roadmap and keeps only local demo
 notes here.
 
+Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
+
 Local proof focus:
 
 - small documentation edits through PM, develop, review, and merge
diff --git a/examples/library/README.md b/examples/library/README.md
index 1c471de4964a2386c1e41f3d98b6442884a44f37..bc168ab2a63923178896e0f4ee8fae3656a7cbf4
--- a/examples/library/README.md
+++ b/examples/library/README.md
@@ -3,6 +3,10 @@
 This is a minimal full repository shape for using open-autonomy on a small
 TypeScript library.
 
+This cookbook is a pushable standalone repo: copy `examples/library/` into a
+new GitHub repository, keep the local docs in `docs/`, and follow the local
+roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
+
 It is intentionally small:
 
 - issues can request bounded library and documentation edits
diff --git a/examples/library/docs/ROADMAP.md b/examples/library/docs/ROADMAP.md
index 84e406a28221cac14c55e3b96e3cfce550cd3a4e..21c6799166c0de1e32e43659ab1b0dcc11026945
--- a/examples/library/docs/ROADMAP.md
+++ b/examples/library/docs/ROADMAP.md
@@ -3,6 +3,8 @@
 This example follows the root Open Autonomy roadmap and keeps only local library
 demo notes here.
 
+Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
+
 Local proof focus:
 
 - small library and documentation edits through PM, develop, review, and merge
diff --git a/examples/small-app/README.md b/examples/small-app/README.md
index ee5dcec969d224386549438719e9777d983f4971..22495505c4f521202f765a8a82dc66c4a33ad16b
--- a/examples/small-app/README.md
+++ b/examples/small-app/README.md
@@ -3,6 +3,10 @@
 This is a minimal full repository shape for using open-autonomy on a small
 TypeScript application.
 
+This cookbook is a pushable standalone repo: copy `examples/small-app/` into a
+new GitHub repository, keep the local docs in `docs/`, and follow the local
+roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
+
 It is intentionally small:
 
 - issues can request bounded app and documentation edits
diff --git a/examples/small-app/docs/ROADMAP.md b/examples/small-app/docs/ROADMAP.md
index d0631a853bb828fa34a26b0bf2c5784e71f9904e..6d0c3dc023bac76ae702174d6ef108fa84d530ae
--- a/examples/small-app/docs/ROADMAP.md
+++ b/examples/small-app/docs/ROADMAP.md
@@ -3,6 +3,8 @@
 This example follows the root Open Autonomy roadmap and keeps only local app
 demo notes here.
 
+Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
+
 Local proof focus:
 
 - small app and documentation edits through PM, develop, review, and merge

codex
One wording fix: the proof ledger entry should reference the release checklist in `docs/RELEASE.md`, not itself. I’m correcting that and then I’ll record the verification artifacts.
apply patch
patch: completed
/home/runner/work/open-autonomy/open-autonomy/docs/PROOF_LEDGER.md
diff --git a/docs/PROOF_LEDGER.md b/docs/PROOF_LEDGER.md
index c8f671ce082fa6596e567b6d733c580f82cbb1cb..bd4636bf811eeed0cb24cd048f9feb025e50966a
--- a/docs/PROOF_LEDGER.md
+++ b/docs/PROOF_LEDGER.md
@@ -19,4 +19,4 @@
 | `status-reconstruction` | `scripts/public-agent-decision-index.ts`, status reconstruction tests, governance runs | done |
 | `quality-review-repair` | `scripts/public-agent-loop-budget.ts`, `scripts/public-agent-context.ts`, `scripts/public-agent-control.test.ts` | done |
 | `governance-maintainer-hold` | `scripts/public-agent-merge-gate.ts`, `scripts/public-agent-policy.ts`, `scripts/public-agent-control.test.ts` | done |
-| `release-dogfood` | `VERSION`, `.open-autonomy/version.json`, `CHANGELOG.md`, `docs/RELEASE.md`, manifest version tests | done |
+| `release-dogfood` | `VERSION`, `.open-autonomy/version.json`, `CHANGELOG.md`, `docs/RELEASE.md`, manifest version tests, and the committed release checklist in `docs/RELEASE.md` | done |
diff --git a/docs/RELEASE.md b/docs/RELEASE.md
index 4748b8f647bafe4ee8b031ef2b8c4f7ea9db7149..9885acc6fd1acc9695047e2533acad87032ea752
--- a/docs/RELEASE.md
+++ b/docs/RELEASE.md
@@ -10,8 +10,9 @@
 3. Run planner, preflight, and governance-report workflows on `main`.
 4. Scaffold `templates/self-driving-repo/` into a clean directory and run its
    `bun run check`.
-5. Verify `examples/docs-only`, `examples/small-app`, `examples/library`, and
-   `examples/testbed` can run their local checks.
+5. Verify the committed release evidence in [`docs/PROOF_LEDGER.md`](./PROOF_LEDGER.md)
+   and confirm `examples/docs-only`, `examples/small-app`, `examples/library`,
+   and `examples/testbed` can run their local checks.
 6. Tag the release as `vX.Y.Z`.
 7. Record migration notes for template changes in the changelog.
 
diff --git a/examples/docs-only/README.md b/examples/docs-only/README.md
index aab4327b63080b0c87de5cfa1a80442364232ccd..2165064d1baed1675130bc1e13b0da2e77b0a288
--- a/examples/docs-only/README.md
+++ b/examples/docs-only/README.md
@@ -3,6 +3,10 @@
 This is a minimal full repository shape for using open-autonomy on a
 documentation-only project.
 
+This cookbook is a pushable standalone repo: copy `examples/docs-only/` into a
+new GitHub repository, keep the local docs in `docs/`, and follow the local
+roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
+
 It is intentionally small:
 
 - issues can request documentation edits
diff --git a/examples/docs-only/docs/ROADMAP.md b/examples/docs-only/docs/ROADMAP.md
index b535c785cfabe17d60f358e253b4013495b07948..f2da34f7eb814bc46665ac3b7a34385acd11a885
--- a/examples/docs-only/docs/ROADMAP.md
+++ b/examples/docs-only/docs/ROADMAP.md
@@ -3,6 +3,8 @@
 This example follows the root Open Autonomy roadmap and keeps only local demo
 notes here.
 
+Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
+
 Local proof focus:
 
 - small documentation edits through PM, develop, review, and merge
diff --git a/examples/library/README.md b/examples/library/README.md
index 1c471de4964a2386c1e41f3d98b6442884a44f37..bc168ab2a63923178896e0f4ee8fae3656a7cbf4
--- a/examples/library/README.md
+++ b/examples/library/README.md
@@ -3,6 +3,10 @@
 This is a minimal full repository shape for using open-autonomy on a small
 TypeScript library.
 
+This cookbook is a pushable standalone repo: copy `examples/library/` into a
+new GitHub repository, keep the local docs in `docs/`, and follow the local
+roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
+
 It is intentionally small:
 
 - issues can request bounded library and documentation edits
diff --git a/examples/library/docs/ROADMAP.md b/examples/library/docs/ROADMAP.md
index 84e406a28221cac14c55e3b96e3cfce550cd3a4e..21c6799166c0de1e32e43659ab1b0dcc11026945
--- a/examples/library/docs/ROADMAP.md
+++ b/examples/library/docs/ROADMAP.md
@@ -3,6 +3,8 @@
 This example follows the root Open Autonomy roadmap and keeps only local library
 demo notes here.
 
+Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
+
 Local proof focus:
 
 - small library and documentation edits through PM, develop, review, and merge
diff --git a/examples/small-app/README.md b/examples/small-app/README.md
index ee5dcec969d224386549438719e9777d983f4971..22495505c4f521202f765a8a82dc66c4a33ad16b
--- a/examples/small-app/README.md
+++ b/examples/small-app/README.md
@@ -3,6 +3,10 @@
 This is a minimal full repository shape for using open-autonomy on a small
 TypeScript application.
 
+This cookbook is a pushable standalone repo: copy `examples/small-app/` into a
+new GitHub repository, keep the local docs in `docs/`, and follow the local
+roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
+
 It is intentionally small:
 
 - issues can request bounded app and documentation edits
diff --git a/examples/small-app/docs/ROADMAP.md b/examples/small-app/docs/ROADMAP.md
index d0631a853bb828fa34a26b0bf2c5784e71f9904e..6d0c3dc023bac76ae702174d6ef108fa84d530ae
--- a/examples/small-app/docs/ROADMAP.md
+++ b/examples/small-app/docs/ROADMAP.md
@@ -3,6 +3,8 @@
 This example follows the root Open Autonomy roadmap and keeps only local app
 demo notes here.
 
+Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
+
 Local proof focus:
 
 - small app and documentation edits through PM, develop, review, and merge

diff --git a/docs/PROOF_LEDGER.md b/docs/PROOF_LEDGER.md
index c8f671ce082fa6596e567b6d733c580f82cbb1cb..bd4636bf811eeed0cb24cd048f9feb025e50966a
--- a/docs/PROOF_LEDGER.md
+++ b/docs/PROOF_LEDGER.md
@@ -19,4 +19,4 @@
 | `status-reconstruction` | `scripts/public-agent-decision-index.ts`, status reconstruction tests, governance runs | done |
 | `quality-review-repair` | `scripts/public-agent-loop-budget.ts`, `scripts/public-agent-context.ts`, `scripts/public-agent-control.test.ts` | done |
 | `governance-maintainer-hold` | `scripts/public-agent-merge-gate.ts`, `scripts/public-agent-policy.ts`, `scripts/public-agent-control.test.ts` | done |
-| `release-dogfood` | `VERSION`, `.open-autonomy/version.json`, `CHANGELOG.md`, `docs/RELEASE.md`, manifest version tests | done |
+| `release-dogfood` | `VERSION`, `.open-autonomy/version.json`, `CHANGELOG.md`, `docs/RELEASE.md`, manifest version tests, and the committed release checklist in `docs/RELEASE.md` | done |
diff --git a/docs/RELEASE.md b/docs/RELEASE.md
index 4748b8f647bafe4ee8b031ef2b8c4f7ea9db7149..9885acc6fd1acc9695047e2533acad87032ea752
--- a/docs/RELEASE.md
+++ b/docs/RELEASE.md
@@ -10,8 +10,9 @@
 3. Run planner, preflight, and governance-report workflows on `main`.
 4. Scaffold `templates/self-driving-repo/` into a clean directory and run its
    `bun run check`.
-5. Verify `examples/docs-only`, `examples/small-app`, `examples/library`, and
-   `examples/testbed` can run their local checks.
+5. Verify the committed release evidence in [`docs/PROOF_LEDGER.md`](./PROOF_LEDGER.md)
+   and confirm `examples/docs-only`, `examples/small-app`, `examples/library`,
+   and `examples/testbed` can run their local checks.
 6. Tag the release as `vX.Y.Z`.
 7. Record migration notes for template changes in the changelog.
 
diff --git a/examples/docs-only/README.md b/examples/docs-only/README.md
index aab4327b63080b0c87de5cfa1a80442364232ccd..2165064d1baed1675130bc1e13b0da2e77b0a288
--- a/examples/docs-only/README.md
+++ b/examples/docs-only/README.md
@@ -3,6 +3,10 @@
 This is a minimal full repository shape for using open-autonomy on a
 documentation-only project.
 
+This cookbook is a pushable standalone repo: copy `examples/docs-only/` into a
+new GitHub repository, keep the local docs in `docs/`, and follow the local
+roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
+
 It is intentionally small:
 
 - issues can request documentation edits
diff --git a/examples/docs-only/docs/ROADMAP.md b/examples/docs-only/docs/ROADMAP.md
index b535c785cfabe17d60f358e253b4013495b07948..f2da34f7eb814bc46665ac3b7a34385acd11a885
--- a/examples/docs-only/docs/ROADMAP.md
+++ b/examples/docs-only/docs/ROADMAP.md
@@ -3,6 +3,8 @@
 This example follows the root Open Autonomy roadmap and keeps only local demo
 notes here.
 
+Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
+
 Local proof focus:
 
 - small documentation edits through PM, develop, review, and merge
diff --git a/examples/library/README.md b/examples/library/README.md
index 1c471de4964a2386c1e41f3d98b6442884a44f37..bc168ab2a63923178896e0f4ee8fae3656a7cbf4
--- a/examples/library/README.md
+++ b/examples/library/README.md
@@ -3,6 +3,10 @@
 This is a minimal full repository shape for using open-autonomy on a small
 TypeScript library.
 
+This cookbook is a pushable standalone repo: copy `examples/library/` into a
+new GitHub repository, keep the local docs in `docs/`, and follow the local
+roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
+
 It is intentionally small:
 
 - issues can request bounded library and documentation edits
diff --git a/examples/library/docs/ROADMAP.md b/examples/library/docs/ROADMAP.md
index 84e406a28221cac14c55e3b96e3cfce550cd3a4e..21c6799166c0de1e32e43659ab1b0dcc11026945
--- a/examples/library/docs/ROADMAP.md
+++ b/examples/library/docs/ROADMAP.md
@@ -3,6 +3,8 @@
 This example follows the root Open Autonomy roadmap and keeps only local library
 demo notes here.
 
+Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
+
 Local proof focus:
 
 - small library and documentation edits through PM, develop, review, and merge
diff --git a/examples/small-app/README.md b/examples/small-app/README.md
index ee5dcec969d224386549438719e9777d983f4971..22495505c4f521202f765a8a82dc66c4a33ad16b
--- a/examples/small-app/README.md
+++ b/examples/small-app/README.md
@@ -3,6 +3,10 @@
 This is a minimal full repository shape for using open-autonomy on a small
 TypeScript application.
 
+This cookbook is a pushable standalone repo: copy `examples/small-app/` into a
+new GitHub repository, keep the local docs in `docs/`, and follow the local
+roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
+
 It is intentionally small:
 
 - issues can request bounded app and documentation edits
diff --git a/examples/small-app/docs/ROADMAP.md b/examples/small-app/docs/ROADMAP.md
index d0631a853bb828fa34a26b0bf2c5784e71f9904e..6d0c3dc023bac76ae702174d6ef108fa84d530ae
--- a/examples/small-app/docs/ROADMAP.md
+++ b/examples/small-app/docs/ROADMAP.md
@@ -3,6 +3,8 @@
 This example follows the root Open Autonomy roadmap and keeps only local app
 demo notes here.
 
+Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
+
 Local proof focus:
 
 - small app and documentation edits through PM, develop, review, and merge

exec
/bin/bash -lc 'git diff --check' in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
exec
/bin/bash -lc 'rg -n "pushable standalone repo|Root roadmap:|committed release checklist" examples/docs-only examples/library examples/small-app docs/RELEASE.md docs/PROOF_LEDGER.md' in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
docs/PROOF_LEDGER.md:22:| `release-dogfood` | `VERSION`, `.open-autonomy/version.json`, `CHANGELOG.md`, `docs/RELEASE.md`, manifest version tests, and the committed release checklist in `docs/RELEASE.md` | done |
examples/docs-only/docs/ROADMAP.md:6:Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
examples/small-app/docs/ROADMAP.md:6:Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
examples/library/docs/ROADMAP.md:6:Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
examples/docs-only/README.md:6:This cookbook is a pushable standalone repo: copy `examples/docs-only/` into a
examples/small-app/README.md:6:This cookbook is a pushable standalone repo: copy `examples/small-app/` into a
examples/library/README.md:6:This cookbook is a pushable standalone repo: copy `examples/library/` into a

diff --git a/docs/PROOF_LEDGER.md b/docs/PROOF_LEDGER.md
index c8f671ce082fa6596e567b6d733c580f82cbb1cb..bd4636bf811eeed0cb24cd048f9feb025e50966a
--- a/docs/PROOF_LEDGER.md
+++ b/docs/PROOF_LEDGER.md
@@ -19,4 +19,4 @@
 | `status-reconstruction` | `scripts/public-agent-decision-index.ts`, status reconstruction tests, governance runs | done |
 | `quality-review-repair` | `scripts/public-agent-loop-budget.ts`, `scripts/public-agent-context.ts`, `scripts/public-agent-control.test.ts` | done |
 | `governance-maintainer-hold` | `scripts/public-agent-merge-gate.ts`, `scripts/public-agent-policy.ts`, `scripts/public-agent-control.test.ts` | done |
-| `release-dogfood` | `VERSION`, `.open-autonomy/version.json`, `CHANGELOG.md`, `docs/RELEASE.md`, manifest version tests | done |
+| `release-dogfood` | `VERSION`, `.open-autonomy/version.json`, `CHANGELOG.md`, `docs/RELEASE.md`, manifest version tests, and the committed release checklist in `docs/RELEASE.md` | done |
diff --git a/docs/RELEASE.md b/docs/RELEASE.md
index 4748b8f647bafe4ee8b031ef2b8c4f7ea9db7149..9885acc6fd1acc9695047e2533acad87032ea752
--- a/docs/RELEASE.md
+++ b/docs/RELEASE.md
@@ -10,8 +10,9 @@
 3. Run planner, preflight, and governance-report workflows on `main`.
 4. Scaffold `templates/self-driving-repo/` into a clean directory and run its
    `bun run check`.
-5. Verify `examples/docs-only`, `examples/small-app`, `examples/library`, and
-   `examples/testbed` can run their local checks.
+5. Verify the committed release evidence in [`docs/PROOF_LEDGER.md`](./PROOF_LEDGER.md)
+   and confirm `examples/docs-only`, `examples/small-app`, `examples/library`,
+   and `examples/testbed` can run their local checks.
 6. Tag the release as `vX.Y.Z`.
 7. Record migration notes for template changes in the changelog.
 
diff --git a/examples/docs-only/README.md b/examples/docs-only/README.md
index aab4327b63080b0c87de5cfa1a80442364232ccd..2165064d1baed1675130bc1e13b0da2e77b0a288
--- a/examples/docs-only/README.md
+++ b/examples/docs-only/README.md
@@ -3,6 +3,10 @@
 This is a minimal full repository shape for using open-autonomy on a
 documentation-only project.
 
+This cookbook is a pushable standalone repo: copy `examples/docs-only/` into a
+new GitHub repository, keep the local docs in `docs/`, and follow the local
+roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
+
 It is intentionally small:
 
 - issues can request documentation edits
diff --git a/examples/docs-only/docs/ROADMAP.md b/examples/docs-only/docs/ROADMAP.md
index b535c785cfabe17d60f358e253b4013495b07948..f2da34f7eb814bc46665ac3b7a34385acd11a885
--- a/examples/docs-only/docs/ROADMAP.md
+++ b/examples/docs-only/docs/ROADMAP.md
@@ -3,6 +3,8 @@
 This example follows the root Open Autonomy roadmap and keeps only local demo
 notes here.
 
+Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
+
 Local proof focus:
 
 - small documentation edits through PM, develop, review, and merge
diff --git a/examples/library/README.md b/examples/library/README.md
index 1c471de4964a2386c1e41f3d98b6442884a44f37..bc168ab2a63923178896e0f4ee8fae3656a7cbf4
--- a/examples/library/README.md
+++ b/examples/library/README.md
@@ -3,6 +3,10 @@
 This is a minimal full repository shape for using open-autonomy on a small
 TypeScript library.
 
+This cookbook is a pushable standalone repo: copy `examples/library/` into a
+new GitHub repository, keep the local docs in `docs/`, and follow the local
+roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
+
 It is intentionally small:
 
 - issues can request bounded library and documentation edits
diff --git a/examples/library/docs/ROADMAP.md b/examples/library/docs/ROADMAP.md
index 84e406a28221cac14c55e3b96e3cfce550cd3a4e..21c6799166c0de1e32e43659ab1b0dcc11026945
--- a/examples/library/docs/ROADMAP.md
+++ b/examples/library/docs/ROADMAP.md
@@ -3,6 +3,8 @@
 This example follows the root Open Autonomy roadmap and keeps only local library
 demo notes here.
 
+Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
+
 Local proof focus:
 
 - small library and documentation edits through PM, develop, review, and merge
diff --git a/examples/small-app/README.md b/examples/small-app/README.md
index ee5dcec969d224386549438719e9777d983f4971..22495505c4f521202f765a8a82dc66c4a33ad16b
--- a/examples/small-app/README.md
+++ b/examples/small-app/README.md
@@ -3,6 +3,10 @@
 This is a minimal full repository shape for using open-autonomy on a small
 TypeScript application.
 
+This cookbook is a pushable standalone repo: copy `examples/small-app/` into a
+new GitHub repository, keep the local docs in `docs/`, and follow the local
+roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
+
 It is intentionally small:
 
 - issues can request bounded app and documentation edits
diff --git a/examples/small-app/docs/ROADMAP.md b/examples/small-app/docs/ROADMAP.md
index d0631a853bb828fa34a26b0bf2c5784e71f9904e..6d0c3dc023bac76ae702174d6ef108fa84d530ae
--- a/examples/small-app/docs/ROADMAP.md
+++ b/examples/small-app/docs/ROADMAP.md
@@ -3,6 +3,8 @@
 This example follows the root Open Autonomy roadmap and keeps only local app
 demo notes here.
 
+Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
+
 Local proof focus:
 
 - small app and documentation edits through PM, develop, review, and merge

codex
The content check is clean and the new links/phrasing are present. I’m gathering the final file list now, then I’ll write the required PR summary, result JSON, and transcript artifacts.
exec
/bin/bash -lc 'git status --short' in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
 M docs/PROOF_LEDGER.md
 M docs/RELEASE.md
 M examples/docs-only/README.md
 M examples/docs-only/docs/ROADMAP.md
 M examples/library/README.md
 M examples/library/docs/ROADMAP.md
 M examples/small-app/README.md
 M examples/small-app/docs/ROADMAP.md

diff --git a/docs/PROOF_LEDGER.md b/docs/PROOF_LEDGER.md
index c8f671ce082fa6596e567b6d733c580f82cbb1cb..bd4636bf811eeed0cb24cd048f9feb025e50966a
--- a/docs/PROOF_LEDGER.md
+++ b/docs/PROOF_LEDGER.md
@@ -19,4 +19,4 @@
 | `status-reconstruction` | `scripts/public-agent-decision-index.ts`, status reconstruction tests, governance runs | done |
 | `quality-review-repair` | `scripts/public-agent-loop-budget.ts`, `scripts/public-agent-context.ts`, `scripts/public-agent-control.test.ts` | done |
 | `governance-maintainer-hold` | `scripts/public-agent-merge-gate.ts`, `scripts/public-agent-policy.ts`, `scripts/public-agent-control.test.ts` | done |
-| `release-dogfood` | `VERSION`, `.open-autonomy/version.json`, `CHANGELOG.md`, `docs/RELEASE.md`, manifest version tests | done |
+| `release-dogfood` | `VERSION`, `.open-autonomy/version.json`, `CHANGELOG.md`, `docs/RELEASE.md`, manifest version tests, and the committed release checklist in `docs/RELEASE.md` | done |
diff --git a/docs/RELEASE.md b/docs/RELEASE.md
index 4748b8f647bafe4ee8b031ef2b8c4f7ea9db7149..9885acc6fd1acc9695047e2533acad87032ea752
--- a/docs/RELEASE.md
+++ b/docs/RELEASE.md
@@ -10,8 +10,9 @@
 3. Run planner, preflight, and governance-report workflows on `main`.
 4. Scaffold `templates/self-driving-repo/` into a clean directory and run its
    `bun run check`.
-5. Verify `examples/docs-only`, `examples/small-app`, `examples/library`, and
-   `examples/testbed` can run their local checks.
+5. Verify the committed release evidence in [`docs/PROOF_LEDGER.md`](./PROOF_LEDGER.md)
+   and confirm `examples/docs-only`, `examples/small-app`, `examples/library`,
+   and `examples/testbed` can run their local checks.
 6. Tag the release as `vX.Y.Z`.
 7. Record migration notes for template changes in the changelog.
 
diff --git a/examples/docs-only/README.md b/examples/docs-only/README.md
index aab4327b63080b0c87de5cfa1a80442364232ccd..2165064d1baed1675130bc1e13b0da2e77b0a288
--- a/examples/docs-only/README.md
+++ b/examples/docs-only/README.md
@@ -3,6 +3,10 @@
 This is a minimal full repository shape for using open-autonomy on a
 documentation-only project.
 
+This cookbook is a pushable standalone repo: copy `examples/docs-only/` into a
+new GitHub repository, keep the local docs in `docs/`, and follow the local
+roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
+
 It is intentionally small:
 
 - issues can request documentation edits
diff --git a/examples/docs-only/docs/ROADMAP.md b/examples/docs-only/docs/ROADMAP.md
index b535c785cfabe17d60f358e253b4013495b07948..f2da34f7eb814bc46665ac3b7a34385acd11a885
--- a/examples/docs-only/docs/ROADMAP.md
+++ b/examples/docs-only/docs/ROADMAP.md
@@ -3,6 +3,8 @@
 This example follows the root Open Autonomy roadmap and keeps only local demo
 notes here.
 
+Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
+
 Local proof focus:
 
 - small documentation edits through PM, develop, review, and merge
diff --git a/examples/library/README.md b/examples/library/README.md
index 1c471de4964a2386c1e41f3d98b6442884a44f37..bc168ab2a63923178896e0f4ee8fae3656a7cbf4
--- a/examples/library/README.md
+++ b/examples/library/README.md
@@ -3,6 +3,10 @@
 This is a minimal full repository shape for using open-autonomy on a small
 TypeScript library.
 
+This cookbook is a pushable standalone repo: copy `examples/library/` into a
+new GitHub repository, keep the local docs in `docs/`, and follow the local
+roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
+
 It is intentionally small:
 
 - issues can request bounded library and documentation edits
diff --git a/examples/library/docs/ROADMAP.md b/examples/library/docs/ROADMAP.md
index 84e406a28221cac14c55e3b96e3cfce550cd3a4e..21c6799166c0de1e32e43659ab1b0dcc11026945
--- a/examples/library/docs/ROADMAP.md
+++ b/examples/library/docs/ROADMAP.md
@@ -3,6 +3,8 @@
 This example follows the root Open Autonomy roadmap and keeps only local library
 demo notes here.
 
+Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
+
 Local proof focus:
 
 - small library and documentation edits through PM, develop, review, and merge
diff --git a/examples/small-app/README.md b/examples/small-app/README.md
index ee5dcec969d224386549438719e9777d983f4971..22495505c4f521202f765a8a82dc66c4a33ad16b
--- a/examples/small-app/README.md
+++ b/examples/small-app/README.md
@@ -3,6 +3,10 @@
 This is a minimal full repository shape for using open-autonomy on a small
 TypeScript application.
 
+This cookbook is a pushable standalone repo: copy `examples/small-app/` into a
+new GitHub repository, keep the local docs in `docs/`, and follow the local
+roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
+
 It is intentionally small:
 
 - issues can request bounded app and documentation edits
diff --git a/examples/small-app/docs/ROADMAP.md b/examples/small-app/docs/ROADMAP.md
index d0631a853bb828fa34a26b0bf2c5784e71f9904e..6d0c3dc023bac76ae702174d6ef108fa84d530ae
--- a/examples/small-app/docs/ROADMAP.md
+++ b/examples/small-app/docs/ROADMAP.md
@@ -3,6 +3,8 @@
 This example follows the root Open Autonomy roadmap and keeps only local app
 demo notes here.
 
+Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
+
 Local proof focus:
 
 - small app and documentation edits through PM, develop, review, and merge

codex
I’m writing the required artifact files now. These are just run metadata and won’t touch the product surface.
apply patch
patch: completed
/home/runner/work/open-autonomy/open-autonomy/.agent-run/out/task/artifacts/pr.md
/home/runner/work/open-autonomy/open-autonomy/.agent-run/out/task/artifacts/result.json
/home/runner/work/open-autonomy/open-autonomy/.agent-run/out/task/artifacts/transcript.md
diff --git a/.agent-run/out/task/artifacts/pr.md b/.agent-run/out/task/artifacts/pr.md
new file mode 100644
index 0000000000000000000000000000000000000000..237c32ded0d5905b15bb9cd1582766d7bda68cc0
--- /dev/null
+++ b/.agent-run/out/task/artifacts/pr.md
@@ -0,0 +1,10 @@
+## Summary
+
+- Updated the three cookbook example READMEs so they explicitly describe the repos as pushable standalone demos and link to their local `docs/ROADMAP.md`.
+- Added a root-roadmap pointer to each cookbook roadmap doc so the example docs clearly link back to the canonical roadmap path.
+- Tightened release documentation so `release-dogfood` evidence is described in terms of committed artifacts and the release checklist.
+
+## Tests
+
+- `git diff --check`
+- `rg -n "pushable standalone repo|Root roadmap:|committed release checklist" examples/docs-only examples/library examples/small-app docs/RELEASE.md docs/PROOF_LEDGER.md`
diff --git a/.agent-run/out/task/artifacts/result.json b/.agent-run/out/task/artifacts/result.json
new file mode 100644
index 0000000000000000000000000000000000000000..a183035a5559fdb207d0e79c88e73997c76c070e
--- /dev/null
+++ b/.agent-run/out/task/artifacts/result.json
@@ -0,0 +1 @@
+{"ok":true,"issue":16,"summary":"Updated cookbook example READMEs and roadmap docs to call out standalone pushable repos with local roadmap links, and clarified release evidence to reference committed artifacts.","tests":["git diff --check","rg -n \"pushable standalone repo|Root roadmap:|committed release checklist\" examples/docs-only examples/library examples/small-app docs/RELEASE.md docs/PROOF_LEDGER.md"]}
diff --git a/.agent-run/out/task/artifacts/transcript.md b/.agent-run/out/task/artifacts/transcript.md
new file mode 100644
index 0000000000000000000000000000000000000000..0d69fb68583702e8b2e625d28b507ed256d05224
--- /dev/null
+++ b/.agent-run/out/task/artifacts/transcript.md
@@ -0,0 +1,5 @@
+Reviewed the roadmap item and local cookbook docs.
+Patched the docs-only, library, and small-app example READMEs to state they are pushable standalone repos with local roadmap links.
+Patched each example roadmap doc to point back to the root roadmap.
+Clarified release documentation and the proof ledger so release evidence is tied to committed artifacts and the release checklist.
+Verified the changes with `git diff --check` and targeted `rg` presence checks.
diff --git a/docs/PROOF_LEDGER.md b/docs/PROOF_LEDGER.md
index c8f671ce082fa6596e567b6d733c580f82cbb1cb..bd4636bf811eeed0cb24cd048f9feb025e50966a
--- a/docs/PROOF_LEDGER.md
+++ b/docs/PROOF_LEDGER.md
@@ -19,4 +19,4 @@
 | `status-reconstruction` | `scripts/public-agent-decision-index.ts`, status reconstruction tests, governance runs | done |
 | `quality-review-repair` | `scripts/public-agent-loop-budget.ts`, `scripts/public-agent-context.ts`, `scripts/public-agent-control.test.ts` | done |
 | `governance-maintainer-hold` | `scripts/public-agent-merge-gate.ts`, `scripts/public-agent-policy.ts`, `scripts/public-agent-control.test.ts` | done |
-| `release-dogfood` | `VERSION`, `.open-autonomy/version.json`, `CHANGELOG.md`, `docs/RELEASE.md`, manifest version tests | done |
+| `release-dogfood` | `VERSION`, `.open-autonomy/version.json`, `CHANGELOG.md`, `docs/RELEASE.md`, manifest version tests, and the committed release checklist in `docs/RELEASE.md` | done |
diff --git a/docs/RELEASE.md b/docs/RELEASE.md
index 4748b8f647bafe4ee8b031ef2b8c4f7ea9db7149..9885acc6fd1acc9695047e2533acad87032ea752
--- a/docs/RELEASE.md
+++ b/docs/RELEASE.md
@@ -10,8 +10,9 @@
 3. Run planner, preflight, and governance-report workflows on `main`.
 4. Scaffold `templates/self-driving-repo/` into a clean directory and run its
    `bun run check`.
-5. Verify `examples/docs-only`, `examples/small-app`, `examples/library`, and
-   `examples/testbed` can run their local checks.
+5. Verify the committed release evidence in [`docs/PROOF_LEDGER.md`](./PROOF_LEDGER.md)
+   and confirm `examples/docs-only`, `examples/small-app`, `examples/library`,
+   and `examples/testbed` can run their local checks.
 6. Tag the release as `vX.Y.Z`.
 7. Record migration notes for template changes in the changelog.
 
diff --git a/examples/docs-only/README.md b/examples/docs-only/README.md
index aab4327b63080b0c87de5cfa1a80442364232ccd..2165064d1baed1675130bc1e13b0da2e77b0a288
--- a/examples/docs-only/README.md
+++ b/examples/docs-only/README.md
@@ -3,6 +3,10 @@
 This is a minimal full repository shape for using open-autonomy on a
 documentation-only project.
 
+This cookbook is a pushable standalone repo: copy `examples/docs-only/` into a
+new GitHub repository, keep the local docs in `docs/`, and follow the local
+roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
+
 It is intentionally small:
 
 - issues can request documentation edits
diff --git a/examples/docs-only/docs/ROADMAP.md b/examples/docs-only/docs/ROADMAP.md
index b535c785cfabe17d60f358e253b4013495b07948..f2da34f7eb814bc46665ac3b7a34385acd11a885
--- a/examples/docs-only/docs/ROADMAP.md
+++ b/examples/docs-only/docs/ROADMAP.md
@@ -3,6 +3,8 @@
 This example follows the root Open Autonomy roadmap and keeps only local demo
 notes here.
 
+Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
+
 Local proof focus:
 
 - small documentation edits through PM, develop, review, and merge
diff --git a/examples/library/README.md b/examples/library/README.md
index 1c471de4964a2386c1e41f3d98b6442884a44f37..bc168ab2a63923178896e0f4ee8fae3656a7cbf4
--- a/examples/library/README.md
+++ b/examples/library/README.md
@@ -3,6 +3,10 @@
 This is a minimal full repository shape for using open-autonomy on a small
 TypeScript library.
 
+This cookbook is a pushable standalone repo: copy `examples/library/` into a
+new GitHub repository, keep the local docs in `docs/`, and follow the local
+roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
+
 It is intentionally small:
 
 - issues can request bounded library and documentation edits
diff --git a/examples/library/docs/ROADMAP.md b/examples/library/docs/ROADMAP.md
index 84e406a28221cac14c55e3b96e3cfce550cd3a4e..21c6799166c0de1e32e43659ab1b0dcc11026945
--- a/examples/library/docs/ROADMAP.md
+++ b/examples/library/docs/ROADMAP.md
@@ -3,6 +3,8 @@
 This example follows the root Open Autonomy roadmap and keeps only local library
 demo notes here.
 
+Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
+
 Local proof focus:
 
 - small library and documentation edits through PM, develop, review, and merge
diff --git a/examples/small-app/README.md b/examples/small-app/README.md
index ee5dcec969d224386549438719e9777d983f4971..22495505c4f521202f765a8a82dc66c4a33ad16b
--- a/examples/small-app/README.md
+++ b/examples/small-app/README.md
@@ -3,6 +3,10 @@
 This is a minimal full repository shape for using open-autonomy on a small
 TypeScript application.
 
+This cookbook is a pushable standalone repo: copy `examples/small-app/` into a
+new GitHub repository, keep the local docs in `docs/`, and follow the local
+roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
+
 It is intentionally small:
 
 - issues can request bounded app and documentation edits
diff --git a/examples/small-app/docs/ROADMAP.md b/examples/small-app/docs/ROADMAP.md
index d0631a853bb828fa34a26b0bf2c5784e71f9904e..6d0c3dc023bac76ae702174d6ef108fa84d530ae
--- a/examples/small-app/docs/ROADMAP.md
+++ b/examples/small-app/docs/ROADMAP.md
@@ -3,6 +3,8 @@
 This example follows the root Open Autonomy roadmap and keeps only local app
 demo notes here.
 
+Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
+
 Local proof focus:
 
 - small app and documentation edits through PM, develop, review, and merge

diff --git a/.agent-run/out/task/artifacts/pr.md b/.agent-run/out/task/artifacts/pr.md
new file mode 100644
index 0000000000000000000000000000000000000000..237c32ded0d5905b15bb9cd1582766d7bda68cc0
--- /dev/null
+++ b/.agent-run/out/task/artifacts/pr.md
@@ -0,0 +1,10 @@
+## Summary
+
+- Updated the three cookbook example READMEs so they explicitly describe the repos as pushable standalone demos and link to their local `docs/ROADMAP.md`.
+- Added a root-roadmap pointer to each cookbook roadmap doc so the example docs clearly link back to the canonical roadmap path.
+- Tightened release documentation so `release-dogfood` evidence is described in terms of committed artifacts and the release checklist.
+
+## Tests
+
+- `git diff --check`
+- `rg -n "pushable standalone repo|Root roadmap:|committed release checklist" examples/docs-only examples/library examples/small-app docs/RELEASE.md docs/PROOF_LEDGER.md`
diff --git a/.agent-run/out/task/artifacts/result.json b/.agent-run/out/task/artifacts/result.json
new file mode 100644
index 0000000000000000000000000000000000000000..a183035a5559fdb207d0e79c88e73997c76c070e
--- /dev/null
+++ b/.agent-run/out/task/artifacts/result.json
@@ -0,0 +1 @@
+{"ok":true,"issue":16,"summary":"Updated cookbook example READMEs and roadmap docs to call out standalone pushable repos with local roadmap links, and clarified release evidence to reference committed artifacts.","tests":["git diff --check","rg -n \"pushable standalone repo|Root roadmap:|committed release checklist\" examples/docs-only examples/library examples/small-app docs/RELEASE.md docs/PROOF_LEDGER.md"]}
diff --git a/.agent-run/out/task/artifacts/transcript.md b/.agent-run/out/task/artifacts/transcript.md
new file mode 100644
index 0000000000000000000000000000000000000000..0d69fb68583702e8b2e625d28b507ed256d05224
--- /dev/null
+++ b/.agent-run/out/task/artifacts/transcript.md
@@ -0,0 +1,5 @@
+Reviewed the roadmap item and local cookbook docs.
+Patched the docs-only, library, and small-app example READMEs to state they are pushable standalone repos with local roadmap links.
+Patched each example roadmap doc to point back to the root roadmap.
+Clarified release documentation and the proof ledger so release evidence is tied to committed artifacts and the release checklist.
+Verified the changes with `git diff --check` and targeted `rg` presence checks.
diff --git a/docs/PROOF_LEDGER.md b/docs/PROOF_LEDGER.md
index c8f671ce082fa6596e567b6d733c580f82cbb1cb..bd4636bf811eeed0cb24cd048f9feb025e50966a
--- a/docs/PROOF_LEDGER.md
+++ b/docs/PROOF_LEDGER.md
@@ -19,4 +19,4 @@
 | `status-reconstruction` | `scripts/public-agent-decision-index.ts`, status reconstruction tests, governance runs | done |
 | `quality-review-repair` | `scripts/public-agent-loop-budget.ts`, `scripts/public-agent-context.ts`, `scripts/public-agent-control.test.ts` | done |
 | `governance-maintainer-hold` | `scripts/public-agent-merge-gate.ts`, `scripts/public-agent-policy.ts`, `scripts/public-agent-control.test.ts` | done |
-| `release-dogfood` | `VERSION`, `.open-autonomy/version.json`, `CHANGELOG.md`, `docs/RELEASE.md`, manifest version tests | done |
+| `release-dogfood` | `VERSION`, `.open-autonomy/version.json`, `CHANGELOG.md`, `docs/RELEASE.md`, manifest version tests, and the committed release checklist in `docs/RELEASE.md` | done |
diff --git a/docs/RELEASE.md b/docs/RELEASE.md
index 4748b8f647bafe4ee8b031ef2b8c4f7ea9db7149..9885acc6fd1acc9695047e2533acad87032ea752
--- a/docs/RELEASE.md
+++ b/docs/RELEASE.md
@@ -10,8 +10,9 @@
 3. Run planner, preflight, and governance-report workflows on `main`.
 4. Scaffold `templates/self-driving-repo/` into a clean directory and run its
    `bun run check`.
-5. Verify `examples/docs-only`, `examples/small-app`, `examples/library`, and
-   `examples/testbed` can run their local checks.
+5. Verify the committed release evidence in [`docs/PROOF_LEDGER.md`](./PROOF_LEDGER.md)
+   and confirm `examples/docs-only`, `examples/small-app`, `examples/library`,
+   and `examples/testbed` can run their local checks.
 6. Tag the release as `vX.Y.Z`.
 7. Record migration notes for template changes in the changelog.
 
diff --git a/examples/docs-only/README.md b/examples/docs-only/README.md
index aab4327b63080b0c87de5cfa1a80442364232ccd..2165064d1baed1675130bc1e13b0da2e77b0a288
--- a/examples/docs-only/README.md
+++ b/examples/docs-only/README.md
@@ -3,6 +3,10 @@
 This is a minimal full repository shape for using open-autonomy on a
 documentation-only project.
 
+This cookbook is a pushable standalone repo: copy `examples/docs-only/` into a
+new GitHub repository, keep the local docs in `docs/`, and follow the local
+roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
+
 It is intentionally small:
 
 - issues can request documentation edits
diff --git a/examples/docs-only/docs/ROADMAP.md b/examples/docs-only/docs/ROADMAP.md
index b535c785cfabe17d60f358e253b4013495b07948..f2da34f7eb814bc46665ac3b7a34385acd11a885
--- a/examples/docs-only/docs/ROADMAP.md
+++ b/examples/docs-only/docs/ROADMAP.md
@@ -3,6 +3,8 @@
 This example follows the root Open Autonomy roadmap and keeps only local demo
 notes here.
 
+Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
+
 Local proof focus:
 
 - small documentation edits through PM, develop, review, and merge
diff --git a/examples/library/README.md b/examples/library/README.md
index 1c471de4964a2386c1e41f3d98b6442884a44f37..bc168ab2a63923178896e0f4ee8fae3656a7cbf4
--- a/examples/library/README.md
+++ b/examples/library/README.md
@@ -3,6 +3,10 @@
 This is a minimal full repository shape for using open-autonomy on a small
 TypeScript library.
 
+This cookbook is a pushable standalone repo: copy `examples/library/` into a
+new GitHub repository, keep the local docs in `docs/`, and follow the local
+roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
+
 It is intentionally small:
 
 - issues can request bounded library and documentation edits
diff --git a/examples/library/docs/ROADMAP.md b/examples/library/docs/ROADMAP.md
index 84e406a28221cac14c55e3b96e3cfce550cd3a4e..21c6799166c0de1e32e43659ab1b0dcc11026945
--- a/examples/library/docs/ROADMAP.md
+++ b/examples/library/docs/ROADMAP.md
@@ -3,6 +3,8 @@
 This example follows the root Open Autonomy roadmap and keeps only local library
 demo notes here.
 
+Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
+
 Local proof focus:
 
 - small library and documentation edits through PM, develop, review, and merge
diff --git a/examples/small-app/README.md b/examples/small-app/README.md
index ee5dcec969d224386549438719e9777d983f4971..22495505c4f521202f765a8a82dc66c4a33ad16b
--- a/examples/small-app/README.md
+++ b/examples/small-app/README.md
@@ -3,6 +3,10 @@
 This is a minimal full repository shape for using open-autonomy on a small
 TypeScript application.
 
+This cookbook is a pushable standalone repo: copy `examples/small-app/` into a
+new GitHub repository, keep the local docs in `docs/`, and follow the local
+roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
+
 It is intentionally small:
 
 - issues can request bounded app and documentation edits
diff --git a/examples/small-app/docs/ROADMAP.md b/examples/small-app/docs/ROADMAP.md
index d0631a853bb828fa34a26b0bf2c5784e71f9904e..6d0c3dc023bac76ae702174d6ef108fa84d530ae
--- a/examples/small-app/docs/ROADMAP.md
+++ b/examples/small-app/docs/ROADMAP.md
@@ -3,6 +3,8 @@
 This example follows the root Open Autonomy roadmap and keeps only local app
 demo notes here.
 
+Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
+
 Local proof focus:
 
 - small app and documentation edits through PM, develop, review, and merge

exec
/bin/bash -lc "sed -n '1,220p' .agent-run/out/task/artifacts/pr.md && printf '\\n---RESULT---\\n' && sed -n '1,220p' .agent-run/out/task/artifacts/result.json && printf '\\n---TRANSCRIPT---\\n' && sed -n '1,220p' .agent-run/out/task/artifacts/transcript.md" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
## Summary

- Updated the three cookbook example READMEs so they explicitly describe the repos as pushable standalone demos and link to their local `docs/ROADMAP.md`.
- Added a root-roadmap pointer to each cookbook roadmap doc so the example docs clearly link back to the canonical roadmap path.
- Tightened release documentation so `release-dogfood` evidence is described in terms of committed artifacts and the release checklist.

## Tests

- `git diff --check`
- `rg -n "pushable standalone repo|Root roadmap:|committed release checklist" examples/docs-only examples/library examples/small-app docs/RELEASE.md docs/PROOF_LEDGER.md`

---RESULT---
{"ok":true,"issue":16,"summary":"Updated cookbook example READMEs and roadmap docs to call out standalone pushable repos with local roadmap links, and clarified release evidence to reference committed artifacts.","tests":["git diff --check","rg -n \"pushable standalone repo|Root roadmap:|committed release checklist\" examples/docs-only examples/library examples/small-app docs/RELEASE.md docs/PROOF_LEDGER.md"]}

---TRANSCRIPT---
Reviewed the roadmap item and local cookbook docs.
Patched the docs-only, library, and small-app example READMEs to state they are pushable standalone repos with local roadmap links.
Patched each example roadmap doc to point back to the root roadmap.
Clarified release documentation and the proof ledger so release evidence is tied to committed artifacts and the release checklist.
Verified the changes with `git diff --check` and targeted `rg` presence checks.

exec
/bin/bash -lc 'git status --short' in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
 M docs/PROOF_LEDGER.md
 M docs/RELEASE.md
 M examples/docs-only/README.md
 M examples/docs-only/docs/ROADMAP.md
 M examples/library/README.md
 M examples/library/docs/ROADMAP.md
 M examples/small-app/README.md
 M examples/small-app/docs/ROADMAP.md

diff --git a/.agent-run/out/task/artifacts/pr.md b/.agent-run/out/task/artifacts/pr.md
new file mode 100644
index 0000000000000000000000000000000000000000..237c32ded0d5905b15bb9cd1582766d7bda68cc0
--- /dev/null
+++ b/.agent-run/out/task/artifacts/pr.md
@@ -0,0 +1,10 @@
+## Summary
+
+- Updated the three cookbook example READMEs so they explicitly describe the repos as pushable standalone demos and link to their local `docs/ROADMAP.md`.
+- Added a root-roadmap pointer to each cookbook roadmap doc so the example docs clearly link back to the canonical roadmap path.
+- Tightened release documentation so `release-dogfood` evidence is described in terms of committed artifacts and the release checklist.
+
+## Tests
+
+- `git diff --check`
+- `rg -n "pushable standalone repo|Root roadmap:|committed release checklist" examples/docs-only examples/library examples/small-app docs/RELEASE.md docs/PROOF_LEDGER.md`
diff --git a/.agent-run/out/task/artifacts/result.json b/.agent-run/out/task/artifacts/result.json
new file mode 100644
index 0000000000000000000000000000000000000000..a183035a5559fdb207d0e79c88e73997c76c070e
--- /dev/null
+++ b/.agent-run/out/task/artifacts/result.json
@@ -0,0 +1 @@
+{"ok":true,"issue":16,"summary":"Updated cookbook example READMEs and roadmap docs to call out standalone pushable repos with local roadmap links, and clarified release evidence to reference committed artifacts.","tests":["git diff --check","rg -n \"pushable standalone repo|Root roadmap:|committed release checklist\" examples/docs-only examples/library examples/small-app docs/RELEASE.md docs/PROOF_LEDGER.md"]}
diff --git a/.agent-run/out/task/artifacts/transcript.md b/.agent-run/out/task/artifacts/transcript.md
new file mode 100644
index 0000000000000000000000000000000000000000..0d69fb68583702e8b2e625d28b507ed256d05224
--- /dev/null
+++ b/.agent-run/out/task/artifacts/transcript.md
@@ -0,0 +1,5 @@
+Reviewed the roadmap item and local cookbook docs.
+Patched the docs-only, library, and small-app example READMEs to state they are pushable standalone repos with local roadmap links.
+Patched each example roadmap doc to point back to the root roadmap.
+Clarified release documentation and the proof ledger so release evidence is tied to committed artifacts and the release checklist.
+Verified the changes with `git diff --check` and targeted `rg` presence checks.
diff --git a/docs/PROOF_LEDGER.md b/docs/PROOF_LEDGER.md
index c8f671ce082fa6596e567b6d733c580f82cbb1cb..bd4636bf811eeed0cb24cd048f9feb025e50966a
--- a/docs/PROOF_LEDGER.md
+++ b/docs/PROOF_LEDGER.md
@@ -19,4 +19,4 @@
 | `status-reconstruction` | `scripts/public-agent-decision-index.ts`, status reconstruction tests, governance runs | done |
 | `quality-review-repair` | `scripts/public-agent-loop-budget.ts`, `scripts/public-agent-context.ts`, `scripts/public-agent-control.test.ts` | done |
 | `governance-maintainer-hold` | `scripts/public-agent-merge-gate.ts`, `scripts/public-agent-policy.ts`, `scripts/public-agent-control.test.ts` | done |
-| `release-dogfood` | `VERSION`, `.open-autonomy/version.json`, `CHANGELOG.md`, `docs/RELEASE.md`, manifest version tests | done |
+| `release-dogfood` | `VERSION`, `.open-autonomy/version.json`, `CHANGELOG.md`, `docs/RELEASE.md`, manifest version tests, and the committed release checklist in `docs/RELEASE.md` | done |
diff --git a/docs/RELEASE.md b/docs/RELEASE.md
index 4748b8f647bafe4ee8b031ef2b8c4f7ea9db7149..9885acc6fd1acc9695047e2533acad87032ea752
--- a/docs/RELEASE.md
+++ b/docs/RELEASE.md
@@ -10,8 +10,9 @@
 3. Run planner, preflight, and governance-report workflows on `main`.
 4. Scaffold `templates/self-driving-repo/` into a clean directory and run its
    `bun run check`.
-5. Verify `examples/docs-only`, `examples/small-app`, `examples/library`, and
-   `examples/testbed` can run their local checks.
+5. Verify the committed release evidence in [`docs/PROOF_LEDGER.md`](./PROOF_LEDGER.md)
+   and confirm `examples/docs-only`, `examples/small-app`, `examples/library`,
+   and `examples/testbed` can run their local checks.
 6. Tag the release as `vX.Y.Z`.
 7. Record migration notes for template changes in the changelog.
 
diff --git a/examples/docs-only/README.md b/examples/docs-only/README.md
index aab4327b63080b0c87de5cfa1a80442364232ccd..2165064d1baed1675130bc1e13b0da2e77b0a288
--- a/examples/docs-only/README.md
+++ b/examples/docs-only/README.md
@@ -3,6 +3,10 @@
 This is a minimal full repository shape for using open-autonomy on a
 documentation-only project.
 
+This cookbook is a pushable standalone repo: copy `examples/docs-only/` into a
+new GitHub repository, keep the local docs in `docs/`, and follow the local
+roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
+
 It is intentionally small:
 
 - issues can request documentation edits
diff --git a/examples/docs-only/docs/ROADMAP.md b/examples/docs-only/docs/ROADMAP.md
index b535c785cfabe17d60f358e253b4013495b07948..f2da34f7eb814bc46665ac3b7a34385acd11a885
--- a/examples/docs-only/docs/ROADMAP.md
+++ b/examples/docs-only/docs/ROADMAP.md
@@ -3,6 +3,8 @@
 This example follows the root Open Autonomy roadmap and keeps only local demo
 notes here.
 
+Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
+
 Local proof focus:
 
 - small documentation edits through PM, develop, review, and merge
diff --git a/examples/library/README.md b/examples/library/README.md
index 1c471de4964a2386c1e41f3d98b6442884a44f37..bc168ab2a63923178896e0f4ee8fae3656a7cbf4
--- a/examples/library/README.md
+++ b/examples/library/README.md
@@ -3,6 +3,10 @@
 This is a minimal full repository shape for using open-autonomy on a small
 TypeScript library.
 
+This cookbook is a pushable standalone repo: copy `examples/library/` into a
+new GitHub repository, keep the local docs in `docs/`, and follow the local
+roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
+
 It is intentionally small:
 
 - issues can request bounded library and documentation edits
diff --git a/examples/library/docs/ROADMAP.md b/examples/library/docs/ROADMAP.md
index 84e406a28221cac14c55e3b96e3cfce550cd3a4e..21c6799166c0de1e32e43659ab1b0dcc11026945
--- a/examples/library/docs/ROADMAP.md
+++ b/examples/library/docs/ROADMAP.md
@@ -3,6 +3,8 @@
 This example follows the root Open Autonomy roadmap and keeps only local library
 demo notes here.
 
+Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
+
 Local proof focus:
 
 - small library and documentation edits through PM, develop, review, and merge
diff --git a/examples/small-app/README.md b/examples/small-app/README.md
index ee5dcec969d224386549438719e9777d983f4971..22495505c4f521202f765a8a82dc66c4a33ad16b
--- a/examples/small-app/README.md
+++ b/examples/small-app/README.md
@@ -3,6 +3,10 @@
 This is a minimal full repository shape for using open-autonomy on a small
 TypeScript application.
 
+This cookbook is a pushable standalone repo: copy `examples/small-app/` into a
+new GitHub repository, keep the local docs in `docs/`, and follow the local
+roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
+
 It is intentionally small:
 
 - issues can request bounded app and documentation edits
diff --git a/examples/small-app/docs/ROADMAP.md b/examples/small-app/docs/ROADMAP.md
index d0631a853bb828fa34a26b0bf2c5784e71f9904e..6d0c3dc023bac76ae702174d6ef108fa84d530ae
--- a/examples/small-app/docs/ROADMAP.md
+++ b/examples/small-app/docs/ROADMAP.md
@@ -3,6 +3,8 @@
 This example follows the root Open Autonomy roadmap and keeps only local app
 demo notes here.
 
+Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
+
 Local proof focus:
 
 - small app and documentation edits through PM, develop, review, and merge

codex
Implemented the docs-only OSS-readiness fix.

- Updated the three cookbook example READMEs so they explicitly describe the repos as pushable standalone demos and link to local `docs/ROADMAP.md`.
- Added a root-roadmap pointer to each cookbook roadmap doc.
- Clarified release evidence in [docs/RELEASE.md](/home/runner/work/open-autonomy/open-autonomy/docs/RELEASE.md) and [docs/PROOF_LEDGER.md](/home/runner/work/open-autonomy/open-autonomy/docs/PROOF_LEDGER.md) so `release-dogfood` points at committed artifacts.

Verification:
- `git diff --check`
- targeted `rg` checks for the new wording and links

Artifacts written:
- [.agent-run/out/task/artifacts/pr.md](/home/runner/work/open-autonomy/open-autonomy/.agent-run/out/task/artifacts/pr.md)
- [.agent-run/out/task/artifacts/result.json](/home/runner/work/open-autonomy/open-autonomy/.agent-run/out/task/artifacts/result.json)
- [.agent-run/out/task/artifacts/transcript.md](/home/runner/work/open-autonomy/open-autonomy/.agent-run/out/task/artifacts/transcript.md)

I did not run the full Bun check suite because this change is documentation-only.
diff --git a/.agent-run/out/task/artifacts/pr.md b/.agent-run/out/task/artifacts/pr.md
new file mode 100644
index 0000000000000000000000000000000000000000..237c32ded0d5905b15bb9cd1582766d7bda68cc0
--- /dev/null
+++ b/.agent-run/out/task/artifacts/pr.md
@@ -0,0 +1,10 @@
+## Summary
+
+- Updated the three cookbook example READMEs so they explicitly describe the repos as pushable standalone demos and link to their local `docs/ROADMAP.md`.
+- Added a root-roadmap pointer to each cookbook roadmap doc so the example docs clearly link back to the canonical roadmap path.
+- Tightened release documentation so `release-dogfood` evidence is described in terms of committed artifacts and the release checklist.
+
+## Tests
+
+- `git diff --check`
+- `rg -n "pushable standalone repo|Root roadmap:|committed release checklist" examples/docs-only examples/library examples/small-app docs/RELEASE.md docs/PROOF_LEDGER.md`
diff --git a/.agent-run/out/task/artifacts/result.json b/.agent-run/out/task/artifacts/result.json
new file mode 100644
index 0000000000000000000000000000000000000000..a183035a5559fdb207d0e79c88e73997c76c070e
--- /dev/null
+++ b/.agent-run/out/task/artifacts/result.json
@@ -0,0 +1 @@
+{"ok":true,"issue":16,"summary":"Updated cookbook example READMEs and roadmap docs to call out standalone pushable repos with local roadmap links, and clarified release evidence to reference committed artifacts.","tests":["git diff --check","rg -n \"pushable standalone repo|Root roadmap:|committed release checklist\" examples/docs-only examples/library examples/small-app docs/RELEASE.md docs/PROOF_LEDGER.md"]}
diff --git a/.agent-run/out/task/artifacts/transcript.md b/.agent-run/out/task/artifacts/transcript.md
new file mode 100644
index 0000000000000000000000000000000000000000..0d69fb68583702e8b2e625d28b507ed256d05224
--- /dev/null
+++ b/.agent-run/out/task/artifacts/transcript.md
@@ -0,0 +1,5 @@
+Reviewed the roadmap item and local cookbook docs.
+Patched the docs-only, library, and small-app example READMEs to state they are pushable standalone repos with local roadmap links.
+Patched each example roadmap doc to point back to the root roadmap.
+Clarified release documentation and the proof ledger so release evidence is tied to committed artifacts and the release checklist.
+Verified the changes with `git diff --check` and targeted `rg` presence checks.
diff --git a/docs/PROOF_LEDGER.md b/docs/PROOF_LEDGER.md
index c8f671ce082fa6596e567b6d733c580f82cbb1cb..bd4636bf811eeed0cb24cd048f9feb025e50966a
--- a/docs/PROOF_LEDGER.md
+++ b/docs/PROOF_LEDGER.md
@@ -19,4 +19,4 @@
 | `status-reconstruction` | `scripts/public-agent-decision-index.ts`, status reconstruction tests, governance runs | done |
 | `quality-review-repair` | `scripts/public-agent-loop-budget.ts`, `scripts/public-agent-context.ts`, `scripts/public-agent-control.test.ts` | done |
 | `governance-maintainer-hold` | `scripts/public-agent-merge-gate.ts`, `scripts/public-agent-policy.ts`, `scripts/public-agent-control.test.ts` | done |
-| `release-dogfood` | `VERSION`, `.open-autonomy/version.json`, `CHANGELOG.md`, `docs/RELEASE.md`, manifest version tests | done |
+| `release-dogfood` | `VERSION`, `.open-autonomy/version.json`, `CHANGELOG.md`, `docs/RELEASE.md`, manifest version tests, and the committed release checklist in `docs/RELEASE.md` | done |
diff --git a/docs/RELEASE.md b/docs/RELEASE.md
index 4748b8f647bafe4ee8b031ef2b8c4f7ea9db7149..9885acc6fd1acc9695047e2533acad87032ea752
--- a/docs/RELEASE.md
+++ b/docs/RELEASE.md
@@ -10,8 +10,9 @@
 3. Run planner, preflight, and governance-report workflows on `main`.
 4. Scaffold `templates/self-driving-repo/` into a clean directory and run its
    `bun run check`.
-5. Verify `examples/docs-only`, `examples/small-app`, `examples/library`, and
-   `examples/testbed` can run their local checks.
+5. Verify the committed release evidence in [`docs/PROOF_LEDGER.md`](./PROOF_LEDGER.md)
+   and confirm `examples/docs-only`, `examples/small-app`, `examples/library`,
+   and `examples/testbed` can run their local checks.
 6. Tag the release as `vX.Y.Z`.
 7. Record migration notes for template changes in the changelog.
 
diff --git a/examples/docs-only/README.md b/examples/docs-only/README.md
index aab4327b63080b0c87de5cfa1a80442364232ccd..2165064d1baed1675130bc1e13b0da2e77b0a288
--- a/examples/docs-only/README.md
+++ b/examples/docs-only/README.md
@@ -3,6 +3,10 @@
 This is a minimal full repository shape for using open-autonomy on a
 documentation-only project.
 
+This cookbook is a pushable standalone repo: copy `examples/docs-only/` into a
+new GitHub repository, keep the local docs in `docs/`, and follow the local
+roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
+
 It is intentionally small:
 
 - issues can request documentation edits
diff --git a/examples/docs-only/docs/ROADMAP.md b/examples/docs-only/docs/ROADMAP.md
index b535c785cfabe17d60f358e253b4013495b07948..f2da34f7eb814bc46665ac3b7a34385acd11a885
--- a/examples/docs-only/docs/ROADMAP.md
+++ b/examples/docs-only/docs/ROADMAP.md
@@ -3,6 +3,8 @@
 This example follows the root Open Autonomy roadmap and keeps only local demo
 notes here.
 
+Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
+
 Local proof focus:
 
 - small documentation edits through PM, develop, review, and merge
diff --git a/examples/library/README.md b/examples/library/README.md
index 1c471de4964a2386c1e41f3d98b6442884a44f37..bc168ab2a63923178896e0f4ee8fae3656a7cbf4
--- a/examples/library/README.md
+++ b/examples/library/README.md
@@ -3,6 +3,10 @@
 This is a minimal full repository shape for using open-autonomy on a small
 TypeScript library.
 
+This cookbook is a pushable standalone repo: copy `examples/library/` into a
+new GitHub repository, keep the local docs in `docs/`, and follow the local
+roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
+
 It is intentionally small:
 
 - issues can request bounded library and documentation edits
diff --git a/examples/library/docs/ROADMAP.md b/examples/library/docs/ROADMAP.md
index 84e406a28221cac14c55e3b96e3cfce550cd3a4e..21c6799166c0de1e32e43659ab1b0dcc11026945
--- a/examples/library/docs/ROADMAP.md
+++ b/examples/library/docs/ROADMAP.md
@@ -3,6 +3,8 @@
 This example follows the root Open Autonomy roadmap and keeps only local library
 demo notes here.
 
+Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
+
 Local proof focus:
 
 - small library and documentation edits through PM, develop, review, and merge
diff --git a/examples/small-app/README.md b/examples/small-app/README.md
index ee5dcec969d224386549438719e9777d983f4971..22495505c4f521202f765a8a82dc66c4a33ad16b
--- a/examples/small-app/README.md
+++ b/examples/small-app/README.md
@@ -3,6 +3,10 @@
 This is a minimal full repository shape for using open-autonomy on a small
 TypeScript application.
 
+This cookbook is a pushable standalone repo: copy `examples/small-app/` into a
+new GitHub repository, keep the local docs in `docs/`, and follow the local
+roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
+
 It is intentionally small:
 
 - issues can request bounded app and documentation edits
diff --git a/examples/small-app/docs/ROADMAP.md b/examples/small-app/docs/ROADMAP.md
index d0631a853bb828fa34a26b0bf2c5784e71f9904e..6d0c3dc023bac76ae702174d6ef108fa84d530ae
--- a/examples/small-app/docs/ROADMAP.md
+++ b/examples/small-app/docs/ROADMAP.md
@@ -3,6 +3,8 @@
 This example follows the root Open Autonomy roadmap and keeps only local app
 demo notes here.
 
+Root roadmap: [`../../docs/ROADMAP.md`](../../docs/ROADMAP.md)
+
 Local proof focus:
 
 - small app and documentation edits through PM, develop, review, and merge

tokens used
48,659
```
