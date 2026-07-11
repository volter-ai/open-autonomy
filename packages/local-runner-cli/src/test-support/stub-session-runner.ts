// A scriptable SessionRunner stub — no real termfleet provider, no real scripts/autonomy-runner.mjs file
// on disk. A test drives session lifecycle directly by mutating `.sessions`.
import type { Session, SessionRunner } from '../types';

export class StubSessionRunner implements SessionRunner {
  sessions: Session[] = [];
  reaped: Array<{ agent: string; id: string }> = [];

  async list(): Promise<Session[]> {
    return this.sessions;
  }

  async reapIdle(_opts: { idleMs: number; agents: Set<string>; since: Map<string, number> }): Promise<Array<{ agent: string; id: string }>> {
    const out = this.reaped;
    this.reaped = [];
    return out;
  }

  /** test helper: simulate a launch (what proc()'s spawned command would eventually cause). */
  addSession(s: Session): void {
    this.sessions.push(s);
  }
  /** test helper: simulate the session ending (finished + reaped) — removes it from the live list. */
  endSession(id: string): void {
    this.sessions = this.sessions.filter((s) => s.id !== id);
  }
}
