# OA-16: One canonical "Local install checklist" — de-strand the load-bearing facts split across README / OPERATIONS / INSTALL-AGENT

**Finding:** F-15 — load-bearing facts live in exactly one of three overlapping docs (ports/prefix advice and teardown only in INSTALL-AGENT; the commit requirement only in a side-note; the human quickstart lacks the stop-conditions); a reader of any single doc — including the one addressed to them — misses something fatal (see OA-INSTALL-AUDIT-FINDINGS.md §2)
**Priority:** P2
**Fix target:** open-autonomy

## Problem

The onboarding surface is ~1,100 lines across three heavily-overlapping docs (`README.md`, `docs/OPERATIONS.md`, `docs/INSTALL-AGENT.md` — audit §1 Phase 1). Each holds one or two facts the others omit, and several of those facts are install-fatal (F-3's missing commit step produced the silent-zombie loop; F-8's missing port advice produced the shared-box minefield). A human following the doc *addressed to humans* (OPERATIONS' quickstart) never sees the ports/prefix advice, the teardown, or the stop-conditions; an agent following INSTALL-AGENT (GitHub-flavored) gets those but reads a different step order. There is no single ordered list a cold reader can follow end-to-end, and no way to keep three prose copies in sync (F-14 shows they already drift).

## Root cause (verified citations; mark termfleet-dist citations are such — none in this spec)

Current line locations of each stranded load-bearing fact (branch `adoption-fixes-backlog`):

| # | Load-bearing fact | Where it lives | Missing from |
|---|---|---|---|
| 1 | **Commit the overlay** — agents run in git worktrees and only see committed files; uncommitted harness = every worker dies at launch (F-3) | Side-note blockquote in OPERATIONS' *Install & operate* section, `docs/OPERATIONS.md:45-46` ("The OA files are **committed** to the repo (the agents run in git worktrees, which only see committed files…)"); as an ask + an execute step only in the agent/GitHub doc, `docs/INSTALL-AGENT.md:154-157` (ask #3) and `:198-210` (step 5 `git add`/`commit`/`push`) | The human quickstart's numbered steps: `docs/OPERATIONS.md:78-341` (steps 1→5 + troubleshooting) contain **no commit step anywhere** between `compile` (:141-163) and "Run the loop" (:165-187) |
| 2 | **Repo-unique ports/prefix + check-the-port-first** on a shared box | Only `docs/INSTALL-AGENT.md:235-239` ("a second `serve` on a bound port fails silently behind `&`. Check first; use a repo-unique --prefix/--port…") | Human quickstart step 2 hardcodes 7373/7402 with no check: `docs/OPERATIONS.md:121-124` (the loopback note :136-139 says *keep* the ports, not *check* them) |
| 3 | **Provider pinning** (`TERMFLEET_PROVIDER_URL`) | Buried in quickstart Troubleshooting, `docs/OPERATIONS.md:339-340`; one parenthetical at :118-119 | The step-2 recipe itself; INSTALL-AGENT names the var nowhere |
| 4 | **Teardown / how to back OA out** | Only `docs/INSTALL-AGENT.md:384-398` ("Teardown (how the human backs OA out)") | OPERATIONS entirely — the human doc has "Stopping the loop" (:182-187, process kill + spend stop) but no uninstall/backout |
| 5 | **Stop-conditions** (no package.json; no PR CI → never auto-merge; not admin / free private plan; public repo boundary) | Only `docs/INSTALL-AGENT.md:121-130` (Phase-1 "Stop conditions") + the boundaries at `:402-414` | The human quickstart: OPERATIONS' step 5 GitHub flavor carries a diluted no-CI warning (:248-254) but none of the other three, and the local-git flavor none at all |
| 6 | **Durability/observability** (loop dies on terminal close; supervisor; worktree pruning; idle spend) | Only `docs/INSTALL-AGENT.md:337-364` ("Durable operation…") | OPERATIONS: `node scheduler/run.mjs` presented with `&`-free foreground only (:165-187) |
| 7 | **Verify before declaring done** (watch one issue through the loop) | Only `docs/INSTALL-AGENT.md:277-315` (Phase 4) | The human quickstart ends at "add and inspect work" (:189-214) with no verification pass (the audit's §5 flags the local path as having no equivalent) |

Entry-point structure that produces the stranding: `README.md:70-89` gives compile one-liners and points to `docs/OPERATIONS.md#install--operate` (:86-89) — i.e. to the *overview* section whose blockquote (:41-56) holds fact #1, easily skipped en route to the quickstart heading at `docs/OPERATIONS.md:59`. `README.md:91-94` routes agent installs to INSTALL-AGENT. INSTALL-AGENT declares itself the "agent-executable companion to OPERATIONS.md (the human reference)" (`docs/INSTALL-AGENT.md:416-417`) yet is the **sole** home of facts 2, 4, 5, 6, 7 — the companion outranks the reference. Nothing enforces or even lists which facts must appear on which path, so the three copies drift (F-14).

## Proposed fix

A docs-refactor (no behavior change):

1. **Create one canonical section, `docs/OPERATIONS.md` → "## Local install checklist"** (replacing/absorbing the current quickstart steps 1-5), a single ordered list where every load-bearing step appears **in execution order**:
   1. **deps** — `npm install termfleet` + `npm install -D ztrack` (+ the NODE_ENV caveat, F-6's fix)
   2. **preflight** — `npx --yes open-autonomy preflight` (incl. coding-CLI sign-in check per OA-14)
   3. **ports/pin** — repo-unique `--prefix`/`--port` recipe + truthful occupancy probe + `TERMFLEET_PROVIDER_URL` pin (per OA-09), sanity-check launch with `-y` (per OA-13)
   4. **compile** — `npx open-autonomy compile <profile> local .`
   5. **COMMIT the overlay** — promoted from the :45-46 side-note to a numbered step with the one-line why (worktrees see only committed — and, per F-2's resolution, pushed — files)
   6. **tracker** — `ztrack init` (+ the existing-`.volter/` no-op caveat currently only in INSTALL-AGENT's re-run appendix, `docs/INSTALL-AGENT.md:368-370`)
   7. **first issue** — with the assignee/AC body requirements (currently only INSTALL-AGENT `:243-261`)
   8. **first tick** — `node scheduler/run.mjs --once`
   9. **verify** — the local analogue of INSTALL-AGENT Phase 4: watch one issue reach its terminal state; what "working" looks like; only then leave it running
   Followed by two adjacent subsections: **Stop & teardown** (moved/mirrored from `docs/INSTALL-AGENT.md:384-398`, merged with OPERATIONS' :182-187 stopping text) and **Stop-conditions before you start** (the human-relevant subset of `docs/INSTALL-AGENT.md:121-130`: no package.json; shared box; public repo; for the GitHub code host: no PR CI → never auto-merge).
2. **README links, never duplicates**: `README.md:86-89` points at `docs/OPERATIONS.md#local-install-checklist` directly (compile one-liners may stay as a teaser, explicitly labeled "step 4 of the checklist — do not start here on a real repo").
3. **INSTALL-AGENT links, never duplicates**: its Phase 3/step 7 termfleet recipe and its teardown section become links to the canonical checklist items plus only the agent-specific deltas (the GitHub gate wiring, the ask-phase). One copy of each fact; the agent doc holds only what is genuinely agent- or GitHub-specific.
4. **A completeness table as the sync contract**: the checklist section ends with (or the PR description carries) the fact→step mapping from the Root-cause table above, so future edits have an explicit list of what must never be stranded again. (A `check:docs`-style CI grep is optional hardening — see Alternatives.)

## Alternatives rejected

- **Duplicate the missing facts into each doc** — triples the F-14 drift surface; the audit's complaint is not "too few copies" but "no single complete path". Single source + links is the standing doc-architecture rule this repo already applies elsewhere (CLAUDE.md's one-owning-doc doctrine).
- **Make INSTALL-AGENT the canonical home and point humans there** — it is GitHub-code-host-flavored (`docs/INSTALL-AGENT.md:8-12`), written in agent-imperative voice, and interleaves ask-phases a human self-installer doesn't run; OPERATIONS self-describes as "the operator/maintainer how-to doc" (`docs/OPERATIONS.md:3`) and is where README already sends humans.
- **A new fourth doc (e.g. `docs/INSTALL.md`)** — adds an entry point to a surface whose problem is too many overlapping entry points; OPERATIONS already owns install-and-operate per the doc index (CLAUDE.md directory table).
- **CI-enforced doc lint as part of this fix** — a grep-able invariant ("OPERATIONS quickstart must contain `git commit`", etc.) is cheap but brittle prose-coupling; keep this spec pure docs-refactor with the completeness table as the human contract, and leave mechanical enforcement as optional follow-up.

## Acceptance criteria (numbered, testable, fail-today/pass-after, exact command/test)

Completeness checklist — each load-bearing fact reachable from the quickstart a cold reader follows:

1. **The canonical section exists and is ordered.** `grep -n '^## Local install checklist' docs/OPERATIONS.md` hits; within it the nine steps appear in order (test: the section contains numbered steps matching, in sequence, `install termfleet`, `preflight`, `--prefix`/`TERMFLEET_PROVIDER_URL`, `compile`, `git commit`, `ztrack init`, `issue create`, `run.mjs --once`, a verify step). **Fails today** (no such section; no commit step in the quickstart at all).
2. **The commit step is a numbered step, not a side-note.** Between the `compile` step and the first `run.mjs` invocation in `docs/OPERATIONS.md`, a numbered step contains `git add` … `git commit` with the worktree rationale. Fails today (`grep -n 'git commit' docs/OPERATIONS.md` → no hit in the quickstart region; the fact lives only at :45-46).
3. **Ports/pin advice reachable on the human path.** The checklist's termfleet step contains both a repo-unique `--prefix`/`--port` instruction and `TERMFLEET_PROVIDER_URL`. Fails today (in OPERATIONS, `--prefix` uniqueness appears nowhere; the pin only in Troubleshooting :339-340).
4. **Teardown lives in OPERATIONS.** `grep -n -i 'teardown' docs/OPERATIONS.md` hits a subsection covering: stop loop + termfleet, revert/remove the harness commit, prune worktrees/runner-state, remove deps. Fails today (zero hits; only `docs/INSTALL-AGENT.md:384`).
5. **Stop-conditions on the human path.** The checklist (or its preamble) states, before step 1, at minimum: shared-box port/provider caution, public-repo boundary, and (GitHub flavor) no-PR-CI → never auto-merge. Fails today (none of these precede the human quickstart steps).
6. **No duplicated step bodies.** The termfleet serve recipe, the commit sequence, and the teardown commands each appear in exactly one doc; the other two docs reference them by link. Test: `grep -rn 'provider serve --kind virtual-tmux' README.md docs/OPERATIONS.md docs/INSTALL-AGENT.md` → exactly one hit (today: two — OPERATIONS.md:123 and INSTALL-AGENT.md:239); same single-hit test for the teardown `git revert` line and the commit block.
7. **README routes to the checklist.** `grep -n 'local-install-checklist' README.md` hits (the anchor link), and README's compile block is labeled as a mid-checklist step, not an entry point. Fails today (README.md:86-89 links only to `#install--operate`).
8. **Cold-reader walk (the AC that subsumes the rest).** A reader starting at README's local-install pointer and following **only** the linked checklist top-to-bottom encounters every row of the Root-cause table's fact column (1-7) before the step where its absence would bite. Reviewed as a checklist against the table in the PR; fails today for facts 1, 2, 3, 4, 5, 6, 7 on the human path.

## Dependencies (OA-XX edges + reason)

- **OA-09** — the checklist's step 3 must enshrine OA-09's corrected ports/pin/probe recipe, not the current 7373/7402 one; land OA-09's doc content first or in the same change.
- **OA-13** — the sanity-check snippet the checklist carries must be the `-y` version.
- **OA-14** — the checklist's preflight/sign-in step must reference the real auth probe, not `claude --version`.
- **F-3 / F-2 fixes (spec ids outside this batch)** — the commit step's wording (commit vs commit-and-push, local-trunk worktrees) depends on how F-2's architectural fix lands; the checklist should state whatever F-2/F-3 make true. Structural refactor need not wait, but the step-5 text must track those specs.

## Provenance

- Audit: `OA-INSTALL-AUDIT-FINDINGS.md` §2 F-15 (plus F-3, F-8, F-14 as the concrete casualties), §1 Phase 1 ("the three docs overlap heavily but each holds one or two load-bearing facts the others omit"), §1 step 4 (ports/prefix "mentioned only in INSTALL-AGENT, not the human quickstart"), §1 step 14 (the commit requirement "lives in a side-note in a different section").
- Repo source (branch `adoption-fixes-backlog`): `README.md:70-94` (:86-89, :91-94); `docs/OPERATIONS.md:3,41-56,45-46,59,78-341` (:118-119, :121-124, :136-139, :141-163, :165-187, :182-187, :189-214, :248-254, :339-340); `docs/INSTALL-AGENT.md:8-12,121-130,154-157,198-210,235-239,243-261,337-364,368-370,384-398,402-414,416-417`. All line references verified against the working tree during spec authoring. No termfleet-dist citations in this spec.
