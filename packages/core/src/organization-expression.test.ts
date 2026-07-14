import { describe, expect, test } from 'bun:test';
import { analyzeExpression, evaluateExpression, portableExpression } from './organization-expression';

describe('P5 portable expression envelope', () => {
  test('analyzes and evaluates the bounded portable predicate core', () => {
    const expression = portableExpression({
      kind: 'all', values: [
        { kind: 'compare', operator: 'gte', left: { kind: 'ref', path: 'work.priority' }, right: { kind: 'literal', value: 5 } },
        { kind: 'compare', operator: 'in', left: { kind: 'literal', value: 'ready' }, right: { kind: 'ref', path: 'allowed' } },
      ],
    }, 'boolean');
    expect(analyzeExpression(expression)).toEqual({
      status: 'analyzed', language: 'oa-expr-v1', resultType: 'boolean',
      freeVariables: ['allowed', 'work.priority'], errors: [],
    });
    expect(evaluateExpression(expression, { work: { priority: 7 }, allowed: ['ready', 'working'] })).toMatchObject({ value: true, errors: [] });
  });

  test('marks legacy strings and declared external dialects opaque rather than supported', () => {
    expect(analyzeExpression('work.priority > 5')).toMatchObject({ status: 'opaque', language: 'native', resultType: 'unknown' });
    const cel = { language: 'cel', source: 'work.priority > 5', resultType: 'boolean' as const, freeVariables: ['work.priority'] };
    expect(analyzeExpression(cel)).toMatchObject({ status: 'opaque', language: 'cel', freeVariables: ['work.priority'] });
    expect(evaluateExpression(cel, {}).errors).toEqual(["expression dialect 'cel' is opaque"]);
  });

  test('rejects type errors, unknown nodes, unbound variables, and false result declarations', () => {
    expect(analyzeExpression(portableExpression({ kind: 'not', value: { kind: 'literal', value: 3 } })).errors)
      .toContain('/value: not requires boolean, got number');
    expect(analyzeExpression({ language: 'oa-expr-v1', source: { kind: 'mystery' }, resultType: 'string' }).status).toBe('invalid');
    const boolean = portableExpression({ kind: 'literal', value: true }, 'string');
    expect(analyzeExpression(boolean).errors).toContain('declared result string does not match inferred boolean');
    expect(evaluateExpression(portableExpression({ kind: 'ref', path: 'missing' }), {}).errors)
      .toEqual(["unbound expression variable 'missing'"]);
  });

  test('keeps evaluation deterministic and side-effect free over generated environments', () => {
    const expression = portableExpression({
      kind: 'compare', operator: 'eq', left: { kind: 'ref', path: 'value' }, right: { kind: 'literal', value: 17 },
    });
    for (let value = 0; value < 40; value++) {
      const environment = { value };
      const first = evaluateExpression(expression, environment);
      const second = evaluateExpression(expression, environment);
      expect(first).toEqual(second);
      expect(environment.value).toBe(value);
    }
  });
});
