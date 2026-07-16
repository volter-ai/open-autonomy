#!/usr/bin/env bun
import{readFileSync,writeFileSync}from'node:fs';import type{RuntimeLedgerCorpus}from'../packages/core/src/organization-runtime-ledger';
const c=JSON.parse(readFileSync('docs/runtime-ledgers/r21-closure.json','utf8'))as RuntimeLedgerCorpus;
c.evidenceLedger.push(
 {id:'ev-r22-runtime',kind:'artifact',uri:'packages/core/src/organization-benchmark-protocol.ts',producer:'open-autonomy R22'},
 {id:'ev-r22-tests',kind:'test',uri:'packages/core/src/organization-benchmark-protocol.test.ts',producer:'Bun test runner'},
 {id:'ev-r22-custody',kind:'test',uri:'packages/core/src/organization-r22-external-evidence-live.test.ts',producer:'process-isolated custody gate'},
 {id:'ev-r22-campaign',kind:'test',uri:'packages/core/src/organization-r22-external-campaign.test.ts',producer:'signed deterministic campaign verifier'},
 {id:'ev-r22-review',kind:'review',uri:'docs/evidence/R22-TWIN-CLOSURE-SKEPTICAL-REVIEW.md',producer:'skeptical engineering review'},
 {id:'ev-r22-closure',kind:'test',uri:'docs/evidence/R22-CLOSURE.md',producer:'R22 engineering closure gate'});
const ev=['ev-r22-runtime','ev-r22-tests','ev-r22-custody','ev-r22-campaign','ev-r22-review'];for(const x of c.obligationLedger)if(x.checkpoint==='R22'){x.disposition='preserved';x.assurance='property-tested';x.evidence=ev;}
for(const[construct,id]of[
 ['predeclared workload outcome unit population scorer stopping retry and missing-data semantics','R22-MEA-1'],
 ['seeded randomization replication sample variance uncertainty and multiplicity accounting','R22-STAT-1'],
 ['hidden custody independent grading contamination cherry-pick and self-judging defenses','R22-ADV-1'],
 ['bounded secrets retention deletion release and public-result projection','R22-PRIV-1'],
 ['versioned simulator contracts explicit calibration absence and human-result separation','R22-HUM-1']])c.semanticCoverageLedger.push({construct,checkpoint:'R22',disposition:'preserved',obligationIds:[id]});
const s=c.checkpointStateLedger.find(x=>x.id==='R22');if(!s||s.status!=='ready')throw Error('unexpected R22 predecessor');s.status='complete';for(const x of c.checkpointStateLedger)if(x.status==='blocked'&&x.dependsOn.every(id=>c.checkpointStateLedger.find(y=>y.id===id)?.status==='complete'))x.status='ready';writeFileSync('docs/runtime-ledgers/r22-closure.json',JSON.stringify(c,null,2)+'\n');
