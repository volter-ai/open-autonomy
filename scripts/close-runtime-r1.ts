#!/usr/bin/env bun
import { readFileSync, writeFileSync } from 'node:fs';
import type { RuntimeLedgerCorpus } from '../packages/core/src/organization-runtime-ledger';

const corpus = JSON.parse(readFileSync('docs/runtime-ledgers/r0-closure.json', 'utf8')) as RuntimeLedgerCorpus;
const evidence = [
  { id: 'ev-r1-spec', kind: 'artifact' as const, uri: 'docs/ORGANIZATION-IR-SPEC.md', producer: 'open-autonomy R1' },
  { id: 'ev-r1-field-grammar', kind: 'artifact' as const, uri: 'docs/ORGANIZATION-IR-FIELD-SEMANTICS.md', producer: 'generated organization field semantics' },
  { id: 'ev-r1-machine-grammar', kind: 'artifact' as const, uri: 'packages/core/src/generated/organization-ir-v2.schema.json', producer: 'generated organization schema' },
  { id: 'ev-r1-drift-tests', kind: 'test' as const, uri: 'packages/core/src/organization-spec.test.ts', producer: 'Bun test runner' },
  { id: 'ev-r1-semantic-tests', kind: 'test' as const, uri: 'packages/core/src/organization-normalize.test.ts', producer: 'Bun test runner' },
  { id: 'ev-r1-external-review', kind: 'review' as const, uri: 'docs/evidence/R1-EXTERNAL-IMPLEMENTER-REVIEW.md', producer: 'independent clean-room review agent' },
];
corpus.evidenceLedger.push(...evidence);
const obligationEvidence: Record<string, string[]> = {
  'R1-SEM-1': ['ev-r1-spec', 'ev-r1-field-grammar', 'ev-r1-machine-grammar', 'ev-r1-drift-tests', 'ev-r1-external-review'],
  'R1-TYP-1': ['ev-r1-field-grammar', 'ev-r1-machine-grammar', 'ev-r1-drift-tests', 'ev-r1-external-review'],
  'R1-ALG-1': ['ev-r1-spec', 'ev-r1-semantic-tests', 'ev-r1-external-review'],
  'R1-EVO-1': ['ev-r1-spec', 'ev-r1-field-grammar', 'ev-r1-semantic-tests', 'ev-r1-external-review'],
};
for (const entry of corpus.obligationLedger) if (entry.checkpoint === 'R1') {
  entry.disposition = 'preserved';
  entry.assurance = 'property-tested';
  entry.evidence = obligationEvidence[entry.id] ?? [];
}
corpus.semanticCoverageLedger.push(
  { construct: 'normative syntax, denotation, and unsupported-domain boundary', checkpoint: 'R1', disposition: 'preserved', obligationIds: ['R1-SEM-1'] },
  { construct: 'closed sorts, references, effects, and invalid-state rules', checkpoint: 'R1', disposition: 'preserved', obligationIds: ['R1-TYP-1'] },
  { construct: 'composition, identity, equivalence, ordering, and conflict algebra', checkpoint: 'R1', disposition: 'preserved', obligationIds: ['R1-ALG-1'] },
  { construct: 'defaults, extensions, versions, deprecation, and migration', checkpoint: 'R1', disposition: 'preserved', obligationIds: ['R1-EVO-1'] },
);
const r1 = corpus.checkpointStateLedger.find((entry) => entry.id === 'R1');
const r2 = corpus.checkpointStateLedger.find((entry) => entry.id === 'R2');
if (!r1 || !r2 || r1.status !== 'ready' || r2.status !== 'blocked') throw new Error('unexpected R1 predecessor state');
r1.status = 'complete';
r2.status = 'ready';
writeFileSync('docs/runtime-ledgers/r1-closure.json', `${JSON.stringify(corpus, null, 2)}\n`);
