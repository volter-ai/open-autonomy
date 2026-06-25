#!/usr/bin/env bun
// Pre-made runner: exec. The compiler wires THIS file as `autonomy` when the target uses the
// exec backend. It constructs one concrete runner — there is no selection switch.
import { runCli } from '../cli';
import { ExecRunner } from '../runner';

const runner = new ExecRunner(process.env.AUTONOMY_STATE || '.autonomy/sessions.json', process.env.AUTONOMY_LAUNCH_CMD);
process.exit(await runCli(runner, process.argv.slice(2)));
