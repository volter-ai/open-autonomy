#!/usr/bin/env bun
// soc2-register — the VISIBLE SOC2 control-register tool (W1-W11).
//
//   bun scripts/soc2-register.ts render                 # control-register.yml -> control-register.md
//   bun scripts/soc2-register.ts verify                 # fail if control-register.md != render output (drift guard)
//   bun scripts/soc2-register.ts check [--as-of YYYY-MM-DD]   # structural + currency gates; exit 1 on any failure
//   bun scripts/soc2-register.ts watchdog --repo o/n [--dry-run] [--as-of YYYY-MM-DD]  # open soc2-control-due issues
//
// Deterministic VISIBILITY plumbing only. It makes NO judgment — it surfaces overdue cadence and renders the
// register. Deficiency identification + senior-mgmt/board communication (CC4.2) stays human/agent.
import { parse } from 'yaml';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

const HERE = dirname(new URL(import.meta.url).pathname);
const COMPLIANCE = join(HERE, '..', 'compliance');
const REG = join(COMPLIANCE, 'control-register.yml');
const LEDGER = join(COMPLIANCE, 'evidence-ledger.yml');
const MD = join(COMPLIANCE, 'control-register.md');

// the canonical 61 AICPA TSC criteria (2017, rev 2022) — the structural completeness oracle
const CANON: Record<string, number> = { CC1: 5, CC2: 3, CC3: 4, CC4: 2, CC5: 3, CC6: 8, CC7: 5, CC8: 1, CC9: 2, A1: 3, C1: 2, PI1: 5, P: 18 };
const CANON_TOTAL = Object.values(CANON).reduce((a, b) => a + b, 0); // 61
const INTERVAL_DAYS: Record<string, number> = { weekly: 8, monthly: 31, quarterly: 92, annual: 366 };

type Crit = { id: string; family: string; statement: string; class: string[]; status: string; control_refs: string[]; owner_role: string; evidence: string; processes?: string[]; external_owner?: string; external_reason?: string };
type Proc = { id: string; name: string; cadence: string; owner_role: string; criteria: string[]; gate?: string };

function loadReg() { return parse(readFileSync(REG, 'utf8')) as { criteria: Crit[]; processes: Proc[] }; }
function loadLedger() { return parse(readFileSync(LEDGER, 'utf8')) as { processes_state: { process: string; effective_from: string; artifacts: { interval_end: string; evidence: string }[] }[] }; }
function today(asOf?: string) { return asOf ? new Date(asOf + 'T00:00:00Z') : new Date(); }
function daysBetween(a: Date, b: Date) { return Math.floor((a.getTime() - b.getTime()) / 86400000); }

// latest evidence date for a process (max artifact interval_end, else effective_from)
function lastFor(procId: string, ledger: ReturnType<typeof loadLedger>): { date: string; from: 'artifact' | 'effective_from' | 'none' } {
  const st = ledger.processes_state.find((p) => p.process === procId);
  if (!st) return { date: '', from: 'none' };
  if (st.artifacts && st.artifacts.length) {
    const latest = st.artifacts.map((a) => a.interval_end).sort().at(-1)!;
    return { date: latest, from: 'artifact' };
  }
  return { date: st.effective_from, from: 'effective_from' };
}

