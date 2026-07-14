export type DiagnosticSeverity = 'error' | 'warning' | 'information';
export type CompilerLevel = 'source' | 'resolved' | 'normalized' | 'control' | 'execution' | 'native';

export interface SourceSpan {
  location: string;
  path?: string;
  start?: { line: number; column: number };
  end?: { line: number; column: number };
}

export interface RelatedDiagnostic {
  message: string;
  source?: SourceSpan;
}

export interface FixSuggestion {
  message: string;
  replacement?: unknown;
}

export interface CompilerDiagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  phase: string;
  source?: SourceSpan;
  related?: RelatedDiagnostic[];
  suggestion?: FixSuggestion;
}

export interface PassSourceRelation {
  output: string;
  sources: SourceSpan[];
}

export interface PassObligation {
  id: string;
  claim: string;
  status: 'discharged' | 'created' | 'rejected' | 'unknown';
  evidence?: string;
}

export interface CompilerPassResult<Output> {
  output?: Output;
  diagnostics?: CompilerDiagnostic[];
  sourceMap?: PassSourceRelation[];
  obligations?: PassObligation[];
}

export interface CompilerPassContext {
  completedPasses: ReadonlySet<string>;
}

export interface CompilerPass<Input, Output> {
  id: string;
  input: CompilerLevel;
  output: CompilerLevel;
  requires?: string[];
  provider?: string;
  run(value: Readonly<Input>, context: CompilerPassContext): Promise<CompilerPassResult<Output>> | CompilerPassResult<Output>;
}

export interface PassRunRecord {
  pass: string;
  input: CompilerLevel;
  output: CompilerLevel;
  sourceMap: PassSourceRelation[];
  obligations: PassObligation[];
}

export interface CompilerPipelineResult<Output = unknown> {
  output?: Output;
  level: CompilerLevel;
  diagnostics: CompilerDiagnostic[];
  passes: PassRunRecord[];
}

export interface CompilerExecutionPolicy {
  maxDiagnostics?: number;
  redact?: string[];
}

/** Extensible registry: provider passes enter through data, never product-name branches in compiler core. */
export class CompilerPassRegistry {
  readonly #passes = new Map<string, CompilerPass<unknown, unknown>>();

