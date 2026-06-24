// Render a redacted, size-bounded "recent session" from an Anthropic-wire request body. Every agent turn
// is a fresh /v1/messages call whose `messages` array carries the whole conversation so far — so the LATEST
// request is the running transcript. We keep the last N turns (model reasoning, tool calls, tool results),
// redacted and capped, as the live window the platform view and the PM read to see what a run is doing NOW.
// This is the only place a run's session is observable WHILE it runs: GitHub buffers the agent step and serves
// no in-progress logs (REST /logs → 404), so the proxy — which every model call flows through — is the source.
// Pure functions, no I/O, so they're unit-testable.

const MAX_TURNS = 12;
const MAX_TEXT = 1400;

export interface SessionTurn {
  role: string;
  text: string;
}

// Strip secret-shaped tokens so a captured session can never carry a credential (defense in depth — the
// agent shouldn't be sending these, but the proxy must never persist one if it does).
export function redactSecrets(s: string): string {
  return s
    .replace(/sk_live_[A-Za-z0-9]{12,}/g, '[redacted]')
    .replace(/rk_live_[A-Za-z0-9]{12,}/g, '[redacted]')
    .replace(/ghp_[A-Za-z0-9]{30,}/g, '[redacted]')
    .replace(/github_pat_[A-Za-z0-9_]{30,}/g, '[redacted]')
    .replace(/gho_[A-Za-z0-9]{30,}/g, '[redacted]')
    .replace(/sk-ant-[A-Za-z0-9_-]{20,}/g, '[redacted]')
    .replace(/sk-or-v1-[A-Za-z0-9]{20,}/g, '[redacted]')
    .replace(/xox[baprs]-[A-Za-z0-9-]{10,}/g, '[redacted]');
}

function brief(v: unknown, max = 300): string {
  const s = typeof v === 'string' ? v : JSON.stringify(v ?? '');
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

// Flatten one message's content (string, or Anthropic content blocks) into readable text.
function renderContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const b of content) {
    if (!b || typeof b !== 'object') continue;
    const block = b as Record<string, unknown>;
    if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text);
    else if (block.type === 'thinking' && typeof block.thinking === 'string') parts.push(`[thinking] ${block.thinking}`);
    else if (block.type === 'tool_use') parts.push(`[tool: ${String(block.name ?? '?')}] ${brief(block.input)}`);
    else if (block.type === 'tool_result') parts.push(`[tool result] ${brief(block.content)}`);
    else if (block.type === 'image') parts.push('[image]');
    else if (typeof block.type === 'string') parts.push(`[${block.type}]`); // any other block → at least name it
  }
  return parts.join('\n');
}

// The live window: the last MAX_TURNS messages, each rendered + redacted + capped. Empty turns are dropped.
export function sessionTurnsFromBody(body: Record<string, unknown>): SessionTurn[] {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const turns: SessionTurn[] = [];
  for (const m of messages.slice(-MAX_TURNS)) {
    if (!m || typeof m !== 'object') continue;
    const msg = m as Record<string, unknown>;
    const role = typeof msg.role === 'string' ? msg.role : 'unknown';
    let text = redactSecrets(renderContent(msg.content)).trim();
    if (text.length > MAX_TEXT) text = `${text.slice(0, MAX_TEXT)}…`;
    if (text) turns.push({ role, text });
  }
  return turns;
}
