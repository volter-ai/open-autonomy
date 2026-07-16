import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

// Append-only record of every externally visible action a workflow takes.
// In dry-run this is the complete "what WOULD have hit the outside world"
// audit; in live mode it is the outbox/action history. One JSON object per
// line, flushed synchronously, so a crash between action and record is the
// only loss window (restarts re-derive from the consumer's idempotency keys).

export interface LedgerEntry {
  seq: number;
  at: number;
  port: string;
  action: string;
  detail: Record<string, unknown>;
}

export interface Ledger {
  append(port: string, action: string, detail: Record<string, unknown>): LedgerEntry;
  entries(): LedgerEntry[];
  readonly path: string;
}

export function openLedger(path: string, clockNow: () => number): Ledger {
  mkdirSync(dirname(path), { recursive: true });
  let seq = existsSync(path) ? readEntries(path).length : 0;
  return {
    path,
    append(port, action, detail) {
      seq += 1;
      const entry: LedgerEntry = { seq, at: clockNow(), port, action, detail };
      appendFileSync(path, `${JSON.stringify(entry)}\n`);
      return entry;
    },
    entries() {
      return readEntries(path);
    },
  };
}

function readEntries(path: string): LedgerEntry[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as LedgerEntry);
}
