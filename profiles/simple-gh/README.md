# simple-gh

The single-manager GitHub PR loop. One agent, `manager`, on a `cron: */30 * * * *` trigger, that:

1. dispatches **strongest-model** research/plan/review subagents in-session (harness-native, not OA
   actors),
2. writes plans as **docs** registered as ztrack document sources,
3. dispatches a **weaker-but-capable** implementation subagent on an isolated git worktree per issue, and
4. **lands** work by opening the PR itself and merging it itself — but only after every required CI
   check is green and a fresh review-subagent verdict is recorded on the PR's current head SHA.

This is the pattern strong operators already run agent fleets with today (one capable session, tiered
subagent dispatch, worktree isolation, human-shaped review before landing) encoded as an `autonomy.ir.v1`
profile. See `docs/SPEC.md#the-ir` for the standard; the design rationale in full lives in
`OA-SIMPLE-GH-PRESET-AND-SUPERCODE-INSTALL.md` §2 (the study this profile implements).

## Files

```
profiles/simple-gh/
  ir.yml                       # the profile: one `manager` agent, no merge.yml/reconcile
  README.md                    # this file
  provision.json                # branch-protection floor: real CI required, enforce_admins, no auto-merge
  skills/manager/SKILL.md      # the whole doctrine
  standards/workflow.md        # single-manager loop: tick, WIP, worktree rules, dispatch-only-ready
  standards/issue-and-evidence.md  # ztrack grammar + plan-docs-as-document-sources recipe
  standards/risk-and-review.md # review-before-merge doctrine + human-required paths/topics
  .claude/settings.json        # physical copy source for the resources: entry (ztrack Stop hook)
```

## Compile

```bash
bun bin/autonomy-compile.ts profiles/simple-gh local /tmp/simple-gh-kit
```

Targets **`local` only** — the pattern is a person's machine + their own gh credential; there's no
meaningful `gh-actions` realization of "the manager merges with the operator's token" (a hosted, scoped
token can't merge, by design). `codeHost: github` — the board is ztrack, but the change lands as a real
GitHub PR.

## Merge flow

`develop`/`review`/`merge` collapse into one agent's doctrine instead of three IR actors:

1. Implementation subagent finishes on its worktree; the manager pushes the branch and `gh pr create`s.
2. The manager waits for **every required CI check** to go green.
3. The manager dispatches a **read-only review subagent** (strongest tier) against the PR diff + the
   issue's ACs + `ztrack check`, and records its verdict as a structured PR comment pinned to the head
   SHA it reviewed (`oa-review: pass|fail sha=<head-sha> — <findings>`).
4. Only when both hold — every required check green on the current head SHA, and the latest verdict is
   `pass` with its `sha=` equal to that head SHA (a pass on an older SHA is stale; any later push
   requires a fresh review) — does the manager `gh pr merge --squash`. A red check or a `fail` verdict
   is a hard block: rework (bounded) or escalate `human-required`. Never `--admin`, never a direct push
   to the default branch.
5. Once merged, the manager itself flips the issue's ztrack state to `done` with a `PR:` line — there is
   no reconcile sweep in this profile (see below).

## HONESTY

This preset is deliberately built to claim exactly what it enforces, no more. Four things worth reading
before you trust it:

**(a) Single-credential reality — the gate is branch protection, not agent independence.** On the local
substrate, every subagent this manager dispatches (research, implementation, review) shares the
*operator's own* gh credential. There is no `agent-review` status here, because on a shared token that
status would be a self-check, not an independent gate (`docs/INSTALL-AGENT.md`'s own framing). The
deterministic thing actually protecting `main` is **branch protection with the repo's real CI required
and `enforce_admins: true`** — a red check is a mechanical block the manager's own credential cannot
route around, same as `docs/INSTALL-AGENT.md`'s ranking ("your real CI in the gate" is #1). The
recorded `oa-review:` verdict is a genuine second pass by a fresh model context over the diff, but it is
not a cryptographically independent identity — treat it as strong internal supervision, not as
proof-of-independent-review. This is exactly twin's landing model (`twin/profiles/twin-sdlc/ir.yml` —
"a human merges every green PR by hand"), except here the manager session executes the merge as the
operator's deputy instead of a human clicking the button.

**(b) Model tiering rides the Claude Code harness's subagent seam.** `policy.box.models.{research,
implement}` are realized entirely by Claude Code's Agent tool: a per-dispatch `model` override plus
`isolation: "worktree"`. There is no local-substrate concept of per-agent model routing (the local
runner's `runner-defaults.mjs` carries only `{cli, harness, timeouts}`; the gh-actions substrate's
`gh-actions.model` knob has no local counterpart), so this is the *only* zero-engine-change way to
realize "strongest for research/review, capable for implementation" today. Concretely: **running this
profile under `TERMFLEET_AGENT=codex` degrades to single-model operation** — the `.codex/skills/manager/`
mirror this compile also emits cannot realize the tiering (codex has no equivalent per-dispatch model +
worktree-isolation seam). If you run this profile on codex, expect one model for everything.

**(c) `merge.yml` + `reconcile-merged-issues.ts` are deliberately NOT carried.** Both are GitHub-Issues-only
machinery (`reconcile-merged-issues.ts` requires `GITHUB_REPOSITORY`, walks merged PRs via `gh`, and closes
*linked GitHub Issues*). In this preset the board is the local ztrack store, and the manager itself flips
ztrack state post-merge (SKILL.md §6) — carrying a scheduled sweep that only ever no-ops here would just
be dead weight. **Re-add condition:** if you later enable `ztrack init --sync github` (GitHub Issues become
the board), re-add both `merge.yml` and `reconcile-merged-issues.ts` from `simple-gh-sdlc` — using
**twin's no-arming `merge.yml` variant** (`twin/profiles/twin-sdlc/.github/workflows/merge.yml`), **never**
the auto-merge-arming one (`simple-gh-sdlc`'s own `merge.yml`) — arming auto-merge would silently
contradict this profile's entire "the manager merges after review" landing model.

**(d) Abstract model labels — the SKILL.md owns the mapping.** `policy.box.models.research` /
`.implement` declare tier labels (`strongest` / `capable`), never model ids, precisely so this profile
doesn't rot as model names churn. `skills/manager/SKILL.md` §1 ("Label → model mapping") is the single
place that translates a label to a concrete model — update it there, never in `ir.yml`.

**(e) `security.yml`/`dependabot.yml` are not carried by default.** Same as `simple-gh-sdlc`'s and
`twin-sdlc`'s posture on this point (per INSTALL-AGENT ask #4): a deterministic security-scan surface is
adopter opt-in, not a default of this floor profile. Add `simple-gh-sdlc`'s `security.yml` +
`security-gate.yml` (+ `scripts/check-supply-chain.ts`, wired as a `propose_dispatch_checks` entry) if you
want it.

## vs. the other bundled profiles

See `profiles/README.md`'s gallery entry for the full contrast table (agents / workers / model tiering /
landing / plans) against `simple-sdlc`, `simple-gh-sdlc`, `soc2-baseline`, and `self-driving`. In one
line: `simple-gh-sdlc` auto-merges behind an `agent-review` check that's a self-check on local; `simple-gh`
replaces that with a manager who merges only after real CI + a recorded review pass. `soc2-baseline` adds
a full deterministic compliance control layer on top of `simple-gh-sdlc`'s auto-merge; `simple-gh`
deliberately stays the floor — no compliance machinery, just an honest single-identity loop with a real
gate.
