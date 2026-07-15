#!/usr/bin/env bun
import {readFileSync,writeFileSync} from 'node:fs';
import type {RuntimeLedgerCorpus} from '../packages/core/src/organization-runtime-ledger';
const corpus=JSON.parse(readFileSync('docs/runtime-ledgers/r6-closure.json','utf8')) as RuntimeLedgerCorpus;
corpus.evidenceLedger.push(
  {id:'ev-r7-solver',kind:'artifact',uri:'packages/core/src/organization-deployment-solver.ts',producer:'open-autonomy R7'},
  {id:'ev-r7-verifier',kind:'artifact',uri:'packages/core/src/organization-deployment-certificate.ts',producer:'independent certificate verifier'},
  {id:'ev-r7-tests',kind:'test',uri:'packages/core/src/organization-deployment-solver.test.ts',producer:'Bun test runner'},
  {id:'ev-r7-certificate-tests',kind:'test',uri:'packages/core/src/organization-deployment-certificate.test.ts',producer:'Bun test runner'},
  {id:'ev-r7-review',kind:'review',uri:'docs/evidence/R7-DEPLOYMENT-SOLVER-REVIEW.md',producer:'independent adversarial reviewer'},
  {id:'ev-r7-closure',kind:'test',uri:'docs/evidence/R7-CLOSURE.md',producer:'R7 closure gate'},
);
const evidence:Record<string,string[]>={
  'R7-CSP-1':['ev-r7-solver','ev-r7-verifier','ev-r7-tests','ev-r7-review'],
  'R7-ECO-1':['ev-r7-solver','ev-r7-verifier','ev-r7-tests','ev-r7-review'],
  'R7-REF-1':['ev-r7-solver','ev-r7-verifier','ev-r7-tests','ev-r7-review'],
  'R7-EPI-1':['ev-r7-solver','ev-r7-verifier','ev-r7-tests','ev-r7-certificate-tests','ev-r7-review'],
};
for(const entry of corpus.obligationLedger)if(entry.checkpoint==='R7'){entry.disposition='preserved';entry.assurance='property-tested';entry.evidence=evidence[entry.id]??[];}
corpus.semanticCoverageLedger.push(
  {construct:'finite hard-feasibility CSP Pareto frontier and replayed UNSAT core',checkpoint:'R7',disposition:'preserved',obligationIds:['R7-CSP-1']},
  {construct:'dimensioned uncertain freshness-bound objective coordinates',checkpoint:'R7',disposition:'preserved',obligationIds:['R7-ECO-1']},
  {construct:'exact constructive adapter and migration obligation plans',checkpoint:'R7',disposition:'preserved',obligationIds:['R7-REF-1']},
  {construct:'scoped version-bounded acceptor-qualified evidence assumptions',checkpoint:'R7',disposition:'preserved',obligationIds:['R7-EPI-1']},
);
const current=corpus.checkpointStateLedger.find(x=>x.id==='R7'),next=corpus.checkpointStateLedger.find(x=>x.id==='R8');if(!current||!next||current.status!=='ready'||next.status!=='blocked')throw new Error('unexpected R7 predecessor state');current.status='complete';next.status='ready';writeFileSync('docs/runtime-ledgers/r7-closure.json',JSON.stringify(corpus,null,2)+'\n');
