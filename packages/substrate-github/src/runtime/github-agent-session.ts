#!/usr/bin/env bun
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { makeDecision, validateDecision, writeDecision } from './public-agent-decision.js';
import {
  assertNoRealLookingSecrets,
  copyTree,
  defaultRunId,
  detectEvidence,
  git,
  promoteWebpEvidence,
  readJson,
  writeJson,
  type AgentBundleManifest,
} from './public-agent-bundle.js';

interface Options {
  issue: string;
  runId: string;
  out: string;
  repo: string;
  repoName: string;
  actor: string;
  command: string[];
}

const root = resolve(import.meta.dir, '..');
const OPEN_AUTONOMY_VERSION = readOptionalText(join(root, 'VERSION'))?.trim() || '0.0.0-dev';

function usage(): never {
  throw new Error(`Usage:
  bun scripts/github-agent-session.ts --issue issue.json --out out-dir [--run-id run_...] [--repo owner/repo] [--actor user] -- <agent-command...>`);
}

function parseArgs(argv: string[]): Options {
  const split = argv.indexOf('--');
  const flags = split >= 0 ? argv.slice(0, split) : argv;
  const command = split >= 0 ? argv.slice(split + 1) : [];
  const value = (name: string) => {
    const index = flags.indexOf(name);
    return index >= 0 ? flags[index + 1] : undefined;
  };
  const issue = value('--issue');
  const out = value('--out');
  if (!issue || !out || command.length === 0) usage();
  const issueJson = readJson(resolve(root, issue)) as { number?: number };
  const issueNumber = Number(issueJson.number);
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) throw new Error('issue.number is required');
  return {
    issue,
    runId: value('--run-id') ?? defaultRunId(issueNumber),
    out,
    repo: value('--worktree') ?? root,
    repoName: value('--repo') ?? process.env.GITHUB_REPOSITORY ?? 'local/repo',
    actor: value('--actor') ?? process.env.GITHUB_ACTOR ?? 'local-agent',
    command,
  };
}

function runAgent(options: Options, taskDir: string, issuePath: string): number {
  const command = options.command.map((arg) => arg.replaceAll('{taskDir}', taskDir));
  const result = spawnSync(command[0], command.slice(1), {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      OSS_AGENT_TASK_DIR: taskDir,
      OSS_AGENT_ISSUE_PATH: issuePath,
    },
  });
  return result.status ?? 1;
}

function writeSession(path: string, value: Record<string, unknown>): void {
  writeJson(path, value);
}

function writeRunReceipt(path: string, input: {
  runId: string;
  repo: string;
  issue: number;
  actor: string;
  status: string;
  startedAt: string;
  completedAt: string;
  exitCode: number;
  artifacts: string[];
}): void {
  let proxyHost: string | undefined;
  if (process.env.MODEL_PROXY_URL) {
    try {
      proxyHost = new URL(process.env.MODEL_PROXY_URL).host;
    } catch {
      proxyHost = 'invalid-url';
    }
  }
  writeJson(path, {
    schema: 'volter.agent.run_receipt.v1',
    run_id: input.runId,
    repo: input.repo,
    issue: input.issue,
    actor: input.actor,
    status: input.status,
    started_at: input.startedAt,
    completed_at: input.completedAt,
    exit_code: input.exitCode,
    github: {
      run_id: process.env.GITHUB_RUN_ID ?? null,
      run_attempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
      workflow: process.env.GITHUB_WORKFLOW ?? null,
      ref: process.env.GITHUB_REF_NAME ?? null,
      sha: process.env.GITHUB_SHA ?? null,
    },
    model_proxy: {
      host: proxyHost ?? null,
      model: process.env.PUBLIC_AGENT_MODEL ?? null,
      token_present: Boolean(process.env.MODEL_PROXY_TOKEN),
    },
    limits: {
      max_usd_cents: process.env.PUBLIC_AGENT_MAX_USD_CENTS ?? null,
      max_requests: process.env.PUBLIC_AGENT_MAX_REQUESTS ?? null,
    },
    artifacts: input.artifacts,
  });
}

function terminalArtifact(taskDir: string): string | undefined {
  return ['result.json', 'pr.md', 'blocked.md']
    .map((name) => join(taskDir, 'artifacts', name))
    .find((path) => existsSync(path));
}

function writePatch(repo: string, patchPath: string): void {
  git(repo, ['config', 'core.filemode', 'false'], true);
  git(repo, [
    'add',
    '-N',
    '--',
    '.',
    ':(exclude).agent-run',
    ':(exclude).volter',
    ':(exclude)node_modules',
    ':(exclude)services/agent-model-proxy/.dev.vars',
  ], true);
  const patch = git(repo, [
    'diff',
    '--binary',
    '--',
    '.',
    ':(exclude).volter',
    ':(exclude)node_modules',
    ':(exclude)services/agent-model-proxy/.dev.vars',
  ], true);
  writeFileSync(patchPath, patch);
}

