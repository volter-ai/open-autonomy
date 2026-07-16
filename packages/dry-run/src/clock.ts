import type { Clock, VirtualClock } from './ports.ts';

export function systemClock(): Clock {
  return { now: () => Date.now() };
}

// Deterministic clock for dry-run: time only moves when the scenario moves it.
// Simulates hours of quiet-window/polling behavior in milliseconds of test time.
export function virtualClock(startEpochMs: number): VirtualClock {
  let current = startEpochMs;
  return {
    now: () => current,
    advance(ms: number) {
      if (ms < 0) throw new Error(`virtual clock cannot move backwards (advance ${ms}ms)`);
      current += ms;
    },
    set(epochMs: number) {
      if (epochMs < current) throw new Error(`virtual clock cannot move backwards (set ${epochMs} < ${current})`);
      current = epochMs;
    },
  };
}
