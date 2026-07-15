#!/usr/bin/env bun
import {readFileSync,writeFileSync} from 'node:fs';
import type {RuntimeLedgerCorpus} from '../packages/core/src/organization-runtime-ledger';
const corpus=JSON.parse(readFileSync('docs/runtime-ledgers/r7-closure.json','utf8')) as RuntimeLedgerCorpus;
corpus.evidenceLedger.push(
  {id:'ev-r8-bundle',kind:'artifact',uri:'packages/core/src/organization-deployment-bundle.ts',producer:'open-autonomy R8'},
  {id:'ev-r8-tests',kind:'test',uri:'packages/core/src/organization-deployment-bundle.test.ts',producer:'Bun test runner'},
  {id:'ev-r8-review',kind:'review',uri:'docs/evidence/R8-SUPPLY-CHAIN-REVIEW.md',producer:'independent adversarial reviewer'},
  {id:'ev-r8-closure',kind:'test',uri:'docs/evidence/R8-CLOSURE.md',producer:'R8 closure gate'},
);
const evidence:Record<string,string[]>={
  'R8-ALG-1':['ev-r8-bundle','ev-r8-tests','ev-r8-review'],
  'R8-SEC-1':['ev-r8-bundle','ev-r8-tests','ev-r8-review'],
  'R8-OPS-1':['ev-r8-bundle','ev-r8-tests','ev-r8-review'],
  'R8-PROV-1':['ev-r8-bundle','ev-r8-tests','ev-r8-review'],
};
for(const entry of corpus.obligationLedger)if(entry.checkpoint==='R8'){entry.disposition='preserved';entry.assurance='property-tested';entry.evidence=evidence[entry.id]??[];}
corpus.semanticCoverageLedger.push(
  {construct:'canonical content-addressed deployment bundle and exact inventory',checkpoint:'R8',disposition:'preserved',obligationIds:['R8-ALG-1']},
  {construct:'signed SPDX/SLSA supply-chain closure and recursive secret exclusion',checkpoint:'R8',disposition:'preserved',obligationIds:['R8-SEC-1']},
  {construct:'no-recompilation signed environment promotion and rollback contracts',checkpoint:'R8',disposition:'preserved',obligationIds:['R8-OPS-1']},
  {construct:'immutable release and live-instance provenance attestations',checkpoint:'R8',disposition:'preserved',obligationIds:['R8-PROV-1']},
);
const current=corpus.checkpointStateLedger.find(x=>x.id==='R8'),next=corpus.checkpointStateLedger.find(x=>x.id==='R9');if(!current||!next||current.status!=='ready'||next.status!=='blocked')throw new Error('unexpected R8 predecessor state');current.status='complete';next.status='ready';writeFileSync('docs/runtime-ledgers/r8-closure.json',JSON.stringify(corpus,null,2)+'\n');
