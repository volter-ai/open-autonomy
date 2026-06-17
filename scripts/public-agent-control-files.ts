#!/usr/bin/env bun
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readAutonomyConfig } from './open-autonomy-config.js';

export interface ControlFileContext {
  autonomy?: string;
  agents?: string;
  constitution?: string;
  roadmap?: string;
  review_rubric?: string;
  documents: Record<string, string>;
  standards: Record<string, string>;
  sources: string[];
}

interface Options {
  root: string;
  out?: string;
}

const MAX_SECTION_CHARS = 12_000;

function usage(): never {
  throw new Error(`Usage:
  bun scripts/public-agent-control-files.ts [--root .] [--out .agent-run/control-files.json]`);
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  if (argv.includes('--help')) usage();
  return { root: value('--root') ?? '.', out: value('--out') };
}

export function readControlFileContext(root = '.'): ControlFileContext {
  const standards: Record<string, string> = {};
  const documents: Record<string, string> = {};
  const sources: string[] = [];
  const context: ControlFileContext = { documents, standards, sources };
  const config = readAutonomyConfig(root);

  for (const [key, path] of Object.entries(config.documents).sort(([a], [b]) => a.localeCompare(b))) {
    const value = readOptional(join(root, path));
    if (value) {
      documents[key] = value;
      if (key === 'autonomy') context.autonomy = value;
      else if (key === 'agents') context.agents = value;
      else if (key === 'constitution') context.constitution = value;
      else if (key === 'roadmap') context.roadmap = value;
      else if (key === 'review_rubric') context.review_rubric = value;
      sources.push(path);
    }
  }

  for (const [name, path] of Object.entries(config.standards).sort(([a], [b]) => a.localeCompare(b))) {
    const value = readOptional(join(root, path));
    if (value) {
      standards[name] = value;
      sources.push(path);
    }
  }

  const skillsDir = join(root, '.codex', 'skills');
  if (existsSync(skillsDir)) {
    for (const name of readdirSync(skillsDir).filter((item) => existsSync(join(skillsDir, item, 'SKILL.md'))).sort()) {
      sources.push(`.codex/skills/${name}/SKILL.md`);
    }
  }

  return context;
}

export function renderControlFilePrompt(context: ControlFileContext): string {
  const sections: string[] = [];
  if (context.agents) sections.push(section('AGENTS.md', context.agents));
  if (context.autonomy) sections.push(section('autonomy.yml', context.autonomy));
  if (context.constitution) sections.push(section('constitution.md', context.constitution));
  if (context.roadmap) sections.push(section('roadmap.yml', context.roadmap));
  if (context.review_rubric) sections.push(section('review-rubric.yml', context.review_rubric));
  for (const [name, body] of Object.entries(context.documents).filter(([name]) => !['agents', 'autonomy', 'constitution', 'roadmap', 'review_rubric'].includes(name)).sort(([a], [b]) => a.localeCompare(b))) {
    sections.push(section(name, body));
  }
  for (const [name, body] of Object.entries(context.standards).sort(([a], [b]) => a.localeCompare(b))) {
    sections.push(section(`standards/${name}.md`, body));
  }
  return sections.join('\n\n');
}

function section(name: string, body: string): string {
  return [`## ${name}`, truncate(body.trim(), MAX_SECTION_CHARS)].join('\n');
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n\n[truncated ${value.length - maxChars} chars]`;
}

function readOptional(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  return readFileSync(path, 'utf8');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const context = readControlFileContext(options.root);
  const output = `${JSON.stringify(context, null, 2)}\n`;
  if (options.out) writeFileSync(options.out, output);
  else process.stdout.write(output);
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
