#!/usr/bin/env bun
import { readFileSync, writeFileSync } from 'node:fs';
import type { RuntimeLedgerCorpus } from '../packages/core/src/organization-runtime-ledger';

const corpus = JSON.parse(readFileSync('docs/runtime-ledgers/r1-closure.json', 'utf8')) as RuntimeLedgerCorpus;
corpus.evidenceLedger.push(
  { id: 'ev-r2-protocol', kind: 'artifact', uri: 'docs/ORGANIZATION-PACKAGE-SPEC.md', producer: 'open-autonomy R2' },
  { id: 'ev-r2-schema-corpus', kind: 'artifact', uri: 'packages/core/src/generated/artifact-schema-index.json', producer: 'generated artifact schema corpus' },
  { id: 'ev-r2-package-tests', kind: 'test', uri: 'packages/core/src/organization-package.test.ts', producer: 'Bun test runner' },
  { id: 'ev-r2-external-review', kind: 'review', uri: 'docs/evidence/R2-SKEPTICAL-REVIEW.md', producer: 'independent adversarial review agent' },
  { id: 'ev-r2-full-gate', kind: 'test', uri: 'packages/*/src/*.test.ts', producer: 'Bun core gate' },
);
const obligationEvidence: Record<string, string[]> = {
  'R2-SEM-1': ['ev-r2-protocol', 'ev-r2-schema-corpus', 'ev-r2-package-tests', 'ev-r2-external-review'],
  'R2-SEC-1': ['ev-r2-protocol', 'ev-r2-package-tests', 'ev-r2-external-review', 'ev-r2-full-gate'],
  'R2-ALG-1': ['ev-r2-protocol', 'ev-r2-package-tests', 'ev-r2-external-review'],
  'R2-PROV-1': ['ev-r2-schema-corpus', 'ev-r2-package-tests', 'ev-r2-external-review'],
};
for (const entry of corpus.obligationLedger) if (entry.checkpoint === 'R2') {
  entry.disposition = 'preserved'; entry.assurance = 'property-tested'; entry.evidence = obligationEvidence[entry.id] ?? [];
}
corpus.semanticCoverageLedger.push(
  { construct: 'logical, version, content, registry, and mirror identity separation', checkpoint: 'R2', disposition: 'preserved', obligationIds: ['R2-SEM-1'] },
  { construct: 'bounded exact resolution, trust, revocation, and dependency-confusion defenses', checkpoint: 'R2', disposition: 'preserved', obligationIds: ['R2-SEC-1'] },
  { construct: 'hermetic deterministic lock and package graph algebra', checkpoint: 'R2', disposition: 'preserved', obligationIds: ['R2-ALG-1'] },
  { construct: 'verified immutable package, signer, artifact-family, and source-pointer provenance', checkpoint: 'R2', disposition: 'preserved', obligationIds: ['R2-PROV-1'] },
);
const r2 = corpus.checkpointStateLedger.find((entry) => entry.id === 'R2');
const r3 = corpus.checkpointStateLedger.find((entry) => entry.id === 'R3');
if (!r2 || !r3 || r2.status !== 'ready' || r3.status !== 'blocked') throw new Error('unexpected R2 predecessor state');
r2.status = 'complete'; r3.status = 'ready';
writeFileSync('docs/runtime-ledgers/r2-closure.json', `${JSON.stringify(corpus, null, 2)}\n`);
