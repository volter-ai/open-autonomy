#!/usr/bin/env bun
// The uniform interface to the agent runner. A skill or script calls this and stays
// substrate-agnostic; the backend (exec | termfleet | …) is chosen by AUTONOMY_RUNNER.
//   autonomy launch <role> [--issue <id>]    # C — create a session
//   autonomy get <id>                         # R — read one session (JSON)
//   autonomy list                             # R — read running sessions (JSON)
//   autonomy update <id> --status <status>    # U — transition (done|failed|paused|running)
//   autonomy cancel <id>                      # D — delete a session
import { getRunner, type SessionStatus } from './autonomy-runner';

const [cmd, ...rest] = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
};
const runner = getRunner();

if (cmd === 'launch') {
  const role = rest[0];
  if (!role || role.startsWith('--')) {
    console.error('usage: autonomy launch <role> [--issue <id>]');
    process.exit(2);
  }
  console.log(JSON.stringify(runner.launch(role, opt('--issue'))));
} else if (cmd === 'get') {
  const session = runner.get(rest[0] ?? '');
  if (!session) process.exit(1);
  console.log(JSON.stringify(session));
} else if (cmd === 'list') {
  console.log(JSON.stringify(runner.list()));
} else if (cmd === 'update') {
  const id = rest[0];
  const status = opt('--status') as SessionStatus | undefined;
  if (!id || !status) {
    console.error('usage: autonomy update <id> --status <running|paused|cancelled|done|failed> [--issue <id>]');
    process.exit(2);
  }
  process.exit(runner.update(id, { status, issue: opt('--issue') }) ? 0 : 1);
} else if (cmd === 'cancel') {
  const id = rest[0];
  if (!id) {
    console.error('usage: autonomy cancel <id>');
    process.exit(2);
  }
  process.exit(runner.cancel(id) ? 0 : 1);
} else {
  console.error('usage: autonomy <launch|list|cancel>');
  process.exit(2);
}
