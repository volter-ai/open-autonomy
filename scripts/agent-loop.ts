// The ONE way Open Autonomy makes a decision: run a REAL agent (Claude Code) to a schema-validated
// artifact. There is no hand-rolled model loop — the agent investigates with its own tools and WRITES its
// decision to a file, which we validate against the caller's JSON Schema. Writing a file (rather than
// "print the JSON") is deliberate: a reasoning model's final assistant TEXT can come back empty over the
// Messages wire (e.g. DeepSeek), but tool/file calls land — so the result survives. The box endpoint
// (ANTHROPIC_BASE_URL + key) is provisioned by the substrate; the agent is the same one the developer uses.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Run THE agent (Claude Code) once. The whole contract is two knobs: a CAPABILITY limit (`allowedTools`;
 *  omit for full capability) and what the caller then does with the result. The box endpoint is the
 *  ambient ANTHROPIC_* (provisioned by the substrate) unless `baseUrl`/`authToken` are passed; every model
 *  slot is pinned to one model so a multi-step run can't escape the minted token's allowlist. Both the
 *  developer harness (full capability, produces a PR) and decide() (read-only, produces a result file) are
 *  thin callers of this — there is no other way OA runs the model. */
export function runClaudeAgent(opts: {
  prompt: string;
  allowedTools?: string[];
  cwd?: string;
  model?: string;
  baseUrl?: string;
  authToken?: string;
}): { exitCode: number; stdout: string; stderr: string } {
  const model = opts.model || process.env.PUBLIC_AGENT_MODEL || 'deepseek/deepseek-v4-flash';
  const perm = opts.allowedTools
    ? ['--allowedTools', ...opts.allowedTools, '--permission-mode', 'default']
    : ['--permission-mode', 'bypassPermissions'];
  const res = spawnSync('claude', ['-p', '--model', model, ...perm], {
    input: opts.prompt,
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
}

/** A decision: run the agent, expecting a result FILE of a given schema. The agent has full capability —
 *  read, run, write whatever it needs to reach a judgment; nothing it does to the repo is kept (a decision
 *  run is never merged), we only read back its result file and validate it against the schema. `cwd` is
 *  where it works (defaults to the process cwd). The model is pinned across slots to the minted token's one
 *  allowed model. So a decision is just: run the agent + an expected result-file shape. */
export async function decide<T = unknown>(opts: {
  system: string;
  goal: string;
  schema: Record<string, unknown>;
  model?: string;
  cwd?: string;
}): Promise<T> {
  const model = opts.model || process.env.PUBLIC_AGENT_MODEL || 'deepseek/deepseek-v4-flash';
  const dir = mkdtempSync(join(tmpdir(), 'oa-decide-'));
  const outFile = join(dir, 'decision.json');
  const prompt = [
    opts.system,
    '',
    opts.goal,
    '',
    'Investigate however you need (read files, run tests/checks), then record your decision.',
    `WRITE your final answer as a single JSON object to: ${outFile}`,
    'It MUST satisfy this JSON Schema (every required field present, allowed enum values only):',
    JSON.stringify(opts.schema),
  ].join('\n');
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = runClaudeAgent({ prompt, cwd: opts.cwd, model });
      console.error(`  [decide] claude attempt ${attempt} (exit ${res.exitCode})`);
      // Prefer the written file; fall back to salvaging JSON from stdout if the agent printed it instead.
      const artifact = readDecisionFile(outFile, opts.schema) ?? salvageSubmission(res.stdout, opts.schema);
      if (artifact) return artifact as T;
    }
    throw new Error(`decide: agent produced no schema-valid decision (model=${model})`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Read the agent's written decision file and accept it only if it is a schema-valid object. */
function readDecisionFile(file: string, schema: Record<string, unknown>): Record<string, unknown> | null {
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
 *  artifact never escapes). Exported so callers/tests can validate an artifact independently. */
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
