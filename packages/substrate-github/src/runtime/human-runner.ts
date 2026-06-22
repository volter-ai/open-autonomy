#!/usr/bin/env bun
// The human realization of the Runner contract (docs/RUNNER.md).
//
// A human actor cannot be launched or watched, so a human runner provides only the two things the
// orchestrator needs: a HISTORY of what has happened to a human task, and its CURRENT STATUS. It is handed
// a human task + a completion condition and handles it "according to what the runner is."
//
// The FLOOR is the no-op, bookkeeping-only runner: `run` records the handoff as a decision record — the
// system's existing audit trail (`public-agent-decision`), NOT a parallel store — and `status` honestly
// reports that completion cannot be determined here (`unknown`); it never fabricates `complete`. Richer
// runners (gh-comment, Slack, an agentic notifier) plug in behind the same interface and CAN report
// `pending`/`complete`; they stay opaque black boxes. The runner knows nothing about issues/labels/lifecycle
// — only the human task it was given; the orchestrator (PM) maps the runner's status onto the tracker
// lifecycle and owns verification. This is enough for the PM to operate correctly when humans are involved:
// it knows the action exists, knows it is parked, and never presumes done.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type AgentDecision, makeDecision, validateDecision, writeDecision } from './public-agent-decision.js';

export type HumanActionStatus = 'pending' | 'complete' | 'failed' | 'unknown';

export interface HumanTask {
  issue: number; // the work item this concerns (for the audit record / subject)
  actorClass: string; // which human class is expected to act (e.g. 'maintainer', 'requester')
  ask: string; // what the person is asked to do (well- or ill-formatted)
  completionCondition: string; // how we will know it is done; recorded, evaluated only by capable runners
  requestedBy?: string; // the actor requesting the human action
}

export interface HumanActionState {
  handle: string;
  status: HumanActionStatus;
  history: AgentDecision[]; // the audit trail for this action (decision records), not a parallel store
  note?: string; // human-readable, esp. why a no-op runner cannot determine status
}

/** The human realization of the Runner: `run` engages/records; `status` reports history + current status. */
export interface HumanRunner {
  run(task: HumanTask): string; // returns a handle (the decision id)
  status(handle: string): HumanActionState;
}

/** Record a human task as a handoff decision (stage `escalation`) — the shared audit shape every runner
 *  emits, so the autonomy grader counts it as a human handoff regardless of which runner produced it. */
export function handoffDecision(task: HumanTask, now = new Date()): AgentDecision {
  return makeDecision(
    {
      stage: 'escalation',
      issue: task.issue,
      actor: task.requestedBy ?? 'system',
      decision: `human_required:${task.actorClass}`,
      reason: task.ask,
      next_action: task.completionCondition,
      subject: { type: 'issue', number: task.issue },
      evidence: [],
    },
    now,
  );
}

/** The minimal human runner: pure bookkeeping. Records the handoff; reports `unknown` — never `complete`. */
export class NoopHumanRunner implements HumanRunner {
  constructor(private readonly decisionsDir: string) {}

  run(task: HumanTask): string {
    const dec = handoffDecision(task);
    writeDecision(this.decisionsDir, dec);
    return dec.id;
  }

  status(handle: string): HumanActionState {
    return {
      handle,
      status: 'unknown',
      history: this.read().filter((d) => d.id === handle),
      note:
        'bookkeeping-only runner: this human action is recorded, but its completion cannot be determined ' +
        'here. A capable runner (or an explicit verified resolution) is required to move it past `unknown`.',
    };
  }

  private read(): AgentDecision[] {
    if (!existsSync(this.decisionsDir)) return [];
    return readdirSync(this.decisionsDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          return validateDecision(JSON.parse(readFileSync(join(this.decisionsDir, f), 'utf8')));
        } catch {
          return null;
        }
      })
      .filter((d): d is AgentDecision => d !== null);
  }
}
