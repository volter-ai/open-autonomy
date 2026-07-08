// OA-08 AC-7 test-support: a CANNED PM driver for the launch-failed escalation doctrine
// (profiles/simple-sdlc/skills/pm/SKILL.md, "## Failed launches", :103-132).
//
// Every MECHANISM this driver touches is real:
//   - dispatch is the REAL `bun scripts/runner.ts launch develop --ref <id> --branch agent/issue-<id>`
//     (runner-frontend.ts's model-free pre-check refusal path, proven by launch-verification.test.ts's AC-1);
//   - board reads/writes are the REAL `ztrack` CLI (issue view/edit/comment) against the real committed
//     board (.volter/tracker/markdown/<id>.md front-matter is the durable, cross-tick memory).
//
// The ONLY thing "canned" here is WHICH action to take each tick — that judgment is scripted 1:1 off the
// doctrine's literal rules below, standing in for what a real model-driven PM tick would decide by reading
// SKILL.md + the board. See packages/substrate-local/src/pm-escalation.test.ts's header comment for the full
// honest-boundary statement (this driver proves board-mechanics + real runner-refusal, NOT model judgment).
import { createRequire } from 'node:module';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';

const require = createRequire(import.meta.url);

/** Absolute path to the real installed ztrack CLI entry point, resolved from THIS package's own node_modules
 *  (a bun workspace hoists `ztrack` to the repo root because it is the repo's own pinned devDependency — see
 *  bin/ztrack-preset.ts's KNOWN_GOOD_ZTRACK). Invoked by absolute path (never `bunx`/`npx`) so a fixture's own
 *  temp-dir cwd doesn't need to resolve `ztrack` as a project dependency for `issue` commands to work at all
 *  (only the installed preset.mts's own `ztrack/preset-kit` import needs that — see `linkZtrackForCheck` in
 *  the test file, used only for the one assertion that runs a real `ztrack check`). */
export function resolveZtrackCli(): string {
  return require.resolve('ztrack/package.json').replace(/package\.json$/, 'dist/cli.js');
}

export function ztrack(dir: string, args: string[], ztrackCli: string = resolveZtrackCli()): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [ztrackCli, ...args], { cwd: dir, encoding: 'utf8' });
}

export function ztrackOk(dir: string, args: string[], ztrackCli: string = resolveZtrackCli()): string {
  const r = ztrack(dir, args, ztrackCli);
  if (r.status !== 0) throw new Error(`ztrack ${args.join(' ')} failed in ${dir}: ${r.stderr || r.stdout}`);
  return r.stdout;
}

interface ZtrackIssueView {
  labels?: { nodes: Array<{ name: string }> };
  comments?: { nodes: Array<{ body: string }> };
}

/** Real read of the issue's current label set, straight off the committed board (`ztrack issue view --json`). */
export function readLabels(dir: string, issueId: string, ztrackCli: string = resolveZtrackCli()): string[] {
  const out = ztrackOk(dir, ['issue', 'view', issueId, '--json'], ztrackCli);
  const parsed = JSON.parse(out) as ZtrackIssueView;
  return (parsed.labels?.nodes ?? []).map((l) => l.name);
}

/** Real read of the issue's comment bodies, in order — used to assert the runner's error line actually landed
 *  in a comment (`ztrack issue comment`), not just that a label got set. */
export function readComments(dir: string, issueId: string, ztrackCli: string = resolveZtrackCli()): string[] {
  const out = ztrackOk(dir, ['issue', 'view', issueId, '--json'], ztrackCli);
  const parsed = JSON.parse(out) as ZtrackIssueView;
  return (parsed.comments?.nodes ?? []).map((c) => c.body);
}

export type CannedPmAction = 'skip-human-required' | 'dispatched-ok' | 'first-failure' | 'second-failure-escalate';

export interface CannedPmTickResult {
  dispatched: boolean;
  launch: SpawnSyncReturns<string> | null;
  action: CannedPmAction;
  labelsBefore: string[];
  labelsAfter: string[];
  outcomeLine: string | null;
  errorLine: string | null;
}

