#!/usr/bin/env bun
// Deterministic precondition gate for a merge-review model. Required contexts come from the live base
// branch protection, not profile prose or a runner knob. The reviewer's own status and the independent
// human-approval gate are deliberately parallel, so neither is a prerequisite for model judgment.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { REVIEW_RESULT_SCHEMA, type ReviewResult } from './review-result.js';

const OWN_CONTEXT = 'agent-review';
const PASSING = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED']);
const PENDING = new Set(['', 'EXPECTED', 'PENDING', 'QUEUED', 'IN_PROGRESS', 'WAITING', 'REQUESTED']);

export type CheckRollup = {
  name?: string;
  context?: string;
  status?: string | null;
  conclusion?: string | null;
  state?: string | null;
};

export type PrerequisiteState = {
  passing: string[];
  pending: string[];
  failing: Array<{ name: string; state: string }>;
};

const normalizedState = (check: CheckRollup): string =>
  String(check.conclusion ?? check.state ?? check.status ?? '').toUpperCase();

/** Classify only the live branch-protection contexts that must precede agent judgment. */
export function classifyPrerequisites(required: string[], rollup: CheckRollup[], parallel: string[] = []): PrerequisiteState {
  const result: PrerequisiteState = { passing: [], pending: [], failing: [] };
  const excluded = new Set([OWN_CONTEXT, ...parallel]);
  for (const name of [...new Set(required)].filter((context) => !excluded.has(context))) {
    const matches = rollup.filter((check) => (check.name ?? check.context) === name);
    if (!matches.length) {
      result.pending.push(name);
      continue;
    }
    const states = matches.map(normalizedState);
    const failed = states.find((state) => !PASSING.has(state) && !PENDING.has(state));
    if (failed) result.failing.push({ name, state: failed });
    else if (states.some((state) => PENDING.has(state))) result.pending.push(name);
    else result.passing.push(name);
  }
  return result;
}

type PrView = {
  number?: number;
  state?: string;
  headRefOid?: string;
  baseRefName?: string;
  statusCheckRollup?: CheckRollup[];
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function deterministicFailure(pr: number, sha: string, summary: string, findings: string[]): ReviewResult {
  return {
    schema: REVIEW_RESULT_SCHEMA,
    pr,
    headSha: sha,
    verdict: 'failure',
    outcome: 'changes-requested',
    summary,
    findings,
    humanApprovalRequired: false,
  };
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      pr: { type: 'string' },
      sha: { type: 'string' },
      result: { type: 'string' },
      'github-output': { type: 'string' },
      'timeout-seconds': { type: 'string', default: '600' },
      'poll-seconds': { type: 'string', default: '10' },
      parallel: { type: 'string', multiple: true, default: [] },
    },
  });
  const repo = process.env.GITHUB_REPOSITORY ?? '';
  const pr = Number(values.pr ?? 0);
  const sha = values.sha ?? '';
  const resultPath = values.result ?? '';
  const githubOutput = values['github-output'] ?? process.env.GITHUB_OUTPUT ?? '';
  const timeoutMs = Number(values['timeout-seconds']) * 1000;
  const pollMs = Number(values['poll-seconds']) * 1000;
  if (!repo || !Number.isInteger(pr) || pr <= 0 || !/^[0-9a-f]{40}$/i.test(sha) || !resultPath || !githubOutput) {
    throw new Error('review-prerequisites: missing or invalid repo/PR/SHA/result/output binding');
  }

  const ghJson = (args: string[]): unknown => JSON.parse(execFileSync('gh', args, { encoding: 'utf8' }));
  const writeDecision = (runModel: boolean, result?: ReviewResult): void => {
    mkdirSync(dirname(resultPath), { recursive: true });
    if (result) writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
    writeFileSync(githubOutput, `run_model=${runModel}\n`, { flag: 'a' });
  };

  const started = Date.now();
  let required: string[] | undefined;
  for (;;) {
    try {
      const view = ghJson(['pr', 'view', String(pr), '-R', repo, '--json',
        'number,state,headRefOid,baseRefName,statusCheckRollup']) as PrView;
      if (view.state !== 'OPEN' || view.headRefOid?.toLowerCase() !== sha.toLowerCase()) {
        writeDecision(false, deterministicFailure(pr, sha, 'Review target changed before prerequisites settled.', [
          'The deterministic prerequisite gate refused to review a closed PR or a head other than the bound SHA.',
        ]));
        break;
      }
      if (!view.baseRefName) throw new Error('PR has no base branch');
      if (!required) {
        const branch = ghJson(['api', `repos/${repo}/branches/${encodeURIComponent(view.baseRefName)}`]) as {
          protection?: { required_status_checks?: { contexts?: string[] } };
        };
        required = branch.protection?.required_status_checks?.contexts;
        if (!Array.isArray(required)) throw new Error(`base branch '${view.baseRefName}' exposes no required-check contexts`);
      }
      const state = classifyPrerequisites(required, view.statusCheckRollup ?? [], values.parallel);
      if (state.failing.length) {
        const names = state.failing.map(({ name }) => name);
        writeDecision(false, deterministicFailure(pr, sha, `Required check${names.length === 1 ? '' : 's'} failed: ${names.join(', ')}.`,
          state.failing.map(({ name, state: conclusion }) => `${name} concluded ${conclusion}; repair the mechanical failure before review.`)));
        break;
      }
      if (!state.pending.length) {
        writeDecision(true);
        process.stdout.write(`review-prerequisites: ready (${state.passing.join(', ') || 'no serial prerequisites'})\n`);
        break;
      }
      if (Date.now() - started >= timeoutMs) {
        writeDecision(false, deterministicFailure(pr, sha, 'Review deferred because required checks did not settle in time.', [
          `Still pending or missing: ${state.pending.join(', ')}. Re-run review after the checks settle; this is not a human decision.`,
        ]));
        break;
      }
      process.stdout.write(`review-prerequisites: waiting for ${state.pending.join(', ')}\n`);
      await sleep(pollMs);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      writeDecision(false, deterministicFailure(pr, sha, 'Review prerequisites could not be verified.', [
        `${reason}. Restore the check/branch-protection read path and retry review; this is not a human decision.`,
      ]));
      break;
    }
  }
}
