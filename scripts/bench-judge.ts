#!/usr/bin/env bun
// Bench judge — scores the OUTCOME of an autonomous run against a workload's rubric, with an AI judge that
// actually INVESTIGATES the result. A bench cell is profile × substrate × workload (docs/VISION.md): the
// org is handed a substantial goal, runs for real time, and the result is a matter of JUDGMENT. It runs
// the agent (full capability) over the result repo so the judge reads the diff, runs the tests, and
// reproduces the behavior before scoring — not a truncated text dump — and returns a schema'd score via
// runClaudeAgent's result. Pair with the coverage grader (scripts/bench-coverage.ts: which scenarios the
// live run proved) for the full fitness reading: quality × coverage.
//
//   bun scripts/bench-judge.ts --workload bench/workload/todo-cli --result <run-repo> [--out score.json]
//
// The judge is an INDEPENDENT agentic scorer (evaluator ≠ evaluated): it runs on the OPERATOR's own
// model access — your local Claude Code or Codex login — NEVER the cell's funded proxy. So it has its
// own tiny harness-agnostic runner below (claude -p | codex exec, no baseUrl/authToken => ambient
// operator creds), separate from the org's runClaudeAgent. It reuses only the pure JSON helpers.
import { readFileSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { missingRequired, salvageSubmission } from './agent.js';

type Harness = 'claude' | 'codex';

// Run the judge on the operator's own harness. No ANTHROPIC_BASE_URL / auth token is injected, so each
// CLI uses its ambient (operator) credentials — independent of the cell under test and its funding.
// The result is written to a file (uniform across harnesses); stdout salvage is the fallback.
function runJudgeAgent(
  harness: Harness,
  model: string | undefined,
  prompt: string,
  cwd: string,
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const outFile = join(mkdtempSync(join(tmpdir(), 'oa-judge-')), 'result.json');
  const fullPrompt = [
    prompt,
    '',
    'Investigate the repository (read files, run the tests/checks) before scoring.',
    `WRITE your final answer as a single JSON object to: ${outFile}`,
    'It MUST satisfy this JSON Schema (every required field present, allowed enum values only):',
    JSON.stringify(schema),
  ].join('\n');
  const common = { input: fullPrompt, cwd, encoding: 'utf8' as const, maxBuffer: 64 * 1024 * 1024 };
  // missingRequired only checks TOP-LEVEL keys, so `{criteria:[{}], summary:'s'}` would pass and then
  // score 0 silently (every byId.get(id) undefined). Validate the nested criteria shape too, so a
  // malformed artifact is rejected and the attempt retries / salvages instead of corrupting the score.
  const wellFormed = (v: Record<string, unknown>): boolean =>
    missingRequired(schema, v).length === 0 &&
    Array.isArray(v.criteria) &&
    (v.criteria as unknown[]).length > 0 && // an EMPTY array passes .every() and scores 0% silently
    (v.criteria as unknown[]).every(
      (c) =>
        !!c &&
        typeof c === 'object' &&
        typeof (c as Record<string, unknown>).id === 'string' &&
        typeof (c as Record<string, unknown>).score === 'number' &&
        typeof (c as Record<string, unknown>).justification === 'string',
    );
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res =
      harness === 'codex'
        ? spawnSync('codex', ['exec', ...(model ? ['--model', model] : []), '-C', cwd, '--skip-git-repo-check', '--dangerously-bypass-approvals-and-sandbox'], common)
        : spawnSync('claude', ['-p', ...(model ? ['--model', model] : []), '--permission-mode', 'bypassPermissions'], common);
    console.error(`  [judge:${harness}] attempt ${attempt} (exit ${res.status ?? 1})`);
    let fromFile: Record<string, unknown> | null = null;
    if (existsSync(outFile)) {
      try {
        const v = JSON.parse(readFileSync(outFile, 'utf8')) as Record<string, unknown>;
        fromFile = wellFormed(v) ? v : null;
      } catch {
        /* corrupt — fall through to salvage */
      }
    }
    const salvaged = fromFile ?? salvageSubmission(res.stdout || '', schema);
    const artifact = salvaged && wellFormed(salvaged) ? salvaged : null;
    if (artifact) return artifact;
  }
  throw new Error(`bench-judge: ${harness} produced no schema-valid result${model ? ` (model=${model})` : ''}`);
}