export interface CannedPmTickArgs {
  dir: string;
  issueId: string;
  branch: string;
  env: NodeJS.ProcessEnv;
  ztrackCli?: string;
}

/**
 * One canned PM tick over a single ref, replaying profiles/simple-sdlc/skills/pm/SKILL.md's
 * "## Failed launches" rule (:103-132) verbatim:
 *
 *   - `human-required` already on the issue -> NEVER dispatch (doctrine :131-132). Nothing launched, board
 *     untouched — this is the tick-3 "hands off" behavior.
 *   - otherwise -> dispatch: run the REAL doctrine command (:95-97,117 "launch develop --ref <id> --branch
 *     agent/issue-<id>").
 *       - exit 0            -> a real dispatch happened; clear `launch-failed` if it was set (:122-123).
 *       - exit non-zero,
 *         `launch-failed` NOT yet set -> first failure: add `launch-failed` + comment the runner's error
 *         line before ending the tick (:117-120).
 *       - exit non-zero,
 *         `launch-failed` ALREADY set -> second failure = escalate (N=2, :121): add `human-required` +
 *         comment the runner's error line + the tick's `OUTCOME: blocked launch-failure <id>` line
 *         (:124-126).
 *
 * Returns a plain object describing what happened, for the test to assert against — including the labels
 * before/after (both REAL reads off the board) and the `launch` subprocess result (status/stdout/stderr) so
 * the caller can assert non-zero exit / no-session / no-effect-marker independently.
 */
export function runCannedPmTick({ dir, issueId, branch, env, ztrackCli = resolveZtrackCli() }: CannedPmTickArgs): CannedPmTickResult {
  const labelsBefore = readLabels(dir, issueId, ztrackCli);

  if (labelsBefore.includes('human-required')) {
    return {
      dispatched: false,
      launch: null,
      action: 'skip-human-required',
      labelsBefore,
      labelsAfter: labelsBefore,
      outcomeLine: null,
      errorLine: null,
    };
  }

  const launch = spawnSync('bun', ['scripts/runner.ts', 'launch', 'develop', '--ref', issueId, '--branch', branch], {
    cwd: dir,
    encoding: 'utf8',
    env,
  });
  const stderrLines = (launch.stderr || '').trim().split('\n').filter(Boolean);
  const errorLine = stderrLines.find((l) => l.includes('launch refused')) ?? stderrLines[stderrLines.length - 1] ?? '(no stderr captured)';

  if (launch.status === 0) {
    if (labelsBefore.includes('launch-failed')) {
      ztrackOk(dir, ['issue', 'edit', issueId, '--remove-label', 'launch-failed'], ztrackCli);
    }
    return {
      dispatched: true,
      launch,
      action: 'dispatched-ok',
      labelsBefore,
      labelsAfter: readLabels(dir, issueId, ztrackCli),
      outcomeLine: null,
      errorLine: null,
    };
  }

  if (!labelsBefore.includes('launch-failed')) {
    ztrackOk(dir, ['issue', 'edit', issueId, '--add-label', 'launch-failed'], ztrackCli);
    ztrackOk(dir, ['issue', 'comment', issueId, '--body', errorLine], ztrackCli);
    return {
      dispatched: true,
      launch,
      action: 'first-failure',
      labelsBefore,
      labelsAfter: readLabels(dir, issueId, ztrackCli),
      outcomeLine: null,
      errorLine,
    };
  }

  ztrackOk(dir, ['issue', 'edit', issueId, '--add-label', 'human-required'], ztrackCli);
  ztrackOk(dir, ['issue', 'comment', issueId, '--body', errorLine], ztrackCli);
  const outcomeLine = `OUTCOME: blocked launch-failure ${issueId}`;
  return {
    dispatched: true,
    launch,
    action: 'second-failure-escalate',
    labelsBefore,
    labelsAfter: readLabels(dir, issueId, ztrackCli),
    outcomeLine,
    errorLine,
  };
}
