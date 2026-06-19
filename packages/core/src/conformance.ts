// Substrate conformance battery. Plug in any Runner and check it against the CORE contract, then
// probe which EXPANDED features it supports. This is the one deterministic check the design admits:
// the substrate SEAM is mechanical (launch → observe → cancel), unlike agent behavior, which is only
// provable by real runs (§12). The battery drives a REAL runner against its real backend using a
// trivial probe agent — no AI, no mocks — and reports core pass/fail plus a capability profile.
//
//   bun bin/autonomy-conformance.ts <exec|termfleet|github> [probeAgent]   (CLI wiring lives in bin/)
import type { Runner, LaunchParams, Session } from './runner';

export interface ConformanceReport {
  runner: string;
  core: Record<string, boolean>;
  expanded: Record<string, 'supported' | 'unsupported'>;
  passedCore: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runConformance(
  runner: Runner,
  opts: { name?: string; probeAgent?: string; params?: LaunchParams; settleMs?: number } = {},
): Promise<ConformanceReport> {
  const agent = opts.probeAgent ?? 'conformance-probe';
  const params = opts.params ?? { CONFORMANCE_PARAM: 'ok' };
  const settle = opts.settleMs ?? 0;
  const core: Record<string, boolean> = {};
  const expanded: Record<string, 'supported' | 'unsupported'> = {};
  let s1: Session | undefined;
  let s2: Session | undefined;

  try {
    // CORE — launch returns a running session
    s1 = runner.launch(agent, params);
    core['launch → running session with an id'] = !!(s1 && s1.id && s1.agent === agent && s1.status === 'running');

    // CORE — the id is RECEIVED, not invented: two launches of the same agent get distinct ids
    s2 = runner.launch(agent, params);
    core['session ids distinct per launch (id received, not invented)'] = !!(s1?.id && s2?.id && s1.id !== s2.id);

    // CORE — opaque params are passed through verbatim (recorded on the returned session)
    core['launch params passed through verbatim'] = JSON.stringify(s1?.params ?? {}) === JSON.stringify(params);

    if (settle) await sleep(settle);

    // CORE — list shows the running sessions
    const listed = runner.list();
    core['list shows launched sessions'] = !!(s1 && s2 && listed.some((x) => x.id === s1!.id) && listed.some((x) => x.id === s2!.id));

    // EXPANDED — get(id)
    try {
      const g = s1 ? runner.get(s1.id) : undefined;
      expanded['get(id)'] = g && g.id === s1?.id ? 'supported' : 'unsupported';
    } catch {
      expanded['get(id)'] = 'unsupported';
    }

    // EXPANDED — update(status) (pause/resume); "supported" only if it actually returns true
    try {
      expanded['update(status)'] = s1 && runner.update(s1.id, { status: 'paused' }) ? 'supported' : 'unsupported';
    } catch {
      expanded['update(status)'] = 'unsupported';
    }

    // CORE — cancel returns true and removes the session from the running set
    const c1 = s1 ? runner.cancel(s1.id) : false;
    const c2 = s2 ? runner.cancel(s2.id) : false;
    core['cancel → true'] = !!(c1 && c2);
    if (settle) await sleep(settle);
    const after = runner.list();
    core['cancel removes from list'] = !!(s1 && s2 && !after.some((x) => x.id === s1!.id) && !after.some((x) => x.id === s2!.id));

    // EXPANDED — enforcement features are not probeable through the base contract (no cap-setter etc.);
    // a runner advertises them via an optional `supports` set.
    const supports = (runner as { supports?: string[] }).supports ?? [];
    for (const feat of ['maxConcurrent', 'timeout', 'budget', 'permissions', 'isolation']) {
      expanded[`enforce ${feat}`] = supports.includes(feat) ? 'supported' : 'unsupported';
    }
  } finally {
    // best-effort cleanup: cancel any probe sessions we may have leaked
    try {
      for (const s of runner.list()) if (s.agent === agent) runner.cancel(s.id);
    } catch {
      /* ignore */
    }
  }

  return { runner: opts.name ?? 'runner', core, expanded, passedCore: Object.values(core).every(Boolean) };
}
