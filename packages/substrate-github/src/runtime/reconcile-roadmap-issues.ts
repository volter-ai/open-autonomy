#!/usr/bin/env bun
// Deterministic reconcile: ensure every `planned`/`active` item in `.open-autonomy/roadmap.yml` has exactly
// one planner-owned tracking issue. Reconciling the roadmap into issues is mechanical WIRING (one issue per
// committed item, matched by a `roadmap:<id>` label), not a judgment — so, like closing merged issues, it must
// not depend on a model remembering (or being strong enough) to do it. It runs as a deterministic step in the
// planner's job, which holds issues:write + GH_TOKEN. Idempotent: an item that already has a tracking issue is
// left alone, so running it on every planner sweep is safe. `proposed` items are deliberately skipped — they are
// the strategy reviewer's gate, not yet planned.
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
  status: string;
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
      cur = { id: unquote(idm[1]), title: '', status: '', acceptance: [] };
      inAcceptance = false;
      continue;
    }
    if (!cur) continue;
    if (/^\s*acceptance:\s*$/.test(line)) { inAcceptance = true; continue; }
    const fm = line.match(/^\s+(phase|priority|status|title|proof_gate):\s*(.+?)\s*$/);
    if (fm) {
      inAcceptance = false;
      const [, key, val] = fm;
      if (key === 'phase') cur.phase = unquote(val);
      else if (key === 'priority') cur.priority = unquote(val);
      else if (key === 'status') cur.status = unquote(val);
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
  return items.filter((i) => i.id && i.title);
}

let yml = '';
try {
  yml = readFileSync('.open-autonomy/roadmap.yml', 'utf8');
} catch {
  process.stderr.write('roadmap-reconcile: no .open-autonomy/roadmap.yml — skipping\n');
  process.exit(0);
}
const items = parseRoadmap(yml).filter((i) => i.status === 'planned' || i.status === 'active');

// Which roadmap ids already have a tracking issue (matched by the `roadmap:<id>` label, the stable marker).
const tracked = new Set<string>();
try {
  const existing = JSON.parse(gh(['issue', 'list', '-R', repo, '--state', 'all', '--label', 'origin:roadmap-planner', '--limit', '200', '--json', 'labels']) || '[]') as { labels: { name: string }[] }[];
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
    `Tracking issue for roadmap item \`${item.id}\` (status: ${item.status}${item.phase ? `, phase ${item.phase}` : ''}).`,
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
process.stdout.write(`roadmap-reconcile: ${created} issue(s) created (${items.length} planned/active item(s), ${tracked.size} already tracked)\n`);
