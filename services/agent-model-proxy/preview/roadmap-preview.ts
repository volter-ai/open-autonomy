// Standalone preview + screenshot harness for the funding page's Roadmap panel.
//
// The roadmap visual is a PURE render (project-docs.tsx `RoadmapPanel`) styled by the `.rm-*` block in
// platform-html.tsx (`STYLES`). This harness renders that exact panel, with the exact page CSS, over a
// fixture that exercises every derived state (shipped / in-flight / queued / proposed), then screenshots
// it with the real column geometry — collapsed and fully expanded.
//
// Run (MUST be from the package dir so bun picks up its hono/jsx tsconfig):
//   cd services/agent-model-proxy && bun preview/roadmap-preview.ts
// Out:  preview/out/roadmap-collapsed.png, roadmap-expanded.png, roadmap.html
//
// This is the feedback loop for iterating on the panel's look: edit the CSS/structure, re-run, look at
// the PNGs, repeat.
// playwright isn't a dep of this worker package (it ships nothing to the edge); resolve it for the
// preview-only screenshot step from wherever it's installed — in-tree, then common global locations.
async function loadPlaywright(): Promise<{ chromium: { launch(): Promise<any> } }> {
  const candidates = [
    'playwright',
    '/opt/homebrew/lib/node_modules/playwright/index.js',
    `${process.env.HOME}/node_modules/playwright/index.js`,
    '/usr/local/lib/node_modules/playwright/index.js',
  ];
  for (const c of candidates) {
    try { return await import(c); } catch { /* try next */ }
  }
  throw new Error('playwright not found — install it (e.g. `bun add -g playwright`) to run this preview harness');
}
const { chromium } = await loadPlaywright();
import { renderRoadmapPanel } from '../src/project-docs.js';
import { STYLES } from '../src/platform-html.js';

// ⚠️ This fixture MIRRORS THE REAL LIVE STATE of volter-ai/open-autonomy (captured 2026-06-24) so the
// screenshot shows the ACTUAL problem, not an idealised demo. The pathology to fix:
//   • The planner created exactly ONE umbrella tracking issue per roadmap item, titled identically to the
//     item — a 1:1 self-referential stub. So every item reads "0/1", expands to a single line that just
//     echoes its own title, and can never reach "done" (the umbrella issue never closes).
//   • Two items (durable-decision-memory #4, durable-state-index #13) have a tracking issue that carries
//     only `roadmap:phase-N`, NOT `roadmap:<item-id>`. The rollup keys on `roadmap:*`, so those counts
//     strand in phantom "phase-1"/"phase-10" buckets that match no item → the real item shows 0 issues
//     and is NOT expandable. (That is why "I can't uncollapse to see the issue.")
//   • Net effect: a flat list of "0/1, in progress" that never completes — the exact freeze the two-layer
//     model was supposed to end, just relocated from a hand-set status to an umbrella-issue-that-never-closes.
// AFTER the 2026-06-24 reconciliation: 6 shipped items were closed (derived → done), 4 partials + 1
// not-started were rescoped to their genuine remainder, and the 2 stranded items were relabelled. The
// panel now shows a real distribution (shipped / in flight / proposed) instead of a wall of "0/1".
const FIXTURE_YML = `schema: open-autonomy.roadmap.v1
items:
  - id: durable-decision-memory
    phase: 1
    priority: high
    status: planned
    title: Durable Decision Memory
  - id: unified-loop-budget
    phase: 2
    priority: high
    status: planned
    title: PM Failure Handling From History
  - id: pm-proactive-backlog
    phase: 3
    priority: high
    status: planned
    title: PM Operations And Backlog Policy
  - id: developer-context-quality
    phase: 4
    priority: medium
    status: planned
    title: Developer Context And Patch Quality
  - id: review-merge-parity
    phase: 5
    priority: high
    status: planned
    title: Review And The Merge Boundary
  - id: operator-observability
    phase: 6
    priority: medium
    status: planned
    title: Observability And Operator Controls
  - id: production-rollout
    phase: 7
    priority: medium
    status: planned
    title: Production Rollout
  - id: direction-control-files
    phase: 8
    priority: high
    status: planned
    title: Direction, Constitution, And Planning Loop
  - id: self-hosted-fleet
    phase: 9
    priority: medium
    status: planned
    title: Self-Hosted Repository Fleet
  - id: durable-state-index
    phase: 10
    priority: medium
    status: planned
    title: Durable State And Audit Trail
  - id: repair-loops
    phase: 11
    priority: medium
    status: planned
    title: PM-Directed Repair (not auto-repair)
  - id: maintainer-governance
    phase: 12
    priority: medium
    status: planned
    title: Maintainer Governance
  - id: public-oss-readiness
    phase: 13
    priority: medium
    status: planned
    title: Public OSS Readiness
  - id: strategist-roadmap-research
    phase: 14
    priority: high
    status: proposed
    title: Strategist Roadmap Research Loop
  - id: actor-model-human-handoffs
    phase: 15
    priority: high
    status: proposed
    title: Actor Model And Explicit Human Handoffs
  - id: develop-oa-through-oa
    phase: 17
    priority: high
    status: proposed
    title: Develop OA Through OA (close the manual loophole)
  - id: multi-provider-model-routing
    phase: 18
    priority: medium
    status: proposed
    title: Multi-Provider Model Routing For Loop Roles
`;

