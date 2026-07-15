#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs";
import type { RuntimeLedgerCorpus } from "../packages/core/src/organization-runtime-ledger";

const corpus=JSON.parse(readFileSync("docs/runtime-ledgers/r15-closure.json","utf8")) as RuntimeLedgerCorpus;
corpus.evidenceLedger.push(
  {id:"ev-r16-runtime",kind:"artifact",uri:"packages/core/src/organization-paperclip-runtime-adapters.ts",producer:"open-autonomy R16"},
  {id:"ev-r16-tests",kind:"test",uri:"packages/core/src/organization-paperclip-deployment.test.ts",producer:"Bun test runner and pinned Paperclip live process"},
  {id:"ev-r16-review",kind:"review",uri:"docs/evidence/R16-PAPERCLIP-LIVE-REVIEW.md",producer:"independent skeptical reviewer"},
  {id:"ev-r16-closure",kind:"test",uri:"docs/evidence/R16-CLOSURE.md",producer:"R16 closure gate"},
);
const evidence=["ev-r16-runtime","ev-r16-tests","ev-r16-review"];
for(const entry of corpus.obligationLedger)if(entry.checkpoint==="R16"){entry.disposition="preserved";entry.assurance="property-tested";entry.evidence=evidence;}
corpus.semanticCoverageLedger.push(
  {construct:"independent Paperclip work control interaction and execution authority with no Hermes controller dependency",checkpoint:"R16",disposition:"preserved",obligationIds:["R16-IND-1"]},
  {construct:"portable work approval heartbeat activity budget and gap observations without native enums in Organization IR",checkpoint:"R16",disposition:"preserved",obligationIds:["R16-REF-1"]},
  {construct:"pinned deploy checkout heartbeat recovery approvals hierarchy backup restore upgrade rollback fencing and owned teardown",checkpoint:"R16",disposition:"preserved",obligationIds:["R16-OPS-1"]},
  {construct:"observed cost latency capacity and human-load evidence with missing measurements represented as uncertainty rather than imputation",checkpoint:"R16",disposition:"preserved",obligationIds:["R16-ECO-1"]},
);
corpus.residualLedger.push(
  {id:"r16-paperclip-archive-boundary",checkpoint:"R16",category:"operational",finding:"Pinned Paperclip 0.3.1 cannot physically delete the owned budgeted company through its native API; isolated deployment teardown is the erasure boundary.",owner:"R16",disposition:"accepted",rationale:"The stronger assumption is explicit in the manifest, live post-state is archived, and the bundle owns and destroys the isolated deployment resources."},
  {id:"r16-platform-bound-physical-backup",checkpoint:"R16",category:"portability",finding:"The R16 physical Paperclip backup is bound to its declared Linux platform and is not claimed to be a cross-platform archive format.",owner:"R16",disposition:"accepted",rationale:"R16 proves quiescent backup and restore on the pinned deployment platform; portable archive conversion is a separate capability and no cross-platform claim is made."},
  {id:"r16-matched-economics-unknown",checkpoint:"R16",category:"measurement",finding:"Matched cost, latency, capacity, and human-load quantities were not measured under one calibrated Hermes/Paperclip workload.",owner:"R16",disposition:"accepted",rationale:"All four values are recorded as null/unknown in R16-MATCHED-ECONOMICS.json and the comparison is forced to undetermined with no ranking; missing evidence is never imputed as zero."},
);
const current=corpus.checkpointStateLedger.find(value=>value.id==="R16");if(!current||current.status!=="ready")throw new Error("unexpected R16 predecessor state");current.status="complete";
for(const state of corpus.checkpointStateLedger)if(state.status==="blocked"&&state.dependsOn.every(id=>corpus.checkpointStateLedger.find(value=>value.id===id)?.status==="complete"))state.status="ready";
writeFileSync("docs/runtime-ledgers/r16-closure.json",`${JSON.stringify(corpus,null,2)}\n`);
