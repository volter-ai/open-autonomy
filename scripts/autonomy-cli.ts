// CLI over a runner. The concrete runner is wired by the entrypoint the compiler chose
// (autonomy-runner-<backend>.ts). Domain-free: it launches/observes/cancels agents, nothing more.
//   launch <agent> [--k v ...]  ·  get <id>  ·  list  ·  update <id> --status <s>  ·  cancel <id>
// `launch` accepts arbitrary --key value params and passes them through verbatim; the system never
// interprets them (a bundle/runner may, e.g. as "issue").
import type { Runner, SessionStatus, LaunchParams } from './autonomy-runner';

function parseParams(args: string[]): LaunchParams {
  const params: LaunchParams = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a?.startsWith('--')) {
      const key = a.slice(2);
      const next = args[i + 1];
      params[key] = next && !next.startsWith('--') ? (i++, next) : 'true';
    }
  }
  return params;
}

export function runCli(runner: Runner, argv: string[]): number {
  const [cmd, ...rest] = argv;
  const opt = (name: string): string | undefined => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : undefined;
  };

  if (cmd === 'launch') {
    const agent = rest[0];
    if (!agent || agent.startsWith('--')) {
      console.error('usage: autonomy launch <agent> [--key value ...]');
      return 2;
    }
    console.log(JSON.stringify(runner.launch(agent, parseParams(rest.slice(1)))));
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
      console.error('usage: autonomy update <id> --status <running|paused|cancelled|done|failed>');
      return 2;
    }
    return runner.update(id, { status }) ? 0 : 1;
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
