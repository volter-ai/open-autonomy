import type { Expression, ExpressionDecl } from './organization-ir';

export type ExpressionValue = null | boolean | number | string | ExpressionValue[] | { [key: string]: ExpressionValue };
export type ExpressionValueType = 'boolean' | 'number' | 'string' | 'null' | 'array' | 'object' | 'unknown';
export type PortableExpressionNode =
  | { kind: 'literal'; value: ExpressionValue }
  | { kind: 'ref'; path: string }
  | { kind: 'field'; object: PortableExpressionNode; key: string }
  | { kind: 'not'; value: PortableExpressionNode }
  | { kind: 'all' | 'any'; values: PortableExpressionNode[] }
  | { kind: 'compare'; operator: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'in'; left: PortableExpressionNode; right: PortableExpressionNode };

export interface ExpressionAnalysis {
  status: 'analyzed' | 'opaque' | 'invalid';
  language: string;
  resultType: ExpressionValueType;
  freeVariables: string[];
  errors: string[];
}

export interface ExpressionEvaluation {
  value?: ExpressionValue;
  analysis: ExpressionAnalysis;
  errors: string[];
}

export function analyzeExpression(expression: Expression): ExpressionAnalysis {
  const declaration = normalizeExpression(expression);
  if (declaration.language !== 'oa-expr-v1') return {
    status: 'opaque', language: declaration.language, resultType: declaration.resultType ?? 'unknown',
    freeVariables: [...new Set(declaration.freeVariables ?? [])].sort(), errors: [],
  };
  const errors: string[] = [];
  const variables = new Set<string>();
  const resultType = analyzeNode(declaration.source as PortableExpressionNode, '', variables, errors);
  if (declaration.resultType && declaration.resultType !== 'unknown' && resultType !== 'unknown' && declaration.resultType !== resultType)
    errors.push(`declared result ${declaration.resultType} does not match inferred ${resultType}`);
  return {
    status: errors.length ? 'invalid' : 'analyzed', language: declaration.language, resultType,
    freeVariables: [...variables].sort(), errors,
  };
}

export function evaluateExpression(expression: Expression, environment: Record<string, ExpressionValue>): ExpressionEvaluation {
  const analysis = analyzeExpression(expression);
  if (analysis.status !== 'analyzed') return {
    analysis, errors: analysis.status === 'opaque' ? [`expression dialect '${analysis.language}' is opaque`] : analysis.errors,
  };
  try { return { value: evaluateNode(normalizeExpression(expression).source as PortableExpressionNode, environment), analysis, errors: [] }; }
  catch (error) { return { analysis, errors: [error instanceof Error ? error.message : String(error)] }; }
}

export function portableExpression(source: PortableExpressionNode, resultType?: ExpressionValueType): ExpressionDecl {
  return { language: 'oa-expr-v1', source, resultType, analyzability: 'portable' };
}

function normalizeExpression(expression: Expression): ExpressionDecl {
  return typeof expression === 'string'
    ? { language: 'native', source: expression, resultType: 'unknown', analyzability: 'opaque' }
    : expression;
}

