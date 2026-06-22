#!/usr/bin/env bun
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runClaudeAgent } from './agent-loop.js';

type Options = {
  issue?: string;
  context?: string;
  model: string;
  skill?: string; // path to the agent's SKILL.md — its role/instructions (the per-agent variable)
};

const root = resolve(import.meta.dir, '..');

function usage(): never {
  throw new Error(`Usage:
  MODEL_PROXY_URL=... MODEL_PROXY_TOKEN=... OSS_AGENT_TASK_DIR=... bun scripts/claude-agent-run.ts [--issue issue.json] [--context context.json] [--model deepseek/deepseek-v4-flash]`);
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
  return JSON.parse(readFileSync(issuePath, 'utf8')) as { number?: number; title?: string; body?: string };
}

function redactSensitive(text: string): string {
  return text
    .replace(/sk_live_[A-Za-z0-9]{12,}/g, '[redacted-secret-like-token]')
    .replace(/rk_live_[A-Za-z0-9]{12,}/g, '[redacted-secret-like-token]')
    .replace(/xox(?:b|p|a|r)-[A-Za-z0-9-]{20,}/g, '[redacted-secret-like-token]')
    .replace(/ghp_[A-Za-z0-9]{30,}/g, '[redacted-secret-like-token]')
    .replace(/github_pat_[A-Za-z0-9_]{30,}/g, '[redacted-secret-like-token]')
    .replace(/sk-or-v1-[A-Za-z0-9]{20,}/g, '[redacted-secret-like-token]')
    .replace(/anthropic_[A-Za-z0-9_-]{20,}/g, '[redacted-secret-like-token]')
    .replace(/OPENAI_API_KEY\s*=\s*sk-[A-Za-z0-9_-]{20,}/g, 'OPENAI_API_KEY=[redacted-secret-like-token]');
}

function buildPrompt(issuePath: string, taskDir: string, contextPath?: string, skillPath?: string): string {
  const issue = readIssue(issuePath);
  const context = contextPath && existsSync(contextPath)
    ? readFileSync(contextPath, 'utf8')
    : '';
  // The agent's role/instructions come from its skill (the per-agent variable); everything else in
  // this prompt is the universal job contract (act on the issue, write the bundle artifacts).
  const skill = skillPath && existsSync(skillPath) ? readFileSync(skillPath, 'utf8') : '';
  return [
    ...(skill
      ? ['Your role and instructions (your skill):', '', skill, '']
      : ['You are an autonomous agent running in a bounded GitHub Actions job.', '']),
    'Act on the GitHub issue below according to your role. Make a small but real, focused change that addresses it; do not make unrelated refactors.',
    '',
    `Issue #${issue.number ?? 'unknown'}: ${issue.title ?? '(untitled)'}`,
    '',
    issue.body ?? '',
    ...(context ? [
      '',
      'Resolved public-agent context:',
      '```json',
      context,
      '```',
    ] : []),
    '',
    'Execution constraints:',
    '- Use only the repository checkout and environment provided to this job.',
    '- Do not read, print, or persist secrets.',
    '- Prefer focused checks over broad, slow commands.',
    '- Leave GitHub workflow/security-sensitive changes alone unless the issue explicitly asks for them.',
    '',
    'Before finishing, write these files:',
    `- ${taskDir}/artifacts/pr.md with a PR-ready summary and tests run.`,
    `- ${taskDir}/artifacts/result.json with JSON fields: ok, issue, summary, tests.`,
    `- ${taskDir}/artifacts/transcript.md with concise notes about what you changed and verified.`,
    '',
    'If you cannot complete the requested change, write blocked.md in the artifacts directory explaining exactly what is missing.',
  ].join('\n');
}

function writeContextSummary(artifactsDir: string, contextPath?: string): void {
  if (!contextPath || !existsSync(contextPath)) return;
  const context = JSON.parse(readFileSync(contextPath, 'utf8')) as {
    context_sources?: string[];
    recent_issue_comments?: unknown[];
    previous_decisions?: unknown[];
    current_pr?: unknown;
  };
  writeFileSync(join(artifactsDir, 'context-sources.json'), `${JSON.stringify({
    context_sources: context.context_sources ?? [],
    recent_issue_comments: context.recent_issue_comments?.length ?? 0,
    previous_decisions: context.previous_decisions?.length ?? 0,
    has_current_pr: Boolean(context.current_pr),
  }, null, 2)}\n`);
}

