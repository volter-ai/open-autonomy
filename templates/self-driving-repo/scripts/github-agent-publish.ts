#!/usr/bin/env bun
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  assertBundleArtifactsSafe,
  assertBundlePathsSafe,
  assertEvidenceManifestSafe,
  assertNoRealLookingSecrets,
  assertPatchSafe,
  copyTree,
  DEFAULT_PATCH_POLICY,
  git,
  readJson,
  validateManifest,
  writeJson,
  type AgentBundleManifest,
  type PatchPolicy,
} from './public-agent-bundle.js';
import { validateDecision } from './public-agent-decision.js';

interface Options {
  bundle: string;
  repo: string;
  apply: boolean;
  out: string;
  promoteDir?: string;
  expectedRunId?: string;
  expectedRepo?: string;
  expectedIssue?: number;
  expectedActor?: string;
  allowedPaths: string[];
}

const root = resolve(import.meta.dir, '..');

function usage(): never {
  throw new Error(`Usage:
  bun scripts/github-agent-publish.ts --bundle bundle-dir [--repo worktree] [--out summary.json] [--apply] [--expected-run-id run_...]`);
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const bundle = value('--bundle');
  if (!bundle) usage();
  const expectedIssue = value('--expected-issue');
  return {
    bundle,
    repo: value('--repo') ?? root,
    apply: argv.includes('--apply'),
    out: value('--out') ?? join(bundle, 'publish-summary.json'),
    promoteDir: value('--promote-dir'),
    expectedRunId: value('--expected-run-id'),
    expectedRepo: value('--expected-repo'),
    expectedIssue: expectedIssue === undefined ? undefined : Number(expectedIssue),
    expectedActor: value('--expected-actor'),
    allowedPaths: parseList(value('--allowed-paths') ?? process.env.PUBLIC_AGENT_ALLOWED_PATHS).length
      ? parseList(value('--allowed-paths') ?? process.env.PUBLIC_AGENT_ALLOWED_PATHS)
      : DEFAULT_PATCH_POLICY.allowedPaths,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const bundleDir = resolve(root, options.bundle);
  const repo = resolve(root, options.repo);
  const manifest = validateManifest(readJson(join(bundleDir, 'manifest.json')));
  assertBundlePathsSafe(bundleDir, manifest);
  assertExpectedManifest(manifest, options);
  if (manifest.status !== 'pr-ready') throw new Error(`agent bundle status is not pr-ready: ${manifest.status}`);
  assertBundleArtifactsSafe(bundleDir, manifest);
  assertEvidenceManifestSafe(bundleDir, manifest);
  assertBundleDecisionsSafe(bundleDir, manifest);

  const patchPath = join(bundleDir, manifest.patch);
  const patchText = readFileSync(patchPath, 'utf8');
  const patchPolicy: PatchPolicy = { allowedPaths: options.allowedPaths };
  assertPatchSafe(patchText, patchPolicy);
  assertNoRealLookingSecrets([
    join(bundleDir, manifest.session),
    ...(manifest.run_receipt ? [join(bundleDir, manifest.run_receipt)] : []),
    ...(manifest.transcript ? [join(bundleDir, manifest.transcript)] : []),
    patchPath,
    ...(manifest.decisions ?? []).map((rel) => join(bundleDir, rel)),
    ...manifest.artifacts.map((rel) => join(bundleDir, rel)),
  ]);

  if (patchText.trim()) {
    git(repo, ['apply', '--check', patchPath]);
    if (options.apply) git(repo, ['apply', patchPath]);
  }

  const summary = {
    ok: true,
    run_id: manifest.run_id,
    repo: manifest.repo,
    issue: manifest.issue,
    status: manifest.status,
    patch_empty: patchText.trim().length === 0,
    applied: options.apply && patchText.trim().length > 0,
    decisions: manifest.decisions ?? [],
    evidence: manifest.evidence,
  };
  mkdirSync(dirname(resolve(root, options.out)), { recursive: true });
  writeJson(resolve(root, options.out), summary);
  writeFileSync(join(bundleDir, 'pr-body.md'), renderPrBody(summary));
  if (options.promoteDir) promoteBundle(bundleDir, resolve(repo, options.promoteDir), summary);
  process.stdout.write(`publish-summary=${resolve(root, options.out)}\n`);
}

function parseList(value: string | undefined): string[] {
  return value?.split(',').map((item) => item.trim()).filter(Boolean) ?? [];
}

function assertExpectedManifest(manifest: AgentBundleManifest, options: Options): void {
  if (options.expectedRunId && manifest.run_id !== options.expectedRunId) {
    throw new Error(`manifest.run_id mismatch: ${manifest.run_id}`);
  }
  if (options.expectedRepo && manifest.repo !== options.expectedRepo) {
    throw new Error(`manifest.repo mismatch: ${manifest.repo}`);
  }
  if (options.expectedIssue !== undefined && manifest.issue !== options.expectedIssue) {
    throw new Error(`manifest.issue mismatch: ${manifest.issue}`);
  }
  if (options.expectedActor && manifest.actor !== options.expectedActor) {
    throw new Error(`manifest.actor mismatch: ${manifest.actor}`);
  }
}

function promoteBundle(bundleDir: string, targetDir: string, summary: unknown): void {
  mkdirSync(targetDir, { recursive: true });
  copyTree(join(bundleDir, 'artifacts'), join(targetDir, 'artifacts'));
  copyTree(join(bundleDir, 'decisions'), join(targetDir, 'decisions'));
  for (const name of ['manifest.json', 'session.json', 'pr-body.md']) {
    writeFileSync(join(targetDir, name), readFileSync(join(bundleDir, name)));
  }
  for (const name of ['run-receipt.json', 'transcript.md']) {
    if (existsSync(join(bundleDir, name))) writeFileSync(join(targetDir, name), readFileSync(join(bundleDir, name)));
  }
  writeJson(join(targetDir, 'publish-summary.json'), summary);
}

function assertBundleDecisionsSafe(bundleDir: string, manifest: AgentBundleManifest): void {
  const decisions = [...new Set(manifest.decisions ?? [])];
  if (decisions.length > 25) throw new Error(`too many decision files: ${decisions.length} > 25`);
  for (const rel of decisions) {
    if (!rel.startsWith('decisions/') || !rel.endsWith('.json')) throw new Error(`decision path is invalid: ${rel}`);
    const path = join(bundleDir, rel);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error(`decision symlink is not allowed: ${rel}`);
    if (!stat.isFile()) throw new Error(`decision is not a regular file: ${rel}`);
    validateDecision(JSON.parse(readFileSync(path, 'utf8')));
    if (stat.size > 256 * 1024) throw new Error(`decision file too large: ${rel}`);
  }
}

function renderPrBody(summary: { run_id: string; status: string; issue: number; decisions?: string[]; evidence: unknown[] }): string {
  return [
    `Public agent run: ${summary.run_id}`,
    '',
    `Issue: #${summary.issue}`,
    `Closes #${summary.issue}`,
    `Status: ${summary.status}`,
    `Decision files: ${summary.decisions?.length ?? 0}`,
    `Evidence files: ${summary.evidence.length}`,
    '',
    'Raw logs remain in the GitHub Actions artifact for this run.',
    '',
  ].join('\n');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
