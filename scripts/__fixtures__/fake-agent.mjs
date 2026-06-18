#!/usr/bin/env node
// A deterministic stand-in for a real agent session (LLM/termfleet). It does NOT think — it
// performs the mechanical work each role would, driving the REAL runner CLI ($AUTONOMY) and a
// JSON work store ($WORK_STORE). The integration test wires this in as the launch backend so the
// whole spawned-process chain is exercised: loop → launcher → runner → THIS → runner → ...
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const agent = process.env.AUTONOMY_AGENT;
const store = process.env.WORK_STORE;
const autonomy = process.env.AUTONOMY;
const sh = (cmd) => spawnSync(cmd, { shell: true, encoding: 'utf8' }).stdout || '';
const readStore = () => JSON.parse(readFileSync(store, 'utf8'));
const writeStore = (s) => writeFileSync(store, JSON.stringify(s));

if (agent === 'pm') {
  // triage: if develop capacity is free and an issue is Ready, claim it and dispatch develop
  const issues = readStore();
  const running = JSON.parse(sh(`${autonomy} list`) || '[]');
  if (!running.some((s) => s.role === 'develop')) {
    const ready = issues.find((i) => i.state === 'Ready');
    if (ready) {
      ready.state = 'In Progress';
      writeStore(issues);
      sh(`${autonomy} launch develop --issue ${ready.id}`);
    }
  }
} else if (agent === 'develop') {
  // do the work: mark the issue Done, then mark this session done
  const id = process.env.AUTONOMY_ISSUE;
  const issues = readStore();
  const it = issues.find((i) => i.id === id);
  if (it) it.state = 'Done';
  writeStore(issues);
  const mine = JSON.parse(sh(`${autonomy} list`) || '[]').find((s) => s.role === 'develop' && s.issue === id);
  if (mine) sh(`${autonomy} update ${mine.id} --status done`);
}
