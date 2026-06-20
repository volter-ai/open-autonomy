#!/usr/bin/env bun
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { touchesGovernancePath } from './public-agent-bundle.js';

// Deterministic ratification mechanics for a strategist roadmap PR:
//  1. Guard: a strategist PR may only add roadmap items. If it touches any governance file
//     (constitution, merit rubric, proof gates, workflows, skills), hard-block — the optimizer
//     must not edit its own oracle, even on the direct-PR path that bypasses the patch publisher.
//  2. Promote: once the strategy reviewer passes, flip the proposal's `status: proposed` items to
//     `status: planned` so the planner mints work issues for them.

export function assertOnlyRoadmapProposal(changedPaths: string[]): void {
  const offending = touchesGovernancePath(changedPaths);
  if (offending) throw new Error(`strategist PR may not edit governance file: ${offending}`);
  const disallowed = changedPaths.find(
    (path) => path !== '.open-autonomy/roadmap.yml' && path !== '.open-autonomy/strategist-archive.json',
  );
  if (disallowed) throw new Error(`strategist PR may only edit the roadmap and idea archive, not: ${disallowed}`);
}

export function promoteProposedToPlanned(roadmapText: string): { text: string; promoted: number } {
  let promoted = 0;
  const text = roadmapText.replace(/^(\s*)status:\s*proposed\s*$/gm, (_match, indent: string) => {
    promoted += 1;
    return `${indent}status: planned`;
  });
  return { text, promoted };
}

interface Options {
  roadmap: string;
  changedFiles?: string;
  promote: boolean;
  out?: string;
}

function usage(): never {
  throw new Error(`Usage:
  bun scripts/public-agent-strategy-ratify.ts --roadmap .open-autonomy/roadmap.yml \\
    [--changed-files changed.txt] [--promote] [--out roadmap.yml]`);
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const roadmap = value('--roadmap');
  if (!roadmap) usage();
  return { roadmap, changedFiles: value('--changed-files'), promote: argv.includes('--promote'), out: value('--out') };
}

function readChangedPaths(path: string | undefined): string[] {
  if (!path || !existsSync(path)) return [];
  return readFileSync(path, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const changed = readChangedPaths(options.changedFiles);
  if (changed.length > 0) assertOnlyRoadmapProposal(changed);
  if (options.promote) {
    const { text, promoted } = promoteProposedToPlanned(readFileSync(options.roadmap, 'utf8'));
    writeFileSync(options.out ?? options.roadmap, text);
    process.stdout.write(`strategy-ratify=promoted:${promoted}\n`);
  } else {
    process.stdout.write('strategy-ratify=guard-ok\n');
  }
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
