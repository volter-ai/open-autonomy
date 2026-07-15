#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs";
import type { RuntimeLedgerCorpus } from "../packages/core/src/organization-runtime-ledger";

const corpus = JSON.parse(
  readFileSync("docs/runtime-ledgers/r14-closure.json", "utf8"),
) as RuntimeLedgerCorpus;
corpus.evidenceLedger.push(
  { id: "ev-r13-runtime", kind: "artifact", uri: "packages/core/src/organization-a2a-agent-spec.ts", producer: "open-autonomy R13" },
  { id: "ev-r13-tests", kind: "test", uri: "packages/core/src/organization-a2a-agent-spec.test.ts", producer: "Bun test runner" },
  { id: "ev-r13-review", kind: "review", uri: "docs/evidence/R13-A2A-AGENT-SPEC-REVIEW.md", producer: "independent skeptical reviewer" },
  { id: "ev-r13-closure", kind: "test", uri: "docs/evidence/R13-CLOSURE.md", producer: "R13 closure gate" },
);
const evidence = ["ev-r13-runtime", "ev-r13-tests", "ev-r13-review"];
for (const entry of corpus.obligationLedger)
  if (entry.checkpoint === "R13") {
    entry.disposition = "preserved";
    entry.assurance = "property-tested";
    entry.evidence = evidence;
  }
corpus.semanticCoverageLedger.push(
  { construct: "A2A 0.3 task message artifact part card endpoint and streaming semantics with exact JSON-RPC lifecycle", checkpoint: "R13", disposition: "preserved", obligationIds: ["R13-ORG-1"] },
  { construct: "tenant organization actor task context endpoint and signed authorization binding", checkpoint: "R13", disposition: "preserved", obligationIds: ["R13-SEC-1"] },
  { construct: "total native-to-portable projection with explicit extension preservation and typed refinement loss", checkpoint: "R13", disposition: "preserved", obligationIds: ["R13-REF-1"] },
  { construct: "subprocess wire interoperability and version-pinned Agent Spec graph validation", checkpoint: "R13", disposition: "preserved", obligationIds: ["R13-ORG-1", "R13-REF-1"] },
);
const current = corpus.checkpointStateLedger.find((value) => value.id === "R13");
if (!current || current.status !== "ready") throw new Error("unexpected R13 predecessor state");
current.status = "complete";
for (const state of corpus.checkpointStateLedger)
  if (state.status === "blocked" && state.dependsOn.every((id) => corpus.checkpointStateLedger.find((value) => value.id === id)?.status === "complete"))
    state.status = "ready";
writeFileSync("docs/runtime-ledgers/r13-closure.json", `${JSON.stringify(corpus, null, 2)}\n`);
