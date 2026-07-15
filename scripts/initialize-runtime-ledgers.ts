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
