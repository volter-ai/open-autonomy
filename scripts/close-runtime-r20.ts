#!/usr/bin/env bun
import { readFileSync, writeFileSync } from 'node:fs';
import type { RuntimeLedgerCorpus } from '../packages/core/src/organization-runtime-ledger';

const corpus = JSON.parse(readFileSync('docs/runtime-ledgers/r19-closure.json', 'utf8')) as RuntimeLedgerCorpus;
corpus.evidenceLedger.push(
  { id: 'ev-r20-runtime', kind: 'artifact', uri: 'packages/core/src/organization-command-plane.ts', producer: 'open-autonomy R20' },
  { id: 'ev-r20-transports', kind: 'artifact', uri: 'packages/core/src/organization-command-transports.ts', producer: 'open-autonomy R20' },
  { id: 'ev-r20-tests', kind: 'test', uri: 'packages/core/src/organization-command-plane.test.ts', producer: 'Bun test runner' },
  { id: 'ev-r20-slack-twin', kind: 'live-run', uri: 'bench/dev/integration/slack-volter-twin.test.ts', producer: 'real Slack SDK over pinned Volter service twin' },
  { id: 'ev-r20-review', kind: 'review', uri: 'docs/evidence/R20-TWIN-CLOSURE-SKEPTICAL-REVIEW.md', producer: 'skeptical engineering review' },
  { id: 'ev-r20-closure', kind: 'test', uri: 'docs/evidence/R20-CLOSURE.md', producer: 'R20 twin-conformant engineering closure gate' },
);
const evidence = ['ev-r20-runtime', 'ev-r20-transports', 'ev-r20-tests', 'ev-r20-slack-twin', 'ev-r20-review'];
for (const entry of corpus.obligationLedger) if (entry.checkpoint === 'R20') {
  entry.disposition = 'preserved'; entry.assurance = 'property-tested'; entry.evidence = evidence;
}
corpus.semanticCoverageLedger.push(
  { construct: 'correlatable status explanation interruption approval revocation and durable recovery seams', checkpoint: 'R20', disposition: 'preserved', obligationIds: ['R20-HCI-1'] },
  { construct: 'tenant principal scope artifact expiry thread and idempotency binding for privileged commands', checkpoint: 'R20', disposition: 'preserved', obligationIds: ['R20-SEC-1'] },
  { construct: 'evidence assumptions conflicts and unknown-preserving organizational summaries', checkpoint: 'R20', disposition: 'preserved', obligationIds: ['R20-EPI-1'] },
  { construct: 'typed confirmation barrier against ambiguity forgery replay confused deputy and prompt-like input', checkpoint: 'R20', disposition: 'preserved', obligationIds: ['R20-ADV-1'] },
);
const current = corpus.checkpointStateLedger.find((entry) => entry.id === 'R20');
if (!current || current.status !== 'ready') throw new Error('unexpected R20 predecessor state');
current.status = 'complete';
for (const state of corpus.checkpointStateLedger)
  if (state.status === 'blocked' && state.dependsOn.every((id) => corpus.checkpointStateLedger.find((entry) => entry.id === id)?.status === 'complete')) state.status = 'ready';
writeFileSync('docs/runtime-ledgers/r20-closure.json', `${JSON.stringify(corpus, null, 2)}\n`);
