#!/usr/bin/env bun
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

export type AgentVerb = 'develop' | 'review' | 'pause' | 'resume' | 'cancel' | 'retry' | 'status' | 'none';

export interface AgentCommand {
  verb: AgentVerb;
  raw: string;
  source: 'label' | 'comment' | 'none';
}

interface Options {
  event: string;
  out: string;
}

function usage(): never {
  throw new Error(`Usage:
  bun scripts/public-agent-command.ts --event "$GITHUB_EVENT_PATH" --out .agent-run/command.json`);
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const event = value('--event');
  if (!event) usage();
  return { event, out: value('--out') ?? '.agent-run/command.json' };
}

export function parseAgentCommand(event: unknown): AgentCommand {
  const payload = event as {
    action?: string;
    label?: { name?: string };
    comment?: { body?: string };
    inputs?: { command?: string };
  };

  const dispatchCommand = payload.inputs?.command?.trim();
  if (dispatchCommand) {
    return parseCommandLine(dispatchCommand, 'comment');
  }

  if (payload.label?.name === 'agent-session') {
    return { verb: 'develop', raw: 'agent-session label', source: 'label' };
  }

  const body = payload.comment?.body?.trim() ?? '';
  const firstLine = body.split(/\r?\n/, 1)[0]?.trim() ?? '';
  return parseCommandLine(firstLine, body ? 'comment' : 'none');
}

function parseCommandLine(firstLine: string, source: AgentCommand['source']): AgentCommand {
  const match = firstLine.match(/^\/agent(?:\s+([A-Za-z-]+))?\b/);
  if (!match) return { verb: 'none', raw: firstLine, source: 'none' };

  const requested = (match[1] ?? 'develop').toLowerCase();
  if (requested === 'develop' || requested === 'run' || requested === 'continue') {
    return { verb: 'develop', raw: firstLine, source: 'comment' };
  }
  if (requested === 'review') {
    return { verb: 'review', raw: firstLine, source: 'comment' };
  }
  if (requested === 'pause' || requested === 'resume' || requested === 'cancel' || requested === 'retry' || requested === 'status') {
    return { verb: requested, raw: firstLine, source: 'comment' };
  }
  return { verb: 'none', raw: firstLine, source };
}

function writeOutputs(command: AgentCommand): void {
  if (!process.env.GITHUB_OUTPUT) return;
  appendFileSync(process.env.GITHUB_OUTPUT, [
    `verb=${command.verb}`,
    `source=${command.source}`,
    '',
  ].join('\n'));
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const command = parseAgentCommand(JSON.parse(readFileSync(options.event, 'utf8')));
  writeFileSync(options.out, `${JSON.stringify(command, null, 2)}\n`);
  writeOutputs(command);
  process.stdout.write(`agent-command=${command.verb}\n`);
  if (command.verb === 'none') process.exit(78);
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