function copyPreDecisions(bundleDecisions: string): string[] {
  const source = process.env.PUBLIC_AGENT_PRE_DECISIONS_DIR;
  if (!source) return [];
  const resolved = resolve(source);
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) return [];
  return copyTree(resolved, bundleDecisions)
    .filter((rel) => rel.endsWith('.json'))
    .map((rel) => {
      validateDecision(readJson(join(bundleDecisions, rel)));
      return `decisions/${rel}`;
    });
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const outDir = resolve(root, options.out);
  const taskDir = join(outDir, 'task');
  const bundleDir = join(outDir, 'bundle');
  const bundleArtifacts = join(bundleDir, 'artifacts');
  const bundleDecisions = join(bundleDir, 'decisions');
  mkdirSync(bundleArtifacts, { recursive: true });
  mkdirSync(bundleDecisions, { recursive: true });

  const sourceIssue = resolve(root, options.issue);
  mkdirSync(join(taskDir, 'artifacts'), { recursive: true });
  const taskIssuePath = join(taskDir, 'issue.json');
  writeFileSync(taskIssuePath, readFileSync(sourceIssue));
  const issue = readJson(sourceIssue) as { number: number; title?: string; body?: string };
  const sessionPath = join(taskDir, 'session.json');
  const startedAt = new Date().toISOString();
  writeSession(sessionPath, {
    startedAt,
    issue,
    taskDir,
    status: 'running',
    command: options.command,
  });

  const exitCode = runAgent(options, taskDir, taskIssuePath);
  if (exitCode !== 0 && !existsSync(join(taskDir, 'artifacts', 'blocked.md'))) {
    writeFileSync(join(taskDir, 'artifacts', 'blocked.md'), [
      '# Agent Blocked',
      '',
      `Agent command exited with code ${exitCode}.`,
      '',
    ].join('\n'));
  }
  const artifact = terminalArtifact(taskDir);
  if (!artifact) {
    writeFileSync(join(taskDir, 'artifacts', 'blocked.md'), [
      '# Agent Blocked',
      '',
      'Agent did not emit result.json, pr.md, or blocked.md.',
      '',
    ].join('\n'));
  }
  const completedAt = new Date().toISOString();
  writeSession(sessionPath, {
    startedAt,
    completedAt,
    issue,
    taskDir,
    // blocked.md is authoritative for escalation: an agent that writes it (an escalate-early
    // hand-off) is `blocked` even when it exits 0 — otherwise a clean escalation is mislabeled
    // `pr-ready` and surfaces as a PR instead of a hand-off.
    status: existsSync(join(taskDir, 'artifacts', 'blocked.md')) ? 'blocked' : exitCode === 0 && artifact ? 'pr-ready' : 'blocked',
    exitCode,
  });

  if (!existsSync(sessionPath)) throw new Error('agent session did not emit session.json');

  const session = readJson(sessionPath) as { status?: string; issue?: { number?: number } };
  const status = session.status === 'pr-ready' ? 'pr-ready' : session.status === 'blocked' ? 'blocked' : 'failed';
  const issueNumber = Number(session.issue?.number ?? (readJson(resolve(root, options.issue)) as { number: number }).number);

  const copiedArtifactRels = copyTree(join(taskDir, 'artifacts'), bundleArtifacts).map((rel) => `artifacts/${rel}`);
  const artifactRels = promoteWebpEvidence(bundleDir, copiedArtifactRels);
  const bundleSession = join(bundleDir, 'session.json');
  const bundleReceipt = join(bundleDir, 'run-receipt.json');
  const bundleTranscript = join(bundleDir, 'transcript.md');
  writeFileSync(bundleSession, readFileSync(sessionPath));
  writeRunReceipt(bundleReceipt, {
    runId: options.runId,
    repo: options.repoName,
    issue: issueNumber,
    actor: options.actor,
    status,
    startedAt,
    completedAt,
    exitCode,
    artifacts: artifactRels,
  });
  const artifactTranscript = join(bundleDir, 'artifacts', 'transcript.md');
  if (existsSync(artifactTranscript)) writeFileSync(bundleTranscript, readFileSync(artifactTranscript));
  const patchPath = join(bundleDir, 'changes.patch');
  writePatch(options.repo, patchPath);
  const preDecisionRels = copyPreDecisions(bundleDecisions);
  const decisionPath = writeDecision(bundleDecisions, makeDecision({
    stage: 'develop',
    issue: issueNumber,
    run_id: options.runId,
    actor: options.actor,
    decision: status,
    subject: { type: 'issue', number: issueNumber, branch: `agent/issue-${issueNumber}` },
    evidence: [
      'session:session.json',
      'patch:changes.patch',
      ...artifactRels.map((rel) => `artifact:${rel}`),
    ],
    next_action: status === 'pr-ready' ? 'publish' : 'escalate',
  }));
  const decisionRels = [...preDecisionRels, relative(bundleDir, decisionPath)];

  try {
    assertNoRealLookingSecrets([
      bundleSession,
      bundleReceipt,
      ...(existsSync(bundleTranscript) ? [bundleTranscript] : []),
      patchPath,
      ...decisionRels.map((rel) => join(bundleDir, rel)),
      ...artifactRels.map((rel) => join(bundleDir, rel)),
    ]);
  } catch (error) {
    writeBlockedBundle({
      bundleDir,
      runId: options.runId,
      repo: options.repoName,
      issue: issueNumber,
      actor: options.actor,
      reason: error instanceof Error ? error.message : String(error),
    });
    process.stdout.write(`agent-bundle=${bundleDir}\n`);
    process.exit(0);
  }

  const manifest: AgentBundleManifest = {
    schema_version: 1,
    run_id: options.runId,
    repo: options.repoName,
    open_autonomy: {
      version: OPEN_AUTONOMY_VERSION,
      profile: process.env.OPEN_AUTONOMY_PROFILE || process.env.PUBLIC_AGENT_PROFILE || 'default',
    },
    issue: issueNumber,
    actor: options.actor,
    status,
    created_at: new Date().toISOString(),
    session: basename(bundleSession),
    run_receipt: basename(bundleReceipt),
    transcript: existsSync(bundleTranscript) ? basename(bundleTranscript) : undefined,
    patch: basename(patchPath),
    decisions: decisionRels,
    artifacts: artifactRels,
    evidence: detectEvidence(artifactRels),
  };
  writeJson(join(bundleDir, 'manifest.json'), manifest);
  process.stdout.write(`agent-bundle=${bundleDir}\n`);
  process.exit(exitCode === 0 || status === 'blocked' ? 0 : 1);
}

