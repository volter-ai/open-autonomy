#!/usr/bin/env node
// Reap finished agent sessions: cancel any whose turn has ended (endOfTurn) so they don't
// accumulate over a long run. A recovery-style bundle script for the termfleet substrate; the
// system itself stays domain-free (this only talks about running agents and their turn state).
import { execSync } from 'node:child_process';

const cli = process.env.TERMFLEET_CLI || 'termfleet';
const url = process.env.TERMFLEET_PROVIDER_URL || 'http://127.0.0.1:7376';
const model = process.env.TERMFLEET_AGENT || 'codex';
const sh = (c) => {
  try {
    return execSync(c, { encoding: 'utf8' });
  } catch {
    return '';
  }
};

const sessions = JSON.parse(sh(`${cli} ${model} list --url '${url}'`) || '[]');
for (const s of sessions) {
  if (!s.agentSessionId) continue;
  let endOfTurn = false;
  try {
    endOfTurn = JSON.parse(sh(`${cli} ${model} get --url '${url}' --agent-session-id '${s.agentSessionId}'`)).endOfTurn === true;
  } catch {
    /* ignore */
  }
  if (endOfTurn) {
    sh(`${cli} ${model} kill --url '${url}' --id ${s.id}`);
    console.log(`[reap] ${s.name} (turn ended)`);
  }
}