// returns {overdue, dueBy, last, from, missing} for an interval-gated process; null for event-driven.
// Two overdue modes: (1) RECENCY — latest evidence older than one interval; (2) CONTINUITY — fewer
// distinct artifacts than the number of intervals elapsed since effective_from (a SKIPPED intermediate
// interval surfaces even if the latest artifact is recent — the cardinal Type-II rule).
function currency(proc: Proc, ledger: ReturnType<typeof loadLedger>, asOf?: string) {
  // gate: liveness — currency is asserted by the W11 workflow-liveness check (the workflow actually ran),
  // NOT by a hand-committed main-branch ledger artifact. (Used by evidence-collection, which is fully
  // automated and whose evidence lands on the compliance-evidence branch.) Not ledger-currency-gated.
  if (proc.gate === 'liveness') return null;
  const days = INTERVAL_DAYS[proc.cadence];
  if (!days) return null; // per-event / per-change — not interval-gated
  const st = ledger.processes_state.find((p) => p.process === proc.id);
  if (!st) return { overdue: true, dueBy: '(no ledger state)', last: '(none)', from: 'none' as const, missing: 0 };
  const eff = new Date(st.effective_from + 'T00:00:00Z');
  const arts = (st.artifacts || []).map((a) => a.interval_end).sort();
  const last = lastFor(proc.id, ledger);
  const due = new Date(last.date + 'T00:00:00Z'); due.setUTCDate(due.getUTCDate() + days);
  const recencyOverdue = today(asOf) > due;
  // continuity: count distinct interval BUCKETS covered (not distinct dates — two artifacts in the same
  // bucket must not mask a different empty bucket), vs the number of buckets elapsed since effective_from.
  const elapsed = daysBetween(today(asOf), eff);
  const expected = Math.max(0, Math.floor(elapsed / days));
  // An artifact's `interval_end` date D is the CLOSE of the interval it evidences: interval k spans
  // (eff + k*days, eff + (k+1)*days], so D in that range evidences interval k = ceil((D-eff)/days) - 1.
  // (Using floor would push an end-dated artifact into the NEXT interval — leaving interval 0 perpetually
  // "uncovered" and contradicting the recency check, which accepts interval_end dating.) Count only
  // COMPLETED intervals [0, expected); an artifact in the current in-progress interval must not pad coverage.
  const intervalOf = (d: string) => Math.ceil(daysBetween(new Date(d + 'T00:00:00Z'), eff) / days) - 1;
  const buckets = new Set(arts.map(intervalOf).filter((b) => b >= 0 && b < expected));
  const missing = Math.max(0, expected - buckets.size);
  return { overdue: recencyOverdue || missing > 0, dueBy: due.toISOString().slice(0, 10), last: last.date, from: last.from, missing };
}

function render(): string {
  const { criteria, processes } = loadReg();
  const L = loadLedger();
  const byFam: Record<string, Crit[]> = {};
  for (const c of criteria) (byFam[c.family] ??= []).push(c);
  const families = ['CC1', 'CC2', 'CC3', 'CC4', 'CC5', 'CC6', 'CC7', 'CC8', 'CC9', 'A1', 'C1', 'PI1', 'P'];
  let o = '';
  o += '# SOC 2 control register — soc2-baseline\n\n';
  o += '> GENERATED from `control-register.yml` by `scripts/soc2-register.ts render`. Do not hand-edit — edit the YAML.\n';
  o += `> Covers all **${CANON_TOTAL}** AICPA TSC criteria (2017, rev 2022). class: **a**=automatable+tracked · **b**=human-process tracked/visible · **c**=inherently external.\n\n`;
  o += `Criteria: **${criteria.length}/${CANON_TOTAL}** · enforced ${criteria.filter((c) => c.status === 'enforced').length} · tracked ${criteria.filter((c) => c.status === 'tracked').length} · external ${criteria.filter((c) => c.status === 'external').length}.\n\n`;
  o += '## Criteria\n\n| Criterion | Statement | Class | Status | Owner | Evidence | Control refs |\n|---|---|---|---|---|---|---|\n';
  for (const fam of families) for (const c of byFam[fam] ?? []) {
    const ext = c.external_owner ? ` _(ext: ${c.external_owner} — ${c.external_reason})_` : '';
    o += `| ${c.id} | ${c.statement} | ${c.class.join('+')} | ${c.status} | ${c.owner_role} | ${c.evidence}${ext} | ${(c.control_refs || []).join(', ') || '—'} |\n`;
  }
  o += '\n## Process / Type-II cadence (the periodic controls; `last`/`next` derive from the evidence ledger)\n\n';
  o += '| Process | Cadence | Owner | Last evidence | Next due | State | Criteria |\n|---|---|---|---|---|---|---|\n';
  for (const p of processes) {
    const cur = currency(p, L);
    const state = p.gate === 'liveness' ? 'liveness-gated (W11)' : !cur ? 'event-driven' : cur.overdue ? '⚠ OVERDUE' : 'ok';
    const last = !cur ? '—' : `${cur.last}${cur.from === 'effective_from' ? ' (since install)' : ''}`;
    const next = !cur ? '—' : cur.dueBy;
    o += `| ${p.id} | ${p.cadence} | ${p.owner_role} | ${last} | ${next} | ${state} | ${p.criteria.join(', ')} |\n`;
  }
  o += '\n## External residuals (status: external OR an external leg — visible, never faked as automated)\n\n| Criterion | External owner | Why external |\n|---|---|---|\n';
  for (const c of criteria.filter((c) => c.status === 'external' || c.external_owner)) o += `| ${c.id} | ${c.external_owner || c.owner_role} | ${c.external_reason || '—'} |\n`;
  const meta = (loadReg() as any).meta_external as { id: string; name: string; owner: string; reason: string }[] | undefined;
  if (meta && meta.length) { o += '\n### Non-criterion residuals (the org owns these; not in-repo)\n\n| Item | Owner | Why |\n|---|---|---|\n'; for (const m of meta) o += `| ${m.name} | ${m.owner} | ${m.reason} |\n`; }
  o += '\n## Honest limits (what this VISIBILITY system does and does not do)\n\n';
  o += '- **Surfaced, not CI-enforced.** An overdue control opens a weekly `soc2-control-due` issue (re-opened every Monday while still overdue) — it does **not** fail CI or block merges. The currency gate hard-fails only in `check`/`soc2-register-check` (run on schedule + on register/ledger edits).\n';
  o += '- **Cadence decay is machine-detected; evidence AUTHENTICITY is not.** `last` derives from ledger artifact timestamps, but the tool does not verify an artifact pointer resolves to a genuine snapshot. A fabricated `interval_end` reads current. The protection is change-management: `compliance/**` is a human-required path, so a forged ledger edit on a bot PR needs maintainer approval (it is review-gated, not machine-verified).\n';
  o += '- **Fresh install grace.** With no artifacts yet, `last` = `effective_from` (the install date); a control is not overdue until its first interval elapses. Real Type-II evidence accrues over the observation window.\n';
  o += '- **Correlated Actions-disable is a TERMINAL limit.** All surfacers (compliance-cadence, soc2-register-check, evidence-collect, heartbeat) are scheduled GitHub workflows. They cross-watch each other for an *individual* stall, but a *wholesale* Actions outage — GitHub auto-disabling schedules after 60 days of repo inactivity, an org disabling Actions, or archiving the repo — takes them all dark at once, and an in-repo watcher cannot survive its own Actions being disabled. Catching a full Actions outage requires **external** uptime/paging (org tooling), out of repo scope. This is disclosed, not prevented.\n';
  return o;
}

