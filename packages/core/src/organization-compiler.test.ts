import { describe, expect, test } from 'bun:test';
import {
  CompilerPassRegistry,
  composeSourceRelations,
  projectDiagnostic,
  renderDiagnostic,
  runCompilerAnalyses,
  runCompilerPipeline,
  type CompilerPass,
  type CompilerDiagnostic,
} from './organization-compiler';

const pass = (
  id: string, input: CompilerPass<unknown, unknown>['input'], output: CompilerPass<unknown, unknown>['output'],
  run: CompilerPass<unknown, unknown>['run'], requires?: string[],
): CompilerPass<unknown, unknown> => ({ id, input, output, run, requires });

describe('P3 compiler pass and diagnostics framework', () => {
  test('runs an explicitly typed pipeline and carries source relations and obligations', async () => {
    const result = await runCompilerPipeline({ value: 1 }, 'source', [
      pass('resolve', 'source', 'resolved', (input) => ({
        output: { value: (input as { value: number }).value + 1 },
        sourceMap: [{ output: '/value', sources: [{ location: 'mem:/source', path: '/value' }] }],
        obligations: [{ id: 'ref.closed', claim: 'references closed', status: 'discharged', evidence: 'resolver' }],
      })),
      pass('normalize', 'resolved', 'normalized', (input, context) => ({
        output: { value: (input as { value: number }).value * 2, saw: [...context.completedPasses] },
      }), ['resolve']),
    ]);
    expect(result.output).toEqual({ value: 4, saw: ['resolve'] });
    expect(result.level).toBe('normalized');
    expect(result.passes[0].sourceMap[0].sources[0].location).toBe('mem:/source');
    expect(result.passes[0].obligations[0].status).toBe('discharged');
  });

  test('freezes a clone, catches mutation, and never mutates caller input', async () => {
    const input = { nested: { value: 1 } };
    const result = await runCompilerPipeline(input, 'source', [pass('mutator', 'source', 'resolved', (value) => {
      (value as { nested: { value: number } }).nested.value = 9;
      return { output: value };
    })]);
    expect(input.nested.value).toBe(1);
    expect(result.output).toBeUndefined();
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'OA-COMPILER-PASS-THREW', phase: 'mutator' }));
  });

  test('stops dependent emission after fatal failure and rejects invalid ordering/dependencies', async () => {
    let emitted = false;
    const failed = await runCompilerPipeline({}, 'source', [
      pass('reject', 'source', 'resolved', () => ({ diagnostics: [{ code: 'TEST-REJECT', severity: 'error', phase: 'reject', message: 'no' }] })),
      pass('emit', 'resolved', 'native', () => { emitted = true; return { output: {} }; }),
    ]);
    expect(emitted).toBe(false);
    expect(failed.output).toBeUndefined();
    const wrongLevel = await runCompilerPipeline({}, 'source', [pass('late', 'normalized', 'native', () => ({ output: {} }))]);
    expect(wrongLevel.diagnostics[0].code).toBe('OA-COMPILER-LEVEL-MISMATCH');
    const missing = await runCompilerPipeline({}, 'source', [pass('needs-check', 'source', 'resolved', () => ({ output: {} }), ['check'])]);
    expect(missing.diagnostics[0].code).toBe('OA-COMPILER-MISSING-DEPENDENCY');
  });

  test('runs independent analyses even when a sibling reports failure', async () => {
    const results = await runCompilerAnalyses({}, 'normalized', [
      pass('bad-analysis', 'normalized', 'normalized', () => ({ diagnostics: [{ code: 'BAD', severity: 'error', phase: 'bad-analysis', message: 'bad' }] })),
      pass('good-analysis', 'normalized', 'normalized', () => ({ output: { finding: 'useful' } })),
    ]);
    expect(results[0].output).toBeUndefined();
    expect(results[1].output).toEqual({ finding: 'useful' });
  });

  test('sorts, bounds, redacts, and control-escapes diagnostics independently of rendering', async () => {
    const diagnostics: CompilerDiagnostic[] = [
      { code: 'Z', severity: 'warning', phase: 'check', message: 'token=SECRET\u001b[31m', source: { location: 'b' } },
      { code: 'A', severity: 'warning', phase: 'check', message: 'first', source: { location: 'a' } },
      { code: 'B', severity: 'warning', phase: 'check', message: 'second', source: { location: 'a' } },
    ];
    const result = await runCompilerPipeline({}, 'source', [pass('check', 'source', 'resolved', () => ({ output: {}, diagnostics }))], {
      maxDiagnostics: 2, redact: ['SECRET'],
    });
    expect(result.diagnostics.map((item) => item.code)).toEqual(['A', 'OA-COMPILER-DIAGNOSTIC-LIMIT']);
    const unbounded = await runCompilerPipeline({}, 'source', [pass('check', 'source', 'resolved', () => ({ output: {}, diagnostics }))], { redact: ['SECRET'] });
    const z = unbounded.diagnostics.find((item) => item.code === 'Z')!;
    expect(z.message).toContain('[REDACTED]');
    expect(z.message).toContain('\\u001b');
    expect(renderDiagnostic(z)).toContain('WARNING Z [check]');
  });

  test('registers provider passes without core product cases and rejects collisions', () => {
    const registry = new CompilerPassRegistry();
    registry.register({ ...pass('provider.example/lower', 'execution', 'native', () => ({ output: {} })), provider: 'example' });
    expect(registry.list()).toEqual(['provider.example/lower']);
    expect(() => registry.register(pass('provider.example/lower', 'execution', 'native', () => ({ output: {} })))).toThrow('already registered');
    expect(() => registry.register(pass('bad pass', 'execution', 'native', () => ({ output: {} })))).toThrow('invalid compiler pass id');
  });

  test('composes many-to-many source relations and projects generated diagnostics', () => {
    const composed = composeSourceRelations(
      [{ output: 'compiler:/normalized/actor', sources: [
        { location: 'mem:/profile.yml', path: '/template/actors/worker' },
        { location: 'mem:/role.yml', path: '/actors/worker' },
      ] }],
      [{ output: 'compiler:/execution/worker', sources: [
        { location: 'compiler:/normalized/actor' },
        { location: 'mem:/deployment.yml', path: '/bindings/worker' },
      ] }],
    );
    expect(composed[0].sources).toHaveLength(3);
    const projected = projectDiagnostic({
      code: 'EXEC-INVALID', severity: 'error', phase: 'lower', message: 'bad worker',
      source: { location: 'compiler:/execution/worker' },
    }, composed);
    expect(projected.source).toEqual({ location: 'mem:/profile.yml', path: '/template/actors/worker' });
    expect(projected.related?.map((item) => item.source)).toEqual([
      { location: 'mem:/role.yml', path: '/actors/worker' },
      { location: 'mem:/deployment.yml', path: '/bindings/worker' },
    ]);
  });
});
