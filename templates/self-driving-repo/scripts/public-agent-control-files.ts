#!/usr/bin/env bun
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ControlFileContext {
  agents?: string;
  constitution?: string;
  policy?: string;
  roadmap?: string;
  review_rubric?: string;
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
  const standardsDir = join(root, '.open-autonomy', 'standards');
  const standards: Record<string, string> = {};
  const sources: string[] = [];
  const context: ControlFileContext = { standards, sources };

  for (const [key, path] of [
    ['agents', 'AGENTS.md'],
    ['constitution', '.open-autonomy/constitution.md'],
    ['policy', '.open-autonomy/policy.yml'],
    ['roadmap', '.open-autonomy/roadmap.yml'],
    ['review_rubric', '.open-autonomy/review-rubric.yml'],
  ] as const) {
    const value = readOptional(join(root, path));
    if (value) {
      context[key] = value;
      sources.push(path);
    }
  }

  if (existsSync(standardsDir)) {
    for (const name of readdirSync(standardsDir).filter((item) => item.endsWith('.md')).sort()) {
      const path = join(standardsDir, name);
      const value = readOptional(path);
      if (value) {
        standards[name.replace(/\.md$/, '')] = value;
        sources.push(`.open-autonomy/standards/${name}`);
      }
    }
  }

  return context;
}

export function renderControlFilePrompt(context: ControlFileContext): string {
  const sections: string[] = [];
  if (context.agents) sections.push(section('AGENTS.md', context.agents));
  if (context.constitution) sections.push(section('constitution.md', context.constitution));
  if (context.policy) sections.push(section('policy.yml', context.policy));
  if (context.roadmap) sections.push(section('roadmap.yml', context.roadmap));
  if (context.review_rubric) sections.push(section('review-rubric.yml', context.review_rubric));
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
