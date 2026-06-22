# Open Autonomy — Self-Driving Testbed (regex playground)

A live testbed whose **only human-seeded artifact is the constitution**. This directory is a
*thin seed*, not a full repo: it carries the product constitution (north star + merit), an empty
roadmap, the research sources, and a provisioning manifest. All machinery (skills, workflows,
scripts) comes from `templates/self-driving-repo` at bootstrap time — the testbed is a script
that **uses** the template, so the template stays generic and this seed stays small.

The product is a **browser-based regex playground** (a real UI, so the loop is exercised for
real — building and visually verifying a frontend, not just passing unit tests). The roadmap
starts empty; the autonomy proposes, ratifies, and builds it:

```
constitution (human, immutable)
  → strategist: research + decompose north star → propose roadmap PR
  → strategy reviewer: ratify against the merit criteria
  → planner: mint issues → PM → developer → reviewer → merge gate
  → outcomes feed the next strategist run
```

## Setup (repeatable)

```
bun bin/bench.ts --live --workload self-driving-greenfield --profile self-driving
```

This compiles `profiles/self-driving` for github, overlays this seed (constitution, empty
roadmap, research sources, provision manifest), provisions the repo, and dispatches the
strategist to generate the first roadmap. The cell needs no repository secrets — in-cell
agents mint per-run model tokens via GitHub OIDC. Funding the cell's account is an
operator/treasury step (`MODEL_PROXY_ADMIN_TOKEN` in your local `.env`) that
`bench --live` performs.
