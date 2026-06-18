#!/usr/bin/env bun
// Pre-made runner: termfleet. The compiler wires THIS file as `autonomy` when the target uses the
// termfleet backend (the real local runner). One concrete runner, no selection switch.
import { runCli } from './autonomy-cli';
import { TermfleetRunner } from './autonomy-runner';

process.exit(runCli(new TermfleetRunner(), process.argv.slice(2)));
