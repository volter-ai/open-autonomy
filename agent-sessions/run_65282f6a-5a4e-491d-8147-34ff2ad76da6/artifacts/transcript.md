# Codex Agent Transcript

Model: gpt-5.4-mini
Exit code: 0

## Final Message

Implemented issue #4 by extending the durable decision index to keep explicit latest snapshots for issue, PR, retry, and merge state, then proving those surfaces in the planner smoke tests across the root repo and the example package copies.

Changed files:
- [`scripts/public-agent-decision-index.ts`](/home/runner/work/open-autonomy/open-autonomy/scripts/public-agent-decision-index.ts)
- [`scripts/public-agent-planner.test.ts`](/home/runner/work/open-autonomy/open-autonomy/scripts/public-agent-planner.test.ts)
- Matching copies under `examples/testbed`, `examples/small-app`, and `examples/library`

Verification:
- `bun test scripts/public-agent-planner.test.ts` in the root repo
- `bun test scripts/public-agent-planner.test.ts` in `examples/testbed`
- `bun test scripts/public-agent-planner.test.ts` in `examples/small-app`
- `bun test scripts/public-agent-planner.test.ts` in `examples/library`
- `bun test scripts/open-autonomy-fleet.test.ts` in the root repo
- `bun test scripts/open-autonomy-fleet.test.ts` in `examples/testbed`

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
session id: 019ed4da-35d6-7da1-bdd3-205f54c02ac2
--------
user
You are running as the public Volter self-building agent in a bounded GitHub Actions job.

Implement the GitHub issue in this repository. Make a small but real code or documentation change that directly addresses the issue. Do not make unrelated refactors.

Issue #4: [roadmap:durable-decision-memory] Durable Decision Memory

Roadmap item: `durable-decision-memory`
Phase: 1
Priority: high
Proof gate: `decision-memory-smoke`

Acceptance criteria:
- Build a durable index from committed decision records.
- Reconstruct issue, PR, retry, and merge state from the index.

Planner origin: roadmap-planner

