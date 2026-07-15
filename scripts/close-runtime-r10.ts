#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs";
import type { RuntimeLedgerCorpus } from "../packages/core/src/organization-runtime-ledger";

const corpus = JSON.parse(readFileSync("docs/runtime-ledgers/r9-closure.json", "utf8")) as RuntimeLedgerCorpus;
corpus.evidenceLedger.push(
  { id: "ev-r10-authority", kind: "artifact", uri: "packages/core/src/organization-identity-authority.ts", producer: "open-autonomy R10" },
  { id: "ev-r10-tests", kind: "test", uri: "packages/core/src/organization-identity-authority.test.ts", producer: "Bun test runner" },
  { id: "ev-r10-process-custody", kind: "live-run", uri: "packages/core/src/organization-identity-authority.integration.test.ts", producer: "process-isolated R10 custody drill" },
  { id: "ev-r10-review", kind: "review", uri: "docs/evidence/R10-AUTHORITY-REVIEW.md", producer: "independent skeptical reviewer" },
  { id: "ev-r10-closure", kind: "test", uri: "docs/evidence/R10-CLOSURE.md", producer: "R10 closure gate" },
);
const evidence: Record<string, string[]> = {
  "R10-SEC-1": ["ev-r10-authority", "ev-r10-tests", "ev-r10-review"],
  "R10-CAP-1": ["ev-r10-authority", "ev-r10-tests", "ev-r10-review"],
  "R10-DIST-1": ["ev-r10-authority", "ev-r10-tests", "ev-r10-review"],
  "R10-OPS-1": ["ev-r10-process-custody", "ev-r10-tests", "ev-r10-review"],
};
for (const entry of corpus.obligationLedger) if (entry.checkpoint === "R10") {
  entry.disposition = "preserved";
  entry.assurance = "property-tested";
  entry.evidence = evidence[entry.id] ?? [];
}
corpus.semanticCoverageLedger.push(
  { construct: "tenant-scoped signed identity graph and authorization-path revocation", checkpoint: "R10", disposition: "preserved", obligationIds: ["R10-SEC-1"] },
  { construct: "monotone grant attenuation and request-bound proof of possession", checkpoint: "R10", disposition: "preserved", obligationIds: ["R10-CAP-1"] },
  { construct: "tenant-local ordered revocation, durable replay receipts, signed restore, and idempotent custody outbox", checkpoint: "R10", disposition: "preserved", obligationIds: ["R10-DIST-1"] },
  { construct: "authenticated process-isolated custody and independently approved nondelegable break glass", checkpoint: "R10", disposition: "preserved", obligationIds: ["R10-OPS-1"] },
);
const current = corpus.checkpointStateLedger.find(value => value.id === "R10");
if (!current || current.status !== "ready") throw new Error("unexpected R10 predecessor state");
current.status = "complete";
for (const state of corpus.checkpointStateLedger) if (state.status === "blocked" && state.dependsOn.every(id => corpus.checkpointStateLedger.find(value => value.id === id)?.status === "complete")) state.status = "ready";
writeFileSync("docs/runtime-ledgers/r10-closure.json", `${JSON.stringify(corpus, null, 2)}\n`);