// The rollup the live worker produces after reconciliation: 7 items closed (done), 6 open (in progress)
// each pointing at a genuine, rescoped remainder rather than a self-referential umbrella.
const FIXTURE_STATUS = JSON.stringify({
  items: {
    'durable-decision-memory': { total: 1, done: 0, issues: [{ n: 4, t: 'Build the durable decision index (reconstruct issue/PR/attempt/merge state from run-ledger records)', c: false }] },
    'unified-loop-budget': { total: 1, done: 1, issues: [{ n: 5, t: 'PM Failure Handling From History', c: true }] },
    'pm-proactive-backlog': { total: 1, done: 0, issues: [{ n: 6, t: 'PM routes open agent PRs to the reviewer instead of starting duplicate work', c: false }] },
    'developer-context-quality': { total: 1, done: 0, issues: [{ n: 7, t: 'Assemble developer run context (issue comments, PR diff, decisions, review findings)', c: false }] },
    'review-merge-parity': { total: 1, done: 1, issues: [{ n: 8, t: 'Review And The Merge Boundary', c: true }] },
    'operator-observability': { total: 1, done: 1, issues: [{ n: 9, t: 'Observability And Operator Controls', c: true }] },
    'production-rollout': { total: 1, done: 0, issues: [{ n: 10, t: 'Prove production rollout on the canonical repo (end-to-end PM→develop→review→merge)', c: false }] },
    'direction-control-files': { total: 1, done: 1, issues: [{ n: 11, t: 'Direction, Constitution, And Planning Loop', c: true }] },
    'self-hosted-fleet': { total: 1, done: 1, issues: [{ n: 22, t: 'Self-Hosted Repository Fleet', c: true }] },
    'durable-state-index': { total: 1, done: 0, issues: [{ n: 13, t: 'Durable State And Audit Trail', c: false }] },
    'repair-loops': { total: 1, done: 1, issues: [{ n: 14, t: 'PM-Directed Repair (not auto-repair)', c: true }] },
    'maintainer-governance': { total: 1, done: 1, issues: [{ n: 15, t: 'Maintainer Governance', c: true }] },
    'public-oss-readiness': { total: 1, done: 0, issues: [{ n: 23, t: 'Publish cookbook examples as pushable repos with local docs + root roadmap links', c: false }] },
  },
});

const REPO_URL = 'https://github.com/open-autonomy/open-autonomy';

async function main() {
  const panel = renderRoadmapPanel(FIXTURE_YML, REPO_URL, FIXTURE_STATUS);
  // Reproduce the real page geometry: the panel lives in the LEFT (1fr) column of `.cols` inside `.wrap`
  // (max 1080px). We give the right column a placeholder so the grid splits exactly as in production.
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>${STYLES}</style></head>
<body><div class="wrap" style="padding-top:32px"><div class="cols"><div>${panel}</div><div class="side"></div></div></div></body></html>`;

  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const outDir = path.join(import.meta.dir, 'out');
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'roadmap.html'), html);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1120, height: 1400 }, deviceScaleFactor: 2 });
  await page.goto('file://' + path.join(outDir, 'roadmap.html'));
  await page.waitForTimeout(400); // let the webfont settle

  const panelEl = page.locator('.roadmap-panel');
  await panelEl.screenshot({ path: path.join(outDir, 'roadmap-collapsed.png') });

  // Open every station so the child-issue lists (layer 2) are visible in the second shot.
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => d.setAttribute('open', '')));
  await page.waitForTimeout(150);
  await panelEl.screenshot({ path: path.join(outDir, 'roadmap-expanded.png') });

  await browser.close();
  console.log('wrote', outDir + '/roadmap-collapsed.png', '+ roadmap-expanded.png + roadmap.html');
}

main().catch((e) => { console.error(e); process.exit(1); });
