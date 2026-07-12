# Visual Evidence Standard

Read this from the develop and reviewer skills. It distills the seven bookend invariants the
`§Baseline` / `§DryRun` procedure enforces, and the worksheet layout both skills read/write.
`policy.box.visual_evidence` (in `.open-autonomy/autonomy.yml`) names the concrete paths: `world_config`,
`demo_dir`, `state_dir`, `adapter`, `app_url_env` — read them from there rather than hardcoding paths in
prose, so a fork can relocate the pipeline without editing every skill.

## Why bookends exist

`ztrack check` already refuses a fabricated commit SHA. It cannot refuse a **fabricated visual claim** —
a developer asserting "the button now shows the error state" with no image, or an image that shows
nothing relevant. The visual-evidence pipeline is the same "done is earned, not declared" principle
applied to the one AC class text evidence can't cover: what a user actually sees. Baseline (before) and
dry-run (after) are bookends around the same implementation — the pair is the proof, not either half
alone.

**Both bookends are modeled as first-class BOOKKEEPING ACs, `bk/01` (before) and `bk/02` (after) —
not a worksheet convention.** The `simple-gh-sdlc` preset is prefix-agnostic (an AC id is just
`z.string().min(1)`; categories are an id-prefix convention, nothing hardcoded to `dev/`), so `bk/` ACs
parse and gate exactly like `dev/` ones: `review_requires_all_acs_passed` requires ALL ACs
passed-with-evidence before an issue can move to `in-review`, `bk/` included. This closes the gap the
old approach had — a baseline screenshot that lived only in `full-develop-worksheets/<issue>/baseline/`
was a discardable local file: nothing forced it to exist, nothing forced anyone to have looked at it, and
it vanished from the record the moment the worksheet directory was cleaned up. A `bk/01` AC makes the
before-proof a **committed tracker record** with the same evidence-must-exist, evidence-must-be-real,
commit-must-contain-the-file guarantees `ztrack check` already gives every other AC — plus a
preset-specific rule, `bk_requires_screenshot_evidence`, that a `dev/` AC does not carry: a passed `bk/`
AC must cite evidence with a real committed `image=` path, not commit-and-prose alone (a bare
`sha256:`/`http(s):` ref doesn't satisfy it either — this is specifically about a picture actually in the
tree). `bk_pair_incomplete` further requires that an issue carrying either bookend carries both — there
is no such thing as a lone before or a lone after.

**Invariant: the before-proof is a checked, committed `bk/01` record, not a discarded worksheet file.**
Never let "the baseline screenshot is somewhere in `full-develop-worksheets/`" stand in for this — if it
isn't cited as `bk/01`'s evidence with a real committed image, it isn't proof of anything to anyone who
isn't looking at your local disk.

**Conditionality:** `bk/01`/`bk/02` exist ONLY on an issue with at least one user-facing AC (see the draft
skill). A purely non-visual issue must carry neither — `bk_pair_incomplete` would otherwise make it
permanently unmergeable over bookends it has no visual content to produce.

## The seven bookend invariants

