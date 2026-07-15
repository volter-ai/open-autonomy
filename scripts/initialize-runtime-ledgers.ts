import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Glob } from 'bun';
import { RUNTIME_LEDGER_SCHEMA, validateRuntimeLedger, type RuntimeLedgerCorpus } from '../packages/core/src/organization-runtime-ledger';

const audit = readFileSync('docs/ORGANIZATION-RUNTIME-LENS-AUDIT.md', 'utf8');
const manifest = JSON.parse(readFileSync('docs/organization-runtime-punchlist.json', 'utf8')) as { items: Array<{ id: string; dependsOn: string[] }> };
const ids = [...audit.matchAll(/^\| (R\d+-[A-Z]+-\d+) /gm)].map((match) => match[1]!);
const corpus: RuntimeLedgerCorpus = {
  schema: RUNTIME_LEDGER_SCHEMA,
  obligationLedger: ids.map((id) => ({ id, checkpoint: id.split('-')[0]!, owner: id.split('-')[0]!, disposition: 'unresolved', assurance: 'unknown', evidence: [] })),
  semanticCoverageLedger: [],
  residualLedger: [],
  checkpointStateLedger: manifest.items.map((item) => ({ ...item, status: item.id === 'R0' ? 'ready' : 'blocked' })),
  evidenceLedger: [],
};
const errors = validateRuntimeLedger(corpus, ids, manifest.items);
if (errors.length) throw new Error(JSON.stringify(errors, null, 2));
mkdirSync('docs/runtime-ledgers', { recursive: true });
writeFileSync('docs/runtime-ledgers/baseline.json', `${JSON.stringify(corpus, null, 2)}\n`);

const publicInputs = [
  'docs/ORGANIZATION-IR.md', 'docs/ORGANIZATION-IR-AC.md', 'docs/ORGANIZATION-IR-LENS-AUDIT.md',
  'docs/ORGANIZATION-RUNTIME-AC.md', 'docs/ORGANIZATION-RUNTIME-LENS-AUDIT.md',
  'docs/organization-runtime-punchlist.json',
];
const fixtureInputs = [...new Glob('packages/core/src/organization-*.test.ts').scanSync('.')].sort();
const digest = (path: string) => new Bun.CryptoHasher('sha256').update(readFileSync(path)).digest('hex');
writeFileSync('docs/runtime-ledgers/baseline-manifest.json', `${JSON.stringify({
  schema: 'open-autonomy.runtime-baseline.v1',
  digestAlgorithm: 'sha256',
  semanticInputs: publicInputs.map((path) => ({ path, digest: digest(path) })),
  fixtureCorpus: fixtureInputs.map((path) => ({ path, digest: digest(path) })),
}, null, 2)}\n`);

const closure = structuredClone(corpus);
closure.evidenceLedger = [
  { id: 'ev-r0-baseline', kind: 'artifact', uri: 'docs/runtime-ledgers/baseline-manifest.json', producer: 'scripts/initialize-runtime-ledgers.ts' },
  { id: 'ev-r0-threats', kind: 'artifact', uri: 'docs/evidence/R0-BASELINE-THREAT-MODEL.md', producer: 'runtime phase R0' },
  { id: 'ev-r0-reviews', kind: 'review', uri: 'docs/evidence/R0-SKEPTICAL-REVIEWS.md', producer: 'two independent read-only reviewers' },
  { id: 'ev-r0-ledger-tests', kind: 'test', uri: 'packages/core/src/organization-runtime-ledger.test.ts', producer: 'bun test' },
  { id: 'ev-r0-full-gate', kind: 'test', uri: 'docs/evidence/R0-CLOSURE.md', producer: 'bun run check' },
];
const evidenceByObligation: Record<string, string[]> = {
  'R0-SEM-1': ['ev-r0-baseline', 'ev-r0-full-gate'],
  'R0-SEC-1': ['ev-r0-threats', 'ev-r0-reviews'],
  'R0-DIST-1': ['ev-r0-threats', 'ev-r0-reviews'],
  'R0-ADV-1': ['ev-r0-threats', 'ev-r0-reviews'],
  'R0-ACC-1': ['ev-r0-ledger-tests', 'ev-r0-full-gate'],
};
for (const entry of closure.obligationLedger) if (entry.checkpoint === 'R0') {
  entry.disposition = 'preserved';
  entry.assurance = 'property-tested';
  entry.evidence = evidenceByObligation[entry.id] ?? [];
}
closure.semanticCoverageLedger = Object.keys(evidenceByObligation).map((id) => ({
  construct: id === 'R0-SEM-1' ? 'public semantic and API baseline'
    : id === 'R0-SEC-1' ? 'principals, credentials, tenants, trust, effects, and data'
    : id === 'R0-DIST-1' ? 'distributed failure and recovery assumptions'
    : id === 'R0-ADV-1' ? 'finding ownership and rejection accounting'
    : 'runtime proof-accounting closure',
  checkpoint: 'R0', disposition: 'preserved', obligationIds: [id],
}));
closure.checkpointStateLedger[0]!.status = 'complete';
closure.checkpointStateLedger[1]!.status = 'ready';
const closureErrors = validateRuntimeLedger(closure, ids, manifest.items);
if (closureErrors.length) throw new Error(JSON.stringify(closureErrors, null, 2));
writeFileSync('docs/runtime-ledgers/r0-closure.json', `${JSON.stringify(closure, null, 2)}\n`);
