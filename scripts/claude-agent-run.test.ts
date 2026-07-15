import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readDeclaredSchema, validateDeclaredResult } from './claude-agent-run';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'oa-declared-result-'));
  dirs.push(dir);
  return dir;
}

describe('declared typed-result handoff', () => {
  const schema = { type: 'object', required: ['decision', 'evidence'] };

  test('reads an object schema and accepts an object with every required field', () => {
    const dir = scratch();
    const schemaPath = join(dir, 'schema.json');
    const resultPath = join(dir, 'result.json');
    writeFileSync(schemaPath, JSON.stringify(schema));
    writeFileSync(resultPath, JSON.stringify({ decision: 'pass', evidence: [] }));
    expect(readDeclaredSchema(schemaPath)).toEqual(schema);
    expect(() => validateDeclaredResult(resultPath, schema)).not.toThrow();
  });

  test('fails closed on a missing, malformed, non-object, or incomplete result', () => {
    const dir = scratch();
    const resultPath = join(dir, 'result.json');
    expect(() => validateDeclaredResult(resultPath, schema)).toThrow('missing or invalid JSON');
    writeFileSync(resultPath, 'not json');
    expect(() => validateDeclaredResult(resultPath, schema)).toThrow('missing or invalid JSON');
    writeFileSync(resultPath, '[]');
    expect(() => validateDeclaredResult(resultPath, schema)).toThrow('must be a JSON object');
    writeFileSync(resultPath, JSON.stringify({ decision: 'pass' }));
    expect(() => validateDeclaredResult(resultPath, schema)).toThrow('missing required fields: evidence');
  });
});