  register<Input, Output>(pass: CompilerPass<Input, Output>): void {
    validatePassIdentity(pass.id);
    if (this.#passes.has(pass.id)) throw new Error(`compiler pass '${pass.id}' is already registered`);
    this.#passes.set(pass.id, pass as CompilerPass<unknown, unknown>);
  }

  get(id: string): CompilerPass<unknown, unknown> | undefined { return this.#passes.get(id); }
  list(): string[] { return [...this.#passes.keys()].sort(compareText); }
}

export async function runCompilerPipeline<Output = unknown>(
  input: unknown,
  level: CompilerLevel,
  passes: Array<CompilerPass<unknown, unknown>>,
  policy: CompilerExecutionPolicy = {},
): Promise<CompilerPipelineResult<Output>> {
  let current = structuredClone(input);
  let currentLevel = level;
  const completed = new Set<string>();
  const diagnostics: CompilerDiagnostic[] = [];
  const records: PassRunRecord[] = [];
  for (const pass of passes) {
    const setup = validatePassReady(pass, currentLevel, completed);
    if (setup) { diagnostics.push(setup); break; }
    const result = await executePass(pass, current, completed);
    diagnostics.push(...(result.diagnostics ?? []));
    records.push({
      pass: pass.id, input: pass.input, output: pass.output,
      sourceMap: structuredClone(result.sourceMap ?? []), obligations: structuredClone(result.obligations ?? []),
    });
    if ((result.diagnostics ?? []).some((diagnostic) => diagnostic.severity === 'error') || result.output === undefined) break;
    current = structuredClone(result.output);
    currentLevel = pass.output;
    completed.add(pass.id);
  }
  const sanitized = finalizeDiagnostics(diagnostics, policy);
  const failed = sanitized.some((diagnostic) => diagnostic.severity === 'error');
  return { output: failed ? undefined : current as Output, level: currentLevel, diagnostics: sanitized, passes: records };
}

/** Run independent analyses on one immutable input even when another analysis fails. */
export async function runCompilerAnalyses(
  input: unknown,
  level: CompilerLevel,
  analyses: Array<CompilerPass<unknown, unknown>>,
  policy: CompilerExecutionPolicy = {},
): Promise<CompilerPipelineResult[]> {
  return Promise.all(analyses.map(async (analysis) => {
    const setup = validatePassReady(analysis, level, new Set());
    if (setup) return { level, diagnostics: finalizeDiagnostics([setup], policy), passes: [] };
    const result = await executePass(analysis, input, new Set());
    const diagnostics = finalizeDiagnostics(result.diagnostics ?? [], policy);
    return {
      output: diagnostics.some((item) => item.severity === 'error') ? undefined : result.output,
      level: analysis.output, diagnostics,
      passes: [{ pass: analysis.id, input: analysis.input, output: analysis.output, sourceMap: result.sourceMap ?? [], obligations: result.obligations ?? [] }],
    };
  }));
}

export function sortDiagnostics(values: CompilerDiagnostic[]): CompilerDiagnostic[] {
  return [...values].sort((a, b) => compareText(
    `${a.source?.location ?? ''}\0${a.source?.path ?? ''}\0${a.code}\0${a.message}`,
    `${b.source?.location ?? ''}\0${b.source?.path ?? ''}\0${b.code}\0${b.message}`,
  ));
}

export function renderDiagnostic(diagnostic: CompilerDiagnostic): string {
  const location = diagnostic.source ? `${diagnostic.source.location}${diagnostic.source.path ? `#${diagnostic.source.path}` : ''}: ` : '';
  return `${location}${diagnostic.severity.toUpperCase()} ${diagnostic.code} [${diagnostic.phase}] ${escapeControls(diagnostic.message)}`;
}

async function executePass(
  pass: CompilerPass<unknown, unknown>, input: unknown, completed: ReadonlySet<string>,
): Promise<CompilerPassResult<unknown>> {
  const immutable = deepFreeze(structuredClone(input));
  try {
    return await pass.run(immutable, { completedPasses: new Set(completed) });
  } catch (error) {
    return { diagnostics: [{
      code: 'OA-COMPILER-PASS-THREW', severity: 'error', phase: pass.id,
      message: error instanceof Error ? error.message : String(error),
    }] };
  }
}

function validatePassReady(
  pass: CompilerPass<unknown, unknown>, level: CompilerLevel, completed: ReadonlySet<string>,
): CompilerDiagnostic | undefined {
  if (pass.input !== level) return {
    code: 'OA-COMPILER-LEVEL-MISMATCH', severity: 'error', phase: pass.id,
    message: `pass requires ${pass.input} but pipeline is ${level}`,
  };
  const missing = (pass.requires ?? []).filter((id) => !completed.has(id));
  if (missing.length) return {
    code: 'OA-COMPILER-MISSING-DEPENDENCY', severity: 'error', phase: pass.id,
    message: `missing required passes: ${missing.sort(compareText).join(', ')}`,
  };
  return undefined;
}

function finalizeDiagnostics(values: CompilerDiagnostic[], policy: CompilerExecutionPolicy): CompilerDiagnostic[] {
  const max = policy.maxDiagnostics ?? 1000;
  const redacted = values.map((value) => sanitizeDiagnostic(value, policy.redact ?? []));
  const sorted = sortDiagnostics(redacted);
  if (sorted.length <= max) return sorted;
  return [...sorted.slice(0, Math.max(0, max - 1)), {
    code: 'OA-COMPILER-DIAGNOSTIC-LIMIT', severity: 'error', phase: 'compiler',
    message: `diagnostic limit ${max} exceeded`,
  }];
}

function sanitizeDiagnostic(value: CompilerDiagnostic, secrets: string[]): CompilerDiagnostic {
  const redact = (text: string) => secrets.filter(Boolean).reduce((result, secret) => result.split(secret).join('[REDACTED]'), escapeControls(text));
  return {
    ...structuredClone(value), message: redact(value.message),
    related: value.related?.map((item) => ({ ...item, message: redact(item.message) })),
    suggestion: value.suggestion ? { ...value.suggestion, message: redact(value.suggestion.message) } : undefined,
  };
}

function escapeControls(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u001B]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function validatePassIdentity(id: string): void {
  if (!/^[A-Za-z][A-Za-z0-9._/-]*$/.test(id)) throw new Error(`invalid compiler pass id '${id}'`);
}

function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