interface Rubric {
  id: string;
  criterion: string;
  weight: number;
  guidance?: string;
}
interface Workload {
  name: string;
  kind: string;
  summary: string;
  rubric: Rubric[];
}
interface CriterionScore {
  id: string;
  score: number;
  justification: string;
}

const arg = (n: string, d = '') => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : d;
};

const workloadDir = arg('--workload');
const resultDir = arg('--result');
// Operator's own harness + model. Default to claude on the operator's local Claude Code; --harness codex
// uses local Codex. No model default forces a proxy-routed model — undefined => each CLI's own default
// (your login), keeping the judge independent of the cell's funded endpoint.
const harness = ((arg('--harness', process.env.BENCH_JUDGE_HARNESS || 'claude')) as Harness);
const model = arg('--model', process.env.BENCH_JUDGE_MODEL || '') || undefined;
const out = arg('--out');
if (!workloadDir || !resultDir || (harness !== 'claude' && harness !== 'codex')) {
  console.error('usage: bun scripts/bench-judge.ts --workload <dir> --result <repo> [--harness claude|codex] [--model m] [--out f]');
  process.exit(2);
}

const workload = JSON.parse(readFileSync(join(workloadDir, 'workload.json'), 'utf8')) as Workload;
const goal = existsSync(join(workloadDir, 'goal.md')) ? readFileSync(join(workloadDir, 'goal.md'), 'utf8') : workload.summary;
const rubricText = workload.rubric
  .map((r) => `- [${r.id}] (weight ${r.weight}) ${r.criterion}${r.guidance ? `\n    guidance: ${r.guidance}` : ''}`)
  .join('\n');

const schema = {
  type: 'object',
  properties: {
    criteria: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, score: { type: 'number' }, justification: { type: 'string' } },
        required: ['id', 'score', 'justification'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['criteria', 'summary'],
};

const system = [
  'You are an exacting engineering reviewer judging whether an autonomous software org ACHIEVED a goal.',
  'INVESTIGATE the result repository with your tools before scoring: list files, read the relevant code and',
  'tests, and RUN the tests/checks to verify claims. Score ONLY on evidence you actually observed — do not',
  'assume work that is not present. Be skeptical: absent tests, stubs, TODOs, and non-functional code score',
  'low; reward real, working, well-scoped outcomes. Score each rubric criterion 0–5 (0 = absent/broken,',
  '3 = adequate, 5 = excellent) with a justification citing what you saw, then submit.',
].join(' ');
// the judge works in the run-repo (reads the diff, runs its tests) before scoring
const artifact = runJudgeAgent(
  harness,
  model,
  `${system}\n\n# Goal\n${goal.trim()}\n\n# Rubric (score each id 0–5)\n${rubricText}`,
  resultDir,
  schema,
) as { criteria: CriterionScore[]; summary: string };

const byId = new Map(artifact.criteria.map((c) => [c.id, c]));
let got = 0;
let max = 0;
for (const r of workload.rubric) {
  got += (byId.get(r.id)?.score ?? 0) * r.weight;
  max += 5 * r.weight;
}
const score = max ? got / max : 0;

const judgedBy = model ? `${harness} ${model}` : `${harness} (default)`;
const report = {
  workload: workload.name,
  kind: workload.kind,
  judgedBy,
  score: Number(score.toFixed(3)),
  criteria: workload.rubric.map((r) => ({
    id: r.id,
    weight: r.weight,
    score: byId.get(r.id)?.score ?? 0,
    justification: byId.get(r.id)?.justification ?? '(no score returned)',
  })),
  summary: artifact.summary,
};

const text = JSON.stringify(report, null, 2);
if (out) writeFileSync(out, text);
console.log(text);
console.log(`\nbench score: ${(score * 100).toFixed(0)}% — ${workload.name} (judged by ${judgedBy})`);
