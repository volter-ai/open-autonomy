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
bun scripts/bootstrap-self-driving-testbed.ts --repo <owner>/<name>
# when prompted, set the one secret that cannot be set for you, then re-run:
gh secret set MODEL_PROXY_ADMIN_TOKEN -R <owner>/<name>
```

The bootstrap scaffolds `templates/self-driving-repo`, overlays this seed (constitution, empty
roadmap, research sources, provision manifest), provisions the repo, and dispatches the
strategist to generate the first roadmap.
