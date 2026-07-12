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

## The evidence-runner mandate: `runDemo()`, not hand-rolled `page.screenshot()`

Every demo/visual-state script under `policy.box.visual_evidence.demo_dir`/`state_dir` **MUST** drive its
flow through `runDemo()` from the installed `apps/web/.visual-edit/lib/demo-runner.mjs` (+
`frame-capture.mjs`) — this is an INSTALLED library, not prose to reimplement per-issue. A hand-rolled
`chromium.launch()` / `browser.newContext()` / `page.screenshot()` lifecycle in any evidence-producing
script is **forbidden** (see the develop skill's §Baseline(f)): the develop/reviewer skills' whole
evidence model assumes the runner's contract holds, and a bespoke lifecycle silently opts out of it.

`runDemo()` records the **whole flow as ONE video** (`demo.webm` in the run dir) — every step's screenshot
is a MOMENT of that video, stamped with `videoTimeMs` (its offset from recording start), never a
standalone capture. Concretely, `runDemo()`:

- enforces a **required, default-throw `validateDemoStep`** — a demo author cannot skip validating a step,
  and an unrecognized step id throws rather than silently passing;
- captures, per step: a screenshot, a **settled** ARIA snapshot (`waitForStableAria` — polls until the
  accessibility tree stops changing, so the moment is a stable frame, not mid-transition), the page's
  `innerText`, and the step's narration;
- attaches console/`pageerror` diagnostics for the whole run (`diagnostics.json`, surfaced as an issue
  count in `summary.json`);
- writes one `summary.json` per run carrying `runId`/`script`/`mode`/`acIds`/`runError` (the OA/tracker
  fields `scripts/evidence-attach.mjs` and the bookend discipline consume) alongside the canonical
  `video`/`videoTimeMs`/`diagnostics` fields and a top-level `evidence.screenshot` (the field
  `scripts/world-smoke.mjs`'s capture gate reads).

`scripts/evidence-attach.mjs` pins the run's `demo.webm` once (a ztrack attachment upload when the store is
linked to a GitHub repo, else the same in-repo sha256 commit the frame PNGs use) and carries
`video=<ref> videoSha256=<sha> videoTimeMs=<n>` on every frame's evidence/proof — so a reviewer (or a human
auditor) can always locate a cited screenshot as a moment of the one recorded flow, not an isolated image
with no context for what came before or after it.

## The default-sealed world + openings model

The feature under test is **never** LLM/vendor-driven: `scripts/world-smoke.mjs` stage 4 enforces that
every registry-named external vendor the app imports (payment/comms/LLM-provider SDKs — see
`VENDOR_REGISTRY` in that script, including the Vercel AI-SDK provider adapters) is **either**:

- **twinned** — a `type: "twin"` service for it in `world.config.json`, so develop/reviewer evidence is
  captured against a durable, sealed stand-in, never a real external; or
- **covered by a human-granted opening** — an entry in `world.config.json`'s top-level `openings` array,
  `{"vendor", "reason", "grantedBy"}`, where `grantedBy` names the real human who granted it.

This holds in **every mode** the smoke gate runs, including a world that otherwise boots non-sealed for
other reasons — there is no mode that silently waives the rule. **An agent must never self-grant an
opening.** If a task's actual purpose is testing a real remote (not simulating one), that is exactly the
situation an opening exists for — get a human to grant one, naming the vendor and the reason, before
proceeding; do not fabricate a twin for a vendor you're deliberately testing live, and do not proceed
against real vendor egress without a declared opening covering it.

**Openings are also the sanctioned doorway for recording a new twin.** Building a new twin against a real
vendor (capturing its real request/response shapes to seed a scenario/fixture) is itself a task that
legitimately needs real egress to that vendor for the duration of the recording — get an opening for it,
record the twin, then remove the opening once the twin is in place and covers the vendor going forward. An
opening that outlives the task it was granted for is stale; `world-smoke.mjs` warns (does not fail) on an
opening whose vendor no longer appears in scanned source, specifically so a stale grant gets noticed and
removed rather than quietly continuing to cover a future reintroduction of that vendor.

`npm run smoke:coverage` (`--coverage-only`) runs just this stage-4 rule — a seconds-fast dry check with
no world boot — for confirming twin/opening coverage without paying the cost of a full `npm run smoke`.

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
