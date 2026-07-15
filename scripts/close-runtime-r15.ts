#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs";
import type { RuntimeLedgerCorpus } from "../packages/core/src/organization-runtime-ledger";

const corpus = JSON.parse(
  readFileSync("docs/runtime-ledgers/r12-closure.json", "utf8"),
) as RuntimeLedgerCorpus;
corpus.evidenceLedger.push(
  { id: "ev-r15-runtime", kind: "artifact", uri: "packages/core/src/organization-hermes-live-provider.ts", producer: "open-autonomy R15" },
  { id: "ev-r15-tests", kind: "test", uri: "packages/core/src/organization-hermes-live-provider.test.ts", producer: "Bun test runner and Hermes 0.18.2" },
  { id: "ev-r15-review", kind: "review", uri: "docs/evidence/R15-HERMES-LIVE-REVIEW.md", producer: "independent skeptical reviewer" },
  { id: "ev-r15-closure", kind: "test", uri: "docs/evidence/R15-CLOSURE.md", producer: "R15 closure gate" },
);
const evidence = ["ev-r15-runtime", "ev-r15-tests", "ev-r15-review"];
for (const entry of corpus.obligationLedger)
  if (entry.checkpoint === "R15") {
    entry.disposition = "preserved";
    entry.assurance = "property-tested";
    entry.evidence = evidence;
  }
corpus.semanticCoverageLedger.push(
  { construct: "durable monotonic dispatcher fencing replay duplicate delay loss partition restart and stale-completion handling", checkpoint: "R15", disposition: "preserved", obligationIds: ["R15-DIST-1"] },
  { construct: "manifest-driven deploy inspect pause upgrade backup restore rollback and restartable teardown", checkpoint: "R15", disposition: "preserved", obligationIds: ["R15-OPS-1"] },
  { construct: "signed Slack thread work decision correlation with replay and equivocation protection", checkpoint: "R15", disposition: "preserved", obligationIds: ["R15-HCI-1"] },
  { construct: "source release local revision executable and post-mutation native observation evidence", checkpoint: "R15", disposition: "preserved", obligationIds: ["R15-EPI-1"] },
);
const current = corpus.checkpointStateLedger.find((value) => value.id === "R15");
if (!current || current.status !== "ready") throw new Error("unexpected R15 predecessor state");
current.status = "complete";
for (const state of corpus.checkpointStateLedger)
  if (state.status === "blocked" && state.dependsOn.every((id) => corpus.checkpointStateLedger.find((value) => value.id === id)?.status === "complete"))
    state.status = "ready";
writeFileSync("docs/runtime-ledgers/r15-closure.json", `${JSON.stringify(corpus, null, 2)}\n`);
