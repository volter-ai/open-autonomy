#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs";
import type { RuntimeLedgerCorpus } from "../packages/core/src/organization-runtime-ledger";

const corpus = JSON.parse(readFileSync("docs/runtime-ledgers/r16-closure.json", "utf8")) as RuntimeLedgerCorpus;
corpus.evidenceLedger.push(
  { id: "ev-r18-runtime", kind: "artifact", uri: "packages/core/src/organization-runtime-event-store.ts", producer: "open-autonomy R18" },
  { id: "ev-r18-tests", kind: "test", uri: "packages/core/src/organization-runtime-event-store.test.ts", producer: "Bun test runner" },
  { id: "ev-r18-review", kind: "review", uri: "docs/evidence/R18-PORTABLE-EVENT-STORE-REVIEW.md", producer: "independent skeptical reviewer" },
  { id: "ev-r18-closure", kind: "test", uri: "docs/evidence/R18-CLOSURE.md", producer: "R18 closure gate" },
);
const evidence=["ev-r18-runtime","ev-r18-tests","ev-r18-review"];
for(const entry of corpus.obligationLedger)if(entry.checkpoint==="R18"){entry.disposition="preserved";entry.assurance="property-tested";entry.evidence=evidence;}
corpus.semanticCoverageLedger.push(
  { construct:"authenticated causal replay snapshot hot-payload compaction partition merge correction and retraction materialization",checkpoint:"R18",disposition:"preserved",obligationIds:["R18-ALG-1"] },
  { construct:"separately authorized native lift accept pending reject project and durable compare-and-swap transitions",checkpoint:"R18",disposition:"preserved",obligationIds:["R18-DB-1"] },
  { construct:"derivation-closed logical purge idempotent physical erasure immutable snapshot invalidation and retained-metadata residuals",checkpoint:"R18",disposition:"preserved",obligationIds:["R18-PRIV-1"] },
  { construct:"reconstructible event ingest logical issuer integrity adapter policy reducer migration and purge provenance",checkpoint:"R18",disposition:"preserved",obligationIds:["R18-PROV-1"] },
);
const current=corpus.checkpointStateLedger.find(value=>value.id==="R18");
if(!current||current.status!=="ready")throw new Error("unexpected R18 predecessor state");
current.status="complete";
for(const state of corpus.checkpointStateLedger)if(state.status==="blocked"&&state.dependsOn.every(id=>corpus.checkpointStateLedger.find(value=>value.id===id)?.status==="complete"))state.status="ready";
writeFileSync("docs/runtime-ledgers/r18-closure.json",`${JSON.stringify(corpus,null,2)}\n`);
