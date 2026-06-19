#!/usr/bin/env bun
// Pre-made runner: github (GitHub Actions + model proxy, open-autonomy's model). The compiler wires
// THIS as `autonomy` when the target is github. One concrete runner, no selection switch.
import { runCli } from '@open-autonomy/core';
import { GithubRunner } from '../runner';

process.exit(runCli(new GithubRunner(), process.argv.slice(2)));
