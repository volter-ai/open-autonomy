#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs";
import type { RuntimeLedgerCorpus } from "../packages/core/src/organization-runtime-ledger";

const corpus = JSON.parse(
  readFileSync("docs/runtime-ledgers/r13-closure.json", "utf8"),
) as RuntimeLedgerCorpus;
corpus.evidenceLedger.push(
  { id: "ev-r17-runtime", kind: "artifact", uri: "packages/core/src/organization-desired-state-registry.ts", producer: "open-autonomy R17" },
  { id: "ev-r17-tests", kind: "test", uri: "packages/core/src/organization-desired-state-registry.test.ts", producer: "Bun test runner" },
  { id: "ev-r17-review", kind: "review", uri: "docs/evidence/R17-DESIRED-STATE-REGISTRY-REVIEW.md", producer: "independent skeptical reviewer" },
  { id: "ev-r17-closure", kind: "test", uri: "docs/evidence/R17-CLOSURE.md", producer: "R17 closure gate" },
);
const evidence = ["ev-r17-runtime", "ev-r17-tests", "ev-r17-review"];
for (const entry of corpus.obligationLedger)
  if (entry.checkpoint === "R17") {
    entry.disposition = "preserved";
    entry.assurance = "property-tested";
    entry.evidence = evidence;
  }
corpus.semanticCoverageLedger.push(
  { construct: "content-addressed immutable revisions branches promotions approvals and linearizable compare-and-swap generations", checkpoint: "R17", disposition: "preserved", obligationIds: ["R17-DB-1"] },
  { construct: "tenant-scoped metadata blob reachability authorization export backup restore and irreversible purge", checkpoint: "R17", disposition: "preserved", obligationIds: ["R17-SEC-1"] },
  { construct: "signed causal journal migrations retention point-in-time recovery revocation and rollback-resistant restore", checkpoint: "R17", disposition: "preserved", obligationIds: ["R17-EVO-1"] },
);
const current = corpus.checkpointStateLedger.find((value) => value.id === "R17");
if (!current || current.status !== "ready") throw new Error("unexpected R17 predecessor state");
current.status = "complete";
for (const state of corpus.checkpointStateLedger)
  if (state.status === "blocked" && state.dependsOn.every((id) => corpus.checkpointStateLedger.find((value) => value.id === id)?.status === "complete"))
    state.status = "ready";
writeFileSync("docs/runtime-ledgers/r17-closure.json", `${JSON.stringify(corpus, null, 2)}\n`);
