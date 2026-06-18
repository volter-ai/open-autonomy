#!/usr/bin/env bun
// The uniform interface to the agent runner. A skill or script calls this and stays
// substrate-agnostic; the backend (exec | termfleet | …) is chosen by AUTONOMY_RUNNER.
//   autonomy launch <role> [--issue <id>]   # create a session
//   autonomy list                            # read running sessions (JSON)
//   autonomy cancel <id>                     # delete a session
import { getRunner } from './autonomy-runner';

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
} else if (cmd === 'list') {
  console.log(JSON.stringify(runner.list()));
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
