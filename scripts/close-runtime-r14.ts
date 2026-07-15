#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs";
import type { RuntimeLedgerCorpus } from "../packages/core/src/organization-runtime-ledger";
const corpus = JSON.parse(readFileSync("docs/runtime-ledgers/r10-closure.json", "utf8")) as RuntimeLedgerCorpus;
corpus.evidenceLedger.push(
  { id: "ev-r14-runtime", kind: "artifact", uri: "packages/core/src/organization-observability-policy.ts", producer: "open-autonomy R14" },
  { id: "ev-r14-tests", kind: "test", uri: "packages/core/src/organization-observability-policy.test.ts", producer: "Bun test runner" },
  { id: "ev-r14-review", kind: "review", uri: "docs/evidence/R14-OBSERVABILITY-REVIEW.md", producer: "independent skeptical reviewer" },
  { id: "ev-r14-closure", kind: "test", uri: "docs/evidence/R14-CLOSURE.md", producer: "R14 closure gate" },
);
const evidence = ["ev-r14-runtime", "ev-r14-tests", "ev-r14-review"];
for (const entry of corpus.obligationLedger) if (entry.checkpoint === "R14") { entry.disposition = "preserved"; entry.assurance = "property-tested"; entry.evidence = evidence; }
corpus.semanticCoverageLedger.push(
  { construct: "CloudEvents and pinned OpenTelemetry trace metric and log observation separated from signed work verification", checkpoint: "R14", disposition: "preserved", obligationIds: ["R14-EPI-1"] },
  { construct: "transport delivery trace parentage and signed control-adapter causality as distinct relations", checkpoint: "R14", disposition: "preserved", obligationIds: ["R14-DIST-1"] },
  { construct: "total workflow artifact lowering with typed loss and independently verified graph closure plus fail-closed policy enforcement", checkpoint: "R14", disposition: "preserved", obligationIds: ["R14-REF-1"] },
  { construct: "signed replay checkpoint and pinned telemetry convention workflow policy and adapter rule identities", checkpoint: "R14", disposition: "preserved", obligationIds: ["R14-EVO-1"] },
);
const current = corpus.checkpointStateLedger.find(value => value.id === "R14"); if (!current || current.status !== "ready") throw new Error("unexpected R14 predecessor state"); current.status = "complete";
for (const state of corpus.checkpointStateLedger) if (state.status === "blocked" && state.dependsOn.every(id => corpus.checkpointStateLedger.find(value => value.id === id)?.status === "complete")) state.status = "ready";
writeFileSync("docs/runtime-ledgers/r14-closure.json", `${JSON.stringify(corpus, null, 2)}\n`);
