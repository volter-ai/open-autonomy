// The CLI arg-handling, as a function OVER a runner. It never selects a runner — a concrete
// pre-made runner is passed in by the entrypoint the compiler wired (autonomy-runner-<backend>.ts).
//   launch <role> [--issue id]  ·  get <id>  ·  list  ·  update <id> --status <s>  ·  cancel <id>
import type { Runner, SessionStatus } from './autonomy-runner';

export function runCli(runner: Runner, argv: string[]): number {
  const [cmd, ...rest] = argv;
  const opt = (name: string): string | undefined => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : undefined;
  };

  if (cmd === 'launch') {
    const role = rest[0];
    if (!role || role.startsWith('--')) {
      console.error('usage: autonomy launch <role> [--issue <id>]');
      return 2;
    }
    console.log(JSON.stringify(runner.launch(role, opt('--issue'))));
    return 0;
  }
  if (cmd === 'get') {
    const session = runner.get(rest[0] ?? '');
    if (!session) return 1;
    console.log(JSON.stringify(session));
    return 0;
  }
  if (cmd === 'list') {
    console.log(JSON.stringify(runner.list()));
    return 0;
  }
  if (cmd === 'update') {
    const id = rest[0];
    const status = opt('--status') as SessionStatus | undefined;
    if (!id || !status) {
      console.error('usage: autonomy update <id> --status <running|paused|cancelled|done|failed> [--issue <id>]');
      return 2;
    }
    return runner.update(id, { status, issue: opt('--issue') }) ? 0 : 1;
  }
  if (cmd === 'cancel') {
    const id = rest[0];
    if (!id) {
      console.error('usage: autonomy cancel <id>');
      return 2;
    }
    return runner.cancel(id) ? 0 : 1;
  }
  console.error('usage: autonomy <launch|get|list|update|cancel>');
  return 2;
}
