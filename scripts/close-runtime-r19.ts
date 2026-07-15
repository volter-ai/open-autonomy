#!/usr/bin/env bun
import {readFileSync,writeFileSync} from "node:fs";
import type {RuntimeLedgerCorpus} from "../packages/core/src/organization-runtime-ledger";
const corpus=JSON.parse(readFileSync("docs/runtime-ledgers/r18-closure.json","utf8")) as RuntimeLedgerCorpus;
corpus.evidenceLedger.push(
 {id:"ev-r19-runtime",kind:"artifact",uri:"packages/core/src/organization-fleet-reconciler.ts",producer:"open-autonomy R19"},
 {id:"ev-r19-adapters",kind:"artifact",uri:"packages/core/src/organization-fleet-runtime-adapters.ts",producer:"open-autonomy R19"},
 {id:"ev-r19-tests",kind:"test",uri:"packages/core/src/organization-fleet-reconciler.test.ts",producer:"Bun test runner"},
 {id:"ev-r19-live",kind:"live-run",uri:"docs/evidence/R19-LIVE-GATE.json",producer:"isolated Hermes and Paperclip live gates"},
 {id:"ev-r19-review",kind:"review",uri:"docs/evidence/R19-FLEET-RECONCILER-REVIEW.md",producer:"independent skeptical reviewer"},
 {id:"ev-r19-closure",kind:"test",uri:"docs/evidence/R19-CLOSURE.md",producer:"R19 closure gate"},
);
const evidence=["ev-r19-runtime","ev-r19-adapters","ev-r19-tests","ev-r19-live","ev-r19-review"];
for(const entry of corpus.obligationLedger)if(entry.checkpoint==="R19"){entry.disposition="preserved";entry.assurance="property-tested";entry.evidence=evidence;}
corpus.semanticCoverageLedger.push(
 {construct:"bounded convergent desired-versus-observed control with hysteresis canaries refusal and escalation",checkpoint:"R19",disposition:"preserved",obligationIds:["R19-CTRL-1"]},
 {construct:"signed observations durable fence prepare-dispatch-ack idempotent effects and split-brain crash recovery",checkpoint:"R19",disposition:"preserved",obligationIds:["R19-DIST-1"]},
 {construct:"distinct semantic configuration version health capacity credential policy and observation drift",checkpoint:"R19",disposition:"preserved",obligationIds:["R19-SEM-1"]},
 {construct:"observable repair canary maintenance pause refusal rollback failure and convergence traces",checkpoint:"R19",disposition:"preserved",obligationIds:["R19-OPS-1"]},
);
corpus.residualLedger.push({id:"r19-paperclip-archive-teardown",checkpoint:"R19",category:"operational",finding:"Pinned Paperclip 0.3.1 native DELETE fails for the owned live-gate company; teardown verifies durable archive instead of erasure.",owner:"R19",disposition:"accepted",rationale:"The weaker guarantee is scoped to a uniquely owned disposable company, post-state verified, sentinel checked, and signed in R19-LIVE-GATE.json; no deletion claim is made."});
const current=corpus.checkpointStateLedger.find(x=>x.id==="R19");if(!current||current.status!=="ready")throw new Error("unexpected R19 predecessor state");current.status="complete";
for(const state of corpus.checkpointStateLedger)if(state.status==="blocked"&&state.dependsOn.every(id=>corpus.checkpointStateLedger.find(x=>x.id===id)?.status==="complete"))state.status="ready";
writeFileSync("docs/runtime-ledgers/r19-closure.json",`${JSON.stringify(corpus,null,2)}\n`);
