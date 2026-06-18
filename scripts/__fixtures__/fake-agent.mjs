#!/usr/bin/env node
// A deterministic stand-in for a real agent session (LLM/termfleet). It does NOT think — it
// performs the mechanical work each role would, driving the REAL runner CLI ($AUTONOMY). What it
// reads/writes is its OWN business (here: an issues.json in its cwd) — the framework has no notion
// of where work lives; it just launches a role and passes an issue id.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const agent = process.env.AUTONOMY_AGENT;
const autonomy = process.env.AUTONOMY;
const file = 'issues.json'; // relative to the session cwd the runner set
const sh = (cmd) => spawnSync(cmd, { shell: true, encoding: 'utf8' }).stdout || '';
const read = () => JSON.parse(readFileSync(file, 'utf8'));
const write = (s) => writeFileSync(file, JSON.stringify(s));

if (agent === 'pm') {
  // triage: if develop capacity is free and an issue is Ready, claim it and dispatch develop
  const issues = read();
  const running = JSON.parse(sh(`${autonomy} list`) || '[]');
  if (!running.some((s) => s.role === 'develop')) {
    const ready = issues.find((i) => i.state === 'Ready');
    if (ready) {
      ready.state = 'In Progress';
      write(issues);
      sh(`${autonomy} launch develop --issue ${ready.id}`);
    }
  }
} else if (agent === 'develop') {
  // do the work: mark the issue Done, then mark this session done
  const id = process.env.AUTONOMY_ISSUE;
  const issues = read();
  const it = issues.find((i) => i.id === id);
  if (it) it.state = 'Done';
  write(issues);
  const mine = JSON.parse(sh(`${autonomy} list`) || '[]').find((s) => s.role === 'develop' && s.issue === id);
  if (mine) sh(`${autonomy} update ${mine.id} --status done`);
}
