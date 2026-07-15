#!/usr/bin/env bun
import {readFileSync,writeFileSync} from 'node:fs';
import type {RuntimeLedgerCorpus} from '../packages/core/src/organization-runtime-ledger';
const corpus=JSON.parse(readFileSync('docs/runtime-ledgers/r4-closure.json','utf8')) as RuntimeLedgerCorpus;
corpus.evidenceLedger.push(
  {id:'ev-r5-api',kind:'artifact',uri:'packages/core/src/organization-compiler-api.ts',producer:'open-autonomy R5'},
  {id:'ev-r5-builtins',kind:'artifact',uri:'packages/core/src/organization-compiler-builtins.ts',producer:'audited domain adapters'},
  {id:'ev-r5-schema',kind:'artifact',uri:'packages/core/src/generated/compiler-artifact-v1.schema.json',producer:'generated closed artifact protocol'},
  {id:'ev-r5-cli',kind:'artifact',uri:'bin/organization-compiler-api.ts',producer:'bounded JSON CLI'},
  {id:'ev-r5-golden',kind:'test',uri:'docs/compiler/golden-artifact-v1.json',producer:'API 1.0 golden protocol'},
  {id:'ev-r5-hostile',kind:'test',uri:'docs/compiler/fixtures/hostile-plugin.c',producer:'hostile isolated plugin fixture'},
  {id:'ev-r5-tests',kind:'test',uri:'packages/core/src/organization-compiler-api.test.ts',producer:'Bun, GCC, Bubblewrap, prlimit'},
  {id:'ev-r5-policy',kind:'artifact',uri:'docs/ORGANIZATION-COMPILER-API.md',producer:'open-autonomy R5'},
  {id:'ev-r5-review',kind:'review',uri:'docs/evidence/R5-COMPILER-API-REVIEW.md',producer:'independent software quality subagent'},
);
const evidence:Record<string,string[]>={
  'R5-COMP-1':['ev-r5-api','ev-r5-builtins','ev-r5-tests','ev-r5-review'],
  'R5-ALG-1':['ev-r5-api','ev-r5-golden','ev-r5-tests','ev-r5-review'],
  'R5-SEC-1':['ev-r5-api','ev-r5-hostile','ev-r5-tests','ev-r5-review'],
  'R5-EVO-1':['ev-r5-schema','ev-r5-cli','ev-r5-golden','ev-r5-policy','ev-r5-review'],
};
for(const entry of corpus.obligationLedger)if(entry.checkpoint==='R5'){entry.disposition='preserved';entry.assurance='property-tested';entry.evidence=evidence[entry.id]??[];}
corpus.semanticCoverageLedger.push(
  {construct:'immutable declared bounded cancellable deterministic compiler pass inputs',checkpoint:'R5',disposition:'preserved',obligationIds:['R5-COMP-1']},
  {construct:'clean incremental cached serial and deterministic-parallel artifact equivalence',checkpoint:'R5',disposition:'preserved',obligationIds:['R5-ALG-1']},
  {construct:'closed audited built-ins and kernel-bounded isolated plugin authority',checkpoint:'R5',disposition:'preserved',obligationIds:['R5-SEC-1']},
  {construct:'versioned closed artifact schema CLI golden and compatibility window',checkpoint:'R5',disposition:'preserved',obligationIds:['R5-EVO-1']},
);
const current=corpus.checkpointStateLedger.find(x=>x.id==='R5');const next=corpus.checkpointStateLedger.find(x=>x.id==='R6');if(!current||!next||current.status!=='ready'||next.status!=='blocked')throw new Error('unexpected R5 predecessor state');current.status='complete';next.status='ready';writeFileSync('docs/runtime-ledgers/r5-closure.json',JSON.stringify(corpus,null,2)+'\n');