function changedFiles(): string[] {
  const result = spawnSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) return [];
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.includes(' .agent-run/'))
    .filter((line) => !line.includes(' agent-sessions/'));
}

function ensureArtifacts(taskDir: string, issuePath: string, exitCode: number, finalMessage: string): void {
  const artifactsDir = join(taskDir, 'artifacts');
  mkdirSync(artifactsDir, { recursive: true });
  const issue = readIssue(issuePath);
  const files = changedFiles();

  if (exitCode !== 0 && !existsSync(join(artifactsDir, 'blocked.md'))) {
    writeFileSync(join(artifactsDir, 'blocked.md'), [
      '# Agent Blocked',
      '',
      `Claude Code exited with code ${exitCode}.`,
      '',
      finalMessage.trim(),
      '',
    ].join('\n'));
  }

  if (!existsSync(join(artifactsDir, 'pr.md'))) {
    writeFileSync(join(artifactsDir, 'pr.md'), [
      `# PR for ${issue.title ?? `issue ${issue.number ?? 'unknown'}`}`,
      '',
      '## Summary',
      finalMessage.trim() || '- Claude Code completed the requested run.',
      '',
      '## Changed files',
      ...(files.length ? files.map((file) => `- \`${file}\``) : ['- No repository file changes detected.']),
      '',
      '## Tests',
      '- See `artifacts/transcript.md` and `artifacts/result.json`.',
      '',
    ].join('\n'));
  }

  if (!existsSync(join(artifactsDir, 'result.json'))) {
    writeFileSync(join(artifactsDir, 'result.json'), `${JSON.stringify({
      ok: exitCode === 0,
      issue: issue.number,
      summary: finalMessage.trim(),
      changed_files: files,
      tests: [],
    }, null, 2)}\n`);
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const taskDir = process.env.OSS_AGENT_TASK_DIR;
  const proxyUrl = process.env.MODEL_PROXY_URL;
  const proxyToken = process.env.MODEL_PROXY_TOKEN;
  if (!taskDir || !proxyUrl || !proxyToken || !options.issue) usage();

  const issuePath = resolve(options.issue);
  const artifactsDir = join(taskDir, 'artifacts');
  mkdirSync(artifactsDir, { recursive: true });
  spawnSync('git', ['config', 'core.filemode', 'false'], { cwd: root });

  const finalPath = join(artifactsDir, 'claude-final.txt');
  const contextPath = options.context ? resolve(options.context) : undefined;
  writeContextSummary(artifactsDir, contextPath);
  const prompt = buildPrompt(issuePath, taskDir, contextPath, options.skill ? resolve(options.skill) : undefined);

  // Claude Code talks the Anthropic Messages wire; point it at the bounded proxy (whose native
  // /v1/messages route serves it) and authenticate with the minted run token — no provider key in the
  // sandbox. Every model slot maps to the one allowed model so background/subagent calls stay in budget.
  // The developer is the SAME agent at full capability (it writes code): no allowedTools limit → full
  // tools, pointed at the bounded proxy with the minted run token. Decisions use the same primitive,
  // read-only (see decide). Capability + endpoint are the only knobs.
  const result = runClaudeAgent({ prompt, cwd: root, model: options.model, baseUrl: proxyUrl, authToken: proxyToken });
  writeFileSync(finalPath, result.stdout);

  let finalMessage = redactSensitive(existsSync(finalPath) ? readFileSync(finalPath, 'utf8') : (result.stdout ?? ''));
  writeFileSync(join(artifactsDir, 'transcript.md'), [
    '# Claude Code Agent Transcript',
    '',
    `Model: ${options.model}`,
    `Exit code: ${result.exitCode}`,
    '',
    '## Final Message',
    '',
    finalMessage.trim(),
    '',
    '## stderr',
    '',
    '```text',
    redactSensitive(result.stderr.trim()),
    '```',
    '',
  ].join('\n'));

  let exitCode = result.exitCode;
  if (exitCode === 0 && changedFiles().length === 0 && !existsSync(join(artifactsDir, 'blocked.md'))) {
    exitCode = 1;
    finalMessage = [
      finalMessage.trim(),
      '',
      'No repository changes were produced, so this run is marked blocked rather than PR-ready.',
    ].join('\n').trim();
  }
  ensureArtifacts(taskDir, issuePath, exitCode, finalMessage);
  process.exit(exitCode);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