Resolved public-agent context:
```json
{
  "target": {
    "kind": "issue",
    "issue": 4,
    "pull_request": null,
    "branch": "agent/issue-4",
    "can_develop": true
  },
  "issue": {
    "body": "Roadmap item: `durable-decision-memory`\nPhase: 1\nPriority: high\nProof gate: `decision-memory-smoke`\n\nAcceptance criteria:\n- Build a durable index from committed decision records.\n- Reconstruct issue, PR, retry, and merge state from the index.\n\nPlanner origin: roadmap-planner",
    "comments": [
      {
        "author": {
          "login": "github-actions"
        },
        "authorAssociation": "CONTRIBUTOR",
        "body": "/agent develop\n\nPM reason: The issue is clear, scoped, and has defined acceptance criteria for the development of a durable index from committed decision records.",
        "createdAt": "2026-06-17T09:11:15Z",
        "id": "IC_kwDOS8izs88AAAABGc-cNA",
        "includesCreatedEdit": false,
        "isMinimized": false,
        "minimizedReason": "",
        "reactionGroups": [],
        "url": "https://github.com/volter-ai/open-autonomy/issues/4#issuecomment-4728003636",
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
        "id": "LA_kwDOS8izs88AAAACnxBouQ",
        "name": "priority:high"
      },
      {
        "color": "5319E7",
        "description": "Open Autonomy planner label",
        "id": "LA_kwDOS8izs88AAAACnxBqCQ",
        "name": "proof:decision-memory-smoke"
      },
      {
        "color": "1D76DB",
        "description": "Open Autonomy planner label",
        "id": "LA_kwDOS8izs88AAAACnxBsOQ",
        "name": "roadmap:phase-1"
      }
    ],
    "number": 4,
    "title": "[roadmap:durable-decision-memory] Durable Decision Memory",
    "user": {
      "login": "app/github-actions"
    }
  },
  "recent_issue_comments": [
    {
      "id": "IC_kwDOS8izs88AAAABGc-cNA",
      "author": {
        "login": "github-actions"
      },
      "authorAssociation": "CONTRIBUTOR",
      "body": "/agent develop\n\nPM reason: The issue is clear, scoped, and has defined acceptance criteria for the development of a durable index from committed decision records.",
      "createdAt": "2026-06-17T09:11:15Z",
      "includesCreatedEdit": false,
      "isMinimized": false,
      "minimizedReason": "",
      "reactionGroups": [],
      "url": "https://github.com/volter-ai/open-autonomy/issues/4#issuecomment-4728003636",
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
I’m checking the roadmap, policy, and the existing decision-record code paths first so I can make a small change that actually reconstructs durable state instead of guessing at the shape.
exec
/bin/bash -c "rg --files docs .open-autonomy | sed -n '1,200p'" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
.open-autonomy/constitution.md
.open-autonomy/version.json
docs/PROOF_LEDGER.md
docs/ROADMAP.md
docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md
docs/OSS_AGENT_RUNBOOK.md
docs/ARCHITECTURE.md
docs/PUBLIC_AGENT_ACTIONS.md
docs/RELEASE.md
.open-autonomy/policy.yml
.open-autonomy/review-rubric.yml
.open-autonomy/roadmap.yml
.open-autonomy/standards/docs.md
.open-autonomy/standards/tests.md
.open-autonomy/standards/security.md
.open-autonomy/standards/code.md

exec
/bin/bash -c 'pwd && git status --short && rg -n "decision record|decision-memory|decision memory|index" -S .' in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
/home/runner/work/open-autonomy/open-autonomy
./examples/testbed/package.json:8:    "check:public-agent": "bun test scripts/public-agent-decision.test.ts scripts/github-agent-session.test.ts scripts/github-agent-publish.test.ts scripts/public-agent-triage.test.ts scripts/public-agent-control.test.ts scripts/public-agent-production.test.ts scripts/public-agent-planner.test.ts scripts/open-autonomy-fleet.test.ts scripts/open-autonomy-upgrade.test.ts scripts/open-autonomy-proof-audit.test.ts && bunx tsc --noEmit --skipLibCheck --moduleResolution Bundler --module ESNext --target ES2022 --types bun scripts/public-agent-bundle.ts scripts/public-agent-decision.ts scripts/github-agent-session.ts scripts/github-agent-publish.ts scripts/model-proxy-mint.ts scripts/model-proxy-exchange.ts scripts/public-agent-triage.ts scripts/codex-agent-run.ts scripts/scaffold-target-repo.ts scripts/public-agent-command.ts scripts/public-agent-target.ts scripts/public-agent-ci.ts scripts/public-agent-review.ts scripts/public-agent-merge-gate.ts scripts/public-agent-loop-budget.ts scripts/public-agent-policy.ts scripts/public-agent-context.ts scripts/public-agent-pm.ts scripts/public-agent-dispatcher.ts scripts/public-agent-control.ts scripts/public-agent-control-files.ts scripts/public-agent-planner.ts scripts/public-agent-decision-index.ts scripts/open-autonomy-preflight.ts scripts/open-autonomy-governance-report.ts scripts/open-autonomy-upgrade.ts scripts/open-autonomy-proof-audit.ts scripts/testbed-seed-issues.ts scripts/public-agent-decision.test.ts scripts/github-agent-session.test.ts scripts/github-agent-publish.test.ts scripts/public-agent-triage.test.ts scripts/public-agent-control.test.ts scripts/public-agent-production.test.ts scripts/public-agent-planner.test.ts",
./examples/testbed/CHANGELOG.md:6:  reporting, durable decision indexing, and cookbook repository structure.
./examples/testbed/docs/PROOF_LEDGER.md:10:| `decision-memory-smoke` | `scripts/public-agent-decision-index.ts`, `scripts/public-agent-planner.test.ts`, canonical governance run `27649191830` | done |
./examples/testbed/docs/PROOF_LEDGER.md:19:| `status-reconstruction` | `scripts/public-agent-decision-index.ts`, status reconstruction tests, governance runs | done |
./examples/testbed/docs/OSS_AGENT_RUNBOOK.md:54:Merged develop session bundles now include target, triage, develop, publish, CI, review, and merge-gate decision records, so operators should review the full chain when checking evidence.
./examples/testbed/docs/ARCHITECTURE.md:80:decision records should prove what happened.
./examples/testbed/docs/ARCHITECTURE.md:131:The durable end state should be a queryable decision index. Until then, the
./examples/testbed/docs/ARCHITECTURE.md:132:session folders, decision records, issue/PR comments, and testbed ledger are the
./examples/testbed/docs/PUBLIC_AGENT_ACTIONS.md:160:- invalid manifest or decision records
./examples/testbed/docs/PUBLIC_AGENT_ACTIONS.md:195:- structured decision records
./examples/testbed/scripts/scaffold-target-repo.ts:17:    const index = argv.indexOf(name);
./examples/testbed/scripts/scaffold-target-repo.ts:18:    return index >= 0 ? argv[index + 1] : undefined;
./examples/testbed/scripts/public-agent-decision-index.ts:6:export interface DecisionIndexSubject {
./examples/testbed/scripts/public-agent-decision-index.ts:16:export interface DecisionIndex {
./examples/testbed/scripts/public-agent-decision-index.ts:17:  schema: 'open-autonomy.decision-index.v1';
./examples/testbed/scripts/public-agent-decision-index.ts:20:  issues: DecisionIndexSubject[];
./examples/testbed/scripts/public-agent-decision-index.ts:30:  bun scripts/public-agent-decision-index.ts [--sessions-dir agent-sessions] [--out .agent-run/decision-index.json]`);
./examples/testbed/scripts/public-agent-decision-index.ts:35:    const index = argv.indexOf(name);
./examples/testbed/scripts/public-agent-decision-index.ts:36:    return index >= 0 ? argv[index + 1] : undefined;
./examples/testbed/scripts/public-agent-decision-index.ts:39:  return { sessionsDir: value('--sessions-dir') ?? 'agent-sessions', out: value('--out') ?? '.agent-run/decision-index.json' };
./examples/testbed/scripts/public-agent-decision-index.ts:42:export function buildDecisionIndex(decisions: AgentDecision[], now = new Date()): DecisionIndex {
./examples/testbed/scripts/public-agent-decision-index.ts:43:  const byIssue = new Map<number, DecisionIndexSubject>();
./examples/testbed/scripts/public-agent-decision-index.ts:59:    schema: 'open-autonomy.decision-index.v1',
./examples/testbed/scripts/public-agent-decision-index.ts:93:  const index = buildDecisionIndex(readDecisionFiles(options.sessionsDir));
./examples/testbed/scripts/public-agent-decision-index.ts:94:  writeFileSync(options.out, `${JSON.stringify(index, null, 2)}\n`);
./examples/testbed/scripts/public-agent-decision-index.ts:95:  process.stdout.write(`decision-index=${index.decisions}\n`);
./examples/testbed/scripts/public-agent-production.test.ts:28:    expect(text.indexOf('Handle operator control')).toBeLessThan(text.indexOf('Mint triage model token'));
./examples/testbed/scripts/public-agent-production.test.ts:52:    expect(text.indexOf('Comment on publisher rejection')).toBeLessThan(text.indexOf('Stop after publisher rejection'));
./examples/testbed/scripts/public-agent-production.test.ts:53:    expect(text.indexOf('Stop after publisher rejection')).toBeLessThan(text.indexOf('Create or update pull request'));
./examples/testbed/scripts/public-agent-production.test.ts:78:    expect(report).toContain('public-agent-decision-index.ts');
./examples/testbed/scripts/open-autonomy-governance-report.ts:3:import type { DecisionIndex } from './public-agent-decision-index.js';
./examples/testbed/scripts/open-autonomy-governance-report.ts:17:  index: string;
./examples/testbed/scripts/open-autonomy-governance-report.ts:23:  bun scripts/open-autonomy-governance-report.ts --index decision-index.json --out governance-report.json`);
./examples/testbed/scripts/open-autonomy-governance-report.ts:28:    const index = argv.indexOf(name);
./examples/testbed/scripts/open-autonomy-governance-report.ts:29:    return index >= 0 ? argv[index + 1] : undefined;
./examples/testbed/scripts/open-autonomy-governance-report.ts:31:  const index = value('--index');
./examples/testbed/scripts/open-autonomy-governance-report.ts:32:  if (!index) usage();
./examples/testbed/scripts/open-autonomy-governance-report.ts:33:  return { index, out: value('--out') ?? '.agent-run/governance-report.json' };
./examples/testbed/scripts/open-autonomy-governance-report.ts:36:export function buildGovernanceReport(index: DecisionIndex, now = new Date()): GovernanceReport {
./examples/testbed/scripts/open-autonomy-governance-report.ts:41:  for (const issue of index.issues) {
./examples/testbed/scripts/open-autonomy-governance-report.ts:53:    issues_seen: index.issues.length,
./examples/testbed/scripts/open-autonomy-governance-report.ts:54:    decisions_seen: index.decisions,
./examples/testbed/scripts/open-autonomy-governance-report.ts:64:  const report = buildGovernanceReport(JSON.parse(readFileSync(options.index, 'utf8')) as DecisionIndex);
./examples/testbed/scripts/public-agent-loop-budget.ts:46:    const index = argv.indexOf(name);
./examples/testbed/scripts/public-agent-loop-budget.ts:47:    return index >= 0 ? argv[index + 1] : undefined;
./examples/testbed/scripts/public-agent-planner.test.ts:2:import { buildDecisionIndex } from './public-agent-decision-index.js';
./examples/testbed/scripts/public-agent-planner.test.ts:80:  test('decision index reconstructs latest state by issue and stage', () => {
./examples/testbed/scripts/public-agent-planner.test.ts:96:    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
./examples/testbed/scripts/public-agent-planner.test.ts:97:    expect(index.decisions).toBe(2);
./examples/testbed/scripts/public-agent-planner.test.ts:98:    expect(index.issues[0]?.latest_pr).toBe(8);
./examples/testbed/scripts/public-agent-planner.test.ts:99:    expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
./examples/testbed/scripts/public-agent-planner.test.ts:100:    expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
./examples/testbed/scripts/public-agent-merge-gate.ts:40:    const index = argv.indexOf(name);
./examples/testbed/scripts/public-agent-merge-gate.ts:41:    return index >= 0 ? argv[index + 1] : undefined;
./examples/testbed/scripts/public-agent-decision.ts:35:  index: number;
./examples/testbed/scripts/public-agent-decision.ts:167:  if (!Number.isInteger(attempt.index) || attempt.index <= 0) throw new Error('decision.attempt.index is invalid');
./examples/testbed/scripts/public-agent-decision.ts:169:  if (attempt.index > attempt.max) throw new Error('decision.attempt.index exceeds max');
./examples/testbed/scripts/public-agent-decision.ts:186:    const index = argv.indexOf(name);
./examples/testbed/scripts/public-agent-decision.ts:187:    return index >= 0 ? argv[index + 1] : undefined;
./examples/testbed/scripts/public-agent-context.ts:45:    const index = argv.indexOf(name);
./examples/testbed/scripts/public-agent-context.ts:46:    return index >= 0 ? argv[index + 1] : undefined;
./examples/testbed/scripts/public-agent-command.ts:24:    const index = argv.indexOf(name);
./examples/testbed/scripts/public-agent-command.ts:25:    return index >= 0 ? argv[index + 1] : undefined;
./examples/testbed/scripts/public-agent-review.ts:30:    const index = argv.indexOf(name);
./examples/testbed/scripts/public-agent-review.ts:31:    return index >= 0 ? argv[index + 1] : undefined;
./examples/testbed/scripts/public-agent-triage.ts:41:    const index = argv.indexOf(name);
./examples/testbed/scripts/public-agent-triage.ts:42:    return index >= 0 ? argv[index + 1] : undefined;
./examples/testbed/scripts/public-agent-dispatcher.ts:29:    const index = argv.indexOf(name);
./examples/testbed/scripts/public-agent-dispatcher.ts:30:    return index >= 0 ? argv[index + 1] : undefined;
./examples/testbed/scripts/model-proxy-exchange.ts:16:    const index = argv.indexOf(name);
./examples/testbed/scripts/model-proxy-exchange.ts:17:    return index >= 0 ? argv[index + 1] : undefined;
./examples/testbed/scripts/public-agent-pm.ts:37:    const index = argv.indexOf(name);
./examples/testbed/scripts/public-agent-pm.ts:38:    return index >= 0 ? argv[index + 1] : undefined;
./examples/testbed/scripts/github-agent-session.ts:37:  const split = argv.indexOf('--');
./examples/testbed/scripts/github-agent-session.ts:41:    const index = flags.indexOf(name);
./examples/testbed/scripts/github-agent-session.ts:42:    return index >= 0 ? flags[index + 1] : undefined;
./examples/testbed/scripts/public-agent-control.ts:12:  decisionIndex?: {
./examples/testbed/scripts/public-agent-control.ts:51:  const indexedIssue = input.decisionIndex?.issues?.find((item) => item.issue === issueNumber);
./examples/testbed/scripts/public-agent-control.ts:57:    open_pr: input.openPr?.number ?? indexedIssue?.latest_pr ?? null,
./examples/testbed/scripts/public-agent-control.ts:60:    latest_decision: indexedIssue?.latest_decision ?? null,
./examples/testbed/scripts/public-agent-control.ts:75:    lines.push(`- latest indexed decision: ${summary.latest_decision.stage ?? 'unknown'}:${summary.latest_decision.decision ?? 'unknown'}`);
./examples/testbed/scripts/public-agent-control.ts:76:    if (summary.latest_decision.next_action) lines.push(`- latest indexed next action: ${summary.latest_decision.next_action}`);
./examples/testbed/scripts/public-agent-ci.ts:49:    const index = argv.indexOf(name);
./examples/testbed/scripts/public-agent-ci.ts:50:    return index >= 0 ? argv[index + 1] : undefined;
./examples/testbed/scripts/open-autonomy-upgrade.ts:43:    const index = argv.indexOf(name);
./examples/testbed/scripts/open-autonomy-upgrade.ts:44:    return index >= 0 ? argv[index + 1] : undefined;
./examples/testbed/scripts/github-agent-publish.ts:43:    const index = argv.indexOf(name);
./examples/testbed/scripts/github-agent-publish.ts:44:    return index >= 0 ? argv[index + 1] : undefined;
./examples/testbed/scripts/public-agent-control-files.ts:29:    const index = argv.indexOf(name);
./examples/testbed/scripts/public-agent-control-files.ts:30:    return index >= 0 ? argv[index + 1] : undefined;
./examples/testbed/scripts/codex-agent-run.ts:20:  const index = argv.indexOf(name);
./examples/testbed/scripts/codex-agent-run.ts:21:  return index >= 0 ? argv[index + 1] : undefined;
./examples/testbed/scripts/public-agent-planner.ts:46:    const index = argv.indexOf(name);
./examples/testbed/scripts/public-agent-planner.ts:47:    return index >= 0 ? argv[index + 1] : undefined;
./examples/testbed/scripts/public-agent-planner.ts:111:      const existing = findExistingIssue(item, existingIssues);
./examples/testbed/scripts/public-agent-planner.ts:155:function findExistingIssue(item: RoadmapItem, issues: ExistingIssue[]): ExistingIssue | undefined {
./examples/testbed/scripts/public-agent-target.ts:30:    const index = argv.indexOf(name);
./examples/testbed/scripts/public-agent-target.ts:31:    return index >= 0 ? argv[index + 1] : undefined;
./examples/testbed/scripts/github-agent-publish.test.ts:165:      'index 0000000..1234567',
./examples/testbed/scripts/github-agent-publish.test.ts:183:      'index 0000000..1234567',
./examples/testbed/scripts/open-autonomy-fleet.test.ts:6:import { buildDecisionIndex } from './public-agent-decision-index.js';
./examples/testbed/scripts/open-autonomy-fleet.test.ts:31:  test('status can reconstruct latest state from the decision index', () => {
./examples/testbed/scripts/open-autonomy-fleet.test.ts:32:    const index = buildDecisionIndex([
./examples/testbed/scripts/open-autonomy-fleet.test.ts:45:      decisionIndex: index,
./examples/testbed/scripts/open-autonomy-fleet.test.ts:49:    expect(renderStatusComment(status)).toContain('latest indexed decision: merge_gate:human_required');
./examples/testbed/scripts/open-autonomy-fleet.test.ts:52:  test('governance report summarizes decision index outcomes', () => {
./examples/testbed/scripts/open-autonomy-fleet.test.ts:53:    const index = buildDecisionIndex([
./examples/testbed/scripts/open-autonomy-fleet.test.ts:63:    const report = buildGovernanceReport(index, new Date('2026-06-16T12:02:00Z'));
./CHANGELOG.md:6:  reporting, durable decision indexing, and cookbook repository structure.
./examples/testbed/scripts/public-agent-bundle.ts:276:  for (let index = 0; index < pattern.length; index += 1) {
./examples/testbed/scripts/public-agent-bundle.ts:277:    const char = pattern[index];
./examples/testbed/scripts/public-agent-bundle.ts:278:    const next = pattern[index + 1];
./examples/testbed/scripts/public-agent-bundle.ts:280:      if (pattern[index + 2] === '/') {
./examples/testbed/scripts/public-agent-bundle.ts:282:        index += 2;
./examples/testbed/scripts/public-agent-bundle.ts:285:        index += 1;
./examples/library/package.json:8:    "check:public-agent": "bun test scripts/public-agent-decision.test.ts scripts/github-agent-session.test.ts scripts/github-agent-publish.test.ts scripts/public-agent-triage.test.ts scripts/public-agent-control.test.ts scripts/public-agent-production.test.ts scripts/public-agent-planner.test.ts scripts/open-autonomy-fleet.test.ts scripts/open-autonomy-upgrade.test.ts scripts/open-autonomy-proof-audit.test.ts && bunx tsc --noEmit --skipLibCheck --moduleResolution Bundler --module ESNext --target ES2022 --types bun scripts/public-agent-bundle.ts scripts/public-agent-decision.ts scripts/github-agent-session.ts scripts/github-agent-publish.ts scripts/model-proxy-mint.ts scripts/model-proxy-exchange.ts scripts/public-agent-triage.ts scripts/codex-agent-run.ts scripts/scaffold-target-repo.ts scripts/public-agent-command.ts scripts/public-agent-target.ts scripts/public-agent-ci.ts scripts/public-agent-review.ts scripts/public-agent-merge-gate.ts scripts/public-agent-loop-budget.ts scripts/public-agent-policy.ts scripts/public-agent-context.ts scripts/public-agent-pm.ts scripts/public-agent-dispatcher.ts scripts/public-agent-control.ts scripts/public-agent-control-files.ts scripts/public-agent-planner.ts scripts/public-agent-decision-index.ts scripts/open-autonomy-preflight.ts scripts/open-autonomy-governance-report.ts scripts/open-autonomy-upgrade.ts scripts/open-autonomy-proof-audit.ts scripts/public-agent-decision.test.ts scripts/github-agent-session.test.ts scripts/github-agent-publish.test.ts scripts/public-agent-triage.test.ts scripts/public-agent-control.test.ts scripts/public-agent-production.test.ts scripts/public-agent-planner.test.ts",
./examples/testbed/scripts/testbed-seed-issues.ts:156:    id: 'decision-memory-smoke',
./examples/testbed/scripts/testbed-seed-issues.ts:157:    title: '[oa-test:decision-memory-smoke] Decision index should reconstruct state',
./examples/testbed/scripts/testbed-seed-issues.ts:160:      'Run the decision-index script after several agent decisions exist.',
./examples/testbed/scripts/testbed-seed-issues.ts:163:      '- The generated index summarizes latest state by issue.',
./examples/testbed/scripts/testbed-seed-issues.ts:191:    const index = argv.indexOf(name);
./examples/testbed/scripts/testbed-seed-issues.ts:192:    return index >= 0 ? argv[index + 1] : undefined;
./examples/testbed/scripts/testbed-seed-issues.ts:195:    .filter((arg, index) => argv[index - 1] === '--scenario')
./examples/library/CHANGELOG.md:6:  reporting, durable decision indexing, and cookbook repository structure.
./examples/testbed/scripts/public-agent-decision.test.ts:11:  test('creates a valid durable decision record', () => {
./examples/testbed/scripts/public-agent-decision.test.ts:20:      attempt: { kind: 'develop', index: 1, max: 3 },
./examples/testbed/scripts/model-proxy-mint.ts:20:    const index = argv.indexOf(name);
./examples/testbed/scripts/model-proxy-mint.ts:21:    return index >= 0 ? argv[index + 1] : undefined;
./examples/testbed/scripts/open-autonomy-preflight.ts:44:  'scripts/public-agent-decision-index.ts',
./examples/testbed/scripts/open-autonomy-preflight.ts:64:    const index = argv.indexOf(name);
./examples/testbed/scripts/open-autonomy-preflight.ts:65:    return index >= 0 ? argv[index + 1] : undefined;
./examples/library/src/index.test.ts:2:import { slugify } from './index.js';
./docs/PROOF_LEDGER.md:10:| `decision-memory-smoke` | `scripts/public-agent-decision-index.ts`, `scripts/public-agent-planner.test.ts`, canonical governance run `27649191830` | done |
./docs/PROOF_LEDGER.md:19:| `status-reconstruction` | `scripts/public-agent-decision-index.ts`, status reconstruction tests, governance runs | done |
./examples/testbed/scripts/public-agent-policy.ts:46:    const index = argv.indexOf(name);
./examples/testbed/scripts/public-agent-policy.ts:47:    return index >= 0 ? argv[index + 1] : undefined;
./scripts/scaffold-target-repo.ts:17:    const index = argv.indexOf(name);
./scripts/scaffold-target-repo.ts:18:    return index >= 0 ? argv[index + 1] : undefined;
./examples/testbed/scripts/open-autonomy-proof-audit.ts:24:    const index = argv.indexOf(name);
./examples/testbed/scripts/open-autonomy-proof-audit.ts:25:    return index >= 0 ? argv[index + 1] : undefined;
./scripts/public-agent-decision-index.ts:6:export interface DecisionIndexSubject {
./scripts/public-agent-decision-index.ts:16:export interface DecisionIndex {
./scripts/public-agent-decision-index.ts:17:  schema: 'open-autonomy.decision-index.v1';
./scripts/public-agent-decision-index.ts:20:  issues: DecisionIndexSubject[];
./scripts/public-agent-decision-index.ts:30:  bun scripts/public-agent-decision-index.ts [--sessions-dir agent-sessions] [--out .agent-run/decision-index.json]`);
./scripts/public-agent-decision-index.ts:35:    const index = argv.indexOf(name);
./scripts/public-agent-decision-index.ts:36:    return index >= 0 ? argv[index + 1] : undefined;
./scripts/public-agent-decision-index.ts:39:  return { sessionsDir: value('--sessions-dir') ?? 'agent-sessions', out: value('--out') ?? '.agent-run/decision-index.json' };
./scripts/public-agent-decision-index.ts:42:export function buildDecisionIndex(decisions: AgentDecision[], now = new Date()): DecisionIndex {
./scripts/public-agent-decision-index.ts:43:  const byIssue = new Map<number, DecisionIndexSubject>();
./scripts/public-agent-decision-index.ts:59:    schema: 'open-autonomy.decision-index.v1',
./scripts/public-agent-decision-index.ts:93:  const index = buildDecisionIndex(readDecisionFiles(options.sessionsDir));
./scripts/public-agent-decision-index.ts:94:  writeFileSync(options.out, `${JSON.stringify(index, null, 2)}\n`);
./scripts/public-agent-decision-index.ts:95:  process.stdout.write(`decision-index=${index.decisions}\n`);
./scripts/public-agent-production.test.ts:28:    expect(text.indexOf('Handle operator control')).toBeLessThan(text.indexOf('Mint triage model token'));
./scripts/public-agent-production.test.ts:52:    expect(text.indexOf('Comment on publisher rejection')).toBeLessThan(text.indexOf('Stop after publisher rejection'));
./scripts/public-agent-production.test.ts:53:    expect(text.indexOf('Stop after publisher rejection')).toBeLessThan(text.indexOf('Create or update pull request'));
./scripts/public-agent-production.test.ts:78:    expect(report).toContain('public-agent-decision-index.ts');
./scripts/public-agent-pm.ts:37:    const index = argv.indexOf(name);
./scripts/public-agent-pm.ts:38:    return index >= 0 ? argv[index + 1] : undefined;
./examples/library/docs/PROOF_LEDGER.md:9:| `decision-memory-smoke` | `scripts/public-agent-decision-index.ts`, `scripts/public-agent-planner.test.ts` | done |
./examples/library/docs/PROOF_LEDGER.md:18:| `status-reconstruction` | `scripts/public-agent-decision-index.ts`, `scripts/open-autonomy-fleet.test.ts` | done |
./docs/ROADMAP.md:211:The merge gate writes a structured decision record before merging or
./docs/ROADMAP.md:292:Every autonomous stage emits a JSON decision record.
./docs/ROADMAP.md:313:    "index": 1,
./docs/ROADMAP.md:452:1. Durable decision memory.
./docs/ROADMAP.md:462:- Decision records create the memory every later phase should consume.
./docs/ROADMAP.md:469:### Phase 1: Durable Decision Memory
./docs/ROADMAP.md:481:- decision records for:
./docs/ROADMAP.md:502:- Decision records contain no secrets and do not include raw model tokens.
./docs/ROADMAP.md:503:- Every auto-merge has a merge-gate decision record tied to the PR head.
./docs/ROADMAP.md:519:- `decision-memory-e2e`
./docs/ROADMAP.md:525:- `decision-memory-pm-only`
./docs/ROADMAP.md:585:    retry/merge-gate decision records.
./docs/ROADMAP.md:592:    retry/merge-gate decision records.
./docs/ROADMAP.md:605:  - previous decision records
./docs/ROADMAP.md:717:- include prior decision records and reviewer findings
./docs/ROADMAP.md:913:  stable issue/PR comment and decision record before the workflow exits failed.
./docs/ROADMAP.md:1010:- Final structured schema for decision records.
./docs/ROADMAP.md:1144:  - Evidence: session path, manifest, decision record, PR URL.
./docs/ROADMAP.md:1153:- committed or published decision index keyed by issue, PR, run ID, and head SHA
./docs/ROADMAP.md:1157:- issue/PR status summary command that reads the durable index first
./docs/ROADMAP.md:1163:- Decision records survive Actions artifact expiration.
./docs/ROADMAP.md:1168:- `audit-index-build`
./docs/ROADMAP.md:1169:  - Trigger: build/update decision index after several PM/develop/review/merge
./docs/ROADMAP.md:1171:  - Expected: index contains issue, PR, run, head SHA, decision, and evidence
./docs/ROADMAP.md:1173:  - Evidence: index artifact or committed file, source session paths, summary.
./docs/ROADMAP.md:1175:- `audit-status-from-index`
./docs/ROADMAP.md:1179:  - Evidence: issue URL, status run URL, status comment, index source.
./docs/ROADMAP.md:1184:  - Evidence: test run URL, status output, index records.
./docs/ROADMAP.md:1225:  - Evidence: issue URL, stop comment, final decision record.
./docs/ROADMAP.md:1272:  - Evidence: report artifact or issue comment, source index.
./scripts/open-autonomy-governance-report.ts:3:import type { DecisionIndex } from './public-agent-decision-index.js';
./scripts/open-autonomy-governance-report.ts:17:  index: string;
./scripts/open-autonomy-governance-report.ts:23:  bun scripts/open-autonomy-governance-report.ts --index decision-index.json --out governance-report.json`);
./scripts/open-autonomy-governance-report.ts:28:    const index = argv.indexOf(name);
./scripts/open-autonomy-governance-report.ts:29:    return index >= 0 ? argv[index + 1] : undefined;
./scripts/open-autonomy-governance-report.ts:31:  const index = value('--index');
./scripts/open-autonomy-governance-report.ts:32:  if (!index) usage();
./scripts/open-autonomy-governance-report.ts:33:  return { index, out: value('--out') ?? '.agent-run/governance-report.json' };
./scripts/open-autonomy-governance-report.ts:36:export function buildGovernanceReport(index: DecisionIndex, now = new Date()): GovernanceReport {
./scripts/open-autonomy-governance-report.ts:41:  for (const issue of index.issues) {
./scripts/open-autonomy-governance-report.ts:53:    issues_seen: index.issues.length,
./scripts/open-autonomy-governance-report.ts:54:    decisions_seen: index.decisions,
./scripts/open-autonomy-governance-report.ts:64:  const report = buildGovernanceReport(JSON.parse(readFileSync(options.index, 'utf8')) as DecisionIndex);
./docs/OSS_AGENT_RUNBOOK.md:54:Merged develop session bundles now include target, triage, develop, publish, CI, review, and merge-gate decision records, so operators should review the full chain when checking evidence.
./scripts/github-agent-session.ts:37:  const split = argv.indexOf('--');
./scripts/github-agent-session.ts:41:    const index = flags.indexOf(name);
./scripts/github-agent-session.ts:42:    return index >= 0 ? flags[index + 1] : undefined;
./scripts/public-agent-loop-budget.ts:46:    const index = argv.indexOf(name);
./scripts/public-agent-loop-budget.ts:47:    return index >= 0 ? argv[index + 1] : undefined;
./docs/ARCHITECTURE.md:80:decision records should prove what happened.
./docs/ARCHITECTURE.md:131:The durable end state should be a queryable decision index. Until then, the
./docs/ARCHITECTURE.md:132:session folders, decision records, issue/PR comments, and testbed ledger are the
./examples/library/docs/OSS_AGENT_RUNBOOK.md:54:Merged develop session bundles now include target, triage, develop, publish, CI, review, and merge-gate decision records, so operators should review the full chain when checking evidence.
./scripts/public-agent-control.ts:12:  decisionIndex?: {
./scripts/public-agent-control.ts:51:  const indexedIssue = input.decisionIndex?.issues?.find((item) => item.issue === issueNumber);
./scripts/public-agent-control.ts:57:    open_pr: input.openPr?.number ?? indexedIssue?.latest_pr ?? null,
./scripts/public-agent-control.ts:60:    latest_decision: indexedIssue?.latest_decision ?? null,
./scripts/public-agent-control.ts:75:    lines.push(`- latest indexed decision: ${summary.latest_decision.stage ?? 'unknown'}:${summary.latest_decision.decision ?? 'unknown'}`);
./scripts/public-agent-control.ts:76:    if (summary.latest_decision.next_action) lines.push(`- latest indexed next action: ${summary.latest_decision.next_action}`);
./docs/PUBLIC_AGENT_ACTIONS.md:160:- invalid manifest or decision records
./docs/PUBLIC_AGENT_ACTIONS.md:195:- structured decision records
./scripts/public-agent-planner.test.ts:2:import { buildDecisionIndex } from './public-agent-decision-index.js';
./scripts/public-agent-planner.test.ts:80:  test('decision index reconstructs latest state by issue and stage', () => {
./scripts/public-agent-planner.test.ts:96:    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
./scripts/public-agent-planner.test.ts:97:    expect(index.decisions).toBe(2);
./scripts/public-agent-planner.test.ts:98:    expect(index.issues[0]?.latest_pr).toBe(8);
./scripts/public-agent-planner.test.ts:99:    expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
./scripts/public-agent-planner.test.ts:100:    expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
./examples/library/docs/ARCHITECTURE.md:80:decision records should prove what happened.
./examples/library/docs/ARCHITECTURE.md:131:The durable end state should be a queryable decision index. Until then, the
./examples/library/docs/ARCHITECTURE.md:132:session folders, decision records, issue/PR comments, and testbed ledger are the
./examples/library/docs/PUBLIC_AGENT_ACTIONS.md:160:- invalid manifest or decision records
./examples/library/docs/PUBLIC_AGENT_ACTIONS.md:195:- structured decision records
./scripts/public-agent-ci.ts:49:    const index = argv.indexOf(name);
./scripts/public-agent-ci.ts:50:    return index >= 0 ? argv[index + 1] : undefined;
./scripts/open-autonomy-upgrade.ts:43:    const index = argv.indexOf(name);
./scripts/open-autonomy-upgrade.ts:44:    return index >= 0 ? argv[index + 1] : undefined;
./scripts/public-agent-merge-gate.ts:40:    const index = argv.indexOf(name);
./scripts/public-agent-merge-gate.ts:41:    return index >= 0 ? argv[index + 1] : undefined;
./scripts/github-agent-publish.ts:43:    const index = argv.indexOf(name);
./scripts/github-agent-publish.ts:44:    return index >= 0 ? argv[index + 1] : undefined;
./scripts/public-agent-control-files.ts:29:    const index = argv.indexOf(name);
./scripts/public-agent-control-files.ts:30:    return index >= 0 ? argv[index + 1] : undefined;
./scripts/public-agent-decision.ts:35:  index: number;
./scripts/public-agent-decision.ts:167:  if (!Number.isInteger(attempt.index) || attempt.index <= 0) throw new Error('decision.attempt.index is invalid');
./scripts/public-agent-decision.ts:169:  if (attempt.index > attempt.max) throw new Error('decision.attempt.index exceeds max');
./scripts/public-agent-decision.ts:186:    const index = argv.indexOf(name);
./scripts/public-agent-decision.ts:187:    return index >= 0 ? argv[index + 1] : undefined;
./scripts/public-agent-context.ts:45:    const index = argv.indexOf(name);
./scripts/public-agent-context.ts:46:    return index >= 0 ? argv[index + 1] : undefined;
./scripts/codex-agent-run.ts:20:  const index = argv.indexOf(name);
./scripts/codex-agent-run.ts:21:  return index >= 0 ? argv[index + 1] : undefined;
./scripts/public-agent-command.ts:24:    const index = argv.indexOf(name);
./scripts/public-agent-command.ts:25:    return index >= 0 ? argv[index + 1] : undefined;
./scripts/public-agent-planner.ts:46:    const index = argv.indexOf(name);
./scripts/public-agent-planner.ts:47:    return index >= 0 ? argv[index + 1] : undefined;
./scripts/public-agent-planner.ts:111:      const existing = findExistingIssue(item, existingIssues);
./scripts/public-agent-planner.ts:155:function findExistingIssue(item: RoadmapItem, issues: ExistingIssue[]): ExistingIssue | undefined {
./scripts/public-agent-review.ts:30:    const index = argv.indexOf(name);
./scripts/public-agent-review.ts:31:    return index >= 0 ? argv[index + 1] : undefined;
./examples/docs-only/package.json:8:    "check:public-agent": "bun test scripts/public-agent-decision.test.ts scripts/github-agent-session.test.ts scripts/github-agent-publish.test.ts scripts/public-agent-triage.test.ts scripts/public-agent-control.test.ts scripts/public-agent-production.test.ts scripts/public-agent-planner.test.ts scripts/open-autonomy-fleet.test.ts scripts/open-autonomy-upgrade.test.ts scripts/open-autonomy-proof-audit.test.ts && bunx tsc --noEmit --skipLibCheck --moduleResolution Bundler --module ESNext --target ES2022 --types bun scripts/public-agent-bundle.ts scripts/public-agent-decision.ts scripts/github-agent-session.ts scripts/github-agent-publish.ts scripts/model-proxy-mint.ts scripts/model-proxy-exchange.ts scripts/public-agent-triage.ts scripts/codex-agent-run.ts scripts/scaffold-target-repo.ts scripts/public-agent-command.ts scripts/public-agent-target.ts scripts/public-agent-ci.ts scripts/public-agent-review.ts scripts/public-agent-merge-gate.ts scripts/public-agent-loop-budget.ts scripts/public-agent-policy.ts scripts/public-agent-context.ts scripts/public-agent-pm.ts scripts/public-agent-dispatcher.ts scripts/public-agent-control.ts scripts/public-agent-control-files.ts scripts/public-agent-planner.ts scripts/public-agent-decision-index.ts scripts/open-autonomy-preflight.ts scripts/open-autonomy-governance-report.ts scripts/open-autonomy-upgrade.ts scripts/open-autonomy-proof-audit.ts scripts/public-agent-decision.test.ts scripts/github-agent-session.test.ts scripts/github-agent-publish.test.ts scripts/public-agent-triage.test.ts scripts/public-agent-control.test.ts scripts/public-agent-production.test.ts scripts/public-agent-planner.test.ts",
./scripts/public-agent-target.ts:30:    const index = argv.indexOf(name);
./scripts/public-agent-target.ts:31:    return index >= 0 ? argv[index + 1] : undefined;
./scripts/public-agent-triage.ts:41:    const index = argv.indexOf(name);
./scripts/public-agent-triage.ts:42:    return index >= 0 ? argv[index + 1] : undefined;
./examples/docs-only/CHANGELOG.md:6:  reporting, durable decision indexing, and cookbook repository structure.
./scripts/open-autonomy-fleet.test.ts:6:import { buildDecisionIndex } from './public-agent-decision-index.js';
./scripts/open-autonomy-fleet.test.ts:31:  test('status can reconstruct latest state from the decision index', () => {
./scripts/open-autonomy-fleet.test.ts:32:    const index = buildDecisionIndex([
./scripts/open-autonomy-fleet.test.ts:45:      decisionIndex: index,
./scripts/open-autonomy-fleet.test.ts:49:    expect(renderStatusComment(status)).toContain('latest indexed decision: merge_gate:human_required');
./scripts/open-autonomy-fleet.test.ts:52:  test('governance report summarizes decision index outcomes', () => {
./scripts/open-autonomy-fleet.test.ts:53:    const index = buildDecisionIndex([
./scripts/open-autonomy-fleet.test.ts:63:    const report = buildGovernanceReport(index, new Date('2026-06-16T12:02:00Z'));
./scripts/public-agent-dispatcher.ts:29:    const index = argv.indexOf(name);
./scripts/public-agent-dispatcher.ts:30:    return index >= 0 ? argv[index + 1] : undefined;
./examples/library/scripts/scaffold-target-repo.ts:17:    const index = argv.indexOf(name);
./examples/library/scripts/scaffold-target-repo.ts:18:    return index >= 0 ? argv[index + 1] : undefined;
./scripts/model-proxy-exchange.ts:16:    const index = argv.indexOf(name);
./scripts/model-proxy-exchange.ts:17:    return index >= 0 ? argv[index + 1] : undefined;
./scripts/public-agent-bundle.ts:276:  for (let index = 0; index < pattern.length; index += 1) {
./scripts/public-agent-bundle.ts:277:    const char = pattern[index];
./scripts/public-agent-bundle.ts:278:    const next = pattern[index + 1];
./scripts/public-agent-bundle.ts:280:      if (pattern[index + 2] === '/') {
./scripts/public-agent-bundle.ts:282:        index += 2;
./scripts/public-agent-bundle.ts:285:        index += 1;
./package.json:9:    "check:public-agent": "bun test scripts/public-agent-decision.test.ts scripts/github-agent-session.test.ts scripts/github-agent-publish.test.ts scripts/public-agent-triage.test.ts scripts/public-agent-control.test.ts scripts/public-agent-production.test.ts scripts/public-agent-planner.test.ts scripts/open-autonomy-fleet.test.ts scripts/open-autonomy-upgrade.test.ts scripts/open-autonomy-proof-audit.test.ts && bunx tsc --noEmit --skipLibCheck --moduleResolution Bundler --module ESNext --target ES2022 --types bun scripts/public-agent-bundle.ts scripts/public-agent-decision.ts scripts/github-agent-session.ts scripts/github-agent-publish.ts scripts/model-proxy-mint.ts scripts/model-proxy-exchange.ts scripts/public-agent-triage.ts scripts/codex-agent-run.ts scripts/scaffold-target-repo.ts scripts/public-agent-command.ts scripts/public-agent-target.ts scripts/public-agent-ci.ts scripts/public-agent-review.ts scripts/public-agent-merge-gate.ts scripts/public-agent-loop-budget.ts scripts/public-agent-policy.ts scripts/public-agent-context.ts scripts/public-agent-pm.ts scripts/public-agent-dispatcher.ts scripts/public-agent-control.ts scripts/public-agent-control-files.ts scripts/public-agent-planner.ts scripts/public-agent-decision-index.ts scripts/open-autonomy-preflight.ts scripts/open-autonomy-governance-report.ts scripts/open-autonomy-upgrade.ts scripts/open-autonomy-proof-audit.ts scripts/public-agent-decision.test.ts scripts/github-agent-session.test.ts scripts/github-agent-publish.test.ts scripts/public-agent-triage.test.ts scripts/public-agent-control.test.ts scripts/public-agent-production.test.ts scripts/public-agent-planner.test.ts",
./examples/docs-only/docs/PROOF_LEDGER.md:9:| `decision-memory-smoke` | `scripts/public-agent-decision-index.ts`, `scripts/public-agent-planner.test.ts` | done |
./examples/docs-only/docs/PROOF_LEDGER.md:18:| `status-reconstruction` | `scripts/public-agent-decision-index.ts`, `scripts/open-autonomy-fleet.test.ts` | done |
./examples/library/scripts/public-agent-decision-index.ts:6:export interface DecisionIndexSubject {
./examples/library/scripts/public-agent-decision-index.ts:16:export interface DecisionIndex {
./examples/library/scripts/public-agent-decision-index.ts:17:  schema: 'open-autonomy.decision-index.v1';
./examples/library/scripts/public-agent-decision-index.ts:20:  issues: DecisionIndexSubject[];
./examples/library/scripts/public-agent-decision-index.ts:30:  bun scripts/public-agent-decision-index.ts [--sessions-dir agent-sessions] [--out .agent-run/decision-index.json]`);
./examples/library/scripts/public-agent-decision-index.ts:35:    const index = argv.indexOf(name);
./examples/library/scripts/public-agent-decision-index.ts:36:    return index >= 0 ? argv[index + 1] : undefined;
./examples/library/scripts/public-agent-decision-index.ts:39:  return { sessionsDir: value('--sessions-dir') ?? 'agent-sessions', out: value('--out') ?? '.agent-run/decision-index.json' };
./examples/library/scripts/public-agent-decision-index.ts:42:export function buildDecisionIndex(decisions: AgentDecision[], now = new Date()): DecisionIndex {
./examples/library/scripts/public-agent-decision-index.ts:43:  const byIssue = new Map<number, DecisionIndexSubject>();
./examples/library/scripts/public-agent-decision-index.ts:59:    schema: 'open-autonomy.decision-index.v1',
./examples/library/scripts/public-agent-decision-index.ts:93:  const index = buildDecisionIndex(readDecisionFiles(options.sessionsDir));
./examples/library/scripts/public-agent-decision-index.ts:94:  writeFileSync(options.out, `${JSON.stringify(index, null, 2)}\n`);
./examples/library/scripts/public-agent-decision-index.ts:95:  process.stdout.write(`decision-index=${index.decisions}\n`);
./scripts/github-agent-publish.test.ts:165:      'index 0000000..1234567',
./scripts/github-agent-publish.test.ts:183:      'index 0000000..1234567',
./examples/library/scripts/public-agent-production.test.ts:28:    expect(text.indexOf('Handle operator control')).toBeLessThan(text.indexOf('Mint triage model token'));
./examples/library/scripts/public-agent-production.test.ts:52:    expect(text.indexOf('Comment on publisher rejection')).toBeLessThan(text.indexOf('Stop after publisher rejection'));
./examples/library/scripts/public-agent-production.test.ts:53:    expect(text.indexOf('Stop after publisher rejection')).toBeLessThan(text.indexOf('Create or update pull request'));
./examples/library/scripts/public-agent-production.test.ts:78:    expect(report).toContain('public-agent-decision-index.ts');
./examples/docs-only/docs/OSS_AGENT_RUNBOOK.md:54:Merged develop session bundles now include target, triage, develop, publish, CI, review, and merge-gate decision records, so operators should review the full chain when checking evidence.
./scripts/public-agent-decision.test.ts:11:  test('creates a valid durable decision record', () => {
./scripts/public-agent-decision.test.ts:20:      attempt: { kind: 'develop', index: 1, max: 3 },
./examples/docs-only/docs/ARCHITECTURE.md:80:decision records should prove what happened.
./examples/docs-only/docs/ARCHITECTURE.md:131:The durable end state should be a queryable decision index. Until then, the
./examples/docs-only/docs/ARCHITECTURE.md:132:session folders, decision records, issue/PR comments, and testbed ledger are the
./scripts/model-proxy-mint.ts:20:    const index = argv.indexOf(name);
./scripts/model-proxy-mint.ts:21:    return index >= 0 ? argv[index + 1] : undefined;
./examples/library/scripts/open-autonomy-governance-report.ts:3:import type { DecisionIndex } from './public-agent-decision-index.js';
./examples/library/scripts/open-autonomy-governance-report.ts:17:  index: string;
./examples/library/scripts/open-autonomy-governance-report.ts:23:  bun scripts/open-autonomy-governance-report.ts --index decision-index.json --out governance-report.json`);
./examples/library/scripts/open-autonomy-governance-report.ts:28:    const index = argv.indexOf(name);
./examples/library/scripts/open-autonomy-governance-report.ts:29:    return index >= 0 ? argv[index + 1] : undefined;
./examples/library/scripts/open-autonomy-governance-report.ts:31:  const index = value('--index');
./examples/library/scripts/open-autonomy-governance-report.ts:32:  if (!index) usage();
./examples/library/scripts/open-autonomy-governance-report.ts:33:  return { index, out: value('--out') ?? '.agent-run/governance-report.json' };
./examples/library/scripts/open-autonomy-governance-report.ts:36:export function buildGovernanceReport(index: DecisionIndex, now = new Date()): GovernanceReport {
./examples/library/scripts/open-autonomy-governance-report.ts:41:  for (const issue of index.issues) {
./examples/library/scripts/open-autonomy-governance-report.ts:53:    issues_seen: index.issues.length,
./examples/library/scripts/open-autonomy-governance-report.ts:54:    decisions_seen: index.decisions,
./examples/library/scripts/open-autonomy-governance-report.ts:64:  const report = buildGovernanceReport(JSON.parse(readFileSync(options.index, 'utf8')) as DecisionIndex);
./examples/docs-only/docs/PUBLIC_AGENT_ACTIONS.md:160:- invalid manifest or decision records
./examples/docs-only/docs/PUBLIC_AGENT_ACTIONS.md:195:- structured decision records
./scripts/open-autonomy-preflight.ts:44:  'scripts/public-agent-decision-index.ts',
./scripts/open-autonomy-preflight.ts:64:    const index = argv.indexOf(name);
./scripts/open-autonomy-preflight.ts:65:    return index >= 0 ? argv[index + 1] : undefined;
./examples/library/scripts/public-agent-loop-budget.ts:46:    const index = argv.indexOf(name);
./examples/library/scripts/public-agent-loop-budget.ts:47:    return index >= 0 ? argv[index + 1] : undefined;
./services/agent-model-proxy/wrangler.toml:2:main = "src/index.ts"
./scripts/public-agent-policy.ts:46:    const index = argv.indexOf(name);
./scripts/public-agent-policy.ts:47:    return index >= 0 ? argv[index + 1] : undefined;
./scripts/open-autonomy-proof-audit.ts:24:    const index = argv.indexOf(name);
./scripts/open-autonomy-proof-audit.ts:25:    return index >= 0 ? argv[index + 1] : undefined;
./examples/library/scripts/public-agent-planner.test.ts:2:import { buildDecisionIndex } from './public-agent-decision-index.js';
./examples/library/scripts/public-agent-planner.test.ts:80:  test('decision index reconstructs latest state by issue and stage', () => {
./examples/library/scripts/public-agent-planner.test.ts:96:    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
./examples/library/scripts/public-agent-planner.test.ts:97:    expect(index.decisions).toBe(2);
./examples/library/scripts/public-agent-planner.test.ts:98:    expect(index.issues[0]?.latest_pr).toBe(8);
./examples/library/scripts/public-agent-planner.test.ts:99:    expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
./examples/library/scripts/public-agent-planner.test.ts:100:    expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
./services/agent-model-proxy/test/proxy.test.ts:2:import worker from '../src/index.js';
./examples/docs-only/scripts/scaffold-target-repo.ts:17:    const index = argv.indexOf(name);
./examples/docs-only/scripts/scaffold-target-repo.ts:18:    return index >= 0 ? argv[index + 1] : undefined;
./examples/docs-only/scripts/public-agent-decision-index.ts:6:export interface DecisionIndexSubject {
./examples/docs-only/scripts/public-agent-decision-index.ts:16:export interface DecisionIndex {
./examples/docs-only/scripts/public-agent-decision-index.ts:17:  schema: 'open-autonomy.decision-index.v1';
./examples/docs-only/scripts/public-agent-decision-index.ts:20:  issues: DecisionIndexSubject[];
./examples/docs-only/scripts/public-agent-decision-index.ts:30:  bun scripts/public-agent-decision-index.ts [--sessions-dir agent-sessions] [--out .agent-run/decision-index.json]`);
./examples/docs-only/scripts/public-agent-decision-index.ts:35:    const index = argv.indexOf(name);
./examples/docs-only/scripts/public-agent-decision-index.ts:36:    return index >= 0 ? argv[index + 1] : undefined;
./examples/docs-only/scripts/public-agent-decision-index.ts:39:  return { sessionsDir: value('--sessions-dir') ?? 'agent-sessions', out: value('--out') ?? '.agent-run/decision-index.json' };
./examples/docs-only/scripts/public-agent-decision-index.ts:42:export function buildDecisionIndex(decisions: AgentDecision[], now = new Date()): DecisionIndex {
./examples/docs-only/scripts/public-agent-decision-index.ts:43:  const byIssue = new Map<number, DecisionIndexSubject>();
./examples/docs-only/scripts/public-agent-decision-index.ts:59:    schema: 'open-autonomy.decision-index.v1',
./examples/docs-only/scripts/public-agent-decision-index.ts:93:  const index = buildDecisionIndex(readDecisionFiles(options.sessionsDir));
./examples/docs-only/scripts/public-agent-decision-index.ts:94:  writeFileSync(options.out, `${JSON.stringify(index, null, 2)}\n`);
./examples/docs-only/scripts/public-agent-decision-index.ts:95:  process.stdout.write(`decision-index=${index.decisions}\n`);
./examples/docs-only/scripts/public-agent-production.test.ts:28:    expect(text.indexOf('Handle operator control')).toBeLessThan(text.indexOf('Mint triage model token'));
./examples/docs-only/scripts/public-agent-production.test.ts:52:    expect(text.indexOf('Comment on publisher rejection')).toBeLessThan(text.indexOf('Stop after publisher rejection'));
./examples/docs-only/scripts/public-agent-production.test.ts:53:    expect(text.indexOf('Stop after publisher rejection')).toBeLessThan(text.indexOf('Create or update pull request'));
./examples/docs-only/scripts/public-agent-production.test.ts:78:    expect(report).toContain('public-agent-decision-index.ts');
./examples/library/scripts/public-agent-merge-gate.ts:40:    const index = argv.indexOf(name);
./examples/library/scripts/public-agent-merge-gate.ts:41:    return index >= 0 ? argv[index + 1] : undefined;
./examples/docs-only/scripts/open-autonomy-governance-report.ts:3:import type { DecisionIndex } from './public-agent-decision-index.js';
./examples/docs-only/scripts/open-autonomy-governance-report.ts:17:  index: string;
./examples/docs-only/scripts/open-autonomy-governance-report.ts:23:  bun scripts/open-autonomy-governance-report.ts --index decision-index.json --out governance-report.json`);
./examples/docs-only/scripts/open-autonomy-governance-report.ts:28:    const index = argv.indexOf(name);
./examples/docs-only/scripts/open-autonomy-governance-report.ts:29:    return index >= 0 ? argv[index + 1] : undefined;
./examples/docs-only/scripts/open-autonomy-governance-report.ts:31:  const index = value('--index');
./examples/docs-only/scripts/open-autonomy-governance-report.ts:32:  if (!index) usage();
./examples/docs-only/scripts/open-autonomy-governance-report.ts:33:  return { index, out: value('--out') ?? '.agent-run/governance-report.json' };
./examples/docs-only/scripts/open-autonomy-governance-report.ts:36:export function buildGovernanceReport(index: DecisionIndex, now = new Date()): GovernanceReport {
./examples/docs-only/scripts/open-autonomy-governance-report.ts:41:  for (const issue of index.issues) {
./examples/docs-only/scripts/open-autonomy-governance-report.ts:53:    issues_seen: index.issues.length,
./examples/docs-only/scripts/open-autonomy-governance-report.ts:54:    decisions_seen: index.decisions,
./examples/docs-only/scripts/open-autonomy-governance-report.ts:64:  const report = buildGovernanceReport(JSON.parse(readFileSync(options.index, 'utf8')) as DecisionIndex);
./services/agent-model-proxy/src/openai.ts:136:    while ((idx = buffer.indexOf('\n\n')) >= 0) {
./examples/docs-only/scripts/public-agent-loop-budget.ts:46:    const index = argv.indexOf(name);
./examples/docs-only/scripts/public-agent-loop-budget.ts:47:    return index >= 0 ? argv[index + 1] : undefined;
./examples/library/scripts/public-agent-decision.ts:35:  index: number;
./examples/library/scripts/public-agent-decision.ts:167:  if (!Number.isInteger(attempt.index) || attempt.index <= 0) throw new Error('decision.attempt.index is invalid');
./examples/library/scripts/public-agent-decision.ts:169:  if (attempt.index > attempt.max) throw new Error('decision.attempt.index exceeds max');
./examples/library/scripts/public-agent-decision.ts:186:    const index = argv.indexOf(name);
./examples/library/scripts/public-agent-decision.ts:187:    return index >= 0 ? argv[index + 1] : undefined;
./examples/docs-only/scripts/public-agent-planner.test.ts:2:import { buildDecisionIndex } from './public-agent-decision-index.js';
./examples/docs-only/scripts/public-agent-planner.test.ts:80:  test('decision index reconstructs latest state by issue and stage', () => {
./examples/docs-only/scripts/public-agent-planner.test.ts:96:    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
./examples/docs-only/scripts/public-agent-planner.test.ts:97:    expect(index.decisions).toBe(2);
./examples/docs-only/scripts/public-agent-planner.test.ts:98:    expect(index.issues[0]?.latest_pr).toBe(8);
./examples/docs-only/scripts/public-agent-planner.test.ts:99:    expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
./examples/docs-only/scripts/public-agent-planner.test.ts:100:    expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
./examples/library/scripts/public-agent-context.ts:45:    const index = argv.indexOf(name);
./examples/library/scripts/public-agent-context.ts:46:    return index >= 0 ? argv[index + 1] : undefined;
./services/agent-model-proxy/src/anthropic.ts:112:    while ((idx = buffer.indexOf('\n\n')) >= 0) {
./examples/library/scripts/public-agent-command.ts:24:    const index = argv.indexOf(name);
./examples/library/scripts/public-agent-command.ts:25:    return index >= 0 ? argv[index + 1] : undefined;
./examples/library/scripts/public-agent-review.ts:30:    const index = argv.indexOf(name);
./examples/library/scripts/public-agent-review.ts:31:    return index >= 0 ? argv[index + 1] : undefined;
./templates/self-driving-repo/package.json:8:    "check:public-agent": "bun test scripts/public-agent-decision.test.ts scripts/github-agent-session.test.ts scripts/github-agent-publish.test.ts scripts/public-agent-triage.test.ts scripts/public-agent-control.test.ts scripts/public-agent-production.test.ts scripts/public-agent-planner.test.ts scripts/open-autonomy-fleet.test.ts scripts/open-autonomy-upgrade.test.ts scripts/open-autonomy-proof-audit.test.ts && bunx tsc --noEmit --skipLibCheck --moduleResolution Bundler --module ESNext --target ES2022 --types bun scripts/public-agent-bundle.ts scripts/public-agent-decision.ts scripts/github-agent-session.ts scripts/github-agent-publish.ts scripts/model-proxy-mint.ts scripts/model-proxy-exchange.ts scripts/public-agent-triage.ts scripts/codex-agent-run.ts scripts/scaffold-target-repo.ts scripts/public-agent-command.ts scripts/public-agent-target.ts scripts/public-agent-ci.ts scripts/public-agent-review.ts scripts/public-agent-merge-gate.ts scripts/public-agent-loop-budget.ts scripts/public-agent-policy.ts scripts/public-agent-context.ts scripts/public-agent-pm.ts scripts/public-agent-dispatcher.ts scripts/public-agent-control.ts scripts/public-agent-control-files.ts scripts/public-agent-planner.ts scripts/public-agent-decision-index.ts scripts/open-autonomy-preflight.ts scripts/open-autonomy-governance-report.ts scripts/open-autonomy-upgrade.ts scripts/open-autonomy-proof-audit.ts scripts/public-agent-decision.test.ts scripts/github-agent-session.test.ts scripts/github-agent-publish.test.ts scripts/public-agent-triage.test.ts scripts/public-agent-control.test.ts scripts/public-agent-production.test.ts scripts/public-agent-planner.test.ts",
./examples/docs-only/scripts/open-autonomy-upgrade.ts:43:    const index = argv.indexOf(name);
./examples/docs-only/scripts/open-autonomy-upgrade.ts:44:    return index >= 0 ? argv[index + 1] : undefined;
./examples/docs-only/scripts/public-agent-merge-gate.ts:40:    const index = argv.indexOf(name);
./examples/docs-only/scripts/public-agent-merge-gate.ts:41:    return index >= 0 ? argv[index + 1] : undefined;
./examples/library/scripts/public-agent-triage.ts:41:    const index = argv.indexOf(name);
./examples/library/scripts/public-agent-triage.ts:42:    return index >= 0 ? argv[index + 1] : undefined;
./examples/docs-only/scripts/github-agent-publish.ts:43:    const index = argv.indexOf(name);
./examples/docs-only/scripts/github-agent-publish.ts:44:    return index >= 0 ? argv[index + 1] : undefined;
./templates/self-driving-repo/CHANGELOG.md:6:  reporting, durable decision indexing, and cookbook repository structure.
./examples/docs-only/scripts/public-agent-control-files.ts:29:    const index = argv.indexOf(name);
./examples/docs-only/scripts/public-agent-control-files.ts:30:    return index >= 0 ? argv[index + 1] : undefined;
./examples/docs-only/scripts/public-agent-decision.ts:35:  index: number;
./examples/docs-only/scripts/public-agent-decision.ts:167:  if (!Number.isInteger(attempt.index) || attempt.index <= 0) throw new Error('decision.attempt.index is invalid');
./examples/docs-only/scripts/public-agent-decision.ts:169:  if (attempt.index > attempt.max) throw new Error('decision.attempt.index exceeds max');
./examples/docs-only/scripts/public-agent-decision.ts:186:    const index = argv.indexOf(name);
./examples/docs-only/scripts/public-agent-decision.ts:187:    return index >= 0 ? argv[index + 1] : undefined;
./examples/library/scripts/public-agent-dispatcher.ts:29:    const index = argv.indexOf(name);
./examples/library/scripts/public-agent-dispatcher.ts:30:    return index >= 0 ? argv[index + 1] : undefined;
./examples/docs-only/scripts/codex-agent-run.ts:20:  const index = argv.indexOf(name);
./examples/docs-only/scripts/codex-agent-run.ts:21:  return index >= 0 ? argv[index + 1] : undefined;
./examples/docs-only/scripts/public-agent-context.ts:45:    const index = argv.indexOf(name);
./examples/docs-only/scripts/public-agent-context.ts:46:    return index >= 0 ? argv[index + 1] : undefined;
./examples/library/scripts/model-proxy-exchange.ts:16:    const index = argv.indexOf(name);
./examples/library/scripts/model-proxy-exchange.ts:17:    return index >= 0 ? argv[index + 1] : undefined;
./examples/docs-only/scripts/public-agent-command.ts:24:    const index = argv.indexOf(name);
./examples/docs-only/scripts/public-agent-command.ts:25:    return index >= 0 ? argv[index + 1] : undefined;
./examples/docs-only/scripts/public-agent-planner.ts:46:    const index = argv.indexOf(name);
./examples/docs-only/scripts/public-agent-planner.ts:47:    return index >= 0 ? argv[index + 1] : undefined;
./examples/docs-only/scripts/public-agent-planner.ts:111:      const existing = findExistingIssue(item, existingIssues);
./examples/docs-only/scripts/public-agent-planner.ts:155:function findExistingIssue(item: RoadmapItem, issues: ExistingIssue[]): ExistingIssue | undefined {
./examples/docs-only/scripts/public-agent-target.ts:30:    const index = argv.indexOf(name);
./examples/docs-only/scripts/public-agent-target.ts:31:    return index >= 0 ? argv[index + 1] : undefined;
./examples/docs-only/scripts/public-agent-review.ts:30:    const index = argv.indexOf(name);
./examples/docs-only/scripts/public-agent-review.ts:31:    return index >= 0 ? argv[index + 1] : undefined;
./examples/library/scripts/public-agent-pm.ts:37:    const index = argv.indexOf(name);
./examples/library/scripts/public-agent-pm.ts:38:    return index >= 0 ? argv[index + 1] : undefined;
./examples/docs-only/scripts/open-autonomy-fleet.test.ts:6:import { buildDecisionIndex } from './public-agent-decision-index.js';
./examples/docs-only/scripts/open-autonomy-fleet.test.ts:31:  test('status can reconstruct latest state from the decision index', () => {
./examples/docs-only/scripts/open-autonomy-fleet.test.ts:32:    const index = buildDecisionIndex([
./examples/docs-only/scripts/open-autonomy-fleet.test.ts:45:      decisionIndex: index,
./examples/docs-only/scripts/open-autonomy-fleet.test.ts:49:    expect(renderStatusComment(status)).toContain('latest indexed decision: merge_gate:human_required');
./examples/docs-only/scripts/open-autonomy-fleet.test.ts:52:  test('governance report summarizes decision index outcomes', () => {
./examples/docs-only/scripts/open-autonomy-fleet.test.ts:53:    const index = buildDecisionIndex([
./examples/docs-only/scripts/open-autonomy-fleet.test.ts:63:    const report = buildGovernanceReport(index, new Date('2026-06-16T12:02:00Z'));
./examples/docs-only/scripts/public-agent-triage.ts:41:    const index = argv.indexOf(name);
./examples/docs-only/scripts/public-agent-triage.ts:42:    return index >= 0 ? argv[index + 1] : undefined;
./examples/library/scripts/github-agent-session.ts:37:  const split = argv.indexOf('--');
./examples/library/scripts/github-agent-session.ts:41:    const index = flags.indexOf(name);
./examples/library/scripts/github-agent-session.ts:42:    return index >= 0 ? flags[index + 1] : undefined;
./templates/self-driving-repo/docs/PROOF_LEDGER.md:9:| `decision-memory-smoke` | `scripts/public-agent-decision-index.ts`, `scripts/public-agent-planner.test.ts` | done |
./templates/self-driving-repo/docs/PROOF_LEDGER.md:18:| `status-reconstruction` | `scripts/public-agent-decision-index.ts`, `scripts/open-autonomy-fleet.test.ts` | done |
./examples/docs-only/scripts/public-agent-bundle.ts:276:  for (let index = 0; index < pattern.length; index += 1) {
./examples/docs-only/scripts/public-agent-bundle.ts:277:    const char = pattern[index];
./examples/docs-only/scripts/public-agent-bundle.ts:278:    const next = pattern[index + 1];
./examples/docs-only/scripts/public-agent-bundle.ts:280:      if (pattern[index + 2] === '/') {
./examples/docs-only/scripts/public-agent-bundle.ts:282:        index += 2;
./examples/docs-only/scripts/public-agent-bundle.ts:285:        index += 1;
./examples/docs-only/scripts/public-agent-dispatcher.ts:29:    const index = argv.indexOf(name);
./examples/docs-only/scripts/public-agent-dispatcher.ts:30:    return index >= 0 ? argv[index + 1] : undefined;
./examples/library/scripts/public-agent-control.ts:12:  decisionIndex?: {
./examples/library/scripts/public-agent-control.ts:51:  const indexedIssue = input.decisionIndex?.issues?.find((item) => item.issue === issueNumber);
./examples/library/scripts/public-agent-control.ts:57:    open_pr: input.openPr?.number ?? indexedIssue?.latest_pr ?? null,
./examples/library/scripts/public-agent-control.ts:60:    latest_decision: indexedIssue?.latest_decision ?? null,
./examples/library/scripts/public-agent-control.ts:75:    lines.push(`- latest indexed decision: ${summary.latest_decision.stage ?? 'unknown'}:${summary.latest_decision.decision ?? 'unknown'}`);
./examples/library/scripts/public-agent-control.ts:76:    if (summary.latest_decision.next_action) lines.push(`- latest indexed next action: ${summary.latest_decision.next_action}`);
./examples/docs-only/scripts/github-agent-publish.test.ts:165:      'index 0000000..1234567',
./examples/docs-only/scripts/github-agent-publish.test.ts:183:      'index 0000000..1234567',
./templates/self-driving-repo/docs/OSS_AGENT_RUNBOOK.md:54:Merged develop session bundles now include target, triage, develop, publish, CI, review, and merge-gate decision records, so operators should review the full chain when checking evidence.
./examples/docs-only/scripts/model-proxy-exchange.ts:16:    const index = argv.indexOf(name);
./examples/docs-only/scripts/model-proxy-exchange.ts:17:    return index >= 0 ? argv[index + 1] : undefined;
./examples/library/scripts/public-agent-ci.ts:49:    const index = argv.indexOf(name);
./examples/library/scripts/public-agent-ci.ts:50:    return index >= 0 ? argv[index + 1] : undefined;
./examples/docs-only/scripts/public-agent-decision.test.ts:11:  test('creates a valid durable decision record', () => {
./examples/docs-only/scripts/public-agent-decision.test.ts:20:      attempt: { kind: 'develop', index: 1, max: 3 },
./templates/self-driving-repo/docs/ARCHITECTURE.md:80:decision records should prove what happened.
./templates/self-driving-repo/docs/ARCHITECTURE.md:131:The durable end state should be a queryable decision index. Until then, the
./templates/self-driving-repo/docs/ARCHITECTURE.md:132:session folders, decision records, issue/PR comments, and testbed ledger are the
./examples/docs-only/scripts/public-agent-pm.ts:37:    const index = argv.indexOf(name);
./examples/docs-only/scripts/public-agent-pm.ts:38:    return index >= 0 ? argv[index + 1] : undefined;
./examples/library/scripts/open-autonomy-upgrade.ts:43:    const index = argv.indexOf(name);
./examples/library/scripts/open-autonomy-upgrade.ts:44:    return index >= 0 ? argv[index + 1] : undefined;
./examples/docs-only/scripts/model-proxy-mint.ts:20:    const index = argv.indexOf(name);
./examples/docs-only/scripts/model-proxy-mint.ts:21:    return index >= 0 ? argv[index + 1] : undefined;
./templates/self-driving-repo/docs/PUBLIC_AGENT_ACTIONS.md:160:- invalid manifest or decision records
./templates/self-driving-repo/docs/PUBLIC_AGENT_ACTIONS.md:195:- structured decision records
./examples/library/scripts/github-agent-publish.ts:43:    const index = argv.indexOf(name);
./examples/library/scripts/github-agent-publish.ts:44:    return index >= 0 ? argv[index + 1] : undefined;
./examples/docs-only/scripts/github-agent-session.ts:37:  const split = argv.indexOf('--');
./examples/docs-only/scripts/github-agent-session.ts:41:    const index = flags.indexOf(name);
./examples/docs-only/scripts/github-agent-session.ts:42:    return index >= 0 ? flags[index + 1] : undefined;
./examples/docs-only/scripts/open-autonomy-preflight.ts:44:  'scripts/public-agent-decision-index.ts',
./examples/docs-only/scripts/open-autonomy-preflight.ts:64:    const index = argv.indexOf(name);
./examples/docs-only/scripts/open-autonomy-preflight.ts:65:    return index >= 0 ? argv[index + 1] : undefined;
./examples/library/scripts/public-agent-control-files.ts:29:    const index = argv.indexOf(name);
./examples/library/scripts/public-agent-control-files.ts:30:    return index >= 0 ? argv[index + 1] : undefined;
./examples/docs-only/scripts/public-agent-policy.ts:46:    const index = argv.indexOf(name);
./examples/docs-only/scripts/public-agent-policy.ts:47:    return index >= 0 ? argv[index + 1] : undefined;
./examples/library/scripts/codex-agent-run.ts:20:  const index = argv.indexOf(name);
./examples/library/scripts/codex-agent-run.ts:21:  return index >= 0 ? argv[index + 1] : undefined;
./examples/docs-only/scripts/open-autonomy-proof-audit.ts:24:    const index = argv.indexOf(name);
./examples/docs-only/scripts/open-autonomy-proof-audit.ts:25:    return index >= 0 ? argv[index + 1] : undefined;
./examples/library/scripts/public-agent-planner.ts:46:    const index = argv.indexOf(name);
./examples/library/scripts/public-agent-planner.ts:47:    return index >= 0 ? argv[index + 1] : undefined;
./examples/library/scripts/public-agent-planner.ts:111:      const existing = findExistingIssue(item, existingIssues);
./examples/library/scripts/public-agent-planner.ts:155:function findExistingIssue(item: RoadmapItem, issues: ExistingIssue[]): ExistingIssue | undefined {
./examples/docs-only/scripts/public-agent-ci.ts:49:    const index = argv.indexOf(name);
./examples/docs-only/scripts/public-agent-ci.ts:50:    return index >= 0 ? argv[index + 1] : undefined;
./examples/library/scripts/public-agent-target.ts:30:    const index = argv.indexOf(name);
./examples/library/scripts/public-agent-target.ts:31:    return index >= 0 ? argv[index + 1] : undefined;
./examples/library/scripts/model-proxy-mint.ts:20:    const index = argv.indexOf(name);
./examples/library/scripts/model-proxy-mint.ts:21:    return index >= 0 ? argv[index + 1] : undefined;
./examples/library/scripts/open-autonomy-fleet.test.ts:6:import { buildDecisionIndex } from './public-agent-decision-index.js';
./examples/library/scripts/open-autonomy-fleet.test.ts:31:  test('status can reconstruct latest state from the decision index', () => {
./examples/library/scripts/open-autonomy-fleet.test.ts:32:    const index = buildDecisionIndex([
./examples/library/scripts/open-autonomy-fleet.test.ts:45:      decisionIndex: index,
./examples/library/scripts/open-autonomy-fleet.test.ts:49:    expect(renderStatusComment(status)).toContain('latest indexed decision: merge_gate:human_required');
./examples/library/scripts/open-autonomy-fleet.test.ts:52:  test('governance report summarizes decision index outcomes', () => {
./examples/library/scripts/open-autonomy-fleet.test.ts:53:    const index = buildDecisionIndex([
./examples/library/scripts/open-autonomy-fleet.test.ts:63:    const report = buildGovernanceReport(index, new Date('2026-06-16T12:02:00Z'));
./examples/library/scripts/open-autonomy-preflight.ts:44:  'scripts/public-agent-decision-index.ts',
./examples/library/scripts/open-autonomy-preflight.ts:64:    const index = argv.indexOf(name);
./examples/library/scripts/open-autonomy-preflight.ts:65:    return index >= 0 ? argv[index + 1] : undefined;
./examples/library/scripts/public-agent-bundle.ts:276:  for (let index = 0; index < pattern.length; index += 1) {
./examples/library/scripts/public-agent-bundle.ts:277:    const char = pattern[index];
./examples/library/scripts/public-agent-bundle.ts:278:    const next = pattern[index + 1];
./examples/library/scripts/public-agent-bundle.ts:280:      if (pattern[index + 2] === '/') {
./examples/library/scripts/public-agent-bundle.ts:282:        index += 2;
./examples/library/scripts/public-agent-bundle.ts:285:        index += 1;
./templates/self-driving-repo/scripts/scaffold-target-repo.ts:17:    const index = argv.indexOf(name);
./templates/self-driving-repo/scripts/scaffold-target-repo.ts:18:    return index >= 0 ? argv[index + 1] : undefined;
./examples/library/scripts/github-agent-publish.test.ts:165:      'index 0000000..1234567',
./examples/library/scripts/github-agent-publish.test.ts:183:      'index 0000000..1234567',
./examples/docs-only/scripts/public-agent-control.ts:12:  decisionIndex?: {
./examples/docs-only/scripts/public-agent-control.ts:51:  const indexedIssue = input.decisionIndex?.issues?.find((item) => item.issue === issueNumber);
./examples/docs-only/scripts/public-agent-control.ts:57:    open_pr: input.openPr?.number ?? indexedIssue?.latest_pr ?? null,
./examples/docs-only/scripts/public-agent-control.ts:60:    latest_decision: indexedIssue?.latest_decision ?? null,
./examples/docs-only/scripts/public-agent-control.ts:75:    lines.push(`- latest indexed decision: ${summary.latest_decision.stage ?? 'unknown'}:${summary.latest_decision.decision ?? 'unknown'}`);
./examples/docs-only/scripts/public-agent-control.ts:76:    if (summary.latest_decision.next_action) lines.push(`- latest indexed next action: ${summary.latest_decision.next_action}`);
./examples/library/scripts/public-agent-decision.test.ts:11:  test('creates a valid durable decision record', () => {
./examples/library/scripts/public-agent-decision.test.ts:20:      attempt: { kind: 'develop', index: 1, max: 3 },
./templates/self-driving-repo/scripts/public-agent-decision-index.ts:6:export interface DecisionIndexSubject {
./templates/self-driving-repo/scripts/public-agent-decision-index.ts:16:export interface DecisionIndex {
./templates/self-driving-repo/scripts/public-agent-decision-index.ts:17:  schema: 'open-autonomy.decision-index.v1';
./templates/self-driving-repo/scripts/public-agent-decision-index.ts:20:  issues: DecisionIndexSubject[];
./templates/self-driving-repo/scripts/public-agent-decision-index.ts:30:  bun scripts/public-agent-decision-index.ts [--sessions-dir agent-sessions] [--out .agent-run/decision-index.json]`);
./templates/self-driving-repo/scripts/public-agent-decision-index.ts:35:    const index = argv.indexOf(name);
./templates/self-driving-repo/scripts/public-agent-decision-index.ts:36:    return index >= 0 ? argv[index + 1] : undefined;
./templates/self-driving-repo/scripts/public-agent-decision-index.ts:39:  return { sessionsDir: value('--sessions-dir') ?? 'agent-sessions', out: value('--out') ?? '.agent-run/decision-index.json' };
./templates/self-driving-repo/scripts/public-agent-decision-index.ts:42:export function buildDecisionIndex(decisions: AgentDecision[], now = new Date()): DecisionIndex {
./templates/self-driving-repo/scripts/public-agent-decision-index.ts:43:  const byIssue = new Map<number, DecisionIndexSubject>();
./templates/self-driving-repo/scripts/public-agent-decision-index.ts:59:    schema: 'open-autonomy.decision-index.v1',
./templates/self-driving-repo/scripts/public-agent-decision-index.ts:93:  const index = buildDecisionIndex(readDecisionFiles(options.sessionsDir));
./templates/self-driving-repo/scripts/public-agent-decision-index.ts:94:  writeFileSync(options.out, `${JSON.stringify(index, null, 2)}\n`);
./templates/self-driving-repo/scripts/public-agent-decision-index.ts:95:  process.stdout.write(`decision-index=${index.decisions}\n`);
./templates/self-driving-repo/scripts/public-agent-context.ts:45:    const index = argv.indexOf(name);
./templates/self-driving-repo/scripts/public-agent-context.ts:46:    return index >= 0 ? argv[index + 1] : undefined;
./templates/self-driving-repo/scripts/github-agent-session.ts:37:  const split = argv.indexOf('--');
./templates/self-driving-repo/scripts/github-agent-session.ts:41:    const index = flags.indexOf(name);
./templates/self-driving-repo/scripts/github-agent-session.ts:42:    return index >= 0 ? flags[index + 1] : undefined;
./templates/self-driving-repo/scripts/public-agent-production.test.ts:28:    expect(text.indexOf('Handle operator control')).toBeLessThan(text.indexOf('Mint triage model token'));
./templates/self-driving-repo/scripts/public-agent-production.test.ts:52:    expect(text.indexOf('Comment on publisher rejection')).toBeLessThan(text.indexOf('Stop after publisher rejection'));
./templates/self-driving-repo/scripts/public-agent-production.test.ts:53:    expect(text.indexOf('Stop after publisher rejection')).toBeLessThan(text.indexOf('Create or update pull request'));
./templates/self-driving-repo/scripts/public-agent-production.test.ts:78:    expect(report).toContain('public-agent-decision-index.ts');
./templates/self-driving-repo/scripts/public-agent-command.ts:24:    const index = argv.indexOf(name);
./templates/self-driving-repo/scripts/public-agent-command.ts:25:    return index >= 0 ? argv[index + 1] : undefined;
./templates/self-driving-repo/scripts/public-agent-control.ts:12:  decisionIndex?: {
./templates/self-driving-repo/scripts/public-agent-control.ts:51:  const indexedIssue = input.decisionIndex?.issues?.find((item) => item.issue === issueNumber);
./templates/self-driving-repo/scripts/public-agent-control.ts:57:    open_pr: input.openPr?.number ?? indexedIssue?.latest_pr ?? null,
./templates/self-driving-repo/scripts/public-agent-control.ts:60:    latest_decision: indexedIssue?.latest_decision ?? null,
./templates/self-driving-repo/scripts/public-agent-control.ts:75:    lines.push(`- latest indexed decision: ${summary.latest_decision.stage ?? 'unknown'}:${summary.latest_decision.decision ?? 'unknown'}`);
./templates/self-driving-repo/scripts/public-agent-control.ts:76:    if (summary.latest_decision.next_action) lines.push(`- latest indexed next action: ${summary.latest_decision.next_action}`);
./templates/self-driving-repo/scripts/open-autonomy-governance-report.ts:3:import type { DecisionIndex } from './public-agent-decision-index.js';
./templates/self-driving-repo/scripts/open-autonomy-governance-report.ts:17:  index: string;
./templates/self-driving-repo/scripts/open-autonomy-governance-report.ts:23:  bun scripts/open-autonomy-governance-report.ts --index decision-index.json --out governance-report.json`);
./templates/self-driving-repo/scripts/open-autonomy-governance-report.ts:28:    const index = argv.indexOf(name);
./templates/self-driving-repo/scripts/open-autonomy-governance-report.ts:29:    return index >= 0 ? argv[index + 1] : undefined;
./templates/self-driving-repo/scripts/open-autonomy-governance-report.ts:31:  const index = value('--index');
./templates/self-driving-repo/scripts/open-autonomy-governance-report.ts:32:  if (!index) usage();
./templates/self-driving-repo/scripts/open-autonomy-governance-report.ts:33:  return { index, out: value('--out') ?? '.agent-run/governance-report.json' };
./templates/self-driving-repo/scripts/open-autonomy-governance-report.ts:36:export function buildGovernanceReport(index: DecisionIndex, now = new Date()): GovernanceReport {
./templates/self-driving-repo/scripts/open-autonomy-governance-report.ts:41:  for (const issue of index.issues) {
./templates/self-driving-repo/scripts/open-autonomy-governance-report.ts:53:    issues_seen: index.issues.length,
./templates/self-driving-repo/scripts/open-autonomy-governance-report.ts:54:    decisions_seen: index.decisions,
./templates/self-driving-repo/scripts/open-autonomy-governance-report.ts:64:  const report = buildGovernanceReport(JSON.parse(readFileSync(options.index, 'utf8')) as DecisionIndex);
./templates/self-driving-repo/scripts/public-agent-review.ts:30:    const index = argv.indexOf(name);
./templates/self-driving-repo/scripts/public-agent-review.ts:31:    return index >= 0 ? argv[index + 1] : undefined;
./templates/self-driving-repo/scripts/public-agent-ci.ts:49:    const index = argv.indexOf(name);
./templates/self-driving-repo/scripts/public-agent-ci.ts:50:    return index >= 0 ? argv[index + 1] : undefined;
./templates/self-driving-repo/scripts/public-agent-loop-budget.ts:46:    const index = argv.indexOf(name);
./templates/self-driving-repo/scripts/public-agent-loop-budget.ts:47:    return index >= 0 ? argv[index + 1] : undefined;
./templates/self-driving-repo/scripts/public-agent-triage.ts:41:    const index = argv.indexOf(name);
./templates/self-driving-repo/scripts/public-agent-triage.ts:42:    return index >= 0 ? argv[index + 1] : undefined;
./templates/self-driving-repo/scripts/open-autonomy-upgrade.ts:43:    const index = argv.indexOf(name);
./templates/self-driving-repo/scripts/open-autonomy-upgrade.ts:44:    return index >= 0 ? argv[index + 1] : undefined;
./templates/self-driving-repo/scripts/public-agent-planner.test.ts:2:import { buildDecisionIndex } from './public-agent-decision-index.js';
./templates/self-driving-repo/scripts/public-agent-planner.test.ts:80:  test('decision index reconstructs latest state by issue and stage', () => {
./templates/self-driving-repo/scripts/public-agent-planner.test.ts:96:    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
./templates/self-driving-repo/scripts/public-agent-planner.test.ts:97:    expect(index.decisions).toBe(2);
./templates/self-driving-repo/scripts/public-agent-planner.test.ts:98:    expect(index.issues[0]?.latest_pr).toBe(8);
./templates/self-driving-repo/scripts/public-agent-planner.test.ts:99:    expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
./templates/self-driving-repo/scripts/public-agent-planner.test.ts:100:    expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
./templates/self-driving-repo/scripts/public-agent-dispatcher.ts:29:    const index = argv.indexOf(name);
./templates/self-driving-repo/scripts/public-agent-dispatcher.ts:30:    return index >= 0 ? argv[index + 1] : undefined;
./templates/self-driving-repo/scripts/github-agent-publish.ts:43:    const index = argv.indexOf(name);
./templates/self-driving-repo/scripts/github-agent-publish.ts:44:    return index >= 0 ? argv[index + 1] : undefined;
./templates/self-driving-repo/scripts/model-proxy-exchange.ts:16:    const index = argv.indexOf(name);
./templates/self-driving-repo/scripts/model-proxy-exchange.ts:17:    return index >= 0 ? argv[index + 1] : undefined;
./templates/self-driving-repo/scripts/public-agent-control-files.ts:29:    const index = argv.indexOf(name);
./templates/self-driving-repo/scripts/public-agent-control-files.ts:30:    return index >= 0 ? argv[index + 1] : undefined;
./templates/self-driving-repo/scripts/public-agent-pm.ts:37:    const index = argv.indexOf(name);
./templates/self-driving-repo/scripts/public-agent-pm.ts:38:    return index >= 0 ? argv[index + 1] : undefined;
./examples/library/scripts/public-agent-policy.ts:46:    const index = argv.indexOf(name);
./examples/library/scripts/public-agent-policy.ts:47:    return index >= 0 ? argv[index + 1] : undefined;
./examples/library/scripts/open-autonomy-proof-audit.ts:24:    const index = argv.indexOf(name);
./examples/library/scripts/open-autonomy-proof-audit.ts:25:    return index >= 0 ? argv[index + 1] : undefined;
./templates/self-driving-repo/scripts/public-agent-merge-gate.ts:40:    const index = argv.indexOf(name);
./templates/self-driving-repo/scripts/public-agent-merge-gate.ts:41:    return index >= 0 ? argv[index + 1] : undefined;
./templates/self-driving-repo/scripts/public-agent-decision.test.ts:11:  test('creates a valid durable decision record', () => {
./templates/self-driving-repo/scripts/public-agent-decision.test.ts:20:      attempt: { kind: 'develop', index: 1, max: 3 },
./templates/self-driving-repo/scripts/public-agent-decision.ts:35:  index: number;
./templates/self-driving-repo/scripts/public-agent-decision.ts:167:  if (!Number.isInteger(attempt.index) || attempt.index <= 0) throw new Error('decision.attempt.index is invalid');
./templates/self-driving-repo/scripts/public-agent-decision.ts:169:  if (attempt.index > attempt.max) throw new Error('decision.attempt.index exceeds max');
./templates/self-driving-repo/scripts/public-agent-decision.ts:186:    const index = argv.indexOf(name);
./templates/self-driving-repo/scripts/public-agent-decision.ts:187:    return index >= 0 ? argv[index + 1] : undefined;
./templates/self-driving-repo/scripts/model-proxy-mint.ts:20:    const index = argv.indexOf(name);
./templates/self-driving-repo/scripts/model-proxy-mint.ts:21:    return index >= 0 ? argv[index + 1] : undefined;
./templates/self-driving-repo/scripts/open-autonomy-proof-audit.ts:24:    const index = argv.indexOf(name);
./templates/self-driving-repo/scripts/open-autonomy-proof-audit.ts:25:    return index >= 0 ? argv[index + 1] : undefined;
./templates/self-driving-repo/scripts/open-autonomy-preflight.ts:44:  'scripts/public-agent-decision-index.ts',
./templates/self-driving-repo/scripts/open-autonomy-preflight.ts:64:    const index = argv.indexOf(name);
./templates/self-driving-repo/scripts/open-autonomy-preflight.ts:65:    return index >= 0 ? argv[index + 1] : undefined;
./examples/small-app/package.json:8:    "check:public-agent": "bun test scripts/public-agent-decision.test.ts scripts/github-agent-session.test.ts scripts/github-agent-publish.test.ts scripts/public-agent-triage.test.ts scripts/public-agent-control.test.ts scripts/public-agent-production.test.ts scripts/public-agent-planner.test.ts scripts/open-autonomy-fleet.test.ts scripts/open-autonomy-upgrade.test.ts scripts/open-autonomy-proof-audit.test.ts && bunx tsc --noEmit --skipLibCheck --moduleResolution Bundler --module ESNext --target ES2022 --types bun scripts/public-agent-bundle.ts scripts/public-agent-decision.ts scripts/github-agent-session.ts scripts/github-agent-publish.ts scripts/model-proxy-mint.ts scripts/model-proxy-exchange.ts scripts/public-agent-triage.ts scripts/codex-agent-run.ts scripts/scaffold-target-repo.ts scripts/public-agent-command.ts scripts/public-agent-target.ts scripts/public-agent-ci.ts scripts/public-agent-review.ts scripts/public-agent-merge-gate.ts scripts/public-agent-loop-budget.ts scripts/public-agent-policy.ts scripts/public-agent-context.ts scripts/public-agent-pm.ts scripts/public-agent-dispatcher.ts scripts/public-agent-control.ts scripts/public-agent-control-files.ts scripts/public-agent-planner.ts scripts/public-agent-decision-index.ts scripts/open-autonomy-preflight.ts scripts/open-autonomy-governance-report.ts scripts/open-autonomy-upgrade.ts scripts/open-autonomy-proof-audit.ts scripts/public-agent-decision.test.ts scripts/github-agent-session.test.ts scripts/github-agent-publish.test.ts scripts/public-agent-triage.test.ts scripts/public-agent-control.test.ts scripts/public-agent-production.test.ts scripts/public-agent-planner.test.ts",
./templates/self-driving-repo/scripts/public-agent-policy.ts:46:    const index = argv.indexOf(name);
./templates/self-driving-repo/scripts/public-agent-policy.ts:47:    return index >= 0 ? argv[index + 1] : undefined;
./templates/self-driving-repo/scripts/open-autonomy-fleet.test.ts:6:import { buildDecisionIndex } from './public-agent-decision-index.js';
./templates/self-driving-repo/scripts/open-autonomy-fleet.test.ts:31:  test('status can reconstruct latest state from the decision index', () => {
./templates/self-driving-repo/scripts/open-autonomy-fleet.test.ts:32:    const index = buildDecisionIndex([
./templates/self-driving-repo/scripts/open-autonomy-fleet.test.ts:45:      decisionIndex: index,
./templates/self-driving-repo/scripts/open-autonomy-fleet.test.ts:49:    expect(renderStatusComment(status)).toContain('latest indexed decision: merge_gate:human_required');
./templates/self-driving-repo/scripts/open-autonomy-fleet.test.ts:52:  test('governance report summarizes decision index outcomes', () => {
./templates/self-driving-repo/scripts/open-autonomy-fleet.test.ts:53:    const index = buildDecisionIndex([
./templates/self-driving-repo/scripts/open-autonomy-fleet.test.ts:63:    const report = buildGovernanceReport(index, new Date('2026-06-16T12:02:00Z'));
./templates/self-driving-repo/scripts/codex-agent-run.ts:20:  const index = argv.indexOf(name);
./templates/self-driving-repo/scripts/codex-agent-run.ts:21:  return index >= 0 ? argv[index + 1] : undefined;
./examples/small-app/CHANGELOG.md:6:  reporting, durable decision indexing, and cookbook repository structure.
./templates/self-driving-repo/scripts/public-agent-bundle.ts:276:  for (let index = 0; index < pattern.length; index += 1) {
./templates/self-driving-repo/scripts/public-agent-bundle.ts:277:    const char = pattern[index];
./templates/self-driving-repo/scripts/public-agent-bundle.ts:278:    const next = pattern[index + 1];
./templates/self-driving-repo/scripts/public-agent-bundle.ts:280:      if (pattern[index + 2] === '/') {
./templates/self-driving-repo/scripts/public-agent-bundle.ts:282:        index += 2;
./templates/self-driving-repo/scripts/public-agent-bundle.ts:285:        index += 1;
./templates/self-driving-repo/scripts/public-agent-planner.ts:46:    const index = argv.indexOf(name);
./templates/self-driving-repo/scripts/public-agent-planner.ts:47:    return index >= 0 ? argv[index + 1] : undefined;
./templates/self-driving-repo/scripts/public-agent-planner.ts:111:      const existing = findExistingIssue(item, existingIssues);
./templates/self-driving-repo/scripts/public-agent-planner.ts:155:function findExistingIssue(item: RoadmapItem, issues: ExistingIssue[]): ExistingIssue | undefined {
./templates/self-driving-repo/scripts/public-agent-target.ts:30:    const index = argv.indexOf(name);
./templates/self-driving-repo/scripts/public-agent-target.ts:31:    return index >= 0 ? argv[index + 1] : undefined;
./templates/self-driving-repo/scripts/github-agent-publish.test.ts:165:      'index 0000000..1234567',
./templates/self-driving-repo/scripts/github-agent-publish.test.ts:183:      'index 0000000..1234567',
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/transcript.md:187:- durable decision records
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/transcript.md:236:index 44f80cf2130fed16c630f35c7cd8b1f73321a3bc..55edf4df5b8e5ab1282799231b9714daf60d002f
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/transcript.md:249:index 44f80cf2130fed16c630f35c7cd8b1f73321a3bc..55edf4df5b8e5ab1282799231b9714daf60d002f
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/transcript.md:267:index 44f80cf..55edf4d 100644
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/transcript.md:294:    13	- durable decision records
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/transcript.md:334:index 44f80cf2130fed16c630f35c7cd8b1f73321a3bc..55edf4df5b8e5ab1282799231b9714daf60d002f
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/transcript.md:353:index 0000000000000000000000000000000000000000..d8915f23d11a4141c137aff30ab9f3baf7213aa4
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/transcript.md:365:index 44f80cf2130fed16c630f35c7cd8b1f73321a3bc..55edf4df5b8e5ab1282799231b9714daf60d002f
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/transcript.md:379:index 0000000000000000000000000000000000000000..d8915f23d11a4141c137aff30ab9f3baf7213aa4
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/transcript.md:391:index 44f80cf2130fed16c630f35c7cd8b1f73321a3bc..55edf4df5b8e5ab1282799231b9714daf60d002f
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/transcript.md:408:index 0000000000000000000000000000000000000000..d8915f23d11a4141c137aff30ab9f3baf7213aa4
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/transcript.md:421:index 0000000000000000000000000000000000000000..0f5db1b514718deadd4cb17f3c5284e743bc92a3
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/transcript.md:434:index 44f80cf2130fed16c630f35c7cd8b1f73321a3bc..55edf4df5b8e5ab1282799231b9714daf60d002f
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/transcript.md:448:index 0000000000000000000000000000000000000000..d8915f23d11a4141c137aff30ab9f3baf7213aa4
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/transcript.md:461:index 0000000000000000000000000000000000000000..0f5db1b514718deadd4cb17f3c5284e743bc92a3
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/transcript.md:474:index 44f80cf2130fed16c630f35c7cd8b1f73321a3bc..55edf4df5b8e5ab1282799231b9714daf60d002f
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/transcript.md:491:index 0000000000000000000000000000000000000000..d8915f23d11a4141c137aff30ab9f3baf7213aa4
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/transcript.md:504:index 0000000000000000000000000000000000000000..0f5db1b514718deadd4cb17f3c5284e743bc92a3
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/transcript.md:518:index 0000000000000000000000000000000000000000..d1977ff94d73ce5677a1f7ade9dc6fb6419e9332
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/transcript.md:528:index 44f80cf2130fed16c630f35c7cd8b1f73321a3bc..55edf4df5b8e5ab1282799231b9714daf60d002f
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/transcript.md:542:index 0000000000000000000000000000000000000000..d8915f23d11a4141c137aff30ab9f3baf7213aa4
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/transcript.md:555:index 0000000000000000000000000000000000000000..0f5db1b514718deadd4cb17f3c5284e743bc92a3
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/transcript.md:569:index 0000000000000000000000000000000000000000..d1977ff94d73ce5677a1f7ade9dc6fb6419e9332
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/transcript.md:579:index 44f80cf2130fed16c630f35c7cd8b1f73321a3bc..55edf4df5b8e5ab1282799231b9714daf60d002f
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/transcript.md:603:index 0000000000000000000000000000000000000000..d8915f23d11a4141c137aff30ab9f3baf7213aa4
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/transcript.md:616:index 0000000000000000000000000000000000000000..0f5db1b514718deadd4cb17f3c5284e743bc92a3
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/transcript.md:630:index 0000000000000000000000000000000000000000..d1977ff94d73ce5677a1f7ade9dc6fb6419e9332
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/transcript.md:640:index 44f80cf2130fed16c630f35c7cd8b1f73321a3bc..55edf4df5b8e5ab1282799231b9714daf60d002f
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/transcript.md:664:index 0000000000000000000000000000000000000000..d8915f23d11a4141c137aff30ab9f3baf7213aa4
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/transcript.md:677:index 0000000000000000000000000000000000000000..0f5db1b514718deadd4cb17f3c5284e743bc92a3
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/transcript.md:691:index 0000000000000000000000000000000000000000..d1977ff94d73ce5677a1f7ade9dc6fb6419e9332
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/transcript.md:701:index 44f80cf2130fed16c630f35c7cd8b1f73321a3bc..55edf4df5b8e5ab1282799231b9714daf60d002f
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/decisions/dispatch-dec_04fb77a4d2e0a889.json:14:    "index": 2,
./examples/small-app/docs/PROOF_LEDGER.md:9:| `decision-memory-smoke` | `scripts/public-agent-decision-index.ts`, `scripts/public-agent-planner.test.ts` | done |
./examples/small-app/docs/PROOF_LEDGER.md:18:| `status-reconstruction` | `scripts/public-agent-decision-index.ts`, `scripts/open-autonomy-fleet.test.ts` | done |
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/artifacts/transcript.md:187:- durable decision records
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/artifacts/transcript.md:236:index 44f80cf2130fed16c630f35c7cd8b1f73321a3bc..55edf4df5b8e5ab1282799231b9714daf60d002f
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/artifacts/transcript.md:249:index 44f80cf2130fed16c630f35c7cd8b1f73321a3bc..55edf4df5b8e5ab1282799231b9714daf60d002f
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/artifacts/transcript.md:267:index 44f80cf..55edf4d 100644
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/artifacts/transcript.md:294:    13	- durable decision records
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/artifacts/transcript.md:334:index 44f80cf2130fed16c630f35c7cd8b1f73321a3bc..55edf4df5b8e5ab1282799231b9714daf60d002f
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/artifacts/transcript.md:353:index 0000000000000000000000000000000000000000..d8915f23d11a4141c137aff30ab9f3baf7213aa4
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/artifacts/transcript.md:365:index 44f80cf2130fed16c630f35c7cd8b1f73321a3bc..55edf4df5b8e5ab1282799231b9714daf60d002f
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/artifacts/transcript.md:379:index 0000000000000000000000000000000000000000..d8915f23d11a4141c137aff30ab9f3baf7213aa4
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/artifacts/transcript.md:391:index 44f80cf2130fed16c630f35c7cd8b1f73321a3bc..55edf4df5b8e5ab1282799231b9714daf60d002f
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/artifacts/transcript.md:408:index 0000000000000000000000000000000000000000..d8915f23d11a4141c137aff30ab9f3baf7213aa4
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/artifacts/transcript.md:421:index 0000000000000000000000000000000000000000..0f5db1b514718deadd4cb17f3c5284e743bc92a3
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/artifacts/transcript.md:434:index 44f80cf2130fed16c630f35c7cd8b1f73321a3bc..55edf4df5b8e5ab1282799231b9714daf60d002f
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/artifacts/transcript.md:448:index 0000000000000000000000000000000000000000..d8915f23d11a4141c137aff30ab9f3baf7213aa4
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/artifacts/transcript.md:461:index 0000000000000000000000000000000000000000..0f5db1b514718deadd4cb17f3c5284e743bc92a3
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/artifacts/transcript.md:474:index 44f80cf2130fed16c630f35c7cd8b1f73321a3bc..55edf4df5b8e5ab1282799231b9714daf60d002f
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/artifacts/transcript.md:491:index 0000000000000000000000000000000000000000..d8915f23d11a4141c137aff30ab9f3baf7213aa4
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/artifacts/transcript.md:504:index 0000000000000000000000000000000000000000..0f5db1b514718deadd4cb17f3c5284e743bc92a3
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/artifacts/transcript.md:518:index 0000000000000000000000000000000000000000..d1977ff94d73ce5677a1f7ade9dc6fb6419e9332
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/artifacts/transcript.md:528:index 44f80cf2130fed16c630f35c7cd8b1f73321a3bc..55edf4df5b8e5ab1282799231b9714daf60d002f
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/artifacts/transcript.md:542:index 0000000000000000000000000000000000000000..d8915f23d11a4141c137aff30ab9f3baf7213aa4
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/artifacts/transcript.md:555:index 0000000000000000000000000000000000000000..0f5db1b514718deadd4cb17f3c5284e743bc92a3
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/artifacts/transcript.md:569:index 0000000000000000000000000000000000000000..d1977ff94d73ce5677a1f7ade9dc6fb6419e9332
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/artifacts/transcript.md:579:index 44f80cf2130fed16c630f35c7cd8b1f73321a3bc..55edf4df5b8e5ab1282799231b9714daf60d002f
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/artifacts/transcript.md:603:index 0000000000000000000000000000000000000000..d8915f23d11a4141c137aff30ab9f3baf7213aa4
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/artifacts/transcript.md:616:index 0000000000000000000000000000000000000000..0f5db1b514718deadd4cb17f3c5284e743bc92a3
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/artifacts/transcript.md:630:index 0000000000000000000000000000000000000000..d1977ff94d73ce5677a1f7ade9dc6fb6419e9332
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/artifacts/transcript.md:640:index 44f80cf2130fed16c630f35c7cd8b1f73321a3bc..55edf4df5b8e5ab1282799231b9714daf60d002f
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/artifacts/transcript.md:664:index 0000000000000000000000000000000000000000..d8915f23d11a4141c137aff30ab9f3baf7213aa4
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/artifacts/transcript.md:677:index 0000000000000000000000000000000000000000..0f5db1b514718deadd4cb17f3c5284e743bc92a3
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/artifacts/transcript.md:691:index 0000000000000000000000000000000000000000..d1977ff94d73ce5677a1f7ade9dc6fb6419e9332
./agent-sessions/run_9e18b8af-a484-4c84-84b3-c8ba8253de9a/artifacts/transcript.md:701:index 44f80cf2130fed16c630f35c7cd8b1f73321a3bc..55edf4df5b8e5ab1282799231b9714daf60d002f
./examples/small-app/docs/OSS_AGENT_RUNBOOK.md:54:Merged develop session bundles now include target, triage, develop, publish, CI, review, and merge-gate decision records, so operators should review the full chain when checking evidence.
./examples/small-app/scripts/public-agent-decision.test.ts:11:  test('creates a valid durable decision record', () => {
./examples/small-app/scripts/public-agent-decision.test.ts:20:      attempt: { kind: 'develop', index: 1, max: 3 },
./examples/small-app/docs/ARCHITECTURE.md:80:decision records should prove what happened.
./examples/small-app/docs/ARCHITECTURE.md:131:The durable end state should be a queryable decision index. Until then, the
./examples/small-app/docs/ARCHITECTURE.md:132:session folders, decision records, issue/PR comments, and testbed ledger are the
./examples/small-app/scripts/model-proxy-mint.ts:20:    const index = argv.indexOf(name);
./examples/small-app/scripts/model-proxy-mint.ts:21:    return index >= 0 ? argv[index + 1] : undefined;
./examples/small-app/scripts/public-agent-policy.ts:46:    const index = argv.indexOf(name);
./examples/small-app/scripts/public-agent-policy.ts:47:    return index >= 0 ? argv[index + 1] : undefined;
./examples/small-app/scripts/open-autonomy-proof-audit.ts:24:    const index = argv.indexOf(name);
./examples/small-app/scripts/open-autonomy-proof-audit.ts:25:    return index >= 0 ? argv[index + 1] : undefined;
./examples/small-app/scripts/open-autonomy-preflight.ts:44:  'scripts/public-agent-decision-index.ts',
./examples/small-app/scripts/open-autonomy-preflight.ts:64:    const index = argv.indexOf(name);
./examples/small-app/scripts/open-autonomy-preflight.ts:65:    return index >= 0 ? argv[index + 1] : undefined;
./examples/small-app/docs/PUBLIC_AGENT_ACTIONS.md:160:- invalid manifest or decision records
./examples/small-app/docs/PUBLIC_AGENT_ACTIONS.md:195:- structured decision records
./examples/small-app/scripts/scaffold-target-repo.ts:17:    const index = argv.indexOf(name);
./examples/small-app/scripts/scaffold-target-repo.ts:18:    return index >= 0 ? argv[index + 1] : undefined;
./examples/small-app/scripts/public-agent-control-files.ts:29:    const index = argv.indexOf(name);
./examples/small-app/scripts/public-agent-control-files.ts:30:    return index >= 0 ? argv[index + 1] : undefined;
./examples/small-app/scripts/public-agent-review.ts:30:    const index = argv.indexOf(name);
./examples/small-app/scripts/public-agent-review.ts:31:    return index >= 0 ? argv[index + 1] : undefined;
./examples/small-app/scripts/codex-agent-run.ts:20:  const index = argv.indexOf(name);
./examples/small-app/scripts/codex-agent-run.ts:21:  return index >= 0 ? argv[index + 1] : undefined;
./examples/small-app/scripts/public-agent-decision-index.ts:6:export interface DecisionIndexSubject {
./examples/small-app/scripts/public-agent-decision-index.ts:16:export interface DecisionIndex {
./examples/small-app/scripts/public-agent-decision-index.ts:17:  schema: 'open-autonomy.decision-index.v1';
./examples/small-app/scripts/public-agent-decision-index.ts:20:  issues: DecisionIndexSubject[];
./examples/small-app/scripts/public-agent-decision-index.ts:30:  bun scripts/public-agent-decision-index.ts [--sessions-dir agent-sessions] [--out .agent-run/decision-index.json]`);
./examples/small-app/scripts/public-agent-decision-index.ts:35:    const index = argv.indexOf(name);
./examples/small-app/scripts/public-agent-decision-index.ts:36:    return index >= 0 ? argv[index + 1] : undefined;
./examples/small-app/scripts/public-agent-decision-index.ts:39:  return { sessionsDir: value('--sessions-dir') ?? 'agent-sessions', out: value('--out') ?? '.agent-run/decision-index.json' };
./examples/small-app/scripts/public-agent-decision-index.ts:42:export function buildDecisionIndex(decisions: AgentDecision[], now = new Date()): DecisionIndex {
./examples/small-app/scripts/public-agent-decision-index.ts:43:  const byIssue = new Map<number, DecisionIndexSubject>();
./examples/small-app/scripts/public-agent-decision-index.ts:59:    schema: 'open-autonomy.decision-index.v1',
./examples/small-app/scripts/public-agent-decision-index.ts:93:  const index = buildDecisionIndex(readDecisionFiles(options.sessionsDir));
./examples/small-app/scripts/public-agent-decision-index.ts:94:  writeFileSync(options.out, `${JSON.stringify(index, null, 2)}\n`);
./examples/small-app/scripts/public-agent-decision-index.ts:95:  process.stdout.write(`decision-index=${index.decisions}\n`);
./examples/small-app/scripts/open-autonomy-fleet.test.ts:6:import { buildDecisionIndex } from './public-agent-decision-index.js';
./examples/small-app/scripts/open-autonomy-fleet.test.ts:31:  test('status can reconstruct latest state from the decision index', () => {
./examples/small-app/scripts/open-autonomy-fleet.test.ts:32:    const index = buildDecisionIndex([
./examples/small-app/scripts/open-autonomy-fleet.test.ts:45:      decisionIndex: index,
./examples/small-app/scripts/open-autonomy-fleet.test.ts:49:    expect(renderStatusComment(status)).toContain('latest indexed decision: merge_gate:human_required');
./examples/small-app/scripts/open-autonomy-fleet.test.ts:52:  test('governance report summarizes decision index outcomes', () => {
./examples/small-app/scripts/open-autonomy-fleet.test.ts:53:    const index = buildDecisionIndex([
./examples/small-app/scripts/open-autonomy-fleet.test.ts:63:    const report = buildGovernanceReport(index, new Date('2026-06-16T12:02:00Z'));
./examples/small-app/scripts/public-agent-triage.ts:41:    const index = argv.indexOf(name);
./examples/small-app/scripts/public-agent-triage.ts:42:    return index >= 0 ? argv[index + 1] : undefined;
./examples/small-app/scripts/public-agent-planner.ts:46:    const index = argv.indexOf(name);
./examples/small-app/scripts/public-agent-planner.ts:47:    return index >= 0 ? argv[index + 1] : undefined;
./examples/small-app/scripts/public-agent-planner.ts:111:      const existing = findExistingIssue(item, existingIssues);
./examples/small-app/scripts/public-agent-planner.ts:155:function findExistingIssue(item: RoadmapItem, issues: ExistingIssue[]): ExistingIssue | undefined {
./examples/small-app/scripts/public-agent-production.test.ts:28:    expect(text.indexOf('Handle operator control')).toBeLessThan(text.indexOf('Mint triage model token'));
./examples/small-app/scripts/public-agent-production.test.ts:52:    expect(text.indexOf('Comment on publisher rejection')).toBeLessThan(text.indexOf('Stop after publisher rejection'));
./examples/small-app/scripts/public-agent-production.test.ts:53:    expect(text.indexOf('Stop after publisher rejection')).toBeLessThan(text.indexOf('Create or update pull request'));
./examples/small-app/scripts/public-agent-production.test.ts:78:    expect(report).toContain('public-agent-decision-index.ts');
./examples/small-app/scripts/public-agent-bundle.ts:276:  for (let index = 0; index < pattern.length; index += 1) {
./examples/small-app/scripts/public-agent-bundle.ts:277:    const char = pattern[index];
./examples/small-app/scripts/public-agent-bundle.ts:278:    const next = pattern[index + 1];
./examples/small-app/scripts/public-agent-bundle.ts:280:      if (pattern[index + 2] === '/') {
./examples/small-app/scripts/public-agent-bundle.ts:282:        index += 2;
./examples/small-app/scripts/public-agent-bundle.ts:285:        index += 1;
./examples/small-app/scripts/public-agent-target.ts:30:    const index = argv.indexOf(name);
./examples/small-app/scripts/public-agent-target.ts:31:    return index >= 0 ? argv[index + 1] : undefined;
./examples/small-app/scripts/public-agent-dispatcher.ts:29:    const index = argv.indexOf(name);
./examples/small-app/scripts/public-agent-dispatcher.ts:30:    return index >= 0 ? argv[index + 1] : undefined;
./examples/small-app/scripts/open-autonomy-governance-report.ts:3:import type { DecisionIndex } from './public-agent-decision-index.js';
./examples/small-app/scripts/open-autonomy-governance-report.ts:17:  index: string;
./examples/small-app/scripts/open-autonomy-governance-report.ts:23:  bun scripts/open-autonomy-governance-report.ts --index decision-index.json --out governance-report.json`);
./examples/small-app/scripts/open-autonomy-governance-report.ts:28:    const index = argv.indexOf(name);
./examples/small-app/scripts/open-autonomy-governance-report.ts:29:    return index >= 0 ? argv[index + 1] : undefined;
./examples/small-app/scripts/open-autonomy-governance-report.ts:31:  const index = value('--index');
./examples/small-app/scripts/open-autonomy-governance-report.ts:32:  if (!index) usage();
./examples/small-app/scripts/open-autonomy-governance-report.ts:33:  return { index, out: value('--out') ?? '.agent-run/governance-report.json' };
./examples/small-app/scripts/open-autonomy-governance-report.ts:36:export function buildGovernanceReport(index: DecisionIndex, now = new Date()): GovernanceReport {
./examples/small-app/scripts/open-autonomy-governance-report.ts:41:  for (const issue of index.issues) {
./examples/small-app/scripts/open-autonomy-governance-report.ts:53:    issues_seen: index.issues.length,
./examples/small-app/scripts/open-autonomy-governance-report.ts:54:    decisions_seen: index.decisions,
./examples/small-app/scripts/open-autonomy-governance-report.ts:64:  const report = buildGovernanceReport(JSON.parse(readFileSync(options.index, 'utf8')) as DecisionIndex);
./examples/small-app/scripts/github-agent-publish.test.ts:165:      'index 0000000..1234567',
./examples/small-app/scripts/github-agent-publish.test.ts:183:      'index 0000000..1234567',
./examples/small-app/scripts/public-agent-control.ts:12:  decisionIndex?: {
./examples/small-app/scripts/public-agent-control.ts:51:  const indexedIssue = input.decisionIndex?.issues?.find((item) => item.issue === issueNumber);
./examples/small-app/scripts/public-agent-control.ts:57:    open_pr: input.openPr?.number ?? indexedIssue?.latest_pr ?? null,
./examples/small-app/scripts/public-agent-control.ts:60:    latest_decision: indexedIssue?.latest_decision ?? null,
./examples/small-app/scripts/public-agent-control.ts:75:    lines.push(`- latest indexed decision: ${summary.latest_decision.stage ?? 'unknown'}:${summary.latest_decision.decision ?? 'unknown'}`);
./examples/small-app/scripts/public-agent-control.ts:76:    if (summary.latest_decision.next_action) lines.push(`- latest indexed next action: ${summary.latest_decision.next_action}`);
./examples/small-app/scripts/model-proxy-exchange.ts:16:    const index = argv.indexOf(name);
./examples/small-app/scripts/model-proxy-exchange.ts:17:    return index >= 0 ? argv[index + 1] : undefined;
./examples/small-app/scripts/open-autonomy-upgrade.ts:43:    const index = argv.indexOf(name);
./examples/small-app/scripts/open-autonomy-upgrade.ts:44:    return index >= 0 ? argv[index + 1] : undefined;
./examples/small-app/scripts/public-agent-ci.ts:49:    const index = argv.indexOf(name);
./examples/small-app/scripts/public-agent-ci.ts:50:    return index >= 0 ? argv[index + 1] : undefined;
./examples/small-app/scripts/public-agent-pm.ts:37:    const index = argv.indexOf(name);
./examples/small-app/scripts/public-agent-pm.ts:38:    return index >= 0 ? argv[index + 1] : undefined;
./examples/small-app/scripts/public-agent-loop-budget.ts:46:    const index = argv.indexOf(name);
./examples/small-app/scripts/public-agent-loop-budget.ts:47:    return index >= 0 ? argv[index + 1] : undefined;
./examples/small-app/scripts/github-agent-publish.ts:43:    const index = argv.indexOf(name);
./examples/small-app/scripts/github-agent-publish.ts:44:    return index >= 0 ? argv[index + 1] : undefined;
./examples/small-app/scripts/public-agent-merge-gate.ts:40:    const index = argv.indexOf(name);
./examples/small-app/scripts/public-agent-merge-gate.ts:41:    return index >= 0 ? argv[index + 1] : undefined;
./examples/small-app/scripts/public-agent-planner.test.ts:2:import { buildDecisionIndex } from './public-agent-decision-index.js';
./examples/small-app/scripts/public-agent-planner.test.ts:80:  test('decision index reconstructs latest state by issue and stage', () => {
./examples/small-app/scripts/public-agent-planner.test.ts:96:    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
./examples/small-app/scripts/public-agent-planner.test.ts:97:    expect(index.decisions).toBe(2);
./examples/small-app/scripts/public-agent-planner.test.ts:98:    expect(index.issues[0]?.latest_pr).toBe(8);
./examples/small-app/scripts/public-agent-planner.test.ts:99:    expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
./examples/small-app/scripts/public-agent-planner.test.ts:100:    expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
./examples/small-app/scripts/github-agent-session.ts:37:  const split = argv.indexOf('--');
./examples/small-app/scripts/github-agent-session.ts:41:    const index = flags.indexOf(name);
./examples/small-app/scripts/github-agent-session.ts:42:    return index >= 0 ? flags[index + 1] : undefined;
./examples/small-app/scripts/public-agent-context.ts:45:    const index = argv.indexOf(name);
./examples/small-app/scripts/public-agent-context.ts:46:    return index >= 0 ? argv[index + 1] : undefined;
./examples/small-app/scripts/public-agent-command.ts:24:    const index = argv.indexOf(name);
./examples/small-app/scripts/public-agent-command.ts:25:    return index >= 0 ? argv[index + 1] : undefined;
./examples/small-app/scripts/public-agent-decision.ts:35:  index: number;
./examples/small-app/scripts/public-agent-decision.ts:167:  if (!Number.isInteger(attempt.index) || attempt.index <= 0) throw new Error('decision.attempt.index is invalid');
./examples/small-app/scripts/public-agent-decision.ts:169:  if (attempt.index > attempt.max) throw new Error('decision.attempt.index exceeds max');
./examples/small-app/scripts/public-agent-decision.ts:186:    const index = argv.indexOf(name);
./examples/small-app/scripts/public-agent-decision.ts:187:    return index >= 0 ? argv[index + 1] : undefined;

codex
I found an existing decision-index script and tests in the testbed and library examples. Next I’m reading the canonical docs plus the current index implementation so I can extend the index shape without drifting from the repo’s established workflow.
exec
/bin/bash -c "sed -n '1,220p' docs/ARCHITECTURE.md" in /home/runner/work/open-autonomy/open-autonomy
exec
/bin/bash -c "sed -n '1,240p' docs/ROADMAP.md" in /home/runner/work/open-autonomy/open-autonomy
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
/bin/bash -c "sed -n '1,220p' examples/testbed/scripts/public-agent-decision-index.ts" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
#!/usr/bin/env bun
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateDecision, type AgentDecision } from './public-agent-decision.js';

export interface DecisionIndexSubject {
  issue: number;
  latest_decision?: AgentDecision;
  latest_by_stage: Record<string, AgentDecision>;
  latest_pr?: number;
  latest_next_action?: string;
  latest_risk?: string;
  updated_at?: string;
}

export interface DecisionIndex {
  schema: 'open-autonomy.decision-index.v1';
  generated_at: string;
  decisions: number;
  issues: DecisionIndexSubject[];
}

interface Options {
  sessionsDir: string;
  out: string;
}

function usage(): never {
  throw new Error(`Usage:
  bun scripts/public-agent-decision-index.ts [--sessions-dir agent-sessions] [--out .agent-run/decision-index.json]`);
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  if (argv.includes('--help')) usage();
  return { sessionsDir: value('--sessions-dir') ?? 'agent-sessions', out: value('--out') ?? '.agent-run/decision-index.json' };
}

export function buildDecisionIndex(decisions: AgentDecision[], now = new Date()): DecisionIndex {
  const byIssue = new Map<number, DecisionIndexSubject>();
  const sorted = [...decisions].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  for (const decision of sorted) {
    const subject = byIssue.get(decision.issue) ?? {
      issue: decision.issue,
      latest_by_stage: {},
    };
    subject.latest_decision = decision;
    subject.latest_by_stage[decision.stage] = decision;
    subject.latest_pr = decision.pr ?? subject.latest_pr;
    subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
    subject.latest_risk = decision.risk ?? subject.latest_risk;
    subject.updated_at = decision.created_at;
    byIssue.set(decision.issue, subject);
  }
  return {
    schema: 'open-autonomy.decision-index.v1',
    generated_at: now.toISOString(),
    decisions: sorted.length,
    issues: [...byIssue.values()].sort((a, b) => b.issue - a.issue),
  };
}

export function readDecisionFiles(root: string): AgentDecision[] {
  const files = walk(root).filter((path) => /\/decisions\/[^/]+\.json$/.test(path));
  const decisions: AgentDecision[] = [];
  for (const file of files) {
    try {
      decisions.push(validateDecision(JSON.parse(readFileSync(file, 'utf8'))));
    } catch {
      continue;
    }
  }
  return decisions;
}

function walk(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...walk(path));
    else if (stat.isFile()) out.push(path);
  }
  return out;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const index = buildDecisionIndex(readDecisionFiles(options.sessionsDir));
  writeFileSync(options.out, `${JSON.stringify(index, null, 2)}\n`);
  process.stdout.write(`decision-index=${index.decisions}\n`);
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}

exec
/bin/bash -c "sed -n '1,220p' scripts/public-agent-decision-index.ts" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
#!/usr/bin/env bun
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateDecision, type AgentDecision } from './public-agent-decision.js';

export interface DecisionIndexSubject {
  issue: number;
  latest_decision?: AgentDecision;
  latest_by_stage: Record<string, AgentDecision>;
  latest_pr?: number;
  latest_next_action?: string;
  latest_risk?: string;
  updated_at?: string;
}

export interface DecisionIndex {
  schema: 'open-autonomy.decision-index.v1';
  generated_at: string;
  decisions: number;
  issues: DecisionIndexSubject[];
}

interface Options {
  sessionsDir: string;
  out: string;
}

function usage(): never {
  throw new Error(`Usage:
  bun scripts/public-agent-decision-index.ts [--sessions-dir agent-sessions] [--out .agent-run/decision-index.json]`);
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  if (argv.includes('--help')) usage();
  return { sessionsDir: value('--sessions-dir') ?? 'agent-sessions', out: value('--out') ?? '.agent-run/decision-index.json' };
}

export function buildDecisionIndex(decisions: AgentDecision[], now = new Date()): DecisionIndex {
  const byIssue = new Map<number, DecisionIndexSubject>();
  const sorted = [...decisions].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  for (const decision of sorted) {
    const subject = byIssue.get(decision.issue) ?? {
      issue: decision.issue,
      latest_by_stage: {},
    };
    subject.latest_decision = decision;
    subject.latest_by_stage[decision.stage] = decision;
    subject.latest_pr = decision.pr ?? subject.latest_pr;
    subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
    subject.latest_risk = decision.risk ?? subject.latest_risk;
    subject.updated_at = decision.created_at;
    byIssue.set(decision.issue, subject);
  }
  return {
    schema: 'open-autonomy.decision-index.v1',
    generated_at: now.toISOString(),
    decisions: sorted.length,
    issues: [...byIssue.values()].sort((a, b) => b.issue - a.issue),
  };
}

export function readDecisionFiles(root: string): AgentDecision[] {
  const files = walk(root).filter((path) => /\/decisions\/[^/]+\.json$/.test(path));
  const decisions: AgentDecision[] = [];
  for (const file of files) {
    try {
      decisions.push(validateDecision(JSON.parse(readFileSync(file, 'utf8'))));
    } catch {
      continue;
    }
  }
  return decisions;
}

function walk(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...walk(path));
    else if (stat.isFile()) out.push(path);
  }
  return out;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const index = buildDecisionIndex(readDecisionFiles(options.sessionsDir));
  writeFileSync(options.out, `${JSON.stringify(index, null, 2)}\n`);
  process.stdout.write(`decision-index=${index.decisions}\n`);
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}

exec
/bin/bash -c "sed -n '1,260p' scripts/public-agent-decision.ts" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
#!/usr/bin/env bun
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { writeJson } from './public-agent-bundle.js';

export const DECISION_SCHEMA = 'volter.agent.decision.v1' as const;

export const DECISION_STAGES = [
  'pm_triage',
  'dispatch',
  'target',
  'triage',
  'develop',
  'publish',
  'ci',
  'review',
  'retry',
  'merge_gate',
  'escalation',
] as const;

export type DecisionStage = (typeof DECISION_STAGES)[number];
export type DecisionRisk = 'low' | 'medium' | 'high' | 'risky';

export interface DecisionSubject {
  type: 'issue' | 'pr' | 'run' | 'repo';
  number?: number;
  head_sha?: string;
  branch?: string;
}

export interface DecisionAttempt {
  kind: 'develop' | 'review' | 'pm' | 'retry' | 'merge';
  index: number;
  max: number;
}

export interface AgentDecision {
  schema: typeof DECISION_SCHEMA;
  id: string;
  stage: DecisionStage;
  issue: number;
  pr?: number;
  run_id?: string;
  actor: string;
  decision: string;
  risk?: DecisionRisk;
  subject?: DecisionSubject;
  attempt?: DecisionAttempt;
  reason?: string;
  failure_signature?: string;
  supersedes?: string[];
  evidence: string[];
  next_action?: string;
  created_at: string;
}

export interface DecisionInput {
  stage: DecisionStage;
  issue: number;
  pr?: number;
  run_id?: string;
  actor: string;
  decision: string;
  risk?: DecisionRisk;
  subject?: DecisionSubject;
  attempt?: DecisionAttempt;
  reason?: string;
  failure_signature?: string;
  supersedes?: string[];
  evidence?: string[];
  next_action?: string;
}

const SECRET_PATTERNS = [
  /sk_live_[A-Za-z0-9]{12,}/g,
  /rk_live_[A-Za-z0-9]{12,}/g,
  /xox(?:b|p|a|r)-[A-Za-z0-9-]{20,}/g,
  /ghp_[A-Za-z0-9]{30,}/g,
  /github_pat_[A-Za-z0-9_]{30,}/g,
  /anthropic_[A-Za-z0-9_-]{20,}/g,
  /OPENAI_API_KEY\s*=\s*sk-[A-Za-z0-9_-]{20,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

export function makeDecision(input: DecisionInput, now = new Date()): AgentDecision {
  const createdAt = now.toISOString();
  const redacted = redactSecrets({
    schema: DECISION_SCHEMA,
    stage: input.stage,
    issue: input.issue,
    pr: input.pr,
    run_id: input.run_id,
    actor: input.actor,
    decision: input.decision,
    risk: input.risk,
    subject: input.subject,
    attempt: input.attempt,
    reason: input.reason,
    failure_signature: input.failure_signature,
    supersedes: input.supersedes,
    evidence: input.evidence ?? [],
    next_action: input.next_action,
    created_at: createdAt,
  });
  const id = `dec_${createHash('sha256').update(JSON.stringify(redacted)).digest('hex').slice(0, 16)}`;
  return validateDecision({ ...redacted, id });
}

export function validateDecision(value: unknown): AgentDecision {
  if (!value || typeof value !== 'object') throw new Error('decision must be an object');
  const decision = value as Partial<AgentDecision>;
  if (decision.schema !== DECISION_SCHEMA) throw new Error('unsupported decision schema');
  if (!decision.id || typeof decision.id !== 'string' || !/^dec_[A-Fa-f0-9]{12,64}$/.test(decision.id)) throw new Error('decision.id is invalid');
  if (!decision.stage || !isDecisionStage(decision.stage)) throw new Error('decision.stage is invalid');
  if (!Number.isInteger(decision.issue) || Number(decision.issue) <= 0) throw new Error('decision.issue is invalid');
  if (decision.pr !== undefined && (!Number.isInteger(decision.pr) || Number(decision.pr) <= 0)) throw new Error('decision.pr is invalid');
  if (decision.run_id !== undefined && typeof decision.run_id !== 'string') throw new Error('decision.run_id is invalid');
  if (!decision.actor || typeof decision.actor !== 'string') throw new Error('decision.actor is required');
  if (!decision.decision || typeof decision.decision !== 'string') throw new Error('decision.decision is required');
  if (decision.risk !== undefined && !['low', 'medium', 'high', 'risky'].includes(decision.risk)) throw new Error('decision.risk is invalid');
  if (decision.subject !== undefined) validateSubject(decision.subject);
  if (decision.attempt !== undefined) validateAttempt(decision.attempt);
  if (decision.reason !== undefined && typeof decision.reason !== 'string') throw new Error('decision.reason is invalid');
  if (decision.failure_signature !== undefined && typeof decision.failure_signature !== 'string') throw new Error('decision.failure_signature is invalid');
  if (decision.supersedes !== undefined && (!Array.isArray(decision.supersedes) || decision.supersedes.some((id) => typeof id !== 'string'))) {
    throw new Error('decision.supersedes is invalid');
  }
  if (!Array.isArray(decision.evidence) || decision.evidence.some((item) => typeof item !== 'string')) throw new Error('decision.evidence is invalid');
  if (decision.next_action !== undefined && typeof decision.next_action !== 'string') throw new Error('decision.next_action is invalid');
  if (!decision.created_at || typeof decision.created_at !== 'string' || Number.isNaN(Date.parse(decision.created_at))) throw new Error('decision.created_at is invalid');
  return redactSecrets(decision) as AgentDecision;
}

export function writeDecision(outDir: string, decision: AgentDecision): string {
  const valid = validateDecision(decision);
  const filename = `${safeSegment(valid.stage)}-${safeSegment(valid.id)}.json`;
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, filename);
  writeJson(path, valid);
  return path;
}

export function redactSecrets<T>(value: T): T {
  if (typeof value === 'string') return redactString(value) as T;
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item)) as T;
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) out[key] = redactSecrets(item);
  }
  return out as T;
}

function validateSubject(subject: DecisionSubject): void {
  if (!subject || typeof subject !== 'object') throw new Error('decision.subject is invalid');
  if (!['issue', 'pr', 'run', 'repo'].includes(subject.type)) throw new Error('decision.subject.type is invalid');
  if (subject.number !== undefined && (!Number.isInteger(subject.number) || subject.number <= 0)) throw new Error('decision.subject.number is invalid');
  if (subject.head_sha !== undefined && typeof subject.head_sha !== 'string') throw new Error('decision.subject.head_sha is invalid');
  if (subject.branch !== undefined && typeof subject.branch !== 'string') throw new Error('decision.subject.branch is invalid');
}

function validateAttempt(attempt: DecisionAttempt): void {
  if (!attempt || typeof attempt !== 'object') throw new Error('decision.attempt is invalid');
  if (!['develop', 'review', 'pm', 'retry', 'merge'].includes(attempt.kind)) throw new Error('decision.attempt.kind is invalid');
  if (!Number.isInteger(attempt.index) || attempt.index <= 0) throw new Error('decision.attempt.index is invalid');
  if (!Number.isInteger(attempt.max) || attempt.max <= 0) throw new Error('decision.attempt.max is invalid');
  if (attempt.index > attempt.max) throw new Error('decision.attempt.index exceeds max');
}

function isDecisionStage(value: string): value is DecisionStage {
  return (DECISION_STAGES as readonly string[]).includes(value);
}

function redactString(value: string): string {
  return SECRET_PATTERNS.reduce((text, pattern) => text.replace(pattern, '[redacted]'), value);
}

function safeSegment(value: string): string {
  return basename(value).replace(/[^A-Za-z0-9._-]/g, '-');
}

function parseArgs(argv: string[]): DecisionInput & { outDir: string; createdAt?: string } {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const stage = value('--stage');
  const issue = value('--issue');
  const actor = value('--actor');
  const decision = value('--decision');
  const outDir = value('--out-dir');
  if (!stage || !issue || !actor || !decision || !outDir) usage();
  return {
    stage: stage as DecisionStage,
    issue: Number(issue),
    pr: optionalNumber(value('--pr')),
    run_id: value('--run-id'),
    actor,
    decision,
    risk: value('--risk') as DecisionRisk | undefined,
    subject: parseJson(value('--subject-json')),
    attempt: parseJson(value('--attempt-json')),
    reason: value('--reason'),
    failure_signature: value('--failure-signature'),
    supersedes: parseList(value('--supersedes')),
    evidence: parseList(value('--evidence')),
    next_action: value('--next-action'),
    outDir,
    createdAt: value('--created-at'),
  };
}

function usage(): never {
  throw new Error(`Usage:
  bun scripts/public-agent-decision.ts --stage develop --issue 123 --actor bot --decision pr-ready --out-dir out/decisions [--run-id run_...]`);
}

function optionalNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  return Number(value);
}

function parseJson<T>(value: string | undefined): T | undefined {
  if (!value) return undefined;
  return JSON.parse(value) as T;
}

function parseList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

async function main(): Promise<void> {
  const { outDir, createdAt, ...input } = parseArgs(process.argv.slice(2));
  const decision = makeDecision(input, createdAt ? new Date(createdAt) : new Date());
  const path = writeDecision(resolve(outDir), decision);
  process.stdout.write(`decision=${path}\n`);
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}

exec
/bin/bash -c "sed -n '1,220p' examples/testbed/scripts/public-agent-planner.test.ts" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
import { describe, expect, test } from 'bun:test';
import { buildDecisionIndex } from './public-agent-decision-index.js';
import { makeDecision } from './public-agent-decision.js';
import { readControlFileContext, renderControlFilePrompt } from './public-agent-control-files.js';
import { parseRoadmapItems, planRoadmapIssues } from './public-agent-planner.js';
import { renderReviewPrompt } from './public-agent-review.js';

const roadmap = `
schema: open-autonomy.roadmap.v1
items:
  - id: pm-proactive-backlog
    phase: 3
    priority: high
    status: active
    title: PM Operations And Backlog Policy
    proof_gate: pm-open-pr-review
    acceptance:
      - PM routes existing agent PRs to review.
      - PM comments visible wait states.
  - id: complete-item
    phase: 4
    priority: low
    status: done
    title: Already Complete
    proof_gate: complete-proof
    acceptance:
      - Nothing left.
`;

describe('open autonomy planner and control files', () => {
  test('loads root control files into prompt context', () => {
    const context = readControlFileContext('.');
    expect(context.sources).toContain('AGENTS.md');
    expect(context.sources).toContain('.open-autonomy/constitution.md');
    expect(context.sources).toContain('.open-autonomy/review-rubric.yml');
    const prompt = renderControlFilePrompt(context);
    expect(prompt).toContain('Open Autonomy Constitution');
    expect(prompt).toContain('review-rubric.yml');
  });

  test('review prompt includes control-file context', () => {
    const prompt = renderReviewPrompt('diff --git a/docs/x b/docs/x', '{"decision":"pass"}', 'constitution: stay scoped');
    expect(prompt).toContain('Control files:');
    expect(prompt).toContain('constitution: stay scoped');
  });

  test('planner creates missing active roadmap issues and skips done items', () => {
    const items = parseRoadmapItems(roadmap);
    const actions = planRoadmapIssues(items, []);
    expect(actions).toHaveLength(1);
    expect(actions[0]?.action).toBe('create');
    expect(actions[0]?.title).toContain('[roadmap:pm-proactive-backlog]');
    expect(actions[0]?.labels).toContain('origin:roadmap-planner');
    expect(actions[0]?.body).toContain('Proof gate: `pm-open-pr-review`');
  });

  test('planner updates existing roadmap issues that are missing labels', () => {
    const [item] = parseRoadmapItems(roadmap);
    const [action] = planRoadmapIssues([item!], [{ number: 10, title: '[roadmap:pm-proactive-backlog] PM Operations', body: 'old', labels: [] }]);
    expect(action?.action).toBe('update');
    expect(action?.issue_number).toBe(10);
  });

  test('planner dedupes existing roadmap issues with proof labels', () => {
    const [item] = parseRoadmapItems(roadmap);
    const [action] = planRoadmapIssues([item!], [{
      number: 11,
      title: 'Custom title',
      body: 'Proof gate: `pm-open-pr-review`',
      labels: [
        { name: 'roadmap:phase-3' },
        { name: 'priority:high' },
        { name: 'origin:roadmap-planner' },
        { name: 'proof:pm-open-pr-review' },
      ],
    }]);
    expect(action?.action).toBe('skip');
  });

  test('decision index reconstructs latest state by issue and stage', () => {
    const first = makeDecision({
      stage: 'pm_triage',
      issue: 7,
      actor: 'planner',
      decision: 'develop',
      next_action: 'develop',
    }, new Date('2026-06-16T10:00:00Z'));
    const second = makeDecision({
      stage: 'merge_gate',
      issue: 7,
      pr: 8,
      actor: 'merge-gate',
      decision: 'merge',
      next_action: 'close',
    }, new Date('2026-06-16T10:05:00Z'));
    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
    expect(index.decisions).toBe(2);
    expect(index.issues[0]?.latest_pr).toBe(8);
    expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
    expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
  });
});

exec
/bin/bash -c "sed -n '1,220p' examples/testbed/scripts/public-agent-control.ts" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
#!/usr/bin/env bun

export type AgentControlVerb = 'pause' | 'resume' | 'cancel' | 'retry' | 'status';
export type AgentControlScope = 'issue' | 'repo';

export interface AgentStatusSummaryInput {
  issue: { number?: number; labels?: Array<{ name?: string }> };
  openPr?: { number?: number; url?: string; headRefName?: string } | null;
  runs?: Array<{ databaseId?: number; status?: string; conclusion?: string; url?: string }>;
  proxyRuns?: Record<string, { repo?: string; issue?: number; actor?: string; active?: boolean }>;
  repoPaused?: boolean;
  decisionIndex?: {
    issues?: Array<{
      issue?: number;
      latest_decision?: { stage?: string; decision?: string; reason?: string; next_action?: string; created_at?: string };
      latest_pr?: number;
    }>;
  };
}

export interface AgentStatusSummary {
  issue: number | null;
  paused: boolean;
  repo_paused: boolean;
  blocking_labels: string[];
  open_pr: number | null;
  active_workflow_runs: number;
  active_proxy_runs: string[];
  latest_decision: null | {
    stage?: string;
    decision?: string;
    reason?: string;
    next_action?: string;
    created_at?: string;
  };
}

export function parseControlScope(raw: string): AgentControlScope {
  return /\b(repo|repository|global)\b/i.test(raw) ? 'repo' : 'issue';
}

export function summarizeAgentStatus(input: AgentStatusSummaryInput): AgentStatusSummary {
  const labels = (input.issue.labels ?? []).map((label) => (label.name ?? '').toLowerCase()).filter(Boolean);
  const blocking = labels.filter((label) => ['agent-paused', 'agent-blocked', 'human-required', 'security'].includes(label));
  const activeWorkflowRuns = (input.runs ?? []).filter((run) => isActiveRunStatus(run.status)).length;
  const issueNumber = input.issue.number ?? null;
  const activeProxyRuns = Object.entries(input.proxyRuns ?? {})
    .filter(([, run]) => run.active && run.issue === issueNumber)
    .map(([runId]) => runId)
    .sort();
  const indexedIssue = input.decisionIndex?.issues?.find((item) => item.issue === issueNumber);
  return {
    issue: issueNumber,
    paused: labels.includes('agent-paused'),
    repo_paused: input.repoPaused ?? false,
    blocking_labels: blocking,
    open_pr: input.openPr?.number ?? indexedIssue?.latest_pr ?? null,
    active_workflow_runs: activeWorkflowRuns,
    active_proxy_runs: activeProxyRuns,
    latest_decision: indexedIssue?.latest_decision ?? null,
  };
}

export function renderStatusComment(summary: AgentStatusSummary): string {
  const lines = [
    `Agent status for issue #${summary.issue ?? 'unknown'}:`,
    `- repo paused: ${summary.repo_paused ? 'yes' : 'no'}`,
    `- issue paused: ${summary.paused ? 'yes' : 'no'}`,
    `- blocking labels: ${summary.blocking_labels.length ? summary.blocking_labels.join(', ') : 'none'}`,
    `- open agent PR: ${summary.open_pr ? `#${summary.open_pr}` : 'none'}`,
    `- active workflow runs: ${summary.active_workflow_runs}`,
    `- active proxy runs: ${summary.active_proxy_runs.length ? summary.active_proxy_runs.join(', ') : 'none'}`,
  ];
  if (summary.latest_decision) {
    lines.push(`- latest indexed decision: ${summary.latest_decision.stage ?? 'unknown'}:${summary.latest_decision.decision ?? 'unknown'}`);
    if (summary.latest_decision.next_action) lines.push(`- latest indexed next action: ${summary.latest_decision.next_action}`);
  }
  return lines.join('\n');
}

function isActiveRunStatus(status: string | undefined): boolean {
  return status === 'queued' || status === 'in_progress' || status === 'waiting' || status === 'requested';
}

exec
/bin/bash -c "sed -n '1,260p' examples/testbed/scripts/public-agent-decision.ts" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
#!/usr/bin/env bun
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { writeJson } from './public-agent-bundle.js';

export const DECISION_SCHEMA = 'volter.agent.decision.v1' as const;

export const DECISION_STAGES = [
  'pm_triage',
  'dispatch',
  'target',
  'triage',
  'develop',
  'publish',
  'ci',
  'review',
  'retry',
  'merge_gate',
  'escalation',
] as const;

export type DecisionStage = (typeof DECISION_STAGES)[number];
export type DecisionRisk = 'low' | 'medium' | 'high' | 'risky';

export interface DecisionSubject {
  type: 'issue' | 'pr' | 'run' | 'repo';
  number?: number;
  head_sha?: string;
  branch?: string;
}

export interface DecisionAttempt {
  kind: 'develop' | 'review' | 'pm' | 'retry' | 'merge';
  index: number;
  max: number;
}

export interface AgentDecision {
  schema: typeof DECISION_SCHEMA;
  id: string;
  stage: DecisionStage;
  issue: number;
  pr?: number;
  run_id?: string;
  actor: string;
  decision: string;
  risk?: DecisionRisk;
  subject?: DecisionSubject;
  attempt?: DecisionAttempt;
  reason?: string;
  failure_signature?: string;
  supersedes?: string[];
  evidence: string[];
  next_action?: string;
  created_at: string;
}

export interface DecisionInput {
  stage: DecisionStage;
  issue: number;
  pr?: number;
  run_id?: string;
  actor: string;
  decision: string;
  risk?: DecisionRisk;
  subject?: DecisionSubject;
  attempt?: DecisionAttempt;
  reason?: string;
  failure_signature?: string;
  supersedes?: string[];
  evidence?: string[];
  next_action?: string;
}

const SECRET_PATTERNS = [
  /sk_live_[A-Za-z0-9]{12,}/g,
  /rk_live_[A-Za-z0-9]{12,}/g,
  /xox(?:b|p|a|r)-[A-Za-z0-9-]{20,}/g,
  /ghp_[A-Za-z0-9]{30,}/g,
  /github_pat_[A-Za-z0-9_]{30,}/g,
  /anthropic_[A-Za-z0-9_-]{20,}/g,
  /OPENAI_API_KEY\s*=\s*sk-[A-Za-z0-9_-]{20,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

export function makeDecision(input: DecisionInput, now = new Date()): AgentDecision {
  const createdAt = now.toISOString();
  const redacted = redactSecrets({
    schema: DECISION_SCHEMA,
    stage: input.stage,
    issue: input.issue,
    pr: input.pr,
    run_id: input.run_id,
    actor: input.actor,
    decision: input.decision,
    risk: input.risk,
    subject: input.subject,
    attempt: input.attempt,
    reason: input.reason,
    failure_signature: input.failure_signature,
    supersedes: input.supersedes,
    evidence: input.evidence ?? [],
    next_action: input.next_action,
    created_at: createdAt,
  });
  const id = `dec_${createHash('sha256').update(JSON.stringify(redacted)).digest('hex').slice(0, 16)}`;
  return validateDecision({ ...redacted, id });
}

export function validateDecision(value: unknown): AgentDecision {
  if (!value || typeof value !== 'object') throw new Error('decision must be an object');
  const decision = value as Partial<AgentDecision>;
  if (decision.schema !== DECISION_SCHEMA) throw new Error('unsupported decision schema');
  if (!decision.id || typeof decision.id !== 'string' || !/^dec_[A-Fa-f0-9]{12,64}$/.test(decision.id)) throw new Error('decision.id is invalid');
  if (!decision.stage || !isDecisionStage(decision.stage)) throw new Error('decision.stage is invalid');
  if (!Number.isInteger(decision.issue) || Number(decision.issue) <= 0) throw new Error('decision.issue is invalid');
  if (decision.pr !== undefined && (!Number.isInteger(decision.pr) || Number(decision.pr) <= 0)) throw new Error('decision.pr is invalid');
  if (decision.run_id !== undefined && typeof decision.run_id !== 'string') throw new Error('decision.run_id is invalid');
  if (!decision.actor || typeof decision.actor !== 'string') throw new Error('decision.actor is required');
  if (!decision.decision || typeof decision.decision !== 'string') throw new Error('decision.decision is required');
  if (decision.risk !== undefined && !['low', 'medium', 'high', 'risky'].includes(decision.risk)) throw new Error('decision.risk is invalid');
  if (decision.subject !== undefined) validateSubject(decision.subject);
  if (decision.attempt !== undefined) validateAttempt(decision.attempt);
  if (decision.reason !== undefined && typeof decision.reason !== 'string') throw new Error('decision.reason is invalid');
  if (decision.failure_signature !== undefined && typeof decision.failure_signature !== 'string') throw new Error('decision.failure_signature is invalid');
  if (decision.supersedes !== undefined && (!Array.isArray(decision.supersedes) || decision.supersedes.some((id) => typeof id !== 'string'))) {
    throw new Error('decision.supersedes is invalid');
  }
  if (!Array.isArray(decision.evidence) || decision.evidence.some((item) => typeof item !== 'string')) throw new Error('decision.evidence is invalid');
  if (decision.next_action !== undefined && typeof decision.next_action !== 'string') throw new Error('decision.next_action is invalid');
  if (!decision.created_at || typeof decision.created_at !== 'string' || Number.isNaN(Date.parse(decision.created_at))) throw new Error('decision.created_at is invalid');
  return redactSecrets(decision) as AgentDecision;
}

export function writeDecision(outDir: string, decision: AgentDecision): string {
  const valid = validateDecision(decision);
  const filename = `${safeSegment(valid.stage)}-${safeSegment(valid.id)}.json`;
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, filename);
  writeJson(path, valid);
  return path;
}

export function redactSecrets<T>(value: T): T {
  if (typeof value === 'string') return redactString(value) as T;
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item)) as T;
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) out[key] = redactSecrets(item);
  }
  return out as T;
}

function validateSubject(subject: DecisionSubject): void {
  if (!subject || typeof subject !== 'object') throw new Error('decision.subject is invalid');
  if (!['issue', 'pr', 'run', 'repo'].includes(subject.type)) throw new Error('decision.subject.type is invalid');
  if (subject.number !== undefined && (!Number.isInteger(subject.number) || subject.number <= 0)) throw new Error('decision.subject.number is invalid');
  if (subject.head_sha !== undefined && typeof subject.head_sha !== 'string') throw new Error('decision.subject.head_sha is invalid');
  if (subject.branch !== undefined && typeof subject.branch !== 'string') throw new Error('decision.subject.branch is invalid');
}

function validateAttempt(attempt: DecisionAttempt): void {
  if (!attempt || typeof attempt !== 'object') throw new Error('decision.attempt is invalid');
  if (!['develop', 'review', 'pm', 'retry', 'merge'].includes(attempt.kind)) throw new Error('decision.attempt.kind is invalid');
  if (!Number.isInteger(attempt.index) || attempt.index <= 0) throw new Error('decision.attempt.index is invalid');
  if (!Number.isInteger(attempt.max) || attempt.max <= 0) throw new Error('decision.attempt.max is invalid');
  if (attempt.index > attempt.max) throw new Error('decision.attempt.index exceeds max');
}

function isDecisionStage(value: string): value is DecisionStage {
  return (DECISION_STAGES as readonly string[]).includes(value);
}

function redactString(value: string): string {
  return SECRET_PATTERNS.reduce((text, pattern) => text.replace(pattern, '[redacted]'), value);
}

function safeSegment(value: string): string {
  return basename(value).replace(/[^A-Za-z0-9._-]/g, '-');
}

function parseArgs(argv: string[]): DecisionInput & { outDir: string; createdAt?: string } {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const stage = value('--stage');
  const issue = value('--issue');
  const actor = value('--actor');
  const decision = value('--decision');
  const outDir = value('--out-dir');
  if (!stage || !issue || !actor || !decision || !outDir) usage();
  return {
    stage: stage as DecisionStage,
    issue: Number(issue),
    pr: optionalNumber(value('--pr')),
    run_id: value('--run-id'),
    actor,
    decision,
    risk: value('--risk') as DecisionRisk | undefined,
    subject: parseJson(value('--subject-json')),
    attempt: parseJson(value('--attempt-json')),
    reason: value('--reason'),
    failure_signature: value('--failure-signature'),
    supersedes: parseList(value('--supersedes')),
    evidence: parseList(value('--evidence')),
    next_action: value('--next-action'),
    outDir,
    createdAt: value('--created-at'),
  };
}

function usage(): never {
  throw new Error(`Usage:
  bun scripts/public-agent-decision.ts --stage develop --issue 123 --actor bot --decision pr-ready --out-dir out/decisions [--run-id run_...]`);
}

function optionalNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  return Number(value);
}

function parseJson<T>(value: string | undefined): T | undefined {
  if (!value) return undefined;
  return JSON.parse(value) as T;
}

function parseList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

async function main(): Promise<void> {
  const { outDir, createdAt, ...input } = parseArgs(process.argv.slice(2));
  const decision = makeDecision(input, createdAt ? new Date(createdAt) : new Date());
  const path = writeDecision(resolve(outDir), decision);
  process.stdout.write(`decision=${path}\n`);
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}

codex
The current index already reconstructs some issue state, but it stops at issue/stage. I’m now checking the callers so I can extend the shape in a way that still fits the status and governance consumers.
exec
/bin/bash -c "sed -n '1,220p' examples/testbed/scripts/open-autonomy-fleet.test.ts" in /home/runner/work/open-autonomy/open-autonomy
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
/bin/bash -c "sed -n '1,220p' examples/testbed/scripts/open-autonomy-governance-report.ts" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
#!/usr/bin/env bun
import { readFileSync, writeFileSync } from 'node:fs';
import type { DecisionIndex } from './public-agent-decision-index.js';

export interface GovernanceReport {
  schema: 'open-autonomy.governance-report.v1';
  generated_at: string;
  issues_seen: number;
  decisions_seen: number;
  by_latest_decision: Record<string, number>;
  human_required: number;
  retry_related: number;
  open_prs_seen: number;
}

interface Options {
  index: string;
  out: string;
}

function usage(): never {
  throw new Error(`Usage:
  bun scripts/open-autonomy-governance-report.ts --index decision-index.json --out governance-report.json`);
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const index = value('--index');
  if (!index) usage();
  return { index, out: value('--out') ?? '.agent-run/governance-report.json' };
}

export function buildGovernanceReport(index: DecisionIndex, now = new Date()): GovernanceReport {
  const byLatest: Record<string, number> = {};
  let humanRequired = 0;
  let retryRelated = 0;
  let openPrs = 0;
  for (const issue of index.issues) {
    const decision = issue.latest_decision?.decision ?? 'unknown';
    byLatest[decision] = (byLatest[decision] ?? 0) + 1;
    if (/human|required|blocked|escalat/i.test(decision) || /human|required|blocked|escalat/i.test(issue.latest_decision?.next_action ?? '')) {
      humanRequired += 1;
    }
    if (/retry|failure|budget/i.test(decision) || /retry|failure|budget/i.test(issue.latest_decision?.reason ?? '')) retryRelated += 1;
    if (issue.latest_pr) openPrs += 1;
  }
  return {
    schema: 'open-autonomy.governance-report.v1',
    generated_at: now.toISOString(),
    issues_seen: index.issues.length,
    decisions_seen: index.decisions,
    by_latest_decision: byLatest,
    human_required: humanRequired,
    retry_related: retryRelated,
    open_prs_seen: openPrs,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const report = buildGovernanceReport(JSON.parse(readFileSync(options.index, 'utf8')) as DecisionIndex);
  writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`governance-report=issues:${report.issues_seen} decisions:${report.decisions_seen}\n`);
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}

exec
/bin/bash -c "sed -n '1,220p' examples/testbed/scripts/public-agent-pm.ts" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
#!/usr/bin/env bun
import { readFileSync, writeFileSync } from 'node:fs';

export type PmAction =
  | 'develop'
  | 'review'
  | 'needs_info'
  | 'duplicate'
  | 'spam'
  | 'human_required'
  | 'wont_fix'
  | 'ignore';

export interface PmDecision {
  action: PmAction;
  risk: 'low' | 'medium' | 'high';
  human_required: boolean;
  reason: string;
  question?: string;
  duplicate_of?: number;
}

interface Options {
  issue: string;
  provider: 'anthropic' | 'openai';
  model: string;
  out: string;
}

function usage(): never {
  throw new Error(`Usage:
  MODEL_PROXY_URL=... MODEL_PROXY_TOKEN=... bun scripts/public-agent-pm.ts --issue issue.json --provider openai|anthropic --model model --out pm.json`);
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const issue = value('--issue');
  const provider = value('--provider') ?? 'openai';
  const model = value('--model');
  if (!issue || !model || (provider !== 'openai' && provider !== 'anthropic')) usage();
  return { issue, provider, model, out: value('--out') ?? '.agent-run/pm.json' };
}

export function parsePmDecision(text: string): PmDecision {
  const trimmed = text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  const parsed = JSON.parse(trimmed) as Partial<PmDecision>;
  const actions: PmAction[] = ['develop', 'review', 'needs_info', 'duplicate', 'spam', 'human_required', 'wont_fix', 'ignore'];
  if (!actions.includes(parsed.action as PmAction)) throw new Error('PM returned invalid action');
  if (parsed.risk !== 'low' && parsed.risk !== 'medium' && parsed.risk !== 'high') throw new Error('PM returned invalid risk');
  if (typeof parsed.human_required !== 'boolean') throw new Error('PM returned invalid human_required');
  if (!parsed.reason || typeof parsed.reason !== 'string') throw new Error('PM returned no reason');
  return {
    action: parsed.action as PmAction,
    risk: parsed.risk,
    human_required: parsed.human_required,
    reason: parsed.reason,
    question: typeof parsed.question === 'string' ? parsed.question : undefined,
    duplicate_of: Number.isInteger(parsed.duplicate_of) ? Number(parsed.duplicate_of) : undefined,
  };
}

export function pmFailureDecision(error: unknown): PmDecision {
  return {
    action: 'ignore',
    risk: 'low',
    human_required: false,
    reason: `PM model decision unavailable: ${redact(String(error instanceof Error ? error.message : error))}`,
  };
}

export function renderPmPrompt(issueJson: string): string {
  return [
    'You are the PM agent for a self-building OSS repository.',
    'Triage this public issue and recommend exactly one next action.',
    'You do not authorize execution. A deterministic dispatcher will decide.',
    'Return strict JSON only.',
    'Schema: action, risk, human_required, reason, optional question, optional duplicate_of.',
    'Allowed actions: develop, review, needs_info, duplicate, spam, human_required, wont_fix, ignore.',
    'Choose develop only for clear, scoped, non-security work with enough acceptance criteria.',
    'Choose ignore when an agent run for this issue is queued or in_progress.',
    'Choose review when open_agent_pr exists and the PR appears ready for reviewer attention.',
    'Choose develop again only when there is no queued/in_progress run and the issue has new human information after the last PM or agent action.',
    'If a human reply after a PM needs_info comment provides an exact file and concrete requested text or acceptance criteria, choose develop.',
    'For failed, blocked, or stalled agent work with no new human input, choose ignore unless human_required is warranted by risk or ambiguity.',
    'Choose needs_info when reproduction, scope, or desired behavior is missing.',
    'Choose human_required for security-sensitive, workflow, policy, legal, credential, maintainer-trust, or ambiguous product decisions.',
    'Choose human_required for test-harness or operator-control issues whose purpose is to exercise commands such as pause, status, retry, resume, or repo pause instead of changing repository files.',
    'If labels include agent-blocked, human-required, security, or agent-paused, choose ignore unless you are explaining human_required from new human input.',
    'Use open_agent_pr, open_agent_pr.comments, agent_runs, labels, previous_decisions, and issue comments in the issue context to avoid duplicate starts and duplicate reviews, and to notice stuck or blocked work.',
    'If previous_decisions show policy_blocked, budget_exhausted, needs_info_stale, ci-repeated-failure, or review-repeated-failure with no newer human input, choose ignore or human_required instead of develop.',
    'If an open canonical agent PR exists and has no newer review/status marker after its latest update, choose review instead of develop when the PR appears ready.',
    'If a failed or stale run has newer human input with concrete requested changes, develop may be appropriate; otherwise avoid restarting failed work blindly.',
    'The PM control surface is comments: develop maps to /agent develop on the issue; review maps to /agent review on the open PR.',
    '',
    'Issue context JSON:',
    issueJson,
  ].join('\n');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const proxyUrl = process.env.MODEL_PROXY_URL;
  const token = process.env.MODEL_PROXY_TOKEN;
  if (!proxyUrl || !token) throw new Error('MODEL_PROXY_URL and MODEL_PROXY_TOKEN are required');
  const prompt = renderPmPrompt(readFileSync(options.issue, 'utf8'));
  const decision = await (async () => {
    try {
      return options.provider === 'anthropic'
        ? await callAnthropic(proxyUrl, token, options.model, prompt)
        : await callOpenAI(proxyUrl, token, options.model, prompt);
    } catch (error) {
      return pmFailureDecision(error);
    }
  })();
  writeFileSync(options.out, `${JSON.stringify(decision, null, 2)}\n`);
  process.stdout.write(`pm=${decision.action}:${decision.risk}\n`);
}

async function callAnthropic(proxyUrl: string, token: string, model: string, prompt: string): Promise<PmDecision> {
  const res = await fetch(new URL('/anthropic/v1/messages', proxyUrl), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, max_tokens: 800, messages: [{ role: 'user', content: prompt }] }),
  });
  const body = await res.json() as { content?: Array<{ text?: string }> };
  if (!res.ok) throw new Error(`PM model call failed: ${res.status}`);
  return parsePmDecision(body.content?.map((part) => part.text ?? '').join('\n') ?? '');
}

async function callOpenAI(proxyUrl: string, token: string, model: string, prompt: string): Promise<PmDecision> {
  const res = await fetch(new URL('/openai/v1/chat/completions', proxyUrl), {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 800, messages: [{ role: 'user', content: prompt }] }),
  });
  const body = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  if (!res.ok) throw new Error(`PM model call failed: ${res.status}`);
  return parsePmDecision(body.choices?.[0]?.message?.content ?? '');
}

function redact(text: string): string {
  return text
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, 'sk-redacted')
    .replace(/\b(?:ghp|github_pat|anthropic)_[A-Za-z0-9_:-]{12,}\b/g, 'token-redacted');
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}

exec
/bin/bash -c "sed -n '1,220p' examples/testbed/docs/PROOF_LEDGER.md" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
# Proof Ledger

This ledger maps every `.open-autonomy/roadmap.yml` proof gate to evidence.
Evidence may be live GitHub workflow proof, live testbed issue proof, or a
deterministic CI fixture when model budget or external state would make a live
model run less reliable than the gate being tested.

| Proof Gate | Evidence | Status |
| --- | --- | --- |
| `decision-memory-smoke` | `scripts/public-agent-decision-index.ts`, `scripts/public-agent-planner.test.ts`, canonical governance run `27649191830` | done |
| `retry-ci-failure` | `scripts/public-agent-loop-budget.ts`, `scripts/public-agent-control.test.ts`, direct review workflow parity tests | done |
| `pm-open-pr-review` | `scripts/public-agent-dispatcher.ts`, PM dispatcher tests for open PR review routing | done |
| `developer-context-review-fix` | `scripts/public-agent-context.ts`, developer-context tests with prior decisions and PR diff | done |
| `head-changed-before-merge` | `scripts/public-agent-merge-gate.ts`, merge-gate changed-head tests | done |
| `operator-pause-resume` | live testbed runs recorded in `docs/TEST_RUNS.md` | done |
| `five-issue-dogfood` | live testbed PM/develop/review/merge and operator scenarios recorded in `docs/TEST_RUNS.md` | done |
| `planner-creates-proof-gate-issues` | planner workflow runs `27648929065` and `27648929059`; planner tests | done |
| `scaffold-install-smoke` | `scripts/scaffold-target-repo.ts`, fleet preflight runs `27649190745` and `27649190743` | done |
| `status-reconstruction` | `scripts/public-agent-decision-index.ts`, status reconstruction tests, governance runs | done |
| `quality-review-repair` | `scripts/public-agent-loop-budget.ts`, `scripts/public-agent-context.ts`, `scripts/public-agent-control.test.ts` | done |
| `governance-maintainer-hold` | `scripts/public-agent-merge-gate.ts`, `scripts/public-agent-policy.ts`, `scripts/public-agent-control.test.ts` | done |
| `release-dogfood` | `VERSION`, `.open-autonomy/version.json`, `CHANGELOG.md`, `docs/RELEASE.md`, manifest version tests | done |

exec
/bin/bash -c "sed -n '1,220p' package.json" in /home/runner/work/open-autonomy/open-autonomy
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
/bin/bash -c "sed -n '1,220p' examples/testbed/package.json" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
{
  "name": "open-autonomy-testbed",
  "private": true,
  "type": "module",
  "packageManager": "bun@1.3.10",
  "scripts": {
    "check": "bun run check:public-agent && bun run check:proof",
    "check:public-agent": "bun test scripts/public-agent-decision.test.ts scripts/github-agent-session.test.ts scripts/github-agent-publish.test.ts scripts/public-agent-triage.test.ts scripts/public-agent-control.test.ts scripts/public-agent-production.test.ts scripts/public-agent-planner.test.ts scripts/open-autonomy-fleet.test.ts scripts/open-autonomy-upgrade.test.ts scripts/open-autonomy-proof-audit.test.ts && bunx tsc --noEmit --skipLibCheck --moduleResolution Bundler --module ESNext --target ES2022 --types bun scripts/public-agent-bundle.ts scripts/public-agent-decision.ts scripts/github-agent-session.ts scripts/github-agent-publish.ts scripts/model-proxy-mint.ts scripts/model-proxy-exchange.ts scripts/public-agent-triage.ts scripts/codex-agent-run.ts scripts/scaffold-target-repo.ts scripts/public-agent-command.ts scripts/public-agent-target.ts scripts/public-agent-ci.ts scripts/public-agent-review.ts scripts/public-agent-merge-gate.ts scripts/public-agent-loop-budget.ts scripts/public-agent-policy.ts scripts/public-agent-context.ts scripts/public-agent-pm.ts scripts/public-agent-dispatcher.ts scripts/public-agent-control.ts scripts/public-agent-control-files.ts scripts/public-agent-planner.ts scripts/public-agent-decision-index.ts scripts/open-autonomy-preflight.ts scripts/open-autonomy-governance-report.ts scripts/open-autonomy-upgrade.ts scripts/open-autonomy-proof-audit.ts scripts/testbed-seed-issues.ts scripts/public-agent-decision.test.ts scripts/github-agent-session.test.ts scripts/github-agent-publish.test.ts scripts/public-agent-triage.test.ts scripts/public-agent-control.test.ts scripts/public-agent-production.test.ts scripts/public-agent-planner.test.ts",
    "testbed:seed": "bun scripts/testbed-seed-issues.ts",
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
/bin/bash -c "sed -n '1,220p' examples/library/package.json" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
{
  "name": "open-autonomy-library-example",
  "private": true,
  "type": "module",
  "packageManager": "bun@1.3.10",
  "scripts": {
    "check": "bun test src/*.test.ts && bun run check:public-agent && bun run check:proof",
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
/bin/bash -c "sed -n '1,220p' scripts/public-agent-control.ts" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
#!/usr/bin/env bun

export type AgentControlVerb = 'pause' | 'resume' | 'cancel' | 'retry' | 'status';
export type AgentControlScope = 'issue' | 'repo';

export interface AgentStatusSummaryInput {
  issue: { number?: number; labels?: Array<{ name?: string }> };
  openPr?: { number?: number; url?: string; headRefName?: string } | null;
  runs?: Array<{ databaseId?: number; status?: string; conclusion?: string; url?: string }>;
  proxyRuns?: Record<string, { repo?: string; issue?: number; actor?: string; active?: boolean }>;
  repoPaused?: boolean;
  decisionIndex?: {
    issues?: Array<{
      issue?: number;
      latest_decision?: { stage?: string; decision?: string; reason?: string; next_action?: string; created_at?: string };
      latest_pr?: number;
    }>;
  };
}

export interface AgentStatusSummary {
  issue: number | null;
  paused: boolean;
  repo_paused: boolean;
  blocking_labels: string[];
  open_pr: number | null;
  active_workflow_runs: number;
  active_proxy_runs: string[];
  latest_decision: null | {
    stage?: string;
    decision?: string;
    reason?: string;
    next_action?: string;
    created_at?: string;
  };
}

export function parseControlScope(raw: string): AgentControlScope {
  return /\b(repo|repository|global)\b/i.test(raw) ? 'repo' : 'issue';
}

export function summarizeAgentStatus(input: AgentStatusSummaryInput): AgentStatusSummary {
  const labels = (input.issue.labels ?? []).map((label) => (label.name ?? '').toLowerCase()).filter(Boolean);
  const blocking = labels.filter((label) => ['agent-paused', 'agent-blocked', 'human-required', 'security'].includes(label));
  const activeWorkflowRuns = (input.runs ?? []).filter((run) => isActiveRunStatus(run.status)).length;
  const issueNumber = input.issue.number ?? null;
  const activeProxyRuns = Object.entries(input.proxyRuns ?? {})
    .filter(([, run]) => run.active && run.issue === issueNumber)
    .map(([runId]) => runId)
    .sort();
  const indexedIssue = input.decisionIndex?.issues?.find((item) => item.issue === issueNumber);
  return {
    issue: issueNumber,
    paused: labels.includes('agent-paused'),
    repo_paused: input.repoPaused ?? false,
    blocking_labels: blocking,
    open_pr: input.openPr?.number ?? indexedIssue?.latest_pr ?? null,
    active_workflow_runs: activeWorkflowRuns,
    active_proxy_runs: activeProxyRuns,
    latest_decision: indexedIssue?.latest_decision ?? null,
  };
}

export function renderStatusComment(summary: AgentStatusSummary): string {
  const lines = [
    `Agent status for issue #${summary.issue ?? 'unknown'}:`,
    `- repo paused: ${summary.repo_paused ? 'yes' : 'no'}`,
    `- issue paused: ${summary.paused ? 'yes' : 'no'}`,
    `- blocking labels: ${summary.blocking_labels.length ? summary.blocking_labels.join(', ') : 'none'}`,
    `- open agent PR: ${summary.open_pr ? `#${summary.open_pr}` : 'none'}`,
    `- active workflow runs: ${summary.active_workflow_runs}`,
    `- active proxy runs: ${summary.active_proxy_runs.length ? summary.active_proxy_runs.join(', ') : 'none'}`,
  ];
  if (summary.latest_decision) {
    lines.push(`- latest indexed decision: ${summary.latest_decision.stage ?? 'unknown'}:${summary.latest_decision.decision ?? 'unknown'}`);
    if (summary.latest_decision.next_action) lines.push(`- latest indexed next action: ${summary.latest_decision.next_action}`);
  }
  return lines.join('\n');
}

function isActiveRunStatus(status: string | undefined): boolean {
  return status === 'queued' || status === 'in_progress' || status === 'waiting' || status === 'requested';
}

exec
/bin/bash -c "sed -n '1,220p' scripts/open-autonomy-fleet.test.ts" in /home/runner/work/open-autonomy/open-autonomy
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
/bin/bash -c "sed -n '1,220p' scripts/public-agent-planner.test.ts" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
import { describe, expect, test } from 'bun:test';
import { buildDecisionIndex } from './public-agent-decision-index.js';
import { makeDecision } from './public-agent-decision.js';
import { readControlFileContext, renderControlFilePrompt } from './public-agent-control-files.js';
import { parseRoadmapItems, planRoadmapIssues } from './public-agent-planner.js';
import { renderReviewPrompt } from './public-agent-review.js';

const roadmap = `
schema: open-autonomy.roadmap.v1
items:
  - id: pm-proactive-backlog
    phase: 3
    priority: high
    status: active
    title: PM Operations And Backlog Policy
    proof_gate: pm-open-pr-review
    acceptance:
      - PM routes existing agent PRs to review.
      - PM comments visible wait states.
  - id: complete-item
    phase: 4
    priority: low
    status: done
    title: Already Complete
    proof_gate: complete-proof
    acceptance:
      - Nothing left.
`;

describe('open autonomy planner and control files', () => {
  test('loads root control files into prompt context', () => {
    const context = readControlFileContext('.');
    expect(context.sources).toContain('AGENTS.md');
    expect(context.sources).toContain('.open-autonomy/constitution.md');
    expect(context.sources).toContain('.open-autonomy/review-rubric.yml');
    const prompt = renderControlFilePrompt(context);
    expect(prompt).toContain('Open Autonomy Constitution');
    expect(prompt).toContain('review-rubric.yml');
  });

  test('review prompt includes control-file context', () => {
    const prompt = renderReviewPrompt('diff --git a/docs/x b/docs/x', '{"decision":"pass"}', 'constitution: stay scoped');
    expect(prompt).toContain('Control files:');
    expect(prompt).toContain('constitution: stay scoped');
  });

  test('planner creates missing active roadmap issues and skips done items', () => {
    const items = parseRoadmapItems(roadmap);
    const actions = planRoadmapIssues(items, []);
    expect(actions).toHaveLength(1);
    expect(actions[0]?.action).toBe('create');
    expect(actions[0]?.title).toContain('[roadmap:pm-proactive-backlog]');
    expect(actions[0]?.labels).toContain('origin:roadmap-planner');
    expect(actions[0]?.body).toContain('Proof gate: `pm-open-pr-review`');
  });

  test('planner updates existing roadmap issues that are missing labels', () => {
    const [item] = parseRoadmapItems(roadmap);
    const [action] = planRoadmapIssues([item!], [{ number: 10, title: '[roadmap:pm-proactive-backlog] PM Operations', body: 'old', labels: [] }]);
    expect(action?.action).toBe('update');
    expect(action?.issue_number).toBe(10);
  });

  test('planner dedupes existing roadmap issues with proof labels', () => {
    const [item] = parseRoadmapItems(roadmap);
    const [action] = planRoadmapIssues([item!], [{
      number: 11,
      title: 'Custom title',
      body: 'Proof gate: `pm-open-pr-review`',
      labels: [
        { name: 'roadmap:phase-3' },
        { name: 'priority:high' },
        { name: 'origin:roadmap-planner' },
        { name: 'proof:pm-open-pr-review' },
      ],
    }]);
    expect(action?.action).toBe('skip');
  });

  test('decision index reconstructs latest state by issue and stage', () => {
    const first = makeDecision({
      stage: 'pm_triage',
      issue: 7,
      actor: 'planner',
      decision: 'develop',
      next_action: 'develop',
    }, new Date('2026-06-16T10:00:00Z'));
    const second = makeDecision({
      stage: 'merge_gate',
      issue: 7,
      pr: 8,
      actor: 'merge-gate',
      decision: 'merge',
      next_action: 'close',
    }, new Date('2026-06-16T10:05:00Z'));
    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
    expect(index.decisions).toBe(2);
    expect(index.issues[0]?.latest_pr).toBe(8);
    expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
    expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
  });
});

exec
/bin/bash -c "sed -n '140,220p' examples/testbed/scripts/testbed-seed-issues.ts" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
    ].join('\n'),
  },
  {
    id: 'planner-creates-proof-gate-issues',
    title: '[oa-test:planner-creates-proof-gate-issues] Planner should create missing roadmap issues',
    labels: ['manual-operator-test'],
    body: [
      'Run the Open Autonomy Planner workflow against `.open-autonomy/roadmap.yml`.',
      '',
      'Expected result:',
      '- Missing active roadmap items get issues labeled `origin:roadmap-planner`.',
      '- Existing proof-gate issues are updated or skipped, not duplicated.',
      '- The workflow artifact contains the planner decision plan.',
    ].join('\n'),
  },
  {
    id: 'decision-memory-smoke',
    title: '[oa-test:decision-memory-smoke] Decision index should reconstruct state',
    labels: ['manual-operator-test'],
    body: [
      'Run the decision-index script after several agent decisions exist.',
      '',
      'Expected result:',
      '- The generated index summarizes latest state by issue.',
      '- Latest PR, stage, risk, and next action are reconstructed from committed decisions.',
    ].join('\n'),
  },
  {
    id: 'governance-maintainer-hold',
    title: '[oa-test:governance-maintainer-hold] Maintainer hold should stop auto-merge',
    labels: ['manual-operator-test'],
    body: [
      'Create an agent PR and add a maintainer hold comment such as `do not merge`.',
      '',
      'Expected result:',
      '- CI and review may pass.',
      '- Merge gate returns human_required because of the maintainer blocker.',
      '- The PR is not auto-merged until the hold is cleared.',
    ].join('\n'),
  },
];

interface Options {
  apply: boolean;
  all: boolean;
  repo: string;
  scenarioIds: string[];
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const scenarioIds = argv
    .filter((arg, index) => argv[index - 1] === '--scenario')
    .flatMap((arg) => arg.split(',').map((item) => item.trim()).filter(Boolean));
  return {
    apply: argv.includes('--apply'),
    all: argv.includes('--all'),
    repo: value('--repo') ?? 'volter-ai/open-autonomy-testbed',
    scenarioIds,
  };
}

function selectedScenarios(options: Options): Scenario[] {
  if (options.all || options.scenarioIds.length === 0) return scenarios;
  const known = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  return options.scenarioIds.map((id) => {
    const scenario = known.get(id);
    if (!scenario) {
      throw new Error(`Unknown scenario "${id}". Known scenarios: ${scenarios.map((item) => item.id).join(', ')}`);
    }
    return scenario;
  });
}

async function runGh(args: string[], input?: string): Promise<string> {
  const proc = Bun.spawn(['gh', ...args], {
    stdin: input ? 'pipe' : 'ignore',
    stdout: 'pipe',

exec
/bin/bash -c "sed -n '140,220p' examples/small-app/scripts/testbed-seed-issues.ts" in /home/runner/work/open-autonomy/open-autonomy
 exited 2 in 0ms:
sed: can't read examples/small-app/scripts/testbed-seed-issues.ts: No such file or directory

exec
/bin/bash -c "rg -n \"subject:\" scripts examples/testbed examples/small-app examples/library -g'*.ts'" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
scripts/public-agent-decision.ts:98:    subject: input.subject,
scripts/public-agent-decision.ts:156:function validateSubject(subject: DecisionSubject): void {
scripts/public-agent-decision.ts:203:    subject: parseJson(value('--subject-json')),
examples/library/scripts/public-agent-decision.ts:98:    subject: input.subject,
examples/library/scripts/public-agent-decision.ts:156:function validateSubject(subject: DecisionSubject): void {
examples/library/scripts/public-agent-decision.ts:203:    subject: parseJson(value('--subject-json')),
scripts/github-agent-session.test.ts:33:      subject: { type: 'issue', number: 301, branch: 'agent/issue-301' },
examples/library/scripts/github-agent-session.test.ts:33:      subject: { type: 'issue', number: 301, branch: 'agent/issue-301' },
scripts/github-agent-session.ts:258:    subject: { type: 'issue', number: issueNumber, branch: `agent/issue-${issueNumber}` },
examples/testbed/scripts/public-agent-decision.ts:98:    subject: input.subject,
examples/testbed/scripts/public-agent-decision.ts:156:function validateSubject(subject: DecisionSubject): void {
examples/testbed/scripts/public-agent-decision.ts:203:    subject: parseJson(value('--subject-json')),
examples/library/scripts/github-agent-session.ts:258:    subject: { type: 'issue', number: issueNumber, branch: `agent/issue-${issueNumber}` },
examples/testbed/scripts/github-agent-session.test.ts:33:      subject: { type: 'issue', number: 301, branch: 'agent/issue-301' },
scripts/public-agent-decision.test.ts:19:      subject: { type: 'issue', number: 7, branch: 'agent/issue-7' },
examples/library/scripts/public-agent-decision.test.ts:19:      subject: { type: 'issue', number: 7, branch: 'agent/issue-7' },
examples/testbed/scripts/github-agent-session.ts:258:    subject: { type: 'issue', number: issueNumber, branch: `agent/issue-${issueNumber}` },
examples/testbed/scripts/public-agent-decision.test.ts:19:      subject: { type: 'issue', number: 7, branch: 'agent/issue-7' },
examples/small-app/scripts/public-agent-decision.ts:98:    subject: input.subject,
examples/small-app/scripts/public-agent-decision.ts:156:function validateSubject(subject: DecisionSubject): void {
examples/small-app/scripts/public-agent-decision.ts:203:    subject: parseJson(value('--subject-json')),
examples/small-app/scripts/github-agent-session.test.ts:33:      subject: { type: 'issue', number: 301, branch: 'agent/issue-301' },
examples/small-app/scripts/github-agent-session.ts:258:    subject: { type: 'issue', number: issueNumber, branch: `agent/issue-${issueNumber}` },
examples/small-app/scripts/public-agent-decision.test.ts:19:      subject: { type: 'issue', number: 7, branch: 'agent/issue-7' },

exec
/bin/bash -c "rg -n \"makeDecision\\(\" scripts examples/testbed examples/small-app examples/library -g'*.ts'" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
scripts/public-agent-planner.test.ts:81:    const first = makeDecision({
scripts/public-agent-planner.test.ts:88:    const second = makeDecision({
examples/library/scripts/public-agent-planner.test.ts:81:    const first = makeDecision({
examples/library/scripts/public-agent-planner.test.ts:88:    const second = makeDecision({
scripts/public-agent-decision.ts:87:export function makeDecision(input: DecisionInput, now = new Date()): AgentDecision {
scripts/public-agent-decision.ts:237:  const decision = makeDecision(input, createdAt ? new Date(createdAt) : new Date());
scripts/github-agent-session.test.ts:28:    writeDecision(preDecisionDir, makeDecision({
examples/testbed/scripts/public-agent-planner.test.ts:81:    const first = makeDecision({
examples/testbed/scripts/public-agent-planner.test.ts:88:    const second = makeDecision({
examples/library/scripts/public-agent-decision.ts:87:export function makeDecision(input: DecisionInput, now = new Date()): AgentDecision {
examples/library/scripts/public-agent-decision.ts:237:  const decision = makeDecision(input, createdAt ? new Date(createdAt) : new Date());
examples/library/scripts/github-agent-session.test.ts:28:    writeDecision(preDecisionDir, makeDecision({
examples/testbed/scripts/public-agent-decision.ts:87:export function makeDecision(input: DecisionInput, now = new Date()): AgentDecision {
examples/testbed/scripts/public-agent-decision.ts:237:  const decision = makeDecision(input, createdAt ? new Date(createdAt) : new Date());
examples/small-app/scripts/public-agent-planner.test.ts:81:    const first = makeDecision({
examples/small-app/scripts/public-agent-planner.test.ts:88:    const second = makeDecision({
scripts/github-agent-session.ts:252:  const decisionPath = writeDecision(bundleDecisions, makeDecision({
scripts/github-agent-session.ts:350:  const decisionPath = writeDecision(decisionsDir, makeDecision({
examples/testbed/scripts/github-agent-session.test.ts:28:    writeDecision(preDecisionDir, makeDecision({
examples/small-app/scripts/public-agent-decision.ts:87:export function makeDecision(input: DecisionInput, now = new Date()): AgentDecision {
examples/small-app/scripts/public-agent-decision.ts:237:  const decision = makeDecision(input, createdAt ? new Date(createdAt) : new Date());
examples/library/scripts/github-agent-session.ts:252:  const decisionPath = writeDecision(bundleDecisions, makeDecision({
examples/library/scripts/github-agent-session.ts:350:  const decisionPath = writeDecision(decisionsDir, makeDecision({
scripts/open-autonomy-fleet.test.ts:33:      makeDecision({
scripts/open-autonomy-fleet.test.ts:54:      makeDecision({
examples/small-app/scripts/github-agent-session.test.ts:28:    writeDecision(preDecisionDir, makeDecision({
examples/testbed/scripts/github-agent-session.ts:252:  const decisionPath = writeDecision(bundleDecisions, makeDecision({
examples/testbed/scripts/github-agent-session.ts:350:  const decisionPath = writeDecision(decisionsDir, makeDecision({
scripts/github-agent-publish.test.ts:38:  const decisionPath = writeDecision(join(dir, 'decisions'), makeDecision({
scripts/public-agent-decision.test.ts:12:    const decision = makeDecision({
scripts/public-agent-decision.test.ts:33:    const decision = makeDecision({
examples/library/scripts/open-autonomy-fleet.test.ts:33:      makeDecision({
examples/library/scripts/open-autonomy-fleet.test.ts:54:      makeDecision({
examples/small-app/scripts/github-agent-session.ts:252:  const decisionPath = writeDecision(bundleDecisions, makeDecision({
examples/small-app/scripts/github-agent-session.ts:350:  const decisionPath = writeDecision(decisionsDir, makeDecision({
examples/library/scripts/github-agent-publish.test.ts:38:  const decisionPath = writeDecision(join(dir, 'decisions'), makeDecision({
examples/testbed/scripts/open-autonomy-fleet.test.ts:33:      makeDecision({
examples/testbed/scripts/open-autonomy-fleet.test.ts:54:      makeDecision({
examples/library/scripts/public-agent-decision.test.ts:12:    const decision = makeDecision({
examples/library/scripts/public-agent-decision.test.ts:33:    const decision = makeDecision({
examples/testbed/scripts/github-agent-publish.test.ts:38:  const decisionPath = writeDecision(join(dir, 'decisions'), makeDecision({
examples/small-app/scripts/public-agent-decision.test.ts:12:    const decision = makeDecision({
examples/small-app/scripts/public-agent-decision.test.ts:33:    const decision = makeDecision({
examples/testbed/scripts/public-agent-decision.test.ts:12:    const decision = makeDecision({
examples/testbed/scripts/public-agent-decision.test.ts:33:    const decision = makeDecision({
examples/small-app/scripts/open-autonomy-fleet.test.ts:33:      makeDecision({
examples/small-app/scripts/open-autonomy-fleet.test.ts:54:      makeDecision({
examples/small-app/scripts/github-agent-publish.test.ts:38:  const decisionPath = writeDecision(join(dir, 'decisions'), makeDecision({

codex
I’ve confirmed the decision records already carry richer subject metadata than the index currently exposes. I’m checking the session publisher paths now so I can derive PR, retry, and merge state from the records rather than inventing new inputs.
exec
/bin/bash -c "sed -n '220,420p' scripts/github-agent-session.ts" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
    status: exitCode === 0 && artifact ? 'pr-ready' : 'blocked',
    exitCode,
  });

  if (!existsSync(sessionPath)) throw new Error('agent session did not emit session.json');

  const session = readJson(sessionPath) as { status?: string; issue?: { number?: number } };
  const status = session.status === 'pr-ready' ? 'pr-ready' : session.status === 'blocked' ? 'blocked' : 'failed';
  const issueNumber = Number(session.issue?.number ?? (readJson(resolve(root, options.issue)) as { number: number }).number);

  const copiedArtifactRels = copyTree(join(taskDir, 'artifacts'), bundleArtifacts).map((rel) => `artifacts/${rel}`);
  const artifactRels = promoteWebpEvidence(bundleDir, copiedArtifactRels);
  const bundleSession = join(bundleDir, 'session.json');
  const bundleReceipt = join(bundleDir, 'run-receipt.json');
  const bundleTranscript = join(bundleDir, 'transcript.md');
  writeFileSync(bundleSession, readFileSync(sessionPath));
  writeRunReceipt(bundleReceipt, {
    runId: options.runId,
    repo: options.repoName,
    issue: issueNumber,
    actor: options.actor,
    status,
    startedAt,
    completedAt,
    exitCode,
    artifacts: artifactRels,
  });
  const artifactTranscript = join(bundleDir, 'artifacts', 'transcript.md');
  if (existsSync(artifactTranscript)) writeFileSync(bundleTranscript, readFileSync(artifactTranscript));
  const patchPath = join(bundleDir, 'changes.patch');
  writePatch(options.repo, patchPath);
  const preDecisionRels = copyPreDecisions(bundleDecisions);
  const decisionPath = writeDecision(bundleDecisions, makeDecision({
    stage: 'develop',
    issue: issueNumber,
    run_id: options.runId,
    actor: options.actor,
    decision: status,
    subject: { type: 'issue', number: issueNumber, branch: `agent/issue-${issueNumber}` },
    evidence: [
      'session:session.json',
      'patch:changes.patch',
      ...artifactRels.map((rel) => `artifact:${rel}`),
    ],
    next_action: status === 'pr-ready' ? 'publish' : 'escalate',
  }));
  const decisionRels = [...preDecisionRels, relative(bundleDir, decisionPath)];

  try {
    assertNoRealLookingSecrets([
      bundleSession,
      bundleReceipt,
      ...(existsSync(bundleTranscript) ? [bundleTranscript] : []),
      patchPath,
      ...decisionRels.map((rel) => join(bundleDir, rel)),
      ...artifactRels.map((rel) => join(bundleDir, rel)),
    ]);
  } catch (error) {
    writeBlockedBundle({
      bundleDir,
      runId: options.runId,
      repo: options.repoName,
      issue: issueNumber,
      actor: options.actor,
      reason: error instanceof Error ? error.message : String(error),
    });
    process.stdout.write(`agent-bundle=${bundleDir}\n`);
    process.exit(0);
  }

  const manifest: AgentBundleManifest = {
    schema_version: 1,
    run_id: options.runId,
    repo: options.repoName,
    open_autonomy: {
      version: OPEN_AUTONOMY_VERSION,
      profile: process.env.OPEN_AUTONOMY_PROFILE || process.env.PUBLIC_AGENT_PROFILE || 'default',
    },
    issue: issueNumber,
    actor: options.actor,
    status,
    created_at: new Date().toISOString(),
    session: basename(bundleSession),
    run_receipt: basename(bundleReceipt),
    transcript: existsSync(bundleTranscript) ? basename(bundleTranscript) : undefined,
    patch: basename(patchPath),
    decisions: decisionRels,
    artifacts: artifactRels,
    evidence: detectEvidence(artifactRels),
  };
  writeJson(join(bundleDir, 'manifest.json'), manifest);
  process.stdout.write(`agent-bundle=${bundleDir}\n`);
  process.exit(exitCode === 0 || status === 'blocked' ? 0 : 1);
}

function writeBlockedBundle(input: {
  bundleDir: string;
  runId: string;
  repo: string;
  issue: number;
  actor: string;
  reason: string;
}): void {
  rmSync(input.bundleDir, { recursive: true, force: true });
  const artifactsDir = join(input.bundleDir, 'artifacts');
  const decisionsDir = join(input.bundleDir, 'decisions');
  mkdirSync(artifactsDir, { recursive: true });
  mkdirSync(decisionsDir, { recursive: true });

  const sessionPath = join(input.bundleDir, 'session.json');
  const patchPath = join(input.bundleDir, 'changes.patch');
  writeJson(sessionPath, {
    status: 'blocked',
    issue: { number: input.issue },
    reason: 'public evidence secret scan failed',
    failure_signature: input.reason,
  });
  writeRunReceipt(join(input.bundleDir, 'run-receipt.json'), {
    runId: input.runId,
    repo: input.repo,
    issue: input.issue,
    actor: input.actor,
    status: 'blocked',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    exitCode: 1,
    artifacts: [],
  });
  writeFileSync(patchPath, '');

  const decisionPath = writeDecision(decisionsDir, makeDecision({
    stage: 'develop',
    issue: input.issue,
    run_id: input.runId,
    actor: input.actor,
    decision: 'blocked',
    reason: 'public evidence secret scan failed',
    failure_signature: input.reason,
    evidence: ['session:session.json'],
    next_action: 'escalate',
  }));
  const decisionRels = [relative(input.bundleDir, decisionPath)];
  const manifest: AgentBundleManifest = {
    schema_version: 1,
    run_id: input.runId,
    repo: input.repo,
    open_autonomy: {
      version: OPEN_AUTONOMY_VERSION,
      profile: process.env.OPEN_AUTONOMY_PROFILE || process.env.PUBLIC_AGENT_PROFILE || 'default',
    },
    issue: input.issue,
    actor: input.actor,
    status: 'blocked',
    created_at: new Date().toISOString(),
    session: basename(sessionPath),
    run_receipt: 'run-receipt.json',
    patch: basename(patchPath),
    decisions: decisionRels,
    artifacts: [],
    evidence: [],
  };
  writeJson(join(input.bundleDir, 'manifest.json'), manifest);
  assertNoRealLookingSecrets([
    sessionPath,
    join(input.bundleDir, 'run-receipt.json'),
    patchPath,
    ...decisionRels.map((rel) => join(input.bundleDir, rel)),
  ]);
}

function readOptionalText(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  return readFileSync(path, 'utf8');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

exec
/bin/bash -c "sed -n '220,420p' examples/testbed/scripts/github-agent-session.ts" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
    status: exitCode === 0 && artifact ? 'pr-ready' : 'blocked',
    exitCode,
  });

  if (!existsSync(sessionPath)) throw new Error('agent session did not emit session.json');

  const session = readJson(sessionPath) as { status?: string; issue?: { number?: number } };
  const status = session.status === 'pr-ready' ? 'pr-ready' : session.status === 'blocked' ? 'blocked' : 'failed';
  const issueNumber = Number(session.issue?.number ?? (readJson(resolve(root, options.issue)) as { number: number }).number);

  const copiedArtifactRels = copyTree(join(taskDir, 'artifacts'), bundleArtifacts).map((rel) => `artifacts/${rel}`);
  const artifactRels = promoteWebpEvidence(bundleDir, copiedArtifactRels);
  const bundleSession = join(bundleDir, 'session.json');
  const bundleReceipt = join(bundleDir, 'run-receipt.json');
  const bundleTranscript = join(bundleDir, 'transcript.md');
  writeFileSync(bundleSession, readFileSync(sessionPath));
  writeRunReceipt(bundleReceipt, {
    runId: options.runId,
    repo: options.repoName,
    issue: issueNumber,
    actor: options.actor,
    status,
    startedAt,
    completedAt,
    exitCode,
    artifacts: artifactRels,
  });
  const artifactTranscript = join(bundleDir, 'artifacts', 'transcript.md');
  if (existsSync(artifactTranscript)) writeFileSync(bundleTranscript, readFileSync(artifactTranscript));
  const patchPath = join(bundleDir, 'changes.patch');
  writePatch(options.repo, patchPath);
  const preDecisionRels = copyPreDecisions(bundleDecisions);
  const decisionPath = writeDecision(bundleDecisions, makeDecision({
    stage: 'develop',
    issue: issueNumber,
    run_id: options.runId,
    actor: options.actor,
    decision: status,
    subject: { type: 'issue', number: issueNumber, branch: `agent/issue-${issueNumber}` },
    evidence: [
      'session:session.json',
      'patch:changes.patch',
      ...artifactRels.map((rel) => `artifact:${rel}`),
    ],
    next_action: status === 'pr-ready' ? 'publish' : 'escalate',
  }));
  const decisionRels = [...preDecisionRels, relative(bundleDir, decisionPath)];

  try {
    assertNoRealLookingSecrets([
      bundleSession,
      bundleReceipt,
      ...(existsSync(bundleTranscript) ? [bundleTranscript] : []),
      patchPath,
      ...decisionRels.map((rel) => join(bundleDir, rel)),
      ...artifactRels.map((rel) => join(bundleDir, rel)),
    ]);
  } catch (error) {
    writeBlockedBundle({
      bundleDir,
      runId: options.runId,
      repo: options.repoName,
      issue: issueNumber,
      actor: options.actor,
      reason: error instanceof Error ? error.message : String(error),
    });
    process.stdout.write(`agent-bundle=${bundleDir}\n`);
    process.exit(0);
  }

  const manifest: AgentBundleManifest = {
    schema_version: 1,
    run_id: options.runId,
    repo: options.repoName,
    open_autonomy: {
      version: OPEN_AUTONOMY_VERSION,
      profile: process.env.OPEN_AUTONOMY_PROFILE || process.env.PUBLIC_AGENT_PROFILE || 'default',
    },
    issue: issueNumber,
    actor: options.actor,
    status,
    created_at: new Date().toISOString(),
    session: basename(bundleSession),
    run_receipt: basename(bundleReceipt),
    transcript: existsSync(bundleTranscript) ? basename(bundleTranscript) : undefined,
    patch: basename(patchPath),
    decisions: decisionRels,
    artifacts: artifactRels,
    evidence: detectEvidence(artifactRels),
  };
  writeJson(join(bundleDir, 'manifest.json'), manifest);
  process.stdout.write(`agent-bundle=${bundleDir}\n`);
  process.exit(exitCode === 0 || status === 'blocked' ? 0 : 1);
}

function writeBlockedBundle(input: {
  bundleDir: string;
  runId: string;
  repo: string;
  issue: number;
  actor: string;
  reason: string;
}): void {
  rmSync(input.bundleDir, { recursive: true, force: true });
  const artifactsDir = join(input.bundleDir, 'artifacts');
  const decisionsDir = join(input.bundleDir, 'decisions');
  mkdirSync(artifactsDir, { recursive: true });
  mkdirSync(decisionsDir, { recursive: true });

  const sessionPath = join(input.bundleDir, 'session.json');
  const patchPath = join(input.bundleDir, 'changes.patch');
  writeJson(sessionPath, {
    status: 'blocked',
    issue: { number: input.issue },
    reason: 'public evidence secret scan failed',
    failure_signature: input.reason,
  });
  writeRunReceipt(join(input.bundleDir, 'run-receipt.json'), {
    runId: input.runId,
    repo: input.repo,
    issue: input.issue,
    actor: input.actor,
    status: 'blocked',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    exitCode: 1,
    artifacts: [],
  });
  writeFileSync(patchPath, '');

  const decisionPath = writeDecision(decisionsDir, makeDecision({
    stage: 'develop',
    issue: input.issue,
    run_id: input.runId,
    actor: input.actor,
    decision: 'blocked',
    reason: 'public evidence secret scan failed',
    failure_signature: input.reason,
    evidence: ['session:session.json'],
    next_action: 'escalate',
  }));
  const decisionRels = [relative(input.bundleDir, decisionPath)];
  const manifest: AgentBundleManifest = {
    schema_version: 1,
    run_id: input.runId,
    repo: input.repo,
    open_autonomy: {
      version: OPEN_AUTONOMY_VERSION,
      profile: process.env.OPEN_AUTONOMY_PROFILE || process.env.PUBLIC_AGENT_PROFILE || 'default',
    },
    issue: input.issue,
    actor: input.actor,
    status: 'blocked',
    created_at: new Date().toISOString(),
    session: basename(sessionPath),
    run_receipt: 'run-receipt.json',
    patch: basename(patchPath),
    decisions: decisionRels,
    artifacts: [],
    evidence: [],
  };
  writeJson(join(input.bundleDir, 'manifest.json'), manifest);
  assertNoRealLookingSecrets([
    sessionPath,
    join(input.bundleDir, 'run-receipt.json'),
    patchPath,
    ...decisionRels.map((rel) => join(input.bundleDir, rel)),
  ]);
}

function readOptionalText(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  return readFileSync(path, 'utf8');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

exec
/bin/bash -c "sed -n '220,420p' examples/small-app/scripts/github-agent-session.ts" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
    status: exitCode === 0 && artifact ? 'pr-ready' : 'blocked',
    exitCode,
  });

  if (!existsSync(sessionPath)) throw new Error('agent session did not emit session.json');

  const session = readJson(sessionPath) as { status?: string; issue?: { number?: number } };
  const status = session.status === 'pr-ready' ? 'pr-ready' : session.status === 'blocked' ? 'blocked' : 'failed';
  const issueNumber = Number(session.issue?.number ?? (readJson(resolve(root, options.issue)) as { number: number }).number);

  const copiedArtifactRels = copyTree(join(taskDir, 'artifacts'), bundleArtifacts).map((rel) => `artifacts/${rel}`);
  const artifactRels = promoteWebpEvidence(bundleDir, copiedArtifactRels);
  const bundleSession = join(bundleDir, 'session.json');
  const bundleReceipt = join(bundleDir, 'run-receipt.json');
  const bundleTranscript = join(bundleDir, 'transcript.md');
  writeFileSync(bundleSession, readFileSync(sessionPath));
  writeRunReceipt(bundleReceipt, {
    runId: options.runId,
    repo: options.repoName,
    issue: issueNumber,
    actor: options.actor,
    status,
    startedAt,
    completedAt,
    exitCode,
    artifacts: artifactRels,
  });
  const artifactTranscript = join(bundleDir, 'artifacts', 'transcript.md');
  if (existsSync(artifactTranscript)) writeFileSync(bundleTranscript, readFileSync(artifactTranscript));
  const patchPath = join(bundleDir, 'changes.patch');
  writePatch(options.repo, patchPath);
  const preDecisionRels = copyPreDecisions(bundleDecisions);
  const decisionPath = writeDecision(bundleDecisions, makeDecision({
    stage: 'develop',
    issue: issueNumber,
    run_id: options.runId,
    actor: options.actor,
    decision: status,
    subject: { type: 'issue', number: issueNumber, branch: `agent/issue-${issueNumber}` },
    evidence: [
      'session:session.json',
      'patch:changes.patch',
      ...artifactRels.map((rel) => `artifact:${rel}`),
    ],
    next_action: status === 'pr-ready' ? 'publish' : 'escalate',
  }));
  const decisionRels = [...preDecisionRels, relative(bundleDir, decisionPath)];

  try {
    assertNoRealLookingSecrets([
      bundleSession,
      bundleReceipt,
      ...(existsSync(bundleTranscript) ? [bundleTranscript] : []),
      patchPath,
      ...decisionRels.map((rel) => join(bundleDir, rel)),
      ...artifactRels.map((rel) => join(bundleDir, rel)),
    ]);
  } catch (error) {
    writeBlockedBundle({
      bundleDir,
      runId: options.runId,
      repo: options.repoName,
      issue: issueNumber,
      actor: options.actor,
      reason: error instanceof Error ? error.message : String(error),
    });
    process.stdout.write(`agent-bundle=${bundleDir}\n`);
    process.exit(0);
  }

  const manifest: AgentBundleManifest = {
    schema_version: 1,
    run_id: options.runId,
    repo: options.repoName,
    open_autonomy: {
      version: OPEN_AUTONOMY_VERSION,
      profile: process.env.OPEN_AUTONOMY_PROFILE || process.env.PUBLIC_AGENT_PROFILE || 'default',
    },
    issue: issueNumber,
    actor: options.actor,
    status,
    created_at: new Date().toISOString(),
    session: basename(bundleSession),
    run_receipt: basename(bundleReceipt),
    transcript: existsSync(bundleTranscript) ? basename(bundleTranscript) : undefined,
    patch: basename(patchPath),
    decisions: decisionRels,
    artifacts: artifactRels,
    evidence: detectEvidence(artifactRels),
  };
  writeJson(join(bundleDir, 'manifest.json'), manifest);
  process.stdout.write(`agent-bundle=${bundleDir}\n`);
  process.exit(exitCode === 0 || status === 'blocked' ? 0 : 1);
}

function writeBlockedBundle(input: {
  bundleDir: string;
  runId: string;
  repo: string;
  issue: number;
  actor: string;
  reason: string;
}): void {
  rmSync(input.bundleDir, { recursive: true, force: true });
  const artifactsDir = join(input.bundleDir, 'artifacts');
  const decisionsDir = join(input.bundleDir, 'decisions');
  mkdirSync(artifactsDir, { recursive: true });
  mkdirSync(decisionsDir, { recursive: true });

  const sessionPath = join(input.bundleDir, 'session.json');
  const patchPath = join(input.bundleDir, 'changes.patch');
  writeJson(sessionPath, {
    status: 'blocked',
    issue: { number: input.issue },
    reason: 'public evidence secret scan failed',
    failure_signature: input.reason,
  });
  writeRunReceipt(join(input.bundleDir, 'run-receipt.json'), {
    runId: input.runId,
    repo: input.repo,
    issue: input.issue,
    actor: input.actor,
    status: 'blocked',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    exitCode: 1,
    artifacts: [],
  });
  writeFileSync(patchPath, '');

  const decisionPath = writeDecision(decisionsDir, makeDecision({
    stage: 'develop',
    issue: input.issue,
    run_id: input.runId,
    actor: input.actor,
    decision: 'blocked',
    reason: 'public evidence secret scan failed',
    failure_signature: input.reason,
    evidence: ['session:session.json'],
    next_action: 'escalate',
  }));
  const decisionRels = [relative(input.bundleDir, decisionPath)];
  const manifest: AgentBundleManifest = {
    schema_version: 1,
    run_id: input.runId,
    repo: input.repo,
    open_autonomy: {
      version: OPEN_AUTONOMY_VERSION,
      profile: process.env.OPEN_AUTONOMY_PROFILE || process.env.PUBLIC_AGENT_PROFILE || 'default',
    },
    issue: input.issue,
    actor: input.actor,
    status: 'blocked',
    created_at: new Date().toISOString(),
    session: basename(sessionPath),
    run_receipt: 'run-receipt.json',
    patch: basename(patchPath),
    decisions: decisionRels,
    artifacts: [],
    evidence: [],
  };
  writeJson(join(input.bundleDir, 'manifest.json'), manifest);
  assertNoRealLookingSecrets([
    sessionPath,
    join(input.bundleDir, 'run-receipt.json'),
    patchPath,
    ...decisionRels.map((rel) => join(input.bundleDir, rel)),
  ]);
}

function readOptionalText(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  return readFileSync(path, 'utf8');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

exec
/bin/bash -c "sed -n '220,420p' examples/library/scripts/github-agent-session.ts" in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
    status: exitCode === 0 && artifact ? 'pr-ready' : 'blocked',
    exitCode,
  });

  if (!existsSync(sessionPath)) throw new Error('agent session did not emit session.json');

  const session = readJson(sessionPath) as { status?: string; issue?: { number?: number } };
  const status = session.status === 'pr-ready' ? 'pr-ready' : session.status === 'blocked' ? 'blocked' : 'failed';
  const issueNumber = Number(session.issue?.number ?? (readJson(resolve(root, options.issue)) as { number: number }).number);

  const copiedArtifactRels = copyTree(join(taskDir, 'artifacts'), bundleArtifacts).map((rel) => `artifacts/${rel}`);
  const artifactRels = promoteWebpEvidence(bundleDir, copiedArtifactRels);
  const bundleSession = join(bundleDir, 'session.json');
  const bundleReceipt = join(bundleDir, 'run-receipt.json');
  const bundleTranscript = join(bundleDir, 'transcript.md');
  writeFileSync(bundleSession, readFileSync(sessionPath));
  writeRunReceipt(bundleReceipt, {
    runId: options.runId,
    repo: options.repoName,
    issue: issueNumber,
    actor: options.actor,
    status,
    startedAt,
    completedAt,
    exitCode,
    artifacts: artifactRels,
  });
  const artifactTranscript = join(bundleDir, 'artifacts', 'transcript.md');
  if (existsSync(artifactTranscript)) writeFileSync(bundleTranscript, readFileSync(artifactTranscript));
  const patchPath = join(bundleDir, 'changes.patch');
  writePatch(options.repo, patchPath);
  const preDecisionRels = copyPreDecisions(bundleDecisions);
  const decisionPath = writeDecision(bundleDecisions, makeDecision({
    stage: 'develop',
    issue: issueNumber,
    run_id: options.runId,
    actor: options.actor,
    decision: status,
    subject: { type: 'issue', number: issueNumber, branch: `agent/issue-${issueNumber}` },
    evidence: [
      'session:session.json',
      'patch:changes.patch',
      ...artifactRels.map((rel) => `artifact:${rel}`),
    ],
    next_action: status === 'pr-ready' ? 'publish' : 'escalate',
  }));
  const decisionRels = [...preDecisionRels, relative(bundleDir, decisionPath)];

  try {
    assertNoRealLookingSecrets([
      bundleSession,
      bundleReceipt,
      ...(existsSync(bundleTranscript) ? [bundleTranscript] : []),
      patchPath,
      ...decisionRels.map((rel) => join(bundleDir, rel)),
      ...artifactRels.map((rel) => join(bundleDir, rel)),
    ]);
  } catch (error) {
    writeBlockedBundle({
      bundleDir,
      runId: options.runId,
      repo: options.repoName,
      issue: issueNumber,
      actor: options.actor,
      reason: error instanceof Error ? error.message : String(error),
    });
    process.stdout.write(`agent-bundle=${bundleDir}\n`);
    process.exit(0);
  }

  const manifest: AgentBundleManifest = {
    schema_version: 1,
    run_id: options.runId,
    repo: options.repoName,
    open_autonomy: {
      version: OPEN_AUTONOMY_VERSION,
      profile: process.env.OPEN_AUTONOMY_PROFILE || process.env.PUBLIC_AGENT_PROFILE || 'default',
    },
    issue: issueNumber,
    actor: options.actor,
    status,
    created_at: new Date().toISOString(),
    session: basename(bundleSession),
    run_receipt: basename(bundleReceipt),
    transcript: existsSync(bundleTranscript) ? basename(bundleTranscript) : undefined,
    patch: basename(patchPath),
    decisions: decisionRels,
    artifacts: artifactRels,
    evidence: detectEvidence(artifactRels),
  };
  writeJson(join(bundleDir, 'manifest.json'), manifest);
  process.stdout.write(`agent-bundle=${bundleDir}\n`);
  process.exit(exitCode === 0 || status === 'blocked' ? 0 : 1);
}

function writeBlockedBundle(input: {
  bundleDir: string;
  runId: string;
  repo: string;
  issue: number;
  actor: string;
  reason: string;
}): void {
  rmSync(input.bundleDir, { recursive: true, force: true });
  const artifactsDir = join(input.bundleDir, 'artifacts');
  const decisionsDir = join(input.bundleDir, 'decisions');
  mkdirSync(artifactsDir, { recursive: true });
  mkdirSync(decisionsDir, { recursive: true });

  const sessionPath = join(input.bundleDir, 'session.json');
  const patchPath = join(input.bundleDir, 'changes.patch');
  writeJson(sessionPath, {
    status: 'blocked',
    issue: { number: input.issue },
    reason: 'public evidence secret scan failed',
    failure_signature: input.reason,
  });
  writeRunReceipt(join(input.bundleDir, 'run-receipt.json'), {
    runId: input.runId,
    repo: input.repo,
    issue: input.issue,
    actor: input.actor,
    status: 'blocked',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    exitCode: 1,
    artifacts: [],
  });
  writeFileSync(patchPath, '');

  const decisionPath = writeDecision(decisionsDir, makeDecision({
    stage: 'develop',
    issue: input.issue,
    run_id: input.runId,
    actor: input.actor,
    decision: 'blocked',
    reason: 'public evidence secret scan failed',
    failure_signature: input.reason,
    evidence: ['session:session.json'],
    next_action: 'escalate',
  }));
  const decisionRels = [relative(input.bundleDir, decisionPath)];
  const manifest: AgentBundleManifest = {
    schema_version: 1,
    run_id: input.runId,
    repo: input.repo,
    open_autonomy: {
      version: OPEN_AUTONOMY_VERSION,
      profile: process.env.OPEN_AUTONOMY_PROFILE || process.env.PUBLIC_AGENT_PROFILE || 'default',
    },
    issue: input.issue,
    actor: input.actor,
    status: 'blocked',
    created_at: new Date().toISOString(),
    session: basename(sessionPath),
    run_receipt: 'run-receipt.json',
    patch: basename(patchPath),
    decisions: decisionRels,
    artifacts: [],
    evidence: [],
  };
  writeJson(join(input.bundleDir, 'manifest.json'), manifest);
  assertNoRealLookingSecrets([
    sessionPath,
    join(input.bundleDir, 'run-receipt.json'),
    patchPath,
    ...decisionRels.map((rel) => join(input.bundleDir, rel)),
  ]);
}

function readOptionalText(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  return readFileSync(path, 'utf8');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

ERROR: Reconnecting... 1/5
codex
I’m making the index explicitly track the latest issue, PR, retry, and merge decisions, then I’ll tighten the planner test to prove those surfaces are reconstructable from committed records.
2026-06-17T09:14:08.049396Z ERROR codex_core::tools::router: error=apply_patch verification failed: invalid patch: The last line of the patch must be '*** End Patch'
ERROR: Reconnecting... 2/5
codex
The first patch was malformed, so I’m reapplying it in smaller chunks to keep the edit atomic and avoid touching anything unrelated.
apply patch
patch: completed
/home/runner/work/open-autonomy/open-autonomy/examples/library/scripts/public-agent-decision-index.ts
/home/runner/work/open-autonomy/open-autonomy/examples/small-app/scripts/public-agent-decision-index.ts
/home/runner/work/open-autonomy/open-autonomy/examples/testbed/scripts/public-agent-decision-index.ts
/home/runner/work/open-autonomy/open-autonomy/scripts/public-agent-decision-index.ts
diff --git a/examples/library/scripts/public-agent-decision-index.ts b/examples/library/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..76497ac0a3b6069c31e4f45cf9c0002ebf2dbc63
--- a/examples/library/scripts/public-agent-decision-index.ts
+++ b/examples/library/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,19 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+      subject.latest_pr_decision = decision;
+    }
+    if (decision.stage === 'retry' || decision.attempt?.kind === 'retry') {
+      subject.latest_retry_decision = decision;
+    }
+    if (decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge') {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/small-app/scripts/public-agent-decision-index.ts b/examples/small-app/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..76497ac0a3b6069c31e4f45cf9c0002ebf2dbc63
--- a/examples/small-app/scripts/public-agent-decision-index.ts
+++ b/examples/small-app/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,19 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+      subject.latest_pr_decision = decision;
+    }
+    if (decision.stage === 'retry' || decision.attempt?.kind === 'retry') {
+      subject.latest_retry_decision = decision;
+    }
+    if (decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge') {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/testbed/scripts/public-agent-decision-index.ts b/examples/testbed/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..76497ac0a3b6069c31e4f45cf9c0002ebf2dbc63
--- a/examples/testbed/scripts/public-agent-decision-index.ts
+++ b/examples/testbed/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,19 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+      subject.latest_pr_decision = decision;
+    }
+    if (decision.stage === 'retry' || decision.attempt?.kind === 'retry') {
+      subject.latest_retry_decision = decision;
+    }
+    if (decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge') {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/scripts/public-agent-decision-index.ts b/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..76497ac0a3b6069c31e4f45cf9c0002ebf2dbc63
--- a/scripts/public-agent-decision-index.ts
+++ b/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,19 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+      subject.latest_pr_decision = decision;
+    }
+    if (decision.stage === 'retry' || decision.attempt?.kind === 'retry') {
+      subject.latest_retry_decision = decision;
+    }
+    if (decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge') {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;

diff --git a/examples/library/scripts/public-agent-decision-index.ts b/examples/library/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..76497ac0a3b6069c31e4f45cf9c0002ebf2dbc63
--- a/examples/library/scripts/public-agent-decision-index.ts
+++ b/examples/library/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,19 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+      subject.latest_pr_decision = decision;
+    }
+    if (decision.stage === 'retry' || decision.attempt?.kind === 'retry') {
+      subject.latest_retry_decision = decision;
+    }
+    if (decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge') {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/small-app/scripts/public-agent-decision-index.ts b/examples/small-app/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..76497ac0a3b6069c31e4f45cf9c0002ebf2dbc63
--- a/examples/small-app/scripts/public-agent-decision-index.ts
+++ b/examples/small-app/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,19 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+      subject.latest_pr_decision = decision;
+    }
+    if (decision.stage === 'retry' || decision.attempt?.kind === 'retry') {
+      subject.latest_retry_decision = decision;
+    }
+    if (decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge') {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/testbed/scripts/public-agent-decision-index.ts b/examples/testbed/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..76497ac0a3b6069c31e4f45cf9c0002ebf2dbc63
--- a/examples/testbed/scripts/public-agent-decision-index.ts
+++ b/examples/testbed/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,19 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+      subject.latest_pr_decision = decision;
+    }
+    if (decision.stage === 'retry' || decision.attempt?.kind === 'retry') {
+      subject.latest_retry_decision = decision;
+    }
+    if (decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge') {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/scripts/public-agent-decision-index.ts b/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..76497ac0a3b6069c31e4f45cf9c0002ebf2dbc63
--- a/scripts/public-agent-decision-index.ts
+++ b/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,19 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+      subject.latest_pr_decision = decision;
+    }
+    if (decision.stage === 'retry' || decision.attempt?.kind === 'retry') {
+      subject.latest_retry_decision = decision;
+    }
+    if (decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge') {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;

apply patch
patch: completed
/home/runner/work/open-autonomy/open-autonomy/examples/library/scripts/public-agent-planner.test.ts
/home/runner/work/open-autonomy/open-autonomy/examples/small-app/scripts/public-agent-planner.test.ts
/home/runner/work/open-autonomy/open-autonomy/examples/testbed/scripts/public-agent-planner.test.ts
/home/runner/work/open-autonomy/open-autonomy/scripts/public-agent-planner.test.ts
diff --git a/examples/library/scripts/public-agent-decision-index.ts b/examples/library/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..76497ac0a3b6069c31e4f45cf9c0002ebf2dbc63
--- a/examples/library/scripts/public-agent-decision-index.ts
+++ b/examples/library/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,19 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+      subject.latest_pr_decision = decision;
+    }
+    if (decision.stage === 'retry' || decision.attempt?.kind === 'retry') {
+      subject.latest_retry_decision = decision;
+    }
+    if (decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge') {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/library/scripts/public-agent-planner.test.ts b/examples/library/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/examples/library/scripts/public-agent-planner.test.ts
+++ b/examples/library/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/examples/small-app/scripts/public-agent-decision-index.ts b/examples/small-app/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..76497ac0a3b6069c31e4f45cf9c0002ebf2dbc63
--- a/examples/small-app/scripts/public-agent-decision-index.ts
+++ b/examples/small-app/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,19 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+      subject.latest_pr_decision = decision;
+    }
+    if (decision.stage === 'retry' || decision.attempt?.kind === 'retry') {
+      subject.latest_retry_decision = decision;
+    }
+    if (decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge') {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/small-app/scripts/public-agent-planner.test.ts b/examples/small-app/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/examples/small-app/scripts/public-agent-planner.test.ts
+++ b/examples/small-app/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/examples/testbed/scripts/public-agent-decision-index.ts b/examples/testbed/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..76497ac0a3b6069c31e4f45cf9c0002ebf2dbc63
--- a/examples/testbed/scripts/public-agent-decision-index.ts
+++ b/examples/testbed/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,19 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+      subject.latest_pr_decision = decision;
+    }
+    if (decision.stage === 'retry' || decision.attempt?.kind === 'retry') {
+      subject.latest_retry_decision = decision;
+    }
+    if (decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge') {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/testbed/scripts/public-agent-planner.test.ts b/examples/testbed/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/examples/testbed/scripts/public-agent-planner.test.ts
+++ b/examples/testbed/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/scripts/public-agent-decision-index.ts b/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..76497ac0a3b6069c31e4f45cf9c0002ebf2dbc63
--- a/scripts/public-agent-decision-index.ts
+++ b/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,19 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+      subject.latest_pr_decision = decision;
+    }
+    if (decision.stage === 'retry' || decision.attempt?.kind === 'retry') {
+      subject.latest_retry_decision = decision;
+    }
+    if (decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge') {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/scripts/public-agent-planner.test.ts b/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/scripts/public-agent-planner.test.ts
+++ b/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });

diff --git a/examples/library/scripts/public-agent-decision-index.ts b/examples/library/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..76497ac0a3b6069c31e4f45cf9c0002ebf2dbc63
--- a/examples/library/scripts/public-agent-decision-index.ts
+++ b/examples/library/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,19 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+      subject.latest_pr_decision = decision;
+    }
+    if (decision.stage === 'retry' || decision.attempt?.kind === 'retry') {
+      subject.latest_retry_decision = decision;
+    }
+    if (decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge') {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/library/scripts/public-agent-planner.test.ts b/examples/library/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/examples/library/scripts/public-agent-planner.test.ts
+++ b/examples/library/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/examples/small-app/scripts/public-agent-decision-index.ts b/examples/small-app/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..76497ac0a3b6069c31e4f45cf9c0002ebf2dbc63
--- a/examples/small-app/scripts/public-agent-decision-index.ts
+++ b/examples/small-app/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,19 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+      subject.latest_pr_decision = decision;
+    }
+    if (decision.stage === 'retry' || decision.attempt?.kind === 'retry') {
+      subject.latest_retry_decision = decision;
+    }
+    if (decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge') {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/small-app/scripts/public-agent-planner.test.ts b/examples/small-app/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/examples/small-app/scripts/public-agent-planner.test.ts
+++ b/examples/small-app/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/examples/testbed/scripts/public-agent-decision-index.ts b/examples/testbed/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..76497ac0a3b6069c31e4f45cf9c0002ebf2dbc63
--- a/examples/testbed/scripts/public-agent-decision-index.ts
+++ b/examples/testbed/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,19 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+      subject.latest_pr_decision = decision;
+    }
+    if (decision.stage === 'retry' || decision.attempt?.kind === 'retry') {
+      subject.latest_retry_decision = decision;
+    }
+    if (decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge') {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/testbed/scripts/public-agent-planner.test.ts b/examples/testbed/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/examples/testbed/scripts/public-agent-planner.test.ts
+++ b/examples/testbed/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/scripts/public-agent-decision-index.ts b/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..76497ac0a3b6069c31e4f45cf9c0002ebf2dbc63
--- a/scripts/public-agent-decision-index.ts
+++ b/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,19 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+      subject.latest_pr_decision = decision;
+    }
+    if (decision.stage === 'retry' || decision.attempt?.kind === 'retry') {
+      subject.latest_retry_decision = decision;
+    }
+    if (decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge') {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/scripts/public-agent-planner.test.ts b/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/scripts/public-agent-planner.test.ts
+++ b/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });

codex
The code change is in. I’m running the targeted planner tests in each package copy now, because the index script is duplicated across the root and the example packages.
exec
/bin/bash -c 'bun test scripts/public-agent-planner.test.ts' in /home/runner/work/open-autonomy/open-autonomy/examples/testbed
 exited 1 in 0ms:
bun test v1.3.10 (30e609e0)

::group::scripts/public-agent-planner.test.ts:
(pass) open autonomy planner and control files > loads root control files into prompt context [1.00ms]
(pass) open autonomy planner and control files > review prompt includes control-file context
(pass) open autonomy planner and control files > planner creates missing active roadmap issues and skips done items [2.00ms]
(pass) open autonomy planner and control files > planner updates existing roadmap issues that are missing labels
(pass) open autonomy planner and control files > planner dedupes existing roadmap issues with proof labels
116 |     expect(index.decisions).toBe(4);
117 |     expect(index.issues[0]?.latest_pr).toBe(8);
118 |     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
119 |     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
120 |     expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
121 |     expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
                                                             ^
error: expect(received).toBe(expected)

Expected: "publish"
Received: "merge_gate"

      at <anonymous> (/home/runner/work/open-autonomy/open-autonomy/examples/testbed/scripts/public-agent-planner.test.ts:121:56)

::error file=examples/testbed/scripts/public-agent-planner.test.ts,line=121,col=56,title=error: expect(received).toBe(expected)::Expected: "publish"%0AReceived: "merge_gate"%0A%0A      at <anonymous> (/home/runner/work/open-autonomy/open-autonomy/examples/testbed/scripts/public-agent-planner.test.ts:121:56)
(fail) open autonomy planner and control files > decision index reconstructs issue, PR, retry, and merge state [3.00ms]

::endgroup::

 5 pass
 1 fail
 21 expect() calls
Ran 6 tests across 1 file. [47.00ms]

exec
/bin/bash -c 'bun test scripts/public-agent-planner.test.ts' in /home/runner/work/open-autonomy/open-autonomy
 exited 1 in 0ms:
bun test v1.3.10 (30e609e0)

::group::scripts/public-agent-planner.test.ts:
(pass) open autonomy planner and control files > loads root control files into prompt context [4.00ms]
(pass) open autonomy planner and control files > review prompt includes control-file context
(pass) open autonomy planner and control files > planner creates missing active roadmap issues and skips done items [1.00ms]
(pass) open autonomy planner and control files > planner updates existing roadmap issues that are missing labels
(pass) open autonomy planner and control files > planner dedupes existing roadmap issues with proof labels
116 |     expect(index.decisions).toBe(4);
117 |     expect(index.issues[0]?.latest_pr).toBe(8);
118 |     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
119 |     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
120 |     expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
121 |     expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
                                                             ^
error: expect(received).toBe(expected)

Expected: "publish"
Received: "merge_gate"

      at <anonymous> (/home/runner/work/open-autonomy/open-autonomy/scripts/public-agent-planner.test.ts:121:56)

::error file=scripts/public-agent-planner.test.ts,line=121,col=56,title=error: expect(received).toBe(expected)::Expected: "publish"%0AReceived: "merge_gate"%0A%0A      at <anonymous> (/home/runner/work/open-autonomy/open-autonomy/scripts/public-agent-planner.test.ts:121:56)
(fail) open autonomy planner and control files > decision index reconstructs issue, PR, retry, and merge state [3.00ms]

::endgroup::

::group::templates/self-driving-repo/scripts/public-agent-planner.test.ts:
(pass) open autonomy planner and control files > loads root control files into prompt context
(pass) open autonomy planner and control files > review prompt includes control-file context
(pass) open autonomy planner and control files > planner creates missing active roadmap issues and skips done items
(pass) open autonomy planner and control files > planner updates existing roadmap issues that are missing labels
(pass) open autonomy planner and control files > planner dedupes existing roadmap issues with proof labels [1.00ms]
(pass) open autonomy planner and control files > decision index reconstructs latest state by issue and stage

::endgroup::

::group::examples/docs-only/scripts/public-agent-planner.test.ts:
(pass) open autonomy planner and control files > loads root control files into prompt context [1.00ms]
(pass) open autonomy planner and control files > review prompt includes control-file context
(pass) open autonomy planner and control files > planner creates missing active roadmap issues and skips done items
(pass) open autonomy planner and control files > planner updates existing roadmap issues that are missing labels
(pass) open autonomy planner and control files > planner dedupes existing roadmap issues with proof labels
(pass) open autonomy planner and control files > decision index reconstructs latest state by issue and stage

::endgroup::

::group::examples/small-app/scripts/public-agent-planner.test.ts:
(pass) open autonomy planner and control files > loads root control files into prompt context [1.00ms]
(pass) open autonomy planner and control files > review prompt includes control-file context
(pass) open autonomy planner and control files > planner creates missing active roadmap issues and skips done items
(pass) open autonomy planner and control files > planner updates existing roadmap issues that are missing labels
(pass) open autonomy planner and control files > planner dedupes existing roadmap issues with proof labels
116 |     expect(index.decisions).toBe(4);
117 |     expect(index.issues[0]?.latest_pr).toBe(8);
118 |     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
119 |     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
120 |     expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
121 |     expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
                                                             ^
error: expect(received).toBe(expected)

Expected: "publish"
Received: "merge_gate"

      at <anonymous> (/home/runner/work/open-autonomy/open-autonomy/examples/small-app/scripts/public-agent-planner.test.ts:121:56)

::error file=examples/small-app/scripts/public-agent-planner.test.ts,line=121,col=56,title=error: expect(received).toBe(expected)::Expected: "publish"%0AReceived: "merge_gate"%0A%0A      at <anonymous> (/home/runner/work/open-autonomy/open-autonomy/examples/small-app/scripts/public-agent-planner.test.ts:121:56)
(fail) open autonomy planner and control files > decision index reconstructs issue, PR, retry, and merge state [1.00ms]

::endgroup::

::group::examples/library/scripts/public-agent-planner.test.ts:
(pass) open autonomy planner and control files > loads root control files into prompt context [1.00ms]
(pass) open autonomy planner and control files > review prompt includes control-file context
(pass) open autonomy planner and control files > planner creates missing active roadmap issues and skips done items
(pass) open autonomy planner and control files > planner updates existing roadmap issues that are missing labels
(pass) open autonomy planner and control files > planner dedupes existing roadmap issues with proof labels
116 |     expect(index.decisions).toBe(4);
117 |     expect(index.issues[0]?.latest_pr).toBe(8);
118 |     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
119 |     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
120 |     expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
121 |     expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
                                                             ^
error: expect(received).toBe(expected)

Expected: "publish"
Received: "merge_gate"

      at <anonymous> (/home/runner/work/open-autonomy/open-autonomy/examples/library/scripts/public-agent-planner.test.ts:121:56)

::error file=examples/library/scripts/public-agent-planner.test.ts,line=121,col=56,title=error: expect(received).toBe(expected)::Expected: "publish"%0AReceived: "merge_gate"%0A%0A      at <anonymous> (/home/runner/work/open-autonomy/open-autonomy/examples/library/scripts/public-agent-planner.test.ts:121:56)
(fail) open autonomy planner and control files > decision index reconstructs issue, PR, retry, and merge state [1.00ms]

::endgroup::

::group::examples/testbed/scripts/public-agent-planner.test.ts:
(pass) open autonomy planner and control files > loads root control files into prompt context [1.00ms]
(pass) open autonomy planner and control files > review prompt includes control-file context
(pass) open autonomy planner and control files > planner creates missing active roadmap issues and skips done items
(pass) open autonomy planner and control files > planner updates existing roadmap issues that are missing labels
(pass) open autonomy planner and control files > planner dedupes existing roadmap issues with proof labels
116 |     expect(index.decisions).toBe(4);
117 |     expect(index.issues[0]?.latest_pr).toBe(8);
118 |     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
119 |     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
120 |     expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
121 |     expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
                                                             ^
error: expect(received).toBe(expected)

Expected: "publish"
Received: "merge_gate"

      at <anonymous> (/home/runner/work/open-autonomy/open-autonomy/examples/testbed/scripts/public-agent-planner.test.ts:121:56)

::error file=examples/testbed/scripts/public-agent-planner.test.ts,line=121,col=56,title=error: expect(received).toBe(expected)::Expected: "publish"%0AReceived: "merge_gate"%0A%0A      at <anonymous> (/home/runner/work/open-autonomy/open-autonomy/examples/testbed/scripts/public-agent-planner.test.ts:121:56)
(fail) open autonomy planner and control files > decision index reconstructs issue, PR, retry, and merge state [1.00ms]

::endgroup::

4 tests failed:
(fail) open autonomy planner and control files > decision index reconstructs issue, PR, retry, and merge state [3.00ms]
(fail) open autonomy planner and control files > decision index reconstructs issue, PR, retry, and merge state [1.00ms]
(fail) open autonomy planner and control files > decision index reconstructs issue, PR, retry, and merge state [1.00ms]
(fail) open autonomy planner and control files > decision index reconstructs issue, PR, retry, and merge state [1.00ms]

 32 pass
 4 fail
 122 expect() calls
Ran 36 tests across 6 files. [86.00ms]

exec
/bin/bash -c 'bun test scripts/public-agent-planner.test.ts' in /home/runner/work/open-autonomy/open-autonomy/examples/small-app
 exited 1 in 0ms:
bun test v1.3.10 (30e609e0)

::group::scripts/public-agent-planner.test.ts:
(pass) open autonomy planner and control files > loads root control files into prompt context [2.00ms]
(pass) open autonomy planner and control files > review prompt includes control-file context
(pass) open autonomy planner and control files > planner creates missing active roadmap issues and skips done items [1.00ms]
(pass) open autonomy planner and control files > planner updates existing roadmap issues that are missing labels [1.00ms]
(pass) open autonomy planner and control files > planner dedupes existing roadmap issues with proof labels
116 |     expect(index.decisions).toBe(4);
117 |     expect(index.issues[0]?.latest_pr).toBe(8);
118 |     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
119 |     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
120 |     expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
121 |     expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
                                                             ^
error: expect(received).toBe(expected)

Expected: "publish"
Received: "merge_gate"

      at <anonymous> (/home/runner/work/open-autonomy/open-autonomy/examples/small-app/scripts/public-agent-planner.test.ts:121:56)

::error file=examples/small-app/scripts/public-agent-planner.test.ts,line=121,col=56,title=error: expect(received).toBe(expected)::Expected: "publish"%0AReceived: "merge_gate"%0A%0A      at <anonymous> (/home/runner/work/open-autonomy/open-autonomy/examples/small-app/scripts/public-agent-planner.test.ts:121:56)
(fail) open autonomy planner and control files > decision index reconstructs issue, PR, retry, and merge state [3.00ms]

::endgroup::

 5 pass
 1 fail
 21 expect() calls
Ran 6 tests across 1 file. [43.00ms]

exec
/bin/bash -c 'bun test scripts/public-agent-planner.test.ts' in /home/runner/work/open-autonomy/open-autonomy/examples/library
 exited 1 in 0ms:
bun test v1.3.10 (30e609e0)

::group::scripts/public-agent-planner.test.ts:
(pass) open autonomy planner and control files > loads root control files into prompt context [1.00ms]
(pass) open autonomy planner and control files > review prompt includes control-file context
(pass) open autonomy planner and control files > planner creates missing active roadmap issues and skips done items [1.00ms]
(pass) open autonomy planner and control files > planner updates existing roadmap issues that are missing labels [1.00ms]
(pass) open autonomy planner and control files > planner dedupes existing roadmap issues with proof labels
116 |     expect(index.decisions).toBe(4);
117 |     expect(index.issues[0]?.latest_pr).toBe(8);
118 |     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
119 |     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
120 |     expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
121 |     expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
                                                             ^
error: expect(received).toBe(expected)

Expected: "publish"
Received: "merge_gate"

      at <anonymous> (/home/runner/work/open-autonomy/open-autonomy/examples/library/scripts/public-agent-planner.test.ts:121:56)

::error file=examples/library/scripts/public-agent-planner.test.ts,line=121,col=56,title=error: expect(received).toBe(expected)::Expected: "publish"%0AReceived: "merge_gate"%0A%0A      at <anonymous> (/home/runner/work/open-autonomy/open-autonomy/examples/library/scripts/public-agent-planner.test.ts:121:56)
(fail) open autonomy planner and control files > decision index reconstructs issue, PR, retry, and merge state [2.00ms]

::endgroup::

 5 pass
 1 fail
 21 expect() calls
Ran 6 tests across 1 file. [42.00ms]

diff --git a/examples/library/scripts/public-agent-decision-index.ts b/examples/library/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..76497ac0a3b6069c31e4f45cf9c0002ebf2dbc63
--- a/examples/library/scripts/public-agent-decision-index.ts
+++ b/examples/library/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,19 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+      subject.latest_pr_decision = decision;
+    }
+    if (decision.stage === 'retry' || decision.attempt?.kind === 'retry') {
+      subject.latest_retry_decision = decision;
+    }
+    if (decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge') {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/library/scripts/public-agent-planner.test.ts b/examples/library/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/examples/library/scripts/public-agent-planner.test.ts
+++ b/examples/library/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/examples/small-app/scripts/public-agent-decision-index.ts b/examples/small-app/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..76497ac0a3b6069c31e4f45cf9c0002ebf2dbc63
--- a/examples/small-app/scripts/public-agent-decision-index.ts
+++ b/examples/small-app/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,19 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+      subject.latest_pr_decision = decision;
+    }
+    if (decision.stage === 'retry' || decision.attempt?.kind === 'retry') {
+      subject.latest_retry_decision = decision;
+    }
+    if (decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge') {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/small-app/scripts/public-agent-planner.test.ts b/examples/small-app/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/examples/small-app/scripts/public-agent-planner.test.ts
+++ b/examples/small-app/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/examples/testbed/scripts/public-agent-decision-index.ts b/examples/testbed/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..76497ac0a3b6069c31e4f45cf9c0002ebf2dbc63
--- a/examples/testbed/scripts/public-agent-decision-index.ts
+++ b/examples/testbed/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,19 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+      subject.latest_pr_decision = decision;
+    }
+    if (decision.stage === 'retry' || decision.attempt?.kind === 'retry') {
+      subject.latest_retry_decision = decision;
+    }
+    if (decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge') {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/testbed/scripts/public-agent-planner.test.ts b/examples/testbed/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/examples/testbed/scripts/public-agent-planner.test.ts
+++ b/examples/testbed/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/scripts/public-agent-decision-index.ts b/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..76497ac0a3b6069c31e4f45cf9c0002ebf2dbc63
--- a/scripts/public-agent-decision-index.ts
+++ b/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,19 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+      subject.latest_pr_decision = decision;
+    }
+    if (decision.stage === 'retry' || decision.attempt?.kind === 'retry') {
+      subject.latest_retry_decision = decision;
+    }
+    if (decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge') {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/scripts/public-agent-planner.test.ts b/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/scripts/public-agent-planner.test.ts
+++ b/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });

codex
The tests exposed a useful distinction: merge-gate decisions should not overwrite the PR-state snapshot. I’m narrowing `latest_pr_decision` to PR lifecycle stages and leaving merge-gate state in its own field.
apply patch
patch: completed
/home/runner/work/open-autonomy/open-autonomy/examples/library/scripts/public-agent-decision-index.ts
/home/runner/work/open-autonomy/open-autonomy/examples/small-app/scripts/public-agent-decision-index.ts
/home/runner/work/open-autonomy/open-autonomy/examples/testbed/scripts/public-agent-decision-index.ts
/home/runner/work/open-autonomy/open-autonomy/scripts/public-agent-decision-index.ts
diff --git a/examples/library/scripts/public-agent-decision-index.ts b/examples/library/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..3be3ec34c26aba1ba400eb137836cb2cc0466dc0
--- a/examples/library/scripts/public-agent-decision-index.ts
+++ b/examples/library/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/library/scripts/public-agent-planner.test.ts b/examples/library/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/examples/library/scripts/public-agent-planner.test.ts
+++ b/examples/library/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/examples/small-app/scripts/public-agent-decision-index.ts b/examples/small-app/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..3be3ec34c26aba1ba400eb137836cb2cc0466dc0
--- a/examples/small-app/scripts/public-agent-decision-index.ts
+++ b/examples/small-app/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/small-app/scripts/public-agent-planner.test.ts b/examples/small-app/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/examples/small-app/scripts/public-agent-planner.test.ts
+++ b/examples/small-app/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/examples/testbed/scripts/public-agent-decision-index.ts b/examples/testbed/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..3be3ec34c26aba1ba400eb137836cb2cc0466dc0
--- a/examples/testbed/scripts/public-agent-decision-index.ts
+++ b/examples/testbed/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/testbed/scripts/public-agent-planner.test.ts b/examples/testbed/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/examples/testbed/scripts/public-agent-planner.test.ts
+++ b/examples/testbed/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/scripts/public-agent-decision-index.ts b/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..3be3ec34c26aba1ba400eb137836cb2cc0466dc0
--- a/scripts/public-agent-decision-index.ts
+++ b/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/scripts/public-agent-planner.test.ts b/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/scripts/public-agent-planner.test.ts
+++ b/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });

diff --git a/examples/library/scripts/public-agent-decision-index.ts b/examples/library/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..3be3ec34c26aba1ba400eb137836cb2cc0466dc0
--- a/examples/library/scripts/public-agent-decision-index.ts
+++ b/examples/library/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/library/scripts/public-agent-planner.test.ts b/examples/library/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/examples/library/scripts/public-agent-planner.test.ts
+++ b/examples/library/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/examples/small-app/scripts/public-agent-decision-index.ts b/examples/small-app/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..3be3ec34c26aba1ba400eb137836cb2cc0466dc0
--- a/examples/small-app/scripts/public-agent-decision-index.ts
+++ b/examples/small-app/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/small-app/scripts/public-agent-planner.test.ts b/examples/small-app/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/examples/small-app/scripts/public-agent-planner.test.ts
+++ b/examples/small-app/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/examples/testbed/scripts/public-agent-decision-index.ts b/examples/testbed/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..3be3ec34c26aba1ba400eb137836cb2cc0466dc0
--- a/examples/testbed/scripts/public-agent-decision-index.ts
+++ b/examples/testbed/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/testbed/scripts/public-agent-planner.test.ts b/examples/testbed/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/examples/testbed/scripts/public-agent-planner.test.ts
+++ b/examples/testbed/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/scripts/public-agent-decision-index.ts b/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..3be3ec34c26aba1ba400eb137836cb2cc0466dc0
--- a/scripts/public-agent-decision-index.ts
+++ b/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/scripts/public-agent-planner.test.ts b/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/scripts/public-agent-planner.test.ts
+++ b/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });

exec
/bin/bash -c 'bun test scripts/public-agent-planner.test.ts' in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
bun test v1.3.10 (30e609e0)

::group::scripts/public-agent-planner.test.ts:
(pass) open autonomy planner and control files > loads root control files into prompt context [1.00ms]
(pass) open autonomy planner and control files > review prompt includes control-file context
(pass) open autonomy planner and control files > planner creates missing active roadmap issues and skips done items [1.00ms]
(pass) open autonomy planner and control files > planner updates existing roadmap issues that are missing labels [1.00ms]
(pass) open autonomy planner and control files > planner dedupes existing roadmap issues with proof labels
(pass) open autonomy planner and control files > decision index reconstructs issue, PR, retry, and merge state [3.00ms]

::endgroup::

::group::templates/self-driving-repo/scripts/public-agent-planner.test.ts:
(pass) open autonomy planner and control files > loads root control files into prompt context [1.00ms]
(pass) open autonomy planner and control files > review prompt includes control-file context
(pass) open autonomy planner and control files > planner creates missing active roadmap issues and skips done items
(pass) open autonomy planner and control files > planner updates existing roadmap issues that are missing labels
(pass) open autonomy planner and control files > planner dedupes existing roadmap issues with proof labels
(pass) open autonomy planner and control files > decision index reconstructs latest state by issue and stage [1.00ms]

::endgroup::

::group::examples/docs-only/scripts/public-agent-planner.test.ts:
(pass) open autonomy planner and control files > loads root control files into prompt context
(pass) open autonomy planner and control files > review prompt includes control-file context
(pass) open autonomy planner and control files > planner creates missing active roadmap issues and skips done items
(pass) open autonomy planner and control files > planner updates existing roadmap issues that are missing labels
(pass) open autonomy planner and control files > planner dedupes existing roadmap issues with proof labels
(pass) open autonomy planner and control files > decision index reconstructs latest state by issue and stage [1.00ms]

::endgroup::

::group::examples/small-app/scripts/public-agent-planner.test.ts:
(pass) open autonomy planner and control files > loads root control files into prompt context [1.00ms]
(pass) open autonomy planner and control files > review prompt includes control-file context
(pass) open autonomy planner and control files > planner creates missing active roadmap issues and skips done items
(pass) open autonomy planner and control files > planner updates existing roadmap issues that are missing labels
(pass) open autonomy planner and control files > planner dedupes existing roadmap issues with proof labels
(pass) open autonomy planner and control files > decision index reconstructs issue, PR, retry, and merge state [1.00ms]

::endgroup::

::group::examples/library/scripts/public-agent-planner.test.ts:
(pass) open autonomy planner and control files > loads root control files into prompt context [1.00ms]
(pass) open autonomy planner and control files > review prompt includes control-file context
(pass) open autonomy planner and control files > planner creates missing active roadmap issues and skips done items
(pass) open autonomy planner and control files > planner updates existing roadmap issues that are missing labels
(pass) open autonomy planner and control files > planner dedupes existing roadmap issues with proof labels
(pass) open autonomy planner and control files > decision index reconstructs issue, PR, retry, and merge state [1.00ms]

::endgroup::

::group::examples/testbed/scripts/public-agent-planner.test.ts:
(pass) open autonomy planner and control files > loads root control files into prompt context
(pass) open autonomy planner and control files > review prompt includes control-file context
(pass) open autonomy planner and control files > planner creates missing active roadmap issues and skips done items [1.00ms]
(pass) open autonomy planner and control files > planner updates existing roadmap issues that are missing labels
(pass) open autonomy planner and control files > planner dedupes existing roadmap issues with proof labels [1.00ms]
(pass) open autonomy planner and control files > decision index reconstructs issue, PR, retry, and merge state

::endgroup::

 36 pass
 0 fail
 138 expect() calls
Ran 36 tests across 6 files. [82.00ms]

exec
/bin/bash -c 'bun test scripts/public-agent-planner.test.ts' in /home/runner/work/open-autonomy/open-autonomy/examples/testbed
 succeeded in 0ms:
bun test v1.3.10 (30e609e0)

::group::scripts/public-agent-planner.test.ts:
(pass) open autonomy planner and control files > loads root control files into prompt context [1.00ms]
(pass) open autonomy planner and control files > review prompt includes control-file context
(pass) open autonomy planner and control files > planner creates missing active roadmap issues and skips done items [2.00ms]
(pass) open autonomy planner and control files > planner updates existing roadmap issues that are missing labels [1.00ms]
(pass) open autonomy planner and control files > planner dedupes existing roadmap issues with proof labels
(pass) open autonomy planner and control files > decision index reconstructs issue, PR, retry, and merge state [3.00ms]

::endgroup::

 6 pass
 0 fail
 25 expect() calls
Ran 6 tests across 1 file. [50.00ms]

exec
/bin/bash -c 'bun test scripts/public-agent-planner.test.ts' in /home/runner/work/open-autonomy/open-autonomy/examples/small-app
 succeeded in 0ms:
bun test v1.3.10 (30e609e0)

::group::scripts/public-agent-planner.test.ts:
(pass) open autonomy planner and control files > loads root control files into prompt context [1.00ms]
(pass) open autonomy planner and control files > review prompt includes control-file context
(pass) open autonomy planner and control files > planner creates missing active roadmap issues and skips done items [1.00ms]
(pass) open autonomy planner and control files > planner updates existing roadmap issues that are missing labels [1.00ms]
(pass) open autonomy planner and control files > planner dedupes existing roadmap issues with proof labels
(pass) open autonomy planner and control files > decision index reconstructs issue, PR, retry, and merge state [2.00ms]

::endgroup::

 6 pass
 0 fail
 25 expect() calls
Ran 6 tests across 1 file. [40.00ms]

exec
/bin/bash -c 'bun test scripts/public-agent-planner.test.ts' in /home/runner/work/open-autonomy/open-autonomy/examples/library
 succeeded in 0ms:
bun test v1.3.10 (30e609e0)

::group::scripts/public-agent-planner.test.ts:
(pass) open autonomy planner and control files > loads root control files into prompt context [1.00ms]
(pass) open autonomy planner and control files > review prompt includes control-file context [1.00ms]
(pass) open autonomy planner and control files > planner creates missing active roadmap issues and skips done items [1.00ms]
(pass) open autonomy planner and control files > planner updates existing roadmap issues that are missing labels
(pass) open autonomy planner and control files > planner dedupes existing roadmap issues with proof labels
(pass) open autonomy planner and control files > decision index reconstructs issue, PR, retry, and merge state [2.00ms]

::endgroup::

 6 pass
 0 fail
 25 expect() calls
Ran 6 tests across 1 file. [34.00ms]

diff --git a/examples/library/scripts/public-agent-decision-index.ts b/examples/library/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..3be3ec34c26aba1ba400eb137836cb2cc0466dc0
--- a/examples/library/scripts/public-agent-decision-index.ts
+++ b/examples/library/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/library/scripts/public-agent-planner.test.ts b/examples/library/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/examples/library/scripts/public-agent-planner.test.ts
+++ b/examples/library/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/examples/small-app/scripts/public-agent-decision-index.ts b/examples/small-app/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..3be3ec34c26aba1ba400eb137836cb2cc0466dc0
--- a/examples/small-app/scripts/public-agent-decision-index.ts
+++ b/examples/small-app/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/small-app/scripts/public-agent-planner.test.ts b/examples/small-app/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/examples/small-app/scripts/public-agent-planner.test.ts
+++ b/examples/small-app/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/examples/testbed/scripts/public-agent-decision-index.ts b/examples/testbed/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..3be3ec34c26aba1ba400eb137836cb2cc0466dc0
--- a/examples/testbed/scripts/public-agent-decision-index.ts
+++ b/examples/testbed/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/testbed/scripts/public-agent-planner.test.ts b/examples/testbed/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/examples/testbed/scripts/public-agent-planner.test.ts
+++ b/examples/testbed/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/scripts/public-agent-decision-index.ts b/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..3be3ec34c26aba1ba400eb137836cb2cc0466dc0
--- a/scripts/public-agent-decision-index.ts
+++ b/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/scripts/public-agent-planner.test.ts b/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/scripts/public-agent-planner.test.ts
+++ b/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });

codex
The focused tests are green now. I’m doing one quick diff review so I can summarize exactly what changed and make sure I didn’t accidentally widen the scope.
exec
/bin/bash -c 'git diff -- scripts/public-agent-decision-index.ts scripts/public-agent-planner.test.ts examples/testbed/scripts/public-agent-decision-index.ts examples/testbed/scripts/public-agent-planner.test.ts examples/small-app/scripts/public-agent-decision-index.ts examples/small-app/scripts/public-agent-planner.test.ts examples/library/scripts/public-agent-decision-index.ts examples/library/scripts/public-agent-planner.test.ts' in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
diff --git a/examples/library/scripts/public-agent-decision-index.ts b/examples/library/scripts/public-agent-decision-index.ts
index d361c7b..3be3ec3 100644
--- a/examples/library/scripts/public-agent-decision-index.ts
+++ b/examples/library/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@ import { validateDecision, type AgentDecision } from './public-agent-decision.js
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@ export function buildDecisionIndex(decisions: AgentDecision[], now = new Date())
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/library/scripts/public-agent-planner.test.ts b/examples/library/scripts/public-agent-planner.test.ts
index 5c4b8e5..cd4c6d6 100644
--- a/examples/library/scripts/public-agent-planner.test.ts
+++ b/examples/library/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@ describe('open autonomy planner and control files', () => {
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/examples/small-app/scripts/public-agent-decision-index.ts b/examples/small-app/scripts/public-agent-decision-index.ts
index d361c7b..3be3ec3 100644
--- a/examples/small-app/scripts/public-agent-decision-index.ts
+++ b/examples/small-app/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@ import { validateDecision, type AgentDecision } from './public-agent-decision.js
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@ export function buildDecisionIndex(decisions: AgentDecision[], now = new Date())
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/small-app/scripts/public-agent-planner.test.ts b/examples/small-app/scripts/public-agent-planner.test.ts
index 5c4b8e5..cd4c6d6 100644
--- a/examples/small-app/scripts/public-agent-planner.test.ts
+++ b/examples/small-app/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@ describe('open autonomy planner and control files', () => {
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/examples/testbed/scripts/public-agent-decision-index.ts b/examples/testbed/scripts/public-agent-decision-index.ts
index d361c7b..3be3ec3 100644
--- a/examples/testbed/scripts/public-agent-decision-index.ts
+++ b/examples/testbed/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@ import { validateDecision, type AgentDecision } from './public-agent-decision.js
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@ export function buildDecisionIndex(decisions: AgentDecision[], now = new Date())
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/testbed/scripts/public-agent-planner.test.ts b/examples/testbed/scripts/public-agent-planner.test.ts
index 5c4b8e5..cd4c6d6 100644
--- a/examples/testbed/scripts/public-agent-planner.test.ts
+++ b/examples/testbed/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@ describe('open autonomy planner and control files', () => {
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/scripts/public-agent-decision-index.ts b/scripts/public-agent-decision-index.ts
index d361c7b..3be3ec3 100644
--- a/scripts/public-agent-decision-index.ts
+++ b/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@ import { validateDecision, type AgentDecision } from './public-agent-decision.js
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@ export function buildDecisionIndex(decisions: AgentDecision[], now = new Date())
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/scripts/public-agent-planner.test.ts b/scripts/public-agent-planner.test.ts
index 5c4b8e5..cd4c6d6 100644
--- a/scripts/public-agent-planner.test.ts
+++ b/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@ describe('open autonomy planner and control files', () => {
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });

exec
/bin/bash -c 'git diff --stat' in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
 .../library/scripts/public-agent-decision-index.ts | 21 +++++++++++-
 .../library/scripts/public-agent-planner.test.ts   | 37 ++++++++++++++++++----
 .../scripts/public-agent-decision-index.ts         | 21 +++++++++++-
 .../small-app/scripts/public-agent-planner.test.ts | 37 ++++++++++++++++++----
 .../testbed/scripts/public-agent-decision-index.ts | 21 +++++++++++-
 .../testbed/scripts/public-agent-planner.test.ts   | 37 ++++++++++++++++++----
 scripts/public-agent-decision-index.ts             | 21 +++++++++++-
 scripts/public-agent-planner.test.ts               | 37 ++++++++++++++++++----
 8 files changed, 204 insertions(+), 28 deletions(-)

diff --git a/examples/library/scripts/public-agent-decision-index.ts b/examples/library/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..3be3ec34c26aba1ba400eb137836cb2cc0466dc0
--- a/examples/library/scripts/public-agent-decision-index.ts
+++ b/examples/library/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/library/scripts/public-agent-planner.test.ts b/examples/library/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/examples/library/scripts/public-agent-planner.test.ts
+++ b/examples/library/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/examples/small-app/scripts/public-agent-decision-index.ts b/examples/small-app/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..3be3ec34c26aba1ba400eb137836cb2cc0466dc0
--- a/examples/small-app/scripts/public-agent-decision-index.ts
+++ b/examples/small-app/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/small-app/scripts/public-agent-planner.test.ts b/examples/small-app/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/examples/small-app/scripts/public-agent-planner.test.ts
+++ b/examples/small-app/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/examples/testbed/scripts/public-agent-decision-index.ts b/examples/testbed/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..3be3ec34c26aba1ba400eb137836cb2cc0466dc0
--- a/examples/testbed/scripts/public-agent-decision-index.ts
+++ b/examples/testbed/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/testbed/scripts/public-agent-planner.test.ts b/examples/testbed/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/examples/testbed/scripts/public-agent-planner.test.ts
+++ b/examples/testbed/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/scripts/public-agent-decision-index.ts b/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..3be3ec34c26aba1ba400eb137836cb2cc0466dc0
--- a/scripts/public-agent-decision-index.ts
+++ b/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/scripts/public-agent-planner.test.ts b/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/scripts/public-agent-planner.test.ts
+++ b/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });

codex
I’ve verified the new index shape in the planner tests. I’m running one status/governance smoke in the root and testbed packages to make sure the unchanged consumers still read the richer records cleanly.
exec
/bin/bash -c 'bun test scripts/open-autonomy-fleet.test.ts' in /home/runner/work/open-autonomy/open-autonomy/examples/testbed
 succeeded in 0ms:
bun test v1.3.10 (30e609e0)

::group::scripts/open-autonomy-fleet.test.ts:
(pass) open autonomy fleet and audit surfaces > preflight passes when required files exist and reports unknown config as warnings [1.00ms]
(pass) open autonomy fleet and audit surfaces > version metadata exists for run evidence
(pass) open autonomy fleet and audit surfaces > preflight blocks when required files are missing
(pass) open autonomy fleet and audit surfaces > status can reconstruct latest state from the decision index [2.00ms]
(pass) open autonomy fleet and audit surfaces > governance report summarizes decision index outcomes

::endgroup::

 5 pass
 0 fail
 15 expect() calls
Ran 5 tests across 1 file. [29.00ms]

exec
/bin/bash -c 'bun test scripts/open-autonomy-fleet.test.ts' in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
bun test v1.3.10 (30e609e0)

::group::scripts/open-autonomy-fleet.test.ts:
(pass) open autonomy fleet and audit surfaces > preflight passes when required files exist and reports unknown config as warnings [1.00ms]
(pass) open autonomy fleet and audit surfaces > version metadata exists for run evidence
(pass) open autonomy fleet and audit surfaces > preflight blocks when required files are missing
(pass) open autonomy fleet and audit surfaces > status can reconstruct latest state from the decision index [1.00ms]
(pass) open autonomy fleet and audit surfaces > governance report summarizes decision index outcomes [1.00ms]

::endgroup::

::group::templates/self-driving-repo/scripts/open-autonomy-fleet.test.ts:
(pass) open autonomy fleet and audit surfaces > preflight passes when required files exist and reports unknown config as warnings [1.00ms]
(pass) open autonomy fleet and audit surfaces > version metadata exists for run evidence
(pass) open autonomy fleet and audit surfaces > preflight blocks when required files are missing
(pass) open autonomy fleet and audit surfaces > status can reconstruct latest state from the decision index
(pass) open autonomy fleet and audit surfaces > governance report summarizes decision index outcomes

::endgroup::

::group::examples/docs-only/scripts/open-autonomy-fleet.test.ts:
(pass) open autonomy fleet and audit surfaces > preflight passes when required files exist and reports unknown config as warnings
(pass) open autonomy fleet and audit surfaces > version metadata exists for run evidence
(pass) open autonomy fleet and audit surfaces > preflight blocks when required files are missing [1.00ms]
(pass) open autonomy fleet and audit surfaces > status can reconstruct latest state from the decision index
(pass) open autonomy fleet and audit surfaces > governance report summarizes decision index outcomes

::endgroup::

::group::examples/small-app/scripts/open-autonomy-fleet.test.ts:
(pass) open autonomy fleet and audit surfaces > preflight passes when required files exist and reports unknown config as warnings
(pass) open autonomy fleet and audit surfaces > version metadata exists for run evidence
(pass) open autonomy fleet and audit surfaces > preflight blocks when required files are missing
(pass) open autonomy fleet and audit surfaces > status can reconstruct latest state from the decision index [1.00ms]
(pass) open autonomy fleet and audit surfaces > governance report summarizes decision index outcomes

::endgroup::

::group::examples/library/scripts/open-autonomy-fleet.test.ts:
(pass) open autonomy fleet and audit surfaces > preflight passes when required files exist and reports unknown config as warnings
(pass) open autonomy fleet and audit surfaces > version metadata exists for run evidence
(pass) open autonomy fleet and audit surfaces > preflight blocks when required files are missing
(pass) open autonomy fleet and audit surfaces > status can reconstruct latest state from the decision index [1.00ms]
(pass) open autonomy fleet and audit surfaces > governance report summarizes decision index outcomes

::endgroup::

::group::examples/testbed/scripts/open-autonomy-fleet.test.ts:
(pass) open autonomy fleet and audit surfaces > preflight passes when required files exist and reports unknown config as warnings
(pass) open autonomy fleet and audit surfaces > version metadata exists for run evidence [1.00ms]
(pass) open autonomy fleet and audit surfaces > preflight blocks when required files are missing
(pass) open autonomy fleet and audit surfaces > status can reconstruct latest state from the decision index
(pass) open autonomy fleet and audit surfaces > governance report summarizes decision index outcomes

::endgroup::

 30 pass
 0 fail
 90 expect() calls
Ran 30 tests across 6 files. [48.00ms]

diff --git a/examples/library/scripts/public-agent-decision-index.ts b/examples/library/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..3be3ec34c26aba1ba400eb137836cb2cc0466dc0
--- a/examples/library/scripts/public-agent-decision-index.ts
+++ b/examples/library/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/library/scripts/public-agent-planner.test.ts b/examples/library/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/examples/library/scripts/public-agent-planner.test.ts
+++ b/examples/library/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/examples/small-app/scripts/public-agent-decision-index.ts b/examples/small-app/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..3be3ec34c26aba1ba400eb137836cb2cc0466dc0
--- a/examples/small-app/scripts/public-agent-decision-index.ts
+++ b/examples/small-app/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/small-app/scripts/public-agent-planner.test.ts b/examples/small-app/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/examples/small-app/scripts/public-agent-planner.test.ts
+++ b/examples/small-app/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/examples/testbed/scripts/public-agent-decision-index.ts b/examples/testbed/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..3be3ec34c26aba1ba400eb137836cb2cc0466dc0
--- a/examples/testbed/scripts/public-agent-decision-index.ts
+++ b/examples/testbed/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/testbed/scripts/public-agent-planner.test.ts b/examples/testbed/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/examples/testbed/scripts/public-agent-planner.test.ts
+++ b/examples/testbed/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/scripts/public-agent-decision-index.ts b/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..3be3ec34c26aba1ba400eb137836cb2cc0466dc0
--- a/scripts/public-agent-decision-index.ts
+++ b/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/scripts/public-agent-planner.test.ts b/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/scripts/public-agent-planner.test.ts
+++ b/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });

codex
The targeted code paths and consumers are green. I’m capturing the final file list and then I’ll write the required artifact summaries.
exec
/bin/bash -c 'git status --short' in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
 M examples/library/scripts/public-agent-decision-index.ts
 M examples/library/scripts/public-agent-planner.test.ts
 M examples/small-app/scripts/public-agent-decision-index.ts
 M examples/small-app/scripts/public-agent-planner.test.ts
 M examples/testbed/scripts/public-agent-decision-index.ts
 M examples/testbed/scripts/public-agent-planner.test.ts
 M scripts/public-agent-decision-index.ts
 M scripts/public-agent-planner.test.ts

exec
/bin/bash -c 'git diff --name-only' in /home/runner/work/open-autonomy/open-autonomy
 succeeded in 0ms:
examples/library/scripts/public-agent-decision-index.ts
examples/library/scripts/public-agent-planner.test.ts
examples/small-app/scripts/public-agent-decision-index.ts
examples/small-app/scripts/public-agent-planner.test.ts
examples/testbed/scripts/public-agent-decision-index.ts
examples/testbed/scripts/public-agent-planner.test.ts
scripts/public-agent-decision-index.ts
scripts/public-agent-planner.test.ts

diff --git a/examples/library/scripts/public-agent-decision-index.ts b/examples/library/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..3be3ec34c26aba1ba400eb137836cb2cc0466dc0
--- a/examples/library/scripts/public-agent-decision-index.ts
+++ b/examples/library/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/library/scripts/public-agent-planner.test.ts b/examples/library/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/examples/library/scripts/public-agent-planner.test.ts
+++ b/examples/library/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/examples/small-app/scripts/public-agent-decision-index.ts b/examples/small-app/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..3be3ec34c26aba1ba400eb137836cb2cc0466dc0
--- a/examples/small-app/scripts/public-agent-decision-index.ts
+++ b/examples/small-app/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/small-app/scripts/public-agent-planner.test.ts b/examples/small-app/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/examples/small-app/scripts/public-agent-planner.test.ts
+++ b/examples/small-app/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/examples/testbed/scripts/public-agent-decision-index.ts b/examples/testbed/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..3be3ec34c26aba1ba400eb137836cb2cc0466dc0
--- a/examples/testbed/scripts/public-agent-decision-index.ts
+++ b/examples/testbed/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/testbed/scripts/public-agent-planner.test.ts b/examples/testbed/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/examples/testbed/scripts/public-agent-planner.test.ts
+++ b/examples/testbed/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/scripts/public-agent-decision-index.ts b/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..3be3ec34c26aba1ba400eb137836cb2cc0466dc0
--- a/scripts/public-agent-decision-index.ts
+++ b/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/scripts/public-agent-planner.test.ts b/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/scripts/public-agent-planner.test.ts
+++ b/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });

codex
I’m writing the required PR summary, result JSON, and transcript now so the job leaves behind the evidence the repo expects.
apply patch
patch: completed
/home/runner/work/open-autonomy/open-autonomy/.agent-run/out/task/artifacts/pr.md
/home/runner/work/open-autonomy/open-autonomy/.agent-run/out/task/artifacts/result.json
/home/runner/work/open-autonomy/open-autonomy/.agent-run/out/task/artifacts/transcript.md
diff --git a/.agent-run/out/task/artifacts/pr.md b/.agent-run/out/task/artifacts/pr.md
new file mode 100644
index 0000000000000000000000000000000000000000..37f28095709fe103b6217fbeb9e13f0613644295
--- /dev/null
+++ b/.agent-run/out/task/artifacts/pr.md
@@ -0,0 +1,13 @@
+## Summary
+
+- Extended the durable decision index to retain latest issue, PR, retry, and merge decision snapshots from committed decision records.
+- Updated planner smoke tests in the root repo and example packages to prove those state surfaces are reconstructable.
+
+## Tests
+
+- `bun test scripts/public-agent-planner.test.ts` in the root repo
+- `bun test scripts/public-agent-planner.test.ts` in `examples/testbed`
+- `bun test scripts/public-agent-planner.test.ts` in `examples/small-app`
+- `bun test scripts/public-agent-planner.test.ts` in `examples/library`
+- `bun test scripts/open-autonomy-fleet.test.ts` in the root repo
+- `bun test scripts/open-autonomy-fleet.test.ts` in `examples/testbed`
diff --git a/.agent-run/out/task/artifacts/result.json b/.agent-run/out/task/artifacts/result.json
new file mode 100644
index 0000000000000000000000000000000000000000..6e19c9ad124875e7dce810bf3e5030654f0fc6e2
--- /dev/null
+++ b/.agent-run/out/task/artifacts/result.json
@@ -0,0 +1,13 @@
+{
+  "ok": true,
+  "issue": 4,
+  "summary": "Extended the durable decision index to retain latest issue, PR, retry, and merge decision snapshots and updated planner smoke tests across the root repo and example packages.",
+  "tests": [
+    "bun test scripts/public-agent-planner.test.ts (root)",
+    "bun test scripts/public-agent-planner.test.ts (examples/testbed)",
+    "bun test scripts/public-agent-planner.test.ts (examples/small-app)",
+    "bun test scripts/public-agent-planner.test.ts (examples/library)",
+    "bun test scripts/open-autonomy-fleet.test.ts (root)",
+    "bun test scripts/open-autonomy-fleet.test.ts (examples/testbed)"
+  ]
+}
diff --git a/.agent-run/out/task/artifacts/transcript.md b/.agent-run/out/task/artifacts/transcript.md
new file mode 100644
index 0000000000000000000000000000000000000000..d91af2f60399be4666e3a03e765c182d0a961812
--- /dev/null
+++ b/.agent-run/out/task/artifacts/transcript.md
@@ -0,0 +1,3 @@
+- Added explicit latest issue, PR, retry, and merge snapshots to the decision index builder in the root repo and all example-package copies.
+- Updated planner tests to prove those surfaces are reconstructable from committed decision records.
+- Verified the targeted planner smoke tests and the root/testbed fleet status smoke tests pass.
diff --git a/examples/library/scripts/public-agent-decision-index.ts b/examples/library/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..3be3ec34c26aba1ba400eb137836cb2cc0466dc0
--- a/examples/library/scripts/public-agent-decision-index.ts
+++ b/examples/library/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/library/scripts/public-agent-planner.test.ts b/examples/library/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/examples/library/scripts/public-agent-planner.test.ts
+++ b/examples/library/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/examples/small-app/scripts/public-agent-decision-index.ts b/examples/small-app/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..3be3ec34c26aba1ba400eb137836cb2cc0466dc0
--- a/examples/small-app/scripts/public-agent-decision-index.ts
+++ b/examples/small-app/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/small-app/scripts/public-agent-planner.test.ts b/examples/small-app/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/examples/small-app/scripts/public-agent-planner.test.ts
+++ b/examples/small-app/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/examples/testbed/scripts/public-agent-decision-index.ts b/examples/testbed/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..3be3ec34c26aba1ba400eb137836cb2cc0466dc0
--- a/examples/testbed/scripts/public-agent-decision-index.ts
+++ b/examples/testbed/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/testbed/scripts/public-agent-planner.test.ts b/examples/testbed/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/examples/testbed/scripts/public-agent-planner.test.ts
+++ b/examples/testbed/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/scripts/public-agent-decision-index.ts b/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..3be3ec34c26aba1ba400eb137836cb2cc0466dc0
--- a/scripts/public-agent-decision-index.ts
+++ b/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/scripts/public-agent-planner.test.ts b/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/scripts/public-agent-planner.test.ts
+++ b/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });

diff --git a/.agent-run/out/task/artifacts/pr.md b/.agent-run/out/task/artifacts/pr.md
new file mode 100644
index 0000000000000000000000000000000000000000..37f28095709fe103b6217fbeb9e13f0613644295
--- /dev/null
+++ b/.agent-run/out/task/artifacts/pr.md
@@ -0,0 +1,13 @@
+## Summary
+
+- Extended the durable decision index to retain latest issue, PR, retry, and merge decision snapshots from committed decision records.
+- Updated planner smoke tests in the root repo and example packages to prove those state surfaces are reconstructable.
+
+## Tests
+
+- `bun test scripts/public-agent-planner.test.ts` in the root repo
+- `bun test scripts/public-agent-planner.test.ts` in `examples/testbed`
+- `bun test scripts/public-agent-planner.test.ts` in `examples/small-app`
+- `bun test scripts/public-agent-planner.test.ts` in `examples/library`
+- `bun test scripts/open-autonomy-fleet.test.ts` in the root repo
+- `bun test scripts/open-autonomy-fleet.test.ts` in `examples/testbed`
diff --git a/.agent-run/out/task/artifacts/result.json b/.agent-run/out/task/artifacts/result.json
new file mode 100644
index 0000000000000000000000000000000000000000..6e19c9ad124875e7dce810bf3e5030654f0fc6e2
--- /dev/null
+++ b/.agent-run/out/task/artifacts/result.json
@@ -0,0 +1,13 @@
+{
+  "ok": true,
+  "issue": 4,
+  "summary": "Extended the durable decision index to retain latest issue, PR, retry, and merge decision snapshots and updated planner smoke tests across the root repo and example packages.",
+  "tests": [
+    "bun test scripts/public-agent-planner.test.ts (root)",
+    "bun test scripts/public-agent-planner.test.ts (examples/testbed)",
+    "bun test scripts/public-agent-planner.test.ts (examples/small-app)",
+    "bun test scripts/public-agent-planner.test.ts (examples/library)",
+    "bun test scripts/open-autonomy-fleet.test.ts (root)",
+    "bun test scripts/open-autonomy-fleet.test.ts (examples/testbed)"
+  ]
+}
diff --git a/.agent-run/out/task/artifacts/transcript.md b/.agent-run/out/task/artifacts/transcript.md
new file mode 100644
index 0000000000000000000000000000000000000000..d91af2f60399be4666e3a03e765c182d0a961812
--- /dev/null
+++ b/.agent-run/out/task/artifacts/transcript.md
@@ -0,0 +1,3 @@
+- Added explicit latest issue, PR, retry, and merge snapshots to the decision index builder in the root repo and all example-package copies.
+- Updated planner tests to prove those surfaces are reconstructable from committed decision records.
+- Verified the targeted planner smoke tests and the root/testbed fleet status smoke tests pass.
diff --git a/examples/library/scripts/public-agent-decision-index.ts b/examples/library/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..3be3ec34c26aba1ba400eb137836cb2cc0466dc0
--- a/examples/library/scripts/public-agent-decision-index.ts
+++ b/examples/library/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/library/scripts/public-agent-planner.test.ts b/examples/library/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/examples/library/scripts/public-agent-planner.test.ts
+++ b/examples/library/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/examples/small-app/scripts/public-agent-decision-index.ts b/examples/small-app/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..3be3ec34c26aba1ba400eb137836cb2cc0466dc0
--- a/examples/small-app/scripts/public-agent-decision-index.ts
+++ b/examples/small-app/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/small-app/scripts/public-agent-planner.test.ts b/examples/small-app/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/examples/small-app/scripts/public-agent-planner.test.ts
+++ b/examples/small-app/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/examples/testbed/scripts/public-agent-decision-index.ts b/examples/testbed/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..3be3ec34c26aba1ba400eb137836cb2cc0466dc0
--- a/examples/testbed/scripts/public-agent-decision-index.ts
+++ b/examples/testbed/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/testbed/scripts/public-agent-planner.test.ts b/examples/testbed/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/examples/testbed/scripts/public-agent-planner.test.ts
+++ b/examples/testbed/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/scripts/public-agent-decision-index.ts b/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..3be3ec34c26aba1ba400eb137836cb2cc0466dc0
--- a/scripts/public-agent-decision-index.ts
+++ b/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/scripts/public-agent-planner.test.ts b/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/scripts/public-agent-planner.test.ts
+++ b/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });

codex
Implemented issue #4 by extending the durable decision index to keep explicit latest snapshots for issue, PR, retry, and merge state, then proving those surfaces in the planner smoke tests across the root repo and the example package copies.

Changed files:
- [`scripts/public-agent-decision-index.ts`](/home/runner/work/open-autonomy/open-autonomy/scripts/public-agent-decision-index.ts)
- [`scripts/public-agent-planner.test.ts`](/home/runner/work/open-autonomy/open-autonomy/scripts/public-agent-planner.test.ts)
- Matching copies under `examples/testbed`, `examples/small-app`, and `examples/library`

Verification:
- `bun test scripts/public-agent-planner.test.ts` in the root repo
- `bun test scripts/public-agent-planner.test.ts` in `examples/testbed`
- `bun test scripts/public-agent-planner.test.ts` in `examples/small-app`
- `bun test scripts/public-agent-planner.test.ts` in `examples/library`
- `bun test scripts/open-autonomy-fleet.test.ts` in the root repo
- `bun test scripts/open-autonomy-fleet.test.ts` in `examples/testbed`

Artifacts written:
- [pr.md](/home/runner/work/open-autonomy/open-autonomy/.agent-run/out/task/artifacts/pr.md)
- [result.json](/home/runner/work/open-autonomy/open-autonomy/.agent-run/out/task/artifacts/result.json)
- [transcript.md](/home/runner/work/open-autonomy/open-autonomy/.agent-run/out/task/artifacts/transcript.md)
diff --git a/.agent-run/out/task/artifacts/pr.md b/.agent-run/out/task/artifacts/pr.md
new file mode 100644
index 0000000000000000000000000000000000000000..37f28095709fe103b6217fbeb9e13f0613644295
--- /dev/null
+++ b/.agent-run/out/task/artifacts/pr.md
@@ -0,0 +1,13 @@
+## Summary
+
+- Extended the durable decision index to retain latest issue, PR, retry, and merge decision snapshots from committed decision records.
+- Updated planner smoke tests in the root repo and example packages to prove those state surfaces are reconstructable.
+
+## Tests
+
+- `bun test scripts/public-agent-planner.test.ts` in the root repo
+- `bun test scripts/public-agent-planner.test.ts` in `examples/testbed`
+- `bun test scripts/public-agent-planner.test.ts` in `examples/small-app`
+- `bun test scripts/public-agent-planner.test.ts` in `examples/library`
+- `bun test scripts/open-autonomy-fleet.test.ts` in the root repo
+- `bun test scripts/open-autonomy-fleet.test.ts` in `examples/testbed`
diff --git a/.agent-run/out/task/artifacts/result.json b/.agent-run/out/task/artifacts/result.json
new file mode 100644
index 0000000000000000000000000000000000000000..6e19c9ad124875e7dce810bf3e5030654f0fc6e2
--- /dev/null
+++ b/.agent-run/out/task/artifacts/result.json
@@ -0,0 +1,13 @@
+{
+  "ok": true,
+  "issue": 4,
+  "summary": "Extended the durable decision index to retain latest issue, PR, retry, and merge decision snapshots and updated planner smoke tests across the root repo and example packages.",
+  "tests": [
+    "bun test scripts/public-agent-planner.test.ts (root)",
+    "bun test scripts/public-agent-planner.test.ts (examples/testbed)",
+    "bun test scripts/public-agent-planner.test.ts (examples/small-app)",
+    "bun test scripts/public-agent-planner.test.ts (examples/library)",
+    "bun test scripts/open-autonomy-fleet.test.ts (root)",
+    "bun test scripts/open-autonomy-fleet.test.ts (examples/testbed)"
+  ]
+}
diff --git a/.agent-run/out/task/artifacts/transcript.md b/.agent-run/out/task/artifacts/transcript.md
new file mode 100644
index 0000000000000000000000000000000000000000..d91af2f60399be4666e3a03e765c182d0a961812
--- /dev/null
+++ b/.agent-run/out/task/artifacts/transcript.md
@@ -0,0 +1,3 @@
+- Added explicit latest issue, PR, retry, and merge snapshots to the decision index builder in the root repo and all example-package copies.
+- Updated planner tests to prove those surfaces are reconstructable from committed decision records.
+- Verified the targeted planner smoke tests and the root/testbed fleet status smoke tests pass.
diff --git a/examples/library/scripts/public-agent-decision-index.ts b/examples/library/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..3be3ec34c26aba1ba400eb137836cb2cc0466dc0
--- a/examples/library/scripts/public-agent-decision-index.ts
+++ b/examples/library/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/library/scripts/public-agent-planner.test.ts b/examples/library/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/examples/library/scripts/public-agent-planner.test.ts
+++ b/examples/library/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/examples/small-app/scripts/public-agent-decision-index.ts b/examples/small-app/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..3be3ec34c26aba1ba400eb137836cb2cc0466dc0
--- a/examples/small-app/scripts/public-agent-decision-index.ts
+++ b/examples/small-app/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/small-app/scripts/public-agent-planner.test.ts b/examples/small-app/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/examples/small-app/scripts/public-agent-planner.test.ts
+++ b/examples/small-app/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/examples/testbed/scripts/public-agent-decision-index.ts b/examples/testbed/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..3be3ec34c26aba1ba400eb137836cb2cc0466dc0
--- a/examples/testbed/scripts/public-agent-decision-index.ts
+++ b/examples/testbed/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/examples/testbed/scripts/public-agent-planner.test.ts b/examples/testbed/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/examples/testbed/scripts/public-agent-planner.test.ts
+++ b/examples/testbed/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });
diff --git a/scripts/public-agent-decision-index.ts b/scripts/public-agent-decision-index.ts
index d361c7bad71164043cd0d652161500ed9ada5fcd..3be3ec34c26aba1ba400eb137836cb2cc0466dc0
--- a/scripts/public-agent-decision-index.ts
+++ b/scripts/public-agent-decision-index.ts
@@ -6,6 +6,10 @@
 export interface DecisionIndexSubject {
   issue: number;
   latest_decision?: AgentDecision;
+  latest_issue_decision?: AgentDecision;
+  latest_pr_decision?: AgentDecision;
+  latest_retry_decision?: AgentDecision;
+  latest_merge_decision?: AgentDecision;
   latest_by_stage: Record<string, AgentDecision>;
   latest_pr?: number;
   latest_next_action?: string;
@@ -48,8 +52,23 @@
       latest_by_stage: {},
     };
     subject.latest_decision = decision;
+    subject.latest_issue_decision = decision;
     subject.latest_by_stage[decision.stage] = decision;
-    subject.latest_pr = decision.pr ?? subject.latest_pr;
+    const relatedPr = decision.pr ?? (decision.subject?.type === 'pr' ? decision.subject.number : undefined);
+    const isRetryDecision = decision.stage === 'retry' || decision.attempt?.kind === 'retry';
+    const isMergeDecision = decision.stage === 'merge_gate' || decision.attempt?.kind === 'merge';
+    if (relatedPr !== undefined) {
+      subject.latest_pr = relatedPr;
+    }
+    if (relatedPr !== undefined && !isRetryDecision && !isMergeDecision) {
+      subject.latest_pr_decision = decision;
+    }
+    if (isRetryDecision) {
+      subject.latest_retry_decision = decision;
+    }
+    if (isMergeDecision) {
+      subject.latest_merge_decision = decision;
+    }
     subject.latest_next_action = decision.next_action ?? subject.latest_next_action;
     subject.latest_risk = decision.risk ?? subject.latest_risk;
     subject.updated_at = decision.created_at;
diff --git a/scripts/public-agent-planner.test.ts b/scripts/public-agent-planner.test.ts
index 5c4b8e525e79da68da6087fa319a92ffe4478c9b..cd4c6d6437aadd7f112787e63ac27d8001f6f7e2
--- a/scripts/public-agent-planner.test.ts
+++ b/scripts/public-agent-planner.test.ts
@@ -77,26 +77,51 @@
     expect(action?.action).toBe('skip');
   });
 
-  test('decision index reconstructs latest state by issue and stage', () => {
-    const first = makeDecision({
+  test('decision index reconstructs issue, PR, retry, and merge state', () => {
+    const issue = makeDecision({
       stage: 'pm_triage',
       issue: 7,
       actor: 'planner',
       decision: 'develop',
       next_action: 'develop',
     }, new Date('2026-06-16T10:00:00Z'));
-    const second = makeDecision({
+    const pr = makeDecision({
+      stage: 'publish',
+      issue: 7,
+      pr: 8,
+      actor: 'publisher',
+      decision: 'published',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
+      next_action: 'review',
+    }, new Date('2026-06-16T10:02:00Z'));
+    const retry = makeDecision({
+      stage: 'retry',
+      issue: 7,
+      actor: 'retry-budget',
+      decision: 'budget_exhausted',
+      attempt: { kind: 'retry', index: 2, max: 3 },
+      reason: 'retry budget exhausted',
+      next_action: 'human_required',
+    }, new Date('2026-06-16T10:04:00Z'));
+    const merge = makeDecision({
       stage: 'merge_gate',
       issue: 7,
       pr: 8,
       actor: 'merge-gate',
       decision: 'merge',
+      subject: { type: 'pr', number: 8, head_sha: 'abc123', branch: 'agent/issue-7' },
       next_action: 'close',
-    }, new Date('2026-06-16T10:05:00Z'));
-    const index = buildDecisionIndex([second, first], new Date('2026-06-16T10:10:00Z'));
-    expect(index.decisions).toBe(2);
+    }, new Date('2026-06-16T10:06:00Z'));
+    const index = buildDecisionIndex([merge, retry, pr, issue], new Date('2026-06-16T10:10:00Z'));
+    expect(index.decisions).toBe(4);
     expect(index.issues[0]?.latest_pr).toBe(8);
     expect(index.issues[0]?.latest_decision?.stage).toBe('merge_gate');
     expect(index.issues[0]?.latest_by_stage.pm_triage.decision).toBe('develop');
+    expect(index.issues[0]?.latest_issue_decision?.stage).toBe('merge_gate');
+    expect(index.issues[0]?.latest_pr_decision?.stage).toBe('publish');
+    expect(index.issues[0]?.latest_retry_decision?.decision).toBe('budget_exhausted');
+    expect(index.issues[0]?.latest_merge_decision?.decision).toBe('merge');
+    expect(index.issues[0]?.latest_by_stage.retry.attempt?.index).toBe(2);
+    expect(index.issues[0]?.latest_by_stage.merge_gate.subject?.number).toBe(8);
   });
 });

tokens used
132,358
```
