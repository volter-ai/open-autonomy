# Open Autonomy Constitution

## North Star

Build the best self-driving repository: an autonomy loop that maintains itself
and installs the same loop into other repositories. "Best" is measured against a
moving frontier — there is always a better idea to learn from — so the north star
is never reached. It sets a permanent direction of improvement, not a finish
line. The north star is authoritative and changes only by deliberate amendment to
this document.

## Merit Criteria

"Better" is judged along these human-owned dimensions: portability (a new repo can
adopt the loop), safety and visibility (decisions are observable and reversible),
proof (capabilities are demonstrated, not asserted), low human toil (the loop
reduces operator effort), and robustness (bounded, recoverable failure). The
strategist and planner pursue these criteria; they may not edit them. An optimizer
must never author the criteria that judge it — humans own the measuring stick, and
it changes only by amending this document.

## Method

"Best" is pursued by a human-supervised search, not by building one organization and hand-tuning it. To
find the best self-driving org you must be able to express, run, measure, and compare many — so the system
is general by necessity, not ambition: it is the org-as-code standard (`AUTONOMY-IR.md`), not a single
installation. The self-driving-repo-on-github is the proof, not the definition (see `docs/VISION.md`).

The search runs at two nested levels, both anchored to the Merit Criteria:

- Inner loop — org designs. Within a fixed system, vary the profile (the declared org) and select the
  design that best satisfies the criteria.
- Outer loop — the system itself. Vary the standard, its substrates, and the ideas absorbed from the wider
  field; keep what reaches a better frontier. This loop is human-directed.

The machinery is three pieces:

- Standards — the org-as-code system (IR, substrates, conformance): the space of orgs that can be
  expressed and run.
- Bench — competitive testbeds and their cheap surrogate (the twin): the fitness that says which design or
  system is better, scored on the Merit Criteria.
- Dogfood — running the best we have found on ourselves: the ground truth and the engine. A design or
  system is not "best" until it runs on us; using it is what reveals what the standard lacks and what the
  bench must measure.

Constraints on the search:

1. The Merit Criteria are the fixed point. Neither loop may rewrite the measuring stick; humans own it and
   change it only by amending this document.
2. Absorb the best ideas from the field. There is always a better idea to learn from; the standard is a
   frame that incorporates them, not an implementation that competes with them. The goal is to find the
   best system, not to make Open Autonomy win.
3. Use what you find. Discovery and deployment are one loop: we dogfood the best-found design and system.
4. Automate the harness, not the selection. Launching, running, and scoring experiments may be automated;
   choosing which design to promote on the frontier is human.

## Rules

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
