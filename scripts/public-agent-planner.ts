#!/usr/bin/env bun
import { readFileSync, writeFileSync } from 'node:fs';

export interface RoadmapItem {
  id: string;
  phase: number;
  priority: 'high' | 'medium' | 'low';
  status: string;
  title: string;
  proof_gate: string;
  acceptance: string[];
}

export interface ExistingIssue {
  number?: number;
  title?: string;
  body?: string;
  labels?: Array<{ name?: string }>;
  url?: string;
  state?: string;
}

export interface PlannerAction {
  action: 'create' | 'update' | 'skip';
  reason: string;
  item: RoadmapItem;
  issue_number?: number;
  title: string;
  body: string;
  labels: string[];
}

interface Options {
  roadmap: string;
  issues?: string;
  out: string;
}

function usage(): never {
  throw new Error(`Usage:
  bun scripts/public-agent-planner.ts --roadmap .open-autonomy/roadmap.yml [--issues issues.json] --out planner.json`);
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const roadmap = value('--roadmap');
  if (!roadmap) usage();
  return { roadmap, issues: value('--issues'), out: value('--out') ?? '.agent-run/planner.json' };
}

export function parseRoadmapItems(text: string): RoadmapItem[] {
  const lines = text.split(/\r?\n/);
  const items: RoadmapItem[] = [];
  let current: Partial<RoadmapItem> | undefined;
  let inAcceptance = false;

  const finish = () => {
    if (!current) return;
    if (!current.id || !current.phase || !current.priority || !current.status || !current.title || !current.proof_gate) {
      throw new Error(`roadmap item is incomplete: ${JSON.stringify(current)}`);
    }
    items.push({
      id: current.id,
      phase: current.phase,
      priority: current.priority,
      status: current.status,
      title: current.title,
      proof_gate: current.proof_gate,
      acceptance: current.acceptance ?? [],
    });
  };

  for (const line of lines) {
    const itemMatch = /^\s*-\s+id:\s*(.+?)\s*$/.exec(line);
    if (itemMatch) {
      finish();
      current = { id: unquote(itemMatch[1] ?? ''), acceptance: [] };
      inAcceptance = false;
      continue;
    }
    if (!current) continue;
    const scalar = /^\s+([a-z_]+):\s*(.*?)\s*$/.exec(line);
    if (scalar) {
      const key = scalar[1] ?? '';
      const value = unquote(scalar[2] ?? '');
      inAcceptance = key === 'acceptance';
      if (key === 'phase') current.phase = Number(value);
      else if (key === 'priority') current.priority = value as RoadmapItem['priority'];
      else if (key === 'status') current.status = value;
      else if (key === 'title') current.title = value;
      else if (key === 'proof_gate') current.proof_gate = value;
      continue;
    }
    const acceptance = /^\s+-\s+(.+?)\s*$/.exec(line);
    if (inAcceptance && acceptance) current.acceptance?.push(unquote(acceptance[1] ?? ''));
  }
  finish();
  return items;
}

export function planRoadmapIssues(items: RoadmapItem[], existingIssues: ExistingIssue[] = []): PlannerAction[] {
  return items
    .filter((item) => item.status !== 'done')
    .map((item) => {
      const labels = [`roadmap:phase-${item.phase}`, `priority:${item.priority}`, 'origin:roadmap-planner', `proof:${item.proof_gate}`];
      const title = `[roadmap:${item.id}] ${item.title}`;
      const body = renderIssueBody(item);
      const existing = findExistingIssue(item, existingIssues);
      if (!existing) {
        return { action: 'create', reason: 'missing roadmap issue', item, title, body, labels };
      }
      const existingLabels = new Set((existing.labels ?? []).map((label) => label.name ?? ''));
      const missingLabels = labels.filter((label) => !existingLabels.has(label));
      const bodyHasGate = (existing.body ?? '').includes(`Proof gate: \`${item.proof_gate}\``);
      if (missingLabels.length || !bodyHasGate) {
        return {
          action: 'update',
          reason: `existing issue needs ${missingLabels.length ? 'labels' : 'body refresh'}`,
          item,
          issue_number: existing.number,
          title,
          body,
          labels,
        };
      }
      return {
        action: 'skip',
        reason: 'existing issue already represents roadmap item',
        item,
        issue_number: existing.number,
        title,
        body,
        labels,
      };
    });
}

function renderIssueBody(item: RoadmapItem): string {
  return [
    `Roadmap item: \`${item.id}\``,
    `Phase: ${item.phase}`,
    `Priority: ${item.priority}`,
    `Proof gate: \`${item.proof_gate}\``,
    '',
    'Acceptance criteria:',
    ...item.acceptance.map((line) => `- ${line}`),
    '',
    'Planner origin: roadmap-planner',
  ].join('\n');
}

function findExistingIssue(item: RoadmapItem, issues: ExistingIssue[]): ExistingIssue | undefined {
  const marker = `[roadmap:${item.id}]`;
  const proof = `proof:${item.proof_gate}`;
  return issues.find((issue) => {
    const labels = new Set((issue.labels ?? []).map((label) => label.name ?? ''));
    return issue.title?.includes(marker) || issue.body?.includes(`Roadmap item: \`${item.id}\``) || labels.has(proof);
  });
}

function readIssues(path: string | undefined): ExistingIssue[] {
  if (!path) return [];
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (Array.isArray(parsed)) return parsed as ExistingIssue[];
  return [];
}

function unquote(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const items = parseRoadmapItems(readFileSync(options.roadmap, 'utf8'));
  const actions = planRoadmapIssues(items, readIssues(options.issues));
  writeFileSync(options.out, `${JSON.stringify({ actions }, null, 2)}\n`);
  process.stdout.write(`planner=create:${actions.filter((item) => item.action === 'create').length} update:${actions.filter((item) => item.action === 'update').length} skip:${actions.filter((item) => item.action === 'skip').length}\n`);
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
