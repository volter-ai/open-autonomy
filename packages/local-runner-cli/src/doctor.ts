// `oa doctor` — prove a compiled local-runner install end-to-end before leaving the loop unattended.
// Folds in: the OA-04 dep-integrity probe, provider /healthz reachability, fence state, schedule.json
// parse validity, and prompts/skills existence per declared agent.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ProcRunner } from './types.ts';
import { defaultProc } from './proc.ts';
import { agentOf, loadSchedule } from './config.ts';
import { isPaused, pauseReasonText } from './pause.ts';
import { checkDepIntegrity, needsRunner } from './guards.ts';

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface DoctorReport {
  ok: boolean;
  checks: DoctorCheck[];
}

/** Provider /healthz reachability. Injectable `fetchImpl` so tests never need a real HTTP server; the
 *  default uses the global `fetch` (Node 22's built-in undici-backed fetch). A short timeout keeps a dead
 *  provider from hanging `doctor` — a doctor run must always terminate promptly. */
async function checkProviderHealth(
  providerUrl: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<DoctorCheck> {
  if (!providerUrl) {
    return { name: 'provider-health', ok: false, detail: 'no TERMFLEET_PROVIDER_URL pin found in schedule.json env or ambient — cannot probe /healthz (this is informational only when the schedule is script-only)' };
  }
  const url = providerUrl.replace(/\/$/, '') + '/healthz';
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3000);
    const res = await fetchImpl(url, { signal: controller.signal });
    clearTimeout(t);
    return res.ok
      ? { name: 'provider-health', ok: true, detail: `${url} -> ${res.status}` }
      : { name: 'provider-health', ok: false, detail: `${url} -> ${res.status} (not ok)` };
  } catch (e) {
    return { name: 'provider-health', ok: false, detail: `${url} unreachable: ${(e as Error)?.message ?? e}` };
  }
}

export async function doctor(opts: { cwd?: string; proc?: ProcRunner; fetchImpl?: typeof fetch; live?: boolean; env?: NodeJS.ProcessEnv } = {}): Promise<DoctorReport> {
  const cwd = opts.cwd ?? process.cwd();
  const proc = opts.proc ?? defaultProc;
  const ambient = opts.env ?? process.env;
  const checks: DoctorCheck[] = [];

  // 1. fence state
  const paused = isPaused(cwd);
  checks.push({
    name: 'fence',
    ok: true, // presence/absence is a valid state either way — this check reports, never fails, on fence state alone
    detail: paused ? `PAUSED (${(pauseReasonText(cwd) || '').trim().split('\n')[0] || 'no reason recorded'})` : 'unpaused',
  });

  // 2. schedule.json parse
  let schedule;
  try {
    schedule = loadSchedule(cwd);
    checks.push({ name: 'schedule.json', ok: true, detail: `parsed: ${schedule.scripts.length} script line(s), ${schedule.scripts.filter((s) => s.reconciled).length} reconciled` });
  } catch (e) {
    checks.push({ name: 'schedule.json', ok: false, detail: `parse failed: ${(e as Error).message}` });
    return { ok: false, checks }; // nothing downstream can be checked without a parsed schedule
  }

  // 3. OA-04 dep-integrity probe (only meaningful if the schedule needs the runner at all)
  const cmds = schedule.scripts.map((s) => s.cmd);
  if (needsRunner(cmds)) {
    if (!existsSync(join(cwd, 'node_modules', 'termfleet'))) {
      checks.push({ name: 'dep-integrity', ok: false, detail: 'termfleet not installed (npm install termfleet)' });
    } else {
      const integrity = checkDepIntegrity(cwd, proc);
      checks.push({ name: 'dep-integrity', ok: integrity.ok, detail: integrity.ok ? 'RUNNER_SPECS resolve cleanly (termfleet/@termfleet/core/ztrack, no collision)' : integrity.message! });
    }
  } else {
    checks.push({ name: 'dep-integrity', ok: true, detail: 'schedule is script-only — runner dependency not required' });
  }

  // 4. provider /healthz reachability — gated behind --live (the one check that goes over the network; a
  //    default doctor run stays fully offline, so it can be scripted anywhere including a box where the
  //    provider is intentionally down). Precedence matches OA-09 (buildTickEnv): ambient overrides schedule.
  if (needsRunner(cmds)) {
    if (opts.live) {
      const providerUrl = (ambient.TERMFLEET_PROVIDER_URL || schedule.env.TERMFLEET_PROVIDER_URL || '').trim() || undefined;
      checks.push(await checkProviderHealth(providerUrl, opts.fetchImpl));
    } else {
      checks.push({ name: 'provider-health', ok: true, detail: 'skipped (offline mode — pass --live to probe the provider /healthz over the network)' });
    }
  }

  // 5. prompts/skills existence per declared agent
  const harnesses = ['claude', 'codex'];
  const declaredAgents = [...new Set(schedule.scripts.map((s) => s.agent).filter((a): a is string => !!a))];
  if (!declaredAgents.length) {
    checks.push({ name: 'prompts', ok: true, detail: 'no prose (skill) agents declared — script-only schedule' });
  } else {
    for (const agent of declaredAgents) {
      const found = harnesses.filter((h) => existsSync(join(cwd, 'scripts', 'prompts', h, `${agent}.txt`)));
      checks.push({
        name: `prompts:${agent}`,
        ok: found.length > 0,
        detail: found.length ? `found for: ${found.join(', ')}` : `missing scripts/prompts/{${harnesses.join(',')}}/${agent}.txt`,
      });
    }
  }

  const ok = checks.every((c) => c.ok);
  return { ok, checks };
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines = report.checks.map((c) => `${c.ok ? 'OK  ' : 'FAIL'}  ${c.name}: ${c.detail}`);
  lines.push(report.ok ? '[oa] doctor: all checks passed' : '[oa] doctor: one or more checks FAILED — see above');
  return lines.join('\n');
}

// Re-exported so `agentOf` stays a single source of truth for parsing AUTONOMY_AGENT out of a command
// line, used identically by config.ts's normalizeSchedule and any future doctor extension.
export { agentOf };
