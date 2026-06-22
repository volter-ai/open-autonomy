#!/usr/bin/env bun
// Thin skill runner: builds the prompt (the agent's skill + its subject + the universal job contract) and
// runs Claude Code against the bounded model proxy. The agent acts DIRECTLY with its own scoped token —
// if it changes the working tree, the wrapper's effect step proposes it as an auto-merging PR; if its job
// is to review/comment/label, the skill does that itself via gh. There is no bundle and no result schema:
// the agent's actions ARE its output (docs/CAPABILITIES.md). This script only sets up the model + prompt.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runClaudeAgent } from './agent.js';

type Options = { issue?: string; context?: string; model: string; skill?: string };

const root = resolve(import.meta.dir, '..');

function usage(): never {
  throw new Error(`Usage:
  MODEL_PROXY_URL=... MODEL_PROXY_TOKEN=... OSS_AGENT_TASK_DIR=... bun scripts/claude-agent-run.ts --skill skills/x/SKILL.md [--issue issue.json] [--model deepseek/deepseek-v4-flash]`);
}

function argValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function parseArgs(argv: string[]): Options {
  if (argv.includes('--help')) usage();
  return {
    issue: argValue(argv, '--issue') ?? process.env.OSS_AGENT_ISSUE_PATH,
    context: argValue(argv, '--context') ?? process.env.OSS_AGENT_CONTEXT_PATH,
    model: argValue(argv, '--model') ?? process.env.PUBLIC_AGENT_MODEL ?? 'deepseek/deepseek-v4-flash',
    skill: argValue(argv, '--skill') ?? process.env.OSS_AGENT_SKILL_PATH,
  };
}

function readIssue(issuePath: string): { number?: number; title?: string; body?: string } {
  try {
    return JSON.parse(readFileSync(issuePath, 'utf8')) as { number?: number; title?: string; body?: string };
  } catch {
    return {};
  }
}

function redactSensitive(text: string): string {
  return text
    .replace(/sk_live_[A-Za-z0-9]{12,}/g, '[redacted-secret-like-token]')
    .replace(/rk_live_[A-Za-z0-9]{12,}/g, '[redacted-secret-like-token]')
    .replace(/xox(?:b|p|a|r)-[A-Za-z0-9-]{20,}/g, '[redacted-secret-like-token]')
    .replace(/ghp_[A-Za-z0-9]{30,}/g, '[redacted-secret-like-token]')
    .replace(/github_pat_[A-Za-z0-9_]{30,}/g, '[redacted-secret-like-token]')
    .replace(/sk-or-v1-[A-Za-z0-9]{20,}/g, '[redacted-secret-like-token]')
    .replace(/anthropic_[A-Za-z0-9_-]{20,}/g, '[redacted-secret-like-token]');
}

function buildPrompt(issuePath: string | undefined, taskDir: string, contextPath?: string, skillPath?: string): string {
  const issue = issuePath ? readIssue(issuePath) : {};
  const context = contextPath && existsSync(contextPath) ? readFileSync(contextPath, 'utf8') : '';
  // The agent's role/instructions come from its skill (the per-agent variable); the rest is the universal
  // job contract. The agent acts directly — its skill says what to do and which of its tools/capabilities
  // to use; there is no bundle to assemble.
  const skill = skillPath && existsSync(skillPath) ? readFileSync(skillPath, 'utf8') : '';
  return [
    ...(skill
      ? ['Your role and instructions (your skill):', '', skill, '']
      : ['You are an autonomous agent running in a bounded GitHub Actions job.', '']),
    'Act according to your role and instructions above, on the subject below. Use your own tools and',
    'capabilities directly (gh, git). If your role is to change code, edit the working tree — a later step',
    'proposes your changes as an auto-merging pull request. If your role is to review, comment, or label,',
    'perform that yourself via gh. Keep the change focused; make no unrelated edits.',
    '',
    `Subject #${issue.number ?? 'unknown'}: ${issue.title ?? '(untitled)'}`,
    '',
    issue.body ?? '',
    ...(context ? ['', 'Resolved context:', '```json', context, '```'] : []),
    '',
    'Execution constraints:',
    '- Use only the repository checkout and environment provided to this job.',
    '- Do not read, print, or persist secrets.',
    '- Prefer focused checks over broad, slow commands.',
    '- Leave GitHub workflow/security-sensitive files alone unless your subject explicitly asks for them.',
    '',
    'If you change code, write a short PR summary (what changed + tests run) to',
    `${taskDir}/artifacts/pr.md so it becomes the pull request body.`,
  ].join('\n');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const taskDir = process.env.OSS_AGENT_TASK_DIR;
  const proxyUrl = process.env.MODEL_PROXY_URL;
  const proxyToken = process.env.MODEL_PROXY_TOKEN;
  if (!taskDir || !proxyUrl || !proxyToken) usage();

  const artifactsDir = join(taskDir, 'artifacts');
  mkdirSync(artifactsDir, { recursive: true });
  spawnSync('git', ['config', 'core.filemode', 'false'], { cwd: root });

  const issuePath = options.issue ? resolve(options.issue) : undefined;
  const contextPath = options.context ? resolve(options.context) : undefined;
  const prompt = buildPrompt(issuePath, taskDir, contextPath, options.skill ? resolve(options.skill) : undefined);

  // Claude Code talks the Anthropic Messages wire; point it at the bounded proxy and authenticate with the
  // minted run token — no provider key in the sandbox. Full tools, scoped by the job's own permissions.
  const result = await runClaudeAgent({ prompt, cwd: root, model: options.model, baseUrl: proxyUrl, authToken: proxyToken });

  writeFileSync(join(artifactsDir, 'transcript.md'), [
    '# Claude Code Agent Transcript',
    '',
    `Model: ${options.model}`,
    `Exit code: ${result.exitCode}`,
    '',
    '## Final Message',
    '',
    redactSensitive((result.stdout ?? '').trim()),
    '',
    '## stderr',
    '',
    '```text',
    redactSensitive((result.stderr ?? '').trim()),
    '```',
    '',
  ].join('\n'));
  process.exit(result.exitCode);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
