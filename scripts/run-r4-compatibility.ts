import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { canonicalSemanticJson, semanticDigest } from '../packages/core/src/organization-canonical';
import { validateOrganizationStructure } from '../packages/core/src/organization-structural';

type Entry = { path: string; sha256: string; operations: string[] };
type Difference = { class: 'normative-mismatch'|'supported-subset'|'diagnostic-wording'|'tool-failure'; field: string; detail: string; triage: 'resolved'|'accepted' };
const lockPath = 'docs/compatibility/corpus-lock.json';
const reportPath = 'docs/compatibility/differential-report.json';

function python(request: unknown): any {
  const run = spawnSync('python3', ['independent/python/r4.py'], { input: JSON.stringify(request), encoding: 'utf8', timeout: 5_000, maxBuffer: 5 * 1024 * 1024 });
  if (!run.stdout || run.error) throw new Error(`clean-room tool failure: ${run.error?.message ?? run.stderr}`);
  const lines = run.stdout.trim().split('\n');
  if (lines.length !== 1) throw new Error('clean-room tool emitted a non-framed response');
  return JSON.parse(lines[0]!);
}
function sha(raw: string) { return createHash('sha256').update(raw).digest('hex'); }
function pointer(error: string): string {
  const base = error.split(':', 1)[0] || '/';
  const additional = /unknown member '([^']+)'/.exec(error)?.[1];
  return additional ? `${base === '/' ? '' : base}/${additional.replace(/~/g,'~0').replace(/\//g,'~1')}` : base;
}
function diagnosticClass(error: string): string {
  if (error.includes('unknown member')) return 'unknown-member';
  if (error.includes('constant') || error.includes('/schema')) return 'schema';
  if (error.includes('required')) return 'required';
  return 'structure';
}
function portableNormalize(document: any): any {
  const copy = structuredClone(document);
  for (const catalog of ['imports','types','behaviors','tools','memories','capabilities','units','relations','goals','workTypes','initialWork','protocols','policies','budgets','decisions','artifacts']) copy[catalog] ??= {};
  for (const item of Object.values(copy.imports) as any[]) item.required ??= true;
  for (const behavior of Object.values(copy.behaviors) as any[]) if (behavior.instructions) {
    behavior.instructions.precedence ??= ['constitution','organization','role','task','skill','conversation','runtime'];
    behavior.instructions.conflict ??= 'reject';
  }
  return copy;
}
function migrate(document: any): { document: any; losses: any[] } {
  const behaviors: any = {}, actors: any = {}, capabilities: any = {};
  for (const [id, agent] of Object.entries(document.agents ?? {}) as [string, any][]) {
    const behavior = `${id}-behavior`; behaviors[behavior] = { kind: 'prompt', inline: agent.behavior ?? '' };
    const grants = (agent.capabilities ?? []).map((capability: string) => { capabilities[capability] ??= { resourceKinds: [capability], actions: ['use'] }; return { capability }; });
    actors[id] = { kind: agent.kind ?? 'agent', behaviors: [behavior], ...(grants.length ? { capabilities: grants } : {}) };
  }
  return { document: { schema:'autonomy.organization.v2', name:document.name ?? 'migrated-organization', behaviors, capabilities, actors, extensions:{'open-autonomy.dev/migration-v1-source':document} }, losses:[{class:'non-round-trip',fields:['targets','codeHost','policy','resources','documents','agents.triggers','agents.timeout','agents.review','agents.result','agents.prelaunch'],authorizationRequired:true}] };
}
function compare(field: string, left: unknown, right: unknown, differences: Array<Difference|Omit<Difference,'triage'>>, classification: Difference['class'] = 'normative-mismatch') {
  if (canonicalSemanticJson(left) !== canonicalSemanticJson(right)) differences.push({ class: classification, field, detail: 'TypeScript and clean-room observations differ' });
}

export async function runCompatibility(write = true) {
  const lockRaw = await readFile(lockPath, 'utf8'); const lock = JSON.parse(lockRaw) as { schema:string; languageVersion:string; canonicalization:string; files:Entry[] };
  const cases: any[] = [];
  for (const entry of lock.files) {
    const raw = await readFile(entry.path, 'utf8');
    if (sha(raw) !== entry.sha256) throw new Error(`corpus lock mismatch: ${entry.path}`);
    const document = JSON.parse(raw);
    for (const operation of entry.operations) {
      const differences: Array<Difference|Omit<Difference,'triage'>> = []; let primary: any; const request: any = { operation, document };
      if (operation === 'canonical') { request.domain = 'r4-corpus'; const canonical = canonicalSemanticJson(document); primary = { ok:true, canonical, canonicalBytesUtf8Hex:Buffer.from(canonical).toString('hex'), sha256:semanticDigest(document, request.domain).value }; }
      else if (operation === 'check') { const result = validateOrganizationStructure(document); primary = { ok:result.valid, diagnostics:result.errors.map(error => ({ class:diagnosticClass(error), path:pointer(error) })) }; }
      else if (operation === 'normalize') primary = { ok:true, document:portableNormalize(document) };
      else primary = { ok:true, ...migrate(document) };
      const cleanroom = python(request);
      if (operation === 'check') compare('diagnostic classes and paths', primary, { ok:cleanroom.ok, diagnostics:cleanroom.diagnostics.map(({class:c,path}:any)=>({class:c,path})) }, differences);
      else if (operation === 'normalize') compare('portable normalized document', primary.document, cleanroom.document, differences);
      else compare(operation, primary, cleanroom, differences);
      cases.push({ path:entry.path, operation, status:differences.some(d=>d.class==='normative-mismatch')?'difference':'match', differences });
    }
  }
  const untriaged = cases.flatMap(c => c.differences.filter((d:Difference) => !('triage' in d)).map((d:Difference)=>({path:c.path,operation:c.operation,...d})));
  const report = { schema:'autonomy.compatibility-report.v1', languageVersion:lock.languageVersion, corpusLockSha256:sha(lockRaw), toolchains:{primary:{language:'TypeScript',runtime:Bun.version},cleanroom:{language:'Python',runtime:python({operation:'canonical',domain:'version-probe',document:null}).ok?'python3 stdlib':'failed'}}, supportedSubset:'closed single-module structural check, canonicalization, authored-default normalization, registered experimental v1 migration', cases, untriaged };
  const rendered = JSON.stringify(report, null, 2)+'\n';
  if (write) await writeFile(reportPath, rendered);
  else if (await readFile(reportPath,'utf8') !== rendered) throw new Error('differential report is stale or tampered; regenerate it');
  return report;
}
if (import.meta.main) { const report = await runCompatibility(!process.argv.includes('--check')); if (report.untriaged.length || report.cases.some(c=>c.status==='difference')) process.exit(1); console.log(`R4 compatibility: ${report.cases.length} observations, ${report.untriaged.length} untriaged`); }