function writeBlockedBundle(input: {
  bundleDir: string;
  runId: string;
  repo: string;
  issue: number;
  actor: string;
  reason: string;
}): void {
  rmSync(input.bundleDir, { recursive: true, force: true });
  const artifactsDir = join(input.bundleDir, 'artifacts');
  const decisionsDir = join(input.bundleDir, 'decisions');
  mkdirSync(artifactsDir, { recursive: true });
  mkdirSync(decisionsDir, { recursive: true });

  const sessionPath = join(input.bundleDir, 'session.json');
  const patchPath = join(input.bundleDir, 'changes.patch');
  writeJson(sessionPath, {
    status: 'blocked',
    issue: { number: input.issue },
    reason: 'public evidence secret scan failed',
    failure_signature: input.reason,
  });
  writeRunReceipt(join(input.bundleDir, 'run-receipt.json'), {
    runId: input.runId,
    repo: input.repo,
    issue: input.issue,
    actor: input.actor,
    status: 'blocked',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    exitCode: 1,
    artifacts: [],
  });
  writeFileSync(patchPath, '');

  const decisionPath = writeDecision(decisionsDir, makeDecision({
    stage: 'develop',
    issue: input.issue,
    run_id: input.runId,
    actor: input.actor,
    decision: 'blocked',
    reason: 'public evidence secret scan failed',
    failure_signature: input.reason,
    evidence: ['session:session.json'],
    next_action: 'escalate',
  }));
  const decisionRels = [relative(input.bundleDir, decisionPath)];
  const manifest: AgentBundleManifest = {
    schema_version: 1,
    run_id: input.runId,
    repo: input.repo,
    open_autonomy: {
      version: OPEN_AUTONOMY_VERSION,
      profile: process.env.OPEN_AUTONOMY_PROFILE || process.env.PUBLIC_AGENT_PROFILE || 'default',
    },
    issue: input.issue,
    actor: input.actor,
    status: 'blocked',
    created_at: new Date().toISOString(),
    session: basename(sessionPath),
    run_receipt: 'run-receipt.json',
    patch: basename(patchPath),
    decisions: decisionRels,
    artifacts: [],
    evidence: [],
  };
  writeJson(join(input.bundleDir, 'manifest.json'), manifest);
  assertNoRealLookingSecrets([
    sessionPath,
    join(input.bundleDir, 'run-receipt.json'),
    patchPath,
    ...decisionRels.map((rel) => join(input.bundleDir, rel)),
  ]);
}

function readOptionalText(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  return readFileSync(path, 'utf8');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
