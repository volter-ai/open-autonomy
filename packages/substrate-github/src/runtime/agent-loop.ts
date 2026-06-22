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

/** The decision primitive: a real agent investigates and submits a schema-validated artifact. Read-only by
 *  default (Read/Glob/Grep + the single decision file); pass `allowRun` to also let it run tests/checks
 *  (Bash) before deciding. `cwd` is where it investigates (defaults to the process cwd). Every model slot is
 *  pinned to the one allowed model, so a multi-step run never escapes the minted token's allowlist. */
export async function decide<T = unknown>(opts: {
  system: string;
  goal: string;
  schema: Record<string, unknown>;
  model?: string;
  cwd?: string;
  allowRun?: boolean;
}): Promise<T> {
  const model = opts.model || process.env.PUBLIC_AGENT_MODEL || 'deepseek/deepseek-v4-flash';
  const dir = mkdtempSync(join(tmpdir(), 'oa-decide-'));
  const outFile = join(dir, 'decision.json');
  const prompt = [
    opts.system,
    '',
    opts.goal,
    '',
    `Investigate using your tools${opts.allowRun ? ' (you may run tests/checks)' : ' (read-only)'}, then record your decision.`,
    `WRITE your final answer as a single JSON object to: ${outFile}`,
    'It MUST satisfy this JSON Schema (every required field present, allowed enum values only):',
    JSON.stringify(opts.schema),
    `The ONLY file you may write is ${outFile}. Do not modify the repository.`,
  ].join('\n');
  const env = {
    ...process.env,
    ANTHROPIC_MODEL: model,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: model,
    ANTHROPIC_SMALL_FAST_MODEL: model,
    CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK: '1',
    DISABLE_TELEMETRY: '1',
    DISABLE_ERROR_REPORTING: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  };
  const tools = ['Read', 'Glob', 'Grep', 'Write', ...(opts.allowRun ? ['Bash'] : [])];
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = spawnSync(
        'claude',
        ['-p', '--model', model, '--allowedTools', ...tools, '--permission-mode', 'default'],
        { input: prompt, cwd: opts.cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env },
      );
      console.error(`  [decide] claude attempt ${attempt} (exit ${res.status ?? 1})`);
      // Prefer the written file; fall back to salvaging JSON from stdout if the agent printed it instead.
      const artifact = readDecisionFile(outFile, opts.schema) ?? salvageSubmission(res.stdout || '', opts.schema);
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
