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
  humanSteps: number; // recorded steps that touched a person (a handoff or a resolution)
  humanHandoffs: number; // times a human was REQUIRED (escalation / human_required)
  humanResolved: number; // verified human work delivered (the `human:<login>` resolution)
  humanPending: number; // handoffs with no matching resolution — NOT done (no presumed-done)
  complete: boolean; // humanPending === 0: every human dependency was verifiably resolved
  autonomyRatio: number; // agentSteps / steps — fraction of recorded steps that were agent-only; 1 if no steps
  cycleTimeMs: number; // last created_at − first created_at
}

// Classify a recorded step: a RESOLUTION by a real person (the `human:<login>` convention — verified human
// work), a HANDOFF to one (escalation / human_required — a human was required), or an agent step.
export function classifyStep(d: AgentDecision): 'resolution' | 'handoff' | 'agent' {
  if (/^human[:-]/i.test(d.actor)) return 'resolution';
  if (d.stage === 'escalation' || /human[_-]?required/i.test(d.decision)) return 'handoff';
  return 'agent';
}

export function isHumanStep(d: AgentDecision): boolean {
  return classifyStep(d) !== 'agent';
}

export function measureFlow(decisions: AgentDecision[]): FlowMetrics {
  const steps = decisions.length;
  const kinds = decisions.map(classifyStep);
  const humanHandoffs = kinds.filter((k) => k === 'handoff').length;
  const humanResolved = kinds.filter((k) => k === 'resolution').length;
  const humanSteps = humanHandoffs + humanResolved;
  const agentSteps = steps - humanSteps;
  // No presumed-done: a handoff is "done" only once a resolution answers it. Unanswered handoffs are
  // PENDING — the flow is not complete, and the work is not counted as a verified human result.
  const humanPending = Math.max(0, humanHandoffs - humanResolved);
  const complete = humanPending === 0;
  const autonomyRatio = steps === 0 ? 1 : agentSteps / steps;
  const times = decisions
    .map((d) => Date.parse(d.created_at))
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);
  const cycleTimeMs = times.length >= 2 ? times[times.length - 1] - times[0] : 0;
  return { steps, agentSteps, humanSteps, humanHandoffs, humanResolved, humanPending, complete, autonomyRatio, cycleTimeMs };
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
