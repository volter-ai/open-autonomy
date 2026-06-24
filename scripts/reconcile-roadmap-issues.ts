#!/usr/bin/env bun
// Safety reconcile (layer 2 of the two-layer roadmap): ensure every `planned: true` item in
// `.open-autonomy/roadmap.yml` has at least one planner-owned tracking issue. Decomposing an item INTO issues
// is the planner's JUDGMENT (model) — but a `planned` item with NO tracking issue at all is a hole, and this
// net closes it deterministically so a planned item is never silently dropped. Matched by the `roadmap:<id>`
// label; idempotent (an item that already has any tracking issue is left to the planner). Runs as a step in the
// planner's job (issues:write + GH_TOKEN). Items that are `proposed: true` (the strategy reviewer's gate) or not
// yet `planned` are deliberately skipped. Execution status is DERIVED from child issues, never read here.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const repo = process.env.GITHUB_REPOSITORY;
if (!repo) {
  process.stderr.write('roadmap-reconcile: no GITHUB_REPOSITORY — skipping\n');
  process.exit(0);
}

const gh = (args: string[]): string => {
  try {
    return execFileSync('gh', args, { encoding: 'utf8' }).trim();
  } catch (e) {
    process.stderr.write(`roadmap-reconcile: gh ${args.join(' ')} failed: ${e instanceof Error ? e.message : String(e)}\n`);
    return '';
  }
};

interface Item {
  id: string;
  title: string;
  planned: boolean;
  proposed: boolean;
  phase?: string;
  priority?: string;
  proof_gate?: string;
  acceptance: string[];
}

// Tolerant line parser — we read only the handful of fields we track (no YAML dependency in the runtime).
// An item starts at `- id:`; its scalar fields and `acceptance:` bullets follow until the next item.
function parseRoadmap(yml: string): Item[] {
  const items: Item[] = [];
  let cur: Item | null = null;
  let inAcceptance = false;
  const unquote = (s: string): string => s.trim().replace(/^['"]/, '').replace(/['"]$/, '').trim();
  for (const line of yml.split('\n')) {
    const idm = line.match(/^\s*-\s+id:\s*(.+?)\s*$/);
    if (idm) {
      if (cur) items.push(cur);
      cur = { id: unquote(idm[1]), title: '', planned: false, proposed: false, acceptance: [] };
      inAcceptance = false;
      continue;
    }
    if (!cur) continue;
    if (/^\s*acceptance:\s*$/.test(line)) { inAcceptance = true; continue; }
    const fm = line.match(/^\s+(phase|priority|planned|proposed|title|proof_gate):\s*(.+?)\s*$/);
    if (fm) {
      inAcceptance = false;
      const [, key, val] = fm;
      if (key === 'phase') cur.phase = unquote(val);
      else if (key === 'priority') cur.priority = unquote(val);
      else if (key === 'planned') cur.planned = unquote(val) === 'true';
      else if (key === 'proposed') cur.proposed = unquote(val) === 'true';
      else if (key === 'title') cur.title = unquote(val);
      else if (key === 'proof_gate') cur.proof_gate = unquote(val);
      continue;
    }
    if (inAcceptance) {
      const am = line.match(/^\s+-\s+(.+?)\s*$/);
      if (am) cur.acceptance.push(am[1].trim());
    }
  }
  if (cur) items.push(cur);
  // Keep every item with an id (even titleless) — a planned item missing a title is a roadmap authoring bug we
  // must SURFACE, not silently drop (it would leave a planned item with no tracking issue and no warning).
  return items.filter((i) => i.id);
}

let yml = '';
try {
  yml = readFileSync('.open-autonomy/roadmap.yml', 'utf8');
} catch {
  process.stderr.write('roadmap-reconcile: no .open-autonomy/roadmap.yml — skipping\n');
  process.exit(0);
}
// A `proposed: true` item is still the strategy reviewer's gate — never create issues for it, even if it
// also (incorrectly) carries planned: true. proposed wins, matching the planner skill + the page deriver.
const planned = parseRoadmap(yml).filter((i) => i.planned === true && i.proposed !== true);
// A planned item with no title can't become a tracking issue — surface it loudly instead of dropping it.
for (const i of planned.filter((i) => !i.title)) {
  process.stderr.write(`roadmap-reconcile: WARNING planned item '${i.id}' has no title — cannot create a tracking issue; fix the roadmap\n`);
}
const items = planned.filter((i) => i.title);

// Which roadmap ids already have a tracking issue (matched by the `roadmap:<id>` label, the stable marker).
// High --limit so the dedup set is COMPLETE: a truncated list would miss existing trackers and create
// DUPLICATE issues (gh paginates internally up to the limit; roadmap-planner issues are well under this).
const tracked = new Set<string>();
try {
  const existing = JSON.parse(gh(['issue', 'list', '-R', repo, '--state', 'all', '--label', 'origin:roadmap-planner', '--limit', '5000', '--json', 'labels']) || '[]') as { labels: { name: string }[] }[];
  for (const it of existing) for (const l of it.labels) if (l.name.startsWith('roadmap:')) tracked.add(l.name.slice('roadmap:'.length));
} catch {
  /* none yet */
}

const ensureLabel = (name: string): void => { gh(['label', 'create', name, '-R', repo, '--force']); };

let created = 0;
for (const item of items) {
  if (tracked.has(item.id)) continue; // already has a tracking issue — idempotent
  // `gh issue create` fails outright on a missing label, so create them first (idempotent --force).
  ensureLabel('origin:roadmap-planner');
  ensureLabel(`roadmap:${item.id}`);
  const priorityLabel = item.priority ? `priority:${item.priority}` : '';
  if (priorityLabel) ensureLabel(priorityLabel);
  const body = [
    `Tracking issue for roadmap item \`${item.id}\` (planned${item.phase ? `, phase ${item.phase}` : ''}).`,
    item.proof_gate ? `\nProof gate: \`${item.proof_gate}\`` : '',
    item.acceptance.length ? `\nAcceptance:\n${item.acceptance.map((a) => `- ${a}`).join('\n')}` : '',
    `\n<!-- roadmap:${item.id} -->`,
  ].filter(Boolean).join('\n');
  const labels = ['origin:roadmap-planner', `roadmap:${item.id}`, ...(priorityLabel ? [priorityLabel] : [])];
  const args = ['issue', 'create', '-R', repo, '--title', item.title, '--body', body];
  for (const l of labels) args.push('--label', l);
  const out = gh(args);
  if (out) { created++; process.stdout.write(`roadmap-reconcile: created tracking issue for ${item.id} → ${out}\n`); }
}
process.stdout.write(`roadmap-reconcile: ${created} issue(s) created (${items.length} planned item(s), ${tracked.size} already tracked)\n`);
