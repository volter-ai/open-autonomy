#!/usr/bin/env bun
// Conformance CLI: pick a substrate's runner and run the core battery against it. Lives at repo
// root because it wires concrete runners from every substrate package (core stays substrate-free).
//   bun bin/autonomy-conformance.ts <exec|termfleet|github> [probeAgent]
import { runConformance, ExecRunner, type Runner } from '@open-autonomy/core';
import { TermfleetRunner } from '@open-autonomy/substrate-local';
import { GithubRunner } from '@open-autonomy/substrate-github';

function pickRunner(name: string): Runner {
  if (name === 'exec') return new ExecRunner(`/tmp/autonomy-conformance-${process.pid}.json`);
  if (name === 'termfleet') return new TermfleetRunner();
  if (name === 'gh-actions' || name === 'github') return new GithubRunner(); // 'github' = back-compat alias
  throw new Error(`unknown runner "${name}"; use exec|termfleet|gh-actions`);
}

const name = process.argv[2] ?? 'exec';
const probeAgent = process.argv[3];
// termfleet/github touch a real backend and need a moment for state to settle; exec is instant.
const settleMs = name === 'exec' ? 0 : 2500;
const report = await runConformance(pickRunner(name), { name, probeAgent, settleMs });
console.log(JSON.stringify(report, null, 2));
process.exit(report.passedCore ? 0 : 1);
