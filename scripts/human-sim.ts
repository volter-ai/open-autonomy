#!/usr/bin/env bun
// Bench/testbed — simulate being a human. A DETERMINISTIC stand-in that fulfills a HumanTask's completion
// so a flow with human tasks runs end-to-end without a real operator (reproducible, no contamination).
//
// This is a TEST DOUBLE: it exercises the seam *mechanism*; it does NOT reflect real human *behavior*. A
// behavior-calibrated simulator is derived from a recorded real run (the honest method: real run first,
// then derive the sim). Realization is the environment's choice — a real person in prod, this in the
// testbed. Dev/analysis tooling (not shipped into installs) — see DEV_ONLY in bin/sync-runtime.ts.
// The simulator needs only to know whether the task has a completion to fulfill (a notification has none).
// Structural — mirrors @open-autonomy/core `HumanTask`; kept local so this dev tool has no cross-package
// import (scripts/ type-checks with no workspace resolution).
type Fulfillable = { completion?: unknown; [key: string]: unknown };

export type SimAction = 'approve' | 'reject' | 'abandon'; // decide (resolves it) | abandon (non-responsive → pending)

export interface HumanSimPolicy {
  as?: string; // the simulated person's login, recorded as the responder; default 'sim'
  act?: (task: Fulfillable) => SimAction; // deterministic decision; default 'approve'
}

export interface SimResolution {
  actor: string; // `human:<as>` — the responder identity recorded on the resolution decision
  decision: SimAction;
}

// Fulfill a HumanTask as a simulated person. A notification (no completion) has nothing to fulfill → null.
// An 'abandon' simulates a non-responsive human → null, so the handoff stays pending (no presumed-done).
export function simulateHuman(task: Fulfillable, policy: HumanSimPolicy = {}): SimResolution | null {
  if (!task.completion) return null;
  const action = (policy.act ?? (() => 'approve' as const))(task);
  if (action === 'abandon') return null;
  return { actor: `human:${policy.as ?? 'sim'}`, decision: action };
}
