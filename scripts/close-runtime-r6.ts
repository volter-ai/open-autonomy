#!/usr/bin/env bun
import {readFileSync,writeFileSync} from 'node:fs';
import type {RuntimeLedgerCorpus} from '../packages/core/src/organization-runtime-ledger';
const corpus=JSON.parse(readFileSync('docs/runtime-ledgers/r5-closure.json','utf8')) as RuntimeLedgerCorpus;
corpus.evidenceLedger.push(
  {id:'ev-r6-sdk',kind:'artifact',uri:'packages/sdk/src/index.ts',producer:'open-autonomy R6'},
  {id:'ev-r6-provider',kind:'artifact',uri:'packages/substrate-toy/src/index.ts',producer:'SDK-only provider author'},
  {id:'ev-r6-tests',kind:'test',uri:'packages/sdk/src/index.test.ts',producer:'Bun test runner'},
  {id:'ev-r6-tck',kind:'test',uri:'packages/substrate-toy/src/index.test.ts',producer:'published conformance TCK'},
  {id:'ev-r6-docs',kind:'artifact',uri:'packages/sdk/README.md',producer:'public SDK documentation'},
  {id:'ev-r6-cleanroom',kind:'review',uri:'docs/sdk/clean-room-author-feedback.md',producer:'independent clean-room provider author'},
  {id:'ev-r6-review',kind:'review',uri:'docs/evidence/R6-SDK-REVIEW.md',producer:'independent adversarial reviewer'},
  {id:'ev-r6-closure',kind:'test',uri:'docs/evidence/R6-CLOSURE.md',producer:'R6 closure gate'},
);
const evidence:Record<string,string[]>={
  'R6-EXT-1':['ev-r6-sdk','ev-r6-provider','ev-r6-docs','ev-r6-cleanroom','ev-r6-tck','ev-r6-review'],
  'R6-REF-1':['ev-r6-sdk','ev-r6-provider','ev-r6-tests','ev-r6-tck','ev-r6-review'],
  'R6-OPS-1':['ev-r6-sdk','ev-r6-tests','ev-r6-tck','ev-r6-review'],
  'R6-DIR-1':['ev-r6-provider','ev-r6-tests','ev-r6-cleanroom','ev-r6-review'],
};
for(const entry of corpus.obligationLedger)if(entry.checkpoint==='R6'){entry.disposition='preserved';entry.assurance='property-tested';entry.evidence=evidence[entry.id]??[];}
corpus.semanticCoverageLedger.push(
  {construct:'public provider registration without core product cases',checkpoint:'R6',disposition:'preserved',obligationIds:['R6-EXT-1']},
  {construct:'artifact-retained lowering obligations losses and migration dispositions',checkpoint:'R6',disposition:'preserved',obligationIds:['R6-REF-1']},
  {construct:'bounded executable health lifecycle recovery fault trace and credential contracts',checkpoint:'R6',disposition:'preserved',obligationIds:['R6-OPS-1']},
  {construct:'core to SDK to provider dependency direction',checkpoint:'R6',disposition:'preserved',obligationIds:['R6-DIR-1']},
);
const current=corpus.checkpointStateLedger.find(x=>x.id==='R6');const next=corpus.checkpointStateLedger.find(x=>x.id==='R7');if(!current||!next||current.status!=='ready'||next.status!=='blocked')throw new Error('unexpected R6 predecessor state');current.status='complete';next.status='ready';writeFileSync('docs/runtime-ledgers/r6-closure.json',JSON.stringify(corpus,null,2)+'\n');
