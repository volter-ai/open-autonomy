// The ONE way Open Autonomy runs a model: an agent loop. An agent reasons over its goal using a bounded
// set of capability TOOLS and finishes by submitting a schema-validated artifact. This replaces the
// single-shot `modelComplete` — every model use is now iterative, tool-grounded, and FOLLOWABLE (it emits
// a transcript per turn), and trust is enforced at the tool boundary: the loop only ever calls tools by
// name, and the substrate decides what each capability's tools actually do (and validates their effects).
//
// Substrate-agnostic by construction: the model transport and the tool implementations are both INJECTED.
// The loop names neither a provider nor `gh`. The same loop runs on github and local; only the injected
// tools differ. That is the seam that lets a substrate become a capability-enclosing agent wrapper.

/** A capability tool the agent may call. `run` is the substrate's implementation; the loop is blind to it. */
export interface Tool {
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments (passed to the model as a function/tool spec). */
  parameters: Record<string, unknown>;
  run(args: Record<string, unknown>): Promise<string>;
}

/** One turn of the conversation, for the followable transcript + the audit trail. */
export interface TranscriptEntry {
  iteration: number;
  thought: string; // the model's natural-language reasoning this turn
  calls: Array<{ name: string; args: Record<string, unknown>; result: string }>;
}

export interface AgentResult<T> {
  artifact: T; // the schema-validated final output (the `submit` args)
  transcript: TranscriptEntry[];
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; name: string; args: Record<string, unknown> }>;
}
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
export interface TurnResult {
  content: string;
  toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>;
}
/** A single model turn (messages + tool specs -> text + tool calls). Injected so the loop is testable with
 *  a fake model and uses the box endpoint in production. */
export type ModelTurn = (messages: Message[], tools: ToolSpec[]) => Promise<TurnResult>;

/** Production transport: a tool-calling chat-completions turn against the box endpoint (OPENAI_BASE_URL/
 *  OPENAI_API_KEY — the transparent seam, here with tools). Injected into runAgent; tests pass a fake. */
export function proxyTurn(model: string, maxTokens = 1024): ModelTurn {
  return async (messages, tools) => {
    const base = (process.env.OPENAI_BASE_URL || '').replace(/\/$/, '');
    const key = process.env.OPENAI_API_KEY || '';
    const oa = messages.map((m) =>
      m.role === 'assistant' && m.tool_calls?.length
        ? { role: 'assistant', content: m.content || null, tool_calls: m.tool_calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })) }
        : m.role === 'tool'
          ? { role: 'tool', tool_call_id: m.tool_call_id, content: m.content }
          : { role: m.role, content: m.content },
    );
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        max_completion_tokens: maxTokens,
        messages: oa,
        tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
        tool_choice: 'auto',
      }),
    });
    if (!res.ok) throw new Error(`model turn failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    const msg = ((await res.json()) as { choices?: Array<{ message?: { content?: string; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }> }).choices?.[0]?.message ?? {};
    const toolCalls = (msg.tool_calls ?? []).map((c) => {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(c.function.arguments || '{}');
      } catch {
        args = {};
      }
      return { id: c.id, name: c.function.name, args };
    });
    return { content: msg.content ?? '', toolCalls };
  };
}

const FINISH = 'submit';

/** Minimal structural check: every required top-level key is present. The model-native tool schema does the
 *  heavy lifting; this is the trust backstop so a malformed artifact never escapes the loop. */
function missingRequired(schema: Record<string, unknown>, value: unknown): string[] {
  const required = (schema.required as string[] | undefined) ?? [];
  const obj = (value ?? {}) as Record<string, unknown>;
  return required.filter((k) => obj[k] === undefined);
}

/**
 * Run an agent to a validated artifact. The loop appends a `submit` tool (its params ARE the artifact
 * schema); when the model calls it with valid args, that is the deliberate, bounded result — the same shape
 * as the developer emitting a validated patch, generalized to any decision.
 */
export async function runAgent<T = unknown>(opts: {
  system: string;
  goal: string;
  tools: Tool[];
  /** JSON Schema of the final artifact (becomes the `submit` tool's parameters). */
  schema: Record<string, unknown>;
  turn: ModelTurn;
  maxIterations?: number;
  /** Followability hook: called once per turn (e.g. print to the run log + collect for the bundle). */
  onTrace?: (entry: TranscriptEntry) => void;
}): Promise<AgentResult<T>> {
  const maxIterations = opts.maxIterations ?? 12;
  const byName = new Map(opts.tools.map((t) => [t.name, t]));
  const specs: ToolSpec[] = [
    ...opts.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })),
    { name: FINISH, description: 'Submit your final result. Call this exactly once, when done.', parameters: opts.schema },
  ];
  const messages: Message[] = [
    { role: 'system', content: opts.system },
    { role: 'user', content: opts.goal },
  ];
  const transcript: TranscriptEntry[] = [];

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const { content, toolCalls } = await opts.turn(messages, specs);
    messages.push({ role: 'assistant', content, tool_calls: toolCalls });
    const entry: TranscriptEntry = { iteration, thought: content, calls: [] };

    if (!toolCalls.length) {
      // The model answered without acting — nudge it to use a tool or submit, rather than hang.
      messages.push({ role: 'user', content: `Call a tool, or call \`${FINISH}\` with your final result.` });
      opts.onTrace?.(entry);
      transcript.push(entry);
      continue;
    }

    for (const call of toolCalls) {
      if (call.name === FINISH) {
        const missing = missingRequired(opts.schema, call.args);
        if (missing.length) {
          const msg = `Invalid submission — missing required field(s): ${missing.join(', ')}. Fix and call \`${FINISH}\` again.`;
          messages.push({ role: 'tool', tool_call_id: call.id, content: msg });
          entry.calls.push({ name: FINISH, args: call.args, result: msg });
          continue;
        }
        entry.calls.push({ name: FINISH, args: call.args, result: 'accepted' });
        opts.onTrace?.(entry);
        transcript.push(entry);
        return { artifact: call.args as T, transcript };
      }
      const tool = byName.get(call.name);
      const result = tool
        ? await tool.run(call.args).catch((e) => `tool error: ${(e as Error).message}`)
        : `unknown tool: ${call.name}`;
      messages.push({ role: 'tool', tool_call_id: call.id, content: result });
      entry.calls.push({ name: call.name, args: call.args, result });
    }
    opts.onTrace?.(entry);
    transcript.push(entry);
  }
  throw new Error(`agent did not submit a result within ${maxIterations} iterations`);
}