function structural(): string[] {
  const errs: string[] = [];
  const { criteria, processes } = loadReg();
  // completeness: per-family counts == canon
  const counts: Record<string, number> = {};
  for (const c of criteria) counts[c.family] = (counts[c.family] || 0) + 1;
  for (const [fam, n] of Object.entries(CANON)) if ((counts[fam] || 0) !== n) errs.push(`family ${fam}: expected ${n} criteria, got ${counts[fam] || 0}`);
  for (const fam of Object.keys(counts)) if (!(fam in CANON)) errs.push(`unknown family ${fam}`);
  if (criteria.length !== CANON_TOTAL) errs.push(`total criteria: expected ${CANON_TOTAL}, got ${criteria.length}`);
  const ids = new Set(criteria.map((c) => c.id));
  if (ids.size !== criteria.length) errs.push('duplicate criterion id(s)');
  // per-row obligations by class
  const ROOT = join(COMPLIANCE, '..');
  const isPath = (r: string) => r.includes('/') || /\.(ya?ml|ts|sh|md|json)$/.test(r);
  for (const c of criteria) {
    if (c.class.includes('a') && !(c.control_refs && c.control_refs.length)) errs.push(`${c.id}: class a needs >=1 control_ref (automation)`);
    if (c.class.includes('c') && c.status === 'external' && !c.external_owner) errs.push(`${c.id}: class c/external needs external_owner`);
    if (!c.owner_role) errs.push(`${c.id}: missing owner_role`);
    if (!(c.class.includes('c')) && !(c.control_refs && c.control_refs.length)) errs.push(`${c.id}: non-external criterion needs >=1 control_ref`);
    // file-path control_refs must resolve to a SHIPPED profile file (catches a dangling automation pointer)
    for (const r of c.control_refs || []) if (isPath(r) && !existsSync(join(ROOT, r))) errs.push(`${c.id}: control_ref "${r}" does not resolve to a shipped file`);
  }
  // every process referenced by a criterion exists, and has cadence+owner
  const procIds = new Set(processes.map((p) => p.id));
  for (const c of criteria) for (const pr of c.processes || []) if (!procIds.has(pr)) errs.push(`${c.id}: references unknown process ${pr}`);
  for (const p of processes) { if (!p.cadence) errs.push(`process ${p.id}: missing cadence`); if (!p.owner_role) errs.push(`process ${p.id}: missing owner_role`); }
  return errs;
}

