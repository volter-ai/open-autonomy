#!/usr/bin/env bun
// Bench judge — scores the OUTCOME of an autonomous run against a workload's rubric, with an AI judge.
// A bench cell is profile × substrate × workload (docs/VISION.md): the autonomy is handed a substantial
// goal, runs for real time, and the result is a matter of JUDGMENT, not a unit test. This reads the goal
// + rubric + the result repo, builds bounded evidence, and asks the model to score each criterion with a
// justification — returning a weighted 0..1 score. Pair it with scripts/autonomy-ratio.ts (how much was
// done by agents) for the full fitness reading: quality × autonomy.
//
//   bun scripts/bench-judge.ts --workload bench/workload/todo-cli --result <run-repo> [--out score.json]
//
// Uses the transparent model seam (scripts/model-call.ts): set OPENAI_BASE_URL/OPENAI_API_KEY or
// ANTHROPIC_BASE_URL/ANTHROPIC_API_KEY to the box endpoint (a real provider, or the universal proxy).
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { modelComplete } from './model-call.js';

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
  score: number; // 0..5
  justification: string;
}

const arg = (n: string, d = '') => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : d;
};

const workloadDir = arg('--workload');
const resultDir = arg('--result');
const provider = arg('--provider', process.env.BENCH_JUDGE_PROVIDER || 'anthropic');
const model = arg('--model', process.env.BENCH_JUDGE_MODEL || 'claude-opus-4-8');
const out = arg('--out');
if (!workloadDir || !resultDir) {
  console.error('usage: bun scripts/bench-judge.ts --workload <dir> --result <repo> [--provider p] [--model m] [--out f]');
  process.exit(2);
}

const workload = JSON.parse(readFileSync(join(workloadDir, 'workload.json'), 'utf8')) as Workload;
const goal = existsSync(join(workloadDir, 'goal.md')) ? readFileSync(join(workloadDir, 'goal.md'), 'utf8') : workload.summary;

// --- bounded evidence from the result repo ---
const SKIP_DIR = new Set(['node_modules', '.git', 'dist', '.agent-run']);
const SKIP_EXT = new Set(['.lock', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.woff', '.woff2']);
const EVIDENCE_BUDGET = 50_000; // chars of file content the judge sees

function walk(dir: string, base: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    if (SKIP_DIR.has(e)) continue;
    const full = join(dir, e);
    if (statSync(full).isDirectory()) out.push(...walk(full, base));
    else out.push(relative(base, full));
  }
  return out;
}

const files = existsSync(resultDir) ? walk(resultDir, resultDir).sort() : [];
let budget = EVIDENCE_BUDGET;
const contents: string[] = [];
for (const f of files) {
  if (SKIP_EXT.has(extname(f)) || f === 'bun.lock' || f === 'package-lock.json') continue;
  if (budget <= 0) break;
  let body = '';
  try {
    body = readFileSync(join(resultDir, f), 'utf8');
  } catch {
    continue;
  }
  if (body.includes(String.fromCharCode(0))) continue; // skip binary files
  const slice = body.slice(0, Math.min(budget, 8_000));
  budget -= slice.length;
  contents.push(`--- ${f} ---\n${slice}${body.length > slice.length ? '\n…(truncated)' : ''}`);
}

const rubricText = workload.rubric
  .map((r) => `- [${r.id}] (weight ${r.weight}) ${r.criterion}${r.guidance ? `\n    guidance: ${r.guidance}` : ''}`)
  .join('\n');

const prompt = `You are an exacting engineering reviewer judging whether an autonomous software org ACHIEVED a goal.
Score ONLY on the evidence in the result repository — do not assume work that is not present. Be skeptical:
absent tests, stubs, TODOs, and non-functional code score low. Reward real, working, well-scoped outcomes.

# Goal
${goal.trim()}

# Rubric (score each criterion 0–5; 0 = absent/broken, 3 = adequate, 5 = excellent)
${rubricText}

# Result repository
Files (${files.length}):
${files.join('\n') || '(empty)'}

Contents (truncated to a budget):
${contents.join('\n\n') || '(no readable files)'}

# Output
Return ONLY a JSON object, no prose around it:
{"criteria":[{"id":"<rubric id>","score":<0-5>,"justification":"<one or two sentences citing evidence>"}],"summary":"<2-3 sentence overall verdict>"}`;

const raw = await modelComplete(provider, model, prompt, 1500);
const match = raw.match(/\{[\s\S]*\}/);
if (!match) {
  console.error('judge returned no JSON object:\n' + raw);
  process.exit(1);
}
const parsed = JSON.parse(match[0]) as { criteria: CriterionScore[]; summary: string };

// weighted 0..1 score
const byId = new Map(parsed.criteria.map((c) => [c.id, c]));
let got = 0;
let max = 0;
for (const r of workload.rubric) {
  const s = byId.get(r.id)?.score ?? 0;
  got += s * r.weight;
  max += 5 * r.weight;
}
const score = max ? got / max : 0;

const report = {
  workload: workload.name,
  kind: workload.kind,
  provider,
  model,
  score: Number(score.toFixed(3)),
  criteria: workload.rubric.map((r) => ({
    id: r.id,
    weight: r.weight,
    score: byId.get(r.id)?.score ?? 0,
    justification: byId.get(r.id)?.justification ?? '(no score returned)',
  })),
  summary: parsed.summary,
};

const text = JSON.stringify(report, null, 2);
if (out) writeFileSync(out, text);
console.log(text);
console.log(`\nbench score: ${(score * 100).toFixed(0)}% — ${workload.name} (judged by ${provider}/${model})`);
