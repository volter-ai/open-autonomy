#!/usr/bin/env bun
import { readFileSync, writeFileSync } from 'node:fs';
import type { RuntimeLedgerCorpus } from '../packages/core/src/organization-runtime-ledger';

const corpus = JSON.parse(readFileSync('docs/runtime-ledgers/r3-closure.json', 'utf8')) as RuntimeLedgerCorpus;
corpus.evidenceLedger.push(
  { id:'ev-r4-cleanroom', kind:'artifact', uri:'independent/python/r4.py', producer:'clean-room Python author' },
  { id:'ev-r4-corpus', kind:'artifact', uri:'docs/compatibility/corpus-lock.json', producer:'digest-locked interoperability corpus' },
  { id:'ev-r4-report', kind:'test', uri:'docs/compatibility/differential-report.json', producer:'separate TypeScript/Python toolchains' },
  { id:'ev-r4-exposure', kind:'artifact', uri:'docs/compatibility/EXPOSURE-RECORD.md', producer:'clean-room Python author' },
  { id:'ev-r4-policy', kind:'artifact', uri:'docs/ORGANIZATION-COMPATIBILITY-POLICY.md', producer:'open-autonomy R4' },
  { id:'ev-r4-feedback', kind:'review', uri:'docs/compatibility/clean-room-author-feedback.md', producer:'clean-room Python author' },
  { id:'ev-r4-tests', kind:'test', uri:'packages/core/src/organization-compatibility.test.ts', producer:'Bun and Python test runners' },
  { id:'ev-r4-review', kind:'review', uri:'docs/evidence/R4-COMPATIBILITY-REVIEW.md', producer:'independent software quality subagent' },
);
const evidence: Record<string,string[]> = {
  'R4-SEM-1':['ev-r4-corpus','ev-r4-report','ev-r4-tests','ev-r4-review'],
  'R4-COMP-1':['ev-r4-cleanroom','ev-r4-exposure','ev-r4-feedback','ev-r4-review'],
  'R4-FALS-1':['ev-r4-report','ev-r4-tests','ev-r4-review'],
  'R4-IND-1':['ev-r4-exposure','ev-r4-policy','ev-r4-feedback','ev-r4-review'],
};
for (const entry of corpus.obligationLedger) if (entry.checkpoint === 'R4') {
  entry.disposition='preserved'; entry.assurance='property-tested'; entry.evidence=evidence[entry.id] ?? [];
}
corpus.semanticCoverageLedger.push(
  { construct:'canonical bytes, domain-framed semantic hashes, diagnostics, normalization, and migration agreement', checkpoint:'R4', disposition:'preserved', obligationIds:['R4-SEM-1'] },
  { construct:'public specification sufficiency independent of private TypeScript behavior', checkpoint:'R4', disposition:'preserved', obligationIds:['R4-COMP-1'] },
  { construct:'closed discrepancy taxonomy with zero untriaged residuals', checkpoint:'R4', disposition:'preserved', obligationIds:['R4-FALS-1'] },
  { construct:'constrained and recorded clean-room exposure', checkpoint:'R4', disposition:'preserved', obligationIds:['R4-IND-1'] },
);
const current=corpus.checkpointStateLedger.find(x=>x.id==='R4'); const next=corpus.checkpointStateLedger.find(x=>x.id==='R5');
if (!current || !next || current.status!=='ready' || next.status!=='blocked') throw new Error('unexpected R4 predecessor state');
current.status='complete'; next.status='ready';
writeFileSync('docs/runtime-ledgers/r4-closure.json', JSON.stringify(corpus,null,2)+'\n');
