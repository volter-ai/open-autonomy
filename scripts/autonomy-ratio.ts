#!/usr/bin/env bun
// Bench — the first fitness brick. Read a flow's decision records (volter.agent.decision.v1) and compute
// agent-vs-human attribution, cycle time, and the autonomy ratio. Pure `measureFlow` for tests; a CLI to
// run it over a directory of recorded decisions from a real run. Dev/analysis tooling (not shipped into
// installs) — see DEV_ONLY in bin/sync-runtime.ts.
//
// HONEST SCOPE: today the only recorded human touchpoint is a HANDOFF (an `escalation` to a person, or a
// `human_required` decision) — a human's *resolution* is not yet recorded. So this counts human handoffs,
// not human work done, and the ratio is an UPPER bound on autonomy until the human seam records
// resolutions (the next Bench increment). Stated so the number is not over-claimed.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type AgentDecision, validateDecision } from './public-agent-decision.js';

export interface FlowMetrics {
  steps: number;
  agentSteps: number;
  humanSteps: number;
  autonomyRatio: number; // agentSteps / (agentSteps + humanSteps); 1 when there are no steps
  cycleTimeMs: number; // last created_at − first created_at
}

// A recorded step is a HUMAN touchpoint if it hands off to / is performed by a person.
export function isHumanStep(d: AgentDecision): boolean {
  return d.stage === 'escalation' || /^human/i.test(d.actor) || /human[_-]?required/i.test(d.decision);
}

export function measureFlow(decisions: AgentDecision[]): FlowMetrics {
  const steps = decisions.length;
  const humanSteps = decisions.filter(isHumanStep).length;
  const agentSteps = steps - humanSteps;
  const denom = agentSteps + humanSteps;
  const autonomyRatio = denom === 0 ? 1 : agentSteps / denom;
  const times = decisions
    .map((d) => Date.parse(d.created_at))
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);
  const cycleTimeMs = times.length >= 2 ? times[times.length - 1] - times[0] : 0;
  return { steps, agentSteps, humanSteps, autonomyRatio, cycleTimeMs };
}

function loadDir(dir: string): AgentDecision[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => validateDecision(JSON.parse(readFileSync(join(dir, f), 'utf8'))));
}

if (import.meta.main) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: bun scripts/autonomy-ratio.ts <dir-of-decision-json>');
    process.exit(1);
  }
  const m = measureFlow(loadDir(dir));
  console.log(JSON.stringify({ ...m, autonomyRatio: Number(m.autonomyRatio.toFixed(3)) }, null, 2));
}
