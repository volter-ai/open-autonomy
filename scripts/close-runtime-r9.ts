#!/usr/bin/env bun
import {readFileSync,writeFileSync} from 'node:fs';
import type {RuntimeLedgerCorpus} from '../packages/core/src/organization-runtime-ledger';
const corpus=JSON.parse(readFileSync('docs/runtime-ledgers/r8-closure.json','utf8')) as RuntimeLedgerCorpus;
corpus.evidenceLedger.push(
  {id:'ev-r9-runtime',kind:'artifact',uri:'packages/core/src/organization-migration-cutover.ts',producer:'open-autonomy R9'},
  {id:'ev-r9-tests',kind:'test',uri:'packages/core/src/organization-migration-cutover.test.ts',producer:'Bun test runner'},
  {id:'ev-r9-dogfood',kind:'artifact',uri:'docs/evidence/r9-repository-dogfood.json',producer:'repository R9 evidence generator'},
  {id:'ev-r9-review',kind:'review',uri:'docs/evidence/R9-MIGRATION-REVIEW.md',producer:'independent adversarial reviewer'},
  {id:'ev-r9-closure',kind:'test',uri:'docs/evidence/R9-CLOSURE.md',producer:'R9 closure gate'},
);
const evidence:Record<string,string[]>={
  'R9-SEM-1':['ev-r9-runtime','ev-r9-tests','ev-r9-review'],
  'R9-REF-1':['ev-r9-runtime','ev-r9-tests','ev-r9-review'],
  'R9-EVO-1':['ev-r9-runtime','ev-r9-tests','ev-r9-review'],
  'R9-DOG-1':['ev-r9-dogfood','ev-r9-tests','ev-r9-review'],
};
for(const entry of corpus.obligationLedger)if(entry.checkpoint==='R9'){entry.disposition='preserved';entry.assurance='property-tested';entry.evidence=evidence[entry.id]??[];}
corpus.semanticCoverageLedger.push(
  {construct:'total versioned v1 construct migration disposition and retained ABI round trip',checkpoint:'R9',disposition:'preserved',obligationIds:['R9-SEM-1']},
  {construct:'independently replayed dual compilation with artifact-derived observational equivalence',checkpoint:'R9',disposition:'preserved',obligationIds:['R9-REF-1']},
  {construct:'signed durable shadow canary cutover rollback and legacy-removal state machine',checkpoint:'R9',disposition:'preserved',obligationIds:['R9-EVO-1']},
  {construct:'canonical repository self-driving execution through the observed v2 controller path',checkpoint:'R9',disposition:'preserved',obligationIds:['R9-DOG-1']},
);
const current=corpus.checkpointStateLedger.find(x=>x.id==='R9'),next=corpus.checkpointStateLedger.find(x=>x.id==='R10');if(!current||!next||current.status!=='ready'||next.status!=='blocked')throw new Error('unexpected R9 predecessor state');current.status='complete';next.status='ready';writeFileSync('docs/runtime-ledgers/r9-closure.json',JSON.stringify(corpus,null,2)+'\n');
