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
type Proc = { id: string; name: string; cadence: string; owner_role: string; criteria: string[] };

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

// returns {overdue, dueBy, last} for an interval-gated process; null for event-driven
function currency(proc: Proc, ledger: ReturnType<typeof loadLedger>, asOf?: string) {
  const days = INTERVAL_DAYS[proc.cadence];
  if (!days) return null; // per-event / per-change — not interval-gated
  const last = lastFor(proc.id, ledger);
  if (last.from === 'none') return { overdue: true, dueBy: '(no ledger state)', last: '(none)', from: last.from };
  const due = new Date(last.date + 'T00:00:00Z'); due.setUTCDate(due.getUTCDate() + days);
  const overdue = today(asOf) > due;
  return { overdue, dueBy: due.toISOString().slice(0, 10), last: last.date, from: last.from };
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
    const state = !cur ? 'event-driven' : cur.overdue ? '⚠ OVERDUE' : 'ok';
    const last = !cur ? '—' : `${cur.last}${cur.from === 'effective_from' ? ' (since install)' : ''}`;
    const next = !cur ? '—' : cur.dueBy;
    o += `| ${p.id} | ${p.cadence} | ${p.owner_role} | ${last} | ${next} | ${state} | ${p.criteria.join(', ')} |\n`;
  }
  o += '\n## External residuals (status: external — visible, never faked as automated)\n\n| Criterion | Owner | Why external |\n|---|---|---|\n';
  for (const c of criteria.filter((c) => c.status === 'external' || c.external_owner)) o += `| ${c.id} | ${c.external_owner || c.owner_role} | ${c.external_reason || '—'} |\n`;
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
  for (const c of criteria) {
    if (c.class.includes('a') && !(c.control_refs && c.control_refs.length)) errs.push(`${c.id}: class a needs >=1 control_ref (automation)`);
    if (c.class.includes('c') && c.status === 'external' && !c.external_owner) errs.push(`${c.id}: class c/external needs external_owner`);
    if (!c.owner_role) errs.push(`${c.id}: missing owner_role`);
    if (!(c.class.includes('c')) && !(c.control_refs && c.control_refs.length)) errs.push(`${c.id}: non-external criterion needs >=1 control_ref`);
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
    if (cur && cur.overdue) errs.push(`process ${p.id} (${p.cadence}) OVERDUE — last ${cur.last} (${cur.from}), was due ${cur.dueBy}`);
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
