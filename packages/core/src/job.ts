// The lifecycle of a job, beyond its trigger (when it starts). The SAME shape for any actor — human or
// agent; only what fills the hooks differs. Both hooks are OPTIONAL.
//
//   trigger → start? → [the actor does the work] → completion?
//
//   start      — what to do at job start (a human: notify; an agent: launch the box).
//   completion — how to know the job is over and interpret its result (the acceptance criteria + check).
//
// completion present → a VERIFIED job (reliable outcome): it blocks the flow, counts as work, and is
//                      subject to escalation if it doesn't finish in time.
// completion absent  → a NOTIFICATION (notify-only / fire-and-forget): no reliable outcome — it cannot
//                      block, is not counted, and has nothing to escalate.
//
// Escalation is a SEPARATE exception concern (an SLA timeout on a verified job), not one of the hooks.

export type NotifyMode = 'active' | 'passive' | 'implicit'; // ping/assign | post-to-a-wall | found via a worklist

export interface JobStart {
  notify?: NotifyMode;
}

// How "done" is verified: the acceptance criteria, checked deterministically and/or by an AI judge. Only
// the *effect* is verifiable; diligence is covered by accountability (an attributable decision), not the check.
export interface JobCompletion {
  ac: string; // the acceptance criteria — what "done" means, documented so it can be checked
  check: 'deterministic' | 'judge' | 'both'; // how the AC is verified
}

export interface Job {
  start?: JobStart;
  completion?: JobCompletion;
}

// A unit of work an AI assigns to a PERSON — the thing that must exist when an agent asks a person to do
// something. Documented (`ask`) so the org formally records the human work it depends on ("so we know");
// assignable (`assignTo`); realized via the job hooks (start = notify, completion = AC/check). With a
// completion it is a verified task; without one it is a notification.
export interface HumanTask extends Job {
  ask: string; // what the person must do — the documented steps, recorded in the IR so we know
  assignTo?: string; // the person / role / worklist this unit is assigned to
}

export type JobMode = 'verified' | 'notification';

/** Verified iff it has a completion hook (a way to know it's done); otherwise it is notify-only. */
export function jobMode(job: Job): JobMode {
  return job.completion ? 'verified' : 'notification';
}

/** Only a verified job can block the flow — a notification has no completion to wait on. */
export function blocks(job: Job): boolean {
  return jobMode(job) === 'verified';
}

/** Only a verified job counts as work / reduces autonomy — a notification has no reliable outcome. */
export function counts(job: Job): boolean {
  return jobMode(job) === 'verified';
}

/** Escalation (the exception path) only applies where completion is expected — you cannot escalate a notify-only job. */
export function escalatable(job: Job): boolean {
  return jobMode(job) === 'verified';
}
