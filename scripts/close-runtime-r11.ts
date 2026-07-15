#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs";
import type { RuntimeLedgerCorpus } from "../packages/core/src/organization-runtime-ledger";

const corpus = JSON.parse(
  readFileSync("docs/runtime-ledgers/r17-closure.json", "utf8"),
) as RuntimeLedgerCorpus;
corpus.evidenceLedger.push(
  { id: "ev-r11-runtime", kind: "artifact", uri: "packages/core/src/organization-harness-worker.ts", producer: "open-autonomy R11" },
  { id: "ev-r11-tests", kind: "test", uri: "packages/core/src/organization-harness-worker.test.ts", producer: "Bun test runner" },
  { id: "ev-r11-review", kind: "review", uri: "docs/evidence/R11-HARNESS-WORKER-REVIEW.md", producer: "independent skeptical reviewer" },
  { id: "ev-r11-closure", kind: "test", uri: "docs/evidence/R11-CLOSURE.md", producer: "R11 closure gate" },
);
const evidence = ["ev-r11-runtime", "ev-r11-tests", "ev-r11-review"];
for (const entry of corpus.obligationLedger)
  if (entry.checkpoint === "R11") {
    entry.disposition = "preserved";
    entry.assurance = "property-tested";
    entry.evidence = evidence;
  }
corpus.semanticCoverageLedger.push(
  { construct: "canonical work execution attempt session artifact interaction usage report and terminal-result bindings", checkpoint: "R11", disposition: "preserved", obligationIds: ["R11-ORG-1", "R11-CTX-1"] },
  { construct: "atomic effect receipts interprocess serialization fencing replay reconstruction and dead-owner recovery", checkpoint: "R11", disposition: "preserved", obligationIds: ["R11-DIST-1"] },
  { construct: "byte-attested executable sandbox filesystem argv cwd identity and effect-time network authority", checkpoint: "R11", disposition: "preserved", obligationIds: ["R11-SEC-1"] },
  { construct: "schema-bound artifacts reports usage and success evidence specific to the completed result", checkpoint: "R11", disposition: "preserved", obligationIds: ["R11-EPI-1"] },
  { construct: "protocol-distinct installed Codex JSONL and independent stateful process harness adapters", checkpoint: "R11", disposition: "preserved", obligationIds: ["R11-INT-1"] },
);
const current = corpus.checkpointStateLedger.find((value) => value.id === "R11");
if (!current || current.status !== "ready") throw new Error("unexpected R11 predecessor state");
current.status = "complete";
for (const state of corpus.checkpointStateLedger)
  if (state.status === "blocked" && state.dependsOn.every((id) => corpus.checkpointStateLedger.find((value) => value.id === id)?.status === "complete"))
    state.status = "ready";
writeFileSync("docs/runtime-ledgers/r11-closure.json", `${JSON.stringify(corpus, null, 2)}\n`);