function analyzeNode(node: PortableExpressionNode, path: string, variables: Set<string>, errors: string[]): ExpressionValueType {
  if (!node || typeof node !== 'object') { errors.push(`${path || '/'}: expression node must be an object`); return 'unknown'; }
  switch (node.kind) {
    case 'literal': return valueType(node.value);
    case 'ref':
      if (!/^[A-Za-z][A-Za-z0-9_.-]*$/.test(node.path)) errors.push(`${path}/path: invalid reference '${node.path}'`);
      variables.add(node.path); return 'unknown';
    case 'field': analyzeNode(node.object, `${path}/object`, variables, errors); return 'unknown';
    case 'not': {
      const type = analyzeNode(node.value, `${path}/value`, variables, errors);
      if (type !== 'boolean' && type !== 'unknown') errors.push(`${path}/value: not requires boolean, got ${type}`);
      return 'boolean';
    }
    case 'all': case 'any':
      if (!Array.isArray(node.values) || !node.values.length) errors.push(`${path}/values: ${node.kind} requires at least one value`);
      for (const [index, child] of (node.values ?? []).entries()) {
        const type = analyzeNode(child, `${path}/values/${index}`, variables, errors);
        if (type !== 'boolean' && type !== 'unknown') errors.push(`${path}/values/${index}: ${node.kind} requires boolean, got ${type}`);
      }
      return 'boolean';
    case 'compare': {
      const left = analyzeNode(node.left, `${path}/left`, variables, errors);
      const right = analyzeNode(node.right, `${path}/right`, variables, errors);
      if (!['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'in'].includes(node.operator)) errors.push(`${path}/operator: unsupported comparison`);
      if (['lt', 'lte', 'gt', 'gte'].includes(node.operator) && left !== 'unknown' && right !== 'unknown' && left !== right)
        errors.push(`${path}: ordered comparison types differ (${left}, ${right})`);
      if (node.operator === 'in' && !['array', 'object', 'string', 'unknown'].includes(right)) errors.push(`${path}/right: in requires collection`);
      return 'boolean';
    }
    default: errors.push(`${path || '/'}: unknown expression kind '${String((node as { kind?: unknown }).kind)}'`); return 'unknown';
  }
}

function evaluateNode(node: PortableExpressionNode, environment: Record<string, ExpressionValue>): ExpressionValue {
  switch (node.kind) {
    case 'literal': return structuredClone(node.value);
    case 'ref': {
      const root = node.path.split('.')[0];
      if (!(root in environment)) throw new Error(`unbound expression variable '${root}'`);
      return node.path.split('.').slice(1).reduce<ExpressionValue>((value, key) => {
        if (!value || typeof value !== 'object' || Array.isArray(value) || !(key in value)) throw new Error(`missing expression field '${node.path}'`);
        return value[key];
      }, environment[root]);
    }
    case 'field': {
      const object = evaluateNode(node.object, environment);
      if (!object || typeof object !== 'object' || Array.isArray(object) || !(node.key in object)) throw new Error(`missing expression field '${node.key}'`);
      return object[node.key];
    }
    case 'not': return !asBoolean(evaluateNode(node.value, environment));
    case 'all': return node.values.every((value) => asBoolean(evaluateNode(value, environment)));
    case 'any': return node.values.some((value) => asBoolean(evaluateNode(value, environment)));
    case 'compare': {
      const left = evaluateNode(node.left, environment); const right = evaluateNode(node.right, environment);
      switch (node.operator) {
        case 'eq': return deepEqual(left, right); case 'neq': return !deepEqual(left, right);
        case 'lt': return ordered(left, right, (a, b) => a < b); case 'lte': return ordered(left, right, (a, b) => a <= b);
        case 'gt': return ordered(left, right, (a, b) => a > b); case 'gte': return ordered(left, right, (a, b) => a >= b);
        case 'in': return contains(right, left);
      }
    }
  }
}

function valueType(value: ExpressionValue): ExpressionValueType {
  return value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value as ExpressionValueType;
}
function asBoolean(value: ExpressionValue): boolean { if (typeof value !== 'boolean') throw new Error(`expected boolean, got ${valueType(value)}`); return value; }
function deepEqual(left: ExpressionValue, right: ExpressionValue): boolean { return JSON.stringify(left) === JSON.stringify(right); }
function ordered(left: ExpressionValue, right: ExpressionValue, compare: (a: number | string, b: number | string) => boolean): boolean {
  if ((typeof left !== 'number' && typeof left !== 'string') || typeof right !== typeof left) throw new Error('ordered comparison requires equal number or string types');
  return compare(left, right as number & string);
}
function contains(collection: ExpressionValue, needle: ExpressionValue): boolean {
  if (Array.isArray(collection)) return collection.some((item) => deepEqual(item, needle));
  if (typeof collection === 'string' && typeof needle === 'string') return collection.includes(needle);
  if (collection && typeof collection === 'object' && typeof needle === 'string') return needle in collection;
  throw new Error('in requires array, object, or string collection');
}
