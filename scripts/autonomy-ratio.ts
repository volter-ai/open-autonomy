#!/usr/bin/env bun
// Bench — the first fitness brick. Read a flow's decision records (volter.agent.decision.v1) and compute
// agent-vs-human attribution, cycle time, and the autonomy ratio. Pure `measureFlow` for tests; a CLI to
// run it over a directory of recorded decisions from a real run. Dev/analysis tooling (not shipped into
// installs) — see DEV_ONLY in bin/sync-runtime.ts.
//
// SCOPE: a "human step" is any recorded step that TOUCHES a person — a handoff (`escalation` /
// `human_required`) or a RESOLUTION (a real person acting, recorded with the `human:<login>` actor
// convention; extract it from a PR's merge signals via public-agent-merge-gate.humanResolution). The
// remaining gap is the live wiring that WRITES the resolution decision into the session during a run —
// until that lands, real flows record handoffs but not resolutions, so state the source when reporting.
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

// A recorded step TOUCHES a person if it is a resolution by a real person (the `human:<login>` actor
// convention) or a handoff to one (an `escalation`, or a `human_required` decision).
export function isHumanStep(d: AgentDecision): boolean {
  return /^human[:-]/i.test(d.actor) || d.stage === 'escalation' || /human[_-]?required/i.test(d.decision);
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
