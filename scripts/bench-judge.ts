#!/usr/bin/env bun
// Bench judge — scores the OUTCOME of an autonomous run against a workload's rubric, with an AI judge that
// actually INVESTIGATES the result. A bench cell is profile × substrate × workload (docs/VISION.md): the
// org is handed a substantial goal, runs for real time, and the result is a matter of JUDGMENT. This runs
// the unified agent loop over the result repo with read + run tools, so the judge reads the diff, runs the
// tests, and reproduces the behavior before scoring — not a truncated text dump. Pair with
// scripts/autonomy-ratio.ts (how much was done by agents) for the full fitness reading: quality × autonomy.
//
//   bun scripts/bench-judge.ts --workload bench/workload/todo-cli --result <run-repo> [--out score.json]
//
// Uses the box endpoint (OPENAI_BASE_URL/OPENAI_API_KEY) via the agent loop's transport.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decide } from './agent-loop.js';

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
const model = arg('--model', process.env.BENCH_JUDGE_MODEL || 'deepseek/deepseek-v4-flash');
const out = arg('--out');
if (!workloadDir || !resultDir) {
  console.error('usage: bun scripts/bench-judge.ts --workload <dir> --result <repo> [--model m] [--out f]');
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

const artifact = await decide<{ criteria: CriterionScore[]; summary: string }>({
  system: [
    'You are an exacting engineering reviewer judging whether an autonomous software org ACHIEVED a goal.',
    'INVESTIGATE the result repository with your tools before scoring: list files, read the relevant code and',
    'tests, and RUN the tests/checks to verify claims. Score ONLY on evidence you actually observed — do not',
    'assume work that is not present. Be skeptical: absent tests, stubs, TODOs, and non-functional code score',
    'low; reward real, working, well-scoped outcomes. Score each rubric criterion 0–5 (0 = absent/broken,',
    '3 = adequate, 5 = excellent) with a justification citing what you saw, then submit.',
  ].join(' '),
  goal: `# Goal\n${goal.trim()}\n\n# Rubric (score each id 0–5)\n${rubricText}`,
  schema,
  model,
  cwd: resultDir, // the judge investigates the run-repo
  allowRun: true, // it runs the result's tests/checks before scoring
});

const byId = new Map(artifact.criteria.map((c) => [c.id, c]));
let got = 0;
let max = 0;
for (const r of workload.rubric) {
  got += (byId.get(r.id)?.score ?? 0) * r.weight;
  max += 5 * r.weight;
}
const score = max ? got / max : 0;

const report = {
  workload: workload.name,
  kind: workload.kind,
  model,
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
console.log(`\nbench score: ${(score * 100).toFixed(0)}% — ${workload.name} (judged by ${model})`);
