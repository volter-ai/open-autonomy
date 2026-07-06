#!/usr/bin/env bun
// hello-human's `requester`: a SCRIPT agent (no model, no termfleet install needed) that demonstrates the
// human seam on the local runner (docs/SPEC.md#handoffs) end to end.
//
// First run: no marker yet -> park an ask with the declared kind:human `approver` actor via the runner
// seam (`bun scripts/runner.ts launch approver ...`), remember its session id, and report parked.
// Later runs: a marker exists -> ask the runner for that session's CURRENT status (`get <id>`) and report
// whether the human operator has resolved it yet. The requester never marks it done itself — only an
// external, authorized `bun scripts/runner.ts update <id> --status done` (run by the operator, per
// docs/OPERATIONS.md's "Human-in-the-loop on the local runner" recipe) can do that.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const MARKER = '.open-autonomy/runner-state/hello-human-request.json';

/** The runner's CLI prints the session as JSON on its LAST stdout line (the same convention its own
 *  backends use) — parse that, ignoring any human-readable lines the human route also prints (the
 *  console engage notice). */
function lastJsonLine(stdout: string): Record<string, unknown> | undefined {
  const lines = stdout.trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i] ?? '');
    } catch {
      /* not the JSON line */
    }
  }
  return undefined;
}

if (!existsSync(MARKER)) {
  const r = spawnSync(
    'bun',
    [
      'scripts/runner.ts',
      'launch',
      'approver',
      '--ask',
      'approve the hello-human demo change',
      '--completion',
      'operator runs: bun scripts/runner.ts update <id> --status done',
    ],
    { encoding: 'utf8' },
  );
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  const session = lastJsonLine(r.stdout ?? '');
  const id = typeof session?.id === 'string' ? session.id : '';
  if (!id) {
    console.error('[requester] launch produced no session id; see runner output above');
    process.exit(1);
  }
  mkdirSync(dirname(MARKER), { recursive: true });
  writeFileSync(MARKER, `${JSON.stringify({ id }, null, 2)}\n`);
  console.log(`[requester] parked approval ${id} — see .open-autonomy/runner-state/human-attention.md`);
  process.exit(0);
}

const { id } = JSON.parse(readFileSync(MARKER, 'utf8')) as { id: string };
const r = spawnSync('bun', ['scripts/runner.ts', 'get', id], { encoding: 'utf8' });
const session = lastJsonLine(r.stdout ?? '');
const status = typeof session?.status === 'string' ? session.status : 'unknown';
if (status === 'done') {
  console.log(`[requester] approval ${id} resolved: status=done — proceeding`);
} else {
  console.log(`[requester] approval ${id} still ${status} — waiting on the human operator`);
}
