// The ONE way Open Autonomy runs the model: run the agent (Claude Code), optionally ensuring a result of
// an expected shape. Two knobs, nothing else: a CAPABILITY limit (`allowedTools`; omit => full capability)
// and an optional `result` schema. With no result, you get the raw run (the developer keeps its PR); with
// a result, the agent must write a JSON file that validates against the schema and you get that artifact
// back (a decision keeps its verdict). There is no separate "decide" — a decision is just a run with a
// result. The box endpoint is the ambient ANTHROPIC_* (provisioned by the substrate) unless baseUrl/
// authToken are passed; every model slot is pinned to one model so a multi-step run can't escape the
// minted token's allowlist.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface AgentRun {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface AgentOpts {
  /** The full prompt, or supply `system`+`goal` to be joined. */
  prompt?: string;
  system?: string;
  goal?: string;
  allowedTools?: string[]; // capability limit; omit => full capability (bypass)
  cwd?: string;
  model?: string;
  baseUrl?: string; // omit => ambient ANTHROPIC_BASE_URL (provisioned box endpoint)
  authToken?: string;
}

// With a `result` schema, returns the validated artifact; without, returns the raw run.
export async function runClaudeAgent<T = unknown>(opts: AgentOpts & { result: { schema: Record<string, unknown> } }): Promise<T>;
export async function runClaudeAgent(opts: AgentOpts): Promise<AgentRun>;
export async function runClaudeAgent(opts: AgentOpts & { result?: { schema: Record<string, unknown> } }): Promise<unknown> {
  const model = opts.model || process.env.PUBLIC_AGENT_MODEL || 'deepseek/deepseek-v4-flash';
  const run = (prompt: string): AgentRun => {
    const perm = opts.allowedTools
      ? ['--allowedTools', ...opts.allowedTools, '--permission-mode', 'default']
      : ['--permission-mode', 'bypassPermissions'];
    const res = spawnSync('claude', ['-p', '--model', model, ...perm], {
      input: prompt,
      cwd: opts.cwd,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      env: {
        ...process.env,
        ...(opts.baseUrl ? { ANTHROPIC_BASE_URL: opts.baseUrl } : {}),
        ...(opts.authToken ? { ANTHROPIC_AUTH_TOKEN: opts.authToken } : {}),
        ANTHROPIC_MODEL: model,
        ANTHROPIC_DEFAULT_HAIKU_MODEL: model,
        ANTHROPIC_SMALL_FAST_MODEL: model,
        CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK: '1',
        DISABLE_TELEMETRY: '1',
        DISABLE_ERROR_REPORTING: '1',
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      },
    });
    return { exitCode: res.status ?? 1, stdout: res.stdout || '', stderr: res.stderr || '' };
  };

  const basePrompt = opts.prompt ?? [opts.system, opts.goal].filter(Boolean).join('\n\n');

  // No expected result → just run the agent.
  if (!opts.result) return run(basePrompt);

  // Expected result → the agent must write a JSON file that validates against the schema. Writing a file
  // (not "print the JSON") is deliberate: a reasoning model's final text can come back empty over the
  // Messages wire, but file/tool calls land. Retry once for the flaky model; fall back to salvaging JSON
  // from stdout if it printed the answer instead.
  const { schema } = opts.result;
  const dir = mkdtempSync(join(tmpdir(), 'oa-agent-'));
  const outFile = join(dir, 'result.json');
  const prompt = [
    basePrompt,
    '',
    'Investigate however you need (read files, run tests/checks), then record your result.',
    `WRITE your final answer as a single JSON object to: ${outFile}`,
    'It MUST satisfy this JSON Schema (every required field present, allowed enum values only):',
    JSON.stringify(schema),
  ].join('\n');
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = run(prompt);
      console.error(`  [agent] attempt ${attempt} (exit ${res.exitCode})`);
      const artifact = readResultFile(outFile, schema) ?? salvageSubmission(res.stdout, schema);
      if (artifact) return artifact;
    }
    throw new Error(`runClaudeAgent: agent produced no schema-valid result (model=${model})`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Read the agent's written result file and accept it only if it is a schema-valid object. */
function readResultFile(file: string, schema: Record<string, unknown>): Record<string, unknown> | null {
  try {
    const obj = JSON.parse(readFileSync(file, 'utf8'));
    if (obj && typeof obj === 'object' && !Array.isArray(obj) && missingRequired(schema, obj).length === 0) {
      return obj as Record<string, unknown>;
    }
  } catch {
    /* missing or invalid */
  }
  return null;
}

/** Minimal structural check: every required top-level key is present (the trust backstop so a malformed
 *  artifact never escapes). Exported for callers/tests. */
export function missingRequired(schema: Record<string, unknown>, value: unknown): string[] {
  const required = (schema.required as string[] | undefined) ?? [];
  const obj = (value ?? {}) as Record<string, unknown>;
  return required.filter((k) => obj[k] === undefined);
}

/** Salvage a schema-valid JSON object from free text — the fallback when the agent prints the result
 *  instead of writing the file. Exported for tests. */
export function salvageSubmission(text: string, schema: Record<string, unknown>): Record<string, unknown> | null {
  if (!text) return null;
  const candidates: string[] = [];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidates.push(fence[1]);
  const brace = text.match(/\{[\s\S]*\}/);
  if (brace) candidates.push(brace[0]);
  for (const c of candidates) {
    try {
      const obj = JSON.parse(c.trim());
      if (obj && typeof obj === 'object' && !Array.isArray(obj) && missingRequired(schema, obj).length === 0) {
        return obj as Record<string, unknown>;
      }
    } catch {
      /* not json */
    }
  }
  return null;
}