function currencyErrs(asOf?: string): string[] {
  const { processes } = loadReg();
  const L = loadLedger();
  const errs: string[] = [];
  for (const p of processes) {
    const cur = currency(p, L, asOf);
    if (cur && cur.overdue) errs.push(`process ${p.id} (${p.cadence}) OVERDUE — last ${cur.last} (${cur.from}), was due ${cur.dueBy}${cur.missing > 0 ? `; ${cur.missing} interval(s) with no artifact` : ''}`);
  }
  return errs;
}

function overdueProcesses(asOf?: string) {
  const { processes } = loadReg();
  const L = loadLedger();
  return processes.map((p) => ({ p, cur: currency(p, L, asOf) })).filter((x) => x.cur && x.cur.overdue);
}

const cmd = process.argv[2];
const arg = (k: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
const has = (k: string) => process.argv.includes(k);

if (cmd === 'render') {
  writeFileSync(MD, render());
  console.log(`rendered ${MD}`);
} else if (cmd === 'verify') {
  const want = render();
  const got = existsSync(MD) ? readFileSync(MD, 'utf8') : '';
  if (want !== got) { console.error('DRIFT: control-register.md != render(control-register.yml). Run: bun scripts/soc2-register.ts render'); process.exit(1); }
  console.log('register md == yaml (no drift)');
} else if (cmd === 'check') {
  const asOf = arg('--as-of');
  const s = structural();
  const c = currencyErrs(asOf);
  if (s.length) { console.error('STRUCTURAL FAILURES:'); s.forEach((e) => console.error('  - ' + e)); }
  if (c.length) { console.error('CURRENCY FAILURES (Type-II overdue):'); c.forEach((e) => console.error('  - ' + e)); }
  if (s.length || c.length) process.exit(1);
  const { criteria } = loadReg();
  console.log(`check:soc2-register PASS — ${criteria.length}/${CANON_TOTAL} criteria mapped; structural + currency green${asOf ? ` (as-of ${asOf})` : ''}`);
} else if (cmd === 'watchdog') {
  const repo = arg('--repo'); const dry = has('--dry-run'); const asOf = arg('--as-of');
  const overdue = overdueProcesses(asOf);
  if (!overdue.length) { console.log('watchdog: no overdue controls'); process.exit(0); }
  for (const { p, cur } of overdue) {
    const title = `[soc2-control-due] ${p.id} (${p.cadence}) overdue — due ${cur!.dueBy}`;
    const body = `Control **${p.id}** — _${p.name}_ is OVERDUE.\n\n- Cadence: ${p.cadence}\n- Last evidence: ${cur!.last} (${cur!.from})\n- Was due: ${cur!.dueBy}\n- Owner role: \`${p.owner_role}\`\n- Criteria evidenced: ${p.criteria.join(', ')}\n\n**To close:** perform the control, then commit the evidence artifact to \`compliance/evidence-ledger.yml\` (process \`${p.id}\`, new \`interval_end\`). Closing without a ledger artifact is not permitted (W6/W7).\n\n_Opened by the deterministic cadence watchdog (visibility only — deficiency judgment + senior-mgmt/board communication stays human/agent, CC4.2)._`;
    if (dry || !repo) { console.log(`WOULD OPEN: ${title}`); continue; }
    // idempotent: skip if an open issue with this title exists
    const existing = JSON.parse(execFileSync('gh', ['issue', 'list', '--repo', repo, '--state', 'open', '--label', 'soc2-control-due', '--search', p.id, '--json', 'title,number'], { encoding: 'utf8' }) || '[]');
    if (existing.some((i: any) => i.title === title)) { console.log(`exists: ${title}`); continue; }
    execFileSync('gh', ['label', 'create', 'soc2-control-due', '--repo', repo, '--color', 'b60205', '--description', 'A SOC2 periodic control is overdue', '--force'], { stdio: 'ignore' });
    const out = execFileSync('gh', ['issue', 'create', '--repo', repo, '--title', title, '--body', body, '--label', 'soc2-control-due'], { encoding: 'utf8' });
    console.log(`OPENED: ${out.trim()}`);
  }
} else {
  console.error('usage: soc2-register render|verify|check|watchdog');
  process.exit(2);
}