1. **Fidelity classification.** Before capturing anything, classify what's under the URL you're hitting:
   - `real-service-required` — the AC depends on a live third-party integration (payments, real email
     delivery, a partner API) that a mock cannot honestly stand in for. Capturing against a mock here is
     not evidence; say so and route to human-required rather than fabricate a pass.
   - `durable-simulator-required` — a twin/simulator that persists state across the world's lifetime
     (the sealed world's own backing services) is an honest stand-in; capture against it.
   - `mock-acceptable` — a stateless mock (a stubbed response, a fixture) is an honest stand-in for this
     particular AC's visible behavior.
   - `mock-irrelevant` — the AC has no external dependency in view; capture directly against the app.
   Never silently downgrade a `real-service-required` AC to a mock and call it evidence.

2. **Fresh-stack-for-after.** The dry-run world is a NEW `volter-world up`, never a reuse of the baseline
   stack. A reused stack can carry state left over from the "before" capture (a half-applied mutation, a
   stale cache, a lingering session) that makes the "after" screenshot's honesty unverifiable — you would
   no longer know whether the fix or the leftover state produced the result. Baseline down, fix applied,
   fresh world up, re-seed, then capture "after."

3. **Inspect-before-describe.** A screenshot (and its `.aria.json`/`.txt` sidecars where captured) must be
   opened and read by the agent describing it — before it is cited as proof, before it is described in a
   PR/issue comment, before a reviewer approves on its strength. A path string is not evidence; only an
   inspected image is. This applies symmetrically to develop (citing its own capture) and reviewer
   (verifying someone else's).

4. **Human-moves-only.** Every action the demo/state script performs must be something a human tester
   could physically do in a browser: click, type, scroll, navigate, wait for a real state change. No
   dispatched/synthetic DOM events, no direct state injection, no reaching into app internals to force a
   render. Discovery happens first, one action at a time (interactively, ARIA-snapshot-verified); a script
   may only replay a flow already walked by hand — scripting a flow you haven't performed yourself is
   exactly the kind of unverified claim this standard exists to prevent.

5. **Persistence: never report done with unpersisted or failed checks.** `ztrack check` must be green,
   the evidence commit must actually exist and actually contain the cited artifact, and the world must be
   torn down cleanly — before `OUTCOME: ready-for-review` (develop) or `OUTCOME: approved` (reviewer). A
   passing local run that isn't captured in a real commit, or a check that failed and was ignored, is not
   done — it's an unrecorded claim that evaporates with the session.

6. **Evidence lines are NEVER hand-written.** ALL AC evidence MUST be produced by
   `node scripts/evidence-attach.mjs --run <run-dir>`, which routes every evidence line through
   `ztrack evidence add <png> --commit` (a real committed file). A bare `image=sha256:<hex>` blob ref is
   BANNED — ztrack parses it but verifies nothing, so a hand-written blob ref is an evidence-forgery
   vector. This applies to develop (never author the line yourself) and reviewer (reject any evidence
   line that does not trace to a real adapter-made commit).

7. **Seed and all app interaction MUST run inside the world env** (`npm run seed`, or `volter-world env
   combo-dev -- …`). NEVER run seed/scripts bare: the app's fallback fake key means a bare run escapes
   the sealed world and hits real vendor APIs (proven: bare seed → real api.stripe.com 401). This applies
   to every command in Baseline/DryRun that touches the app or seeds data — no exceptions for "just a
   quick check".

## Worksheet layout

Baseline and dry-run runs land in a per-issue worksheet directory first — the raw capture output (video,
ARIA/text dumps, the run's `summary.json`) that the evidence adapter reads from and that a developer (or,
on request, a reviewer) can use for their own by-eye before/after diffing:

```
full-develop-worksheets/<issue>/
  baseline/    # §Baseline captures — prove the bug exists / the feature is absent. Source for bk/01's evidence.
  dryrun/      # §DryRun captures — source for both a dev/NN AC's evidence and bk/02's evidence.
```

**The worksheet directory itself is never the evidence.** What makes something tracker evidence is a
committed image cited on an AC's `evidence` line — the worksheet is only ever the *source* the adapter
(`scripts/evidence-attach.mjs --issue-file "$ISSUE_MD"`) reads a screenshot from before committing it by
path and splicing the citation into the issue body:

- `dryrun/` images are the source for a `dev/NN` AC's evidence (the fixed-state proof) AND, when the issue
  carries the `bk/01`/`bk/02` pair, for `bk/02`'s evidence (the same or a paired dry-run capture) — see the
  develop skill's §DryRun.
- `baseline/` images are the source for **`bk/01`'s evidence** — see the develop skill's §Baseline(d). This
  is the reversal from the old model: baseline artifacts are no longer a discardable process-gate file that
  is never cited anywhere; `bk/01` cites one directly, so the before-proof survives as a checked, committed
  tracker record instead of evaporating with the worksheet.

`dev/NN` ACs still never cite a baseline artifact — only `bk/01` does. **Invariant:** the before-proof is a
checked, committed `bk/01` record, not a discarded worksheet file — if an issue's baseline evidence exists
only under `full-develop-worksheets/`, `bk_requires_screenshot_evidence` (or, if `bk/01` is simply missing
from the AC list, `bk_pair_incomplete`) will say so.
