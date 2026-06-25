#!/usr/bin/env bun
// Pre-made runner: termfleet. The compiler wires THIS file as `autonomy` when the target uses the
// termfleet backend (the real local runner). One concrete runner, no selection switch.
import { runCli } from '@open-autonomy/core';
import { TermfleetRunner } from '../runner';

process.exit(await runCli(new TermfleetRunner(), process.argv.slice(2)));
