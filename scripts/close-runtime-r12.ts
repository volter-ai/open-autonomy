#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs";
import type { RuntimeLedgerCorpus } from "../packages/core/src/organization-runtime-ledger";

const corpus = JSON.parse(
  readFileSync("docs/runtime-ledgers/r11-closure.json", "utf8"),
) as RuntimeLedgerCorpus;
corpus.evidenceLedger.push(
  { id: "ev-r12-runtime", kind: "artifact", uri: "packages/core/src/organization-mcp-native.ts", producer: "open-autonomy R12" },
  { id: "ev-r12-schema", kind: "artifact", uri: "packages/core/src/fixtures/mcp-2025-06-18-schema.json.base64", producer: "official MCP schema fixture" },
  { id: "ev-r12-tests", kind: "test", uri: "packages/core/src/organization-mcp-native.test.ts", producer: "Bun test runner and official MCP SDK" },
  { id: "ev-r12-review", kind: "review", uri: "docs/evidence/R12-MCP-NATIVE-REVIEW.md", producer: "independent skeptical reviewer" },
  { id: "ev-r12-closure", kind: "test", uri: "docs/evidence/R12-CLOSURE.md", producer: "R12 closure gate" },
);
const evidence = ["ev-r12-runtime", "ev-r12-schema", "ev-r12-tests", "ev-r12-review"];
for (const entry of corpus.obligationLedger)
  if (entry.checkpoint === "R12") {
    entry.disposition = "preserved";
    entry.assurance = "property-tested";
    entry.evidence = evidence;
  }
corpus.semanticCoverageLedger.push(
  { construct: "official MCP 2025-06-18 SDK stdio and Streamable HTTP lifecycle interoperability", checkpoint: "R12", disposition: "preserved", obligationIds: ["R12-INT-1"] },
  { construct: "closed capabilities method schemas recursive metadata aggregate bounds and connection-bound endpoint execution", checkpoint: "R12", disposition: "preserved", obligationIds: ["R12-SEC-1"] },
  { construct: "exact native payload preservation and total per-field typed refinement loss", checkpoint: "R12", disposition: "preserved", obligationIds: ["R12-REF-1"] },
);
const current = corpus.checkpointStateLedger.find((value) => value.id === "R12");
if (!current || current.status !== "ready") throw new Error("unexpected R12 predecessor state");
current.status = "complete";
for (const state of corpus.checkpointStateLedger)
  if (state.status === "blocked" && state.dependsOn.every((id) => corpus.checkpointStateLedger.find((value) => value.id === id)?.status === "complete"))
    state.status = "ready";
writeFileSync("docs/runtime-ledgers/r12-closure.json", `${JSON.stringify(corpus, null, 2)}\n`);
